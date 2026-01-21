import io
import json
import logging
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import pdfplumber
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
COMPANY = "SBI General"
SCRIPT_DIR = (
    Path(__file__).resolve().parent
    if "__file__" in globals()
    else Path(Path.cwd() / "scripts").resolve()
)
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"
SOURCE_FILE = DATA_DIR / "sources.json"
OUTPUT_FILENAME = DATA_DIR / (COMPANY + " Excluded_Hospitals_List.json")

# Ensure data directory exists
DATA_DIR.mkdir(parents=True, exist_ok=True)

# --- Constants ---
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
}


def get_source_url(company_name: str, url_key: str) -> str:
    url = ""
    try:
        if SOURCE_FILE.exists():
            with open(SOURCE_FILE, "r", encoding="utf-8") as f:
                source_list = json.load(f)
                for i in source_list:
                    if i.get("company") == company_name:
                        url = i.get(url_key, "")
                        break
        else:
            logger.warning(f"Source file not found at {SOURCE_FILE}")
    except Exception as e:
        logger.error(f"Error reading JSON source file: {e}")
    if not url:
        logger.warning(f"No {url_key} found for {company_name} in sources.json")
    return url


def get_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(HEADERS)
    retries = Retry(total=3, backoff_factor=1, status_forcelist=[500, 502, 503, 504])
    session.mount("https://", HTTPAdapter(max_retries=retries))
    return session


def clean_text(text: Any) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", str(text)).strip()


def fetch_pdf_url(session: requests.Session, url:str) -> Optional[str]:
    """
    Parses the landing page to find the PDF link for Excluded Hospitals.
    """
    logger.info(f"Fetching landing page: {url}")
    try:
        response = session.get(url, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        # find script with id="__NEXT_DATA__"
        json_data = soup.find("script", id="__NEXT_DATA__")
        if json_data:
            json_dict = json.loads(json_data.string)
            h_list = json_dict["props"]["pageProps"].get("relatedData", [])
            if h_list:
                for item in h_list:
                    if item.get("key", "") == "locateHospital":
                        r_data = item.get("Related_Data", [])
                        for r_item in r_data:
                            if r_item.get("label", "") == "blacklistedHospitals":
                                url = r_item.get("file_url", "")
                                if url:
                                    if "content.sbigeneral.in" not in url:
                                        url = (
                                            "https://content.sbigeneral.in/"
                                            + url.lstrip("/")
                                        )
                                    logger.info(f"Found PDF URL from JSON data: {url}")
                                    return url

        # SBI General usually puts this in an <a> tag with text containing "Excluded"
        # Search strategy 1: Link text
        target_link = soup.find(
            "a",
            string=lambda t: t and "excluded" in t.lower() and "hospital" in t.lower(),
        )

        # Search strategy 2: HREF contains .pdf and text/parent contains context
        if not target_link:
            logger.info("Strategy 1 failed. Trying HREF search...")
            all_links = soup.find_all("a", href=True)
            for link in all_links:
                href = link["href"]
                text = link.get_text().lower()
                if href.endswith(".pdf") and (
                    "excluded" in text or "list of hospitals" in text
                ):
                    target_link = link
                    break

        if target_link:
            url = target_link["href"]
            # Handle relative URLs
            if not url.startswith("http"):
                # SBI sometimes uses relative paths like /uploads/...
                if url.startswith("/"):
                    url = f"https://www.sbigeneral.in{url}"
                # Or content CDN paths
                elif url.startswith("uploads/"):
                    url = f"https://content.sbigeneral.in/{url}"

            # Correction: User observed https://content.sbigeneral.in/uploads/...
            if "content.sbigeneral.in" not in url and "/uploads/" in url:
                url = url.replace(
                    "https://www.sbigeneral.in/uploads/",
                    "https://content.sbigeneral.in/uploads/",
                )

            logger.info(f"Found PDF URL: {url}")
            return url

        logger.warning("Could not find 'Excluded Hospitals' link in HTML.")
        return None

    except Exception as e:
        logger.error(f"Error finding PDF URL: {e}")
        return None


def download_pdf(session: requests.Session, url: str) -> Optional[bytes]:
    logger.info(f"Downloading PDF from {url}...")
    try:
        response = session.get(url, timeout=60)
        response.raise_for_status()
        return response.content
    except Exception as e:
        logger.error(f"Download failed: {e}")
        return None


def parse_pdf_content(pdf_bytes: bytes) -> List[Dict]:
    """
    Extracts table data from SBI General PDF using Grid Lines.
    Fixes issues with multi-line rows and column shifting.
    """
    data_list = []

    # SETTING 1: Strict Grid Extraction
    # We use "lines" because your PDF image shows clear black borders.
    # This prevents 'Vedanayagam Hospi' from splitting into two columns.
    table_settings = {
        "vertical_strategy": "lines",
        "horizontal_strategy": "lines",
        "snap_tolerance": 4,  # Snaps lines that almost touch
        "join_tolerance": 4,  # Joins broken lines
        "intersection_tolerance": 4,
    }

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            logger.info(f"Parsing {len(pdf.pages)} pages...")

            for i, page in enumerate(pdf.pages):
                # Extract tables using the grid
                tables = page.extract_tables(table_settings)

                # FALLBACK: If "lines" fails (e.g., invisible borders), try "text" with loose tolerance
                if not tables:
                    logger.info(
                        f"Page {i+1}: No grid lines found, switching to text analysis."
                    )
                    tables = page.extract_tables(
                        {
                            "vertical_strategy": "text",
                            "horizontal_strategy": "text",
                            "snap_tolerance": 3,
                            "x_tolerance": 20,  # Higher tolerance to ignore spaces inside names
                        }
                    )

                for table in tables:
                    for i, row in enumerate(table):
                        # 1. Clean the row (removes newlines inside cells)
                        clean_row = [clean_text(cell) for cell in row]

                        # 2. Skip empty/short rows
                        # We need at least Name, City, Pincode
                        if not any(clean_row) or len(clean_row) < 3:
                            continue

                        # 3. Skip Header Rows
                        row_str = " ".join(clean_row).upper()
                        if "HOSPITAL" in row_str and "PINCODE" in row_str:
                            continue
                        if "SR" in clean_row[0].upper() or "NO" in clean_row[0].upper():
                            continue

                        # 4. Map Columns
                        # Your PDF columns: [Sr.No, Name, Address, City, Pincode, State]
                        # Sometimes Address is split or Pincode/State swapped.

                        # Initialize
                        name = ""
                        address = ""
                        city = ""
                        pincode = ""
                        state = ""

                        # Robust Mapping Logic
                        if len(clean_row) >= 6:
                            # Standard Case: 0:Sr, 1:Name, 2:Addr, 3:City, 4:Pin, 5:State
                            # Note: Your screenshot shows Pin (600088) then State (Tamil Nadu)
                            name = clean_row[1]
                            address = clean_row[2]
                            city = clean_row[3]
                            pincode = clean_row[4]
                            state = clean_row[5]

                        elif len(clean_row) == 5:
                            # Case: Sr.No might be merged into Name
                            # Check if first col starts with number
                            if re.match(r"^\d+$", clean_row[0]):
                                # 0:Sr, 1:Name, 2:Addr, 3:City+Pin?? -> Likely malformed
                                # Let's trust the end of the list
                                state = clean_row[-1]
                                pincode = clean_row[-2]
                                city = clean_row[-3]
                                address = clean_row[1]  # Guess
                                name = clean_row[1]  # Fallback
                            else:
                                # 0:Name (Sr merged), 1:Addr, 2:City, 3:Pin, 4:State
                                name = clean_row[0]
                                address = clean_row[1]
                                city = clean_row[2]
                                pincode = clean_row[3]
                                state = clean_row[4]

                        # 5. Fix "Column Shift" (Pincode validation)
                        if i == 1:
                            # sometimes PIN in first row has strings to be removed and get only digits
                            pincode = re.sub(r"\D", "", pincode)
                        # Sometimes City/State get mixed. Pincode is the anchor.
                        # If Pincode column is not digit, maybe it shifted to 'State' column?
                        if not (pincode.isdigit() and len(pincode) == 6):
                            if state.isdigit() and len(state) == 6:
                                # Swap them: Data was [..., City, State, Pin] instead of [..., City, Pin, State]
                                temp = pincode
                                pincode = state
                                state = temp
                            elif city.isdigit() and len(city) == 6:
                                # Shift right: Data was [..., Pin, State, Blank]
                                state = pincode
                                pincode = city
                                city = (
                                    address  # Risky guess, but better than losing data
                                )

                        # 6. Final Clean & Save
                        if name and pincode.isdigit() and len(pincode) == 6:
                            # Remove Sr No if it stuck to the name (e.g. "40 Sp Medical")
                            name = re.sub(r"^\d+\s+", "", name)

                            data_list.append(
                                {
                                    "Hospital Name": name,
                                    "Address": address,
                                    "City": city,
                                    "State": state,
                                    "Pin Code": pincode,
                                }
                            )

        return data_list

    except Exception as e:
        logger.error(f"PDF Parsing Error: {e}")
        return []


def main():
    session = get_session()

    # 1. Get URL
    target_url = get_source_url(COMPANY, "excluded_url")
    pdf_url = fetch_pdf_url(session, target_url)
    if not pdf_url:
        return

    # 2. Download
    pdf_content = download_pdf(session, pdf_url)
    if not pdf_content:
        return

    # 3. Parse
    cleaned_data = parse_pdf_content(pdf_content)
    logger.info(f"Extracted {len(cleaned_data)} records.")

    # 4. Save
    if cleaned_data:
        try:
            with open(OUTPUT_FILENAME, "w", encoding="utf-8") as f:
                json.dump(cleaned_data, f, indent=4, ensure_ascii=False)
            logger.info(f"Saved to {OUTPUT_FILENAME}")
        except Exception as e:
            logger.error(f"Save failed: {e}")
    else:
        logger.warning("No valid records found in PDF.")


if __name__ == "__main__":
    main()
