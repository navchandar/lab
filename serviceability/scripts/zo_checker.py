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

DATA_DIR = PROJECT_ROOT / "data"
INPUT_FILE = DATA_DIR / "pincodes_latlng.json"
OUTPUT_FILE = DATA_DIR / "availability_zo.json"

SAVE_INTERVAL = 10

# Setup logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger()

# Headers for Zepto
HEADERS = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    "app_sub_platform": "WEB",
    "app_version": "13.44.1",
    "appversion": "13.44.1",
    "auth_revamp_flow": "v2",
    "compatible_components": "CONVENIENCE_FEE,RAIN_FEE,EXTERNAL_COUPONS,STANDSTILL,BUNDLE,MULTI_SELLER_ENABLED,PIP_V1,ROLLUPS,SCHEDULED_DELIVERY,SAMPLING_ENABLED,ETA_NORMAL_WITH_149_DELIVERY,ETA_NORMAL_WITH_199_DELIVERY,HOMEPAGE_V2,NEW_ETA_BANNER,VERTICAL_FEED_PRODUCT_GRID,AUTOSUGGESTION_PAGE_ENABLED,AUTOSUGGESTION_PIP,AUTOSUGGESTION_AD_PIP,BOTTOM_NAV_FULL_ICON,COUPON_WIDGET_CART_REVAMP,DELIVERY_UPSELLING_WIDGET,MARKETPLACE_CATEGORY_GRID,NO_PLATFORM_CHECK_ENABLED_V2,SUPER_SAVER:1,SUPERSTORE_V1,PROMO_CASH:0,24X7_ENABLED_V1,TABBED_CAROUSEL_V2,HP_V4_FEED,WIDGET_BASED_ETA,PC_REVAMP_1,NO_COST_EMI_V1,PRE_SEARCH,ITEMISATION_ENABLED,ZEPTO_PASS,ZEPTO_PASS:5,BACHAT_FOR_ALL,SAMPLING_UPSELL_CAMPAIGN,DISCOUNTED_ADDONS_ENABLED,UPSELL_COUPON_SS:0,ENABLE_FLOATING_CART_BUTTON,NEW_FEE_STRUCTURE,NEW_BILL_INFO,RE_PROMISE_ETA_ORDER_SCREEN_ENABLED,SUPERSTORE_V1,MANUALLY_APPLIED_DELIVERY_FEE_RECEIVABLE,MARKETPLACE_REPLACEMENT,ZEPTO_PASS,ZEPTO_PASS:5,ZEPTO_PASS_RENEWAL,CART_REDESIGN_ENABLED,SHIPMENT_WIDGETIZATION_ENABLED,TABBED_CAROUSEL_V2,24X7_ENABLED_V1,PROMO_CASH:0,HOMEPAGE_V2,SUPER_SAVER:1,NO_PLATFORM_CHECK_ENABLED_V2,HP_V4_FEED,GIFT_CARD,SCLP_ADD_MONEY,GIFTING_ENABLED,OFSE,WIDGET_BASED_ETA,PC_REVAMP_1,NEW_ETA_BANNER,NO_COST_EMI_V1,ITEMISATION_ENABLED,SWAP_AND_SAVE_ON_CART,WIDGET_RESTRUCTURE,PRICING_CAMPAIGN_ID,BACHAT_FOR_ALL,TABBED_CAROUSEL_V3,CART_LMS:2,SAMPLING_UPSELL_CAMPAIGN,DISCOUNTED_ADDONS_ENABLED,UPSELL_COUPON_SS:0,SIZE_EXCHANGE_ENABLED,ENABLE_FLOATING_CART_BUTTON,SAMPLING_V3,HYBRID_CAMPAIGN,",
    "marketplace_type": "SUPER_SAVER",
    "origin": "https://www.zepto.com",
    "platform": "WEB",
    "priority": "u=1, i",
    "referer": "https://www.zepto.com/",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "source": "DIRECT",
    "tenant": "ZEPTO",
    "store_etas": '{"undefined":-1}',
    "x-csrf-secret": "WMAGOPGIzcE",
    "x-timezone": "37840759cad3a96cd3cc4a55482c6c4268e10ebbd1a21004d1e414d0e0c6b8bf",
    "x-xsrf-token": "n12C21QBnYtrvxDN5Q9rI:Fs4Zs17uAYe4bp2wQPKSf-Gyb8A.5zaascuufHvMg2OdqdK6eja6gyvyWNa1rfwSGXjWe8o",
}


def load_json(filename):
    if not os.path.exists(filename):
        return []
    try:
        with open(filename, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Could not read {filename}: {e}")
        return []


def save_json(filename, data):
    try:
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        logger.info("Progress saved.")
    except Exception as e:
        logger.error(f"Could not save {filename}: {e}")


def refresh_session(session):
    """
    Visits homepage and gather cookies. If successful, extracts fresh IDs.
    If fails/not found, session keeps the hardcoded defaults from HEADERS.
    """
    try:
        logger.info("Refreshing session & extracting headers...")
        response = session.get(
            "https://www.zepto.com/", timeout=20, impersonate="chrome"
        )

        if response.status_code != 200:
            logger.warning(f"Homepage load failed: {response.status_code}")
            return

        html = response.text

        # 1. Device ID
        device_match = re.search(r'"deviceId":\s*"([^"]+)"', html)
        if device_match:
            val = device_match.group(1)
            session.headers.update(
                {"device_id": val, "deviceid": val, "x-device-id": val}
            )

        # 2. Session ID
        session_match = re.search(r'"session_id":\s*"([^"]+)"', html)
        if session_match:
            val = session_match.group(1)
            session.headers.update({"session_id": val, "sessionid": val, "sid": val})

        # 3. CSRF Secret (Update if found, otherwise keep default)
        csrf_match = re.search(r'"csrfToken":\s*"([^"]+)"', html) or re.search(
            r'"x-csrf-secret":\s*"([^"]+)"', html
        )
        if csrf_match:
            val = csrf_match.group(1)
            logger.info(f"   -> Found fresh CSRF: {val[:5]}...")
            session.headers.update({"x-csrf-secret": val})

    except Exception as e:
        logger.warning(f"Session refresh/extraction failed: {e}")


def check_pincode(session, lat, lng, pin):
    """
    Returns 1 if Zepto is serviceable, 0 otherwise.
    """
    base_url = "https://api.zepto.com/api/v2/get_page"

    params = {
        "latitude": lat,
        "longitude": lng,
        "page_type": "HOME",
        "version": "v2",
        "show_new_eta_banner": "true",
        "page_size": "1",
        "enforce_platform_type": "DESKTOP",
    }

    try:
        # Use session (with impersonation)
        response = session.get(
            base_url, params=params, timeout=10, impersonate="chrome"
        )
        print(response.headers)
        if response.status_code in [401, 403]:
            logger.warning("Session blocked/expired. Refreshing...")
            time.sleep(random.uniform(3.0, 5.0))
            refresh_session(session)
            response = session.get(
                base_url, params=params, timeout=10, impersonate="chrome"
            )

        if len(response.text) == 0:
            logger.warning("Empty response received.")
            return None

        # if response.status_code == 303:
        #     return 0

        if response.status_code != 200:
            logger.error(f"API Error {response.status_code} for PIN {pin}")
            return None

        data = response.json()

        # Path: storeServiceableResponse -> serviceable
        service_data = data.get("storeServiceableResponse", {})
        is_serviceable = service_data.get("serviceable")

        if is_serviceable is True:
            return 1
        elif is_serviceable is False:
            return 0
        else:
            logger.warning(f"PIN {pin}: 'serviceable' key missing in response.")
            return None

    except Exception as e:
        logger.error(f"Request failed for PIN {pin}: {e}")
        return None


def get_pin_places(session, pin):
    """
    Deep Check:
    1. Call Zepto Autocomplete (using Zepto session).
    2. Call Google Maps (using clean requests).
    3. Call Zepto Check (using Zepto session).
    """
    api_key = os.environ.get("GMAPS_API_KEY")
    if not api_key:
        if not hasattr(get_pin_places, "logged_missing_key"):
            logger.error("GMAPS_API_KEY not found. Skipping deep check.")
            get_pin_places.logged_missing_key = True
        return None

    # Zepto Autocomplete
    zepto_auto_url = (
        f"https://api.zepto.com/api/v1/maps/place/autocomplete/?place_name={pin}"
    )
    # Google Maps Details
    gmaps_details_url = "https://maps.googleapis.com/maps/api/place/details/json"

    try:
        # 1. Zepto Autocomplete: Use SESSION (needs impersonation)
        response = session.get(zepto_auto_url, timeout=10, impersonate="chrome")

        if response.status_code != 200:
            return None

        data = response.json()
        preds = data.get("predictions", [])

        if not preds:
            return 0

        logger.info(
            f"   -> Deep check found {len(preds)} sub-locations via Zepto. Checking..."
        )

        if preds and len(preds) > 1:
            logger.info(f"   -> Found {len(preds)} sub-locations. Checking...")

            for location in preds:
                place_id = location.get("place_id")

                if place_id:
                    # 2. Google Maps: Use REQUESTS
                    det_params = {
                        "place_id": place_id,
                        "fields": "geometry",
                        "key": api_key,
                    }

                    try:
                        time.sleep(0.5)
                        gmaps_resp = requests.get(
                            gmaps_details_url, params=det_params, timeout=10
                        )
                        gmaps_data = gmaps_resp.json()

                        if gmaps_data.get("status") == "OK":
                            geo = (
                                gmaps_data.get("result", {})
                                .get("geometry", {})
                                .get("location", {})
                            )
                            lat = geo.get("lat")
                            lng = geo.get("lng")

                            if lat and lng:
                                # 3. Check Serviceability: Use SESSION
                                status = check_pincode(session, lat, lng, pin)
                                if status == 1:
                                    return 1

                    except Exception as e:
                        logger.error(f"Google Maps lookup failed for {place_id}: {e}")
                        continue

            return 0

    except Exception as e:
        logger.error(f"Address Request failed for PIN {pin}: {e}")
        return None


def main():
    logger.info("--- Starting Zepto Checker ---")
    logger.info(f"Reading from: {INPUT_FILE}")
    logger.info(f"Writing to:   {OUTPUT_FILE}")

    input_data = load_json(INPUT_FILE)
    output_data = load_json(OUTPUT_FILE)

    output_map = {entry["pin"]: entry for entry in output_data}
    pending_items = []

    for item in input_data:
        pin = item.get("pin")
        if not pin or not item.get("lat") or not item.get("lng"):
            continue

        if pin not in output_map:
            pending_items.append(item)
        elif "zepto" not in output_map[pin].get("partners", {}):
            pending_items.append(item)

    total_pending = len(pending_items)
    if total_pending == 0:
        logger.info("All pincodes are already updated for Zepto!")
        return

    logger.info(f"Found {total_pending} pincodes to process.")

    # SESSION SETUP
    session = requests.Session()
    session.headers.update(HEADERS)
    refresh_session(session)
    time.sleep(random.uniform(3.0, 5.0))

    updates_buffer = 0

    for index, item in enumerate(pending_items, 1):
        pin = item.get("pin")
        lat = item.get("lat")
        lng = item.get("lng")

        logger.info(f"[{index}/{total_pending}] Checking PIN: {pin}")

        # 1. Standard Check (Lat/Lng Centroid)
        status = check_pincode(session, lat, lng, pin)
        time.sleep(random.uniform(3.0, 5.0))

        # 2. Deep Check
        if status is not None and status != 1:
            deep_status = get_pin_places(session, pin)
            if deep_status is not None:
                status = deep_status

        # 3. Save Result
        if status is not None:
            if pin in output_map:
                entry = output_map[pin]
                if "partners" not in entry:
                    entry["partners"] = {}
                entry["partners"]["zepto"] = status
            else:
                new_entry = {
                    "pin": pin,
                    "partners": {"zepto": status},
                }
                output_data.append(new_entry)
                output_map[pin] = new_entry

            result_msg = "✅ Serviceable" if status == 1 else "❌ Not Serviceable"
            logger.info(f"   -> Result: {result_msg}")

            updates_buffer += 1
        else:
            logger.error(f"   -> Failed to get status for PIN {pin}.")

        if updates_buffer >= SAVE_INTERVAL:
            save_json(OUTPUT_FILE, output_data)
            updates_buffer = 0

        time.sleep(random.uniform(1.0, 2.0))

    if updates_buffer > 0:
        save_json(OUTPUT_FILE, output_data)

    logger.info("--- Zepto Checker Completed ---")


if __name__ == "__main__":
    main()
