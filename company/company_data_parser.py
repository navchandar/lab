import json
import logging
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
JOBS_DATA = BASE_DIR / "../jobs/jobs.json"
KEYWORDS_FILE = BASE_DIR / "keywords.txt"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
# once every 3 chances, skip crawling to reduce load
COIN_TOSS = random.randint(1, 3) == 1
UPDATE_ALL = False
avoid_words = ["confidential", "stealth", "secret", "hidden"]


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


def normalize_linkedin_url(url: str) -> str:
    """Standardizes LinkedIn URLs to the www domain."""
    if not url:
        return url
    return re.sub(
        r"https?://[a-z]{1,4}\.linkedin\.com", "https://www.linkedin.com", url
    )


def fetch_company_urls(update_all: bool = False) -> List[Dict[str, str]]:
    """
    Consolidates company URLs from local job data and live LinkedIn crawling.
    if update_all = True, update existing data too.
    """
    companies = []
    seen_links = set()

    # Extract from Local Job Data first
    if JOBS_DATA.exists():
        try:
            logger.info(f"Finding new companies from {JOBS_DATA}")
            with open(JOBS_DATA, "r") as f:
                jobs = json.load(f).get("data", [])

            if not isinstance(jobs, list):
                logger.error(f"Expected a list in {JOBS_DATA}, got {type(jobs)}")

            for job in jobs:
                link = job.get("companyUrl")
                link = normalize_linkedin_url(link)
                emp_count = job.get("employeeCount", "-")
                # skip companies with employee count data
                if emp_count and emp_count != "-":
                    seen_links.add(link)
                    continue

                name = job.get("company")
                if link and name and "linkedin.com" in link:
                    if link not in seen_links:
                        companies.append({"name": name, "linkedin": link})
                        seen_links.add(link)

            logger.info(f"Loaded {len(companies)} unique companies from local data.")
        except Exception as e:
            logger.error(f"Error reading job data: {e}")
    else:
        logger.warning(f"{JOBS_DATA} missing. Skipping local extraction.")

    # Crawl LinkedIn for fresh data for all existing companies
    if update_all:
        logger.info("Updating all existing companies!")
        existing_data = read_data()
        for company in existing_data:
            name = company.get("name")
            link = company.get("linkedin")
            if link and name and "linkedin.com" in link:
                if link not in seen_links:
                    companies.append({"name": name, "linkedin": link})
                    seen_links.add(link)
    else:
        logger.info("SKIP: Updating all existing companies!")

    # Skip crawling 2 out of 3 times to reduce load
    if not COIN_TOSS:
        logger.info("SKIP: Find new companies from jobs!")
        return companies

    logger.info("Finding new companies from jobs!")
    url = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
    # Load Keywords
    keyword_list = [""]
    if KEYWORDS_FILE.exists():
        with open(KEYWORDS_FILE, "r") as f:
            keyword_list += [line.strip() for line in f if line.strip()]

    # Ensure keyword_list unique
    keyword_list = list(set(keyword_list))
    # make the list randomly ordered
    random.shuffle(keyword_list)

    for keyword in keyword_list:
        max_range = 100 if keyword else 500
        logger.info(f"Starting crawl for keyword: '{keyword}'")

        for start in range(0, max_range, 25):
            try:
                resp = requests.get(
                    url,
                    params=get_search_params(keyword, start),
                    headers={"User-Agent": USER_AGENT},
                    timeout=15,
                    impersonate="chrome",
                )

                if resp.status_code != 200:
                    logger.error(
                        f"Search failed for {keyword} at {start}: {resp.status_code}"
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
                        link = normalize_linkedin_url(link_tag["href"])

                        if "linkedin.com" not in link:
                            continue

                        if link not in seen_links:
                            companies.append({"name": name, "linkedin": link})
                            seen_links.add(link)

                logger.info(
                    f"Keyword '{keyword}' at {start}: Total unique list is now {len(companies)}"
                )
                time.sleep(random.uniform(1.5, 3.0))  # Slightly safer delay

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


def fetch_company_details(company: Dict[str, Any]) -> None | Dict[str, Any]:
    """Scrapes specific company metadata (Website, Employees)."""
    name = company["name"]
    companyUrl = company["linkedin"]
    # avoid blank names and unwanted company names
    if not name or any(word in name.lower() for word in avoid_words):
        return None
    # avoid blank urls and school page urls
    if not companyUrl or "linkedin.com/school" in companyUrl:
        return None
    try:
        logger.info(f"Detail Fetch | {name}")
        resp = requests.get(
            companyUrl,
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
            if dd := emp_div.find("dd"):
                if count := extract_employee_count(dd.get_text(strip=True)):
                    company["employee_count"] = count
        emp_div = soup.find("span", {"data-test-id": "view-all-employees-cta"})
        if emp_div:
            if p := emp_div.find("p"):
                if count := extract_employee_count(p.get_text(strip=True)):
                    company["ln_employee_count"] = count

        # --- ORG Type: Public / Private ---
        org_div = soup.find("div", {"data-test-id": "about-us__organizationType"})
        if org_div:
            if dd := org_div.find("dd"):
                if org_type := dd.get_text(strip=True):
                    if "public" in org_type.lower():
                        company["public"] = True
                    else:
                        company["public"] = False

    except Exception as e:
        logger.error(f"Error detailing {name}: {e}")

    return company


def read_data():
    existing_data = []
    if DATA_FILE.exists():
        try:
            with open(DATA_FILE, "r") as f:
                existing_data = json.load(f)
        except json.JSONDecodeError:
            logger.error("Existing data file corrupted. Starting fresh.")
    else:
        logger.warning(f"{DATA_FILE} does not exist!")
    return existing_data


def save_to_json(new_data: List[Dict[str, Any]]):
    """Merges, existing data, sorts, and saves data to json file."""
    existing_data = read_data()
    # Convert existing to map for O(1) lookups
    data_map = {c["name"]: c for c in existing_data}

    for item in new_data:
        name = item["name"]
        now_iso = datetime.now().isoformat()

        if name in data_map:
            # Check for changes to update last_updated
            old = data_map[name]
            has_changed = (
                item.get("employee_count") != old.get("employee_count")
                or item.get("website") != old.get("website")
                or item.get("ln_employee_count") != old.get("ln_employee_count")
                or item.get("public") != old.get("public")
            )
            data_map[name].update(item)
            if has_changed:
                data_map[name]["last_updated"] = now_iso
        else:
            item["last_updated"] = now_iso
            data_map[name] = item

    # Sorting logic: Descending count (NaNs at end), Ascending Name
    def sort_logic(x):
        cnt = x.get("employee_count")
        ln_cnt = x.get("ln_employee_count")
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
        elif ln_cnt and ln_cnt.isdigit():
            val = -int(ln_cnt)
        else:
            # Unrecognized format, treat as smallest
            val = float("inf")
        # sorting key variables
        if ln_cnt and ln_cnt.isdigit():
            ln_cnt = -int(ln_cnt) 
            return (ln_cnt, val, x["name"].lower())
        else:
            return (0, val, x["name"].lower())

    final_list = sorted(data_map.values(), key=sort_logic)

    with open(DATA_FILE, "w") as f:
        json.dump(final_list, f, indent=2)
    logger.info(f"Saved {len(final_list)} companies to {DATA_FILE}")


def main():
    # Fetch Company URLs
    companies = fetch_company_urls(UPDATE_ALL)

    # Detail Fetch (with fresh requests)
    processed_data = []
    for i, company in enumerate(companies):
        detailed = fetch_company_details(company)
        if detailed:
            processed_data.append(detailed)
            time.sleep(random.uniform(1, 2))
        # save periodically
        if i % 10 == 0:
            save_to_json(processed_data)
        time.sleep(random.uniform(1, 2))

    # Update and Persist
    save_to_json(processed_data)


if __name__ == "__main__":
    main()
