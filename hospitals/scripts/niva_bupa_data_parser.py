import json
import logging
import time
from pathlib import Path
from typing import Any, Dict, List

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# --- Configuration & Logging Setup ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# --- Paths ---
COMPANY = "Niva Bupa"
SCRIPT_DIR = (
    Path(__file__).resolve().parent
    if "__file__" in globals()
    else Path(Path.cwd() / "scripts").resolve()
)
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"
OUTPUT_FILENAME = DATA_DIR / (COMPANY + " Excluded_Hospitals_List.json")

# Ensure data directory exists
DATA_DIR.mkdir(parents=True, exist_ok=True)

# --- Constants ---
# The specific API endpoint for excluded (unrecognized) hospitals
API_URL = (
    "https://rules.nivabupa.com/api/v1/hospital_network/get_unrecognised_hospital_list"
)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.nivabupa.com/",
    "Origin": "https://www.nivabupa.com",
}


def get_session() -> requests.Session:
    """Creates a resilient session."""
    session = requests.Session()
    session.headers.update(HEADERS)
    retries = Retry(
        total=3,
        backoff_factor=1,
        status_forcelist=[500, 502, 503, 504],
    )
    session.mount("https://", HTTPAdapter(max_retries=retries))
    return session


def clean_text(text: Any) -> str:
    """Standardizes text: removes newlines, trims whitespace, handles None."""
    if not text:
        return ""
    return " ".join(str(text).split())


def fetch_unrecognized_hospitals(session: requests.Session) -> List[Dict]:
    """
    Fetches the raw JSON list from Niva Bupa API.
    """
    logger.info(f"Fetching data from {API_URL}...")
    try:
        response = session.get(API_URL, timeout=60)
        response.raise_for_status()

        data = response.json()

        # Check for success flag
        if not data.get("success"):
            logger.error("API returned success=False")
            return []

        raw_list = data.get("un_recognised_hospital_list", [])
        logger.info(f"API returned {len(raw_list)} records.")
        return raw_list

    except Exception as e:
        logger.error(f"Failed to fetch data: {e}")
        return []


def transform_data(raw_data: List[Dict]) -> List[Dict]:
    """
    Maps Niva Bupa JSON keys to the project standard format.
    """
    standardized_list = []

    for item in raw_data:
        # Standardize Keys
        record = {
            "Hospital Name": clean_text(item.get("provider_name")),
            "Address": clean_text(item.get("provider_address")),
            "City": clean_text(item.get("provider_city")),
            "State": clean_text(item.get("provider_state")),
            "Pin Code": clean_text(item.get("provider_pincode")),
            "Effective Date": clean_text(item.get("effective_from")),
        }

        # Only add if name exists
        if record["Hospital Name"]:
            standardized_list.append(record)

    return standardized_list


def main():
    logger.info(f"Starting Scraper for {COMPANY}...")
    session = get_session()

    # 1. Fetch
    raw_data = fetch_unrecognized_hospitals(session)
    if not raw_data:
        logger.warning("No data found. Exiting.")
        return

    # 2. Transform
    clean_data = transform_data(raw_data)
    logger.info(f"Transformed {len(clean_data)} records.")

    # 3. Save
    try:
        with open(OUTPUT_FILENAME, "w", encoding="utf-8") as f:
            json.dump(clean_data, f, indent=4, ensure_ascii=False)
        logger.info(f"Successfully saved to {OUTPUT_FILENAME}")
    except Exception as e:
        logger.error(f"Error saving file: {e}")


if __name__ == "__main__":
    main()
