import io
import json
import logging
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import pdfplumber
from playwright.sync_api import sync_playwright

# --- Configuration & Logging Setup ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# --- Paths ---
COMPANY = "Aditya Birla"
SCRIPT_DIR = (
    Path(__file__).resolve().parent
    if "__file__" in globals()
    else Path(Path.cwd() / "scripts").resolve()
)
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"
SOURCE_FILE = DATA_DIR / "sources.json"
OUTPUT_FILENAME = DATA_DIR / (COMPANY + " Excluded_Hospitals_List.json")
TEMP_PDF_PATH = DATA_DIR / "aditya_birla_temp.pdf"

# Ensure data directory exists
DATA_DIR.mkdir(parents=True, exist_ok=True)


def clean_text(text: Any) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", str(text)).strip()


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


def download_pdf_via_browser(url) -> bool:
    """
    Navigates to the page, clicks the link, and captures the downloaded file.
    """
    pdf_download = False

    with sync_playwright() as p:
        logger.info(f"Launching browser for {COMPANY}...")
        browser = p.chromium.launch(headless=False)

        # Grant download permissions
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()

        try:
            logger.info(f"Navigating to {url}")
            page.goto(url, timeout=60000, wait_until="domcontentloaded")

            # 1. Locate the Link
            # Using a robust text selector
            link_selector = "text=Click here to view Hospitals not eligible"
            page.wait_for_selector(link_selector, timeout=30000)

            logger.info("Found exclusion link. Waiting for download...")
            # 2. Click & Catch Download
            # This context manager waits for the 'download' event to fire after the click
            with page.expect_download(timeout=60000) as download_info:
                page.click(link_selector)
            download = download_info.value

            # 3. Save to Disk
            logger.info(f"Download started: {download.suggested_filename}")
            download.save_as(TEMP_PDF_PATH)

        except Exception as e:
            logger.error(f"Error during download: {e}")
        finally:
            browser.close()

    if TEMP_PDF_PATH.exists():
        pdf_download = True

    return pdf_download


def parse_pdf_content(pdf_bytes: bytes) -> List[Dict]:
    """
    Extracts table data.
    - Crops Page 1 to remove introductory text.
    - Uses tuned settings to stop word splitting.
    """
    data_list = []
    if not pdf_bytes:
        return data_list

    # 'x_tolerance': Higher value (10-15) prevents splitting "Hospital" into "Hos | pital"
    table_settings = {
        "vertical_strategy": "lines",
        "horizontal_strategy": "lines",
        "snap_tolerance": 4,
    }

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            logger.info(f"Parsing {len(pdf.pages)} pages...")

            for i, page in enumerate(pdf.pages):
                target_page = page

                # Crop Page 1 Header 0 skip the top 25% of the first page to ignore the text
                if i == 0:
                    width = page.width
                    height = page.height
                    # Crop box: (x0, top, x1, bottom)
                    # We start 25% down the page (approx 200 units)
                    target_page = page.crop((0, height * 0.25, width, height))

                tables = target_page.extract_tables(table_settings)

                for table in tables:
                    for row in table:
                        clean_row = [clean_text(cell) for cell in row]

                        if not any(clean_row):
                            continue

                        # Skip Headers
                        if (
                            "PROVIDER" in clean_row[1].upper()
                            or "PINCODE" in clean_row[-1].upper()
                        ):
                            continue

                        # --- MAPPING LOGIC ---
                        # Standard Row: S.No | Name | Address | City | State | Pin

                        # 1Validate Pincode (Crucial Filter)
                        # This filters out any lingering text rows like "expenses incurred..."
                        raw_pin = clean_row[-1]
                        if not (raw_pin.isdigit() and len(raw_pin) == 6):
                            continue

                        pincode = raw_pin
                        state = clean_row[-2] if len(clean_row) >= 2 else ""
                        city = clean_row[-3] if len(clean_row) >= 3 else ""

                        # Handling Name/Address merge issues
                        if len(clean_row) >= 6:
                            # Ideal: [1] Name, [2] Address
                            name = clean_row[1]
                            address = clean_row[2]
                        elif len(clean_row) == 5:
                            # S.No might be merged with Name: [0] "1 Hospital Name"
                            # Or Name merged with Address
                            # Heuristic: Check if col[0] starts with digits
                            if re.match(r"^\d+\s", clean_row[0]):
                                # Split "123 Apollo Hospital"
                                parts = clean_row[0].split(" ", 1)
                                name = parts[1] if len(parts) > 1 else clean_row[0]
                                address = clean_row[1]
                            else:
                                # Assume S.No is missing
                                name = clean_row[0]
                                address = clean_row[1]
                        else:
                            continue

                        record = {
                            "Hospital Name": name,
                            "Address": address,
                            "City": city,
                            "State": state,
                            "Pin Code": pincode,
                        }
                        data_list.append(record)

        return data_list

    except Exception as e:
        logger.error(f"PDF Parsing Error: {e}")
        return []


def main():
    target_url = get_source_url(COMPANY, "excluded_url")
    if not target_url:
        return

    pdf = download_pdf_via_browser(target_url)
    if not pdf:
        logger.error("Download failed.")
        return

    # Read PDF into memory
    pdf_content = None
    with open(TEMP_PDF_PATH, "rb") as f:
        pdf_content = f.read()
    logger.info(f"PDF read: ({len(pdf_content)} bytes).")

    # 2. Parse
    cleaned_data = parse_pdf_content(pdf_content)
    logger.info(f"Extracted {len(cleaned_data)} records.")

    # 3. Save
    if cleaned_data:
        try:
            with open(OUTPUT_FILENAME, "w", encoding="utf-8") as f:
                json.dump(cleaned_data, f, indent=4, ensure_ascii=False)
            logger.info(f"Saved to {OUTPUT_FILENAME}")

            # Clean up temp file if json save successful
            if TEMP_PDF_PATH.exists():
                TEMP_PDF_PATH.unlink()
        except Exception as e:
            logger.error(f"Save failed: {e}")
    else:
        logger.warning("No records extracted.")


if __name__ == "__main__":
    main()
