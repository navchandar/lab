import asyncio
import json
import logging
import os
import random
import time
from pathlib import Path

from fake_useragent import UserAgent
from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from playwright.async_api import async_playwright

# --- CONFIGURATION ---
SCRIPT_DIR = (
    Path(__file__).resolve().parent
    if "__file__" in globals()
    else Path(Path.cwd() / "scripts").resolve()
)
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"

if not DATA_DIR.exists():
    DATA_DIR.mkdir(parents=True)

INPUT_FILE = DATA_DIR / "pincodes_latlng.json"
OUTPUT_FILE = DATA_DIR / "availability_zo.json"
SAVE_INTERVAL = 10
MAX_RETRIES = 2
MAX_CONCURRENT_TABS = 2
HEADLESS = True  # Set to True to run in headless mode (no window)

# --- LOCATORS ---
LCTR = {
    "header_location_btn": 'button[aria-haspopup="dialog"]',
    "address_modal": '[data-testid="address-modal"]',
    "search_input": '[data-testid="address-search-input"] input',
    "result_item": '[data-testid="address-search-item"]',
    "suggestions": '[data-testid="address-search-item"] span[class *= "line-clamp"]',
    "first_result": '[data-testid="address-search-item"]:nth-child(1) div[data-size]:nth-child(1)',
    "delivery": '[data-testid="delivery-time"]',
}

# Setup Logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger()
ua_generator = UserAgent(os=["Windows"], platforms=["desktop"])


# --- FILE OPERATIONS ---
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


async def get_browser_context(browser):
    """Creates a browser context with stealth configurations"""
    user_agent = ua_generator.random
    context = await browser.new_context(
        user_agent=user_agent,
        viewport={"width": 1366, "height": 768},
        locale="en-IN",
        timezone_id="Asia/Kolkata",
        permissions=["geolocation"],
        # Mocking geolocation to India to avoid region locks
        geolocation={"latitude": 19.0760, "longitude": 72.8777},
        java_script_enabled=True,
    )

    # --- BLOCK IMAGES & FONTS ---
    # We intercept all requests ('**/*') and check their type.
    async def route_handler(route):
        if route.request.resource_type in ["image", "media", "font"]:
            await route.abort()
        else:
            await route.continue_()

    # Apply the blocking rule to the entire context
    await context.route("**/*", route_handler)

    # Init script to hide webdriver property
    await context.add_init_script(
        """
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });
    """
    )
    return context


async def check_pincode_worker(context, pincode, retries=0, is_pincode=True):
    """
    Worker function to check a single pincode.
    Returns: 1 (Serviceable), 0 (Not Serviceable), None (Error)
    """
    page = await context.new_page()
    status = None

    try:
        # Go to Zepto
        await page.goto(
            "https://www.zepto.com/", wait_until="domcontentloaded", timeout=30000
        )

        # Click Location Button
        try:
            await page.wait_for_selector(
                LCTR["header_location_btn"], state="visible", timeout=5000
            )
            await page.click(LCTR["header_location_btn"])
        except:
            # If button not found, we might already be in a session or stuck
            if retries < MAX_RETRIES:
                logger.warning(f"[{pincode}] Header button missing. Retrying...")
                await page.close()
                return await check_pincode_worker(context, pincode, retries + 1)
            logger.warning(f"[{pincode}] Header button missing.")
            return None

        # Wait for Modal
        await page.wait_for_selector(
            LCTR["search_input"], state="visible", timeout=5000
        )
        # Type Pincode
        await page.fill(LCTR["search_input"], "")
        await page.fill(LCTR["search_input"], str(pincode), timeout=5000)

        try:
            # Wait for results
            await page.wait_for_selector(LCTR["result_item"], timeout=6000)
        except PlaywrightTimeoutError:
            logger.warning(f"[{pincode}] No address results found.")
            await page.close()
            # Treat as unserviceable if Zepto doesn't recognize the pin
            return 0

        # 4. Extract Suggestions (for deep check)
        suggestion_texts = []
        if is_pincode:
            # Get text from result items
            items = await page.locator(LCTR["suggestions"]).all()
            if items:
                for item in items[:5]:  # Check top 5
                    txt = await item.inner_text()
                    if txt:
                        txt = txt.replace("\n", " ").strip()
                        if txt and txt not in suggestion_texts:
                            suggestion_texts.append(txt)

        first_address = ""
        try:
            # Click the *first* result item found
            first_address = await page.locator(LCTR["first_result"]).inner_text()
            logger.info(f"Clicking on: {first_address.strip()}")
            await page.locator(LCTR["first_result"]).hover()
            time.sleep(random.uniform(0.5, 1.0))
            await page.locator(LCTR["first_result"]).click()
            time.sleep(random.uniform(2.0, 3.0))
        except Exception as e:
            logger.error(f"   -> Failed to click result: {e}")
            await page.keyboard.press("Escape")
            return None, []

        await page.wait_for_timeout(2000)  # Give UI a moment to react
        time.sleep(1)

        # Look for the "Working on it" text immediately
        if (
            await page.get_by_text("team is working").is_visible()
            or await page.get_by_text("Coming Soon").is_visible()
        ):
            status = 0
        elif await page.locator(LCTR["delivery"]).is_visible():
            status = 1
        else:
            logger.warning(f"[{pincode}] Delivery info not found.")
            status = None

        if status != 1 and is_pincode and suggestion_texts:
            for suggestion in suggestion_texts:
                if pincode in suggestion and suggestion != first_address:
                    logger.info(f"[{pincode}] Trying suggestion: {suggestion}")
                    status = await check_pincode_worker(
                        context, suggestion, retries, False
                    )
                    if status == 1:
                        break
    except Exception as e:
        logger.error(f"[{pincode}] Error: {str(e)[:50]}")
        if retries < MAX_RETRIES:
            await page.close()
            return await check_pincode_worker(context, pincode, retries + 1)
        return None
    finally:
        await page.close()

    return status


async def main():
    logger.info("--- Starting Zepto Checker ---")

    input_data = load_json(INPUT_FILE)
    output_data = load_json(OUTPUT_FILE)
    output_map = {entry["pin"]: entry for entry in output_data}

    # Filter pending items
    pending_items = []
    for item in input_data:
        pin = str(item.get("pin"))
        if not pin:
            continue
        if pin not in output_map or "zepto" not in output_map[pin].get("partners", {}):
            pending_items.append(item)

    total_pending = len(pending_items)
    if total_pending == 0:
        logger.info("All pincodes are already updated!")
        return

    logger.info(f"Processing {total_pending} pincodes with {MAX_CONCURRENT_TABS} tabs.")

    async with async_playwright() as p:
        # Launch Browser
        browser = await p.chromium.launch(
            headless=HEADLESS,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-infobars",
                "--window-position=0,0",
                "--ignore-certificate-errors",
                "--ignore-certificate-errors-spki-list",
            ],
        )

        sem = asyncio.Semaphore(MAX_CONCURRENT_TABS)

        async def sem_task(item):
            async with sem:
                pin = str(item.get("pin"))
                context = await get_browser_context(browser)
                logger.info(f"Checking {pin}")
                status = await check_pincode_worker(context, pin)
                await context.close()
                if status is not None:
                    return {"pin": pin, "status": status}
                return None

        # Convert coroutines to Task objects immediately so we can track and cancel them later.
        tasks = [asyncio.create_task(sem_task(item)) for item in pending_items]
        updates_buffer = 0

        try:
            for future in asyncio.as_completed(tasks):
                # asyncio.as_completed yields futures as they finish
                result = await future
                updates_buffer += 1

                if result:
                    pin = result["pin"]
                    status = result["status"]

                    if pin in output_map:
                        if "partners" not in output_map[pin]:
                            output_map[pin]["partners"] = {}
                        output_map[pin]["partners"]["zepto"] = status
                    else:
                        new_entry = {"pin": pin, "partners": {"zepto": status}}
                        output_data.append(new_entry)
                        output_map[pin] = new_entry

                    result_msg = (
                        "✅ Serviceable" if status == 1 else "❌ Not Serviceable"
                    )
                    logger.info(f"   -> {updates_buffer} Result: {result_msg}")

                # Save periodically
                if updates_buffer % SAVE_INTERVAL == 0:
                    save_json(OUTPUT_FILE, output_data)

        except KeyboardInterrupt:
            logger.warning("Interrupted by user! Stopping gracefully...")
            # Cancel all tasks that are still running
            logger.info("Cancelling pending tasks...")
            for task in tasks:
                if not task.done():
                    task.cancel()

            # Wait a moment for cancellations to process (suppress errors)
            await asyncio.gather(*tasks, return_exceptions=True)

        finally:
            logger.info("Saving final progress...")
            save_json(OUTPUT_FILE, output_data)

    logger.info("--- Zepto Checker Completed ---")


if __name__ == "__main__":
    asyncio.run(main())
