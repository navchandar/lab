import io
import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse

import pandas as pd
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
COMPANY = "HDFC ERGO"
SCRIPT_DIR = (
    Path(__file__).resolve().parent
    if "__file__" in globals()
    else Path(Path.cwd() / "scripts").resolve()
)
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"
SOURCE_FILE = DATA_DIR / "sources.json"
OUTPUT_FILENAME = DATA_DIR / (COMPANY + " Excluded_Hospitals_List.json")

# --- Constants ---
HEADERS_UA = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/91.0.4472.124 Safari/537.36"
    )
}

# --- Header Normalization Map ---
# Standardized Names for Values to extract found in PDFs (case-insensitive).
HEADER_ALIASES = {
    "Sr. No.": ["SR. NO.", "SR NO", "S.NO.", "SL. NO.", "SER. NO."],
    "Hospital Name": [
        "HOSPITAL NAME",
        "PROVIDER NAME",
        "NAME OF HOSPITAL",
        "NAME OF THE PROVIDER",
        "NAME",
    ],
    "Address": ["ADDRESS", "HOSPITAL ADDRESS", "ADDRESS OF THE HOSPITAL"],
    "City": ["CITY", "CITY NAME", "DISTRICT", "TOWN"],
    "State": ["STATE"],
    "Pin Code": ["PIN", "PIN CODE", "PINCODE", "ZIP", "ZIP CODE"],
    "Effective Date": [
        "EFFECTIVE DATE",
        "DATE OF EXCLUSION",
        "DATE",
        "WEF",
        "EXCLUSION DATE",
    ],
}


def clean_text(text: Any) -> str:
    """Standardizes text: removes newlines, trims whitespace, handles None."""
    if not text:
        return ""
    return str(text).replace("\n", " ").strip()


def get_standard_header_name(raw_header: str) -> str:
    """
    Maps a raw header name (e.g., 'PROVIDER NAME') to a standard key (e.g., 'Hospital Name').
    Returns the raw header (normalized) if no alias matches.
    """
    clean_header = clean_text(raw_header).upper()

    for standard_key, aliases in HEADER_ALIASES.items():
        if clean_header in aliases:
            return standard_key

    # If no match found, return a generic cleaned version
    return clean_header.title() if clean_header else "Unknown_Col"


def get_source_url(company_name: str, url_key: str) -> str:
    excluded_url = ""
    try:
        if SOURCE_FILE.exists():
            with open(SOURCE_FILE, "r", encoding="utf-8") as f:
                source_list = json.load(f)
                for i in source_list:
                    if i.get("company") == company_name:
                        excluded_url = i.get(url_key, "")
                        break
        else:
            logger.warning(f"Source file not found at {SOURCE_FILE}")
    except Exception as e:
        logger.error(f"Error reading JSON source file: {e}")
    if not excluded_url:
        logger.warning(f"No {url_key} found for {company_name} in sources.json")
    return excluded_url


def fetch_url_content(url: str) -> Optional[bytes]:
    try:
        logger.info(f"Fetching URL: {url}")
        response = requests.get(url, headers=HEADERS_UA, timeout=30)
        response.raise_for_status()
        return response.content
    except RequestException as e:
        logger.error(f"Network error fetching {url}: {e}")
        return None


def find_pdf_link(
    base_url: str, html_content: bytes, search_keyword: str = "exclude"
) -> Optional[str]:
    try:
        soup = BeautifulSoup(html_content, "html.parser")

        # 1. Search by Text
        link_tag = soup.find(
            "a", string=lambda text: text and search_keyword in text.lower()
        )

        # 2. Search by Href
        if not link_tag:
            logger.info("Keyword not found in text, checking hrefs...")
            link_tag = soup.find(
                "a", href=lambda href: href and search_keyword in href.lower()
            )

        if link_tag and link_tag.get("href"):
            relative_url = link_tag.get("href")
            # Handle full URLs vs relative URLs
            if relative_url.startswith("http"):
                return relative_url
            return urljoin(base_url, relative_url)

        logger.warning(f"No PDF link found for keyword '{search_keyword}'")
        return None

    except Exception as e:
        logger.error(f"Error parsing HTML: {e}")
        return None


# --- Core PDF Processing ---


def extract_raw_data_from_pdf(pdf_bytes: bytes) -> List[Dict[str, Any]]:
    """
    Extracts data using dynamic header mapping.
    """
    all_rows = []
    headers = []

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            logger.info(f"Processing PDF with {len(pdf.pages)} pages...")

            for i, page in enumerate(pdf.pages):
                table = page.extract_table()
                if not table:
                    continue

                # --- Header Detection (Page 0 or First Table) ---
                if i == 0 or not headers:
                    raw_headers = table[0]
                    # Convert raw headers to Standard Keys using our map
                    headers = []
                    for h in raw_headers:
                        std_name = get_standard_header_name(h)
                        # Handle duplicate headers or empty ones by appending index
                        if std_name in headers or not std_name:
                            std_name = f"{std_name}_{len(headers)}"
                        headers.append(std_name)

                    logger.info(f"Detected Standardized Headers: {headers}")
                    data = table[1:]
                else:
                    # Skip repeated header rows on subsequent pages
                    # We check if the current row 0 matches our detected headers (loosely)
                    current_first_row_raw = [clean_text(x) for x in table[0]]
                    # A simplistic check: if "Sr. No." or "Hospital Name" is in the first row
                    if any(
                        x.upper() in ["SR. NO.", "PROVIDER NAME", "HOSPITAL NAME"]
                        for x in current_first_row_raw
                    ):
                        data = table[1:]
                    else:
                        data = table

                # --- Row Extraction ---
                for row in data:
                    if not any(row):  # Skip completely empty rows
                        continue

                    # Handle rows that have more columns than headers (overflow)
                    # We add 'Extra_Col_X' keys for them so data isn't lost
                    current_headers = headers.copy()
                    if len(row) > len(headers):
                        for x in range(len(row) - len(headers)):
                            current_headers.append(f"Extra_Col_{x}")

                    # Handle rows with fewer columns (pad with None)
                    row_data = row + [None] * (len(current_headers) - len(row))

                    # Zip headers with data
                    item = dict(zip(current_headers, row_data))
                    all_rows.append(item)

        return all_rows

    except Exception as e:
        logger.error(f"PDF Processing error: {e}")
        return []


def merge_fragmented_rows(raw_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Merges rows split across lines.
    Relies on 'Sr. No.' being present to identify a 'Fresh' row.
    """
    merged_data = []
    last_valid_row = None

    for row in raw_data:
        # Get Sr. No. using the Standard Key
        sr_no = clean_text(row.get("Sr. No."))

        if sr_no:
            # New Valid Record
            last_valid_row = row
            merged_data.append(last_valid_row)
        else:
            # Fragment Row (No Sr No) -> Merge into previous row
            if last_valid_row:
                fragment_text = []
                # Collect text from all columns except identifier ones
                for key, val in row.items():
                    if val and key not in ["Sr. No.", "Hospital Name"]:
                        fragment_text.append(clean_text(val))

                # Append fragment text to a specific bucket in the parent row
                # We use a special key 'Overflow_Text' to store this soup
                if fragment_text:
                    existing = last_valid_row.get("Overflow_Text", "")
                    last_valid_row["Overflow_Text"] = (
                        existing + " " + " ".join(fragment_text)
                    )

    return merged_data


def fix_detached_last_letter(text: str) -> str:
    """
    Fixes city names like 'AHMEDABA D' -> 'AHMEDABAD' or 'KARIMNAGA R' -> 'KARIMNAGAR'.
    It looks for a word of at least 3 letters followed by a space and a single letter at the end.
    """
    if not text:
        return None
    # Pattern: Word (3+ chars) + Space + Single Letter (End of string)
    # e.g. "NAGA R" -> "NAGAR"
    return re.sub(r"([A-Za-z]{3,})\s+([A-Za-z])$", r"\1\2", text)


def clean_punctuation(text: str) -> str:
    """
    Collapses multiple commas/spaces: 'NOIDA, , , SECTOR 63' -> 'NOIDA, SECTOR 63'
    """
    if not text:
        return None
    # 1. Replace multiple commas/spaces (e.g. ", ," or ",,") with a single comma
    text = re.sub(r"\s*,[\s,]*", ", ", text)
    # 2. Remove double spaces
    text = re.sub(r"\s+", " ", text)
    # 3. Strip leading/trailing punctuation
    return text.strip(" ,.-")


def normalize_records(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Cleans up the record by searching all available text fields for
    misplaced Dates or Pin Codes.
    """
    # 1. Regex Patterns
    date_pattern = re.compile(r"\d{1,2}[-/]\d{1,2}[-/]\d{4}")
    pin_pattern = re.compile(r"\d{6}")
    fused_pin_pattern = re.compile(r"(\d{6})([A-Za-z])")  # e.g. 110001Delhi

    # 2. Gather all text content into a 'Soup'
    # We look at standard keys + any extra/overflow keys created during extraction/merging
    values_soup = []

    # Priority fields to check for misplaced data
    keys_to_check = [
        "Address",
        "City",
        "State",
        "Pin Code",
        "Effective Date",
        "Overflow_Text",
    ]
    # Add any dynamically created extra columns
    keys_to_check += [k for k in record.keys() if k.startswith("Extra_Col")]

    for key in keys_to_check:
        val = record.get(key)
        if val:
            clean_val = clean_text(val)
            # Fix fused pins
            clean_val = fused_pin_pattern.sub(r"\1 \2", clean_val)
            # Remove double spaces
            clean_val = re.sub(r"\s+", " ", clean_val)
            values_soup.append(clean_val)

    # 3. Init Final Record
    final_record = {
        "Sr. No.": clean_text(record.get("Sr. No.")),
        "Hospital Name": clean_text(record.get("Hospital Name")),
        "Address": None,
        "City": None,
        "State": None,
        "Pin Code": None,
        "Effective Date": None,
    }

    # 4. Extract Specific Types (Date, Pin) from the Soup

    # FIND DATE (Search backwards)
    for i in range(len(values_soup) - 1, -1, -1):
        match = date_pattern.search(values_soup[i])
        if match:
            final_record["Effective Date"] = match.group(0)
            # Remove date from soup so it doesn't end up in address
            values_soup[i] = values_soup[i].replace(match.group(0), "").strip()
            if not values_soup[i]:
                values_soup.pop(i)
            break

    # FIND PIN (Search backwards)
    for i in range(len(values_soup) - 1, -1, -1):
        match = pin_pattern.search(values_soup[i])
        if match:
            final_record["Pin Code"] = match.group(0)
            values_soup[i] = values_soup[i].replace(match.group(0), "").strip()
            if not values_soup[i]:
                values_soup.pop(i)
            break

    # --- 5. HEURISTIC ASSIGNMENT ---
    # Apply fix_detached_last_letter immediately when popping values
    if values_soup:
        raw_state = values_soup.pop(-1)
        final_record["State"] = fix_detached_last_letter(raw_state)

    if values_soup:
        raw_city = values_soup.pop(-1)
        final_record["City"] = fix_detached_last_letter(raw_city)

    if values_soup:
        # Everything remaining is Address
        raw_addr = ", ".join(values_soup)
        final_record["Address"] = clean_punctuation(raw_addr)

    # 6. Redundancy Cleanup (Dangling words, repeated City names)
    return cleanup_address_fields(final_record)


def cleanup_address_fields(record: Dict[str, str]) -> Dict[str, str]:
    """
    Removes redundant city/state names from the address field.
    """
    addr = record.get("Address")
    city = record.get("City")
    state = record.get("State")

    if not addr:
        return record

    addr = addr.strip()

    # Helper: Case-insensitive suffix strip
    def strip_suffix(text, suffix):
        if suffix and text.upper().endswith(suffix.upper()):
            return text[: -len(suffix)]
        return text

    # A. Clean State
    if state:
        addr = strip_suffix(addr, state)
        # Abbreviations
        abbrevs = {
            "UTTAR PRADESH": ["U.P.", "UP"],
            "WEST BENGAL": ["W.B.", "WB"],
            "MADHYA PRADESH": ["M.P.", "MP"],
        }
        if state.upper() in abbrevs:
            for abbr in abbrevs[state.upper()]:
                addr = strip_suffix(addr, abbr)

    # B. Clean City
    if city:
        addr = strip_suffix(addr, city)
        # City Aliases
        aliases = {
            "GURUGRAM": ["GURGAON"],
            "BENGALURU": ["BANGALORE"],
            "MUMBAI": ["BOMBAY"],
            "KOLKATA": ["CALCUTTA"],
            "CHENNAI": ["MADRAS"],
            "VARANASI": ["BANARAS"],
        }
        if city.upper() in aliases:
            for alias in aliases[city.upper()]:
                addr = strip_suffix(addr, alias)

        if addr.upper().endswith(city.upper()):
            addr = addr[: -len(city)]

    # C. Clean Dangling Words
    dangling = [
        "NEW",
        "OLD",
        "GREATER",
        "NAVI",
        "OPP",
        "NEAR",
        "DIST",
        "DISTRICT",
        "CITY",
        "NORTH",
        "SOUTH",
        "EAST",
        "WEST",
    ]

    clean_pass = True
    while clean_pass:
        clean_pass = False
        addr_upper = addr.upper()
        for word in dangling:
            if addr_upper.endswith(" " + word):
                addr = addr[: -(len(word) + 1)].strip()
                clean_pass = True
                break
            elif addr_upper.endswith(word):
                addr = addr[: -(len(word))].strip()
                clean_pass = True
                break
            elif addr_upper == word:
                addr = ""
                clean_pass = False
                break

    record["Address"] = clean_punctuation(addr)
    return record


def main():
    target_url = get_source_url(COMPANY, "excluded_url")
    if not target_url:
        logger.error(f"No excluded_url found for {COMPANY} in sources.json")
        return

    # 1. Fetch Landing Page
    html_content = fetch_url_content(target_url)
    if not html_content:
        return

    # 2. Find PDF Link
    base_url = f"{urlparse(target_url).scheme}://{urlparse(target_url).netloc}"
    pdf_url = find_pdf_link(base_url, html_content, search_keyword="exclude")
    if not pdf_url:
        return

    # 3. Download PDF
    pdf_content = fetch_url_content(pdf_url)
    if not pdf_content:
        return

    # 4. Extract (with Dynamic Headers)
    raw_data = extract_raw_data_from_pdf(pdf_content)

    # 5. Merge Fragments
    merged_data = merge_fragmented_rows(raw_data)
    logger.info(f"Rows after merging: {len(merged_data)}")

    # 6. Normalize & Clean
    cleaned_data = [normalize_records(row) for row in merged_data]

    # 7. Save the output
    try:
        with open(OUTPUT_FILENAME, "w", encoding="utf-8") as f:
            json.dump(cleaned_data, f, indent=4, ensure_ascii=False)
        logger.info(
            f"Successfully saved {len(cleaned_data)} records to {OUTPUT_FILENAME}"
        )
    except Exception as e:
        logger.error(f"Error saving JSON: {e}")


if __name__ == "__main__":
    main()
