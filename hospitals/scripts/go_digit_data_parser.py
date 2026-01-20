import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List

from playwright.sync_api import sync_playwright

# --- Configuration & Logging Setup ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# --- Paths ---
COMPANY = "Go Digit"
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

# Resources we don't need to load to get the data
BLOCKED_RESOURCES = ["image", "font", "media", "stylesheet", "other"]


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


def clean_text(text: Any) -> str:
    """Standardizes text: removes newlines, trims whitespace."""
    if not text:
        return ""
    # Replace newlines/tabs with space and strip
    return re.sub(r"\s+", " ", str(text)).strip()


def scrape_godigit_hospitals(target_url) -> List[Dict]:
    """
    Uses Playwright with resource blocking and stealth args.
    """
    with sync_playwright() as p:
        logger.info(f"Launching browser for {COMPANY}...")
        browser = p.chromium.launch(
            headless=True, args=["--disable-blink-features=AutomationControlled"]
        )

        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        # Prevents loading images/fonts
        def route_intercept(route):
            if route.request.resource_type in BLOCKED_RESOURCES:
                route.abort()
            else:
                route.continue_()

        page.route("**/*", route_intercept)

        try:
            logger.info(f"Navigating to {target_url}")
            # Wait until network is idle (no active connections for 500ms)
            # or domcontentloaded to ensure the JS decryption logic has started.
            page.goto(target_url, wait_until="domcontentloaded", timeout=60000)

            logger.info("Waiting for table render...")
            # We wait for the first row to appear.
            # Once <tr> exists, the data is decrypted and rendered.
            page.wait_for_selector("#hospitalTableBody tr", timeout=30000)
            # Using 'textContent' instead of 'innerText' is faster and safer against CSS hiding.
            logger.info("Extracting data from DOM...")
            raw_data = page.evaluate(
                """() => {
                const rows = document.querySelectorAll('#hospitalTableBody tr');
                const results = [];
                
                rows.forEach(row => {
                    const cols = row.querySelectorAll('td');
                    if (cols.length >= 7) {
                        results.push({
                            'Hospital Name': cols[1].textContent,
                            'Address': cols[2].textContent,
                            'City': cols[3].textContent,
                            'State': cols[4].textContent,
                            'Pin Code': cols[5].textContent,
                            'Effective Date': cols[6].textContent
                        });
                    }
                });
                return results;
            }"""
            )

            logger.info(f"Extracted {len(raw_data)} rows.")
            return raw_data

        except Exception as e:
            logger.error(f"Error during scraping: {e}")
            return []
        finally:
            browser.close()


def transform_data(raw_data: List[Dict]) -> List[Dict]:
    """Cleans and standardizes the scraped data."""
    standardized_list = []

    for item in raw_data:
        record = {
            "Hospital Name": clean_text(item.get("Hospital Name")),
            "Address": clean_text(item.get("Address")),
            "City": clean_text(item.get("City")),
            "State": clean_text(item.get("State")),
            "Pin Code": clean_text(item.get("Pin Code")),
            "Effective Date": clean_text(item.get("Effective Date")),
        }

        if record["Hospital Name"]:
            standardized_list.append(record)

    return standardized_list


def main():
    target_url = get_source_url(COMPANY, "excluded_url")
    raw_data = scrape_godigit_hospitals(target_url)

    if not raw_data:
        logger.warning("No data extracted. Check Network or site changes.")
        return

    # Transform/Clean
    clean_data = transform_data(raw_data)

    # Save output json
    try:
        with open(OUTPUT_FILENAME, "w", encoding="utf-8") as f:
            json.dump(clean_data, f, indent=4, ensure_ascii=False)
        logger.info(
            f"Successfully saved {len(clean_data)} records to {OUTPUT_FILENAME}"
        )
    except Exception as e:
        logger.error(f"Error saving file: {e}")


if __name__ == "__main__":
    main()
