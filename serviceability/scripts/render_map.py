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
import numpy as np
from matplotlib.patches import PathPatch
from matplotlib.path import Path as MplPath

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
    DOT_SIZE: int = 20  # Adjust depending on map view
    # Single dot = faint. Stacked dots = solid.
    DOT_ALPHA: float = 0.5
    BOUNDARY_WIDTH: float = 0.3

    # Services to Render
    SERVICES: Tuple[str, ...] = (
        "amazon",
        "amazon fresh",
        "flipkart",
        "myntra",
        "bigbasket",
        "zomato",
        "blinkit",
        "swiggy",
        "instamart",
        "jiomart",
        "ajio",
        "dmart ready",
        "meesho",
        "zepto",
        "pharmeasy",
        "apollo 24|7",
        "tata 1mg",
        "firstcry",
        "licious"
    )

    # Brand Identity Colors (Hex Codes)
    DEFAULT_COLOR: str = "#2ecc71"  # Fallback Green
    BRAND_COLORS: Dict[str, str] = field(
        default_factory=lambda: {
            "amazon": "#FF9900",  # Amazon Orange
            "amazon fresh": "#77BC1F",  # Amazon Fresh Lima
            "flipkart": "#2874F0",  # Flipkart Blue
            "myntra": "#F41CB2",  # Myntra Shocking Pink
            "bigbasket": "#84C225",  # Bigbasket Green
            "zomato": "#E23744",  # Zomato Red
            "blinkit": "#F8CB46",  # Blinkit Yellow
            "swiggy": "#FC8019",  # Swiggy Orange
            "instamart": "#FC8019",  # Swiggy Orange
            "jiomart": "#0093D0",  # Jio Blue
            "ajio": "#2f4254",  # Ajio Greenish
            "dmart ready": "#046D39", # DMart Fun Green
            "meesho": "#F43397",  # Meesho Pink
            "zepto": "#6035D0",  # Zepto Violet
            "pharmeasy": "#007F56", # PharmEasy Rain Forest
            "apollo 24|7": "#097895", # Apollo 24/7 Blue Chill
            "tata 1mg": "#FE6F61", # Tata 1mg Bittersweet
            "firstcry": "#FFD91B", # FirstCry Candlelight
            "licious": "#E31D36" # Licious Alizarin Crimson
        }
    )
    SHORTCUTS:  Dict[str, str] = field(
        default_factory=lambda: {
            "amazon": "a",
            "amazon fresh": "h",
            "flipkart": "f",
            "myntra": "y",
            "bigbasket": "b",
            "zomato": "z",
            "blinkit": "k",
            "swiggy": "s",
            "instamart": "i",
            "jiomart": "j",
            "ajio": "o",
            "dmart ready": "d",
            "meesho": "m",
            "zepto": "e",
            "pharmeasy": "p",
            "apollo 24|7": "l",
            "tata 1mg": "t",
            "firstcry": "c",
            "licious": "u"
        }
    )

    # --- IMAGE QUALITY SETTINGS ---
    # Width 14 inches * 300 DPI = 4200 pixels wide (High Quality)
    IMG_WIDTH_INCHES: float = 14
    DPI: int = 300

    # WebP Settings (High Quality)
    WEBP_QUALITY: int = 90
    # PNG Settings - 0.1 means the PNG will be 10% of the size of the WebP
    PNG_SCALE_FACTOR: float = 0.1


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

        # Precompute expensive geometry once

        # Merge overlapping lines into a single MultiLineString
        # This removes "Alpha Stacking" so all lines are uniform opacity
        self._merged_borders = self.data.districts.boundary.union_all()
        self._country_geom = self.data.districts.union_all()

        # Precompute aspect ratio & figure dims once
        # Calculate Geographic Aspect Ratio to match the map
        min_x, min_y, max_x, max_y = self.total_bounds
        geo_width = max_x - min_x
        geo_height = max_y - min_y
        self._aspect_ratio = geo_height / max(geo_width, 1e-9)  # avoid div by zero
        self._fig_width = self.cfg.IMG_WIDTH_INCHES
        self._fig_height = self._fig_width * self._aspect_ratio

    
    def _get_counts(self) -> Dict[str, int]:
        """Helper to calculate point counts for all services."""
        service_counts = {}
        logger.info("Calculating service coverage point count")
        
        for service in self.cfg.SERVICES:
            count = 0
            for loc in self.data.locations:
                pin = loc["pin"]
                partners = self.data.availability.get(pin, {})
                if partners.get(service, 0) >= 1:
                    count += 1
            service_counts[service] = count
            logger.info(f"   -> {service}: {count} points")
        return service_counts


    def save_bounds_json(self) -> None:
        """Exports bounds, colors and timestamp so Leaflet knows placement and branding."""

        counts = self._get_counts()
        
        # Filter Logic
        valid_services = []
        MIN_POINTS = 10

        for service in self.cfg.SERVICES:
            count = counts.get(service, 0)
            if count >= MIN_POINTS:
                valid_services.append(service)
                logger.info(f"Saving {service}: {count} points")
            else:
                logger.warning(f"Skipped {service}: ({count} points)")


        # CAPTURE CURRENT UTC TIME
        current_time = datetime.now(timezone.utc).isoformat()
        # Get the bounds in Meters (EPSG:3857) from the dataframe
        min_x, min_y, max_x, max_y = self.total_bounds
        to_latlng = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)
        # Transform (x, y) -> (lon, lat)
        sw_lon, sw_lat = to_latlng.transform(min_x, min_y)
        ne_lon, ne_lat = to_latlng.transform(max_x, max_y)

        data = {
            "lastUpdated": current_time,
            # Leaflet wants [Lat, Lng]
            "southWest": [sw_lat, sw_lon],
            "northEast": [ne_lat, ne_lon],
            "formats": ["webp", "png"],
            "colors": self.cfg.BRAND_COLORS,
            "shortcuts": self.cfg.SHORTCUTS,
            "counts": counts,
            "services": valid_services,
        }

        out_path = self.cfg.MAPS_DIR / self.cfg.BOUNDS_FILE
        with open(out_path, "w") as f:
            json.dump(data, f, indent=2)
        logger.info(f"Saved bounds to {out_path} at {current_time}")

        return valid_services


    def _get_active_coordinates(self, service: str) -> Tuple[List[float], List[float]]:
        """Filters lat/lng points for a specific service."""
        lats, lngs = [], []
        # input: Lat/Lng, output: Web Mercator X/Y
        to_mercator = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
        for loc in self.data.locations:
            pin = loc["pin"]
            partners = self.data.availability.get(pin, {})

            # TODO: handle diff between quick commerce and standard delivery
            # status == 1 (QC) and status == 2 (STD)
            service_availability = partners.get(service)
            if service_availability and service_availability >= 1:
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

    def _clean_tmp_files(self, webp_path, png_path):
        for img in [
            webp_path.with_suffix(".webp.tmp"),
            png_path.with_suffix(".png.tmp"),
        ]:
            if img.exists():
                img.unlink()

    def _save_images(self, service: str, fig: plt.Figure) -> None:
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
            fig.savefig(
                buf, format="png", transparent=True, pad_inches=0, dpi=self.cfg.DPI
            )
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
                    method=5,  # Best compression method
                    lossless=True,
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
                final_png = img_small.quantize(colors=32, method=2, dither=0)

                # Atomic write for PNG
                tmp_png = png_path.with_suffix(".png.tmp")
                # optimize=True is very effective for PNGs with reduced colors
                final_png.save(tmp_png, format="PNG", optimize=True, compress_level=9)
                tmp_png.replace(png_path)
                png_size = png_path.stat().st_size / (1024 * 1024)
                png_size = f"{png_size:.2f}MB"
                webp_size = f"{webp_size:.2f}MB"
                logger.info(f"{service} Done: WebP ({webp_size}) | PNG ({png_size})")

        except Exception as e:
            logger.error(f"❌ Failed to save {service}: {e}")
            # Cleanup temp files if they got stuck
            self._clean_tmp_files(webp_path, png_path)
        finally:
            # Validate final files
            self._validate_image(webp_path)
            self._validate_image(png_path)

    def _create_clip_patch(self, geom, ax):
        """
        Converts Shapely geometry to Matplotlib PathPatch.
        This allows us to 'clip' scatter points so they don't bleed outside the borders.
        """
        vertices = []
        codes = []

        # Helper to process a single polygon's exterior ring
        def process_poly(poly):
            coords = np.array(poly.exterior.coords)
            # Add vertices
            vertices.extend(coords)
            # Add codes (MOVETO for start, LINETO for edges, CLOSEPOLY for end)
            codes.extend(
                [MplPath.MOVETO]
                + [MplPath.LINETO] * (len(coords) - 2)
                + [MplPath.CLOSEPOLY]
            )

        # Handle both Polygon and MultiPolygon types
        if geom.geom_type == "Polygon":
            process_poly(geom)
        elif geom.geom_type == "MultiPolygon":
            for poly in geom.geoms:
                process_poly(poly)

        path = MplPath(vertices, codes)
        # Create a Patch using the map's coordinate transform
        patch = PathPatch(
            path, transform=ax.transData, facecolor="none", edgecolor="none"
        )
        return patch

    def save_service_json(self, service: str) -> None:
        """Saves a lightweight JSON list of coordinates [lat, lng] for this service."""
        # Note: Leaflet prefers [Lat, Lng]
        active_points = []

        for loc in self.data.locations:
            pin = loc["pin"]
            partners = self.data.availability.get(pin, {})
            if partners.get(service, 0) >= 1:
                # Precision 4 is ~11 meters, plenty for a dot map. Saves text space.
                lat = round(loc["lat"], 4)
                lng = round(loc["lng"], 4)
                active_points.append([lat, lng])

        out_path = self.cfg.MAPS_DIR / f"{service}.json"
        with open(out_path, "w") as f:
            # remove whitespace to save space
            json.dump(active_points, f, separators=(",", ":"))
        logger.info(f"Saved {service}.json with {len(active_points)} points.")

    def render_service(self, service: str) -> None:
        """Generates and saves map in PNG and WEBP for a single service."""
        lats, lngs = self._get_active_coordinates(service)
        logger.info(f"Rendering map for {service} with {len(lats)} points...")
        # Look up the brand color, fallback to green if missing
        brand_color = self.cfg.BRAND_COLORS.get(service, self.cfg.DEFAULT_COLOR)

        # --- MAP ALIGNMENT FIX ---
        # Create High-DPI figure
        fig = plt.figure(figsize=(self._fig_width, self._fig_height), dpi=self.cfg.DPI)

        # 3. Create Axes that fills the figure 100% (No margins)
        ax = plt.Axes(fig, [0.0, 0.0, 1.0, 1.0])
        ax.set_axis_off()
        fig.add_axes(ax)

        # Lock Coordinates
        min_x, min_y, max_x, max_y = self.total_bounds
        ax.set_xlim(min_x, max_x)
        ax.set_ylim(min_y, max_y)

        # Wrap it in a GeoSeries to plot it easily
        border_layer = gpd.GeoSeries([self._merged_borders])

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
            alpha=0.8,
            zorder=2,  # Draw on top
        )

        # --- CLIPPING LOGIC ---
        # Get the filled shape of the country/districts
        country_geom = self._country_geom

        # Convert it to a Matplotlib Patch and add to axis
        clip_patch = self._create_clip_patch(country_geom, ax)
        ax.add_patch(clip_patch)

        # Draw Serviceable Dots with BRAND COLOR
        if lats and lngs:
            sc = ax.scatter(
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
            # Apply the clip path to the scatter collection
            # This slices any part of the dot that falls outside the patch
            sc.set_clip_path(clip_patch)

        try:
            self._save_images(service, fig)
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

    # Save Metadata - filters the list AND saves bounds.json
    valid_services = renderer.save_bounds_json()
    if not valid_services:
        logger.error("No services met the minimum point threshold. Exiting.")
        return

    # Render Loop (Iterate ONLY over valid services)
    for service in valid_services:
        renderer.render_service(service)
        renderer.save_service_json(service)

    logger.info("All maps generated successfully.")


if __name__ == "__main__":
    main()
