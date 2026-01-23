import json
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Dict, List, Optional, Set

import googlemaps
import pandas as pd
import requests

# --- CONFIGURATION ---
API_KEY = os.environ.get("GMAPS_API_KEY")
OPENCAGE_KEY = os.environ.get("OPENCAGE_KEY")

# PIN code list source: https://www.data.gov.in/resource/all-india-pincode-directory-till-last-month
INPUT_CSV = Path("data/all_india_pin_code.csv")
OUTPUT_JSON = Path("data/pincodes_latlng.json")

# Batch size for saving (higher is better for speed, lower for safety)
SAVE_BATCH_SIZE = 50
# Max concurrent threads (Keep low to avoid Rate Limit errors)
MAX_WORKERS = 10

# Setup Logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def load_existing_data(filepath: Path) -> List[Dict]:
    """Loads existing JSON data to prevent re-fetching."""
    if filepath.exists():
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError:
            logger.warning("Output file corrupted. Backing up and starting fresh.")
            filepath.rename(filepath.with_suffix(".bak"))
            return []
    return []


def save_data(filepath: Path, data: List[Dict]):
    """Atomic write to temp JSON file to prevent corruption."""
    temp_file = filepath.with_suffix(".tmp")
    try:
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        temp_file.replace(filepath)
        logger.info(f"Checkpoint saved. Total records: {len(data)}")
    except Exception as e:
        logger.error(f"Failed to save data: {e}")


def process_single_pincode(row, gmaps_client) -> Optional[Dict]:
    """
    Worker function to fetch data for a single pincode.
    Priority: Google Maps -> OpenCage -> Input CSV (Government Data)
    """
    pincode = str(row["pincode"]).strip()
    district = str(row.get("Districtname", "")).strip()

    # --- STRATEGY 1: Google Maps Component Filtering ---
    try:
        results = gmaps_client.geocode(
            components={"postal_code": pincode, "country": "IN"}
        )
        if results:
            res = results[0]
            if "postal_code" in res.get("types", []):
                geom = res["geometry"]["location"]
                return {
                    "pin": pincode,
                    "lat": round(geom["lat"], 7),
                    "lng": round(geom["lng"], 7),
                    "accuracy": res["geometry"]["location_type"],
                    "place_id": res.get("place_id", ""),
                    "address": res.get("formatted_address", ""),
                }
    except Exception as e:
        logger.error(f"GMaps Error {pincode}: {e}")

    # --- STRATEGY 2: OpenCage Fallback ---
    if OPENCAGE_KEY:
        try:
            query = f"{pincode}, {district}, India"
            url = "https://www.gps-coordinates.net/geoproxy"
            params = {
                "q": query,
                "key": OPENCAGE_KEY,
                "no_annotations": 1,
                "language": "en",
            }

            resp = requests.get(url, params=params, timeout=5)
            data = resp.json()

            if data.get("results"):
                res = data["results"][0]
                if pincode in res.get("formatted", ""):
                    return {
                        "pin": pincode,
                        "lat": round(res["geometry"]["lat"], 7),
                        "lng": round(res["geometry"]["lng"], 7),
                        "accuracy": "APPROXIMATE",  # no such type here
                        "place_id": "",
                        "address": res.get("formatted", ""),
                    }
        except Exception as e:
            logger.error(f"OpenCage Error {pincode}: {e}")

    # --- STRATEGY 3: CSV / Government Data Fallback ---
    # If APIs failed, check if we already have the data in the input row
    try:
        raw_lat = row.get("latitude", "")
        raw_lng = row.get("longitude", "")

        # Simple validation: ensure they are not empty, None, or "NA"
        if raw_lat and raw_lng and str(raw_lat).lower() != "na":
            lat_float = float(raw_lat)
            lng_float = float(raw_lng)

            # Ensure not 0.0 (common placeholder in gov data)
            if lat_float != 0 and lng_float != 0:
                return {
                    "pin": pincode,
                    "lat": lat_float,
                    "lng": lng_float,
                    "accuracy": "APPROXIMATE",  # post office location
                    "place_id": "",
                    "address": f"{row.get('officename', '')}, {district}, {row.get('statename', '')}",
                }

    except ValueError:
        # Conversion failed, just ignore
        pass
    except Exception as e:
        logger.error(f"CSV Fallback Error {pincode}: {e}")

    return None


def main():
    if not API_KEY:
        logger.error("GMAPS_API_KEY environment variable not set.")
        return
    if not INPUT_CSV.exists():
        logger.error(f"Input CSV file not found: {INPUT_CSV}")
        return

    # Load Input Data
    logger.info("Loading CSV...")
    df = pd.read_csv(INPUT_CSV, encoding="cp1252")
    df.replace(["NA", "na", "NaN"], "", inplace=True)
    df.fillna("", inplace=True)
    df["pincode"] = df["pincode"].astype(str)

    # Deduplicate input pincodes
    unique_rows = df.drop_duplicates(subset=["pincode"])
    logger.info(f"Number of unique pincodes found: {len(unique_rows)}")

    # Load Existing Progress from JSON file
    results = load_existing_data(OUTPUT_JSON)
    processed_pins = {item["pin"] for item in results}

    # Filter out already processed rows
    to_process = unique_rows[~unique_rows["pincode"].isin(processed_pins)]
    logger.info(
        f"Total Unique: {len(unique_rows)} | Already Done: {len(processed_pins)} | To Do: {len(to_process)}"
    )

    if to_process.empty:
        logger.info("Nothing to do!")
        return

    gmaps = googlemaps.Client(key=API_KEY)

    # 3. Parallel Processing
    new_results = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        # Submit all tasks
        future_to_pin = {
            executor.submit(process_single_pincode, row, gmaps): row["pincode"]
            for _, row in to_process.iterrows()
        }

        for i, future in enumerate(as_completed(future_to_pin)):
            pin = future_to_pin[future]
            try:
                data = future.result()
                if data:
                    results.append(data)
                    new_results.append(data)
                    # Logs progress
                    if i % 50 == 0:
                        msg = f"Progress: {i}/{len(to_process)} | Last found: {pin}"
                        logger.info(msg)
                else:
                    # Log failures so you can retry them specifically later
                    logger.warning(f"⚠️ No data found for PIN: {pin}")
            except Exception as exc:
                logger.error(f"Unhandled exception for PIN: {pin}: {exc}")

            # Incremental Save
            if len(new_results) >= SAVE_BATCH_SIZE:
                save_data(OUTPUT_JSON, results)
                new_results = []  # Clear buffer

    # Final Save
    save_data(OUTPUT_JSON, results)
    logger.info("✅ Job Complete.")


if __name__ == "__main__":
    main()
