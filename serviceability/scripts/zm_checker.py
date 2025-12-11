import json
import logging
import os
import random
import time
from pathlib import Path

from curl_cffi import requests

# --- CONFIGURATION ---
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent

DATA_DIR = PROJECT_ROOT / "data"
INPUT_FILE = DATA_DIR / "pincodes_latlng.json"
OUTPUT_FILE = DATA_DIR / "availability_zom.json"

SAVE_INTERVAL = 10

# Setup logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger()

# Headers for Zomato
HEADERS = {
    "authority": "www.zomato.com",
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json",
    "origin": "https://www.zomato.com",
    "referer": "https://www.zomato.com/",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
}


def load_json(filename):
    if not os.path.exists(filename):
        return []
    try:
        with open(filename, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return []


def save_json(filename, data):
    try:
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        logger.info("Progress saved.")
    except Exception as e:
        logger.error(f"Could not save {filename}: {e}")


def init_session():
    """
    Initialize session:
    1. Visit Home (to set PHPSESSID and base cookies).
    2. Call /webroutes/auth/csrf to get the specific token.
    3. Update headers with 'x-zomato-csrft'.
    """
    session = requests.Session()
    session.headers.update(HEADERS)
    try:
        # 1. Base Visit (Essential for session cookies)
        session.get("https://www.zomato.com/", timeout=15, impersonate="chrome")

        # 2. Fetch CSRF Token
        logger.info("Fetching CSRF Token...")
        csrf_url = "https://www.zomato.com/webroutes/auth/csrf"
        csrf_resp = session.get(csrf_url, timeout=10, impersonate="chrome")

        if csrf_resp.status_code == 200:
            data = csrf_resp.json()
            token = data.get("csrf")

            if token:
                logger.info(f"Got CSRF: {token[:6]}...")
                session.headers.update({"x-zomato-csrft": token})
            else:
                logger.warning("CSRF endpoint returned empty token")
        else:
            logger.warning(f"CSRF endpoint failed: {csrf_resp.status_code}")

    except Exception as e:
        logger.warning(f"Session init failed: {e}")
    return session


def check_zomato_serviceability(session, lat, lng, place_id):
    """
    Checks Zomato serviceability using Google Place ID.
    """
    # 1. Get Location Details (The critical step)
    # We map Google Place ID -> Zomato Entity ID here
    loc_url = "https://www.zomato.com/webroutes/location/get"
    loc_params = {
        "lat": lat,
        "lon": lng,
        "placeId": place_id,
        "placeType": "GOOGLE_PLACE",
        "isOrderLocation": "1",
    }
    payload_filter = json.dumps(
        {
            "searchMetadata": {},
            "appliedFilter": [
                {
                    "filterType": "category_sheet",
                    "filterValue": "delivery_home",
                    "isHidden": True,
                    "isApplied": True,
                }
            ],
        }
    )

    try:
        # Add random sleep to avoid rate limits
        time.sleep(random.uniform(0.5, 1.5))

        loc_resp = session.get(
            loc_url, params=loc_params, timeout=10, impersonate="chrome"
        )
        if loc_resp.status_code != 200:
            return None

        loc_data = loc_resp.json()
        details = loc_data.get("locationDetails", {})

        # Immediate fail check
        if not details:
            logger.info("   -> No location details found.")
            return 0

        # 2. Verify Restaurants Exist (Apply Filter)
        # Sometimes o2Serviceable is True, but 0 restaurants are actually open/delivering.
        # We must double-check by asking for "Delivery" restaurants.
        search_url = "https://www.zomato.com/webroutes/search/applyFilter"

        # Prepare payload from the details we just got
        payload = details.copy()
        payload["context"] = "delivery"
        payload["filters"] = payload_filter

        search_resp = session.post(
            search_url, json=payload, timeout=10, impersonate="chrome"
        )
        # --- RETRY LOGIC START ---
        if search_resp.status_code == 401 or "Unauthorized request" in search_resp.text:
            logger.warning(
                "   -> Session expired/Unauthorized. Refreshing and Retrying..."
            )
            time.sleep(random.uniform(2.0, 5.0))
            # retry with a fresh session
            new_session = init_session()
            session.headers.update(new_session.headers)
            session.cookies.update(new_session.cookies)
            search_resp = session.post(
                search_url, json=payload, timeout=10, impersonate="chrome"
            )

        if search_resp.status_code == 200:
            search_data = search_resp.json()

            # Check meta info for total results count
            meta = (
                search_data.get("pageData", {})
                .get("sections", {})
                .get("SECTION_SEARCH_META_INFO", {})
                .get("searchMetaData", {})
            )
            total_results = meta.get("totalResults", 0)

            if total_results > 0:
                logger.info(f"   -> Found {total_results} restaurants.")
                return 1
            else:
                logger.info("   -> 0 Restaurants found")
                return 0

        return 0

    except Exception as e:
        logger.error(f"Zomato check failed for {lat},{lng}: {e}")
        return None


def get_google_place_id(lat, lng):
    """
    Fetch Google Place ID for coordinates using standard Google Maps API.
    (Reused from your previous logic)
    """
    api_key = os.environ.get("GMAPS_API_KEY")
    if not api_key:
        return None

    # Reverse Geocoding to get Place ID from Lat/Lng
    url = f"https://maps.googleapis.com/maps/api/geocode/json?latlng={lat},{lng}&key={api_key}"

    try:
        resp = requests.get(url, timeout=10)
        data = resp.json()
        if data.get("status") == "OK" and data.get("results"):
            # Return the first result's place_id
            return data["results"][0]["place_id"]
    except Exception as e:
        logger.error(f"Google Maps Geocode failed: {e}")

    return None


def main():
    logger.info("--- Starting Zomato Checker ---")

    input_data = load_json(INPUT_FILE)
    output_data = load_json(OUTPUT_FILE)
    output_map = {entry["pin"]: entry for entry in output_data}

    pending_items = []
    for item in input_data:
        pin = item.get("pin")
        if not pin:
            continue

        # We need to process if Zomato is missing OR if we failed previously (None)
        # Only skip if we have a definitive 0 or 1
        current_val = output_map.get(pin, {}).get("partners", {}).get("zomato")
        if pin not in output_map or current_val is None:
            pending_items.append(item)

    if not pending_items:
        logger.info("All updated.")
        return

    logger.info(f"Processing {len(pending_items)} locations...")

    session = init_session()
    updates_buffer = 0

    for index, item in enumerate(pending_items, 1):
        pin = item.get("pin")
        lat = item.get("lat")
        lng = item.get("lng")

        # 1. We prefer an existing Place ID if your input file has it (from Zepto script)
        # If not, we fetch it from Google
        place_id = item.get("place_id")
        if not place_id:
            logger.info(f"Fetching Place ID for {pin}...")
            place_id = get_google_place_id(lat, lng)

        logger.info(f"[{index}/{len(pending_items)}] Checking PIN: {pin}...")

        if place_id:
            status = check_zomato_serviceability(session, lat, lng, place_id)
        else:
            logger.warning(f"   -> Could not get Place ID. Skipping.")
            status = None

        # Save Result
        if status is not None:
            if pin in output_map:
                entry = output_map[pin]
                if "partners" not in entry:
                    entry["partners"] = {}
                entry["partners"]["zomato"] = status
            else:
                new_entry = {"pin": pin, "partners": {"zomato": status}}
                output_data.append(new_entry)
                output_map[pin] = new_entry

            res_str = "✅ Serviceable" if status == 1 else "❌ Not Serviceable"
            logger.info(f"   -> Result: {res_str}")
            updates_buffer += 1

        if updates_buffer >= SAVE_INTERVAL:
            save_json(OUTPUT_FILE, output_data)
            updates_buffer = 0

    if updates_buffer > 0:
        save_json(OUTPUT_FILE, output_data)

    logger.info("--- Zomato Checker Completed ---")


if __name__ == "__main__":
    main()
