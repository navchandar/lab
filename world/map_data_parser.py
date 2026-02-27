import json
import os
from pathlib import Path

import requests

SCRIPT_DIR = (
    Path(__file__).resolve().parent
    if "__file__" in globals()
    else Path(Path.cwd()).resolve()
)


def fetch_and_merge():
    print("Fetching TopoJSON and ISO mapping data...")
    topo_url = "https://cdn.jsdelivr.net/npm/visionscarto-world-atlas@0.1.0/world/50m.json"
    iso_url = "https://raw.githubusercontent.com/lukes/ISO-3166-Countries-with-Regional-Codes/master/all/all.json"

    # Using a Session is more efficient for multiple network requests
    with requests.Session() as session:
        topo_data = session.get(topo_url).json()
        iso_data = session.get(iso_url).json()

        print("Mapping ISO numeric to alpha-2...")
        id_to_alpha2 = {
            str(c.get("country-code", "")).zfill(3): c.get("alpha-2", "").lower()
            for c in iso_data
            if c.get("alpha-2")
        }

        # Clean fallback mapping
        fallbacks = {"France": "fr", "Norway": "no"}

        print("Merging alpha-2 codes AND downloading SVGs into geometries...")
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

            # Get the alpha2 code from the API, or fall back to our manual list
            alpha2 = id_to_alpha2.get(country_id) or fallbacks.get(props.get("name"))

            if alpha2:
                props["alpha2"] = alpha2
                merged_count += 1

                # Fetch the raw SVG text for this specific flag
                svg_url = f"https://flagcdn.com/{alpha2}.svg"
                try:
                    svg_response = session.get(svg_url)
                    if svg_response.status_code == 200:
                        # Save the raw SVG string directly into the JSON
                        props["flag_svg"] = svg_response.text
                        svg_download_count += 1
                    else:
                        props["flag_svg"] = ""
                except Exception as e:
                    print(f"Failed to download SVG for {alpha2}: {e}")
                    props["flag_svg"] = ""

    output_path = SCRIPT_DIR / "map_data.json"
    with open(output_path, "w", encoding="utf-8") as f:
        # Save as minified JSON to save as much space as possible since SVGs are bulky
        json.dump(topo_data, f, separators=(",", ":"))

    print(f"Successfully mapped {merged_count}/{len(geometries)} regions.")
    print(
        f"Successfully embedded {svg_download_count} SVG flags directly into the JSON."
    )
    print(f"Done! Saved to {output_path}")


if __name__ == "__main__":
    fetch_and_merge()
