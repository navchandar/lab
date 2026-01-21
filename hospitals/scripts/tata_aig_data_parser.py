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
COMPANY = "Tata AIG"
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
    Scrapes the landing page to find the 'Excluded Provider' PDF link.
    """
    logger.info(f"Scraping landing page: {url}")
    try:
        response = session.get(url, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        # Strategy 1: Look for link text containing specific keywords
        # The site usually says "Click here to know the list Of Excluded Provider"
        target_link = soup.find("a", string=lambda t: t and "here" in t.lower())

        # Strategy 2: Fallback to searching hrefs for .pdf
        if not target_link:
            logger.info("Text search failed. Searching all PDF links...")
            links = soup.find_all("a", href=True)
            for link in links:
                if link["href"].endswith(".pdf") and "excluded" in link["href"].lower():
                    target_link = link
                    break

        if target_link:
            relative_url = target_link["href"]
            # Ensure absolute URL
            full_url = urljoin(url, relative_url)
            logger.info(f"Found PDF URL: {full_url}")
            return full_url

        logger.error("Could not find the Excluded Provider PDF link on the page.")
        return None

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
    Extracts table data using grid lines and anchor-based mapping.
    """
    data_list = []

    # IMPROVED SETTINGS:
    # Increased tolerances allow detection of lines that are slightly broken or misaligned.
    table_settings = {
        "vertical_strategy": "lines",
        "horizontal_strategy": "lines",
        "snap_tolerance": 5,  # Higher tolerance for snapping lines
        "join_tolerance": 5,  # Joins dashed/broken lines
        "intersection_tolerance": 10,  # For corners that don't touch perfectly
    }

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            logger.info(f"Parsing {len(pdf.pages)} pages...")

            for i, page in enumerate(pdf.pages):
                # Crop header on page 1
                target_page = page
                if i == 0:
                    width = page.width
                    height = page.height
                    target_page = page.crop((0, height * 0.01, width, height))

                tables = target_page.extract_tables(table_settings)

                for table in tables:
                    for row in table:
                        clean_row = [clean_text(cell) for cell in row]

                        # Skip headers/empty rows
                        row_str = " ".join(clean_row).upper()
                        if "PROVIDER" in row_str or "PIN CODE" in row_str:
                            continue

                        # --- ANCHOR BASED MAPPING ---
                        # Instead of relying on index 0, 1, 2... we look for the Pincode.
                        # The PDF structure is: [Sl, Rohini, Name, Addr, City, State, Pin, Date]

                        # 1. Find Pincode Index (It's a 6-digit number usually near the end)
                        pin_idx = -1
                        for idx, cell in enumerate(clean_row):
                            # Check if cell is exactly 6 digits
                            if re.match(r"^\d{6}$", cell):
                                pin_idx = idx
                                break

                        # If no strict 6-digit match, look for something that contains 6 digits
                        if pin_idx == -1:
                            for idx, cell in enumerate(clean_row):
                                if re.search(r"\d{6}", cell):
                                    pin_idx = idx
                                    break

                        if pin_idx == -1:
                            continue  # Skip row if we can't find a Pincode anchor

                        # 2. Extract relative to Pincode
                        # [..., State, Pin, Date]
                        pincode = clean_row[pin_idx]

                        # Date is usually immediately after Pin
                        effective_date = (
                            clean_row[pin_idx + 1]
                            if (pin_idx + 1) < len(clean_row)
                            else ""
                        )

                        # State is immediately before Pin
                        state = clean_row[pin_idx - 1] if (pin_idx - 1) >= 0 else ""

                        # City is before State
                        city = clean_row[pin_idx - 2] if (pin_idx - 2) >= 0 else ""

                        # 3. Extract Name (The trickiest part)
                        # Name is usually at index 2.
                        # But if Sl No and Rohini merged (index 0), Name is at index 1.
                        # Logic: Name is the first *long* text field after the ID columns.

                        # Default assumption:
                        # [0] Sl, [1] Rohini, [2] Name, [3] Address

                        # Let's try to grab Name and Address based on what's left
                        # We know indices 0 to (pin_idx - 3) contain: Sl, Rohini, Name, Address
                        leftover_cells = clean_row[: pin_idx - 2]

                        name = ""
                        address = ""

                        if len(leftover_cells) >= 4:
                            # [Sl, Rohini, Name, Address] -> Ideal
                            name = leftover_cells[2]
                            address = leftover_cells[3]
                        elif len(leftover_cells) == 3:
                            # [Sl+Rohini, Name, Address] OR [Sl, Rohini, Name+Address]??
                            # Usually Name is separate.
                            name = leftover_cells[1]
                            address = leftover_cells[2]
                        elif len(leftover_cells) == 2:
                            # [Sl+Rohini+Name?, Address] -> Bad merge
                            name = leftover_cells[0]  # Fallback
                            address = leftover_cells[1]

                        # Final Cleanup
                        # Sometimes Sl No merges into Name ("45 Dr. Savla")
                        if name and re.match(r"^\d+\s", name):
                            # Only split if it looks like a serial number (1-4 digits)
                            split_name = re.split(r"^\d+\s+", name, maxsplit=1)
                            if len(split_name) > 1:
                                name = split_name[1]

                        if name:
                            data_list.append(
                                {
                                    "Hospital Name": name,
                                    "Address": address,
                                    "City": city,
                                    "State": state,
                                    "Pin Code": pincode,
                                    "Effective Date": effective_date,
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
