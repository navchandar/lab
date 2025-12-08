import json
import logging
import os
import time
from pathlib import Path
from typing import Dict, List, Optional, Set

import googlemaps
import pandas as pd
import requests

# CONFIGURATION
API_KEY = os.environ.get("GMAPS_API_KEY")
OPENCAGE_KEY = os.environ.get("OPENCAGE_KEY")

INPUT_CSV = Path("data/all_india_pin_code.csv")
OUTPUT_JSON = Path("data/pincodes_latlng.json")
# Save JSON to disk after every X new records
SAVE_BATCH_SIZE = 10

# Setup Logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def load_existing_data(filepath: Path) -> List[Dict]:
    """Loads existing JSON data to prevent re-fetching and allow resuming."""
    if filepath.exists():
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError:
            logger.warning("Output file exists but is corrupted. Starting fresh.")
            return []
    return []


def save_data(filepath: Path, data: List[Dict]):
    """Writes the current list of results to JSON."""
    temp_file = filepath.with_suffix(".tmp")
    try:
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        # Atomic write: rename temp file to actual file to prevent corruption on crash
        temp_file.replace(filepath)
        logger.info(f"Checkpoint saved. Total records: {len(data)}")
    except Exception as e:
        logger.error(f"Failed to save data: {e}")


def call_opencage_api(query: str) -> Optional[Dict]:
    """Fallback: Calls the OpenCage proxy API."""
    url = "https://www.gps-coordinates.net/geoproxy"
    params = {"q": query, "key": OPENCAGE_KEY, "no_annotations": 1, "language": "en"}
    try:
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        if data.get("results"):
            return data["results"][0]
        return None
    except Exception as e:
        logger.error(f"OpenCage API Error for {query}: {e}")
        return None


def call_geocode_api(client, address: str) -> Optional[Dict]:
    """Handles the raw API call."""
    try:
        results = client.geocode(address)
        return results[0] if results else None
    except Exception as e:
        logger.error(f"API Error for {address}: {e}")
        return None


def extract_opencage_fields(raw_result: Dict, pincode: str) -> Dict:
    """Normalizes OpenCage data to match our Google Maps schema."""
    geom = raw_result.get("geometry", {})
    confidence = raw_result.get("confidence", 0)
    # Map OpenCage 1-10 scale to Google's string format
    if confidence >= 9:
        accuracy = "ROOFTOP"
    elif confidence == 8:
        accuracy = "RANGE_INTERPOLATED"
    elif confidence >= 5:
        accuracy = "GEOMETRIC_CENTER"
    else:
        accuracy = "APPROXIMATE"

    return {
        "pin": pincode,
        "lat": round(geom.get("lat"), 7),
        "lng": round(geom.get("lng"), 7),
        "accuracy": accuracy,
        "place_id": f"",
        "address": raw_result.get("formatted", ""),
    }


def extract_gmaps_fields(raw_result: Dict, pincode: str) -> Dict:
    """Parses the raw Google Maps response into our schema."""
    geom = raw_result.get("geometry", {})
    loc = geom.get("location", {})

    return {
        "pin": pincode,
        "lat": round(loc.get("lat"), 7),
        "lng": round(loc.get("lng"), 7),
        "accuracy": geom.get(
            "location_type", "UNKNOWN"
        ),  # ROOFTOP, RANGE_INTERPOLATED, GEOMETRIC_CENTER
        "place_id": raw_result.get("place_id", ""),
        "address": raw_result.get("formatted_address", ""),
    }


# states that had undergone splits/renaming recently
RISKY = {
    "ANDHRA PRADESH",  # Split into AP + Telangana
    "TELANGANA",  # often mixed up in old data
    "JAMMU & KASHMIR",  # Split into J&K + Ladakh
    "LADAKH",
    "DADRA & NAGAR HAVELI",  # Merged
    "DAMAN & DIU",
}


def main():

    if not API_KEY:
        logger.error("GMAPS_API_KEY environment variable not set.")
        return

    gmaps = googlemaps.Client(key=API_KEY)
    new_records_count = 0

    # Load Input Data
    logger.info("Loading CSV...")
    df = pd.read_csv(INPUT_CSV, encoding="cp1252")
    df.replace(["NA", "na", "NaN"], "", inplace=True)
    df.fillna("", inplace=True)
    df["pincode"] = df["pincode"].astype(str)

    # Get unique pincodes to process and drop duplicates in CSV first to avoid logic overhead
    unique_rows = df.drop_duplicates(subset=["pincode"])
    logger.info(f"Number of unique pincodes to process: {len(unique_rows)}")

    # Load Existing Progress from JSON file
    results = load_existing_data(OUTPUT_JSON)
    processed_pincodes: Set[str] = {item["pin"] for item in results}
    logger.info(f"Found {len(results)} in existing json records")

    for _, row in unique_rows.iterrows():
        pincode = row["pincode"]

        # SKIP if the data for this pincode is already fetched
        if (not pincode) or (pincode in processed_pincodes):
            continue

        office = str(row["officename"]).strip()
        region = str(row["regionname"]).strip()
        taluk = str(row["Taluk"]).strip()
        district = str(row["Districtname"]).strip()
        state = str(row["statename"]).strip()
        safe_state = "" if state.upper() in RISKY else f"{state},"

        # Different query strategies to search
        queries = []
        queries.append(f"{pincode}, {district}, {safe_state} India")
        if taluk:
            queries.append(f"{pincode}, {taluk}, {district}, India")
        if region:
            queries.append(f"{pincode}, {region}, India")
        if office and region:
            queries.append(f"{office}, {region}, {safe_state} {pincode} India")
        # D: Ultimate Fallback
        queries.append(f"{pincode}, India")
        final_result = None
        source = "google"

        # Execute these Strategies
        for q in queries:
            result = call_geocode_api(gmaps, q)
            # Validation: Result must exist AND contain the pincode in address
            if result and (pincode in result.get("formatted_address", "")):
                final_result = result
                # Log success if it wasn't the primary strategy
                if q != queries[0]:
                    logger.info(f"   -> Match found using backup query: {q}")
                break
            # Wait slightly between retries for the same row to be polite
            time.sleep(0.2)

        if OPENCAGE_KEY and not final_result:
            logger.warning(f"GMaps failed for {pincode}. Trying OpenCage...")
            # Try a simple query for OpenCage: Pincode + District + India
            oc_result = call_opencage_api(f"{pincode}, {district}, India")
            # Validate OpenCage Result
            if oc_result and (pincode in oc_result.get("formatted", "")):
                final_result = oc_result
                source = "opencage"
            else:
                oc_result = call_opencage_api(f"{pincode}, India")
                if oc_result:
                    final_result = oc_result
                    source = "opencage"

        # 4. Save Result
        if final_result and (
            pincode
            in final_result.get("formatted_address", final_result.get("formatted", ""))
        ):
            # Extract fields based on source
            if source == "opencage":
                clean_data = extract_opencage_fields(final_result, pincode)
            else:
                clean_data = extract_gmaps_fields(final_result, pincode)
            results.append(clean_data)
            processed_pincodes.add(pincode)
            new_records_count += 1
            logger.info(f"Found: {pincode} ({clean_data['accuracy']})")
        else:
            logger.error(f"FAILED to fetch data for: {pincode}")

        # 4. Incremental Save (Every X records)
        if new_records_count % SAVE_BATCH_SIZE == 0 and new_records_count > 0:
            save_data(OUTPUT_JSON, results)

        # Rate Limiting
        time.sleep(0.2)

    # Final Save
    save_data(OUTPUT_JSON, results)
    logger.info("Job Complete.")


if __name__ == "__main__":
    main()
