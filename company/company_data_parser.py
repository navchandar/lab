import json
import logging
import random
import re
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import yfinance as yf
from bs4 import BeautifulSoup
from curl_cffi import requests
from rapidfuzz import fuzz

# --- Setup Logging ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger(__name__)


# --- Configuration & Constants ---
BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "company_data.json"
HISTORY_FILE = BASE_DIR / "company_history.json"
JOBS_DATA = BASE_DIR / "../jobs/jobs.json"
KEYWORDS_FILE = BASE_DIR / "keywords.txt"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
RETENTION_DAYS = 400
MIN_GROWTH_THRESHOLD = 25  # Don't calculate trends for very small teams
avoid_words = ["confidential", "stealth", "secret", "hidden", "study from"]
guest_job_url = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
now = datetime.now()
day_of_week = now.weekday()  # 0 = Monday, 6 = Sunday
day_of_month = now.day  # 1 to 31

# Discovery: Only crawl for NEW companies on Mon, Wed, Fri (0,2,4)
CHECK_JOB_POSTS = day_of_week in [0, 2, 4]
# Deep Refresh: Update EVERYTHING less frequently
REFRESH_ALL = day_of_month in [1, 2, 3, 5, 8, 13, 19, 21, 25, 28, 30]
logger.info(f"Schedule | Day of Week: {day_of_week}, Day of Month: {day_of_month}")
logger.info(f"Job Post Search: {CHECK_JOB_POSTS} | Full Data Refresh: {REFRESH_ALL}")


class LnSearch:
    """Discover company URLs via LinkedIn Guest Job APIs."""

    @staticmethod
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

    @staticmethod
    def normalize_url(url: str) -> str:
        if not url:
            return ""
        return re.sub(
            r"https?://[a-z]{1,4}\.linkedin\.com", "https://www.linkedin.com", url
        )

    @staticmethod
    def get_handle(url: str) -> Optional[str]:
        """Extracts the unique 'handle' from a LinkedIn company URL."""
        if not url or "/company/" not in url:
            return None
        try:
            return url.split("/company/")[1].split("/")[0].split("?")[0].rstrip("/")
        except (IndexError, AttributeError):
            return None

    @staticmethod
    def get_companies(keyword: str, targets: list, seen: set):
        logger.info(f"Starting crawl for keyword: '{keyword}'")
        max_range = 100 if keyword else 500

        for start in range(0, max_range, 25):
            try:
                params = LnSearch.get_search_params(keyword, start)
                resp = requests.get(
                    guest_job_url,
                    params=params,
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
                        link = LnSearch.normalize_url(link_tag["href"])
                        if not link:
                            continue
                        if "linkedin.com" not in link:
                            continue
                        if link not in seen:
                            targets.append({"name": name, "linkedin": link})
                            seen.add(link)

                logger.info(
                    f"Keyword '{keyword}' at {start}: List is now {len(targets)}"
                )
                time.sleep(random.uniform(1.0, 2.0))  # Slightly safer delay

            except Exception as e:
                logger.error(f"Exception during search crawl: {e}")
        return targets, seen


class FinancialService:
    """Handles Ticker lookups and Stock market performance data."""

    @staticmethod
    def find_ticker(name: str) -> Optional[str]:
        if not name:
            return None
        try:
            search = yf.Search(name, max_results=5)
            equities = [q for q in search.quotes if q.get("quoteType") == "EQUITY"]

            # Priority 1: Indian Exchanges with Fuzzy Match
            for q in equities:
                sym, official = q.get("symbol", ""), q.get("longname", "")
                if fuzz.token_sort_ratio(name.lower(), official.lower()) > 70:
                    if sym.endswith(".NS") or sym.endswith(".BO"):
                        return sym

            # Priority 2: Global/US Exchanges
            for q in equities:
                sym = q.get("symbol", "")
                if "." not in sym:
                    return sym

            return equities[0].get("symbol") if equities else None
        except Exception as e:
            logger.error(f"Ticker lookup error for {name}: {e}")
            return None


class GrowthAnalytics:
    """Manages historical headcount data and growth trend calculations."""

    @staticmethod
    def log_headcount(handle: str, count: int):
        """Records the employee count for today in the history file."""
        if not handle or not count:
            return

        history = GrowthAnalytics._load_history_file()
        today = now.strftime("%Y-%m-%d")

        records = history.get(handle, [])
        # Update if exists for today, else append
        existing = next((r for r in records if r["d"] == today), None)
        if existing:
            existing["c"] = count
        else:
            records.append({"d": today, "c": count})

        # Retention & Sorting
        history[handle] = sorted(records, key=lambda x: x["d"])[-RETENTION_DAYS:]
        GrowthAnalytics._save_history_file(history)

    @staticmethod
    def get_trend(handle: str, days: int) -> Optional[float]:
        """Calculates growth % over a period with noise filters."""
        history = GrowthAnalytics._load_history_file().get(handle, [])
        if len(history) < 2:
            return None

        latest = history[-1]
        target_date = now - timedelta(days=days)

        # Find nearest historical record
        try:
            past = min(
                history,
                key=lambda x: abs(
                    (datetime.strptime(x["d"], "%Y-%m-%d") - target_date).days
                ),
            )
            days_diff = (
                datetime.strptime(latest["d"], "%Y-%m-%d")
                - datetime.strptime(past["d"], "%Y-%m-%d")
            ).days

            if days_diff < (days * 0.8) or latest["c"] < MIN_GROWTH_THRESHOLD:
                return None

            change = latest["c"] - past["c"]
            # Noise Filter: Ignore changes < 3 people or < 0.5%
            growth = (change / past["c"]) * 100
            if abs(change) < 3 or abs(growth) < 0.5:
                return 0.0

            return round(growth, 2)
        except Exception:
            return None

    @staticmethod
    def generate_sparkline_svg(item: Dict) -> Optional[str]:
        """Generates a compact, theme-aware SVG sparkline string."""
        # Get trends: [Yearly, 90d, 30d]
        points_raw = [item.get("Δ_365d"), item.get("Δ_90d"), item.get("Δ_30d")]

        # If no data is available for all, return None
        if not any(p is not None for p in points_raw):
            return None

        # Get the company handle to create a unique Gradient ID
        handle = LnSearch.get_handle(item.get("linkedin", "gen")) or str(
            random.randint(0, 999)
        )
        grad_id = f"grad-{handle}"

        points = [p if p is not None else 0.0 for p in points_raw]

        def normalize(val) -> int:
            return max(0, min(20, 10 - (val / 5)))

        coords = [f"{i * 20},{normalize(p)}" for i, p in enumerate(points)]
        path_data = "M " + " L ".join(coords)

        # Determine colors for each stop in the gradient
        # Left (365d), Middle (90d), Right (30d)
        colors = ["#22c55e" if (p or 0) >= 0 else "#ef4444" for p in points]

        return f"""<svg class='sparkline' viewBox='0 0 40 20' preserveAspectRatio='none' xmlns='http://www.w3.org/2000/svg'>
                    <defs>
                    <linearGradient id='{grad_id}' x1='0%' y1='0%' x2='100%' y2='0%'>
                        <stop offset='0%' stop-color='{colors[0]}' />
                        <stop offset='50%' stop-color='{colors[1]}' />
                        <stop offset='100%' stop-color='{colors[2]}' />
                    </linearGradient>
                    </defs>
                    <path d='{path_data}' fill='none' stroke='url(#{grad_id})' 
                    stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/>
                </svg>"""

    @staticmethod
    def _load_history_file():
        if HISTORY_FILE.exists():
            with open(HISTORY_FILE, "r") as f:
                return json.load(f)
        else:
            logger.warning(f"{HISTORY_FILE} file not found")
        return {}

    @staticmethod
    def _save_history_file(data):
        with open(HISTORY_FILE, "w") as f:
            # sort_keys=True - alphabetical ordering companies
            json.dump(data, f, indent=2, sort_keys=True)


class CompanyParser:
    """Save metadata from individual company pages"""

    @staticmethod
    def get_employee_count(text: str) -> Optional[str]:
        """
        Extracts a numeric employee count from text like "5,001 - 10,000 employees" or "10,000+ employees".
         - For ranges, it returns the full range (e.g. "5001-10000").
         - For plus counts, it returns the base number (e.g. "10000").
         - Removes text, commas, and handles various formats robustly.
         - If no valid number is found, it returns None.
        """
        if not text:
            return None
        text = text.replace(",", "").strip()
        # Range Match (e.g. 100-500)
        m = re.search(r"(\d+)\s*[\-\–\—]\s*(\d+)", text)
        if m:
            return f"{m.group(1)}-{m.group(2)}"
        # Plus Match (e.g. 500+)
        m = re.search(r"(\d+)\+", text)
        if m:
            return f"{m.group(1)}+"
        # Digits only
        m = re.search(r"(\d+)", text)
        return m.group(1) if m else None

    @staticmethod
    def get_company_details(company: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        name, url = company.get("name"), company.get("linkedin")
        # avoid blank names and unwanted company names
        if not name or any(word in name.lower() for word in avoid_words):
            return None
        # avoid blank urls and school page urls
        if not url or "linkedin.com/school" in url:
            return None

        try:
            logger.info(f"Detail Fetch | {name}")
            resp = requests.get(
                url,
                headers={"User-Agent": USER_AGENT},
                timeout=15,
                impersonate="chrome",
            )
            if resp.status_code != 200:
                logger.error(f"Failed to load: {url} Status: {resp.status_code}")
                return company

            soup = BeautifulSoup(resp.text, "html.parser")

            # Website Parsing
            for a in soup.find_all("a", href=True):
                if "websitelink" in str(a.get("aria-describedby", "")).lower():
                    link = a.get_text(strip=True).split("?")[0].rstrip("/")
                    if link and not link.startswith("http"):
                        link = f"https://{link}"
                    if not link or len(link) < 12:
                        logger.error(f"Invalid website: '{link}'")
                        link = ""
                    if link:
                        company["website"] = link
                    break

            # Headcount Parsing
            size_div = soup.find("div", {"data-test-id": "about-us__size"})
            if size_div and (dd := size_div.find("dd")):
                company["emp_count"] = CompanyParser.get_employee_count(dd.get_text())

            cta_span = soup.find("span", {"data-test-id": "view-all-employees-cta"})
            if cta_span and (p := cta_span.find("p")):
                company["ln_count"] = CompanyParser.get_employee_count(p.get_text())

            # Organization Type (Public/Private)
            org_div = soup.find("div", {"data-test-id": "about-us__organizationType"})
            if org_div and (dd := org_div.find("dd")):
                is_public = "public" in dd.get_text().lower()
                company["public"] = is_public
                company["ticker"] = (
                    FinancialService.find_ticker(name) if is_public else None
                )

            return company
        except Exception as e:
            logger.error(f"Scrape failed for {name}: {e}")
            return company


class DataCoordinator:
    """Manages data flow, merging, and trend calculation and injection."""

    @staticmethod
    def run():
        # Discover URLs
        url_list = DataCoordinator._get_target_urls(CHECK_JOB_POSTS, REFRESH_ALL)

        # Parse data & Enrich
        processed = []
        random.shuffle(url_list)
        for i, target in enumerate(url_list):
            enriched = CompanyParser.get_company_details(target)
            if enriched:
                processed.append(enriched)
                time.sleep(random.uniform(1, 2))

            # save periodically
            if (i + 1) % 10 == 0:
                DataCoordinator._save_to_disk(processed)
                processed = []

        DataCoordinator._save_to_disk(processed)

    @staticmethod
    def _get_target_urls(discovery, refresh) -> List[Dict]:
        targets, seen = [], set()
        # Add from local jobs for every run
        if JOBS_DATA.exists():
            logger.info(f"Finding new companies from {JOBS_DATA.name}")
            with open(JOBS_DATA, "r") as f:
                for j in json.load(f).get("data", []):
                    url = LnSearch.normalize_url(j.get("companyUrl"))
                    if not refresh:
                        emp_count = j.get("employeeCount", "-")
                        # skip companies with employee count data
                        if emp_count and emp_count != "-":
                            seen.add(url)
                            continue
                    if url in seen:
                        continue
                    if url and "linkedin.com" in url:
                        targets.append({"name": j.get("company"), "linkedin": url})
                        seen.add(url)
            logger.info(f"Found {len(targets)} companies from local jobs data!")
        else:
            logger.warning(f"{JOBS_DATA} missing. Skipping local jobs data!")

        # Add existing company data if refresh day
        if refresh and DATA_FILE.exists():
            logger.info("Updating all existing companies!")
            with open(DATA_FILE, "r") as f:
                for c in json.load(f):
                    url = LnSearch.normalize_url(c.get("linkedin", ""))
                    if url in seen:
                        continue
                    if url and "linkedin.com" in url:
                        targets.append({"name": c["name"], "linkedin": c["linkedin"]})
                        seen.add(url)
            logger.info(f"Found total {len(targets)} companies")
        elif not DATA_FILE.exists():
            logger.warning(f"{DATA_FILE} not found!")

        if discovery:
            # Find companies from job posts
            logger.info("Finding new companies from current Linkedin jobs!")
            # Load Keywords
            keyword_list = [""]
            if not KEYWORDS_FILE.exists():
                logger.warning(f"{KEYWORDS_FILE} not found. Skipping job search!")
            else:
                with open(KEYWORDS_FILE, "r") as f:
                    keyword_list += [line.strip() for line in f if line.strip()]
                # Ensure keyword_list unique
                keyword_list = list(set(keyword_list))
                # make the list randomly ordered
                random.shuffle(keyword_list)

                for keyword in keyword_list:
                    targets, seen = LnSearch.get_companies(keyword, targets, seen)
                logger.info(f"Found total {len(targets)} companies")

        return targets

    @staticmethod
    def _save_to_disk(new_batch: List[Dict]):
        if not new_batch:
            return

        # Load existing
        current_data = []
        if DATA_FILE.exists():
            with open(DATA_FILE, "r") as f:
                current_data = json.load(f)

        data_map = {c["name"]: c for c in current_data}

        for item in new_batch:
            handle = LnSearch.get_handle(item.get("linkedin"))
            ln_count = item.get("ln_count")

            # Log History & Calculate Trends
            if handle and ln_count and ln_count.isdigit():
                GrowthAnalytics.log_headcount(handle, int(ln_count))
                item["Δ_30d"] = GrowthAnalytics.get_trend(handle, 30)
                item["Δ_90d"] = GrowthAnalytics.get_trend(handle, 90)
                item["Δ_365d"] = GrowthAnalytics.get_trend(handle, 365)
                item["sparkline"] = GrowthAnalytics.generate_sparkline_svg(item)

            # Merge
            name = item["name"]
            if name in data_map:
                data_map[name].update(item)
                data_map[name]["last_updated"] = datetime.now().isoformat()
            else:
                item["last_updated"] = datetime.now().isoformat()
                data_map[name] = item

        # Sorting logic: Descending count (NaNs at end), Ascending Name
        def sort_logic(x):
            cnt = x.get("emp_count")
            ln_cnt = x.get("ln_count")
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

        # Final Sort and Save
        final = sorted(data_map.values(), key=sort_logic)
        with open(DATA_FILE, "w") as f:
            json.dump(final, f, indent=2)
        logger.info(f"Saved {len(final)} companies to {DATA_FILE}")


if __name__ == "__main__":
    DataCoordinator.run()
