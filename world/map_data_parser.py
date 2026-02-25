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
    topo_url = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json"
    iso_url = "https://raw.githubusercontent.com/lukes/ISO-3166-Countries-with-Regional-Codes/master/all/all.json"

    # Using a Session is more efficient for multiple network requests
    with requests.Session() as session:
        topo_data = session.get(topo_url).json()
        iso_data = session.get(iso_url).json()

    print("Mapping ISO numeric to alpha-2...")
    # Dictionary comprehension is faster and uses less memory
    id_to_alpha2 = {
        str(c.get("country-code", "")).zfill(3): c.get("alpha-2", "").lower()
        for c in iso_data
        if c.get("alpha-2")
    }

    # Clean fallback mapping
    fallbacks = {"France": "fr", "Norway": "no"}

    print("Merging alpha-2 codes into map geometries...")
    # .setdefault ensures the nested keys exist without throwing errors
    geometries = (
        topo_data.setdefault("objects", {})
        .setdefault("countries", {})
        .setdefault("geometries", [])
    )

    merged_count = 0
    for geo in geometries:
        props = geo.setdefault("properties", {})
        country_id = str(geo.get("id", "")).zfill(3)

        # Get the alpha2 code from the API, or fall back to our manual list
        alpha2 = id_to_alpha2.get(country_id) or fallbacks.get(props.get("name"))

        # SPACE SAVER: We ONLY store the 2-letter code, not the full URL string!
        if alpha2:
            props["alpha2"] = alpha2
            merged_count += 1

    output_path = SCRIPT_DIR / "map_data.json"
    with open(output_path, "w", encoding="utf-8") as f:
        # Save as minified JSON to keep file size small for faster frontend loading
        json.dump(topo_data, f, separators=(",", ":"), indent=1)

    print(f"Successfully mapped {merged_count}/{len(geometries)} regions.")
    print(f"Done! Saved to {output_path}")


if __name__ == "__main__":
    fetch_and_merge()
