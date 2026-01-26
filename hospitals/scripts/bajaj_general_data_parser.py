import json
import logging
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

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
COMPANY = "Bajaj General"
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
BASE_URL = "https://www.bajajgeneralinsurance.com/content/bagic"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    "Origin": "https://www.bajajgeneralinsurance.com",
    "Referer": "https://www.bajajgeneralinsurance.com/",
    "Accept": "application/json, text/javascript, */*; q=0.01",
}


# --- Network Helpers ---
def get_session() -> requests.Session:
    """Creates a session with retries."""
    session = requests.Session()
    session.headers.update(HEADERS)
    retries = Retry(
        total=5,
        backoff_factor=2,
        status_forcelist=[500, 502, 503, 504],
        allowed_methods=["HEAD", "GET", "POST"],
    )
    session.mount("https://", HTTPAdapter(max_retries=retries))
    return session


def clean_text(text: Any) -> str:
    """Standardizes text and handles string 'null'."""
    if not text:
        return ""
    text_str = str(text).strip()
    if text_str.lower() == "null":
        return ""
    # Remove excessive whitespace and standardize case
    cleaned = " ".join(text_str.split())
    return cleaned.title()


def send_request(session: requests.Session, endpoint: str, request_json: Dict) -> Dict:
    """
    Sends a POST request using multipart/form-data.
    Uses 'files' param to force correct Content-Type header generation.
    """
    url = f"{BASE_URL}/{endpoint}"

    full_payload = {
        "requestJson": request_json,
        "headerJson": {"Content-Type": "application/json"},
    }
    payload_str = json.dumps(full_payload)

    # Use 'files' to force multipart/form-data.
    # We pass (None, payload_str) so it doesn't try to upload a file, just sends string content.
    multipart_data = {"data": (None, payload_str)}

    try:
        response = session.post(url, files=multipart_data, timeout=30)
        response.raise_for_status()

        # Handle cases where server returns HTML error pages instead of JSON
        try:
            return response.json()
        except json.JSONDecodeError:
            # Log the first 200 chars to see what the error page says
            logger.error(
                f"Invalid JSON response from {endpoint}: {response.text[:200]}"
            )
            return {}

    except Exception as e:
        logger.error(f"Request failed to {endpoint}: {e}")
        return {}


# --- Parsing Helpers ---
def transform_hospital_data(raw_item: Dict) -> Optional[Dict]:
    """
    Maps the specific 'stringval' keys from the response to standard format.
    Based on sample:
    stringval2: Name
    stringval3: Address
    stringval5: State
    stringval6: City
    stringval7: Pincode
    stringval8: Status/Date (e.g. "Lapsed")
    """
    # 1. Extract raw values
    name = raw_item.get("stringval2")
    address = raw_item.get("stringval3")
    state = raw_item.get("stringval5")
    city = raw_item.get("stringval6")
    pincode = raw_item.get("stringval7")

    clean_name = clean_text(name)

    if not clean_name:
        return None

    # 2. Build Record
    return {
        "Hospital Name": clean_name,
        "Address": clean_text(address),
        "City": clean_text(city),
        "State": clean_text(state),
        "Pin Code": clean_text(pincode),
    }


# --- Core Logic ---
def get_states(session: requests.Session) -> List[str]:
    """Fetches list of states."""
    logger.info("Fetching State List...")
    # Payload: {"requestJson":{"flag":"Y"},...}
    req_json = {"flag": "Y"}

    data = send_request(session, "api.get-suspect-hospital-state.json", req_json)

    # Path: responseJson -> stateNameList -> [ {stringval1: "STATE NAME"} ]
    try:
        state_list = data.get("responseJson", {}).get("stateNameList", [])
        states = [
            item.get("stringval1") for item in state_list if item.get("stringval1")
        ]

        # Filter "null" strings just in case
        states = [s for s in states if s and s != "null"]

        logger.info(f"Found {len(states)} states.")
        return sorted(states)
    except Exception as e:
        logger.error(f"Error parsing states: {e}")
        return []


def get_cities(session: requests.Session, state: str) -> List[str]:
    """Fetches cities for a state."""
    # Payload: {"requestJson":{"stateName":"ANDHRA PRADESH"},...}
    req_json = {"stateName": state}

    data = send_request(session, "api.get-suspect-hospital-city.json", req_json)

    try:
        city_list = data.get("responseJson", {}).get("cityList", [])
        cities = [
            item.get("stringval1") for item in city_list if item.get("stringval1")
        ]
        cities = [c for c in cities if c and c != "null"]
        logger.info(f"Found {len(cities)} cities in {state}")
        return sorted(cities)
    except Exception as e:
        logger.error(f"Error parsing cities for {state}: {e}")
        return []


def get_pincodes(session: requests.Session, state: str, city: str) -> List[str]:
    """Fetches pincodes for a city."""
    # Payload: {"requestJson":{"cityName":"X", "stateName":"Y"},...}
    req_json = {"cityName": city, "stateName": state}

    data = send_request(session, "api.get-suspect-hospital-pin.json", req_json)

    try:
        pin_list = data.get("responseJson", {}).get("pinCodeList", [])
        pins = [item.get("stringval1") for item in pin_list if item.get("stringval1")]
        pins = [p for p in pins if p and p != "null"]
        logger.info(f"Found {len(pins)} pincodes in {city}, {state}")
        return sorted(pins)
    except Exception as e:
        logger.error(f"Error parsing pins for {city}: {e}")
        return []


def get_hospital_details(
    session: requests.Session, state: str, city: str, pincode: str
) -> List[Dict]:
    """Fetches hospital details."""
    # Payload: {"requestJson":{"hospitalName":"", "pinCode":"...", "stateName":"...", "cityName":"..."},...}
    req_json = {
        "hospitalName": "",
        "pinCode": pincode,
        "stateName": state,
        "cityName": city,
    }

    data = send_request(session, "api.get-hospital-details.json", req_json)

    try:
        # Path: responseJson -> weoSuspectedList
        raw_list = data.get("responseJson", {}).get("weoSuspectedList", [])

        hospitals = []
        for item in raw_list:
            rec = transform_hospital_data(item)
            if rec:
                hospitals.append(rec)
        return hospitals
    except Exception as e:
        logger.error(f"Error parsing hospitals for {city}-{pincode}: {e}")
        return []


def main():
    logger.info(f"Starting Scraper for {COMPANY}...")
    session = get_session()

    # 1. Get States
    states = get_states(session)
    session.close()
    if not states:
        logger.error("No states found. Exiting.")
        return

    all_data = []

    # 2. Iterate States
    for i, state in enumerate(states):
        logger.info(f"[{i+1}/{len(states)}] Processing State: {state}")

        # Create a FRESH session for every State.
        state_session = get_session()

        try:
            cities = get_cities(state_session, state)
            if not cities:
                logger.info(f"Found 0 cities in {state}")
                continue

            for city in cities:
                pincodes = get_pincodes(state_session, state, city)
                # If no pincodes, we can't query details successfully
                if not pincodes:
                    logger.warning(f"No pincodes for {city}, skipping.")
                    continue

                for pin in pincodes:
                    pin = pin.strip()
                    hospitals = get_hospital_details(state_session, state, city, pin)
                    if hospitals:
                        all_data.extend(hospitals)
                        logger.info(f"Found {len(hospitals)} hospitals in {pin}")
                    time.sleep(1)  # Small delay
        except Exception as e:
            logger.error(f"Error processing state {state}: {e}")
        finally:
            state_session.close()

    # 6. Save Results
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
