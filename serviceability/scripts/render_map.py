import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple, Any

import geopandas as gpd
import matplotlib.pyplot as plt

# Setup Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
logger = logging.getLogger(__name__)

# --- CONFIGURATION ---
@dataclass
class MapConfig:
    # Input/Output Paths
    DATA_DIR: Path = Path("data")
    MAPS_DIR: Path = Path("maps")
    
    # File Names
    DISTRICTS_FILE: str = "india_districts.geojson"
    AVAILABILITY_FILE: str = "availability.json"
    LOCATIONS_FILE: str = "pincodes_latlng.json"
    BOUNDS_FILE: str = "bounds.json"
    
    # Visual Styles
    DOT_COLOR: str = "#2ecc71"  # Green
    DOT_SIZE: int = 20
    DOT_ALPHA: float = 0.7
    BOUNDARY_COLOR: str = "#333333"
    BOUNDARY_WIDTH: float = 0.5
    BOUNDARY_ALPHA: float = 0.5
    
    # Image Settings
    IMG_SIZE: Tuple[int, int] = (10, 10)
    DPI: int = 150

    # Services to Render
    SERVICES: Tuple[str, ...] = (
        "amazon", "flipkart", "bigbasket", "blinkit", 
        "zomato", "swiggy", "instamart", "jiomart", 
        "meesho", "zepto"
    )

config = MapConfig()


class DataManager:
    """Handles loading and preparing data."""
    
    def __init__(self, cfg: MapConfig):
        self.cfg = cfg
        self.districts = None
        self.availability = {}
        self.locations = []

    def load_all(self):
        """Loads all required datasets."""
        logger.info("Loading datasets...")
        
        # 1. GeoJSON
        geo_path = self.cfg.DATA_DIR / self.cfg.DISTRICTS_FILE
        if not geo_path.exists():
            raise FileNotFoundError(f"GeoJSON not found at {geo_path}")
        self.districts = gpd.read_file(geo_path)

        # 2. Availability Data
        avail_path = self.cfg.DATA_DIR / self.cfg.AVAILABILITY_FILE
        with open(avail_path, "r") as f:
            raw_data = json.load(f)
            # Convert list to dict for O(1) lookups
            self.availability = {item["pin"]: item["partners"] for item in raw_data}

        # 3. Locations Data
        loc_path = self.cfg.DATA_DIR / self.cfg.LOCATIONS_FILE
        with open(loc_path, "r") as f:
            self.locations = json.load(f)
            
        logger.info(f"Loaded {len(self.locations)} pincode locations.")


class MapRenderer:
    """Handles logic for drawing and saving maps."""

    def __init__(self, cfg: MapConfig, data: DataManager):
        self.cfg = cfg
        self.data = data
        self.total_bounds = self.data.districts.total_bounds # [minx, miny, maxx, maxy]

    def save_bounds_json(self):
        """Exports bounds so Leaflet knows where to place the image."""
        # GeoPandas Bounds: [min_x (long), min_y (lat), max_x, max_y]
        # Leaflet Bounds:   [[lat, long], [lat, long]]
        bounds_export = {
            "southWest": [self.total_bounds[1], self.total_bounds[0]],
            "northEast": [self.total_bounds[3], self.total_bounds[2]],
        }
        
        out_path = self.cfg.MAPS_DIR / self.cfg.BOUNDS_FILE
        with open(out_path, "w") as f:
            json.dump(bounds_export, f)
        logger.info(f"Saved bounds configuration to {out_path}")

    def _get_active_coordinates(self, service: str) -> Tuple[List[float], List[float]]:
        """Filters lat/lng points for a specific service."""
        lats, lngs = [], []
        
        for loc in self.data.locations:
            pin = loc["pin"]
            partners = self.data.availability.get(pin, {})
            
            # Check if service exists and is active (1)
            if partners.get(service) == 1:
                lats.append(loc["lat"])
                lngs.append(loc["lng"])
                
        return lats, lngs

    def render_service(self, service: str):
        """Generates and saves the PNG for a single service."""
        lats, lngs = self._get_active_coordinates(service)
        
        # Setup Plot
        fig, ax = plt.subplots(figsize=self.cfg.IMG_SIZE)
        
        # 1. Lock Coordinates (Crucial for alignment)
        ax.set_xlim(self.total_bounds[0], self.total_bounds[2])
        ax.set_ylim(self.total_bounds[1], self.total_bounds[3])

        # 2. Draw District Outline (The "Skeleton")
        self.data.districts.plot(
            ax=ax, 
            color="none", 
            edgecolor=self.cfg.BOUNDARY_COLOR, 
            linewidth=self.cfg.BOUNDARY_WIDTH, 
            alpha=self.cfg.BOUNDARY_ALPHA
        )

        # 3. Draw Serviceable Dots
        if lngs:
            ax.scatter(
                lngs, lats, 
                c=self.cfg.DOT_COLOR, 
                s=self.cfg.DOT_SIZE, 
                alpha=self.cfg.DOT_ALPHA, 
                edgecolors="none"
            )

        # 4. Clean styling (Remove axes, whitespace)
        ax.set_axis_off()
        plt.subplots_adjust(top=1, bottom=0, right=1, left=0, hspace=0, wspace=0)

        # 5. Save
        out_path = self.cfg.MAPS_DIR / f"{service}.png"
        plt.savefig(out_path, transparent=True, dpi=self.cfg.DPI, pad_inches=0)
        plt.close(fig) # Free up memory
        
        logger.info(f"Generated map for: {service} ({len(lats)} pincodes)")


def main():
    # 1. Setup Directories
    config.MAPS_DIR.mkdir(parents=True, exist_ok=True)

    # 2. Load Data
    data_mgr = DataManager(config)
    try:
        data_mgr.load_all()
    except Exception as e:
        logger.error(f"Failed to load data: {e}")
        return

    # 3. Initialize Renderer
    renderer = MapRenderer(config, data_mgr)

    # 4. Save Metadata
    renderer.save_bounds_json()

    # 5. Render Loop
    for service in config.SERVICES:
        renderer.render_service(service)

    logger.info("All maps generated successfully.")


if __name__ == "__main__":
    main()