import logging
import random
import time

import requests
import utils
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# --- CONFIGURATION ---
DATA_DIR = utils.get_data_folder()
INPUT_FILE = DATA_DIR / "pincodes_latlng.json"
OUTPUT_FILE = DATA_DIR / "availability_lcs.json"


# Setup simple console logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger()

# Headers for Licious
HEADERS = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json",
    "origin": "https://www.licious.in",
    "referer": "https://www.licious.in/",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

# Delete older file to refresh new data
utils.delete_old_data(OUTPUT_FILE)


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
    1 - Serviceable
    0 - Not Serviceable
    """
    url = "https://www.licious.in/api/address/get-hub"

    payload = {"lat": lat, "lng": lng}

    try:
        response = session.post(url, json=payload, timeout=5)

        # CASE 1: 200 OK -> Serviceable
        # Even if the body is empty, the status code 200 combined with 'hub-ids' cookie confirms it.
        if response.status_code == 200:
            # Double check cookies for 'hub-ids' or 'current-city-id'
            cookies = response.cookies.get_dict()
            # logger.info(cookies)
            try:
                data = response.json()
                # logger.info(data)
                if "Unable to fetch" in data.get("exception", ""):
                    return 0
                if "Error" in data.get("statusMessage", ""):
                    return 0
            except Exception:
                pass

            if "hub-ids" in cookies or "current-city-id" in cookies:
                return 1
            else:
                # Edge case: 200 OK but no hub assigned
                # Usually 200 implies success in finding a hub.
                logger.info("   -> (200 OK) but no hub assigned")
                return None

        # CASE 2: 400 Bad Request -> Not Serviceable
        if response.status_code == 400 or response.status_code == 404:
            return 0
        # Other Errors
        logger.error(f"API Error {response.status_code} for PIN {pin}")
        return None

    except Exception as e:
        logger.error(f"Request failed for PIN {pin}: {e}")
        return None


def main():
    logger.info("--- Starting Licious Checker ---")
    logger.info(f"Reading from: {INPUT_FILE}")
    logger.info(f"Writing to:   {OUTPUT_FILE}")

    input_data = utils.load_json(INPUT_FILE)
    output_data = utils.load_json(OUTPUT_FILE)

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
        # Condition 2: Pin exists, but 'licious' data is missing
        elif "licious" not in output_map[pin].get("partners", {}):
            pending_items.append(item)

    total_pending = len(pending_items)

    if total_pending == 0:
        logger.info("All pincodes are already updated for Licious!")
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

        # Perform the check
        status = check_pincode(session, lat, lng, pin)

        if status is not None:
            # Check if we need to update existing or create new
            if pin in output_map:
                entry = output_map[pin]
                if "partners" not in entry:
                    entry["partners"] = {}
                entry["partners"]["licious"] = status
            else:
                new_entry = {
                    "pin": pin,
                    "partners": {"licious": status},
                }
                output_data.append(new_entry)
                output_map[pin] = new_entry

            result_msg = "✅ Serviceable" if status == 1 else "❌ Not Serviceable"
            logger.info(f"   -> Result: {result_msg}")

            updates_buffer += 1
        else:
            logger.error("   -> Skipped due to API error.")

        # Save periodically
        if updates_buffer >= utils.SAVE_INTERVAL:
            utils.sort_and_save_json(OUTPUT_FILE, output_data)
            updates_buffer = 0

        # Random sleep to avoid WAF
        time.sleep(random.uniform(1.0, 2.5))

    # Final Save
    if updates_buffer > 0:
        utils.sort_and_save_json(OUTPUT_FILE, output_data)

    logger.info("--- Licious Checker Completed ---")


if __name__ == "__main__":
    main()
