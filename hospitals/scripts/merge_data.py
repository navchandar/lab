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
logger = logging.getLogger(__name__)

# Paths
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"
OUTPUT_FILE = DATA_DIR / "excluded.json"
TEMP_FILE = DATA_DIR / "excluded_processing.tmp.json"

# Google Maps Config
GMAPS_API_KEY = os.getenv("GMAPS_API_KEY")
GMAPS_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
SAVE_INTERVAL = 10  # Save every N records


# --- Network Setup (Session with Retries) ---
def get_session():
    """
    Creates a requests session with automatic retries for stability.
    """
    session = requests.Session()
    retries = Retry(
        total=3,
        backoff_factor=1,  # Sleep 1s, 2s, 4s between retries
        status_forcelist=[500, 502, 503, 504],
    )
    adapter = HTTPAdapter(max_retries=retries)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


session = get_session()


def get_lat_lng(hospital) -> Dict[str, float]:
    """
    Queries Google Maps Geocoding API with retries and session reuse.
    """
    blank = {"lat": 0.0, "lng": 0.0, "accuracy": "None"}
    if not GMAPS_API_KEY:
        return blank

    # params = {"address": address_query, "key": GMAPS_API_KEY}
    address_query = hospital["name"] + ", " + hospital["address"]
    if hospital["city"]:
        address_query = address_query + " " + hospital["city"]
    if hospital["state"]:
        address_query = address_query + " " + hospital["state"]
    if hospital["pincode"] and str(hospital["pincode"]) not in address_query:
        address_query = address_query + " " + str(hospital["pincode"])

    params = {
        "address": address_query,
        "components": f"country:IN",
        "key": GMAPS_API_KEY,
    }

    try:
        response = session.get(GMAPS_GEOCODE_URL, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        if data["status"] == "OK":
            result = data["results"][0]
            loc_type = result.get("geometry", {}).get("location_type")

            # Check if the result is precise enough
            if loc_type in ["ROOFTOP", "RANGE_INTERPOLATED"]:
                location = result["geometry"]["location"]
                logger.info(f"Found {location}")
                return {
                    "lat": location["lat"],
                    "lng": location["lng"],
                    "accuracy": "HIGH",
                }
            else:
                location = result["geometry"]["location"]
                logger.warning(
                    f"Low accuracy {location} ({loc_type}) for: {address_query}"
                )
                return {
                    "lat": location["lat"],
                    "lng": location["lng"],
                    "accuracy": "LOW",
                }
        elif data["status"] == "ZERO_RESULTS":
            # Valid response but no coordinates found
            logger.info(f"No geocoding results for '{address_query}'")
            return blank
        else:
            logger.warning(f"Geocoding issue for '{address_query}': {data['status']}")
            return blank

    except Exception as e:
        logger.error(f"Error geocoding '{address_query}': {e}")
        return blank


def generate_unique_id(hospital: Dict[str, Any]) -> str:
    name = str(hospital.get("Hospital Name", "")).strip().upper()
    pin = str(hospital.get("Pin Code", "")).strip()
    city = str(hospital.get("City", "")).strip().upper()
    suffix = pin if pin and pin.lower() != "none" else city
    return f"{name}_{suffix}"


def load_existing_data() -> Dict[str, Dict[str, Any]]:
    """
    Loads previously saved data to avoid re-geocoding known hospitals.
    This enables 'resume' functionality.
    """
    existing_map = {}
    if OUTPUT_FILE.exists():
        try:
            with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                for item in data:
                    # Reconstruct ID mechanism to match current data
                    reconstruct = {
                        "Hospital Name": item.get("name"),
                        "Pin Code": item.get("pincode"),
                        "City": item.get("city"),
                    }
                    uid = generate_unique_id(reconstruct)
                    existing_map[uid] = item
            logger.info(
                f"Loaded {len(existing_map)} existing records. Already geocoded items will be skipped."
            )
        except Exception as e:
            logger.warning(f"Could not load existing file, starting fresh: {e}")
    return existing_map


def save_progress(data_list: List[Dict[str, Any]], is_final: bool = False):
    """
    Saves data to a temp file, then renames to final if is_final is True.
    """

    # Sort before saving
    def sort_key(item):
        pin = item.get("pincode")
        pin_val = str(pin) if pin else "999999"
        name_val = str(item.get("name", ""))
        return (pin_val, name_val)

    data_list.sort(key=sort_key)

    try:
        with open(TEMP_FILE, "w", encoding="utf-8") as f:
            json.dump(data_list, f, indent=4, ensure_ascii=False)

        if is_final:
            shutil.move(str(TEMP_FILE), str(OUTPUT_FILE))
            logger.info(
                f"Final success! Saved {len(data_list)} records to {OUTPUT_FILE}"
            )
        else:
            logger.info(f"Auto-saved progress: {len(data_list)} records.")

    except Exception as e:
        logger.error(f"Failed to save file: {e}")


def process_files():
    if not DATA_DIR.exists():
        logger.error(f"Data directory not found: {DATA_DIR}")
        return

    if not GMAPS_API_KEY:
        logger.error("CRITICAL: GMAPS_API_KEY is not set. Geocoding will fail.")
        return

    # 1. LOAD PREVIOUS STATE (Resume capability)
    unique_hospitals = load_existing_data()

    # 2. READ NEW FILES
    json_files = list(DATA_DIR.glob("*Excluded_Hospitals_List.json"))
    if not json_files:
        logger.warning("No input JSON files found.")
        return

    logger.info(f"Found {len(json_files)} input files.")

    # 3. AGGREGATE DATA
    for file_path in json_files:
        company_name = file_path.name.replace(
            "_Excluded_Hospitals_List.json", ""
        ).replace("_", " ")

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            for record in data:
                uid = generate_unique_id(record)

                if uid not in unique_hospitals:
                    # New Entry
                    unique_hospitals[uid] = {
                        "name": record.get("Hospital Name"),
                        "address": record.get("Address"),
                        "city": record.get("City"),
                        "state": record.get("State"),
                        "pincode": record.get("Pin Code"),
                        "excluded_by": [company_name],
                    }
                else:
                    # Merge excluded_by list
                    if company_name not in unique_hospitals[uid]["excluded_by"]:
                        unique_hospitals[uid]["excluded_by"].append(company_name)
        except Exception as e:
            logger.error(f"Failed to read {file_path}: {e}")

    # 4. GEOCODE LOOP
    total = len(unique_hospitals)
    logger.info(f"Total unique hospitals to process: {total}")

    processed_count = 0
    api_hits = 0

    for uid, hospital in unique_hospitals.items():
        processed_count += 1

        # RESUME CHECK: If lat/lng exists, skip API call
        if hospital.get("lat") and hospital.get("lng"):
            if hospital["lat"] != 0.0 or hospital["lng"] != 0.0:
                continue

        # Construct Query
        parts = [
            hospital["name"],
            hospital["address"],
            hospital["city"],
            hospital["state"],
            hospital["pincode"],
            "India",
        ]
        query_string = ", ".join([str(p) for p in parts if p])

        logger.info(f"[{processed_count}/{total}] Geocoding: {hospital['name']}")

        coords = get_lat_lng(hospital)
        if coords["lat"] != 0.0 and coords["lng"] != 0.0:
            hospital["lat"] = coords["lat"]
            hospital["lng"] = coords["lng"]
            hospital["accuracy"] = coords["accuracy"]
        api_hits += 1

        # Periodic Save
        if api_hits > 0 and api_hits % SAVE_INTERVAL == 0:
            save_progress(list(unique_hospitals.values()), is_final=False)

        # Rate Limit Sleep
        time.sleep(0.1)

    # 5. FINAL SAVE
    save_progress(list(unique_hospitals.values()), is_final=True)


if __name__ == "__main__":
    process_files()
