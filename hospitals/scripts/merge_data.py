import difflib
import json
import logging
import os
import re
import shutil
import time
import uuid
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# --- Configuration & Logging ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("GeocodingPipeline")

# Paths
SCRIPT_DIR = (
    Path(__file__).resolve().parent
    if "__file__" in globals()
    else Path(Path.cwd() / "scripts").resolve()
)
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"
OUTPUT_FILE = DATA_DIR / "excluded.json"
TEMP_FILE = DATA_DIR / "excluded_processing.tmp.json"
SOURCES_FILE = DATA_DIR / "sources.json"

# API Config
GMAPS_API_KEY = os.getenv("GMAPS_API_KEY")
GMAPS_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
GMAPS_FIND_PLACE_URL = (
    "https://maps.googleapis.com/maps/api/place/findplacefromtext/json"
)
GMAPS_PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"

BB_AUTOCOMPLETE_URL = "https://www.bigbasket.com/places/v1/places/autocomplete/"
SAVE_INTERVAL = 10  # Save every N API calls


class GeocodingPipeline:
    def __init__(self):
        self.data: Dict[str, Dict[str, Any]] = {}
        self.session = self._init_session()
        self.api_hits = 0
        # Flag to disable place search if API key fails
        self.places_api_enabled = True
        self.city_coords_cache: Dict[str, Dict[str, float]] = {}

    def _init_session(self) -> requests.Session:
        """Configures a resilient HTTP session."""
        session = requests.Session()
        retries = Retry(
            total=3, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504]
        )
        session.mount("https://", HTTPAdapter(max_retries=retries))
        return session

    # --- ID GENERATION ---
    def generate_unique_id(self, name: str, pin: str, city: str) -> str:
        """
        Generates a robust ID by stripping non-alphanumeric characters.
        Matches 'Sri Hospital' with 'SRI. HOSPITAL'.
        """
        # Remove all non-alphanumeric chars (spaces, dots, hyphens)
        clean_name = re.sub(r"[^A-Z0-9]", "", str(name).upper())
        clean_pin = str(pin).strip()

        # If Pin is invalid/missing, fallback to alphanumeric City
        if not clean_pin or len(clean_pin) < 6 or clean_pin.lower() == "nan":
            clean_suffix = re.sub(r"[^A-Z0-9]", "", str(city).upper())
        else:
            clean_suffix = clean_pin
        return f"{clean_name}_{clean_suffix}"

    # --- DATA LOADING & MERGING ---
    def load_existing_data(self):
        """Loads excluded.json into memory to support resuming/updating."""
        if not OUTPUT_FILE.exists():
            logger.info("No existing output file found. Starting fresh.")
            return

        try:
            with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
                raw_list = json.load(f)
            for item in raw_list:
                # Reconstruct ID to map back to dictionary
                uid = self.generate_unique_id(
                    item.get("name"), item.get("pincode"), item.get("city")
                )
                self.data[uid] = item
                # Ensure internal flag is False by default
                self.data[uid]["_needs_update"] = False
            logger.info(f"Loaded {len(self.data)} existing records.")
        except Exception as e:
            logger.error(f"Failed to load existing data: {e}")

    # --- MERGE LOGIC ---
    def merge_sources(self):
        """
        Reads source files, adds new records, and marks existing ones for
        update if Address changed or Accuracy is LOW.
        """
        source_files = list(DATA_DIR.glob("*Excluded_Hospitals_List.json"))
        if not source_files:
            logger.warning("No source files found in data directory.")
            return

        logger.info(f"Merging data from {len(source_files)} source files...")
        # Track IDs present in the current source files
        active_source_uids = set()

        for file_path in source_files:
            company_name = file_path.name.replace(
                " Excluded_Hospitals_List.json", ""
            ).strip()
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    source_data = json.load(f)
                for record in source_data:
                    uid = self._process_source_record(record, company_name)
                    if uid:
                        active_source_uids.add(uid)
            except Exception as e:
                logger.error(f"Error reading {file_path.name}: {e}")

        # --- PRUNING LOGIC ---
        # Identify IDs in self.data that were NOT found in the current sources
        existing_ids = list(self.data.keys())
        removed_count = 0
        for uid in existing_ids:
            if uid not in active_source_uids:
                # This hospital is in our DB but not in the PDFs anymore. Remove it.
                del self.data[uid]
                removed_count += 1
        if removed_count > 0:
            logger.info(
                f"Pruned {removed_count} records that are no longer in source files."
            )

    def _process_source_record(self, record: Dict, company: str):
        # Extract fields
        src_name = (
            record.get("Hospital Name", "") if record.get("Hospital Name") else ""
        )
        src_addr = record.get("Address", "") if record.get("Address") else ""
        src_city = record.get("City", "") if record.get("City") else ""
        src_state = record.get("State", "") if record.get("State") else ""
        src_pin = record.get("Pin Code", "") if record.get("Pin Code") else ""
        # Skip invalid records
        if src_name is None or str(src_name).strip() == "":
            return None
        if (
            str(src_name).strip() == "Hospital Name"
            or str(src_pin).strip() == "Pincode"
        ):
            return None

        uid = self.generate_unique_id(src_name, src_pin, src_city)

        if uid in self.data:
            existing = self.data[uid]
            # Preserve High Accuracy locations
            if existing.get("accuracy") == "HIGH":
                # Just merge the company name
                if company not in existing["excluded_by"]:
                    existing["excluded_by"].append(company)
                    logger.info(f"Merged {company} into existing record: {src_name}")
                return uid

            # Priority 2: Improve Low Accuracy Data
            # If existing is LOW or Pending, and new address is different, try the new one.
            old_addr = str(existing.get("address", "")).strip()
            new_addr = str(src_addr).strip()

            # Simple check: update if new address is longer (likely more info) or different
            has_address_changed = (old_addr != new_addr) and (len(new_addr) > 5)

            if has_address_changed:
                existing["address"] = src_addr
                existing["city"] = src_city
                existing["state"] = src_state
                existing["pincode"] = src_pin
                existing["_needs_update"] = True  # Trigger re-geocoding
                logger.info(f"Updating Record (Address Change): {src_name}")

            # Always merge company
            if company not in existing["excluded_by"]:
                existing["excluded_by"].append(company)
        else:
            # NEW RECORD
            self.data[uid] = {
                "name": src_name,
                "address": src_addr,
                "city": src_city,
                "state": src_state,
                "pincode": src_pin,
                "excluded_by": [company],
                "lat": 0.0,
                "lng": 0.0,
                "accuracy": "Pending",
                "_needs_update": True,
            }
        return uid

    # --- GEOCODING HELPERS ---
    def _get_city_coordinates(self, city: str, state: str) -> Dict[str, float]:
        key = f"{city}|{state}".lower()
        if key in self.city_coords_cache:
            return self.city_coords_cache[key]

        # Construct query
        query = f"{city}, {state}, India"
        params = {"address": query, "key": GMAPS_API_KEY}

        try:
            resp = self.session.get(GMAPS_GEOCODE_URL, params=params, timeout=10)
            data = resp.json()
            if data["status"] == "OK":
                loc = data["results"][0]["geometry"]["location"]
                result = {"lat": loc["lat"], "lng": loc["lng"]}
                self.city_coords_cache[key] = result
                logger.info(f"Cached City Coords for {city}: {result}")
                return result
        except Exception as e:
            logger.warning(f"City Geocode failed for {city}: {e}")

        # Cache failure as None, Don't retry request for same location
        self.city_coords_cache[key] = None
        return None

    # --- HELPER: GOOGLE PLACE DETAILS ---
    def _fetch_gmaps_place_details(self, place_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetches Lat/Lng directly from Google using a Place ID.
        This is more accurate and cheaper/same cost as Geocoding.
        """
        if not GMAPS_API_KEY:
            return None

        params = {
            "place_id": place_id,
            "key": GMAPS_API_KEY,
            # CRITICAL: Only fetch geometry to keep API costs low
            "fields": "geometry",
        }

        try:
            resp = self.session.get(GMAPS_PLACE_DETAILS_URL, params=params, timeout=10)
            data = resp.json()
            if data.get("status") == "OK":
                loc = (
                    data["results"]["geometry"]["location"]
                    if "results" in data
                    else data["result"]["geometry"]["location"]
                )
                return {
                    "lat": loc["lat"],
                    "lng": loc["lng"],
                    "accuracy": "HIGH",
                    "place_id": place_id,  # Store ID for future reference
                }
        except Exception as e:
            logger.warning(f"Place Details API failed: {e}")
        return None

    def _search_bb_places(self, query: str) -> Optional[Dict[str, Any]]:
        """
        Uses fresh UUID for every request to mimic unique user session.
        """
        # Generate a random UUID v4, just like the JS code: token: uuidv4()
        token = str(uuid.uuid4())
        # Store current session headers
        def_headers = self.session.headers.copy()
        params = {"inputText": query, "token": token}
        try:
            self.session.headers.update(
                {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
                    "Referer": "https://www.bigbasket.com/",
                    "Origin": "https://www.bigbasket.com",
                    "Accept": "application/json, text/plain, */*",
                }
            )
            resp = self.session.get(BB_AUTOCOMPLETE_URL, params=params, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                predictions = data.get("predictions", [])
                if predictions:
                    return predictions[0]
        except Exception as e:
            logger.warning(f"BB Search Error: {e}")
        finally:
            # Reset headers to default
            self.session.headers = def_headers
        return None

    def _get_city_location_bias(self, city: str, state: str) -> Optional[str]:
        """Fetches City lat/lng for search biasing."""
        # Reuse the city coord logic to get a bias circle
        loc = self._get_city_coordinates(city, state)
        if loc:
            bias_str = f"circle:20000@{loc['lat']},{loc['lng']}"
            return bias_str
        return None

    # --- GEOCODING MAIN LOGIC ---
    def fetch_geocoding(self, record: Dict) -> Dict[str, Any]:
        """
        Queries Google Maps with a Fallback Strategy:
        1. Try Name + Address + Pin (Specific Business Search)
        2. Search BB Autocomplete (Name + City) and geocode returned address
        3. If Low Accuracy, try Address + Pin (Building Search)
        """
        if not GMAPS_API_KEY:
            return {"lat": 0.0, "lng": 0.0, "accuracy": "NoKey"}

        # 1. Prepare Data
        name = record.get("name", "").strip()
        address = record.get("address", "").strip() if record.get("address") else ""
        city = record.get("city", "").strip() if record.get("city") else ""
        state = record.get("state", "").strip() if record.get("state") else ""
        pin = str(record.get("pincode", "")).strip()

        location_bias = self._get_city_location_bias(city, state)

        # --- STRATEGY A: PLACES API (Find Place) ---
        # Checks 'self.places_api_enabled' first
        if self.places_api_enabled:
            search_query = f"{name} {city} {state}"
            place_params = {
                "key": GMAPS_API_KEY,
                "input": search_query,
                "inputtype": "textquery",
                "fields": "place_id,geometry,name,types",
                "language": "en-IN",
            }
            if location_bias:
                place_params["locationbias"] = location_bias

            try:
                resp = self.session.get(GMAPS_FIND_PLACE_URL, params=place_params)

                # Check for API Access Issues
                if resp.status_code == 403:
                    logger.warning(
                        "Places API returned 403 Forbidden. Disabling Places API strategy."
                    )
                    self.places_api_enabled = False
                else:
                    data = resp.json()
                    status = data.get("status")

                    if status == "REQUEST_DENIED":
                        logger.warning(
                            f"Places API Request Denied: {data.get('error_message')}. Disabling."
                        )
                        self.places_api_enabled = False
                    elif status == "OK" and data.get("candidates"):
                        candidate = data["candidates"][0]
                        types = candidate.get("types", [])
                        is_health = any(
                            t in types
                            for t in [
                                "hospital",
                                "doctor",
                                "health",
                                "clinic",
                                "pharmacy",
                            ]
                        )
                        if is_health:
                            loc = candidate["geometry"]["location"]
                            logger.info(f"HIGH Accuracy (Places): {name}")
                            return {
                                "lat": loc["lat"],
                                "lng": loc["lng"],
                                "accuracy": "HIGH",
                                "place_id": candidate["place_id"],
                            }
            except Exception as e:
                logger.warning(f"Places API call failed: {e}")

        # --- STRATEGY B: BB AutoComplete API ---
        bb_query = f"{name}, {city}"
        full_address = None
        try:
            if bb_result := self._search_bb_places(bb_query):
                # 1. Try to use Place ID first
                place_id = bb_result.get("place_id")
                if place_id:
                    details_result = self._fetch_gmaps_place_details(place_id)
                    if details_result:
                        accuracy = "HIGH"
                        logger.info(f"HIGH Accuracy (BB PlaceID): {name}")
                        return details_result

                # 2. Fallback to using description text if ID failed or missing
                full_address = bb_result.get("description")
                logger.info(f"BB Text Match: {full_address}")
                accuracy = "HIGH"
            else:
                logger.info(f"BB No Match. Using Raw Address.")
                full_address = f"{address}, {city}, {state}"
                accuracy = "LOW"
        except Exception as e:
            logger.error(f"BB Autocomplete failed: {e}")
            full_address = f"{address}, {city}, {state}"

        # --- STRATEGY C: GEOCODING API (Fallback) ---
        comps = "country:IN"
        if pin and len(pin) == 6 and pin.isdigit():
            comps += f"|postal_code:{pin}"

        # 2. Attempt 1: Strict Address Search
        geo_params = {
            "key": GMAPS_API_KEY,
            "address": full_address,
            "components": comps,
        }
        best_result = {"lat": 0.0, "lng": 0.0, "accuracy": "Pending"}

        try:
            # Attempt 1: Geocode the address string
            resp = self.session.get(GMAPS_GEOCODE_URL, params=geo_params)
            data = resp.json()

            if data["status"] == "OK":
                res = data["results"][0]
                loc = res["geometry"]["location"]
                loc_type = res["geometry"]["location_type"]
                accuracy = (
                    "HIGH" if loc_type in ["ROOFTOP", "RANGE_INTERPOLATED"] else "LOW"
                )
                if accuracy == "HIGH":
                    logger.info(f"HIGH Accuracy (Address): {name}")
                    return {"lat": loc["lat"], "lng": loc["lng"], "accuracy": accuracy}
                # Save this result as a fallback
                best_result = {
                    "lat": loc["lat"],
                    "lng": loc["lng"],
                    "accuracy": accuracy,
                }

            # Attempt 2: Append name to address
            geo_params["address"] = f"{name}, {full_address}"
            resp = self.session.get(GMAPS_GEOCODE_URL, params=geo_params)
            data = resp.json()

            if data["status"] == "OK":
                res = data["results"][0]
                loc = res["geometry"]["location"]
                loc_type = res["geometry"]["location_type"]
                accuracy = (
                    "HIGH" if loc_type in ["ROOFTOP", "RANGE_INTERPOLATED"] else "LOW"
                )
                if accuracy == "HIGH":
                    logger.info(f"HIGH Accuracy (Name+Address): {name}")
                    return {"lat": loc["lat"], "lng": loc["lng"], "accuracy": accuracy}

            # 4. Fallback
            # If both failed to get HIGH accuracy, return the result from Attempt 1 (Address)
            # because 'Name' searches often default to City Center (very low accuracy) when not found.
            if best_result["accuracy"] != "Pending":
                logger.info(f"LOW Accuracy: {name}")
                return best_result

        except Exception as e:
            logger.error(f"Geocoding API failed: {e}")

        # --- STRATEGY D: CITY LOCATION FALLBACK ---
        if best_result["accuracy"] == "Pending" or (best_result["lat"] == 0.0):
            logger.info(f"Fallback to City Center for: {name}")
            city_loc = self._get_city_coordinates(city, state)
            if city_loc:
                return {
                    "lat": city_loc["lat"],
                    "lng": city_loc["lng"],
                    "accuracy": "APPROXIMATE",
                }

        # If we have a LOW result (street level but not building), return it
        if best_result["lat"] != 0.0 and best_result["lng"] != 0.0:
            logger.info(f"LOW Accuracy: {name}")
            return best_result

        # If everything else fails, return 0.0
        return {"lat": 0.0, "lng": 0.0, "accuracy": "Pending"}

    # --- DEDUPLICATION HELPERS ---
    def _normalize_for_match(self, text: str) -> str:
        """Normalizes hospital names for fuzzy comparison."""
        if not text:
            return ""
        text = text.lower()

        # Remove suffixes that inflate similarity scores
        noise_words = [
            "hospital",
            "hospitals",
            "centre",
            "center",
            "clinic",
            "nursing",
            "home",
            "multispeciality",
            "multi",
            "speciality",
            "specialty",
            "superspeciality",
            "super",
            "health",
            "care",
            "healthcare",
            "medicare",
            "trauma",
            "maternity",
            "research",
            "institute",
            "memorial",
            "general",
            "diagnostic",
            "diagnostics",
            "foundation",
            "trust",
            "pvtltd",
            "pvt",
            "ltd",
        ]
        for word in noise_words:
            text = text.replace(word, "")
        return re.sub(r"[^a-z0-9]", "", text)

    def _calculate_similarity(self, name_a: str, name_b: str) -> float:
        """Returns a score (0.0 - 1.0) representing name similarity."""
        norm_a = self._normalize_for_match(name_a)
        norm_b = self._normalize_for_match(name_b)
        if not norm_a or not norm_b:
            return 0.0

        # SAFETY CHECK: If names are too short (e.g. "Om", "Sai"), require exact match
        if len(norm_a) < 5 or len(norm_b) < 5:
            return 1.0 if norm_a == norm_b else 0.0

        # Base Ratio
        ratio = difflib.SequenceMatcher(None, norm_a, norm_b).ratio()

        # Containment Bonus (e.g. "Sanjeevani" inside "Sanjeevani Multispeciality")
        containment_bonus = 0.0
        if len(norm_a) > 4 and len(norm_b) > 4:
            if norm_a in norm_b or norm_b in norm_a:
                containment_bonus = 0.2
        return ratio + containment_bonus

    def _merge_record_data(self, primary: Dict[str, Any], secondary: Dict[str, Any]):
        """
        Merges secondary data into primary.
        - Unions the 'excluded_by' lists.
        - Keeps the longest/most detailed Address.
        - Backfills missing City/State/Pincode.
        """
        # 1. Merge Insurers
        combined_insurers = set(
            primary.get("excluded_by", []) + secondary.get("excluded_by", [])
        )
        primary["excluded_by"] = list(combined_insurers)

        # 2. Smart Address Merge (Keep Longest)
        addr_p = self._normalize_for_match(str(primary.get("address", "")).strip())
        addr_s = self._normalize_for_match(str(secondary.get("address", "")).strip())
        if len(addr_s) > len(addr_p):
            primary["address"] = secondary["address"]

        # 3. Backfill missing metadata
        for field in ["city", "state", "pincode"]:
            if not primary.get(field) and secondary.get(field):
                primary[field] = secondary[field]

    def _get_record_rank_score(self, uid: str) -> tuple:
        """
        Scoring function to determine the 'Master' record in a group.
        Priority: Accuracy (High>Medium>Low) -> Name Length (Longer is better)
        """
        rec = self.data[uid]
        accuracy_map = {
            "HIGH": 3,
            "MEDIUM": 2,
            "LOW": 1,
            "APPROXIMATE": 0,
            "Pending": 0,
        }
        acc_score = accuracy_map.get(rec.get("accuracy"), 0)
        return (acc_score, len(rec.get("name", "")))

    # --- DEDUPLICATION PASSES ---
    def _deduplicate_spatial(self) -> int:
        """Pass 1: Merge records sharing exact Lat/Lng coordinates."""
        # Group by coordinates upto 5 digits match (rounded to ~1.1m precision)
        coord_groups = defaultdict(list)
        for uid, record in self.data.items():
            rank_found = self._get_record_rank_score(uid)[0] > 0
            loc_found = record.get("lat", 0.0) != 0.0 and record.get("lng", 0.0) != 0.0
            if rank_found and loc_found:
                key = (round(record["lat"], 5), round(record["lng"], 5))
                coord_groups[key].append(uid)

        merged_count = 0
        to_delete = set()
        for uids in coord_groups.values():
            if len(uids) < 2:
                continue

            # Sort to find the best Accuracy record
            uids.sort(key=self._get_record_rank_score, reverse=True)
            primary_id = uids[0]

            # Merge all others into Primary
            for sec_id in uids[1:]:
                self._merge_record_data(self.data[primary_id], self.data[sec_id])
                to_delete.add(sec_id)
                merged_count += 1

        # Apply deletions
        for uid in to_delete:
            del self.data[uid]
        return merged_count

    def _deduplicate_with_text(self) -> int:
        """Pass 2: Rescue 'Lost' records (Lat 0.0) by matching them to 'Found' records."""
        # 1. BUCKETING
        # Masters: Records with good location data (HIGH/LOW)
        # Candidates: Records with bad/generic location data (APPROXIMATE/Pending/Failed)
        pincode_masters = defaultdict(list)
        candidates_to_merge = []

        for uid, record in self.data.items():
            pin = str(record.get("pincode", "")).strip()
            if len(pin) < 6:
                continue  # Skip invalid pins

            # If specific location (HIGH/LOW) serves as a Master record
            if record.get("accuracy") in ["HIGH", "LOW"]:
                pincode_masters[pin].append(uid)
            else:
                # If it's APPROXIMATE (City Center) or Pending, try to merge it into a Master
                candidates_to_merge.append(uid)

        merged_count = 0
        to_delete = set()

        # 2. MATCHING
        for candidate_id in candidates_to_merge:
            candidate_rec = self.data[candidate_id]
            pin = str(candidate_rec.get("pincode", "")).strip()

            # Get potential masters in the same Pincode
            potential_masters = pincode_masters.get(pin, [])
            if not potential_masters:
                continue

            best_master_id = None
            best_score = 0.0

            for master_id in potential_masters:
                # Compare Names
                score = self._calculate_similarity(
                    candidate_rec["name"], self.data[master_id]["name"]
                )

                # High threshold (85%) to ensure we don't merge distinct hospitals
                if score > 0.85 and score > best_score:
                    best_score = score
                    best_master_id = master_id

            if best_master_id:
                # Merge Candidate data INTO Master data
                master_rec = self.data[best_master_id]
                self._merge_record_data(master_rec, candidate_rec)

                logger.info(
                    f"Text Match: Merged '{candidate_rec['name']}' ({candidate_rec['accuracy']}) -> '{master_rec['name']}' ({master_rec['accuracy']})"
                )

                to_delete.add(candidate_id)
                merged_count += 1

        # 3. CLEANUP - Apply deletions
        for uid in to_delete:
            del self.data[uid]

        return merged_count

    def deduplicate_data(self):
        """Orchestrates the deduplication process."""
        logger.info("Starting Deduplication...")
        count_spatial = self._deduplicate_spatial()
        logger.info(f"Spatial Pass: Merged {count_spatial} records.")
        count_text = self._deduplicate_with_text()
        logger.info(f"Text Fallback Pass: Merged {count_text} records.")
        total = count_spatial + count_text
        logger.info(f"Deduplication Complete. Total Merged: {total}")

    def enrich_source_metadata(self):
        """
        Updates sources.json with counts of Excluded and Network hospitals.
        Matches files in data/ directory to companies in sources.json.
        """
        if not SOURCES_FILE.exists():
            logger.warning("sources.json not found. Skipping metadata enrichment.")
            return

        try:
            with open(SOURCES_FILE, "r", encoding="utf-8") as f:
                sources = json.load(f)

            updated = False
            for source in sources:
                company = source.get("company")
                if not company:
                    continue

                # 1. Count Excluded Hospitals
                excluded_file = DATA_DIR / f"{company} Excluded_Hospitals_List.json"
                if excluded_file.exists():
                    try:
                        with open(excluded_file, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            count = len(data)
                            if (
                                source.get("excluded_count")
                                and source.get("excluded_count") != count
                            ):
                                source["excluded_count"] = count
                                updated = True
                            if not "excluded_count" in source.keys():
                                source["excluded_count"] = count
                                updated = True
                            logger.info(f"{company} Excluded Count: {count}")

                    except Exception as e:
                        logger.error(f"Error reading {excluded_file.name}: {e}")
                else:
                    logger.error(f"No excluded file found for {company}.")

                # 2. Count Network Hospitals (Future proofing)
                network_file = DATA_DIR / f"{company} Network_Hospitals_List.json"
                if network_file.exists():
                    try:
                        with open(network_file, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            count = len(data)
                            if (
                                source.get("network_count")
                                and source.get("network_count") != count
                            ):
                                source["network_count"] = count
                                updated = True
                            if not "network_count" in source.keys():
                                source["network_count"] = count
                                updated = True
                            logger.info(f"{company} Network Count: {count}")
                    except Exception as e:
                        logger.error(f"Error reading {network_file.name}: {e}")
                else:
                    logger.error(f"No network file found for {company}.")

            if updated:
                with open(SOURCES_FILE, "w", encoding="utf-8") as f:
                    json.dump(sources, f, indent=4, ensure_ascii=False)
                logger.info("Successfully updated sources.json with hospital counts.")
            else:
                logger.info("No changes needed in sources.json.")

        except Exception as e:
            logger.error(f"Failed to enrich source metadata: {e}")

    # --- RUNNER ---
    def run(self):
        """Main Execution Flow"""
        if not GMAPS_API_KEY:
            logger.error("CRITICAL: GMAPS_API_KEY not found.")
            return

        # 1. Load State
        self.load_existing_data()

        # 2. Merge Updates
        self.merge_sources()

        # 3. Geocode Loop
        pending_items = [
            (uid, rec)
            for uid, rec in self.data.items()
            if rec.get("_needs_update")
            or (rec.get("lat") == 0.0)
            or (rec.get("accuracy") == "Pending")
        ]
        total = len(pending_items)
        if total == 0:
            logger.info("No records need geocoding.")
            # Even if no geocoding is needed, try to deduplicate
            self.deduplicate_data()
            self.save_to_disk(is_final=True)
            self.enrich_source_metadata()
            return

        logger.info(f"Starting geocoding for {total} records...")
        for i, (uid, record) in enumerate(pending_items):
            result = self.fetch_geocoding(record)

            # Case 1: Geocoding Successful
            if result["lat"] != 0.0 and result["lng"] != 0.0:
                record["lat"] = result["lat"]
                record["lng"] = result["lng"]
                record["accuracy"] = result["accuracy"]
                record["_needs_update"] = False

            # Case 2: Geocoding Failed, but record is still marked "Pending"
            if record.get("accuracy") == "Pending":
                # If we have old coordinates, keep them but mark accuracy as Low/Manual
                if record.get("lat") != 0.0:
                    record["accuracy"] = "LOW"
                else:
                    record["accuracy"] = "Pending"
                record["_needs_update"] = False

            if record.get("accuracy") not in ["HIGH", "LOW"]:
                if record.get("lat") == 0.0 or record.get("lng") == 0.0:
                    record["accuracy"] = "Pending"
                record["_needs_update"] = False
            self.api_hits += 1

            # Save periodically
            if self.api_hits % SAVE_INTERVAL == 0:
                self.save_to_disk(is_final=False)
                logger.info(f"Progress: {i+1}/{total} processed...")
            # Rate limit
            time.sleep(0.1)

        # Clean up duplicates and save the data
        self.deduplicate_data()
        self.save_to_disk(is_final=True)
        self.enrich_source_metadata()

    def save_to_disk(self, is_final: bool = False):
        """Saves dictionary to JSON list, removing internal flags."""

        # Convert dict to list
        output_list = list(self.data.values())

        # Clean internal keys before saving
        clean_list = []
        for item in output_list:
            # Remove internal keys (starting with _)
            clean_item = {k: v for k, v in item.items() if not k.startswith("_")}
            # Alphabetic Sort for 'excluded_by'
            if "excluded_by" in clean_item and isinstance(
                clean_item["excluded_by"], list
            ):
                clean_item["excluded_by"].sort()
            clean_list.append(clean_item)

        # Sort for consistency
        def get_sort_key(item):
            pin = str(item.get("pincode", "")).strip()
            name = str(item.get("name", "")).strip().lower()
            # check for valid PIN code
            is_invalid = not (pin.isdigit() and len(pin) == 6)

            # TUPLE SORTING
            # Python sorts tuples element-by-element:
            #   1st element: Validity (0 = Valid, 1 = Invalid/Blank) -> Valid floats to top
            #   2nd element: Pincode String (Ascending)
            #   3rd element: Hospital Name (Alphabetical)
            return (is_invalid, pin, name)

        clean_list.sort(key=get_sort_key)
        try:
            with open(TEMP_FILE, "w", encoding="utf-8") as f:
                json.dump(clean_list, f, indent=4, ensure_ascii=False)
            if is_final:
                shutil.move(str(TEMP_FILE), str(OUTPUT_FILE))
                logger.info(f"Saved {len(clean_list)} records to {OUTPUT_FILE}")
        except Exception as e:
            logger.error(f"Failed to save data: {e}")


if __name__ == "__main__":
    pipeline = GeocodingPipeline()
    pipeline.run()
