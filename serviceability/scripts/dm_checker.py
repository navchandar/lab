import logging
import random
import time

import utils
from curl_cffi import requests

# --- CONFIGURATION ---
DATA_DIR = utils.get_data_folder()
# Define the full file paths
INPUT_FILE = DATA_DIR / "pincodes_latlng.json"
OUTPUT_FILE = DATA_DIR / "availability_dm.json"


# Setup simple console logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger()

# Headers for DMart
HEADERS = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json",
    "origin": "https://www.dmart.in",
    "referer": "https://www.dmart.in/",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "platform": "web",
}

# Delete older file to refresh new data
utils.delete_old_data(OUTPUT_FILE)


def get_session():
    """Creates a session and initializes cookies from homepage."""
    session = requests.Session()
    session.headers.update(HEADERS)

    # HIT HOMEPAGE TO GET COOKIES
    try:
        logger.info("Initializing session (Fetching Cookies)...")
        session.get("https://www.dmart.in/", impersonate="chrome", timeout=30)
    except Exception as e:
        logger.warning(f"Failed to fetch homepage cookies: {e}")

    return session


def check_pincode(session, pin, place_id):
    """
    Returns:
    1 - Serviceable (Home Delivery or Pick Up)
    0 - Not Serviceable
    """
    url = "https://digital.dmart.in/api/v2/pincodes/details"

    # Use the valid Google Place ID
    payload = {
        "uniqueId": place_id if place_id else "",
        "apiMode": "GA",
        "pincode": str(pin),
        "currentLat": "",
        "currentLng": "",
    }

    try:
        response = session.post(url, json=payload, impersonate="chrome", timeout=15)

        if response.status_code != 200:
            print(response.text)
            logger.error(f"API Error {response.status_code} for PIN {pin}")
            return None

        data = response.json()

        # --- PARSE RESPONSE ---
        is_serviceable_str = data.get("isPincodeServiceable", "false")

        # Explicit check for string 'true'
        if str(is_serviceable_str).lower() == "true":
            return 1
        else:
            return 0

    except Exception as e:
        logger.error(f"Request failed for PIN {pin}: {e}")
        return None


def main():
    logger.info("--- Starting DMart Checker ---")
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

        if not pin:
            continue

        # Condition 1: Pin doesn't exist in output at all
        if pin not in output_map:
            pending_items.append(item)
        # Condition 2: Pin exists, but 'dmart ready' data is missing
        elif "dmart ready" not in output_map[pin].get("partners", {}):
            pending_items.append(item)

    total_pending = len(pending_items)

    if total_pending == 0:
        logger.info("All pincodes are already updated for DMart!")
        return

    logger.info(f"Found {total_pending} pincodes to process.")

    # SESSION SETUP
    session = get_session()
    updates_buffer = 0

    # PROCESSING LOOP
    for index, item in enumerate(pending_items, 1):
        pin = item.get("pin")
        place_id = item.get("place_id", "")  # Extract Place ID

        logger.info(
            f"[{index}/{total_pending}] Checking PIN: {pin} (PlaceID: {place_id[:10]}...)"
        )

        # Perform the check
        status = check_pincode(session, pin, place_id)

        if status is not None:
            # Check if we need to update existing or create new
            if pin in output_map:
                entry = output_map[pin]
                if "partners" not in entry:
                    entry["partners"] = {}
                entry["partners"]["dmart ready"] = status
            else:
                new_entry = {
                    "pin": pin,
                    "partners": {"dmart ready": status},
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
        time.sleep(random.uniform(2.0, 3.0))

    # Final Save
    if updates_buffer > 0:
        utils.sort_and_save_json(OUTPUT_FILE, output_data)

    logger.info("--- DMart Checker Completed ---")


if __name__ == "__main__":
    main()
