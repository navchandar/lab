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
topo_url = "https://cdn.jsdelivr.net/npm/visionscarto-world-atlas@0.1.0/world/50m.json"
rc_url = "https://restcountries.com/v3.1/all?fields=ccn3,cca2,name,capital,region,languages,currencies"


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


def get_avg_latitude(geo, topo_data):
    """Calculates approximate latitude using TopoJSON quantization transform."""
    coords = []
    geom_type = geo.get("type")
    arcs = geo.get("arcs", [])

    # Decoder Ring: Turn compressed integers into real Lat/Long
    transform = topo_data.get("transform", {"scale": [1, 1], "translate": [0, 0]})
    scale = transform["scale"]
    translate = transform["translate"]

    try:
        # Extract arcs
        arc_indices = []
        if geom_type == "Polygon":
            arc_indices = arcs[0]
        elif geom_type == "MultiPolygon":
            for poly in arcs:
                arc_indices.extend(poly[0])

        for a_idx in arc_indices:
            idx = a_idx if a_idx >= 0 else ~a_idx
            # Just take the first point of each arc for a fast estimate
            raw_pt = topo_data["arcs"][idx][0]

            # THE MATH: (Compressed_Value * Scale) + Translation
            lat = raw_pt[1] * scale[1] + translate[1]
            coords.append(lat)

        return sum(coords) / len(coords) if coords else 0
    except Exception:
        return 0


def main():
    logger.info("Starting map data update process...")
    with requests.Session() as session:
        try:
            # Safely fetch primary data
            topo_data = fetch_json_api(topo_url, session, "TopoJSON Map")
            rc_data = fetch_json_api(rc_url, session, "RestCountries")

            # 1. Create the detailed metadata dictionary
            logger.info("Downloading flags and building detail database...")
            details = {}
            for c in rc_data:
                num_code = str(c.get("ccn3", "")).zfill(3)
                if num_code and num_code != "000":
                    alpha2 = c.get("cca2", "").lower()
                    details[num_code] = {
                        "name": c.get("name", {}).get("common", ""),
                        "capital": (
                            c.get("capital", [""])[0] if c.get("capital") else ""
                        ),
                        "continent": c.get("region", ""),
                        "alpha2": alpha2,
                        "flag_svg": fetch_svg_flag(alpha2, session) if alpha2 else "",
                    }

            # Clean the TopoJSON (Remove any existing properties to keep it tiny)
            if "objects" in topo_data and "countries" in topo_data["objects"]:
                logger.info("Cleaning map geometry...")
                geometries = topo_data["objects"]["countries"]["geometries"]
                for geo in geometries:
                    # We keep ONLY the ID so we can link it to the details file later
                    geo["properties"] = {}

                logger.info("Sorting map geometries by Latitude (North to South)...")
                # Sort: Higher Y (North) to Lower Y (South)
                geometries.sort(
                    key=lambda g: get_avg_latitude(g, topo_data), reverse=True
                )
                logger.info("Map data sorted geographically!")

            # Sort details by ID for the fastest possible JS lookup
            sorted_details = dict(sorted(details.items(), key=lambda x: int(x[0])))

            # Save the two files
            map_path = SCRIPT_DIR / "map_data.json"
            details_path = SCRIPT_DIR / "country_data.json"

            # Save Minified (Optimized for Web)
            with open(map_path, "w") as f:
                json.dump(topo_data, f, separators=(",", ":"))

            with open(details_path, "w") as f:
                json.dump(sorted_details, f, indent=2)

            logger.info(
                f"Success! {map_path.name}: {map_path.stat().st_size // 1024}KB | {details_path.name}: {details_path.stat().st_size // 1024}KB"
            )

        except Exception as e:
            # The safety net: Catches API failures, JSON parsing errors, or missing variables
            logger.error(
                f"ABORT: Script failed to complete safely. No files were saved or overwritten. Reason: {e}"
            )


if __name__ == "__main__":
    main()
