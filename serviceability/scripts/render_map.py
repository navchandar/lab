import json
import os

import geopandas as gpd
import matplotlib.pyplot as plt

# 1. CONFIGURATION
SERVICES = [
    "amazon",
    "flipkart",
    "bigbasket",
    "blinkit",
    "zomato",
    "swiggy",
    "instamart",
    "jiomart",
    "meesho",
    "zepto",
]


DATA_DIR = "data"
MAPS_DIR = "maps"


def render_maps():
    # Ensure output directory exists
    os.makedirs(MAPS_DIR, exist_ok=True)

    # 2. LOAD DATA
    print("Loading Data...")

    # Load District Boundaries (GeoJSON)
    districts_gdf = gpd.read_file(os.path.join(DATA_DIR, "india_districts.geojson"))

    # Load Availability Data
    with open(os.path.join(DATA_DIR, "availability.json"), "r") as f:
        availability_data = json.load(f)
        # Convert to a dictionary for faster lookup: {"110001": {partners...}}
        availability_map = {item["pin"]: item["partners"] for item in availability_data}

    # Load Pincode Locations
    with open(os.path.join(DATA_DIR, "pincodes_latlng.json"), "r") as f:
        pincode_locs = json.load(f)

    # 3. CALCULATE GLOBAL BOUNDS
    # We need fixed bounds so all images align perfectly with Leaflet
    total_bounds = districts_gdf.total_bounds  # [minx, miny, maxx, maxy]

    # Save bounds for Frontend (Leaflet expects [Lat, Lng])
    # total_bounds is [Long, Lat, Long, Lat] (XY)
    bounds_export = {
        "southWest": [total_bounds[1], total_bounds[0]],  # MinY, MinX
        "northEast": [total_bounds[3], total_bounds[2]],  # MaxY, MaxX
    }
    with open(os.path.join(MAPS_DIR, "bounds.json"), "w") as f:
        json.dump(bounds_export, f)

    # 4. RENDER LOOP
    for service in SERVICES:
        print(f"Generating map for: {service}")

        # Setup Plot
        # High DPI for quality, Transparent background
        fig, ax = plt.subplots(figsize=(10, 10))

        # A. Set Strict Limits (Crucial for Overlay Alignment)
        ax.set_xlim(total_bounds[0], total_bounds[2])
        ax.set_ylim(total_bounds[1], total_bounds[3])

        # B. Draw District Boundaries (The "Skeleton")
        districts_gdf.plot(
            ax=ax, color="none", edgecolor="#333333", linewidth=0.5, alpha=0.5
        )

        # C. Filter Serviceable Points
        latitudes = []
        longitudes = []

        for loc in pincode_locs:
            pin = loc["pin"]
            # Check if this pin exists in our status data AND is active for this service
            if pin in availability_map and availability_map[pin].get(service) == 1:
                latitudes.append(loc["lat"])
                longitudes.append(loc["lng"])

        # D. Draw Dots (The Heatmap effect)
        if longitudes:
            # s=15 is size, alpha=0.6 is transparency
            ax.scatter(
                longitudes, latitudes, c="#2ecc71", s=20, alpha=0.7, edgecolors="none"
            )

        # E. Clean up styling (Remove axes, padding)
        ax.set_axis_off()
        plt.subplots_adjust(top=1, bottom=0, right=1, left=0, hspace=0, wspace=0)

        # F. Save
        output_path = os.path.join(MAPS_DIR, f"{service}.png")
        plt.savefig(output_path, transparent=True, dpi=150, pad_inches=0)
        plt.close(fig)

    print("All maps generated successfully.")


if __name__ == "__main__":
    render_maps()
