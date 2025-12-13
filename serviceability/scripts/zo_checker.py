import json
import logging
import os
import random
import time
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

# --- CONFIGURATION ---
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"

if not DATA_DIR.exists():
    DATA_DIR.mkdir(parents=True)

INPUT_FILE = DATA_DIR / "pincodes_latlng.json"
OUTPUT_FILE = DATA_DIR / "availability_zo.json"
SAVE_INTERVAL = 5

# --- LOCATORS (Centralized) ---
LCTR = {
    # The header button that opens the address modal
    "header_location_btn": 'button[aria-haspopup="dialog"]',
    # The modal that appears
    "address_modal": '[data-testid="address-modal"]',
    # The input box inside the modal
    "search_input": '[data-testid="address-search-input"] input',
    # The dropdown container for results
    "result_container": '[data-testid="address-search-container"]',
    # Individual result items (used for clicking)
    "result_item": '[data-testid="address-search-item"]',
    # "Location Unserviceable" indicators
    "unserviceable_text": [
        "Our team is working",
        "Coming Soon",
        "We’re Coming Soon",
    ],
    # "Serviceable" indicators
    # If the location header updates to contain a number (the pincode), it's a good sign
    "location_header_address": '[data-testid="location-header-address"]',
    # Fallback element that only appears on the main store page (e.g., categories)
    "store_element": '[data-testid="home-page-category-grid"]',
}

# Setup logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger()


def load_json(filename):
    if not os.path.exists(filename):
        return []
    try:
        with open(filename, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Could not read {filename}: {e}")
        return []


def save_json(filename, data):
    try:
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        logger.info("Progress saved.")
    except Exception as e:
        logger.error(f"Could not save {filename}: {e}")


def click(page, selector, timeout=3000):
    """Helper to click safely with a short timeout"""
    try:
        page.wait_for_selector(selector, state="visible", timeout=timeout)
        page.click(selector)
        return True
    except:
        return False


def check_serviceability(page, search_term, is_pincode=True):
    """
    Returns: (status, suggestion_texts)
    status: 1 (Serviceable), 0 (Not Serviceable), None (Error)
    """
    try:
        # 1. Open Address Modal
        if not click(page, LCTR["header_location_btn"]):
            logger.warning("   -> Header button not found. Reloading...")
            refresh_session(page)
            page.wait_for_timeout(2000)
            if not click(page, LCTR["header_location_btn"], timeout=5000):
                logger.error("   -> Failed to open address modal.")
                return None, []

        # 2. Wait for Modal and Input
        try:
            page.wait_for_selector(LCTR["address_modal"], state="visible", timeout=5000)
            page.wait_for_selector(LCTR["search_input"], state="visible", timeout=5000)
        except PlaywrightTimeoutError:
            logger.error("   -> Modal did not open.")
            page.keyboard.press("Escape")
            return None, []

        # Clear and Type
        page.fill(LCTR["search_input"], "")
        page.wait_for_timeout(2000)

        # 3. Search and Wait for Results
        try:
            page.fill(LCTR["search_input"], search_term)
            # page.type(LCTR["search_input"], search_term, delay=100)
            # Wait for at least one result item to appear
            page.wait_for_selector(LCTR["result_item"], timeout=6000)
            time.sleep(1)
        except PlaywrightTimeoutError:
            logger.warning(f"   -> No results found for '{search_term}'")
            page.keyboard.press("Escape")
            return 0, []

        # 4. Extract Suggestions (for deep check)
        suggestion_texts = []
        if is_pincode:
            # Get text from result items
            items = page.locator(LCTR["result_item"]).all()
            for item in items[:5]:  # Check top 5
                txt = item.inner_text().replace("\n", ", ").strip()
                if txt:
                    suggestion_texts.append(txt)

        # 5. Click the First Result
        try:
            # Click the *first* result item found
            page.locator(LCTR["result_item"]).first.click()
        except Exception as e:
            logger.error(f"   -> Failed to click result: {e}")
            page.keyboard.press("Escape")
            return None, []

        # 6. Wait for Serviceability Logic
        # We wait for EITHER the "Unserviceable" text OR the Header to update
        page.wait_for_timeout(2000)  # Give UI a moment to react
        time.sleep(1)
        status = None  # Default to unknown

        # CHECK A: Look for explicit "Unserviceable" signals
        for text_check in LCTR["unserviceable_text"]:
            if page.get_by_text(text_check).is_visible():
                # We found an error message!
                status = 0
                break

        # CHECK B: If no error, look for "Serviceable" signals
        if status is None:
            try:
                # Check if the header address now contains part of our search term (e.g. the pincode)
                # or simply if the modal closed and we see the store
                if page.locator(LCTR["address_modal"]).is_hidden():
                    status = 1
                elif page.locator(LCTR["location_header_address"]).is_visible():
                    status = 1
            except:
                pass

        # cleanup: Ensure modal is closed
        if page.locator(LCTR["address_modal"]).is_visible():
            page.keyboard.press("Escape")
            page.wait_for_timeout(500)

        return status, suggestion_texts

    except Exception as e:
        logger.error(f"   -> Unexpected error checking '{search_term}': {e}")
        # Emergency Cleanup
        try:
            page.keyboard.press("Escape")
            refresh_session(page)
        except:
            pass
        return None, []


def refresh_session(page):
    logger.info("Loading Zepto Homepage...")
    page.goto("https://www.zepto.com/", wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(2000)


def main():
    logger.info("--- Starting Zepto Checker (Playwright) ---")

    input_data = load_json(INPUT_FILE)
    output_data = load_json(OUTPUT_FILE)

    output_map = {entry["pin"]: entry for entry in output_data}
    pending_items = []

    for item in input_data:
        pin = item.get("pin")
        if not pin:
            continue
        if pin not in output_map:
            pending_items.append(item)
        elif "zepto" not in output_map[pin].get("partners", {}):
            pending_items.append(item)

    total_pending = len(pending_items)
    if total_pending == 0:
        logger.info("All pincodes are already updated!")
        return

    logger.info(f"Found {total_pending} pincodes to process.")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,  # Set to True for production
            args=[
                "--window-size=1280,720",
                "--disable-blink-features=AutomationControlled",
            ],
        )
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 720},
        )
        page = context.new_page()
        refresh_session(page)
        updates_buffer = 0

        try:
            for index, item in enumerate(pending_items, 1):
                pin = str(item.get("pin"))
                logger.info(f"[{index}/{total_pending}] Checking PIN: {pin}")

                # 1. Standard Check
                status, suggestions = check_serviceability(page, pin, is_pincode=True)

                # 2. Deep Check (Retry specific addresses if PIN failed)
                if status == 0 and len(suggestions) > 1:
                    logger.info(
                        f"   -> PIN failed. Deep checking {len(suggestions)-1} sub-locations..."
                    )

                    for sub_addr in suggestions[1:]:
                        # Only try addresses that actually contain the pincode we want
                        if pin in sub_addr:
                            logger.info(f"      -> Trying: {sub_addr[:30]}...")
                            sub_status, _ = check_serviceability(
                                page, sub_addr, is_pincode=False
                            )
                            if sub_status == 1:
                                logger.info("      -> Found serviceable sub-location!")
                                status = 1
                                break
                            time.sleep(1)

                # 3. Save Result
                if status is not None:
                    if pin in output_map:
                        entry = output_map[pin]
                        if "partners" not in entry:
                            entry["partners"] = {}
                        entry["partners"]["zepto"] = status
                    else:
                        new_entry = {"pin": pin, "partners": {"zepto": status}}
                        output_data.append(new_entry)
                        output_map[pin] = new_entry

                    result_msg = (
                        "✅ Serviceable" if status == 1 else "❌ Not Serviceable"
                    )
                    logger.info(f"   -> Result: {result_msg}")
                    updates_buffer += 1

                if updates_buffer >= SAVE_INTERVAL:
                    save_json(OUTPUT_FILE, output_data)
                    updates_buffer = 0

                time.sleep(random.uniform(1.0, 2.0))

        except KeyboardInterrupt:
            logger.warning("Interrupted by user! Saving progress...")
        except Exception as e:
            # Catch other random crashes
            logger.error(f"Unexpected crash: {e}")
        finally:
            if updates_buffer > 0:
                save_json(OUTPUT_FILE, output_data)

    logger.info("--- Zepto Checker Completed ---")


if __name__ == "__main__":
    main()
