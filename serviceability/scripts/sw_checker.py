import json
import logging
import os
import random
import time
from pathlib import Path

import requests

# --- CONFIGURATION ---
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent

# Define the data directory
DATA_DIR = PROJECT_ROOT / "data"
# Define the full file paths
INPUT_FILE = DATA_DIR / "pincodes_latlng.json"
OUTPUT_FILE = DATA_DIR / "availability_sw.json"

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
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    "platform": "dweb",
    "priority": "u=1, i",
    "referer": "https://www.swiggy.com/restaurants",
    "user-id": "0",
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


def refresh_session(session):
    """Visits the homepage to get fresh cookies."""
    try:
        logger.info("Refreshing session cookies...")
        session.get("https://www.swiggy.com/restaurants/", timeout=10)
    except Exception as e:
        logger.warning(f"Session refresh failed: {e}")


def check_pincode(session, lat, lng, pin):
    """
    Returns 1 if Swiggy is serviceable, 0 otherwise.
    Logic:
    1. Check for specific 'LocationUnserviceable' cards.
    2. Check for restaurantCount > 0.
    """
    url = f"https://www.swiggy.com/dapi/restaurants/list/v5?lat={lat}&lng={lng}&is-seo-homepage-enabled=true&page_type=DESKTOP_WEB_LISTING"

    try:
        response = session.get(url, timeout=10)

        # Handle Session/Blocking Issues
        if response.status_code in [401, 403]:
            logger.warning("Session expired/blocked. Refreshing...")
            time.sleep(random.uniform(3.0, 5.0))
            refresh_session(session)
            response = session.get(url, timeout=10)

        # Handle 303 Redirects
        # if response.status_code == 303:
        #     logger.warning(f"PIN {pin}: Received 303 Redirect (Likely Unserviceable)")
        #     return 0  # Treat as not serviceable

        if response.status_code != 200:
            logger.error(f"API Error {response.status_code} for PIN {pin}")
            return None

        # 3. Parse JSON
        data = response.json()
        cards = data.get("data", {}).get("cards", [])

        restaurant_count = -1  # Default flag
        is_unserviceable = False

        # Loop through cards to find status
        for widget in cards:
            card_content = widget.get("card", {}).get("card", {})

            # Look for "Not Serviceable" Cards
            card_type = card_content.get("@type", "")
            card_id = card_content.get("id", "")
            card_title = card_content.get("title", "")

            # Check for the specific type. Stop searching if it's not serviceable
            if (
                "SwiggyNotPresent" in card_type
                or card_id == "swiggy_not_present"
                or "LocationUnserviceable" in card_title
            ):
                is_unserviceable = True
                break

            # Look for Restaurant Count
            if "restaurantCount" in card_content:
                restaurant_count = int(card_content["restaurantCount"])

        # 4. Final Decision Logic
        if is_unserviceable:
            logger.info("   -> Location marked as Unserviceable")
            return 0

        if restaurant_count > 0:
            logger.info(f"   -> Found {restaurant_count} restaurants.")
            return 1

        if restaurant_count == 0:
            logger.info("   -> Found 0 restaurants.")
            return 0

        # Fallback: If no unserviceable card AND no restaurant count found
        logger.warning(f"PIN {pin}: No explicit status found. Assuming unserviceable.")
        return 0

    except Exception as e:
        logger.error(f"Request failed for PIN {pin}: {e}")
        return None


def main():
    logger.info("--- Starting Swiggy Checker ---")
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
        # Condition 2: Pin exists, but 'swiggy' data is missing
        elif "swiggy" not in output_map[pin].get("partners", {}):
            pending_items.append(item)

    total_pending = len(pending_items)

    if total_pending == 0:
        logger.info("All pincodes are already updated for Swiggy!")
        return

    logger.info(f"Found {total_pending} pincodes to process.")

    # SESSION SETUP
    session = requests.Session()
    session.headers.update(HEADERS)
    refresh_session(session)

    updates_buffer = 0

    # PROCESSING LOOP
    for index, item in enumerate(pending_items, 1):
        pin = item.get("pin")
        lat = item.get("lat")
        lng = item.get("lng")

        logger.info(f"[{index}/{total_pending}] Checking PIN: {pin}...")

        # Perform the check
        status = check_pincode(session, lat, lng, pin)

        if status is not None:
            # Check if we need to update existing or create new
            if pin in output_map:
                # Update existing entry
                entry = output_map[pin]
                if "partners" not in entry:
                    entry["partners"] = {}
                entry["partners"]["swiggy"] = status
            else:
                # Create new entry
                new_entry = {
                    "pin": pin,
                    "partners": {"swiggy": status},
                }
                # Add to main list and map
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

        # Random sleep to avoid WAF blocks
        time.sleep(random.uniform(1.0, 2.5))

    # Final Save
    if updates_buffer > 0:
        save_json(OUTPUT_FILE, output_data)

    logger.info("--- Swiggy Checker Completed ---")


if __name__ == "__main__":
    main()
