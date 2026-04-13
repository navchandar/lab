import json
import logging
import os
import re
import sys
from collections import defaultdict
from io import BytesIO

import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
from requests.adapters import HTTPAdapter
from urllib3.util import Retry

# --- Configuration & Logging Setup ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# --- EV Engineering & Regulatory Constants ---

CATEGORY_MAP = {
    "L1": "Electric 2W: Max Speed ≤ 45 km/h, Power ≤ 0.5 kW",
    "L2": "Electric 2W: Max Speed > 45 km/h, Power > 0.5 kW",
    "L5": "Electric 3W: Max Speed > 25 km/h. Includes Auto-Rickshaw & Goods Carrier",
    "L5M": "Electric 3W: Passenger Carrier (Auto-Rickshaw)",
    "L5N": "Electric 3W: Goods/Cargo Carrier",
    "E-RICKSHAW": "Special 3W: Max Speed 25 km/h, Power ≤ 2 kW",
    "E-CART": "Special 3W: Goods Carrier, Max Speed 25 km/h",
}

LIMITS = {
    "L1": 250,
    "L2": 350,
    "L5": 1500,
    "L5M": 1500,
    "L5N": 1600,
    "E-RICKSHAW": 775,  # Merged standard
    "E-CART": 800,
}

CHASSIS_RATIOS = {
    "L1": 0.28,
    "L2": 0.32,
    "L5": 0.42,
    "L5M": 0.42,
    "L5N": 0.45,
    "E-RICKSHAW": 0.38,
    "E-CART": 0.40,
}

MIN_KERB_FRACTION = {
    "L1": 0.0,
    "L2": 0.0,
    "L5": 0.50,
    "L5M": 0.50,
    "L5N": 0.55,
    "E-RICKSHAW": 0.45,
    "E-CART": 0.45,
}

SEGMENT_PARAMS = {
    "L1": {"usable_soc": 0.93, "derate_ara_to_field": 0.78},
    "L2": {"usable_soc": 0.92, "derate_ara_to_field": 0.70},
    "L5": {"usable_soc": 0.92, "derate_ara_to_field": 0.70},
    "L5M": {"usable_soc": 0.92, "derate_ara_to_field": 0.70},
    "L5N": {"usable_soc": 0.92, "derate_ara_to_field": 0.65},
    "E-RICKSHAW": {"usable_soc": 0.93, "derate_ara_to_field": 0.75},
    "E-CART": {"usable_soc": 0.93, "derate_ara_to_field": 0.70},
}

SEGMENT_SCORES = {
    "L1": {
        "range_ref": 80,
        "payload_ref": 120,
        "cost_ref": 20,
        "w_range": 0.40,
        "w_cost": 0.40,
        "w_payload": 0.20,
    },
    "L2": {
        "range_ref": 120,
        "payload_ref": 150,
        "cost_ref": 25,
        "w_range": 0.45,
        "w_cost": 0.35,
        "w_payload": 0.20,
    },
    "L5": {
        "range_ref": 110,
        "payload_ref": 400,
        "cost_ref": 30,
        "w_range": 0.35,
        "w_cost": 0.35,
        "w_payload": 0.30,
    },
    "L5M": {
        "range_ref": 120,
        "payload_ref": 300,
        "cost_ref": 30,
        "w_range": 0.40,
        "w_cost": 0.30,
        "w_payload": 0.30,
    },
    "L5N": {
        "range_ref": 100,
        "payload_ref": 500,
        "cost_ref": 30,
        "w_range": 0.30,
        "w_cost": 0.35,
        "w_payload": 0.35,
    },
    "E-RICKSHAW": {
        "range_ref": 90,
        "payload_ref": 350,
        "cost_ref": 25,
        "w_range": 0.35,
        "w_cost": 0.35,
        "w_payload": 0.30,
    },
    "E-CART": {
        "range_ref": 90,
        "payload_ref": 400,
        "cost_ref": 25,
        "w_range": 0.30,
        "w_cost": 0.35,
        "w_payload": 0.35,
    },
}

UNIT_COST_INR_PER_KWH = 8.0
TARGET_SIZE = (800, 600)


class DataUtils:

    @staticmethod
    def normalize_category(cat_code):
        """Cleans and maps edge-case categories to strict CMVR definitions."""
        cat_code = str(cat_code).upper().strip()
        if "RICKSHAW" in cat_code:
            return "E-RICKSHAW"
        if "CART" in cat_code and "RICKSHAW" not in cat_code:
            return "E-CART"
        return cat_code

    @staticmethod
    def get_category_info(cat_code):
        cat_code = DataUtils.normalize_category(cat_code)
        return CATEGORY_MAP.get(cat_code, "Other")

    @staticmethod
    def get_float(val) -> float:
        """Converts messy strings to float. Returns 0.0 if invalid."""
        if not val or str(val).strip().lower() in ["na", "-", "", "none"]:
            return 0.0
        try:
            clean_val = "".join(c for c in str(val) if c.isdigit() or c == ".")
            return float(clean_val)
        except ValueError:
            return 0.0

    @staticmethod
    def estimate_real_world_range(item):
        cat = DataUtils.normalize_category(item.get("category", "L1"))
        seg = SEGMENT_PARAMS.get(cat, SEGMENT_PARAMS["L2"])

        battery_kwh = item.get("battery_kwh", 0.0)
        eff_kwh_per_100km = item.get("efficiency_reported_kwh_100km", 0.0)
        arai_range = item.get("range_km", 0.0)

        usable_energy = battery_kwh * seg["usable_soc"]

        # High density tech bonus to usable SoC
        if item.get("battery_density_wh_kg", 0) >= 200:
            usable_energy *= 1.02

        if eff_kwh_per_100km > 0:
            test_cycle_range = usable_energy / (eff_kwh_per_100km / 100.0)
            field_range = test_cycle_range * seg["derate_ara_to_field"]
        elif arai_range > 0:
            field_range = arai_range * seg["derate_ara_to_field"]
        else:
            field_range = 0.0

        item["est_real_world_range_km"] = round(field_range, 1)
        return item

    @staticmethod
    def estimate_cost(item):
        eff = item.get("efficiency_reported_kwh_100km", 0.0)
        if eff <= 0 and item.get("battery_kwh", 0) and item.get("range_km", 0):
            # Back-calculate approximate test-cycle efficiency
            eff = (item["battery_kwh"] * 100.0) / item["range_km"]

        if eff > 0:
            item["cost_per_100km_inr"] = round(eff * UNIT_COST_INR_PER_KWH, 2)
        else:
            item["cost_per_100km_inr"] = None
        return item

    @staticmethod
    def estimate_payload(item):
        cat = DataUtils.normalize_category(item.get("category", "L1"))

        # Ensure GVW is always saved to the item, using legal limits as fallback
        gvw = item.get("gvw_kg") or LIMITS.get(cat, 350)
        item["gvw_kg"] = gvw

        #  Calculate and explicitly save Battery Weight
        density = max(100, min(item.get("battery_density_wh_kg", 150), 180))
        battery_mass = (item.get("battery_kwh", 0.0) * 1000.0) / density
        item["battery_weight_kg"] = round(battery_mass, 1)
        kerb = item.get("kerb_weight_kg")

        # Exact calculation if legal weights exist
        if kerb and kerb > 0:
            payload = max(gvw - kerb, 0)
            item["payload_kg"] = round(payload, 1)
            return item

        # First-principles estimation
        chassis_ratio = CHASSIS_RATIOS.get(cat, 0.32)
        chassis_mass = gvw * chassis_ratio

        driver_mass = 75.0
        kerb_est = chassis_mass + battery_mass + driver_mass

        min_kerb_frac = MIN_KERB_FRACTION.get(cat, 0.0)
        kerb_est = max(kerb_est, min_kerb_frac * gvw)

        payload_est = max(gvw - kerb_est, 0)
        item["payload_kg"] = round(payload_est, 1)
        return item

    @staticmethod
    def calculate_segment_score_raw(item):
        cat = DataUtils.normalize_category(item.get("category", "L2"))
        seg = SEGMENT_SCORES.get(cat, SEGMENT_SCORES["L2"])

        r = item.get("est_real_world_range_km", 0.0) or 0.0
        p = item.get("payload_kg", 0.0) or 0.0
        c = item.get("cost_per_100km_inr", None)

        # Clip ratios between 0 and 1.5 to avoid runaway values dominating the score
        r_ratio = max(0.0, min(r / seg["range_ref"], 1.5))
        p_ratio = max(0.0, min(p / seg["payload_ref"], 1.5))

        if c is not None and seg["cost_ref"] > 0:
            c_ratio = max(0.0, min(seg["cost_ref"] / c, 1.5))
        else:
            c_ratio = 0.0

        raw_score = (
            r_ratio * seg["w_range"]
            + c_ratio * seg["w_cost"]
            + p_ratio * seg["w_payload"]
        )

        item["segment_score_raw"] = round(raw_score * 100, 1)
        return item

    @staticmethod
    def enrich_item(item):
        """Orchestrates the sequential physical calculations."""
        item = DataUtils.estimate_real_world_range(item)
        item = DataUtils.estimate_cost(item)
        item = DataUtils.estimate_payload(item)
        item = DataUtils.calculate_segment_score_raw(item)
        return item


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
        return re.sub(r"[^\w\-]", "_", text.strip().lower())

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

            background = ImageOps.fit(
                original_img, TARGET_SIZE, method=Image.Resampling.LANCZOS
            )
            background = background.filter(ImageFilter.GaussianBlur(radius=30))
            background = ImageEnhance.Brightness(background).enhance(0.8)

            foreground = original_img.copy()
            foreground.thumbnail(TARGET_SIZE, Image.Resampling.LANCZOS)

            bg_w, bg_h = background.size
            fg_w, fg_h = foreground.size
            offset_x = (bg_w - fg_w) // 2
            offset_y = (bg_h - fg_h) // 2

            background.paste(foreground, (offset_x, offset_y))
            background.save(filepath, "JPEG", optimize=True, quality=80)
            return True
        except Exception as e:
            _, _, exc_traceback = sys.exc_info()
            # Extract the line number from the traceback object
            line = exc_traceback.tb_lineno
            logger.error(
                f"Image processing failed for {filepath}. Error on {line=}: {e}"
            )
            return False

    def download_image(self, item):
        """Downloads vehicle image if it doesn't already exist."""
        image_url = item.get("temp_image_url")
        if not image_url or image_url == "":
            return None

        # Generate filename based on dedup key logic
        # format: oem_name_type_category.jpg
        safe_oem = self.sanitize_filename(item["oem"])
        safe_name = self.sanitize_filename(item["name"])
        filename = f'{safe_oem}_{safe_name}_{item["type"]}_{item["category"]}.jpg'
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

    def normalize_scores_within_segment(self):
        """Normalizes raw scores so the best in each segment represents 100%."""
        groups = defaultdict(list)
        for item in self.data:
            cat = DataUtils.normalize_category(item.get("category", "L1"))
            groups[cat].append(item)

        for cat, items in groups.items():
            max_score = max((i.get("segment_score_raw", 0) for i in items), default=1.0)
            if max_score == 0:
                max_score = 1.0  # Prevent division by zero

            for item in items:
                raw = item.get("segment_score_raw", 0)
                item["segment_score_norm"] = round((raw / max_score) * 100.0, 1)

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
                    existing = models_found[dedup_key]
                    new_batt = model_entry.get("battery_kwh", 0)
                    old_batt = existing.get("battery_kwh", 0)
                    new_range = model_entry.get("range_km", 0)
                    old_range = existing.get("range_km", 0)

                    if new_batt > old_batt or (
                        new_batt == old_batt and new_range > old_range
                    ):
                        models_found[dedup_key] = model_entry

            # Move dictionary values to our main data list
            self.data = list(models_found.values())

            # Perform cross-dataset normalization
            self.normalize_scores_within_segment()

            for item in self.data:
                # Handle Image Download
                filename = self.download_image(item)
                item["image"] = filename if filename else ""
                # Remove the raw URL to keep JSON clean
                item.pop("temp_image_url", None)
                item["is_best_in_oem"] = False

            # Identify the winner for each OEM + Type using normalized score
            oem_groups = {}
            for item in self.data:
                key = (item["oem"], item["type"])
                if (
                    key not in oem_groups
                    or item["segment_score_norm"]
                    > oem_groups[key]["segment_score_norm"]
                ):
                    oem_groups[key] = item

            for winner in oem_groups.values():
                winner["is_best_in_oem"] = True

        except Exception as e:
            # Get the traceback object
            _, _, exc_traceback = sys.exc_info()
            line = exc_traceback.tb_lineno
            logger.error(f"Error on {line=}: {e}")
        finally:
            if self.data:
                with open("data.json", "w") as f:
                    json.dump(self.data, f, indent=4)
                logger.info("Saved data.json successfully.")

    def get_row_data(self, cells, soup):
        model_entry = None
        try:
            category_code = DataUtils.normalize_category(cells[5].text.strip())
            category_desc = DataUtils.get_category_info(category_code)
            # type is e-2W or e-3W
            type_code = cells[4].text.upper().strip().replace("E-", "")

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
                    return DataUtils.enrich_item(model_entry)

                # EXTRACT IMAGE URL HERE
                img_link = modal.find("a", class_="btn-info")
                if img_link and "image" in img_link.text.lower():
                    model_entry["temp_image_url"] = img_link.get("href")

                for tr in modal.find_all("tr"):
                    modal_cells = tr.find_all("td")
                    if len(modal_cells) == 2:
                        label = modal_cells[0].text.lower().strip()
                        val = modal_cells[1].text.strip()

                        if "range" in label:
                            model_entry["range_km"] = DataUtils.get_float(val)
                        elif "speed" in label:
                            model_entry["max_speed_kmh"] = DataUtils.get_float(val)
                        elif "acceleration" in label:
                            model_entry["acceleration_ms2"] = DataUtils.get_float(val)
                        elif "energy consumption" in label:
                            model_entry["efficiency_reported_kwh_100km"] = (
                                DataUtils.get_float(val)
                            )
                        elif "capacity" in label:
                            model_entry["battery_kwh"] = DataUtils.get_float(val)
                        elif "density" in label:
                            model_entry["battery_density_wh_kg"] = DataUtils.get_float(
                                val
                            )
                        # Added extraction for structural weight mapping
                        elif "gvw" in label or "gross vehicle weight" in label:
                            model_entry["gvw_kg"] = DataUtils.get_float(val)
                        elif "kerb" in label or "unladen" in label:
                            model_entry["kerb_weight_kg"] = DataUtils.get_float(val)
                        elif "valid from" in label:
                            model_entry["valid_from"] = val
                        elif "valid upto" in label:
                            model_entry["valid_upto"] = val

            return DataUtils.enrich_item(model_entry)

        except Exception as e:
            logger.error(f"Error processing model entry: {e}")
        return model_entry


if __name__ == "__main__":
    EV_DATA_PARSER().fetch_data()
