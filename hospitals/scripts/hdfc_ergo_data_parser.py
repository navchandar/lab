import io
import json
import logging
import re
import urllib.parse
from pathlib import Path
from typing import Any, Dict, List, Optional

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


COMPANY = "HDFC ERGO"
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"
SOURCE_FILE = DATA_DIR / "sources.json"
OUTPUT_FILENAME = DATA_DIR / COMPANY + " Excluded_Hospitals_List.json"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/91.0.4472.124 Safari/537.36"
    )
}


def get_excluded_url(COMPANY):
    excluded_url = ""
    try:
        with open(SOURCE_FILE, "r", encoding="utf-8") as f:
            source_list = json.load(f)
            for i in source_list:
                if i.get("company") == COMPANY:
                    excluded_url = i.get("excluded_url", "")
                    break
    except Exception as e:
        logger.error(f"Error reading JSON: {e}")
    return excluded_url


def fetch_url_content(url: str) -> Optional[bytes]:
    try:
        logger.info(f"Fetching URL: {url}")
        response = requests.get(url, headers=HEADERS, timeout=10)
        response.raise_for_status()
        return response.content
    except RequestException as e:
        logger.error(f"Network error fetching {url}: {e}")
        return None


def find_pdf_link(
    html_content: bytes, search_keyword: str = "exclude"
) -> Optional[str]:
    try:
        soup = BeautifulSoup(html_content, "html.parser")
        link_tag = soup.find(
            "a", string=lambda text: text and search_keyword in text.lower()
        )
        if not link_tag:
            logger.info("Keyword not found in link text, checking href attributes...")
            link_tag = soup.find(
                "a", href=lambda href: href and search_keyword in href.lower()
            )

        if link_tag and link_tag.get("href"):
            relative_url = link_tag.get("href")
            absolute_url = urllib.parse.urljoin(BASE_URL, relative_url)
            logger.info(f"Found PDF Link: {absolute_url}")
            return absolute_url

        logger.warning(f"No link found containing keyword '{search_keyword}'")
        return None

    except Exception as e:
        logger.error(f"Error parsing HTML: {e}")
        return None


def extract_raw_data_from_pdf(pdf_bytes: bytes) -> List[Dict[str, Any]]:
    """
    Extracts raw data to a list of dicts. Note: The columns might be messy here.
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

                # Header Logic
                if i == 0:
                    raw_headers = table[0]
                    # Create generic headers for overflow columns (col_2, col_3)
                    headers = [
                        str(h).replace("\n", " ").strip() if h else f"col_{j}"
                        for j, h in enumerate(raw_headers)
                    ]
                    data = table[1:]
                else:
                    # Skip repeated headers
                    current_first_row = [
                        str(x).replace("\n", " ").strip() if x else "" for x in table[0]
                    ]
                    if current_first_row == headers:
                        data = table[1:]
                    else:
                        data = table

                # Convert rows to Dicts immediately using the detected headers
                for row in data:
                    if not any(row):
                        continue
                    # Pad row if short, truncate if long to match headers
                    row_data = row + [None] * (len(headers) - len(row))
                    item = dict(zip(headers, row_data))
                    all_rows.append(item)

        return all_rows

    except Exception as e:
        logger.error(f"PDF Processing error: {e}")
        return []


def extract_table_from_pdf_bytes(pdf_bytes: bytes) -> pd.DataFrame:
    all_rows: List[List[Any]] = []
    headers: List[str] = []

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            logger.info(f"Processing PDF with {len(pdf.pages)} pages...")

            for i, page in enumerate(pdf.pages):
                table = page.extract_table()
                if not table:
                    continue

                # Header extraction and cleaning
                if i == 0:
                    raw_headers = table[0]
                    # CLEAN HEADERS: Remove newlines and strip whitespace
                    headers = [
                        str(h).replace("\n", " ").strip() if h else f"col_{j}"
                        for j, h in enumerate(raw_headers)
                    ]
                    data = table[1:]
                else:
                    # Skip repeated headers
                    # We check if the first row looks like our clean headers (or the raw version)
                    # Often easier to just check if the row matches the header row
                    current_first_row = [
                        str(x).replace("\n", " ").strip() if x else "" for x in table[0]
                    ]

                    if current_first_row == headers:
                        data = table[1:]
                    else:
                        data = table

                clean_data = [row for row in data if any(row)]
                all_rows.extend(clean_data)

        if not all_rows:
            logger.warning("No table data extracted from PDF.")
            return pd.DataFrame()

        df = pd.DataFrame(all_rows, columns=headers)
        # Clean values: replace newlines inside the data cells
        df = df.replace(r"\n", " ", regex=True)
        return df

    except Exception as e:
        logger.error(f"Error processing PDF: {e}")
        return pd.DataFrame()


def merge_fragmented_rows(raw_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Merges rows that are split across pages or lines.
    If a row has no 'Sr. No.', its data is appended to the previous valid row's 'col_2'
    (or a generic bucket) so that normalize_records can parse it later.
    """
    merged_data = []
    last_valid_row = None

    for row in raw_data:
        # Check if this is a new valid entry (has a Sr. No.)
        sr_no = str(row.get("Sr. No.", "") or "").strip()

        if sr_no:
            # It's a new record
            last_valid_row = row
            merged_data.append(last_valid_row)
        else:
            # It's a fragment (orphan row).
            # Append all its non-empty values to the last valid row's 'col_2'
            # (which acts as our "overflow" bucket for the normalizer).
            if last_valid_row:
                # Collect all text from this fragment row
                fragment_text = []
                for key, val in row.items():
                    if val and key not in ["Sr. No.", "Hospital Name"]:
                        fragment_text.append(str(val).strip())

                # Append this text to col_2 of the parent row so the normalizer sees it
                if fragment_text:
                    existing_col_2 = str(last_valid_row.get("col_2") or "")
                    last_valid_row["col_2"] = (
                        existing_col_2 + " " + " ".join(fragment_text)
                    )

    return merged_data


def normalize_records(record: Dict[str, Any]) -> Dict[str, Any]:
    # --- 1. COMPILE REGEX PATTERNS ---
    date_pattern = re.compile(r"\d{1,2}[-/]\d{1,2}[-/]\d{4}")
    pin_pattern = re.compile(r"\d{6}")
    fused_pin_pattern = re.compile(r"(\d{6})([A-Za-z])")

    # --- 2. GATHER DATA ---
    fields_to_check = [
        "col_2",
        "col_3",
        "col_4",
        "Address",
        "City",
        "State",
        "Pin Code",
        "Effective Date",
    ]

    values_soup = []
    for key in fields_to_check:
        val = record.get(key)
        if val:
            clean_val = str(val).replace("\n", " ").strip()
            # Split fused pincodes: "110094NEW" -> "110094 NEW"
            clean_val = fused_pin_pattern.sub(r"\1 \2", clean_val)
            clean_val = re.sub(r"\s+", " ", clean_val)
            values_soup.append(clean_val)

    # --- 3. RECONSTRUCT RECORD ---
    hospital_name = record.get("Hospital Name", "")
    hospital_name = str(hospital_name).strip().replace("\n", " ")

    final_record = {
        "Sr. No.": record.get("Sr. No."),
        "Hospital Name": hospital_name,
        "Address": None,
        "City": None,
        "State": None,
        "Pin Code": None,
        "Effective Date": None,
    }

    # --- 4. EXTRACT SPECIFIC TYPES ---
    # Find Date
    for i in range(len(values_soup) - 1, -1, -1):
        if date_pattern.search(values_soup[i]):
            found_date = date_pattern.search(values_soup[i]).group(0)
            final_record["Effective Date"] = found_date
            values_soup[i] = values_soup[i].replace(found_date, "").strip()
            if not values_soup[i]:
                values_soup.pop(i)
            break

    # Find Pin Code
    for i in range(len(values_soup) - 1, -1, -1):
        match = re.search(pin_pattern, values_soup[i])
        if match:
            found_pin = match.group(0)
            final_record["Pin Code"] = found_pin
            values_soup[i] = values_soup[i].replace(found_pin, "").strip()
            if not values_soup[i]:
                values_soup.pop(i)
            break

    # --- 5. HEURISTIC ASSIGNMENT ---
    if values_soup:
        final_record["State"] = values_soup.pop(-1)
    if values_soup:
        final_record["City"] = values_soup.pop(-1)
    if values_soup:
        final_record["Address"] = ", ".join(values_soup)

    # --- 6. REDUNDANCY CLEANUP ---
    addr = final_record.get("Address")
    city = final_record.get("City")
    state = final_record.get("State")

    if addr:
        addr = addr.strip()
        addr_upper = addr.upper()

        # Helper: Case-insensitive suffix strip
        def strip_suffix_text(text, suffix):
            if suffix and text.upper().endswith(suffix.upper()):
                return text[: -len(suffix)].strip(" ,-")
            return text

        # A. CLEAN STATE (Official Name + Abbreviations)
        if state:
            # 1. Strip full state name (e.g., "DELHI", "MAHARASHTRA")
            addr = strip_suffix_text(addr, state)

            # 2. Strip common abbreviations (e.g., "NOIDA, U.P." or "KOLKATA, W.B.")
            state_abbrevs = {
                "UTTAR PRADESH": ["U.P.", "UP"],
                "MADHYA PRADESH": ["M.P.", "MP"],
                "WEST BENGAL": ["W.B.", "WB"],
                "HIMACHAL PRADESH": ["H.P.", "HP"],
                "ANDHRA PRADESH": ["A.P.", "AP"],
                "TAMIL NADU": ["T.N.", "TN"],
                "JAMMU AND KASHMIR": ["J&K"],
            }
            if state.upper() in state_abbrevs:
                for abbrev in state_abbrevs[state.upper()]:
                    addr = strip_suffix_text(addr, abbrev)

        # B. CLEAN CITY (Official Name + Common Aliases)
        if city:
            # 1. Strip official city name
            addr = strip_suffix_text(addr, city)

            # 2. Strip common City Aliases/Old Names
            # (e.g., Address has "Gurgaon", but City column is "Gurugram")
            city_aliases = {
                "BENGALURU": ["BANGALORE", "BENGALURU"],
                "GURUGRAM": ["GURGAON", "GURUGRAM"],
                "KOLKATA": ["CALCUTTA"],
                "MUMBAI": ["BOMBAY"],
                "CHENNAI": ["MADRAS", "CHENNAI"],
                "THIRUVANANTHAPURAM": ["TRIVANDRUM", "THIRUVANANTHAPURAM"],
                "KOCHI": ["COCHIN"],
                "PRAYAGRAJ": ["ALLAHABAD"],
                "VARANASI": ["BANARAS", "KASHI"],
                "PATNA": ["PATNA CITY"],
            }
            if city.upper() in city_aliases:
                for alias in city_aliases[city.upper()]:
                    addr = strip_suffix_text(addr, alias)

        # C. CLEAN DANGLING WORDS
        # Removing "Delhi" leaves "New"; Removing "Noida" leaves "Greater".
        # We recursively strip these from the end until clean.
        dangling_words = [
            "NEW",
            "OLD",
            "GREATER",  # Greater Noida
            "NAVI",  # Navi Mumbai
            "NORTH",
            "SOUTH",
            "EAST",
            "WEST",  # North Delhi
            "UPPER",
            "LOWER",
            "DIST",
            "DISTRICT",  # "Patna Dist"
            "CITY",  # "Patna City"
            "OPP",
            "NEAR",
            "BEHIND",  # Location artifacts
        ]

        # Loop to handle cases like "New Delhi" (Strips Delhi -> New -> Done)
        # or "Dist. Patna" (Strips Patna -> Dist -> Done)
        clean_pass = True
        while clean_pass:
            clean_pass = False
            addr_upper = addr.upper()
            for word in dangling_words:
                # Check for "WORD" at end of string
                if addr_upper.endswith(word):
                    addr = addr[: -(len(word) + 1)].strip(" ,-")
                    clean_pass = True  # We made a change, run loop again
                    break  # Restart loop with new string
                # Check if address IS the word (rare)
                elif addr_upper == word:
                    addr = ""
                    clean_pass = False
                    break

        final_record["Address"] = addr

    return final_record


def process_and_save_json(raw_data: List[Dict[str, Any]], filename: str):
    if not raw_data:
        logger.warning("No data to save.")
        return

    logger.info(f"Raw rows extracted: {len(raw_data)}")

    # Step 1: Merge fragmented/split rows
    merged_data = merge_fragmented_rows(raw_data)
    logger.info(f"Rows after merging fragments: {len(merged_data)}")

    # Step 2: Normalize and Clean
    logger.info("Normalizing and fixing shifted data columns...")
    cleaned_data = [normalize_records(row) for row in merged_data]

    try:
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(cleaned_data, f, indent=4, ensure_ascii=False)
        logger.info(
            f"Successfully saved {len(cleaned_data)} cleaned records to '{filename}'"
        )
    except Exception as e:
        logger.error(f"Error saving JSON: {e}")


def main():
    TARGET_PAGE_URL = get_excluded_url(COMPANY)
    # 1. Get Landing Page
    page_content = fetch_url_content(TARGET_PAGE_URL)
    if not page_content:
        return

    # 2. Find PDF Link
    pdf_url = find_pdf_link(page_content, search_keyword="exclude")
    if not pdf_url:
        return

    # 3. Download PDF
    pdf_content = fetch_url_content(pdf_url)
    if not pdf_content:
        return

    # 4. Extract Raw Data from PDF
    raw_data = extract_raw_data_from_pdf(pdf_content)

    # 5. Clean & Save
    process_and_save_json(raw_data, OUTPUT_FILENAME)


if __name__ == "__main__":
    main()
