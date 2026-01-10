import json
import logging
import os
import shutil
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# --- Configuration & Logging ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("GeocodingPipeline")

# Paths
SCRIPT_DIR = (
    Path(__file__).resolve().parent
    if "__file__" in globals()
    else Path(Path.cwd() / "scripts").resolve()
)
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"
OUTPUT_FILE = DATA_DIR / "excluded.json"
TEMP_FILE = DATA_DIR / "excluded_processing.tmp.json"

# API Config
GMAPS_API_KEY = os.getenv("GMAPS_API_KEY")
GMAPS_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
SAVE_INTERVAL = 10  # Save every N API calls


class GeocodingPipeline:
    def __init__(self):
        self.data: Dict[str, Dict[str, Any]] = {}
        self.session = self._init_session()
        self.api_hits = 0

    def _init_session(self) -> requests.Session:
        """Configures a resilient HTTP session."""
        session = requests.Session()
        retries = Retry(
            total=3, backoff_factor=1, status_forcelist=[500, 502, 503, 504]
        )
        session.mount("https://", HTTPAdapter(max_retries=retries))
        return session

    def generate_unique_id(self, name: str, pin: str, city: str) -> str:
        """Generates a stable ID for deduplication."""
        clean_name = str(name).strip().upper()
        clean_pin = str(pin).strip()
        clean_city = str(city).strip().upper()

        # Prefer Pincode, fallback to City for suffix
        suffix = clean_pin if clean_pin and clean_pin.lower() != "none" else clean_city
        return f"{clean_name}_{suffix}"

    def load_existing_data(self):
        """Loads excluded.json into memory to support resuming/updating."""
        if not OUTPUT_FILE.exists():
            logger.info("No existing output file found. Starting fresh.")
            return

        try:
            with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
                raw_list = json.load(f)

            for item in raw_list:
                # Reconstruct ID to map back to dictionary
                uid = self.generate_unique_id(
                    item.get("name"), item.get("pincode"), item.get("city")
                )
                self.data[uid] = item
                # Ensure internal flag is False by default
                self.data[uid]["_needs_update"] = False

            logger.info(f"Loaded {len(self.data)} existing records.")
        except Exception as e:
            logger.error(f"Failed to load existing data: {e}")

    def merge_sources(self):
        """
        Reads source files, adds new records, and marks existing ones for
        update if Address changed or Accuracy is LOW.
        """
        source_files = list(DATA_DIR.glob("*Excluded_Hospitals_List.json"))
        if not source_files:
            logger.warning("No source files found in data directory.")
            return

        logger.info(f"Merging data from {len(source_files)} source files...")

        for file_path in source_files:
            company_name = file_path.name.replace(
                " Excluded_Hospitals_List.json", ""
            ).strip()

            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    source_data = json.load(f)

                for record in source_data:
                    self._process_source_record(record, company_name)

            except Exception as e:
                logger.error(f"Error reading {file_path.name}: {e}")

    def _process_source_record(self, record: Dict, company: str):
        # Extract fields from Source (Title Case keys)
        src_name = record.get("Hospital Name", "")
        src_addr = record.get("Address", "")
        src_city = record.get("City", "")
        src_state = record.get("State", "")
        src_pin = record.get("Pin Code", "")

        uid = self.generate_unique_id(src_name, src_pin, src_city)

        if uid in self.data:
            existing = self.data[uid]

            # --- UPDATE LOGIC ---
            # 1. Check if Address changed (Compare stripped strings)
            old_addr = str(existing.get("address", "")).strip()
            new_addr = str(src_addr).strip()

            has_address_changed = (old_addr != new_addr) and (new_addr != "")

            # 2. Check if Accuracy is Low
            is_low_accuracy = existing.get("accuracy") == "LOW"

            if has_address_changed or is_low_accuracy:
                # UPDATE INFO
                existing["address"] = new_addr
                existing["city"] = src_city
                existing["state"] = src_state
                existing["pincode"] = src_pin

                # FLAG FOR RE-GEOCODING
                existing["_needs_update"] = True

                reason = "Address Changed" if has_address_changed else "Low Accuracy"
                logger.info(f"Marked for update ({reason}): {src_name}")

            # Merge Company
            if company not in existing["excluded_by"]:
                existing["excluded_by"].append(company)

        else:
            # NEW RECORD
            self.data[uid] = {
                "name": src_name,
                "address": src_addr,
                "city": src_city,
                "state": src_state,
                "pincode": src_pin,
                "excluded_by": [company],
                "lat": 0.0,
                "lng": 0.0,
                "accuracy": "Pending",
                "_needs_update": True,  # New records always need geocoding
            }

    def fetch_geocoding(self, record: Dict) -> Dict[str, Any]:
        """Queries Google Maps API."""
        if not GMAPS_API_KEY:
            return {"lat": 0.0, "lng": 0.0, "accuracy": "NoKey"}

        # Construct Address Query
        parts = [
            record.get("name"),
            record.get("address"),
            record.get("city"),
            record.get("state"),
            str(record.get("pincode")) if record.get("pincode") else "",
            "India",
        ]
        # Remove empty parts and duplicates
        clean_parts = []
        for p in parts:
            if p and str(p).strip() not in clean_parts:
                clean_parts.append(str(p).strip())

        query = ", ".join(clean_parts)

        params = {"address": query, "key": GMAPS_API_KEY}

        try:
            resp = self.session.get(GMAPS_GEOCODE_URL, params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json()

            if data["status"] == "OK":
                res = data["results"][0]
                loc = res["geometry"]["location"]
                loc_type = res["geometry"]["location_type"]

                accuracy = (
                    "HIGH" if loc_type in ["ROOFTOP", "RANGE_INTERPOLATED"] else "LOW"
                )

                if accuracy == "LOW":
                    logger.warning(f"Low Accuracy ({loc_type}) for: {record['name']}")
                else:
                    logger.info(f"High Accuracy found for: {record['name']}")

                return {"lat": loc["lat"], "lng": loc["lng"], "accuracy": accuracy}
            elif data["status"] == "ZERO_RESULTS":
                logger.warning(f"Zero results for: {query}")
                return {"lat": 0.0, "lng": 0.0, "accuracy": "ZeroResults"}
            else:
                logger.error(f"API Error ({data['status']}): {query}")
                return {"lat": 0.0, "lng": 0.0, "accuracy": "Error"}

        except Exception as e:
            logger.error(f"Network error geocoding '{record['name']}': {e}")
            return {"lat": 0.0, "lng": 0.0, "accuracy": "NetError"}

    def run(self):
        """Main Execution Flow"""
        if not GMAPS_API_KEY:
            logger.error("CRITICAL: GMAPS_API_KEY not found.")
            return

        # 1. Load State
        self.load_existing_data()

        # 2. Merge Updates
        self.merge_sources()

        # 3. Geocode Loop
        pending_items = [
            (uid, rec)
            for uid, rec in self.data.items()
            if rec.get("_needs_update") or (rec.get("lat") == 0.0)
        ]

        total = len(pending_items)
        if total == 0:
            logger.info("No records need geocoding.")
            return

        logger.info(f"Starting geocoding for {total} records...")

        for i, (uid, record) in enumerate(pending_items):
            result = self.fetch_geocoding(record)

            # Update Record
            record["lat"] = result["lat"]
            record["lng"] = result["lng"]
            record["accuracy"] = result["accuracy"]
            record["_needs_update"] = False  # Reset flag

            self.api_hits += 1

            # Save periodically
            if self.api_hits % SAVE_INTERVAL == 0:
                self.save_to_disk(is_final=False)
                logger.info(f"Progress: {i+1}/{total} processed...")

            time.sleep(0.1)  # Rate limit

        # 4. Final Save
        self.save_to_disk(is_final=True)

    def save_to_disk(self, is_final: bool = False):
        """Saves dictionary to JSON list, removing internal flags."""

        # Convert dict to list
        output_list = list(self.data.values())

        # Clean internal keys before saving
        clean_list = []
        for item in output_list:
            clean_item = {k: v for k, v in item.items() if not k.startswith("_")}
            clean_list.append(clean_item)

        # Sort for consistency
        clean_list.sort(
            key=lambda x: (str(x.get("pincode", "999999")), x.get("name", ""))
        )

        try:
            with open(TEMP_FILE, "w", encoding="utf-8") as f:
                json.dump(clean_list, f, indent=4, ensure_ascii=False)

            if is_final:
                shutil.move(str(TEMP_FILE), str(OUTPUT_FILE))
                logger.info(
                    f"Successfully saved {len(clean_list)} records to {OUTPUT_FILE}"
                )
            else:
                logger.info("Intermediate save completed.")
        except Exception as e:
            logger.error(f"Failed to save data: {e}")


if __name__ == "__main__":
    pipeline = GeocodingPipeline()
    pipeline.run()
