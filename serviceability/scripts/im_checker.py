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
DATA_DIR = PROJECT_ROOT / "data"

# Ensure data directory exists
if not DATA_DIR.exists():
    DATA_DIR.mkdir(parents=True)

INPUT_FILE = DATA_DIR / "pincodes_latlng.json"
OUTPUT_FILE = DATA_DIR / "availability_im.json"

SAVE_INTERVAL = 10

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Content-Type": "application/json",
    "Origin": "https://www.swiggy.com",
    "Referer": "https://www.swiggy.com/instamart",
}

# Setup logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger()


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


def check_instamart(lat, lng):
    url = "https://www.swiggy.com/api/instamart/home/select-location/v2"

    payload = {
        "data": {
            "lat": lat,
            "lng": lng,
            "address": "",
            "addressId": "",
            "annotation": "",
            "clientId": "INSTAMART-APP",
        }
    }

    try:
        response = requests.post(
            url, json=payload, headers=HEADERS, impersonate="chrome", timeout=15
        )

        # 1. Check HTTP Status Codes
        if response.status_code == 400:
            logger.warning(
                f"   -> API returned 400 (Bad Request). coordinates might be invalid."
            )
            return 0

        if response.status_code != 200:
            logger.error(f"   -> API Error: {response.status_code}")
            return None

        # 2. Parse JSON
        try:
            data = response.json()
        except:
            print(response.text)
            logger.error("   -> Failed to parse response JSON")
            return None

        # 3. Check for "Swiggy Not Present" Flag
        # Structure: data -> communication -> swiggyNotPresent -> swiggyNotPresent: true
        api_data = data.get("data", {})

        comm = api_data.get("communication") or {}
        not_present_obj = comm.get("swiggyNotPresent") or {}

        if not_present_obj.get("swiggyNotPresent") is True:
            return 0

        # 4. Check for "Serviceable" Signals
        # Signal A: "cards" array has items (products/banners)
        cards = api_data.get("cards", [])
        if cards and len(cards) > 0:
            return 1

        # Signal B: Check Page Configs for status
        # Structure: data -> configs -> IM_PAGE_CONFIGS -> configInfo[0] -> card -> serviceabilityStatus
        try:
            configs = api_data.get("configs", {})
            page_config = configs.get("IM_PAGE_CONFIGS", {}).get("configInfo", [])
            if page_config:
                status = page_config[0].get("card", {}).get("serviceabilityStatus", "")
                if (
                    status == "SERVICEABLE"
                    or status == "SERVICEABILITY_STATUS_SERVICEABLE"
                ):
                    return 1
        except:
            pass

        # Default fallback: If we got a valid 200 JSON but no explicit "Not Present" flag,
        return 0

    except Exception as e:
        logger.error(f"   -> Request failed: {e}")
        return None


def main():
    logger.info("--- Starting Swiggy Instamart Checker ---")

    input_data = load_json(INPUT_FILE)
    output_data = load_json(OUTPUT_FILE)

    output_map = {entry["pin"]: entry for entry in output_data}
    pending_items = []

    # Filter pending items
    for item in input_data:
        pin = item.get("pin")
        lat = item.get("lat")
        lng = item.get("lng")

        if not pin or not lat or not lng:
            continue

        if pin not in output_map:
            pending_items.append(item)
        elif "instamart" not in output_map[pin].get("partners", {}):
            pending_items.append(item)

    total_pending = len(pending_items)
    if total_pending == 0:
        logger.info("All pincodes are already updated for Instamart!")
        return

    logger.info(f"Found {total_pending} pincodes to process.")

    updates_buffer = 0

    try:
        for index, item in enumerate(pending_items, 1):
            pin = str(item.get("pin"))
            lat = item.get("lat")
            lng = item.get("lng")

            logger.info(f"[{index}/{total_pending}] Checking PIN: {pin}")

            # Check Serviceability
            status = check_instamart(lat, lng)

            # Save Result
            if status is not None:
                if pin in output_map:
                    entry = output_map[pin]
                    if "partners" not in entry:
                        entry["partners"] = {}
                    entry["partners"]["instamart"] = status
                else:
                    new_entry = {"pin": pin, "partners": {"instamart": status}}
                    output_data.append(new_entry)
                    output_map[pin] = new_entry

                result_msg = "✅ Serviceable" if status == 1 else "❌ Not Serviceable"
                logger.info(f"   -> Result: {result_msg}")
                updates_buffer += 1
            else:
                logger.warning("   -> Retrying later (Network/API error)")
                time.sleep(5)

            # Periodic Save
            if updates_buffer >= SAVE_INTERVAL:
                save_json(OUTPUT_FILE, output_data)
                updates_buffer = 0

            # Random sleep
            time.sleep(random.uniform(3.0, 5.0))

    except KeyboardInterrupt:
        logger.warning("Interrupted by user! Saving progress...")

    finally:
        if updates_buffer > 0:
            save_json(OUTPUT_FILE, output_data)
        logger.info("--- Instamart Checker Completed ---")


if __name__ == "__main__":
    main()
