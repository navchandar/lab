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
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent

# Define the data directory
DATA_DIR = PROJECT_ROOT / "data"
# Define the full file paths
INPUT_FILE = DATA_DIR / "pincodes_latlng.json"
OUTPUT_FILE = DATA_DIR / "availability_pe.json"

SAVE_INTERVAL = 10

# Setup simple console logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger()

# Headers for the request
HEADERS = {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "referer": "https://pharmeasy.in/",
    "origin": "https://pharmeasy.in",
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


def check_pincode(session, pin):
    """
    Returns 1 if Pharmeasy is serviceable (isMedicine=True), 0 otherwise.
    """
    url = f"https://pharmeasy.in/apt-api/pincode/pincode?pincode={pin}"

    try:
        response = session.get(url, timeout=5)

        # CASE 1: 404/400 usually means Invalid Pincode or Not Serviceable
        if response.status_code in [404, 400]:
            print(response.text)
            logger.info("   -> API returned 404/400 (Likely unserviceable)")
            return None

        # CASE 2: Other HTTP Errors
        if response.status_code != 200:
            print(response.text)
            logger.error(f"API Error {response.status_code} for PIN {pin}")
            return None

        # CASE 3: Empty Response (Sometimes happens for unserviced areas)
        if not response.text.strip():
            logger.info("   -> Empty response received (Likely unserviceable)")
            return 0

        # CASE 4: Valid JSON Response
        data = response.json()

        # Helper to safely extract deep keys
        city_attrs = data.get("cityAttributes", {})

        # Check specific service flags
        is_medicine = city_attrs.get("isMedicine", False)
        is_ecommerce = city_attrs.get("isEcommerce", False)

        if is_medicine or is_ecommerce:
            logger.info(f"   -> {is_medicine=}, {is_ecommerce=}")
            return 1
        else:
            return 0

    except json.JSONDecodeError:
        logger.warning(
            f"PIN {pin}: Response was not valid JSON. Treating as unserviceable."
        )
        return 0
    except Exception as e:
        logger.error(f"Request failed for PIN {pin}: {e}")
        return None


def main():
    logger.info("--- Starting Pharmeasy Checker ---")
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

        if not pin:
            continue

        # Condition 1: Pin doesn't exist in output at all
        if pin not in output_map:
            pending_items.append(item)
        # Condition 2: Pin exists, but 'pharmeasy' data is missing
        elif "pharmeasy" not in output_map[pin].get("partners", {}):
            pending_items.append(item)

    total_pending = len(pending_items)

    if total_pending == 0:
        logger.info("All pincodes are already updated for Pharmeasy!")
        return

    logger.info(f"Found {total_pending} pincodes to process.")

    # SESSION SETUP
    session = get_session()
    updates_buffer = 0

    # PROCESSING LOOP
    for index, item in enumerate(pending_items, 1):
        pin = item.get("pin")
        logger.info(f"[{index}/{total_pending}] Checking PIN: {pin}")

        # Perform the check (Pharmeasy only needs PIN, not Lat/Lng)
        status = check_pincode(session, pin)

        if status is not None:
            # Check if we need to update existing or create new
            if pin in output_map:
                entry = output_map[pin]
                if "partners" not in entry:
                    entry["partners"] = {}
                entry["partners"]["pharmeasy"] = status
            else:
                new_entry = {
                    "pin": pin,
                    "partners": {"pharmeasy": status},
                }
                output_data.append(new_entry)
                output_map[pin] = new_entry

            result_msg = "✅ Serviceable" if status == 1 else "❌ Not Serviceable"
            logger.info(f"   -> Result: {result_msg}")

            updates_buffer += 1
        else:
            logger.error("   -> Skipped due to API error.")

        # Save periodically
        if updates_buffer >= SAVE_INTERVAL:
            save_json(OUTPUT_FILE, output_data)
            updates_buffer = 0

        # Random sleep (Pharmeasy is stricter with rate limits)
        time.sleep(random.uniform(1.0, 2.0))

    # Final Save
    if updates_buffer > 0:
        save_json(OUTPUT_FILE, output_data)

    logger.info("--- Pharmeasy Checker Completed ---")


if __name__ == "__main__":
    main()
