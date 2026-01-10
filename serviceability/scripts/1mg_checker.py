import json
import logging
import math
import os
import random
import time
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# --- CONFIGURATION ---
SCRIPT_DIR = (
    Path(__file__).resolve().parent
    if "__file__" in globals()
    else Path(Path.cwd() / "scripts").resolve()
)
PROJECT_ROOT = SCRIPT_DIR.parent

DATA_DIR = PROJECT_ROOT / "data"
# We read your existing database of PINs to find matches
INPUT_FILE = DATA_DIR / "pincodes_latlng.json"
OUTPUT_FILE = DATA_DIR / "availability_1mg.json"

# GET API KEY
API_KEY = os.environ.get("GMAPS_API_KEY")
if not API_KEY:
    raise ValueError("❌ GMAPS_API_KEY environment variable is missing!")

# Radius to consider a PIN as "part of the city" (in Kilometers)
SERVICE_RADIUS_KM = 10.0

SAVE_INTERVAL = 10

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger()

HEADERS = {
    "authority": "www.1mg.com",
    "accept": "application/json",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "referer": "https://www.1mg.com/",
}


# --- MATH HELPER: HAVERSINE DISTANCE ---
def calculate_distance(lat1, lon1, lat2, lon2):
    """
    Calculates distance between two lat/lng points in Kilometers.
    """
    R = 6371.0  # Earth radius in km

    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)

    a = math.sin(dlat / 2) * math.sin(dlat / 2) + math.cos(
        math.radians(lat1)
    ) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) * math.sin(dlon / 2)

    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    distance = R * c
    return distance


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


def get_session():
    session = requests.Session()
    retries = Retry(total=3, backoff_factor=1, status_forcelist=[500, 502, 503, 504])
    session.mount("https://", HTTPAdapter(max_retries=retries))
    session.headers.update(HEADERS)
    return session


# --- FETCH 1MG CITIES LIST ---
def fetch_1mg_cities(session):
    url = "https://www.1mg.com/pwa-api/api/v5/cities"
    logger.info("Fetching master city list from 1mg...")
    try:
        response = session.get(url, timeout=10)
        data = response.json()
        raw_list = data.get("data", {}).get("all_cities", {}).get("data", [])

        cities = [c.get("name", "").strip() for c in raw_list if c.get("name")]
        logger.info(f"Loaded {len(cities)} cities from 1mg.")
        return cities
    except Exception as e:
        logger.error(f"Failed to fetch master list: {e}")
        return []


def get_city_coordinates(city_name):
    """
    Get city coordinates using Google Geocode API.
    """
    url = f"https://maps.googleapis.com/maps/api/geocode/json?address={city_name}&components=country:IN&key={API_KEY}"

    try:
        response = requests.get(url, timeout=5)
        data = response.json()

        if data.get("status") != "OK":
            return None

        geometry = data["results"][0]["geometry"]["location"]
        return {"lat": geometry["lat"], "lng": geometry["lng"]}

    except Exception as e:
        logger.error(f"Geocode Request Failed: {e}")
        return None


# --- CHECK 1MG SERVICEABILITY ---
def check_serviceability(session, city_name):
    url = f"https://www.1mg.com/pwa-api/api/v4/city-serviceable?city={city_name}"
    try:
        response = session.get(url, timeout=5)
        payload = response.json().get("data", {})

        is_serviceable = payload.get("serviceable", False)
        is_pharma = payload.get("pharma_available", False)

        if is_serviceable and is_pharma:
            return 1
        return 0
    except:
        return 0


def main():
    logger.info("--- Starting Tata 1mg Spatial Matcher ---")

    # Load PIN database
    logger.info("Loading local PIN database...")
    input_data = load_json(INPUT_FILE)
    output_data = load_json(OUTPUT_FILE)

    # Convert output list to dict for fast updates
    output_map = {str(entry["pin"]): entry for entry in output_data}

    session = get_session()

    # Get 1mg Master City List
    cities = fetch_1mg_cities(session)
    if not cities:
        logger.error("No cities fetched from 1mg. Exiting.")
        return

    updates_buffer = 0
    total = len(cities)

    # --- CONFIGURATION TOGGLE ---
    # Set True: Only mark the single closest PIN (Map will be sparse dots)
    # Set False: Mark ALL PINs in the radius (Map will show coverage blobs)
    MARK_ONLY_CLOSEST = False

    for index, city_name in enumerate(cities, 1):
        # Check if 1mg services this City Name
        status = check_serviceability(session, city_name)

        if status == 1:
            logger.info(
                f"[{index}/{total}] ✅ 1mg serves '{city_name}'. calculating distances..."
            )

            # 2. Get Center Coordinates of the City
            city_coords = get_city_coordinates(city_name)

            if city_coords:
                city_lat = city_coords["lat"]
                city_lng = city_coords["lng"]

                # 3. SPATIAL MATCH: Collect all candidates first
                candidates = []  # Stores tuple: (distance, pin_entry)

                for pin_entry in input_data:
                    p_lat = pin_entry.get("lat")
                    p_lng = pin_entry.get("lng")

                    if not p_lat or not p_lng:
                        continue

                    dist = calculate_distance(city_lat, city_lng, p_lat, p_lng)

                    if dist <= SERVICE_RADIUS_KM:
                        candidates.append((dist, pin_entry))

                # 4. PROCESS CANDIDATES
                if candidates:
                    # Sort by distance (closest first)
                    candidates.sort(key=lambda x: x[0])

                    # Get the closest one
                    closest_dist, closest_pin = candidates[0]
                    closest_pin_code = closest_pin.get("pin")

                    logger.info(
                        f"   -> Found {len(candidates)} matches. Closest: {closest_pin_code} ({closest_dist:.2f}km)"
                    )

                    # Decide what to mark
                    pins_to_update = (
                        [candidates[0]] if MARK_ONLY_CLOSEST else candidates
                    )

                    count_updated = 0
                    for _, pin_data in pins_to_update:
                        pin = pin_data.get("pin")

                        if pin in output_map:
                            entry = output_map[pin]
                            if "partners" not in entry:
                                entry["partners"] = {}
                            entry["partners"]["tata 1mg"] = 1
                        else:
                            new_entry = {"pin": pin, "partners": {"tata 1mg": 1}}
                            output_data.append(new_entry)
                            output_map[pin] = new_entry

                        count_updated += 1

                    updates_buffer += count_updated
                else:
                    logger.warning(
                        f"   -> No local PINs found within {SERVICE_RADIUS_KM}km of {city_name}"
                    )

                # Small delay for Google API rate limits
                time.sleep(0.1)

            else:
                logger.warning(f"   -> Could not geocode city '{city_name}'")
        else:
            logger.info(f"[{index}/{total}] ❌ 1mg does not serve '{city_name}'")

        # Periodically save
        if updates_buffer >= SAVE_INTERVAL:
            final_list = list(output_map.values())
            save_json(OUTPUT_FILE, final_list)
            updates_buffer = 0

    # Final Save
    final_list = list(output_map.values())
    save_json(OUTPUT_FILE, final_list)

    logger.info("--- Tata 1mg Completed ---")


if __name__ == "__main__":
    main()
