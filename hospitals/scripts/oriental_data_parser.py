import difflib
import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
from playwright.sync_api import sync_playwright

# --- Configuration & Logging ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# --- Paths ---
COMPANY = "Oriental"
SCRIPT_DIR = Path(__file__).resolve().parent if "__file__" in globals() else Path.cwd()
DATA_DIR = SCRIPT_DIR.parent / "data"
OUTPUT_JSON_FILE = DATA_DIR / (COMPANY + " Excluded_Hospitals_List.json")
EXCEL_FILE = SCRIPT_DIR / "Oriental_Excluded_List.xlsx"

# Ensure data directory exists
DATA_DIR.mkdir(parents=True, exist_ok=True)

# --- Constants ---
TARGET_URL = "https://orientalinsurance.org.in/network-hospitals"

# List of Correct State Names (Source of Truth)
INDIAN_STATES = [
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chhattisgarh",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
    "Andaman and Nicobar Islands",
    "Chandigarh",
    "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi",
    "Lakshadweep",
    "Puducherry",
    "Jammu and Kashmir",
    "Ladakh",
]

# Mapping Major Cities to States (Inference Fallback)
CITY_STATE_MAP = {
    "mumbai": "Maharashtra",
    "pune": "Maharashtra",
    "nagpur": "Maharashtra",
    "nashik": "Maharashtra",
    "thane": "Maharashtra",
    "delhi": "Delhi",
    "new delhi": "Delhi",
    "bengaluru": "Karnataka",
    "bangalore": "Karnataka",
    "mysore": "Karnataka",
    "mangalore": "Karnataka",
    "hyderabad": "Telangana",
    "secunderabad": "Telangana",
    "warangal": "Telangana",
    "chennai": "Tamil Nadu",
    "coimbatore": "Tamil Nadu",
    "madurai": "Tamil Nadu",
    "salem": "Tamil Nadu",
    "kolkata": "West Bengal",
    "calcutta": "West Bengal",
    "howrah": "West Bengal",
    "durgapur": "West Bengal",
    "ahmedabad": "Gujarat",
    "surat": "Gujarat",
    "vadodara": "Gujarat",
    "rajkot": "Gujarat",
    "jaipur": "Rajasthan",
    "jodhpur": "Rajasthan",
    "udaipur": "Rajasthan",
    "kota": "Rajasthan",
    "lucknow": "Uttar Pradesh",
    "kanpur": "Uttar Pradesh",
    "varanasi": "Uttar Pradesh",
    "agra": "Uttar Pradesh",
    "noida": "Uttar Pradesh",
    "ghaziabad": "Uttar Pradesh",
    "patna": "Bihar",
    "gaya": "Bihar",
    "bhopal": "Madhya Pradesh",
    "indore": "Madhya Pradesh",
    "gwalior": "Madhya Pradesh",
    "chandigarh": "Chandigarh",
    "mohali": "Punjab",
    "ludhiana": "Punjab",
    "amritsar": "Punjab",
    "gurugram": "Haryana",
    "gurgaon": "Haryana",
    "faridabad": "Haryana",
    "panchkula": "Haryana",
    "thiruvananthapuram": "Kerala",
    "kochi": "Kerala",
    "cochin": "Kerala",
    "kozhikode": "Kerala",
    "guwahati": "Assam",
    "bhubaneswar": "Odisha",
    "cuttack": "Odisha",
    "ranchi": "Jharkhand",
    "jamshedpur": "Jharkhand",
    "dehradun": "Uttarakhand",
    "haridwar": "Uttarakhand",
    "shimla": "Himachal Pradesh",
    "panaji": "Goa",
    "raipur": "Chhattisgarh",
    "visakhapatnam": "Andhra Pradesh",
    "vijayawada": "Andhra Pradesh",
    "tirupati": "Andhra Pradesh",
    "jammu": "Jammu and Kashmir",
    "srinagar": "Jammu and Kashmir",
}


class ReferenceDataManager:
    """
    Reads all other JSON files in the data directory to build a knowledge base
    of Cities, States, and Pincodes.
    """

    def __init__(self, data_dir: Path, exclude_file: Path):
        self.data_dir = data_dir
        self.exclude_file = exclude_file
        self.city_state_map = {}
        self.hospital_pin_map = (
            {}
        )  # Key: (normalized_hospital_name, normalized_city) -> Pincode

    def load_references(self):
        logger.info("Building Reference Knowledge Base from existing JSONs...")

        # Find all JSON files ending in "Excluded_Hospitals_List.json"
        files = list(self.data_dir.glob("* Excluded_Hospitals_List.json"))

        count = 0
        for file_path in files:
            # Skip the file we are currently generating to avoid loops
            if file_path.name == self.exclude_file.name:
                continue

            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self._process_file_data(data)
                    count += 1
            except Exception as e:
                logger.warning(f"Could not load reference file {file_path.name}: {e}")

        logger.info(f"Loaded references from {count} files.")
        logger.info(f"Knowledge Base: {len(self.city_state_map)} cities mapped.")

    def _process_file_data(self, data: List[Dict]):
        for item in data:
            city = str(item.get("City", "")).strip()
            state = str(item.get("State", "")).strip()
            pincode = str(item.get("Pin Code", "")).strip()
            name = str(item.get("Hospital Name", "")).strip()

            if not city:
                continue

            # 1. Build City -> State Map
            # We prefer longer state names (e.g. "Maharashtra" over "MH" if inconsistent)
            if state and len(state) > 2:
                # Normalize city key
                city_key = city.lower()
                if city_key not in self.city_state_map:
                    self.city_state_map[city_key] = state

            # 2. Build (Hospital+City) -> Pincode Map
            # This helps if we find the same hospital name in Oriental but missing PIN
            if pincode and name:
                key = (name.lower(), city.lower())
                self.hospital_pin_map[key] = pincode

    def get_state(self, city: str) -> str:
        if not city:
            return ""
        return self.city_state_map.get(city.lower(), "")

    def get_pincode_by_match(self, hospital_name: str, city: str) -> str:
        if not hospital_name or not city:
            return ""
        key = (hospital_name.lower(), city.lower())
        return self.hospital_pin_map.get(key, "")


class DataCleaner:
    """Encapsulates logic for cleaning and enriching hospital data."""

    @staticmethod
    def clean_text(text: Any) -> str:
        """Standardizes text: removes newlines, trims whitespace."""
        if pd.isna(text) or text == "" or str(text).lower() == "nan":
            return ""
        return re.sub(r"\s+", " ", str(text)).strip()

    @staticmethod
    def extract_pincode(text: str) -> str:
        """Finds a 6-digit number in the text string."""
        if not text:
            return ""
        match = re.search(r"\b\d{6}\b", text)
        return match.group(0) if match else ""

    @staticmethod
    def cleanup_address(
        address: str, pincode: str, city: str = None, state: str = None
    ) -> str:
        """
        Removes Pincode, and redundantly listed City/State from the end of the address.
        Example: "Main St, Bangalore, Karnataka - 560001" -> "Main St"
        """
        if not address:
            return ""

        try:
            cleaned = address

            # 1. Remove Pincode (anywhere in string)
            if pincode:
                cleaned = cleaned.replace(pincode, "")

            # Helper to strip a specific word from the END of the string
            def strip_suffix(text, suffix):
                if not suffix:
                    return text
                # Regex: comma(opt) + space(opt) + suffix + space(opt) + end_of_string
                # (?i) = case insensitive match
                pattern = r"(?i)(,\s*)?\b" + re.escape(suffix) + r"\s*$"
                return re.sub(pattern, "", text)

            # 2. Iteratively clean trailing junk and City/State
            # We loop because removing "State" might expose "City" at the end.
            # e.g. "Address, City, State" -> removes State -> "Address, City" -> removes City
            for _ in range(3):
                # First, clean trailing commas, dashes, or spaces left behind by previous steps
                cleaned = re.sub(r"[,\s-]+$", "", cleaned)

                original_len = len(cleaned)

                # Try removing State from the end
                if state:
                    cleaned = strip_suffix(cleaned, state)

                # Try removing City from the end
                if city:
                    cleaned = strip_suffix(cleaned, city)

                # If nothing changed in this pass, we are done
                if len(cleaned) == original_len:
                    break

            return cleaned.strip()

        except Exception as e:
            logger.error(f"Error cleaning address: {e}")
            return address

    @staticmethod
    def correct_state_spelling(state_name: str) -> str:
        """Uses built-in difflib to fix misspelled state names."""
        if not state_name:
            return ""

        # 1. Exact match check (case-insensitive)
        for valid_state in INDIAN_STATES:
            if valid_state.lower() == state_name.lower():
                return valid_state

        # 2. Fuzzy Match using built-in difflib
        # cutoff=0.8 means 80% similarity required
        matches = difflib.get_close_matches(state_name, INDIAN_STATES, n=1, cutoff=0.7)

        if matches:
            return matches[0]
        # Return original if no good match
        return state_name

    @staticmethod
    def infer_state_from_city(city: str) -> str:
        """Returns the State name if the city is a known major city."""
        if not city:
            return ""
        return CITY_STATE_MAP.get(city.lower(), "")

    @staticmethod
    def detect_state_in_text(text: str) -> str:
        """Searches address string for a known State name."""
        search_text = text.lower()
        for state in INDIAN_STATES:
            if state.lower() in search_text:
                return state
        return ""

def delete_excel():
    """Deletes the Excel file if it exists."""
    if EXCEL_FILE.exists():
        try:
            os.remove(EXCEL_FILE)
            logger.info(f"Deleted existing file: {EXCEL_FILE.name}")
        except Exception as e:
            logger.error(f"Error deleting file {EXCEL_FILE.name}: {e}")


def download_file_with_playwright():
    """
    Launches browser, navigates to page, passes WAF, finds the link, and downloads the file.
    """
    delete_excel()
    
    with sync_playwright() as p:
        logger.info("Launching Browser...")
        browser = p.chromium.launch(
            headless=False,
            args=["--disable-blink-features=AutomationControlled", "--start-maximized"],
        )
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            accept_downloads=True,
        )
        context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
        )
        page = context.new_page()

        try:
            logger.info(f"Navigating to {TARGET_URL}...")
            page.goto(TARGET_URL, wait_until="networkidle", timeout=60000)
            time.sleep(10)  # Wait for any dynamic content to load

            # Robust Locator
            link_locator = page.get_by_text(
                re.compile("List of Excluded Providers", re.IGNORECASE)
            )
            if not link_locator.count():
                link_locator = page.locator("a[href*='.xlsx']").filter(
                    has_text="EXCLUDE"
                )

            if not link_locator.count():
                logger.error("Download link not found.")
                return

            link_locator.first.wait_for(state="visible", timeout=30000)

            with page.expect_download() as download_info:
                link_locator.first.click()

            download = download_info.value
            download.save_as(EXCEL_FILE)
            logger.info(f"Saved to {EXCEL_FILE}")
            time.sleep(2)

        except Exception as e:
            logger.error(f"Playwright Error: {e}")
        finally:
            browser.close()


def parse_excel_to_json():
    """
    Reads Excel, extracts hidden fields, cleans data, and saves JSON.
    """
    if not EXCEL_FILE.exists():
        logger.error(f"{EXCEL_FILE.name} file not found. Skipping parsing.")
        return

    # --- 1. Load Reference Data ---
    ref_manager = ReferenceDataManager(DATA_DIR, OUTPUT_JSON_FILE)
    ref_manager.load_references()

    logger.info(f"Reading Excel file: {EXCEL_FILE.name}")
    try:
        # Load Excel, Skip first row (header noise)
        df = pd.read_excel(EXCEL_FILE, skiprows=1)
        df.dropna(how="all", inplace=True)
        # Normalize headers to lowercase for matching
        df.columns = df.columns.astype(str).str.lower().str.strip()

        # Find columns
        def get_col(keywords):
            for col in df.columns:
                if any(k in col for k in keywords):
                    return col
            return None

        col_name = get_col(["provider name", "hospital name", "name of the provider"])
        col_city = get_col(["city", "town", "city/town"])
        col_addr = get_col(["address", "location", "hospital address"])

        if not col_name:
            logger.error("Column 'Hospital Name' not found.")
            return

        data_list = []

        for _, row in df.iterrows():
            # Extract Name
            name = DataCleaner.clean_text(row.get(col_name))
            if not name or col_name in name.lower():
                continue

            raw_address = DataCleaner.clean_text(row.get(col_addr))
            city = DataCleaner.clean_text(row.get(col_city))

            # --- 1. PINCODE EXTRACTION ---
            pincode = DataCleaner.extract_pincode(raw_address)
            # Try lookup from other JSONs (if same hospital name exists)
            if not pincode:
                pincode = ref_manager.get_pincode_by_match(name, city)

            # --- 2. STATE DETECTION & CORRECTION ---
            state = ""

            # A. Try detecting from Address text first
            state = DataCleaner.detect_state_in_text(raw_address)
            # B. If not found, try from Reference Data
            if not state:
                state = ref_manager.get_state(city)
            # C. If not found, try inferring from City
            if not state:
                state = DataCleaner.infer_state_from_city(city)

            # Remove pincode from address
            final_address = DataCleaner.cleanup_address(
                raw_address, pincode, city, state
            )
            if not final_address:
                # Fallback
                if raw_address:
                    final_address = raw_address
                else:
                    final_address = city
            # D. If found, correct spelling using difflib
            if state:
                state = DataCleaner.correct_state_spelling(state)
            logger.info(f"{name} | {state} | {city}")

            record = {
                "Hospital Name": name,
                "Address": final_address,
                "City": city,
                "State": state,
                "Pin Code": pincode,
            }
            data_list.append(record)

        logger.info(f"Extracted {len(data_list)} records.")

        with open(OUTPUT_JSON_FILE, "w", encoding="utf-8") as f:
            json.dump(data_list, f, indent=4, ensure_ascii=False)
        logger.info(f"Successfully saved JSON to {OUTPUT_JSON_FILE}")
        delete_excel()
    except Exception as e:
        logger.error(f"Excel Parsing Error: {e}")


def main():
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)

    # 1. Download excel file
    download_file_with_playwright()

    # 2. Parse
    if EXCEL_FILE.exists():
        parse_excel_to_json()


if __name__ == "__main__":
    main()
