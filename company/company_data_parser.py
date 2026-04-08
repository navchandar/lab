import csv
import io
import json
import logging
import os
import random
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set
from urllib.parse import urljoin, urlparse

import pandas as pd
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
HISTORY_FILE = BASE_DIR / "company_history.csv"
CHARTS_DATA_FILE = BASE_DIR / "charts_data.json"
TEMP_FILE = BASE_DIR / "comp.json"
JOBS_DATA = BASE_DIR / "../jobs/jobs.json"
KEYWORDS_FILE = BASE_DIR / "keywords.txt"
RETENTION_DAYS = 400
MIN_GROWTH_THRESHOLD = 25  # Don't calculate trends for very small teams
avoid_words = [
    "confidential",
    "confidencial",
    "stealth",
    "secret",
    "hidden",
    "study from",
]
guest_job_url = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
# Official CSV URLs
NSE_URL = "https://archives.nseindia.com/content/equities/EQUITY_L.csv"
BSE_URL = "https://www.bseindia.com/downloads1/List_of_companies.csv"

now = datetime.now(timezone.utc)
day_of_week = now.weekday()  # 0 = Monday, 6 = Sunday
# Discovery: Only crawl for NEW companies on Mon, Wed (0,2)
CHECK_JOB_POSTS = day_of_week in [0, 2]
# Deep Refresh: Update EVERYTHING during week days
REFRESH_ALL = True
# Search and update Listed companies once a wekk
FIND_LISTED = day_of_week in [1, 3]
logger.info(f"Schedule | Day of Week: {day_of_week}")
logger.info(
    f"Job Post Search: {CHECK_JOB_POSTS} | Full Data Refresh: {REFRESH_ALL} | Search Public companies: {FIND_LISTED}"
)


GEO_IDs = [
    {"location": "India", "geoId": "102713980"},
    {"location": "United States", "geoId": "103644278"},
    {"location": "Germany", "geoId": "101282230"},
    {"location": "Canada", "geoId": "101174742"},
    {"location": "California, United States", "geoId": "102095887"},
    {"location": "San Francisco Bay Area", "geoId": "90000084"},
    {"location": "Singapore", "geoId": "102454443"},
    {"location": "Netherlands", "geoId": "102890719"},
    {"location": "The Randstad, Netherlands", "geoId": "90009706"},
    {"location": "France", "geoId": "105015875"},
    {"location": "Spain", "geoId": "105646813"},
    {"location": "England, United Kingdom", "geoId": "102299470"},
    {"location": "United Kingdom", "geoId": "101165590"},
    {"location": "Australia", "geoId": "101452733"},
    {"location": "Poland", "geoId": "105072130"},
    {"location": "Portugal", "geoId": "100364837"},
    {"location": "Barcelona", "geoId": "105088894"},
    {"location": "Madrid", "geoId": "100994331"},
    {"location": "Brazil", "geoId": "106057199"},
    {"location": "Minas Gerais, Brazil", "geoId": "100358611"},
    {"location": "United Arab Emirates", "geoId": "104305776"},
    {"location": "Japan", "geoId": "103121230"},
    {"location": "Egypt", "geoId": "106155005"},
    {"location": "Vienna, VA", "geoId": "101627305"},
]


class LnSearch:
    """Discover company URLs via LinkedIn Guest Job APIs."""

    @staticmethod
    def get_search_params(keyword: str, start: int, geo: dict = None) -> Dict[str, str]:
        """Constructs params for the LinkedIn Guest Job API."""
        if not geo:
            geo = random.choice(GEO_IDs)
        return {
            "keywords": keyword,
            "location": geo["location"],
            "geoId": geo["geoId"],
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
            handle = url.split("/company/")[1].split("/")[0].split("?")[0].rstrip("/")
            return handle
        except (IndexError, AttributeError):
            return None

    @staticmethod
    def get_companies(keyword: str, seen: Set) -> tuple[list, set]:
        max_range = 100 if keyword else 500
        comp_list = list()
        # Exponential Decay - index 0 a weight of 10, and index 1 onwards a weight of 1
        weights = [10 if i == 0 else 1 for i in range(len(GEO_IDs))]
        geo = random.choices(GEO_IDs, weights=weights, k=1)[0]
        logger.info(f"Searching in: {geo}")
        for start in range(0, max_range, 25):
            try:
                params = LnSearch.get_search_params(keyword, start, geo)
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
                        handle = LnSearch.get_handle(link)
                        # If handle is already in seen, we skip it entirely.
                        if not handle or handle in seen:
                            continue
                        comp_list.append({"name": name, "linkedin": link})
                        seen.add(handle)

                logger.info(
                    f"Keyword '{keyword}' at {start}: List is now {len(comp_list)}"
                )
                time.sleep(random.uniform(0.5, 2.0))

            except Exception as e:
                logger.error(f"Exception during search crawl: {e}")
                time.sleep(random.uniform(1.0, 3.0))
        return comp_list, seen


class FinancialService:
    """Handles Ticker lookups and Stock market performance data."""

    @staticmethod
    def find_ticker(name: str) -> Optional[str]:
        if not name:
            return None
        try:
            search = yf.Search(name, max_results=5)
            equities = [q for q in search.quotes if q.get("quoteType") == "EQUITY"]
            time.sleep(random.uniform(0.5, 1.0))
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
    def log_headcount(history: dict, handle: str, count: int) -> dict:
        """Records the employee count for today in the history file."""
        if not handle or not count:
            return

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
        return history

    @staticmethod
    def get_trend(history: dict, handle: str, days: int) -> Optional[float]:
        """Calculates growth % over a period with noise filters."""
        company_history = history.get(handle, [])
        if len(company_history) < 2:
            return None

        latest = company_history[-1]
        target_date = now - timedelta(days=days)

        # Find nearest historical record
        try:
            past = min(
                company_history,
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
    def aggregate_global_history() -> None:
        """Aggregates headcount for all companies into a global daily index by carrying values forward."""
        logger.info("Calculating Global Headcount Index")
        history = GrowthAnalytics._load_history_file()
        if not history:
            return

        # Collect all unique dates and map updates by date
        # date_updates = { "2026-04-01": { "handle1": 100, "handle2": 200 } }
        all_dates = set()
        date_updates = {}

        for handle, records in history.items():
            if handle == "history":
                continue
            for entry in records:
                d, c = entry.get("d"), entry.get("c")
                if d and c is not None:
                    all_dates.add(d)
                    if d not in date_updates:
                        date_updates[d] = {}
                    date_updates[d][handle] = c

        # Sort dates chronologically
        sorted_dates = sorted(list(all_dates))

        # Track the "Current State" of the entire market
        # This keeps the last known count for EVERY company
        last_known_market_state = {}
        global_records = []

        for d in sorted_dates:
            # Update our market state with companies scraped ON this specific date
            if d in date_updates:
                last_known_market_state.update(date_updates[d])

            # The total for today is the sum of EVERY company's last known count
            total_employment_today = sum(last_known_market_state.values())

            global_records.append({"d": d, "c": total_employment_today})

        # Save the "Smooth" history back
        history["history"] = global_records
        GrowthAnalytics._save_history_file(history)
        logger.info(
            f"Global History Index Updated: {len(global_records)} data points in {HISTORY_FILE.name}"
        )

    @staticmethod
    def generate_market_chart_data() -> None:
        """Calculates global trends using a calendar-based 7-day window to handle irregular runs."""
        history_file = GrowthAnalytics._load_history_file()
        raw_history = history_file.get("history", [])

        if len(raw_history) < 2:
            logger.warning("Insufficient data for charting history.")
            return
        # Load the full data to calculate concentrations
        if not DATA_FILE.exists():
            logger.warning(f"{DATA_FILE} missing. No existing data found!")
            return

        # Load existing data
        current_data = DataCoordinator._load_data_file()

        # Define your specific buckets
        bucket_keys = [
            "1-10",
            "11-50",
            "51-200",
            "201-1000",
            "1001-5000",
            "5001-10000",
            "10001-50000",
            "50001-100000",
            "100001+",
        ]

        stats = {
            "total_emp": 0,
            "pub": {"emp_now": 0, "emp_prev": 0.0, "count": 0},
            "priv": {"emp_now": 0, "emp_prev": 0.0, "count": 0},
            "buckets": {k: 0 for k in bucket_keys},  # Tracks total headcount
            "comp_counts": {k: 0 for k in bucket_keys},  # Tracks number of companies
        }
        breadth = {"hiring": 0, "stable": 0, "shrinking": 0}
        bucket_stats = {k: {"emp_now": 0, "emp_prev": 0.0} for k in bucket_keys}

        for c in current_data:
            count = (
                int(c.get("ln_count", 0)) if str(c.get("ln_count", 0)).isdigit() else 0
            )
            # Skip blank data or inactive companies from charts
            if count == 0 or not c.get("active", True):
                continue

            # Calculate what the headcount was 30 days ago based on the delta
            # Formula: Previous = Current / (1 + (Delta / 100))
            delta_30 = c.get("Δ_30d")
            prev_count = count
            if delta_30 is not None:
                prev_count = count / (1 + (delta_30 / 100))
                # Track market overall status
                if delta_30 > 0.5:
                    breadth["hiring"] += 1
                elif delta_30 < -0.5:
                    breadth["shrinking"] += 1
                else:
                    breadth["stable"] += 1

            key = "pub" if c.get("public", False) else "priv"
            stats[key]["emp_now"] += count
            stats[key]["emp_prev"] += prev_count
            stats[key]["count"] += 1
            stats["total_emp"] += count

            # Map to your specific categories
            if count <= 10:
                b = "1-10"
            elif count <= 50:
                b = "11-50"
            elif count <= 200:
                b = "51-200"
            elif count <= 1000:
                b = "201-1000"
            elif count <= 5000:
                b = "1001-5000"
            elif count <= 10000:
                b = "5001-10000"
            elif count <= 50000:
                b = "10001-50000"
            elif count <= 100000:
                b = "50001-100000"
            else:
                b = "100001+"
            stats["buckets"][b] += count
            stats["comp_counts"][b] += 1

            if b in bucket_stats and delta_30 is not None:
                bucket_stats[b]["emp_now"] += count
                bucket_stats[b]["emp_prev"] += prev_count

        # --- GROWTH LEADERS ANALYSIS ---
        # Filter: Active, Public or Private, and size > 500 (to ignore tiny teams)
        # Sort by: 30-day growth delta (Δ_30d)
        growth_candidates = [
            {
                "name": c.get("name"),
                "size": int(c.get("ln_count", 0)),
                "growth_30d": c.get("Δ_30d", 0) or 0,
                "growth_90d": c.get("Δ_90d", 0) or 0,
            }
            for c in current_data
            if c.get("active", True)
            and str(c.get("ln_count", "0")).isdigit()
            and int(c.get("ln_count", 0)) >= 500  # Ignore companies < 500 employees
            and c.get("Δ_30d") is not None
        ]

        # Sort by highest 30-day growth and take the Top 10
        top_hirers = sorted(
            growth_candidates, key=lambda x: x["growth_30d"], reverse=True
        )[:10]

        # Formula: Absolute Change = Current - (Current / (1 + (Delta/100)))
        abs_growth_candidates = []
        for c in current_data:
            delta_30 = c.get("Δ_30d")
            count = int(c.get("ln_count", 0))
            if delta_30 and count >= 500:
                prev_count = count / (1 + (delta_30 / 100))
                added = round(count - prev_count)
                abs_growth_candidates.append(
                    {"name": c.get("name"), "added": added, "total": count}
                )

        top_job_creators = sorted(
            abs_growth_candidates, key=lambda x: x["added"], reverse=True
        )[:10]

        def get_pct(current, previous, ndigits=2):
            """Calculates percentage change with safety check for zero."""
            if not previous or previous <= 0:
                return 0.0
            return round(((current - previous) / previous) * 100, ndigits)

        def get_share(part, total, ndigits=2):
            """Calculates share of total with safety check for zero."""
            if not total or total <= 0:
                return 0.0
            return round((part / total) * 100, ndigits)

        # Finalize the "Snapshot"
        total = stats["total_emp"]
        pub, priv = stats["pub"], stats["priv"]
        snapshot = {
            "company_distribution": stats["comp_counts"],
            "company_employees": stats["buckets"],
            "market_breadth": breadth,
            "top_hirers": top_hirers,
            "top_job_creators": top_job_creators,
            "bucket_momentum": {
                k: get_pct(v["emp_now"], v["emp_prev"]) for k, v in bucket_stats.items()
            },
            "aggregate_momentum": {
                "public_avg_30d_chg": get_pct(pub["emp_now"], pub["emp_prev"], 3),
                "private_avg_30d_chg": get_pct(priv["emp_now"], priv["emp_prev"], 3),
            },
            "concentration_pct": {
                k: get_share(v, total) for k, v in stats["buckets"].items()
            },
            "ownership_split": {
                "public_emp_pct": get_share(pub["emp_now"], total),
                "private_emp_pct": get_share(priv["emp_now"], total),
            },
        }

        # --- MOVING AVERAGE LOGIC ---
        # Pre-parse dates once to avoid repeated string-to-date conversion in the loop
        parsed_history = []
        chart_points = []
        for item in raw_history:
            try:
                parsed_history.append(
                    {
                        "d_obj": datetime.strptime(item["d"], "%Y-%m-%d"),
                        "d_str": item["d"],
                        "c": item["c"],
                    }
                )
            except (ValueError, KeyError):
                continue

        for i, current in enumerate(parsed_history):
            # Define the 7-day calendar window ending at the current date
            window_end = current["d_obj"]
            window_start = window_end - timedelta(days=7)

            # Find all records that fall within this ACTUAL 7-day calendar window
            # This handles gaps where the script didn't run
            window_data = [
                item["c"]
                for item in parsed_history[: i + 1]
                if window_start <= item["d_obj"] <= window_end
            ]

            # Calculate Moving Average (MA)
            current_ma = sum(window_data) // len(window_data)

            # Calculate % Change vs the previous MA in the sequence
            pct_change = 0.0
            if i > 0:
                prev_ma = chart_points[-1]["ma"]
                if prev_ma > 0:
                    # Calculate growth velocity between recorded points
                    pct_change = round(((current_ma - prev_ma) / prev_ma) * 100, 3)
            chart_points.append(
                {"d": current["d_str"], "ma": current_ma, "chg": pct_change}
            )

        try:
            output_data = {"snapshot": snapshot, "history": chart_points}
            with open(CHARTS_DATA_FILE, "w") as f:
                json.dump(output_data, f, indent=2)
            logger.info(
                f"Chart data updated with history & snapshot in {CHARTS_DATA_FILE.name}"
            )
        except Exception as e:
            logger.error(f"Failed to save charts_data.json: {e}")

    @staticmethod
    def _load_history_file() -> dict:
        """Reads CSV and converts it back into the dictionary format used by the script."""
        history = {}
        if not HISTORY_FILE.exists():
            logger.warning(f"{HISTORY_FILE.name} not found!")
            return {}

        try:
            with open(HISTORY_FILE, mode="r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    handle = row["handle"]
                    if handle not in history:
                        history[handle] = []
                    history[handle].append({"d": row["date"], "c": int(row["count"])})
            return history
        except Exception as e:
            logger.error(f"Failed to read CSV history: {e}")
            return {}

    @staticmethod
    def _save_history_file(data: dict) -> None:
        """Flattens the dictionary and saves it into a compact CSV format, sorted by Handle and Date."""
        try:
            with open(HISTORY_FILE, mode="w", encoding="utf-8", newline="") as f:
                writer = csv.writer(f, quoting=csv.QUOTE_ALL)
                # Header row for csv file
                writer.writerow(["handle", "date", "count"])

                # Sort handles to keep CSV organized
                for handle in sorted(data.keys()):
                    # Sort the records per handle by the date string "d"
                    sorted_records = sorted(data[handle], key=lambda x: x["d"])
                    for record in sorted_records:
                        writer.writerow([handle, record["d"], record["c"]])
            logger.info(f"Saved history to {HISTORY_FILE.name}")
        except Exception as e:
            logger.error(f"Failed to save CSV history: {e}")


class CompanyParser:
    """Save metadata from individual company pages"""

    ticker_error_count = 0

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
    def get_company_details(
        i: int, company: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        name, url = company.get("name"), company.get("linkedin")
        # avoid blank names and unwanted company names
        if not name or any(word in name.lower() for word in avoid_words):
            return None
        # avoid blank urls and school page urls
        if not url or "linkedin.com/school" in url:
            return None

        try:
            resp = requests.get(
                url,
                headers={"User-Agent": USER_AGENT},
                timeout=15,
                impersonate="chrome",
            )
            status = resp.status_code
            logger.info(f"Detail Fetch #{i} | {status=} | {name}")
            if status == 404:
                logger.warning(
                    f"Company page not found (404): {name}. Marking as inactive!"
                )
                company["active"] = False
                time.sleep(random.uniform(1.0, 3.0))
                return company

            if status != 200:
                logger.error(f"Failed to load: {url}")
                time.sleep(random.uniform(1.0, 3.0))
                return company

            # Parse the html response
            soup = BeautifulSoup(resp.text, "html.parser")

            # Website Parsing
            website = CompanyParser._extract_website(soup)
            if website and "http" in website:
                company["website"] = website

            # Headcount Parsing
            if emp_count := CompanyParser._extract_headcount(soup):
                company["emp_count"] = emp_count

            # Linkedin Employee Count
            if ln_count := CompanyParser._extract_ln_headcount(soup):
                company["ln_count"] = ln_count

            # Organization Type (Public/Private)
            is_public, ticker = CompanyParser._extract_org_type(
                soup, name, company.get("ticker")
            )
            company["public"] = is_public
            company["ticker"] = ticker

            time.sleep(random.uniform(0.5, 1.0))
            return company
        except Exception as e:
            logger.error(f"Scrape failed for {name}: {e}")
            time.sleep(random.uniform(1.0, 3.0))
        return company

    @staticmethod
    def _extract_website(soup: BeautifulSoup) -> str | None:
        # Logic for website parsing only
        for a in soup.find_all("a", href=True):
            if "websitelink" in str(a.get("aria-describedby", "")).lower():
                link = a.get_text(strip=True).split("?")[0].rstrip("/")
                if link and not link.startswith("http"):
                    link = f"https://{link}"
                if not link or len(link) < 12:
                    logger.error(f"Invalid website: '{link}'")
                    link = ""
                if link:
                    return str(link)
                break

    @staticmethod
    def _extract_headcount(soup: BeautifulSoup) -> str | None:
        # Logic for emp_count only
        size_div = soup.find("div", {"data-test-id": "about-us__size"})
        if size_div and (dd := size_div.find("dd")):
            return CompanyParser.get_employee_count(dd.get_text())

    @staticmethod
    def _extract_ln_headcount(soup: BeautifulSoup) -> str | None:
        # Logic for ln_count only
        cta_span = soup.find("span", {"data-test-id": "view-all-employees-cta"})
        if cta_span and (p := cta_span.find("p")):
            return CompanyParser.get_employee_count(p.get_text())

    @staticmethod
    def _extract_org_type(
        soup: BeautifulSoup, name: str, existing_ticker: str | None
    ) -> tuple:
        # Logic for public or private org and ticker symbol
        is_public = False
        ticker = existing_ticker
        org_div = soup.find("div", {"data-test-id": "about-us__organizationType"})
        if org_div and (dd := org_div.find("dd")):
            is_public = "public" in dd.get_text().lower()
            if is_public:
                # ONLY call find_ticker if it's missing or empty
                if not existing_ticker or existing_ticker == "":
                    if CompanyParser.ticker_error_count < 50:
                        ticker = FinancialService.find_ticker(name)
                        if ticker:
                            logger.info(f"New Ticker Found: {name} -> {ticker}")
                        else:
                            CompanyParser.ticker_error_count += 1
                    else:
                        logger.info("Skipping ticker lookup!")
                else:
                    logger.info(f"Ticker exists for {name}: {ticker}")
        if existing_ticker and not ticker:
            ticker = existing_ticker
        return (is_public, ticker)


class DataCoordinator:
    """Manages data flow, merging, and trend calculation and injection."""

    summary = "## Results\n\n\n"

    @staticmethod
    def process_urls(url_list, TIME_LIMIT) -> None:
        """Get Data for each URL and save it in JSON"""
        DataCoordinator.summary += f"Total target companies: {len(url_list)}\n"
        logger.info(f"Started run with total: {len(url_list)} targets")
        logger.info("------------------------------------------------")
        start_time = time.time()
        # Parse data & Enrich
        processed = []
        processed_count = 0
        total_saved = 0
        for i, target in enumerate(url_list):
            # Check the clock at the start of every iteration
            elapsed = time.time() - start_time
            if elapsed > TIME_LIMIT:
                limit = f"({round(elapsed/3600, 2)} hours)"
                logger.warning(f"Time limit reached :{limit}. Stopping run!")
                break

            enriched = CompanyParser.get_company_details(i, target)
            if enriched:
                processed.append(enriched)

            # save periodically to json file
            if (i + 1) % 10 == 0:
                total_saved = DataCoordinator._save_to_disk(processed)
                processed_count += len(processed)
                processed = []

        # Final save for the remaining processed data
        if processed and len(processed) > 0:
            total_saved = DataCoordinator._save_to_disk(processed)
            processed_count += len(processed)

        DataCoordinator.summary += f"Total updated companies: {processed_count}\n"
        DataCoordinator.summary += f"Final saved company count: **{total_saved}**\n"
        logger.info("------------------------------------------------")
        total_time = round((time.time() - start_time) / 3600, 2)
        logger.info(f"Run completed in {total_time} hours.")
        DataCoordinator.summary += f"Run completed in {total_time} hours.\n"
        logger.info("------------------------------------------------")

    @staticmethod
    def _get_target_urls() -> List[Dict]:
        targets, seen = [], set()

        # If REFRESH_ALL is True, this adds existing company data to targets.
        # If False, it just adds them to 'seen' so they are skipped from other methods
        targets, seen = DataCoordinator._get_existing_comp(REFRESH_ALL, targets, seen)

        # Add from local jobs for every run
        targets, seen = DataCoordinator._get_jobs_data(REFRESH_ALL, targets, seen)

        # Discover new companies from job posts
        if CHECK_JOB_POSTS:
            targets, seen = DataCoordinator._find_new_comp(targets, seen)

        # Add the Indian Public Companies (URL List)
        if FIND_LISTED:
            targets, seen = DataCoordinator._get_indian_listed_companies(targets, seen)

        # TODO:Get linkedin page links from
        # https://www.linkedin.com/hubs/top-companies
        # https://www.linkedin.com/hubs/top-startups/

        return targets

    @staticmethod
    def _get_jobs_data(refresh, targets, seen) -> tuple:
        if not JOBS_DATA.exists():
            logger.warning(f"{JOBS_DATA} missing. Skipping local jobs data!")
            return targets, seen
        logger.info(f"Finding new companies from {JOBS_DATA.name}")
        comp_list = list()
        with open(JOBS_DATA, "r") as f:
            for j in json.load(f).get("data", []):
                url = LnSearch.normalize_url(j.get("companyUrl"))
                handle = LnSearch.get_handle(url)
                if not handle:
                    continue
                # If handle is already in seen, we skip it entirely.
                if handle in seen:
                    continue
                if not refresh:
                    emp_count = j.get("employeeCount", "-")
                    # skip companies with employee count data
                    if emp_count and emp_count != "-":
                        seen.add(handle)
                        continue
                if url and "linkedin.com" in url:
                    comp_list.append({"name": j.get("company"), "linkedin": url})
                    seen.add(handle)
        logger.info(f"Found {len(comp_list)} companies from {JOBS_DATA.name}")
        return (comp_list + targets), seen

    @staticmethod
    def _get_existing_comp(refresh, targets, seen) -> tuple:

        if not DATA_FILE.exists():
            logger.warning(f"{DATA_FILE} missing. No existing data found!")
            return targets, seen

        # Load existing data
        current_data = DataCoordinator._load_data_file()
        for c in current_data:
            handle = LnSearch.get_handle(c.get("linkedin", ""))
            if not handle:
                continue

            # ALWAYS add to seen so we don't re-discover them as "new"
            seen.add(handle)

            # ONLY add to targets if it's a refresh day (or if it meets recheck criteria)
            if refresh:
                should_refresh = DataCoordinator._should_refresh(c)
                if should_refresh:
                    # Pass the whole dict to keep existing tickers/metadata
                    targets.append(c)

        if refresh:
            logger.info(f"Added {len(targets)} existing companies to Refresh")
        DataCoordinator.summary += f"Initial existing company count: **{len(seen)}**\n"

        mid = len(targets) // 2
        bottom_half = targets[mid:]
        # Shuffle only the bottom half of extracted list for randomness
        random.shuffle(bottom_half)
        # Re-assign it back to the original list's bottom half range
        targets[mid:] = bottom_half
        return targets, seen

    @staticmethod
    def _should_refresh(company: dict) -> bool:
        """Return True if a specific company needs data refreshed today"""
        # Default to a long time ago if no date exists so it definitely refreshes
        last_upd_str = company.get("last_updated")
        # Handle missing date: Refresh immediately
        if not last_upd_str:
            return True
        try:
            # Parse the date string and replace 'Z' with '+00:00' for older Python compatibility
            last_upd = datetime.fromisoformat(last_upd_str.replace("Z", "+00:00"))
            # Ensure last_upd is aware
            if last_upd.tzinfo is None:
                last_upd = last_upd.replace(tzinfo=timezone.utc)
            # date now has timezone.utc
            days_old = (now - last_upd).days
        except ValueError:
            # If date is corrupted, refresh the data
            logger.warning("last_updated date may be invalid")
            return True

        # Get employee count (default to 0 if missing)
        ln_count_str = str(company.get("ln_count", 0))
        ln_count = int(ln_count_str) if ln_count_str.isdigit() else 0

        # Check inactive companies every 10 days regardless of size
        if not company.get("active", True):
            return days_old >= 10
        # Large companies: Refresh every day
        if ln_count > 50:
            return True
        # Small companies (<=50): Only refresh if at least 2 days old
        return days_old >= 2

    @staticmethod
    def _find_new_comp(targets, seen) -> tuple:
        # Find companies from job posts
        logger.info("Finding new companies from current Linkedin jobs!")
        comp_list = list()
        # Load Keywords from txt file
        keyword_list = [""]
        if not KEYWORDS_FILE.exists():
            logger.warning(f"{KEYWORDS_FILE} not found. Skipping job search!")
        else:
            with open(KEYWORDS_FILE, "r") as f:
                keyword_list += [line.strip() for line in f if line.strip()]

        # Ensure keyword_list unique
        keyword_list = list(set(keyword_list))
        logger.info(f"Total Keywords for Searching: {len(keyword_list)}")
        # make the list randomly ordered
        random.shuffle(keyword_list)
        for i, keyword in enumerate(keyword_list):
            logger.info(f"Searching with keyword #{i}: '{keyword}'")
            new_comps, seen = LnSearch.get_companies(keyword, seen)
            comp_list += new_comps
        logger.info(f"Found total {len(comp_list)} companies from open jobs")
        return (comp_list + targets), seen

    @staticmethod
    def _get_indian_listed_companies(targets, seen) -> tuple:
        """Fetches, parses, and enriches official Indian listed companies with dual-listing protection."""
        logger.info("Fetching official NSE and BSE lists...")
        # Track websites to avoid dual-listing overhead
        seen_websites = set()
        symbol_list = DataCoordinator._get_symbols_from_bourse()
        random.shuffle(symbol_list)

        # Enrichment with Cross-Source Deduplication
        if not symbol_list:
            logger.error("No Symbols found")
            return targets, seen

        if len(symbol_list) < 100:
            logger.error("Less than 100 symbols found")
            return targets, seen

        # GET ALREADY KNOWN TICKERS
        known_tickers = set()
        if DATA_FILE.exists():
            with open(DATA_FILE, "r") as f:
                known_tickers = {
                    c.get("ticker") for c in json.load(f) if c.get("ticker")
                }

        # FILTER: Only try to load symbols we dont already have
        new_symbols = [s for s in symbol_list if s not in known_tickers]
        logger.info(
            f"Found {len(symbol_list)} symbols. {len(known_tickers)} already in JSON. {len(new_symbols)} new ones to discover."
        )
        if not new_symbols:
            return targets, seen

        MAX_PROCESS = 200
        error_count = 0
        # Use random.sample to get a diverse subset across the alphabet
        if len(new_symbols) > MAX_PROCESS:
            symbol_sample = random.sample(new_symbols, MAX_PROCESS)
        else:
            symbol_sample = new_symbols
        logger.info(f"Screening a subset of tickers: {len(symbol_sample)}")

        for sym in symbol_sample:
            time.sleep(random.uniform(0.7, 1.0))
            try:
                company_data = None
                if error_count < MAX_PROCESS:
                    # The helper now returns website early to allow for deduplication
                    company_data = DataCoordinator._enrich_from_screener(sym)
                if not company_data:
                    error_count += 1
                    continue

                # Deduplicate by Website (catches dual-listed companies)
                web_domain = company_data["website"].replace("www.", "").lower()
                if web_domain in seen_websites:
                    logger.info(f"Skipping duplicate via website: {web_domain} ({sym})")
                    continue

                # Deduplicate by LinkedIn handles already in json
                url = LnSearch.normalize_url(company_data["linkedin"])
                handle = LnSearch.get_handle(url)
                if not handle:
                    continue
                # If handle is already in seen, we skip it entirely.
                if handle in seen:
                    continue
                if company_data:
                    targets = [company_data] + targets
                seen.add(handle)
                seen_websites.add(web_domain)
                logger.info(f"Added: {company_data['name']} | Ticker: {sym}")
            except Exception:
                continue

        return targets, seen

    @staticmethod
    def _get_symbols_from_bourse() -> list:
        """Get Public listed company ticker symbols from NSE and BSE"""
        symbols = set()
        with requests.Session() as session:
            # Parse NSE (Series 'EQ' only)
            try:
                resp = session.get(NSE_URL, impersonate="chrome", timeout=15)
                df_nse = pd.read_csv(io.StringIO(resp.text))
                nse_symbols = df_nse[df_nse[" SERIES"] == "EQ"]["SYMBOL"].tolist()
                symbols.update([f"{s}.NS" for s in nse_symbols])
                logger.info(f"Found {len(nse_symbols)} symbols from NSE")
            except Exception as e:
                logger.error(f"NSE CSV Parse Error: {e}")

            #  Parse BSE (Scrip Code)
            try:
                resp = session.get(BSE_URL, impersonate="chrome", timeout=15)
                csv_content = resp.text
                df_bse = pd.read_csv(io.StringIO(csv_content))
                #  Check if the required column is missing
                if "Scrip code" not in df_bse.columns:
                    df_bse = pd.read_csv(io.StringIO(csv_content), skiprows=1)
                bse_codes = df_bse["Scrip code"].dropna().tolist()
                symbols.update([f"{s}.BO" for s in bse_codes])
                logger.info(f"Found {len(bse_codes)} symbols from BSE")
            except Exception as e:
                logger.error(f"BSE CSV Parse Error: {e}")

        return list(symbols)

    @staticmethod
    def _enrich_from_screener(symbol: str) -> Optional[Dict]:
        """Scrapes Screener to find the official website."""
        # Use only the prefix for Screener (works for both NSE symbol and BSE code)
        ticker = symbol.split(".")[0]
        url = f"https://www.screener.in/company/{ticker}/"

        try:
            logger.info(f"Loading {url=}")
            resp = requests.get(url, impersonate="chrome", timeout=10)
            if resp.status_code != 200:
                logger.error(f"Error fetching {url=} | Status: {resp.status_code}")
                return None

            soup = BeautifulSoup(resp.text, "html.parser")

            # Extract Website Link
            website = None
            links_container = soup.find("div", class_="company-links")
            if links_container:
                if a_tag := links_container.find("a", href=True):
                    website = a_tag["href"].strip().split("?")[0].rstrip("/")

            if not website:
                logger.error(f"Website NOT found in {url=}")
                return None

            # Get Name
            name_tag = soup.find("h1")
            name = name_tag.get_text(strip=True) if name_tag else ticker

            # Find LinkedIn from the company website
            li_url = DataCoordinator._find_linkedin_on_website(website)
            if not li_url:
                logger.error(f"Linkedin url NOT found in {website}")
            if li_url:
                return {
                    "name": name,
                    "linkedin": li_url,
                    "website": website,
                    "ticker": symbol,
                    "public": True,
                }

        except Exception as e:
            logger.error(f"Screener error for {symbol}: {e}")
        return None

    @staticmethod
    def _extract_linkedin_url(soup: BeautifulSoup) -> Optional[str]:
        """Helper to find a LinkedIn company link within a soup object."""
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "linkedin.com/company/" in href:
                # Everything after "company/"
                base, _, tail = href.partition("company/")
                # Keep only the first segment of that tail
                company_id = tail.split("/")[0].split("?")[0].split("#")[0]
                return f"{base}company/{company_id}"
        return None

    @staticmethod
    def _find_linkedin_on_website(url: str) -> Optional[str]:
        """Scans homepage and optionally a contact page for LinkedIn links."""
        try:
            logger.info(f"Loading {url=}")
            resp = requests.get(url, impersonate="chrome", timeout=20)
            if resp.status_code != 200:
                logger.warning(f"Error loading {url}")
                return None

            soup = BeautifulSoup(resp.text, "html.parser")

            # Try to find it on the homepage immediately
            if link := DataCoordinator._extract_linkedin_url(soup):
                return link

            # If not found, look for a contact/about page link
            contact_keywords = [
                "contact",
                "get-in-touch",
                "reach-us",
                "support",
                "help",
                "about",
                "who-we-are",
                "company",
                "our-story",
                "team",
                "leadership",
                "press",
                "media",
                "connect",
                "social",
            ]
            contact_urls = []
            parsed_uri = urlparse(url)
            for a in soup.find_all("a", href=True):
                href = a["href"].lower()
                # Handle relative URLs (e.g., /contact -> https://site.com/contact)
                full_url = urljoin(url, href)
                # skip if url found is not of current site
                if urlparse(full_url).netloc != parsed_uri.netloc:
                    continue
                if any(k in href for k in contact_keywords):
                    contact_urls.append(full_url)

            # Scan the contact page if found
            if contact_urls:
                # deduplicate and limit to 10 urls max per site
                contact_urls = list(set(contact_urls))
                random.shuffle(contact_urls)
                for contact_url in contact_urls[:10]:
                    if contact_url != url:
                        logger.info(f"Loading {contact_url=}")
                        c_resp = requests.get(
                            contact_url, impersonate="chrome", timeout=20
                        )
                        if c_resp.status_code == 200:
                            c_soup = BeautifulSoup(c_resp.text, "html.parser")
                            if ln := DataCoordinator._extract_linkedin_url(c_soup):
                                return ln

        except Exception as e:
            logger.warning(f"Error loading {url=}: {e}")
        return None

    @staticmethod
    def _sync_temp_data() -> None:
        """Merges Tickers and new entries from TEMP_FILE into DATA_FILE."""
        if not TEMP_FILE.exists():
            return
        if not DATA_FILE.exists():
            return
        logger.info(f"Syncing data from {TEMP_FILE.name}")
        try:
            with open(TEMP_FILE, "r") as f:
                temp_data = json.load(f)
            master_list = DataCoordinator._load_data_file()
            master_map = {
                LnSearch.get_handle(c.get("linkedin")): c
                for c in master_list
                if LnSearch.get_handle(c.get("linkedin"))
            }
            updated_count = 0
            for item in temp_data:
                handle = LnSearch.get_handle(item.get("linkedin"))
                if handle in master_map:
                    # Only update these specific fields if they exist in the temp file
                    if "ticker" in item:
                        master_map[handle]["ticker"] = item["ticker"]
                    if "public" in item:
                        master_map[handle]["public"] = item["public"]
                    updated_count += 1

            if updated_count > 0:
                with open(DATA_FILE, "w") as f:
                    json.dump(list(master_map.values()), f, indent=2)
                logger.info(f"Sync complete: Updated {updated_count} companies.")
        except Exception as e:
            logger.error(f"Failed to sync temp file: {e}")

    @staticmethod
    def _load_data_file() -> list:
        if DATA_FILE.exists():
            with open(DATA_FILE, "r") as f:
                return json.load(f)
        else:
            logger.warning(f"{DATA_FILE} file not found")
        return []

    @staticmethod
    def _save_to_disk(new_batch: List[Dict], last_updated_date=True) -> int:
        if not new_batch:
            return 0

        # Load existing data
        current_data = DataCoordinator._load_data_file()
        # Read history file
        history = GrowthAnalytics._load_history_file()

        # map each entry based on LinkedIn HANDLE
        data_map = {}
        for c in current_data:
            handle = LnSearch.get_handle(c.get("linkedin", ""))
            if handle:
                data_map[handle] = c

        for item in new_batch:
            # Clean the item: Remove keys where value is None or "null" string
            clean = {k: v for k, v in item.items() if v is not None}
            handle = LnSearch.get_handle(clean.get("linkedin", ""))
            if not handle:
                logger.warning(
                    f"Skipping item with no LinkedIn handle: {item.get('name')}"
                )
                continue

            ln_count = clean.get("ln_count")
            # Log History & Calculate Trends
            if handle and ln_count and str(ln_count).isdigit():
                history = GrowthAnalytics.log_headcount(history, handle, int(ln_count))
                if trend_30 := GrowthAnalytics.get_trend(history, handle, 30):
                    clean["Δ_30d"] = trend_30
                if trend_90 := GrowthAnalytics.get_trend(history, handle, 90):
                    clean["Δ_90d"] = trend_90
                if trend_365 := GrowthAnalytics.get_trend(history, handle, 365):
                    clean["Δ_365d"] = trend_365
                clean["sparkline"] = GrowthAnalytics.generate_sparkline_svg(clean)

            # Merge based on Handle
            if handle in data_map:
                data_map[handle].update(clean)
                if last_updated_date:
                    t = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
                    data_map[handle]["last_updated"] = t
            else:
                if last_updated_date:
                    t = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
                    clean["last_updated"] = t
                data_map[handle] = clean

        # Save headcount history file
        GrowthAnalytics._save_history_file(history)

        # One last pass to ensure no nulls exist in the final map
        final_list = []
        for entry in data_map.values():
            final_list.append({k: v for k, v in entry.items() if v is not None})

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
        final = sorted(final_list, key=sort_logic)
        with open(DATA_FILE, "w") as f:
            json.dump(final, f, indent=2)
        logger.info(f"Saved {len(final)} unique companies to {DATA_FILE}")
        return len(final)

    @staticmethod
    def append_github_step_summary() -> None:
        """Append Markdown or plain text to the GitHub Actions job summary"""
        path = os.environ.get("GITHUB_STEP_SUMMARY")
        if path:
            try:
                Path(path).open("a", encoding="utf-8").write(DataCoordinator.summary)
            except OSError as e:
                print(f"Error writing summary: {e}", flush=True)
        else:
            print("GITHUB_STEP_SUMMARY not found")

    @staticmethod
    def run() -> None:
        # Set the timer to under 6 hours (Github actions limit)
        MAX_RUNTIME_SECONDS = int(5.75 * 60 * 60)
        # safety buffer for 10 mins
        TIME_LIMIT = MAX_RUNTIME_SECONDS - 600

        # Discover URLs
        url_list = DataCoordinator._get_target_urls()
        # Process URLs and save data
        DataCoordinator.process_urls(url_list, TIME_LIMIT)

        # Calculate the Global Index after all companies are updated
        GrowthAnalytics.aggregate_global_history()
        # Generate the frontend-ready chart data
        GrowthAnalytics.generate_market_chart_data()
        # Sync data if missing or removed during run
        DataCoordinator._sync_temp_data()
        DataCoordinator.append_github_step_summary()


if __name__ == "__main__":
    DataCoordinator.run()
