import io
import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

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
COMPANY = "Manipal Cigna"
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
# Primary landing page to search for the link
LANDING_URL = "https://www.manipalcigna.com/locate-us"

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
    except Exception as e:
        logger.error(f"Error reading JSON source file: {e}")

    # Fallback to hardcoded landing page if source file misses it
    if not url and url_key == "excluded_url":
        return LANDING_URL

    return url


def get_session() -> requests.Session:
    """Creates a resilient session with retries."""
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
    """Standardizes text: removes newlines, trims whitespace."""
    if not text:
        return ""
    return re.sub(r"\s+", " ", str(text)).strip()


def fetch_pdf_url(session: requests.Session, url: str) -> Optional[str]:
    """
    Scrapes the landing page to find the 'Exception List' or 'Excluded' PDF link.
    """
    logger.info(f"Scraping landing page: {url}")
    try:
        response = session.get(url, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        # Strategy 1: Look for link text containing specific keywords
        # Manipal usually uses "Exception List" or "Excluded"
        target_link = soup.find(
            "a",
            string=lambda t: t
            and ("exception list" in t.lower() or "excluded" in t.lower()),
        )

        # Strategy 2: Fallback to searching hrefs
        if not target_link:
            logger.info("Text search failed. Searching hrefs...")
            links = soup.find_all("a", href=True)
            for link in links:
                href = link["href"].lower()
                # Check for known keywords in the URL itself
                if (
                    "exception-list" in href or "excluded" in href
                ) and ".pdf" not in href:
                    # Manipal links (Liferay) often look like /documents/d/guest/exception-list... without .pdf extension
                    target_link = link
                    break
                elif href.endswith(".pdf") and (
                    "exception" in href or "excluded" in href
                ):
                    target_link = link
                    break

        if target_link:
            relative_url = target_link["href"]
            full_url = urljoin(url, relative_url)
            logger.info(f"Found PDF URL: {full_url}")
            return full_url

        # Fallback hardcoded if dynamic fail (Based on your prompt)
        fallback = "https://www.manipalcigna.com/documents/d/guest/exception-list-for-cashless-n-reimbursement"
        logger.warning(
            f"Could not find link dynamically. Trying known fallback: {fallback}"
        )
        return fallback

    except Exception as e:
        logger.error(f"Error fetching PDF URL: {e}")
        return None


def download_pdf(session: requests.Session, url: str) -> Optional[bytes]:
    logger.info(f"Downloading PDF...")
    try:
        response = session.get(url, timeout=60)
        response.raise_for_status()
        return response.content
    except Exception as e:
        logger.error(f"Download failed: {e}")
        return None


def parse_pdf_content(pdf_bytes: bytes) -> List[Dict]:
    """
    Extracts table data.
    Landscape Table: [Sr | State | City | Hospital Name | Address | Pin Code | Effective From]
    """
    data_list = []

    # Settings for ManipalCigna's Grid
    # They usually have solid lines. We use 'lines' strategy.
    table_settings = {
        "vertical_strategy": "lines",
        "horizontal_strategy": "lines",
        "snap_tolerance": 4,
        "intersection_tolerance": 5,
    }

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            logger.info(f"Parsing {len(pdf.pages)} pages...")

            for i, page in enumerate(pdf.pages):
                # Landscape PDF: pdfplumber handles orientation automatically usually.
                tables = page.extract_tables(table_settings)

                # Fallback to 'text' strategy if 'lines' fails
                if not tables:
                    tables = page.extract_tables(
                        {
                            "vertical_strategy": "text",
                            "horizontal_strategy": "text",
                            "snap_tolerance": 5,
                        }
                    )

                for table in tables:
                    for row in table:
                        clean_row = [clean_text(cell) for cell in row]

                        # Skip Headers
                        row_str = " ".join(clean_row).upper()
                        if "HOSPITAL NAME" in row_str and "PIN" in row_str:
                            continue
                        if not any(clean_row) or len(clean_row) < 3:
                            continue

                        # --- ANCHOR BASED MAPPING ---
                        # Expected: [Sr, State, City, Name, Address, Pin, Date]
                        # We use Pincode (6 digits) as the anchor.

                        pin_idx = -1
                        for idx, cell in enumerate(clean_row):
                            # Strict 6 digit check
                            if re.match(r"^\d{6}$", cell):
                                pin_idx = idx
                                break

                        if pin_idx == -1:
                            # Loose check (contains 6 digits)
                            for idx, cell in enumerate(clean_row):
                                if re.search(r"\d{6}", cell):
                                    pin_idx = idx
                                    break

                        if pin_idx == -1:
                            continue

                        # Extract relative to Pincode
                        pincode = clean_row[pin_idx]

                        # Date is usually after Pin
                        date = (
                            clean_row[pin_idx + 1]
                            if (pin_idx + 1) < len(clean_row)
                            else ""
                        )

                        # Address is before Pin
                        address = clean_row[pin_idx - 1] if (pin_idx - 1) >= 0 else ""

                        # Name is before Address
                        name = clean_row[pin_idx - 2] if (pin_idx - 2) >= 0 else ""

                        # City is before Name
                        city = clean_row[pin_idx - 3] if (pin_idx - 3) >= 0 else ""

                        # State is before City
                        state = clean_row[pin_idx - 4] if (pin_idx - 4) >= 0 else ""

                        # --- Fallback for Merged Columns ---
                        # Sometimes Sr and State merge, or City and Name merge.
                        # If Name is empty, maybe the columns shifted left?
                        if not name and (pin_idx - 2) < 0:
                            # Only have [Name+Addr?, Pin] ?? Unlikely with 6 cols.
                            pass

                        # Validation
                        if name and (pincode.isdigit() or len(pincode) >= 4):
                            # Cleanup Name (remove leading numbers if Sr No merged)
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

    # 1. Fetch Dynamic URL
    target_url = get_source_url(COMPANY, "excluded_url")
    if not target_url:
        target_url = LANDING_URL

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
        logger.warning("No records extracted.")


if __name__ == "__main__":
    main()
