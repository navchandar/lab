import json
import logging
from pathlib import Path

import requests

# --- Configure Logging ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

SCRIPT_DIR = (
    Path(__file__).resolve().parent
    if "__file__" in globals()
    else Path(Path.cwd()).resolve()
)


def fetch_json_api(url: str, session: requests.Session, name: str) -> dict:
    """Fetches JSON from an API and strictly raises an exception if it fails."""
    logger.info(f"Fetching {name} data...")
    try:
        response = session.get(url, timeout=15)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.error(f"CRITICAL: Failed to download {name} from {url}. Error: {e}")
        # Raising the error ensures the main script aborts and doesn't save empty data
        raise RuntimeError(f"Cannot proceed without {name}") from e


def fetch_svg_flag(alpha2: str, session: requests.Session) -> str:
    """Fetches a single SVG flag. Logs a warning but does not crash the script on failure."""
    svg_url = f"https://flagcdn.com/{alpha2}.svg"
    try:
        response = session.get(svg_url, timeout=10)
        if response.status_code == 200:
            return response.text
        else:
            logger.warning(f"Flag missing for '{alpha2}' (HTTP {response.status_code})")
            return ""
    except requests.exceptions.RequestException as e:
        logger.warning(f"Network error downloading SVG for '{alpha2}': {e}")
        return ""


def main():
    logger.info("Starting map data update process...")
    topo_url = (
        "https://cdn.jsdelivr.net/npm/visionscarto-world-atlas@0.1.0/world/50m.json"
    )
    rc_url = "https://restcountries.com/v3.1/all?fields=ccn3,cca2,name,capital,region,languages"

    with requests.Session() as session:
        try:
            # Safely fetch primary data
            topo_data = fetch_json_api(topo_url, session, "TopoJSON Map")
            rc_data = fetch_json_api(rc_url, session, "RestCountries")

            logger.info("Building the master country dictionary...")
            country_info = {}
            for c in rc_data:
                num_code = c.get("ccn3")
                if num_code:
                    country_info[num_code] = {
                        "alpha2": c.get("cca2", "").lower(),
                        "common_name": c.get("name", {}).get("common", ""),
                        "capital": (
                            c.get("capital", [""])[0] if c.get("capital") else ""
                        ),
                        "continent": c.get("region", ""),
                        "language": (
                            list(c.get("languages", {}).values())[0]
                            if c.get("languages")
                            else ""
                        ),
                    }

            logger.info("Merging facts and downloading SVGs into the map...")
            geometries = (
                topo_data.setdefault("objects", {})
                .setdefault("countries", {})
                .setdefault("geometries", [])
            )

            merged_count = 0
            svg_download_count = 0

            for geo in geometries:
                props = geo.setdefault("properties", {})
                country_id = str(geo.get("id", "")).zfill(3)

                info = country_info.get(country_id)

                # save all common information
                if info and info["alpha2"]:
                    props["alpha2"] = info["alpha2"]
                    if info.get("common_name"):
                        props["name"] = info["common_name"]
                    props["capital"] = info["capital"]
                    props["continent"] = info["continent"]
                    props["language"] = info["language"]
                    merged_count += 1

                    # Fetch the individual flag safely
                    flag_svg = fetch_svg_flag(info["alpha2"], session)
                    props["flag_svg"] = flag_svg
                    if flag_svg:
                        svg_download_count += 1

            # Save Data in json file without spaces
            output_path = SCRIPT_DIR / "map_data.json"
            logger.info("Writing optimized data to disk...")
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(topo_data, f, separators=(",", ":"))
            logger.info(
                f"Successfully mapped {merged_count}/{len(geometries)} regions."
            )
            logger.info(f"Done! Saved file to {output_path}")

        except Exception as e:
            # The safety net: Catches API failures, JSON parsing errors, or missing variables
            logger.error(
                f"ABORT: Script failed to complete safely. No files were saved or overwritten. Reason: {e}"
            )


if __name__ == "__main__":
    main()
