import json
import logging
import os
import random
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from bs4 import BeautifulSoup
from curl_cffi import requests

# --- Setup Logging ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger(__name__)

# --- Constants ---
BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "company_data.json"
KEYWORDS_FILE = BASE_DIR / "keywords.txt"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


def get_search_params(keyword: str, start: int) -> Dict[str, str]:
    """Constructs params for the LinkedIn Guest Job API."""
    return {
        "keywords": keyword,
        "location": "India",
        "geoId": "102713980",
        "f_TPR": "r86400",  # 24 hours
        "position": str(start + 1),
        "pageNum": str(start // 25),
        "start": str(start),
    }


def fetch_company_urls() -> List[Dict[str, str]]:
    """Crawls LinkedIn for company page URLs based on keywords."""
    companies = []
    seen_links = set()
    url = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"

    # Load Keywords
    if not KEYWORDS_FILE.exists():
        logger.warning(f"{KEYWORDS_FILE} missing. Searching with empty keyword.")
        keyword_list = [""]
    else:
        with open(KEYWORDS_FILE, "r") as f:
            keyword_list = [""] + list(set(line.strip() for line in f if line.strip()))

    for keyword in keyword_list:
        max_range = 100 if keyword else 500
        logger.info(f"Starting crawl for keyword: '{keyword}'")

        for start in range(0, max_range, 25):
            try:
                # Fresh request per call as requested
                resp = requests.get(
                    url,
                    params=get_search_params(keyword, start),
                    headers={"User-Agent": USER_AGENT},
                    timeout=15,
                    impersonate="chrome",
                )

                if resp.status_code != 200:
                    logger.error(
                        f"Failed search {keyword} at {start}: Status {resp.status_code}"
                    )
                    break

                soup = BeautifulSoup(resp.text, "html.parser")
                job_cards = soup.find_all("div", class_="base-card")

                for card in job_cards:
                    title_tag = card.find("h4", class_="base-search-card__subtitle")
                    if not title_tag:
                        continue

                    name = title_tag.get_text(strip=True)
                    link_tag = title_tag.find("a", href=True)

                    if name and link_tag:
                        link = link_tag["href"]
                        if "linkedin.com" not in link:
                            logger.error(f"non-LinkedIn link found: {link}")
                            continue
                        # replace other lang links with english linkedin links
                        # like de.linkedin.com or uk.linkedin.com with www.linkedin.com
                        link = re.sub(
                            r"https?://[a-z]{1,4}\.linkedin\.com",
                            "https://www.linkedin.com",
                            link,
                        )
                        if link in seen_links:
                            continue
                        companies.append({"name": name, "linkedin": link})
                        seen_links.add(link)

                logger.info(
                    f"Batch processed: start={start}. Total unique companies found: {len(companies)}"
                )
                time.sleep(random.uniform(1, 2))

            except Exception as e:
                logger.error(f"Exception during search crawl: {e}")
                break

    return companies


def extract_employee_count(text: str) -> Optional[str]:
    """
    Extracts a numeric employee count from text like "5,001 - 10,000 employees" or "10,000+ employees".
     - For ranges, it returns the full range (e.g. "5001-10000").
     - For plus counts, it returns the base number (e.g. "10000").
     - Removes text, commas, and handles various formats robustly.
     - If no valid number is found, it returns None.
    """
    if not text:
        return None

    try:
        # Clean up the text: remove commas and normalize whitespace
        # "5,001 - 10,000" -> "5001 - 10000"
        text = text.replace(",", "").strip()

        # Case: Range (e.g., "5001-10000" or "5001 - 10000")
        range_match = re.search(r"(\d+)\s*[\-\–\—]\s*(\d+)", text)
        if range_match:
            return f"{range_match.group(1)}-{range_match.group(2)}"

        # Case: Plus (e.g., "10000+" or "10,000+ employees")
        if "+" in text:
            plus_match = re.search(r"(\d+)", text)
            if plus_match:
                return f"{plus_match.group(1)}+"

        # Fallback: Just find the first standalone number
        single_match = re.search(r"(\d+)", text)
        if single_match:
            return str(single_match.group(1))

        logger.warning(f"No numeric employee count found in text: '{text}'")

    except (ValueError, IndexError) as e:
        logger.error(f"Regex parsing error in extract_employee_count: {e}")

    return None


def fetch_company_details(company: Dict[str, Any]) -> Dict[str, Any]:
    """Scrapes specific company metadata (Website, Employees)."""
    try:
        logger.info(f"Detail Fetch | {company['name']}")
        resp = requests.get(
            company["linkedin"],
            headers={"User-Agent": USER_AGENT},
            timeout=15,
            impersonate="chrome",
        )

        if resp.status_code != 200:
            return company

        soup = BeautifulSoup(resp.text, "html.parser")

        # --- Website Extraction ---
        for a in soup.find_all("a", href=True):
            if "websitelink" in str(a.get("aria-describedby", "")).lower():
                website = a.get_text(strip=True).split("?")[0].rstrip("/")
                if website and not website.startswith("http"):
                    website = "https://" + website
                company["website"] = website
                break

        # --- Employee Count Extraction ---
        emp_div = soup.find("div", {"data-test-id": "about-us__size"})
        if emp_div:
            dd = emp_div.find("dd")
            if dd:
                count = extract_employee_count(dd.get_text(strip=True))
                if count:
                    company["employee_count"] = count

    except Exception as e:
        logger.error(f"Error detailing {company['name']}: {e}")

    return company


def save_to_json(new_data: List[Dict[str, Any]]):
    """Merges, sorts, and persists data to disk."""
    existing_data = []
    if DATA_FILE.exists():
        try:
            with open(DATA_FILE, "r") as f:
                existing_data = json.load(f)
        except json.JSONDecodeError:
            logger.error("Existing data file corrupted. Starting fresh.")

    # Convert existing to map for O(1) lookups
    data_map = {c["name"]: c for c in existing_data}

    for item in new_data:
        name = item["name"]
        now_iso = datetime.now().isoformat()

        if name in data_map:
            # Check for changes to update last_updated
            old = data_map[name]
            has_changed = item.get("employee_count") != old.get(
                "employee_count"
            ) or item.get("website") != old.get("website")
            data_map[name].update(item)
            if has_changed:
                data_map[name]["last_updated"] = now_iso
        else:
            item["last_updated"] = now_iso
            data_map[name] = item

    # Sorting logic: Descending count (NaNs at end), Ascending Name
    def sort_logic(x):
        cnt = x.get("employee_count")
        # count is either a range "5001-10000", a single number "10000", or missing
        if not cnt:
            # Treat missing counts as smallest
            val = float("inf")
        elif "-" in cnt:
            # Use upper bound of range for sorting
            val = -int(cnt.split("-")[1])
        elif cnt.endswith("+"):
            val = cnt.strip("+")
            if val.isdigit():
                val = -int(val)
        elif cnt.isdigit():
            val = -int(cnt)
        else:
            # Unrecognized format, treat as smallest
            val = float("inf")
        return (val, x["name"].lower())

    final_list = sorted(data_map.values(), key=sort_logic)

    with open(DATA_FILE, "w") as f:
        json.dump(final_list, f, indent=2)
    logger.info(f"Saved {len(final_list)} companies to {DATA_FILE}")


def main():
    # 1. Fetch Company URLs
    companies = fetch_company_urls()

    # 2. Detail Fetch (with fresh requests)
    processed_data = []
    for company in companies:
        detailed = fetch_company_details(company)
        processed_data.append(detailed)
        time.sleep(random.uniform(2, 3))

    # 3. Update and Persist
    save_to_json(processed_data)


if __name__ == "__main__":
    main()
