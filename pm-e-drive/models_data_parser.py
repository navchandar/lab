import os
import re
import json
import logging
import sys

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util import Retry
from PIL import Image, ImageOps, ImageFilter, ImageEnhance
from io import BytesIO

# --- Configuration & Logging Setup ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

#  CMVR mapping
CATEGORY_MAP = {
    "L1": "Electric 2W: Max Speed ≤ 45 km/h, Power ≤ 0.5 kW",
    "L2": "Electric 2W: Max Speed > 45 km/h, Power > 0.5 kW",
    "L5": "Electric 3W: Max Speed > 25 km/h. Includes Auto-Rickshaw & Goods Carrier",
    "L5M": "Electric 3W: Passenger Carrier (Auto-Rickshaw)",
    "L5N": "Electric 3W: Goods/Cargo Carrier",
    "E-RICKSHAW": "Special 3W: Max Speed 25 km/h, Power ≤ 2 kW",
    "E-RICKSHAW & E-CART": "Special 3W: Max Speed 25 km/h, Power ≤ 2 kW",
    "E-CART": "Special 3W: Goods Carrier, Max Speed 25 km/h",
}

# Max CMVR GVW legal limits in India (Total Weight Allowed)
LIMITS = {
    "L1": 250,
    "L2": 350,
    "L5": 1500,
    "L5M": 1500,
    "L5N": 1600,
    "E-Rickshaw": 750,
    "E-RICKSHAW & E-CART": 775,
    "E-CART": 800,
}

# Engineering-based Chassis + Motor weight ratios (as % of GVW)
# L1: light, L5: Heavy commercial grade steel
CHASSIS_RATIOS = {
    "L1": 0.28,
    "L2": 0.32,
    "L5": 0.42,
    "L5M": 0.42,
    "L5N": 0.45,
    "E-RICKSHAW": 0.38,
    "E-CART": 0.40,
}

# Standard size (4:3 ratio is common)
TARGET_SIZE = (800, 600)


class DataUtils:

    @staticmethod
    def get_category_info(cat_code):
        cat_code = str(cat_code).upper().strip()
        return CATEGORY_MAP.get(cat_code, "Other")

    @staticmethod
    def get_float(val) -> float:
        """Converts messy strings to float. Returns 0.0 if invalid."""
        if not val or str(val).strip().lower() in ["na", "-", "", "none"]:
            return 0.0
        try:
            # Remove units like 'km', 'kg' and commas
            clean_val = "".join(c for c in str(val) if c.isdigit() or c == ".")
            return float(clean_val)
        except ValueError:
            return 0.0

    @staticmethod
    def calculate_metrics(item):
        """
        Calculates economy and performance metrics for real world conditions
        Calculates load capacity based on CMVR limits and battery weight.
        """
        # 1. Basic Variables
        unit_cost = 8  # (Assuming average ₹8 per kWh in India)
        reported_range = item.get("range_km", 0)
        battery_kwh = item.get("battery_kwh", 0)
        efficiency = item.get("efficiency_reported_kwh_100km", 0)
        density = item.get("battery_density_wh_kg", 150)
        cat = str(item.get("category", "L1")).upper().strip()

        # We use a 0.8 factor (20% reduction) due to "usable" capacity and real-world conditions
        # But If battery is high-tech (high density), it performs better.
        # And If it's a slow vehicle (L1), it loses less energy.
        base_factor = 0.82  # Start at 82%
        if density >= 200:  # Tech bonus
            base_factor += 0.03
        if cat == "L1":  # Slow speed efficiency bonus
            base_factor += 0.05

        # --- 2. Estimated Real World Range ---
        # Calculation: (Total Energy / Energy used per 100km) * 100 * Safety Factor
        if efficiency > 0:
            item["cost_per_100km_inr"] = round(efficiency * unit_cost, 2)
            real_range = (battery_kwh / efficiency) * 100 * base_factor
            item["est_real_world_range_km"] = round(real_range, 1)
        else:
            # If efficiency is missing, assume 25% reduction from ARAI reported range
            item["est_real_world_range_km"] = round(reported_range * 0.75, 1)

        # --- 3. Payload Calculation ---
        # 1. Density Clamping: Prevents 'Magic' lightweight batteries
        density = max(100, min(density, 180))
        # 2. Maximum GVW Lookup
        max_gvw = item.get("gvw_kg") or LIMITS.get(cat, 350)

        # 3. Practical Multipliers (Design Envelope)
        PRACTICAL_MULTIPLIERS = {
            "L1": 0.45, "L2": 0.43, "L5": 0.50,
            "L5M": 0.48, "L5N": 0.52, "E-RICKSHAW": 0.48,
            "E-RICKSHAW & E-CART": 0.48, "E-CART": 0.50
        }
        multiplier = PRACTICAL_MULTIPLIERS.get(cat, 0.45)

        # 4. Battery Weight Calculation
        battery_kg = (battery_kwh * 1000) / density
        item["battery_weight_kg"] = round(battery_kg, 2)

        # 5. Baseline Context
        BASELINE_BATT_KG = {
            "L1": 9, "L2": 14, "L5": 45, "L5M": 45, "L5N": 55,
            "E-RICKSHAW": 40, "E-CART": 55
        }
        baseline = BASELINE_BATT_KG.get(cat, 14)

        # 6. Nonlinear Penalty Logic
        if "L1" in cat or "L2" in cat:
            excess = max(0, battery_kg - baseline)
            mild = min(excess, 5) * 0.35   # Slight reduction for minor weight increase
            harsh = max(0, excess - 5) * 0.75 # Heavy reduction for oversized packs
            battery_penalty = mild + harsh
        else:
            # 3W: Linear/Lower penalty due to robust commercial chassis
            excess = max(0, battery_kg - baseline)
            battery_penalty = excess * 0.20

        # 7. Final Payload Synthesis
        base_practical_capacity = max_gvw * multiplier
        payload = base_practical_capacity - battery_penalty

        # 8. Legal Cap (If actual Kerb Weight is scraped)
        kerb = item.get("kerb_weight_kg")
        if kerb:
            legal_payload = max_gvw - kerb
            payload = min(payload, legal_payload)

        item["payload_kg"] = round(max(0, payload), 2)
        return item


    @staticmethod
    def calculate_score(item):
        """Calculates a normalized score (0-100) for ranking."""
        # We weigh Range (45%), Efficiency/Cost (25%), and Payload (30%)
        r_score = (item.get("est_real_world_range_km", 0) / 160) * 45  # Benchmark 160km
        c_score = (1 - (item.get("cost_per_100km_inr", 0) / 40)) * 25 # Lower cost is better
        p_score = (item.get("payload_kg", 0) / 250) * 30              # Benchmark 250kg
        
        return round(max(r_score + c_score + p_score, 0), 2)

        
class EV_DATA_PARSER:
    def __init__(self):
        self.url = "https://pmedrive.heavyindustries.gov.in/models"
        self.domain = "https://pmedrive.heavyindustries.gov.in"
        self.data = []
        self.image_dir = "images"
        self.headers = {
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "accept-language": "en-US,en;q=0.9",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
            "upgrade-insecure-requests": "1",
            "referer": "https://www.google.com/",
        }
        # Create images directory
        os.makedirs(self.image_dir, exist_ok=True)

        # --- Retry Logic Configuration ---
        self.session = requests.Session()
        retry_strategy = Retry(
            total=3,
            backoff_factor=2,  # Wait between tries
            status_forcelist=[429, 500, 502, 503, 504],  # Retry on these errors
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)

    def sanitize_filename(self, text):
        """Converts strings to safe filenames."""
        return re.sub(r'[^\w\-]', '_', text.strip().lower())

    def process_and_save_image(self, image_content, filepath):
        """
        Validates image. Creates a standardized image by using a blurred, 
        zoomed-in version of the original as the background, and placing 
        the sharp, resized original in the center.
        """
        try:
            # Validation - open and verify the image
            img_stream = BytesIO(image_content)
            original_img = Image.open(img_stream)
            original_img.verify() # Verify integrity

            # Re-open stream after verify, convert to RGB (handles PNGs/palette images)
            img_stream.seek(0)
            original_img = Image.open(img_stream).convert("RGB")

            # --- Create Background Layer (Blurred & Zoomed) ---
            # ImageOps.fit resizes and centers crop to fill dimensions completely
            background = ImageOps.fit(original_img, TARGET_SIZE, method=Image.Resampling.LANCZOS)
            # Apply heavy blur (adjust radius=30 up or down for more/less blur)
            background = background.filter(ImageFilter.GaussianBlur(radius=30))
            # Darken background slightly to make foreground pop
            background = ImageEnhance.Brightness(background).enhance(0.8)

            # --- Create Foreground Layer (Sharp & Fitted) ---
            foreground = original_img.copy()
            # thumbnail resizes to fit WITHIN dimensions, maintaining aspect ratio
            foreground.thumbnail(TARGET_SIZE, Image.Resampling.LANCZOS)

            # --- Combine Layers ---
            # Calculate center position
            bg_w, bg_h = background.size
            fg_w, fg_h = foreground.size
            offset_x = (bg_w - fg_w) // 2
            offset_y = (bg_h - fg_h) // 2

            # Paste foreground onto blurred background (using the background as canvas)
            background.paste(foreground, (offset_x, offset_y))

            # Compress and Save resulting image
            # optimize=True reduces file size significantly
            background.save(filepath, "JPEG", optimize=True, quality=80)
            return True
        except Exception as e:
            _, _, exc_traceback = sys.exc_info()
            # Extract the line number from the traceback object
            line = exc_traceback.tb_lineno
            logger.error(f"Image processing failed for {filepath}")
            logger.error(f"Error on {line=}: {e}")
            return False


    def download_image(self, item):
        """Downloads vehicle image if it doesn't already exist."""
        image_url = item.get("temp_image_url")
        if not image_url or image_url == "":
            return None

        # Generate filename based on dedup key logic
        # format: oem_name_type_category.jpg
        safe_oem = self.sanitize_filename(item['oem'])
        safe_name = self.sanitize_filename(item['name'])
        filename = f"{safe_oem}_{safe_name}_{item['type']}_{item['category']}.jpg"
        filepath = os.path.join(self.image_dir, filename)

        # Skip if already exists
        if os.path.exists(filepath):
            logger.info(f"Image already exists, skipping: {filename}")
            return filename

        try:
            logger.info(f"Downloading image for {item['name']}...")
            res = self.session.get(image_url, headers=self.headers, timeout=20)
            res.raise_for_status()
            # Process before saving
            success = self.process_and_save_image(res.content, filepath)
            if success:
                logger.info(f"File saved : {filepath}")
                return filename
            else:
                logger.error(f"File save failed: {filepath}")
        except Exception as e:
            logger.error(f"Failed to download image for {item['name']}: {e}")
        return None


    def fetch_data(self):
        try:
            logger.info(f"Loading {self.domain}")
            self.session.get(self.domain, headers=self.headers, timeout=30)
            token = self.session.cookies.get("XSRF-TOKEN")
            self.headers["X-XSRF-TOKEN"] = token
            self.headers["Referer"] = self.domain

            logger.info(f"Loading {self.url}")
            res = self.session.get(self.url, headers=self.headers, timeout=30)
            logger.info(f"Response status code {res.status_code}")
            res.raise_for_status()
            soup = BeautifulSoup(res.text, "html.parser")
            table = soup.find("table", id="export-button")
            logger.info(f"Table found: {table is not None}")
            body = table.find("tbody")
            # find all tr but not tr within other tr
            rows = body.find_all("tr", recursive=False)
            logger.info(f"Found {len(rows)} rows to process.")

            models_found = {}
            for row in rows:
                cells = row.find_all("td")
                if not cells:
                    continue

                model_entry = self.get_row_data(cells, soup)
                if not model_entry:
                    continue

                # Create a Deduplication Key
                dedup_key = (
                    model_entry["oem"],
                    model_entry["name"],
                    model_entry.get("type", ""),
                    model_entry.get("category", ""),
                )
                if dedup_key not in models_found:
                    models_found[dedup_key] = model_entry
                else:
                    # Keep the one with better battery or range
                    existing = models_found[dedup_key]
                    
                    new_batt = model_entry.get("battery_kwh", 0)
                    old_batt = existing.get("battery_kwh", 0)
                    
                    new_range = model_entry.get("range_km", 0)
                    old_range = existing.get("range_km", 0)

                    # If the new model is better, replace the old one
                    if new_batt > old_batt or (new_batt == old_batt and new_range > old_range):
                        models_found[dedup_key] = model_entry

            # Move dictionary values to our main data list
            self.data = list(models_found.values())

            # Image processing and final ranking
            for item in self.data:
                # Handle Image Download
                filename = self.download_image(item)
                item["image"] = filename if filename else ""
                # Remove the raw URL to keep JSON clean
                item.pop("temp_image_url", None)

                # Calculate Ranking
                item["rank_score"] = DataUtils.calculate_score(item)
                item["is_best_in_oem"] = False

            # Identify the winner for each OEM + Type (2W or 3W)
            oem_groups = {}
            for item in self.data:
                key = (item["oem"], item["type"])
                if key not in oem_groups or item["rank_score"] > oem_groups[key]["rank_score"]:
                    oem_groups[key] = item
            
            # Mark the winners based on ranking
            for winner in oem_groups.values():
                winner["is_best_in_oem"] = True

        except Exception as e:
            # Get the traceback object
            _, _, exc_traceback = sys.exc_info()
            # Extract the line number from the traceback object
            line = exc_traceback.tb_lineno
            logger.error(f"Error on {line=}: {e}")
        finally:
            if self.data:
                with open("data.json", "w") as f:
                    json.dump(self.data, f, indent=4)

    def get_row_data(self, cells, soup):
        model_entry = None
        try:
            category_code = cells[5].text.strip().upper()
            category_desc = DataUtils.get_category_info(category_code)
            # type is e-2W or e-3W
            type_code = cells[4].text.upper().strip().replace("E-", "")
            # Basic Mapping
            model_entry = {
                "oem": cells[1].text.strip(),
                "name": cells[2].text.strip(),
                "type": type_code,
                "category": category_code,
                "category_desc": category_desc,
                "status": cells[8].text.strip(),
                "temp_image_url": None # Placeholder
            }

            # Find the hidden modal for this row
            btn = cells[9].find("button")
            if btn:
                modal_id = btn.get("data-target", "").replace("#", "")
                modal = soup.find("div", id=modal_id)
                if not modal:
                    return model_entry

                # EXTRACT IMAGE URL HERE
                img_link = modal.find("a", class_="btn-info")
                if img_link and "image" in img_link.text.lower():
                    model_entry["temp_image_url"] = img_link.get("href")
                    
                for tr in modal.find_all("tr"):
                    cells = tr.find_all("td")
                    if len(cells) == 2:
                        label = cells[0].text.lower().strip()
                        val = cells[1].text.strip()
                        logger.info(f"{model_entry['name']} - {label}: {val}")
                        # Map every useful label found in your logs
                        if "range" in label:
                            model_entry["range_km"] = DataUtils.get_float(val)
                        elif "speed" in label:
                            model_entry["max_speed_kmh"] = DataUtils.get_float(val)
                        elif "acceleration" in label:
                            model_entry["acceleration_ms2"] = DataUtils.get_float(
                                val
                            )
                        elif "energy consumption" in label:
                            model_entry["efficiency_reported_kwh_100km"] = (
                                DataUtils.get_float(val)
                            )
                        elif "capacity" in label:
                            model_entry["battery_kwh"] = DataUtils.get_float(val)
                        elif "density" in label:
                            model_entry["battery_density_wh_kg"] = (
                                DataUtils.get_float(val)
                            )
                        elif "valid from" in label:
                            model_entry["valid_from"] = val
                        elif "valid upto" in label:
                            model_entry["valid_upto"] = val

            # Add estimated payload calculations and real-world range
            return DataUtils.calculate_metrics(model_entry)

        except Exception as e:
            logger.error(f"Error processing model entry: {e}")
        return model_entry


if __name__ == "__main__":
    EV_DATA_PARSER().fetch_data()
