import io
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

    # --- VISUAL IMPROVEMENTS ---
    DOT_SIZE: int = 10  # Adjust depending on map view
    # Single dot = faint. Stacked dots = solid.
    DOT_ALPHA: float = 0.5

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

    # --- IMAGE QUALITY SETTINGS ---
    # Width 20 inches * 300 DPI = 6000 pixels wide (High Quality)
    IMG_WIDTH_INCHES: float = 20
    DPI: int = 300

    # WebP Settings (High Quality)
    WEBP_QUALITY: int = 90
    # PNG Settings - 0.5 means the PNG will be 50% of the size of the WebP
    PNG_SCALE_FACTOR: float = 0.5

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

        # Read GeoJSON
        geo_path = self.cfg.DATA_DIR / self.cfg.DISTRICTS_FILE
        if not geo_path.exists():
            raise FileNotFoundError(f"GeoJSON not found at {geo_path}")
        self.districts = gpd.read_file(geo_path).to_crs(epsg=3857)

        # Read Availability Data
        avail_path = self.cfg.DATA_DIR / self.cfg.AVAILABILITY_FILE
        with open(avail_path, "r") as f:
            raw_data = json.load(f)
            # Convert list to dict for O(1) lookups
            self.availability = {item["pin"]: item["partners"] for item in raw_data}

        # Load existing Locations Data
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
            "formats": ["webp", "png"],
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
        logger.info(f"✅ Found file: {path} ({file_size} bytes)")
        return True

    def _save_images(self, service):
        """
        Saves the current Plot to memory, then:
        1. Saves High-Res WebP (Atomic write)
        2. Saves Low-Res PNG (Atomic write, Optimized)
        """
        # Create Paths
        webp_path = self.cfg.MAPS_DIR / f"{service}.webp"
        png_path = self.cfg.MAPS_DIR / f"{service}.png"

        try:
            logger.info(f"Rendering Temp image for service '{service}'")
            # Render to RAM (BytesIO) instead of Disk
            buf = io.BytesIO()
            plt.savefig(
                buf, format="png", transparent=True, pad_inches=0, dpi=self.cfg.DPI
            )
            plt.close()
            buf.seek(0)

            # Load into PIL
            with Image.open(buf) as img:
                logger.info(f"Rendering Webp image")
                # Ensure RGBA mode for transparency consistency
                img = img.convert("RGBA")

                # --- SAVE HIGH-RES WEBP ---
                # Write to a temp file first (Atomic Write)
                tmp_webp = webp_path.with_suffix(".webp.tmp")
                img.save(
                    tmp_webp,
                    format="WEBP",
                    quality=self.cfg.WEBP_QUALITY,
                    method=6,  # Best compression (slower, but worth it for maps)
                    lossless=False,
                    exact=True,  # Critical: Preserves transparent pixel values
                )

                # Atomic rename: This is instant and safe
                tmp_webp.replace(webp_path)
                webp_size = webp_path.stat().st_size / (1024 * 1024)

                # --- SAVE LOW-RES PNG ---
                # Calculate dimensions
                logger.info(f"Rendering Png image")
                w = max(1, int(img.width * self.cfg.PNG_SCALE_FACTOR))
                h = max(1, int(img.height * self.cfg.PNG_SCALE_FACTOR))

                # resize the image
                img_small = img.resize((w, h), resample=Image.Resampling.LANCZOS)
                final_png = img_small.quantize(colors=128, method=2, dither=1)

                # Atomic write for PNG
                tmp_png = png_path.with_suffix(".png.tmp")
                # optimize=True is very effective for PNGs with reduced colors
                final_png.save(tmp_png, format="PNG", optimize=True)
                tmp_png.replace(png_path)
                png_size = png_path.stat().st_size / (1024 * 1024)
                logger.info(
                    f"Generated {service}: WebP ({webp_size:.2f}MB) | PNG ({png_size:.2f}MB)"
                )

        except Exception as e:
            logger.error(f"❌ Failed to save {service}: {e}")
            # Cleanup temp files if they got stuck
            for p in [
                webp_path.with_suffix(".webp.tmp"),
                png_path.with_suffix(".png.tmp"),
            ]:
                if p.exists():
                    p.unlink()
        finally:
            # Validate final files
            self._validate_image(webp_path)
            self._validate_image(png_path)

    def render_service(self, service: str) -> None:
        """Generates and saves map in PNG and WEBP for a single service."""
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

        # Increase resolution based on Config
        fig_width = self.cfg.IMG_WIDTH_INCHES
        fig_height = fig_width * aspect_ratio

        # Create High-DPI figure
        fig = plt.figure(figsize=(fig_width, fig_height), dpi=self.cfg.DPI)

        # 3. Create Axes that fills the figure 100% (No margins)
        ax = plt.Axes(fig, [0.0, 0.0, 1.0, 1.0])
        ax.set_axis_off()
        fig.add_axes(ax)

        # Lock Coordinates
        ax.set_xlim(minx, maxx)
        ax.set_ylim(miny, maxy)

        # Draw Boundaries
        lines = self.data.districts.boundary

        # Merge overlapping lines into a single MultiLineString
        # This removes "Alpha Stacking" so all lines are uniform opacity
        merged_borders = lines.union_all()

        # Wrap it in a GeoSeries to plot it easily
        border_layer = gpd.GeoSeries([merged_borders])

        # Layer 1: The "Halo" (White, Thicker)
        border_layer.plot(
            ax=ax,
            color="#FFFFFF",  # For lines, 'color' controls the stroke
            linewidth=self.cfg.BOUNDARY_WIDTH * 3.0,
            alpha=0.5,
            zorder=1,  # Draw at bottom
        )

        # Layer 2: The "Core" (Dark Grey, Thinner)
        border_layer.plot(
            ax=ax,
            color="#333333",
            linewidth=self.cfg.BOUNDARY_WIDTH,
            alpha=0.7,
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
                edgecolors="none",  # No edges makes blending smoother
                linewidths=0,
                antialiased=True,
                zorder=3,  # Draw dots on top of borders
            )

        try:
            self._save_images(service)
        except Exception as e:
            logger.error(f"❌ Matplotlib failed to render {service}: {e}")
        finally:
            plt.close(fig)


def main():
    #  Setup Directories
    config.MAPS_DIR.mkdir(parents=True, exist_ok=True)

    # Load Dataio 
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
