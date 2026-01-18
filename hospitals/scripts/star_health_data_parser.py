import json
import logging
import math
import random
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# --- Configuration & Logging ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# --- Paths ---
COMPANY = "Star Health"
SCRIPT_DIR = (
    Path(__file__).resolve().parent
    if "__file__" in globals()
    else Path(Path.cwd() / "scripts").resolve()
)

# Relative path to pincodes file: ../../serviceability/data/pincodes_latlng.json
PROJECT_ROOT = SCRIPT_DIR.parent
PINCODE_FILE = PROJECT_ROOT.parent / "serviceability" / "data" / "pincodes_latlng.json"

DATA_DIR = PROJECT_ROOT / "data"
OUTPUT_FILENAME = DATA_DIR / (COMPANY + " Excluded_Hospitals_List.json")

# Ensure output directory exists
DATA_DIR.mkdir(parents=True, exist_ok=True)

# --- Constants ---
COUNT_URL = "https://www.starhealth.in/api/non-seo/lookUp/nwhcount/"
DATA_URL = "https://www.starhealth.in/api/non-seo/lookUp/nwh/"

# Headers
HEADERS = {
    "authority": "www.starhealth.in",
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json",
    "dnt": "1",
    "origin": "https://www.starhealth.in",
    "referer": "https://www.starhealth.in/lookup/hospital/",
    "sec-ch-ua": '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    # Note: If blocked, copy the full 'cookie' string from a fresh browser session here
}


def get_session() -> requests.Session:
    """Creates a session with retries."""
    session = requests.Session()
    session.headers.update(HEADERS)
    retries = Retry(
        total=3,
        backoff_factor=2,  # Slower backoff for stability
        status_forcelist=[500, 502, 503, 504],
        allowed_methods=["HEAD", "GET", "POST"],
    )
    session.mount("https://", HTTPAdapter(max_retries=retries))
    return session


def clean_text(text: Any) -> str:
    if not text:
        return ""
    return " ".join(str(text).split())


def load_pincodes() -> List[str]:
    """Loads unique pincodes from the source JSON file."""
    if not PINCODE_FILE.exists():
        logger.error(f"Pincode file not found at: {PINCODE_FILE}")
        return []

    try:
        with open(PINCODE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        # Extract pincodes, ensuring uniqueness
        # Assuming list of dicts like [{"pincode": 110001, ...}] or list of strings
        pincodes = set()
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict) and "pin" in item:
                    pincodes.add(str(item["pin"]))
                elif isinstance(item, (str, int)):
                    pincodes.add(str(item))

        sorted_pins = sorted(list(pincodes))
        logger.info(f"Loaded {len(sorted_pins)} unique pincodes to scan.")
        return sorted_pins
    except Exception as e:
        logger.error(f"Error reading pincode file: {e}")
        return []


def get_record_count(session: requests.Session, pincode: str, category: str) -> int:
    """Queries the nwhcount API to see if hospitals exist for this pincode."""
    payload = {
        "searchTerm": pincode,
        "category": category,
        "state": "",
        "city": "",
        "orderBy": "",
    }
    try:
        response = session.post(COUNT_URL, json=payload, timeout=10)

        # Handle WAF blocking gracefully
        if response.status_code == 403:
            logger.warning("Access Denied (403). WAF might be blocking. Pausing...")
            time.sleep(5)
            return 0

        response.raise_for_status()

        # API returns a raw number string like "3"
        return int(response.text.strip('"'))
    except Exception as e:
        logger.debug(f"  No count for {pincode} or error: {e}")
        return 0


def get_hospital_page(
    session: requests.Session, pincode: str, page_no: int, total_records: int
) -> List[Dict]:
    """Fetches a specific page of data."""
    payload = {
        "searchTerm": pincode,
        "category": "nonpreferred",
        "state": "",
        "city": "",
        "pageNo": page_no,
        "totalRecords": 10,  # Page Size
        "orderBy": "",
    }

    hospitals = []
    try:
        response = session.post(DATA_URL, json=payload, timeout=15)
        response.raise_for_status()
        data = response.json()

        if data.get("responseCode") != "200" or not data.get("details"):
            return []

        for item in data["details"]:
            # Check if it is actually excluded (Extra validation)
            if item.get("excludedHospital", "").upper() == "YES":
                hospitals.append(item)

        return hospitals

    except Exception as e:
        logger.error(f"  Error fetching page {page_no} for {pincode}: {e}")
        return []


def main():
    logger.info(f"Starting Scraper for {COMPANY}...")

    # 1. Load Inputs
    pincodes = load_pincodes()
    if not pincodes:
        return

    session = get_session()
    all_data = []
    global_sr_no = 1

    # 2. Iterate Pincodes
    for i, pincode in enumerate(pincodes):
        # Progress Log every 50 items
        if i % 50 == 0:
            logger.info(
                f"Progress: [{i}/{len(pincodes)}] Scanned. Total Found: {len(all_data)}"
            )

        # A. Check Count
        count = get_record_count(
            session, pincode, "nonpreferred"
        )  # Target: Excluded/Non-Preferred
        if count == 0:
            continue

        logger.info(f"  Found {count} records at {pincode}")

        # B. Calculate Pagination
        # API page size seems to be 10 based on payload "totalRecords": 10
        total_pages = math.ceil(count / 10)

        # C. Fetch Pages
        for page in range(1, total_pages + 1):
            raw_hospitals = get_hospital_page(session, pincode, page, 10)

            for raw in raw_hospitals:
                # Map to Desired Format
                record = {
                    "Sr. No.": str(global_sr_no),
                    "Hospital Name": clean_text(raw.get("hospitalName")),
                    "Address": clean_text(raw.get("address")),
                    "State": clean_text(raw.get("stateName")),
                    "City": clean_text(raw.get("cityName")),
                    "Pin Code": clean_text(raw.get("pinCode")),
                    "Effective Date": "",  # API does not provide this
                }

                # Dedup check (Simple check to avoid duplicates if pincodes overlap regions)
                # We construct a unique key
                is_duplicate = False
                for existing in all_data:
                    if (
                        existing["Hospital Name"] == record["Hospital Name"]
                        and existing["Pin Code"] == record["Pin Code"]
                    ):
                        is_duplicate = True
                        break

                if not is_duplicate:
                    all_data.append(record)
                    global_sr_no += 1

            with open(OUTPUT_FILENAME, "w", encoding="utf-8") as f:
                json.dump(all_data, f, indent=4, ensure_ascii=False)

        # Rate Limit Delay (between pages)
        time.sleep(random.uniform(0.5, 1.0))

    # 3. Save Output
    if all_data:
        try:
            logger.info(f"Saving {len(all_data)} unique records to {OUTPUT_FILENAME}")
            with open(OUTPUT_FILENAME, "w", encoding="utf-8") as f:
                json.dump(all_data, f, indent=4, ensure_ascii=False)
            logger.info("Done.")
        except Exception as e:
            logger.error(f"Error saving file: {e}")
    else:
        logger.warning("No data extracted.")


if __name__ == "__main__":
    main()
