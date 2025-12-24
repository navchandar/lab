import json
import logging
import os
import re
from pathlib import Path

import requests

# --- CONFIGURATION ---
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent

DATA_DIR = PROJECT_ROOT / "data"
INPUT_FILE = DATA_DIR / "pincodes_latlng.json"
# FH = FreshToHome
OUTPUT_FILE = DATA_DIR / "availability_fh.json"

# Setup Logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger()

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
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
        logger.info(f"Saved data to {filename}")
    except Exception as e:
        logger.error(f"Could not save {filename}: {e}")


def get_serviceable_pins():
    """
    Fetches FreshToHome homepage, and returns a Set of valid 6-digit pincode strings.
    """
    url = "https://www.freshtohome.com/"
    logger.info(f"Fetching content from {url}...")

    try:
        response = requests.get(url, headers=HEADERS, timeout=15)
        response.raise_for_status()
        html_content = response.text

        # --- REGEX EXTRACTION ---
        # Look for: _fth.pincodeJSON = { ... };
        # re.DOTALL allows matching across newlines if the JSON is formatted
        pattern = r"_fth\.pincodeJSON\s*=\s*(\{.*?\});"

        match = re.search(pattern, html_content, re.DOTALL)
        if not match:
            logger.error("❌ Could not find '_fth.pincodeJSON' in page source.")
            return set()

        json_str = match.group(1)

        # --- PARSING & CLEANING ---
        print(json_str)
        data = json.loads(json_str)
        valid_pins = set()

        for region_id, items in data.items():
            for item in items:
                # Remove slashes used for comments (e.g., "//560001")
                clean_item = item.replace("/", "").strip()

                # Validation: Must be 6 digits (ignores "Velloor", "stock-transfer", etc.)
                if clean_item.isdigit() and len(clean_item) == 6:
                    valid_pins.add(clean_item)

        logger.info(f"Extracted {len(valid_pins)} serviceable PINs.")
        return valid_pins

    except Exception as e:
        logger.error(f"Error fetching/parsing FreshToHome data: {e}")
        return set()


def main():
    logger.info("--- Starting FreshToHome Checker ---")

    # Fetch Master List from Website
    fth_pins = get_serviceable_pins()
    if not fth_pins:
        logger.error("No pincodes found. Exiting.")
        return

    # Load Input Data
    input_data = load_json(INPUT_FILE)

    # 3. Build Minimal Output List
    final_output = []

    # Track stats
    serviceable_count = 0
    total_processed = 0

    for entry in input_data:
        pin = entry.get("pin")
        if not pin:
            continue

        # Determine Status
        # If the pin from our file is in the FreshToHome master list -> 1, else 0
        is_serviceable = 1 if pin in fth_pins else 0

        if is_serviceable:
            serviceable_count += 1

        # Create minimal object
        clean_entry = {"pin": pin, "partners": {"freshtohome": is_serviceable}}

        final_output.append(clean_entry)
        total_processed += 1

    logger.info(f"Processed {total_processed} pincodes.")
    logger.info(f"Found {serviceable_count} serviceable locations.")

    # Save the output
    save_json(OUTPUT_FILE, final_output)

    logger.info("--- FreshToHome Completed ---")


if __name__ == "__main__":
    main()
