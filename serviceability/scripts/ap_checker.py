import json
import logging
import os
import random
import time
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# --- CONFIGURATION ---
SCRIPT_DIR = (
    Path(__file__).resolve().parent
    if "__file__" in globals()
    else Path(Path.cwd() / "scripts").resolve()
)
PROJECT_ROOT = SCRIPT_DIR.parent

# Define the data directory
DATA_DIR = PROJECT_ROOT / "data"
# Define the full file paths
INPUT_FILE = DATA_DIR / "pincodes_latlng.json"
OUTPUT_FILE = DATA_DIR / "availability_ap.json"

SAVE_INTERVAL = 10

# Setup simple console logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger()

# Headers for Apollo 24|7
HEADERS = {
    "authority": "apigateway.apollo247.in",
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "origin": "https://www.apollo247.com",
    "referer": "https://www.apollo247.com/",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}


def load_json(filename):
    """Loads JSON file safely. Returns empty list if file missing."""
    if not os.path.exists(filename):
        return []
    try:
        with open(filename, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Could not read {filename}: {e}")
        return []


def save_json(filename, data):
    """Saves data to JSON file."""
    try:
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        logger.info("Progress saved.")
    except Exception as e:
        logger.error(f"Could not save {filename}: {e}")


def get_session():
    """Creates a session with retry logic."""
    session = requests.Session()
    retries = Retry(total=3, backoff_factor=1, status_forcelist=[500, 502, 503, 504])
    session.mount("https://", HTTPAdapter(max_retries=retries))
    session.headers.update(HEADERS)
    return session


def check_pincode(session, lat, lng, pin):
    """
    Returns:
    2 - Hyperlocal (Fast Delivery)
    1 - Courier (Standard Delivery)
    0 - Not Serviceable
    """
    url = f"https://apigateway.apollo247.in/serviceability-api//v1/geocode/serviceable?latitude={lat}&longitude={lng}&pincode={pin}"

    try:
        response = session.get(url, timeout=5)

        if response.status_code != 200:
            print(response.text)
            logger.error(f"API Error {response.status_code} for PIN {pin}")
            return None

        data = response.json()

        # Validate Structure
        if not data.get("success") or "data" not in data.get("data", {}):
            logger.warning(f"   -> Unexpected JSON structure for PIN {pin}")
            return 0

        info = data["data"]["data"]

        # --- EXTRACT FLAGS ---
        is_serviceable = info.get("isServiceable", False)
        is_hyperlocal = info.get("isHyperlocalServiceable", False)
        is_courier = info.get("isCourierServiceable", False)

        # 1. If Master Flag is False -> Definitely 0
        if not is_serviceable:
            return 0

        # 2. Check Hyperlocal (Highest Priority)
        if is_hyperlocal:
            return 2

        # 3. Check Courier (Standard Priority)
        if is_courier:
            return 1

        # 4. Fallback: Serviceable=True, but neither Hyperlocal nor Courier is True?
        logger.warning(f"   -> ⚠️ Serviceable=True, but no delivery mode found")
        return 0

    except Exception as e:
        logger.error(f"Request failed for PIN {pin}: {e}")
        return None


def main():
    logger.info("--- Starting Apollo 24|7 Checker ---")
    logger.info(f"Reading from: {INPUT_FILE}")
    logger.info(f"Writing to:   {OUTPUT_FILE}")

    input_data = load_json(INPUT_FILE)
    output_data = load_json(OUTPUT_FILE)

    # Map for fast lookup
    output_map = {entry["pin"]: entry for entry in output_data}

    pending_items = []

    # Filter the input list
    for item in input_data:
        pin = item.get("pin")
        lat = item.get("lat")
        lng = item.get("lng")

        if not pin or not lat or not lng:
            continue

        # Condition 1: Pin doesn't exist in output at all
        if pin not in output_map:
            pending_items.append(item)
        # Condition 2: Pin exists, but 'apollo 24|7' data is missing
        elif "apollo 24|7" not in output_map[pin].get("partners", {}):
            pending_items.append(item)

    total_pending = len(pending_items)

    if total_pending == 0:
        logger.info("All pincodes are already updated for Apollo!")
        return

    logger.info(f"Found {total_pending} pincodes to process.")

    # SESSION SETUP
    session = get_session()
    updates_buffer = 0

    # PROCESSING LOOP
    for index, item in enumerate(pending_items, 1):
        pin = item.get("pin")
        lat = item.get("lat")
        lng = item.get("lng")

        logger.info(f"[{index}/{total_pending}] Checking PIN: {pin}")

        status = check_pincode(session, lat, lng, pin)

        if status is not None:
            # Check if we need to update existing or create new
            if pin in output_map:
                entry = output_map[pin]
                if "partners" not in entry:
                    entry["partners"] = {}
                entry["partners"]["apollo 24|7"] = status
            else:
                new_entry = {
                    "pin": pin,
                    "partners": {"apollo 24|7": status},
                }
                output_data.append(new_entry)
                output_map[pin] = new_entry

            result_msg = {2: "⚡ Hyperlocal", 1: "📦 Courier", 0: "❌ No Service"}.get(
                status, "Unknown"
            )

            logger.info(f"   -> Result: {result_msg}")

            updates_buffer += 1
        else:
            logger.error("   -> Skipped due to API error.")

        # Save periodically
        if updates_buffer >= SAVE_INTERVAL:
            save_json(OUTPUT_FILE, output_data)
            updates_buffer = 0

        # Random sleep to avoid WAF
        time.sleep(random.uniform(1.0, 2.0))

    # Final Save
    if updates_buffer > 0:
        save_json(OUTPUT_FILE, output_data)

    logger.info("--- Apollo Checker Completed ---")


if __name__ == "__main__":
    main()
