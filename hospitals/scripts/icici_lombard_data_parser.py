import json
import logging
import math
import os
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

# --- Paths ---
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
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    "Origin": "https://ilhc.icicilombard.com",
    "Referer": "https://ilhc.icicilombard.com/Customer/GetDelistedHospitalList",
}
RECORDS_PER_PAGE = 10  # From JS: recordsperpage: 10


# --- Network Helpers ---
def get_session() -> requests.Session:
    """Creates a session with retries and persistent cookies."""
    session = requests.Session()
    session.headers.update(HEADERS)
    retries = Retry(
        total=5,
        backoff_factor=1,
        status_forcelist=[500, 502, 503, 504],
        allowed_methods=["HEAD", "GET", "POST"],
    )
    session.mount("https://", HTTPAdapter(max_retries=retries))
    return session


def clean_text(text: Any) -> str:
    """Standardizes text: removes newlines, trims whitespace."""
    if not text:
        return ""
    return " ".join(str(text).split())


# --- Parsing Helpers ---
def parse_hospital_table(soup: BeautifulSoup) -> List[Dict[str, str]]:
    """Extracts hospital rows from the HTML soup."""
    table = soup.find("table", {"id": "mt"})
    if not table:
        return []

    hospitals = []
    # logic to handle table body rows
    tbody = table.find("tbody")
    rows = tbody.find_all("tr", recursive=False) if tbody else table.find_all("tr")[1:]

    for row in rows:
        cols = row.find_all("td")
        if len(cols) < 7:
            continue

        # Mapping based on HTML structure
        record = {
            "Hospital Name": clean_text(cols[1].get_text()),
            "Address": clean_text(cols[2].get_text()),
            "State": clean_text(cols[3].get_text()),
            "City": clean_text(cols[4].get_text()),
            "Pin Code": clean_text(cols[5].get_text()),
            "Effective Date": clean_text(cols[6].get_text()),
        }

        if record["Hospital Name"]:
            hospitals.append(record)

    return hospitals


# --- Core Logic ---
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


def process_city(session: requests.Session, state: str, city: str) -> List[Dict]:
    """
    Handles the entire flow for a city:
    1. Search (POST) -> Get Page 0
    2. Check 'EndPoint' for total count
    3. Loop (GET) -> Get Page 1 to N
    """
    city_data = []

    # --- Step 1: Initial POST Search (Page 0) ---
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
        # Request Page 0
        response = session.post(BASE_URL, data=payload, timeout=20)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        # Parse Page 0 Data
        page0_data = parse_hospital_table(soup)
        city_data.extend(page0_data)

        # --- Step 2: Determine Pagination ---
        # Reverse engineered from: var number_of_items = ($("#EndPoint").val());
        endpoint_input = soup.find("input", {"id": "EndPoint"})
        total_records = int(endpoint_input.get("value", 0)) if endpoint_input else 0

        if total_records == 0:
            logger.info(f"  No records found for {city}, {state}")
            return []

        # Logic: var totalpages = parseInt(totalrecords / recordsperpage);
        total_pages = math.ceil(total_records / RECORDS_PER_PAGE)

        logger.info(
            f"  {city}: Found {total_records} records ({total_pages} pages). Processing Page 0..."
        )

        # --- Step 3: Fetch Remaining Pages (GET) ---
        # "GetDelistedHospitalList?PageNumber=" + pageindex;
        # Since Page 0 is done, we iterate from 1 to total_pages - 1
        for page_num in range(1, total_pages):
            time.sleep(0.3) 
            try:
                logger.info(f"    Fetching {city} Page {page_num}...")

                # IMPORTANT: We use GET here as per the JS logic.
                # The session cookies maintain the State/City context from the previous POST.
                page_url = f"{BASE_URL}?PageNumber={page_num}"
                page_resp = session.get(page_url, timeout=20)
                page_resp.raise_for_status()

                page_soup = BeautifulSoup(page_resp.text, "html.parser")
                page_data = parse_hospital_table(page_soup)
                city_data.extend(page_data)

            except Exception as e:
                logger.error(f"    Failed to fetch Page {page_num} for {city}: {e}")
            time.sleep(0.5)  # Small delay between page requests

        return city_data

    except Exception as e:
        logger.error(f"Critical error processing {city}, {state}: {e}")
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

    # Iterate over all States
    for i, state in enumerate(states):
        logger.info(f"[{i+1}/{len(states)}] Processing State: {state}")

        # Get Cities for State
        cities = get_cities(session, state)
        if not cities:
            logger.warning(f"  No cities found for {state}")
            continue

        logger.info(f"  Found {len(cities)} cities in {state}")

        for city in cities:
            # Process City (Search + Pagination + Save)
            hospitals = process_city(session, state, city)
            if hospitals:
                all_data.extend(hospitals)

            # Small delay between cities
            time.sleep(0.5)

    # Finally Save Results
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
