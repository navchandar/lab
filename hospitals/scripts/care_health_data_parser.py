import io
import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse

import pdfplumber
import requests
from bs4 import BeautifulSoup
from requests.exceptions import RequestException

# --- Configuration & Logging Setup ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# --- Project Paths ---
COMPANY = "Care Health"
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"
SOURCE_FILE = DATA_DIR / "sources.json"
OUTPUT_FILENAME = DATA_DIR / (COMPANY + " Excluded_Hospitals_List.json")

# Ensure data directory exists
DATA_DIR.mkdir(parents=True, exist_ok=True)

# --- Constants ---
HEADERS = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    "cache-control": "max-age=0",
    "cookie": "AWSALB=",
    "priority": "u=0, i",
    "sec-ch-ua": '"Google Chrome";v="143", "Not:A-Brand";v="8", "Chromium";v="143"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "referer": "https://www.google.com/",
}

# --- COLUMN MAPPING ---
# The order of valid data columns in the PDF table
COLUMN_ORDER = [
    "Hospital Name",
    "Address_1",
    "Address_2",
    "State",
    "City",
    "Location",
    "Pin Code",
]


def clean_text(text: Any) -> str:
    """Standardizes text: removes newlines, trims whitespace."""
    if not text:
        return ""
    # Replace newlines with space to handle wrapped text in cells
    return str(text).replace("\n", " ").strip()


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
    if not url:
        logger.warning(f"No {url_key} found for {company_name} in sources.json")
    return url


def fetch_url_content(url: str) -> Optional[bytes]:
    try:
        logger.info(f"Downloading PDF from: {url}")
        try:
            response = requests.get(url, headers=HEADERS, timeout=30)
            response.raise_for_status()
        except requests.exceptions.SSLError:
            logger.warning("SSL Error. Retrying with verify=False...")
            requests.packages.urllib3.disable_warnings()
            response = requests.get(url, headers=HEADERS, timeout=30, verify=False)
            response.raise_for_status()
        return response.content
    except RequestException as e:
        logger.error(f"Download failed: {e}")
        return None


def find_pdf_link(base_url: str, html_content: bytes) -> Optional[str]:
    try:
        soup = BeautifulSoup(html_content, "html.parser")
        # Look for PDF links containing 'list' or 'exclude'
        link = soup.find(
            "a",
            href=lambda h: h
            and h.lower().endswith(".pdf")
            and ("list" in h.lower() or "exclude" in h.lower()),
        )
        if link:
            return urljoin(base_url, link["href"])
        return None
    except Exception:
        return None


# --- Core Extraction (Returns List of Lists) ---
def extract_raw_data_from_pdf(pdf_bytes: bytes) -> List[List[str]]:
    """
    Extracts raw rows as lists, skipping header detection
    """
    all_rows = []

    # Strict settings to catch the grid lines
    TABLE_SETTINGS = {
        "vertical_strategy": "lines",
        "horizontal_strategy": "lines",
        "snap_tolerance": 4,
    }

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            logger.info(f"Processing PDF with {len(pdf.pages)} pages...")

            for i, page in enumerate(pdf.pages):
                # Crop Headers/Footers (Top 250px on page 1, 50px on others)
                width = page.width
                height = page.height
                top_crop = 250 if i == 0 else 10

                try:
                    cropped_page = page.crop((0, top_crop, width, height - 10))
                    table = cropped_page.extract_table(TABLE_SETTINGS)
                except ValueError:
                    continue

                if not table:
                    continue

                for row in table:
                    # Quick filter: Remove completely empty rows
                    if not any(row):
                        continue

                    # Flatten formatting (remove newlines in cells)
                    clean_row = [clean_text(cell) for cell in row]

                    # Detect & Skip Header Rows
                    # (If row contains 'HOSPITAL NAME' or 'PINCODE', it's a header)
                    row_str = "".join(clean_row).upper()
                    if "HOSPITALNAME" in row_str and "PINCODE" in row_str:
                        continue

                    all_rows.append(clean_row)

        return all_rows

    except Exception as e:
        logger.error(f"PDF Parsing Error: {e}")
        return []


def fix_detached_last_letter(text: str) -> str:
    """Fixes 'Gurugra m' -> 'Gurugram'."""
    if not text:
        return None
    # Pattern: Word(3+) + Space + Single Letter at end
    return re.sub(r"([A-Za-z]{3,})\s+([A-Za-z]{0,4})$", r"\1\2", text)


def clean_punctuation(text: str) -> str:
    if not text:
        return None
    text = re.sub(r"\s*,[\s,]*", ", ", text)  # Merge commas
    text = re.sub(r"\s+", " ", text)  # Merge spaces
    return text.strip(" ,.-")


# --- Normalization (Maps List Indices -> Dict) ---
def normalize_records(row: List[str], index: int) -> Dict[str, Any]:
    """
    Dynamically maps non-empty row values to keys based on COLUMN_ORDER.
    """
    # 1. Compact: Remove None, empty strings
    clean_values = [clean_text(val) for val in row if val and clean_text(val)]

    # 2. Map: Zip values to our fixed COLUMN_ORDER
    # This automatically assigns the 1st valid text to "Hospital Name", 2nd to "Address_1", etc.
    mapped_data = dict(zip(COLUMN_ORDER, clean_values))

    # 3. Construct Full Address
    addr_parts = []
    if mapped_data.get("Address_1"):
        addr_parts.append(mapped_data["Address_1"])
    if mapped_data.get("Address_2"):
        # exclude if Address_2 is part of any of the partial add_parts
        if not any(mapped_data["Address_2"] in part for part in addr_parts):
            addr_parts.append(mapped_data["Address_2"])
    if mapped_data.get("Location"):
        # exclude if Location is part of any of the partial add_parts
        if not any(mapped_data["Location"] in part for part in addr_parts):
            addr_parts.append(mapped_data["Location"])
    full_address = ", ".join(addr_parts)

    # 4. Fix City
    raw_city = mapped_data.get("City", "")
    clean_city = fix_detached_last_letter(raw_city)

    # 5. Create Final Record
    final_record = {
        "Sr. No.": str(index),
        "Hospital Name": mapped_data.get("Hospital Name", ""),
        "Address": clean_punctuation(full_address),
        "City": clean_city,
        "State": mapped_data.get("State", ""),
        "Pin Code": mapped_data.get("Pin Code", ""),
        "Effective Date": "",
    }

    return cleanup_address_fields(final_record)


def cleanup_address_fields(record: Dict[str, str]) -> Dict[str, str]:
    """Removes City/State from Address if they appear at the end."""
    addr = record.get("Address")
    city = record.get("City")
    state = record.get("State")

    if not addr:
        return record

    def strip_suffix(text, suffix):
        if suffix and text.upper().endswith(suffix.upper()):
            return text[: -len(suffix)]
        return text

    if city:
        addr = strip_suffix(addr, city)
        if len(city) > 4:
            spaced_city = city[:-1] + " " + city[-1]
            addr = strip_suffix(addr, spaced_city)
    if state:
        addr = strip_suffix(addr, state)

    record["Address"] = clean_punctuation(addr)
    return record


def main():
    target_url = get_source_url(COMPANY, "excluded_url")
    if not target_url:
        return

    # 1. Handle PDF
    pdf_content = None
    if target_url.lower().endswith(".pdf"):
        pdf_content = fetch_url_content(target_url)
    else:
        html = fetch_url_content(target_url)
        if html:
            base = f"{urlparse(target_url).scheme}://{urlparse(target_url).netloc}"
            pdf_link = find_pdf_link(base, html)
            if pdf_link:
                pdf_content = fetch_url_content(pdf_link)

    if not pdf_content:
        logger.error("Could not obtain PDF content.")
        return

    # 2. Extract (Now returns List[List])
    raw_data = extract_raw_data_from_pdf(pdf_content)
    logger.info(f"Raw rows extracted: {len(raw_data)}")
    if len(raw_data) > 0:
        logger.info(f"Sample Raw List: {raw_data[0]}")

    # 3. Merge Logic (List-based)
    merged_data = []
    last_row = None

    for row in raw_data:
        # Index 0 corresponds to Hospital Name in our compacted logic
        # But in the raw list (with ghosts), Hospital Name is at index 0
        name_val = row[0] if row else ""

        if name_val and clean_text(name_val):
            # It's a new record
            last_row = row
            merged_data.append(last_row)
        elif last_row:
            # It's a fragment row (e.g. page break continuation).
            # We must merge it into last_row.
            for i, val in enumerate(row):
                val = clean_text(val)
                if not val:
                    continue

                # --- Auto-expand last_row if fragment has columns beyond last_row's length ---
                while len(last_row) <= i:
                    last_row.append("")

                # Merge the text
                current_val = last_row[i]
                if current_val:
                    last_row[i] = (current_val + " " + val).strip()
                else:
                    last_row[i] = val

    logger.info(f"Rows after merging: {len(merged_data)}")

    # 4. Normalize
    cleaned_data = []
    for i, row in enumerate(merged_data, 1):
        cleaned_data.append(normalize_records(row, i))

    if len(cleaned_data) > 0:
        logger.info(f"Sample Cleaned: {cleaned_data[0]}")
    print(json.dumps(cleaned_data, indent=4, ensure_ascii=False))

    # 5. Save
    try:
        with open(OUTPUT_FILENAME, "w", encoding="utf-8") as f:
            json.dump(cleaned_data, f, indent=4, ensure_ascii=False)
        logger.info(f"Saved {len(cleaned_data)} records to {OUTPUT_FILENAME}")
    except Exception as e:
        logger.error(f"Save failed: {e}")


if __name__ == "__main__":
    main()
