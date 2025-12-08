import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Tuple

import matplotlib
from PIL import Image
from pyproj import Transformer

# Force non-interactive backend (Must be done before importing pyplot)
matplotlib.use("Agg")
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
    DOT_SIZE: int = 5  # Adjust depending on map view
    DOT_ALPHA: float = 0.7
    BOUNDARY_WIDTH: float = 0.3

    # Brand Identity Colors (Hex Codes)
    DEFAULT_COLOR: str = "#2ecc71"  # Fallback Green
    BRAND_COLORS: Dict[str, str] = field(
        default_factory=lambda: {
            "amazon": "#FF9900",  # Amazon Orange
            "flipkart": "#2874F0",  # Flipkart Blue
            "bigbasket": "#84C225",  # Bigbasket Green
            "blinkit": "#F8CB46",  # Blinkit Yellow
            "zomato": "#E23744",  # Zomato Red
            "swiggy": "#FC8019",  # Swiggy Orange
            "instamart": "#FC8019",  # Swiggy Orange
            "jiomart": "#0093D0",  # Jio Blue
            "meesho": "#F43397",  # Meesho Pink
            "zepto": "#6035D0",  # Zepto Violet
        }
    )

    # Image Settings
    IMG_SIZE: Tuple[int, int] = (10, 10)
    DPI: int = 300

    # Services to Render
    SERVICES: Tuple[str, ...] = (
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
    )


config = MapConfig()


class DataManager:
    """Handles loading and preparing data."""

    def __init__(self, cfg: MapConfig) -> None:
        self.cfg = cfg
        self.districts = None
        self.availability = {}
        self.locations = []

    def load_all(self) -> None:
        """Loads all required datasets."""
        logger.info("Loading datasets...")

        # 1. GeoJSON
        geo_path = self.cfg.DATA_DIR / self.cfg.DISTRICTS_FILE
        if not geo_path.exists():
            raise FileNotFoundError(f"GeoJSON not found at {geo_path}")
        self.districts = gpd.read_file(geo_path).to_crs(epsg=3857)

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

    def __init__(self, cfg: MapConfig, data: DataManager) -> None:
        self.cfg = cfg
        self.data = data
        self.total_bounds = self.data.districts.total_bounds  # [minx, miny, maxx, maxy]

    def save_bounds_json(self) -> None:
        """Exports bounds, colors and timestamp so Leaflet knows placement and branding."""

        # CAPTURE CURRENT UTC TIME
        current_time = datetime.now(timezone.utc).isoformat()
        # Get the bounds in Meters (EPSG:3857) from the dataframe
        min_x, min_y, max_x, max_y = self.total_bounds
        to_latlng = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)
        # Transform (x, y) -> (lon, lat)
        sw_lon, sw_lat = to_latlng.transform(min_x, min_y)
        ne_lon, ne_lat = to_latlng.transform(max_x, max_y)
        data = {
            # Leaflet wants [Lat, Lng]
            "southWest": [sw_lat, sw_lon],
            "northEast": [ne_lat, ne_lon],
            "colors": self.cfg.BRAND_COLORS,
            "lastUpdated": current_time,
        }

        out_path = self.cfg.MAPS_DIR / self.cfg.BOUNDS_FILE
        with open(out_path, "w") as f:
            json.dump(data, f, indent=2)
        logger.info(f"Saved bounds to {out_path} at {current_time}")

    def _get_active_coordinates(self, service: str) -> Tuple[List[float], List[float]]:
        """Filters lat/lng points for a specific service."""
        lats, lngs = [], []
        # input: Lat/Lng, output: Web Mercator X/Y
        to_mercator = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
        for loc in self.data.locations:
            pin = loc["pin"]
            partners = self.data.availability.get(pin, {})
            if partners.get(service) == 1:
                lat = loc["lat"]
                lng = loc["lng"]
                # --- Project the points ---
                x, y = to_mercator.transform(lng, lat)
                lats.append(y)  # Append projected X
                lngs.append(x)  # Append projected Y

        # Return projected X (Longitude-ish) and Y (Latitude-ish)
        return lats, lngs

    def _validate_image(self, path: Path) -> bool:
        """Checks if file exists and has content."""
        if not path.exists():
            logger.error(f"❌ FAILED: File was not created at {path}")
            return False

        file_size = path.stat().st_size
        if file_size == 0:
            logger.error(f"❌ FAILED: File is empty (0 bytes) at {path}")
            return False
        logger.info(f"Found file: {path} ({file_size} bytes)")
        return True

    def _compress_image(self, service, output_path):
        try:
            img = Image.open(output_path)
            # Quantize: Convert to a palette of max 64 colors
            img = img.quantize(colors=128, method=2, dither=1)
            # Save it back, overwriting the large file
            img.save(output_path, optimize=True)
            logger.info(f"✅ Compressed image: {output_path}")
        except Exception as e:
            logger.error(f"❌ Failed to save/optimize {service}: {e}")
            return

    def render_service(self, service: str) -> None:
        """Generates and saves the PNG for a single service."""
        output_path = self.cfg.MAPS_DIR / f"{service}.png"
        lats, lngs = self._get_active_coordinates(service)
        logger.info(f"Rendering map for {service} with {len(lats)} points...")
        # Look up the brand color, fallback to green if missing
        brand_color = self.cfg.BRAND_COLORS.get(service, self.cfg.DEFAULT_COLOR)

        # --- MAP ALIGNMENT FIX ---
        # 1. Calculate Geographic Aspect Ratio
        minx, miny, maxx, maxy = self.total_bounds
        geo_width = maxx - minx
        geo_height = maxy - miny
        aspect_ratio = geo_height / geo_width

        # 2. Set Figure Size based on Ratio (Fixed width 10, variable height)
        # This ensures 1 pixel in image = constant degrees in lat/lng
        fig_width = 10
        fig_height = fig_width * aspect_ratio
        fig = plt.figure(figsize=(fig_width, fig_height), dpi=self.cfg.DPI)

        # 3. Create Axes that fills the figure 100% (No margins)
        ax = plt.Axes(fig, [0.0, 0.0, 1.0, 1.0])
        ax.set_axis_off()
        fig.add_axes(ax)

        # Lock Coordinates
        ax.set_xlim(minx, maxx)
        ax.set_ylim(miny, maxy)

        # --- OPTIMIZED BORDER RENDERING ---
        # Step A: Convert Polygons to Lines (Boundaries)
        lines = self.data.districts.boundary

        # Step B: Merge overlapping lines into a single MultiLineString
        # This removes "Alpha Stacking" so all lines are uniform opacity
        merged_borders = lines.union_all()

        # We wrap it in a GeoSeries to plot it easily
        border_layer = gpd.GeoSeries([merged_borders])

        # Layer 1: The "Halo" (White, Thicker)
        border_layer.plot(
            ax=ax,
            color="#FFFFFF",  # For lines, 'color' controls the stroke
            linewidth=self.cfg.BOUNDARY_WIDTH * 2.0,
            alpha=0.4,
            zorder=1,  # Draw at bottom
        )

        # Layer 2: The "Core" (Dark Grey, Thinner)
        border_layer.plot(
            ax=ax,
            color="#333333",
            linewidth=self.cfg.BOUNDARY_WIDTH,
            alpha=0.6,
            zorder=2,  # Draw on top
        )

        # Draw Serviceable Dots with BRAND COLOR
        if lats and lngs:
            ax.scatter(
                lngs,
                lats,
                c=brand_color,
                s=self.cfg.DOT_SIZE,
                alpha=self.cfg.DOT_ALPHA,
                edgecolors="none",
                zorder=3,  # Draw dots on top of borders
            )
        try:
            plt.savefig(output_path, transparent=True, pad_inches=0)
        except Exception as e:
            logger.error(f"❌ Matplotlib failed to save {service}: {e}")
        finally:
            plt.close(fig)

        # Validate the generated file
        if self._validate_image(output_path):
            logger.info(f"✅ Generated valid map for: {service}")
            self._compress_image(service, output_path)
           

def main():
    #  Setup Directories
    config.MAPS_DIR.mkdir(parents=True, exist_ok=True)

    # Load Data
    data_mgr = DataManager(config)
    try:
        data_mgr.load_all()
    except Exception as e:
        logger.error(f"Failed to load data: {e}")
        return

    # Initialize Renderer
    renderer = MapRenderer(config, data_mgr)

    # Save Metadata
    renderer.save_bounds_json()

    # Render Loop
    for service in config.SERVICES:
        renderer.render_service(service)

    logger.info("All maps generated successfully.")


if __name__ == "__main__":
    main()
