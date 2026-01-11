import json
import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# --- Configuration & Logging Setup ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# --- Project Paths ---
COMPANY = "ICICI Lombard"
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
BASE_URL = "https://ilhc.icicilombard.com/Customer/GetDelistedHospitalList"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/115.0.0.0 Safari/537.36"
    ),
    "Origin": "https://ilhc.icicilombard.com",
    "Referer": "https://ilhc.icicilombard.com/Customer/GetDelistedHospitalList",
}


def get_session() -> requests.Session:
    """Creates a session with retries for robustness."""
    session = requests.Session()
    session.headers.update(HEADERS)

    retries = Retry(
        total=5,
        backoff_factor=1,
        status_forcelist=[500, 502, 503, 504],
        allowed_methods=["HEAD", "GET", "POST"],
    )
    adapter = HTTPAdapter(max_retries=retries)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def clean_text(text: Any) -> str:
    """Standardizes text: removes newlines, trims whitespace."""
    if not text:
        return ""
    return " ".join(str(text).split())


def get_states(session: requests.Session) -> List[str]:
    """Fetches the list of states from the initial page load."""
    logger.info("Fetching State List...")
    try:
        response = session.get(BASE_URL, timeout=20)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")
        state_select = soup.find("select", {"id": "ddlStateList"})

        if not state_select:
            logger.error("Could not find State dropdown (ddlStateList).")
            return []

        states = [
            option.get_text(strip=True)
            for option in state_select.find_all("option")
            if option.get_text(strip=True) not in ["Select State", ""]
        ]

        logger.info(f"Found {len(states)} states.")
        return states

    except Exception as e:
        logger.error(f"Error fetching states: {e}")
        return []


def get_cities(session: requests.Session, state: str) -> List[str]:
    """Fetches the list of cities for a given state via POST."""
    payload = {
        "State": state,
        "City": "Select City",
        "pincode": "",
        "HospitalName": "",
        "Button": "State Change",
        "hdnFlag": "",
        "hdnAddress": "",
        "hdnContactNo": "",
        "hdnMobileNo": "",
        "EndPoint": "0",
        "hdnShowSearchResult": "No",
        "PageNo": "0",
    }

    try:
        response = session.post(BASE_URL, data=payload, timeout=20)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")
        city_select = soup.find("select", {"id": "ddlCityList"})

        if not city_select:
            return []

        cities = [
            option.get_text(strip=True)
            for option in city_select.find_all("option")
            if option.get_text(strip=True) not in ["Select City", ""]
        ]
        return cities

    except Exception as e:
        logger.error(f"Error fetching cities for {state}: {e}")
        return []


def get_hospitals(
    session: requests.Session, state: str, city: str
) -> List[Dict[str, str]]:
    """Fetches and parses the hospital table for a specific State & City."""
    payload = {
        "State": state,
        "City": city,
        "pincode": "",
        "HospitalName": "",
        "Button": "Search",
        "hdnFlag": "",
        "hdnAddress": "",
        "hdnContactNo": "",
        "hdnMobileNo": "",
        "EndPoint": "0",
        "hdnShowSearchResult": "",
        "PageNo": "0",
    }

    try:
        response = session.post(BASE_URL, data=payload, timeout=20)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")
        table = soup.find("table", {"id": "mt"})

        if not table:
            # Sometimes empty results might not have the table, or page structure changes
            return []

        hospitals = []
        # Skip header row (thead) and iterate over body rows
        rows = (
            table.find("tbody").find_all("tr", recursive=False)
            if table.find("tbody")
            else table.find_all("tr")[1:]
        )

        for row in rows:
            cols = row.find_all("td")
            if len(cols) < 7:
                continue

            # Mapping based on the table structure provided:
            # 0: Sr.No | 1: Name | 2: Address | 3: State | 4: City | 5: Pin | 6: Date

            record = {
                "Sr. No.": clean_text(cols[0].get_text()),
                "Hospital Name": clean_text(cols[1].get_text()),
                "Address": clean_text(cols[2].get_text()),
                "State": clean_text(cols[3].get_text()),
                "City": clean_text(cols[4].get_text()),
                "Pin Code": clean_text(cols[5].get_text()),
                "Effective Date": clean_text(cols[6].get_text()),
            }

            # Basic validation to ensure it's not a garbage row
            if record["Hospital Name"]:
                hospitals.append(record)

        return hospitals

    except Exception as e:
        logger.error(f"Error fetching data for {city}, {state}: {e}")
        return []


def main():
    logger.info(f"Starting Scraper for {COMPANY}...")
    session = get_session()

    # 1. Get States
    states = get_states(session)
    if not states:
        logger.error("No states found. Exiting.")
        return

    all_data = []

    # 2. Loop States
    for i, state in enumerate(states):
        logger.info(f"[{i+1}/{len(states)}] Processing State: {state}")

        # 3. Get Cities for State
        cities = get_cities(session, state)
        if not cities:
            logger.warning(f"  No cities found for {state}")
            continue

        logger.info(f"  Found {len(cities)} cities in {state}. Fetching details...")

        # 4. Loop Cities & Fetch Data
        state_hospital_count = 0
        for city in cities:
            hospitals = get_hospitals(session, state, city)

            if hospitals:
                all_data.extend(hospitals)
                state_hospital_count += len(hospitals)
                # Small sleep to be polite to the server
                time.sleep(0.1)

        logger.info(f"  Extracted {state_hospital_count} hospitals from {state}.")

    # 5. Save Results
    if all_data:
        try:
            logger.info(f"Saving {len(all_data)} total records to {OUTPUT_FILENAME}")
            with open(OUTPUT_FILENAME, "w", encoding="utf-8") as f:
                json.dump(all_data, f, indent=4, ensure_ascii=False)
            logger.info("Done.")
        except Exception as e:
            logger.error(f"Error saving file: {e}")
    else:
        logger.warning("No data extracted.")


if __name__ == "__main__":
    main()
