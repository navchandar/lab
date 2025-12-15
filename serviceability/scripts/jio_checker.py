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

if not DATA_DIR.exists():
    DATA_DIR.mkdir(parents=True)

INPUT_FILE = DATA_DIR / "pincodes_latlng.json"
OUTPUT_FILE = DATA_DIR / "availability_jio.json"
SAVE_INTERVAL = 10

# Headers (Minimal required)
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.jiomart.com/",
    "Origin": "https://www.jiomart.com",
    "x-platform": "web"
}

# Setup logger
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger()

def load_json(filename):
    if not os.path.exists(filename): return []
    try:
        with open(filename, "r", encoding="utf-8") as f: return json.load(f)
    except: return []

def save_json(filename, data):
    try:
        with open(filename, "w", encoding="utf-8") as f: json.dump(data, f, indent=2)
        logger.info("Progress saved.")
    except: pass

def check_jiomart(pincode):
    url = f"https://www.jiomart.com/payment/serviceability/check?pin={pincode}"
    
    try:
        response = requests.get(url, headers=HEADERS, impersonate="chrome120", timeout=10)
        if response.status_code != 200:
            return None

        data = response.json()
        result = data.get("result", {})
        
        # 1. Extract Master Codes (Standard Delivery indicators)
        master_codes = result.get("pininfo", {}).get("master_codes", {})
        
        # 2. Extract Promise Info (Quick Commerce indicators)
        verticals = result.get("promiseInfo", {}).get("result", {}).get("vertical", {})

        categories_to_check = ["GROCERIES", "ELECTRONICS", "FASHION"]
        
        has_qc = False
        has_standard = False

        for cat in categories_to_check:
            # Check QC
            cat_vertical = verticals.get(cat, {})
            if cat_vertical.get("qc", 0) == 1:
                has_qc = True
            
            # Check Standard
            if master_codes.get(cat) is not None:
                has_standard = True

        # Priority Classification
        if has_qc:
            return 1 # QC enabled in at least one category
        elif has_standard:
            return 2 # Standard enabled in at least one category (and no QC)
        else:
            return 0 # No service

    except Exception as e:
        logger.error(f"   -> Request failed for {pincode}: {e}")
        return None

def main():
    logger.info("--- Starting JioMart Checker ---")
    
    input_data = load_json(INPUT_FILE)
    output_data = load_json(OUTPUT_FILE)
    
    output_map = {entry["pin"]: entry for entry in output_data}
    pending_items = []
    
    for item in input_data:
        pin = item.get("pin")
        lat = item.get("lat")
        lng = item.get("lng")

        if not pin or not lat or not lng:
            continue

        if pin not in output_map:
            pending_items.append(item)
        elif "jiomart" not in output_map[pin].get("partners", {}):
            pending_items.append(item)

    total_pending = len(pending_items)
    if total_pending == 0:
        logger.info("All pincodes are already updated for Jiomart!")
        return

    logger.info(f"Found {total_pending} pincodes to process.")
    updates_buffer = 0
    
    try:
        for index, item in enumerate(pending_items, 1):
            pin = str(item.get("pin"))
            logger.info(f"[{index}/{len(pending_items)}] Checking PIN: {pin}")

            # Check JioMart
            status = check_jiomart(pin)

            if status is not None:
                if pin in output_map:
                    entry = output_map[pin]
                    if "partners" not in entry: entry["partners"] = {}
                    entry["partners"]["jiomart"] = status
                else:
                    new_entry = {
                        "pin": pin, 
                        "partners": {
                            "jiomart": status,
                        }
                    }
                    output_data.append(new_entry)
                    output_map[pin] = new_entry

                # Log status nicely
                if status == 1:
                    icon = "🟢 FAST (QC)"
                elif status == 2:
                    icon = "🟡 STD (Delivery)"
                else:
                    icon = "🔴 NONE"
                    
                logger.info(f"   -> Result: {icon}")
                
                updates_buffer += 1
            
            if updates_buffer >= SAVE_INTERVAL:
                save_json(OUTPUT_FILE, output_data)
                updates_buffer = 0

            time.sleep(random.uniform(1.0, 3.0))

    except KeyboardInterrupt:
        logger.warning("Interrupted by user! Saving progress...")
    
    finally:
        if updates_buffer > 0:
            save_json(OUTPUT_FILE, output_data)
        logger.info("--- Jio Checker Completed ---")

if __name__ == "__main__":
    main()
