import json
import logging
import os
import random
import re
import time
from pathlib import Path

from curl_cffi import requests

# --- CONFIGURATION ---
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent

# Define the data directory
DATA_DIR = PROJECT_ROOT / "data"
# Define the full file paths
INPUT_FILE = DATA_DIR / "pincodes_latlng.json"
OUTPUT_FILE = DATA_DIR / "availability_bb.json"

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
    "x-channel": "BB-WEB",
    "x-requested-with": "XMLHttpRequest",
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
        session.get("https://www.bigbasket.com/", timeout=20, impersonate="chrome")
    except Exception as e:
        logger.warning(f"Session refresh failed: {e}")


def get_lat_lng_from_place_id(session, place_id):
    """
    Resolves a Google Place ID to Lat/Lng
    Priority: BigBasket -> Blinkit
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "accept": "application/json, text/plain, */*",
    }
    try:
        bb_url = "https://www.bigbasket.com/places/v1/places/details/"
        params = {"placeId": place_id}

        resp = session.get(
            bb_url, params=params, headers=headers, timeout=5, impersonate="chrome"
        )
        if resp.status_code == 200:
            data = resp.json()
            # BigBasket usually mirrors the Google API structure:
            # result -> geometry -> location -> lat/lng
            geo = data.get("result", {}).get("geometry", {}).get("location", {})
            lat = geo.get("lat")
            lng = geo.get("lng")

            if lat and lng:
                return lat, lng
    except Exception as e:
        logger.warning(f"BigBasket Place lookup failed: {e}")

    # --- BLINKIT (First Fallback) ---
    try:
        blinkit_url = "https://blinkit.com/location/info"
        params = {"place_id": place_id}
        resp = requests.get(
            blinkit_url, params=params, headers=headers, timeout=5, impersonate="chrome"
        )
        if resp.status_code == 200:
            data = resp.json()
            coord = data.get("coordinate", {})
            lat = coord.get("lat")
            lng = coord.get("lon")
            if lat and lng:
                return lat, lng
    except Exception as e:
        logger.warning(f"Blinkit Place lookup failed: {e}")
    return None, None


def check_pincode(session, lat, lng, pin):
    """
    Returns 1 if BigBasket is serviceable, 0 otherwise.
    """
    url = f"https://www.bigbasket.com/ui-svc/v1/serviceable/?lat={lat}&lng={lng}&send_all_serviceability=true"

    try:
        response = session.get(url, timeout=10, impersonate="chrome")

        # If blocked or session expired, try refreshing once
        if response.status_code in [401, 403]:
            logger.warning("Session expired. Refreshing...")
            time.sleep(random.uniform(3.0, 5.0))
            refresh_session(session)
            response = session.get(url, timeout=10, impersonate="chrome")

        # 303 Redirects mean most likely no service
        if response.status_code == 303 or response.status_code == 400:
            return 0

        if response.status_code != 200:
            logger.info(response.text)
            logger.error(f"API Error {response.status_code} for PIN {pin}")
            return None

        data = response.json()
        ecs_info = data.get("serviceable_ecs_info", {})

        # Get values safely. Default to "" if missing.
        b2c_val = str(ecs_info.get("bb-b2c", {}).get("serviceable", ""))
        tata_val = str(ecs_info.get("tataneu-b2c", {}).get("serviceable", ""))

        # WARNING: If BOTH are empty, the API structure might have changed
        if not b2c_val and not tata_val:
            logger.warning(
                f"PIN {pin}: No 'serviceable' value found in BB API response!"
            )
            return None

        # Check if serviceable (Must not be "NA" and must contain "bb")
        is_b2c_active = b2c_val != "NA" and "bb" in b2c_val.lower()
        is_tata_active = tata_val != "NA" and "bb" in tata_val.lower()

        if is_b2c_active or is_tata_active:
            return 1
        return 0

    except Exception as e:
        logger.error(f"Request failed for PIN {pin}: {e}")
        return None


def get_pin_places(session, pin):
    """
    Uses Autocomplete to find sub-locations within a Pincode
    and checks if ANY of them are serviceable.
    """
    api_key = os.environ.get("GMAPS_API_KEY")
    if not api_key:
        # Log once to avoid spamming
        if not hasattr(get_pin_places, "logged_missing_key"):
            logger.error("GMAPS_API_KEY not found. Skipping deep check.")
            get_pin_places.logged_missing_key = True
        return None

    # Get Place ID from BigBasket's Autocomplete API
    bb_url = f"https://www.bigbasket.com/places/v1/places/autocomplete/?inputText={pin}"

    try:
        response = session.get(bb_url, timeout=10, impersonate="chrome")
        if response.status_code != 200:
            return None

        data = response.json()
        preds = data.get("predictions", [])

        if not preds:
            return 0

        if preds and len(preds) > 1:
            logger.info(f"   -> Found {len(preds)} sub-locations. Checking...")

            # Loop through predictions to find a valid one
            for location in preds:
                place_id = location.get("placeId") or location.get("place_id")

                if place_id:
                    lat, lng = get_lat_lng_from_place_id(session, place_id)
                    if lat and lng:
                        # Check Serviceability
                        status = check_pincode(session, lat, lng, pin)
                        print(f"{lat=} {lng=} {status=}")
                        if status == 1:
                            logger.info(f"   -> Found Serviceable Location")
                            return 1
            return 0
    except Exception as e:
        logger.error(f"Address Request failed for PIN {pin}: {e}")
        return None


def main():
    logger.info("--- Starting BigBasket Checker ---")
    logger.info(f"Reading from: {INPUT_FILE}")
    logger.info(f"Writing to:   {OUTPUT_FILE}")

    input_data = load_json(INPUT_FILE)
    output_data = load_json(OUTPUT_FILE)

    # Create a dictionary (Map) for fast lookup: pin -> entry object
    output_map = {entry["pin"]: entry for entry in output_data}

    pending_items = []

    # Filter the input list
    for item in input_data:
        pin = item.get("pin")
        if not pin or not item.get("lat") or not item.get("lng"):
            continue

        # Condition 1: Pin doesn't exist in output at all
        if pin not in output_map:
            pending_items.append(item)
        # Condition 2: Pin exists, but 'bigbasket' data is missing
        elif "bigbasket" not in output_map[pin].get("partners", {}):
            pending_items.append(item)

    total_pending = len(pending_items)

    if total_pending == 0:
        logger.info("All pincodes are already updated!")
        return

    logger.info(f"Found {total_pending} pincodes to process.")

    # SESSION SETUP
    session = requests.Session()
    session.headers.update(HEADERS)
    refresh_session(session)

    updates_buffer = 0

    # Enumerate helps us show "1/50", "2/50", etc.
    for index, item in enumerate(pending_items, 1):
        pin = item.get("pin")
        lat = item.get("lat")
        lng = item.get("lng")

        logger.info(f"[{index}/{total_pending}] Checking PIN: {pin}")

        # 1. Standard Check (Lat/Lng Centroid)
        status = check_pincode(session, lat, lng, pin)

        # 2. Deep Check (If standard check failed or was 0)
        if status != 1:
            deep_status = get_pin_places(session, pin)
            # Only update status if deep check returned a definitive result (0 or 1)
            if deep_status is not None:
                status = deep_status

        # 3. Save Result
        if status is not None:
            # Check if we need to update existing or create new
            if pin in output_map:
                # Update existing entry
                entry = output_map[pin]
                if "partners" not in entry:
                    entry["partners"] = {}
                entry["partners"]["bigbasket"] = status
            else:
                # Create new entry
                new_entry = {
                    "pin": pin,
                    "partners": {"bigbasket": status},
                }
                # Add to the main list
                output_data.append(new_entry)
                # Add to map so we don't duplicate if input has same pin twice
                output_map[pin] = new_entry

            result_msg = "✅ Serviceable" if status == 1 else "❌ Not Serviceable"
            logger.info(f"   -> Result: {result_msg}")

            updates_buffer += 1
        else:
            logger.error(f"   -> Failed to get status for PIN {pin}.")

        # Save periodically
        if updates_buffer >= SAVE_INTERVAL:
            save_json(OUTPUT_FILE, output_data)
            updates_buffer = 0

        time.sleep(random.uniform(0.5, 1.5))

    # Final Save
    if updates_buffer > 0:
        save_json(OUTPUT_FILE, output_data)

    logger.info("--- BB Checker Completed ---")


if __name__ == "__main__":
    main()
