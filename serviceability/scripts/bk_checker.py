import json
import logging
import os
import random
import time
from pathlib import Path

from curl_cffi import requests

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
OUTPUT_FILE = DATA_DIR / "availability_bk.json"

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
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    "cache-control": "max-age=0",
    "priority": "u=0, i",
    "sec-ch-ua": '"Google Chrome";v="143", "Not:A-Brand";v="8", "Chromium";v="143"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "referer": "https://www.blinkit.com/",
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
        session.get("https://blinkit.com/", timeout=10, impersonate="chrome")
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

        resp = requests.get(bb_url, params=params, headers=headers, timeout=5, impersonate="chrome")
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
        resp = session.get(
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

def check_pincode(session, place_id, pin):
    """
    Returns 1 if Blinkit is serviceable, 0 otherwise.
    Uses 'is_serviceable' boolean from the JSON response.
    """
    url = f"https://blinkit.com/location/info?place_id={place_id}"

    try:
        response = session.get(url, timeout=15, impersonate="chrome")
        logger.info(url)

        # Handle Session/Blocking Issues
        if response.status_code in [401, 403]:
            logger.warning("Session expired/blocked. Refreshing...")
            time.sleep(random.uniform(3.0, 5.0))
            refresh_session(session)
            response = session.get(url, timeout=15, impersonate="chrome")

        # Handle 303 Redirects
        # if response.status_code == 303:
        #     logger.warning(f"PIN {pin}: Received 303 Redirect (Likely Unserviceable)")
        #     return 0  # Treat as not serviceable

        if response.status_code != 200:
            logger.error(f"API Error {response.status_code} for PIN {pin}")
            return None

        # 3. Parse JSON
        data = response.json()

        # The API returns a direct boolean key 'is_serviceable'
        # defaulting to None if key is missing
        serviceable_flag = data.get("is_serviceable")

        # 4. Final Decision Logic
        if serviceable_flag is True:
            return 1
        elif serviceable_flag is False:
            return 0
        else:
            # Fallback: If the key itself is missing from JSON
            logger.warning(f"PIN {pin}: 'is_serviceable' key missing in response.")
            return None

    except Exception as e:
        logger.error(f"Request failed for PIN {pin}: {e}")
        return None


def main():
    logger.info("--- Starting Blinkit Checker ---")
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

        # We specifically need place_id for Blinkit
        place_id = item.get("place_id")

        if not pin or not place_id:
            # Optionally log if place_id is missing as we can't process it
            # logger.debug(f"Skipping PIN {pin} due to missing place_id")
            continue

        # Condition 1: Pin doesn't exist in output at all
        if pin not in output_map:
            pending_items.append(item)
        # Condition 2: Pin exists, but 'blinkit' data is missing
        elif "blinkit" not in output_map[pin].get("partners", {}):
            pending_items.append(item)

    total_pending = len(pending_items)

    if total_pending == 0:
        logger.info("All pincodes are already updated for Blinkit!")
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
        place_id = item.get("place_id")  # We extracted this earlier

        logger.info(
            f"[{index}/{total_pending}] Checking PIN: {pin} (PlaceID: {place_id[:10]})"
        )

        # Perform the check using PLACE_ID
        status = check_pincode(session, place_id, pin)

        if status is not None:
            # Check if we need to update existing or create new
            if pin in output_map:
                # Update existing entry
                entry = output_map[pin]
                if "partners" not in entry:
                    entry["partners"] = {}
                entry["partners"]["blinkit"] = status
            else:
                # Create new entry
                new_entry = {
                    "pin": pin,
                    "partners": {"blinkit": status},
                }
                # Add to main list and map
                output_data.append(new_entry)
                output_map[pin] = new_entry

            result_msg = "✅ Serviceable" if status == 1 else "❌ Not Serviceable"
            logger.info(f"   -> Result: {result_msg}")

            updates_buffer += 1
        else:
            logger.error("   -> Skipped due to API error or missing data.")

        # Save periodically
        if updates_buffer >= SAVE_INTERVAL:
            save_json(OUTPUT_FILE, output_data)
            updates_buffer = 0

        # Random sleep to avoid WAF blocks
        time.sleep(random.uniform(1.0, 2.0))

    # Final Save
    if updates_buffer > 0:
        save_json(OUTPUT_FILE, output_data)

    logger.info("--- Blinkit Checker Completed ---")


if __name__ == "__main__":
    main()
