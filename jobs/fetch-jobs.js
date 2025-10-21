/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const axios = require("axios").default;
const linkedIn = require("linkedin-jobs-api");

// -------- Config you can tune ----------
const KEYWORDS = [
  "Senior QA Automation",
  "QA Automation Lead",
  "Lead QA",
  "Senior SDET",
  "SDET Lead",
  "Test Automation Lead",
  "Quality Engineering Lead",
  "Senior Test Engineer",
  "Automation Architect",
  "QA Manager (Automation)",
];

const BASE_QUERY = {
  location: "India",
  jobType: "full time",
  sortBy: "relevant",
  dateSincePosted: "24hr",
  experienceLevel: "senior",
  limit: "50",
  page: "0",
};

const OUTPUT_FILE = path.resolve(__dirname, "jobs.json");
const HOURS_WINDOW = 2; // keep only <= 2 hours old
const DAYS_TO_KEEP = 7; // purge > 7 days old
const DEFAULT_TYPE_LABEL = "Full-Time";

// -------- Utilities ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readExisting() {
  try {
    const data = fs.readFileSync(OUTPUT_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function writeOutput(list) {
  // Ensure /jobs exists even if repo is fresh
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(list, null, 2) + "\n", "utf-8");
}

function toIsoStringUTC(date) {
  return new Date(date).toISOString();
}

function parseAgoToDate(agoText) {
  const now = Date.now();
  const t = (agoText || "").toLowerCase();
  if (!t) {
    return null;
  }
  if (t.includes("just now")) {
    return new Date(now);
  }
  const m = t.match(/(\d+)\s+(minute|minutes|hour|hours|day|days)\s+ago/);
  if (!m) {
    return null;
  }
  const num = parseInt(m[1], 10);
  const unit = m[2].startsWith("minute")
    ? "minute"
    : m[2].startsWith("hour")
    ? "hour"
    : "day";
  const ms =
    unit === "minute"
      ? num * 60 * 1000
      : unit === "hour"
      ? num * 60 * 60 * 1000
      : num * 24 * 60 * 60 * 1000;
  return new Date(now - ms);
}

function extractJobIdFromUrl(url) {
  const m = (url || "").match(/\/jobs\/view\/(\d+)/);
  return m ? m[1] : null;
}

function unescapeJsonString(s) {
  return s.replace(/\\\//g, "/").replace(/\\"/g, '"');
}

function parsePostedTimeTextToDate(text) {
  if (!text) {
    return null;
  }
  const t = text.trim().toLowerCase();

  if (t.includes("just now")) {
    return new Date();
  }

  // Common forms seen on LinkedIn job pages: "37 minutes ago", "1 hour ago", "2 hours ago", "1 day ago"
  const m = t.match(/(\d+)\s+(minute|minutes|hour|hours|day|days)\s+ago/);
  if (!m) {
    return null;
  }

  const num = parseInt(m[1], 10);
  const unit = m[2].startsWith("minute")
    ? "minute"
    : m[2].startsWith("hour")
    ? "hour"
    : "day";

  const ms =
    unit === "minute"
      ? num * 60 * 1000
      : unit === "hour"
      ? num * 60 * 60 * 1000
      : num * 24 * 60 * 60 * 1000;

  return new Date(Date.now() - ms);
}

async function fetchJobDetail(jobId) {
  const url = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;
  try {
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      },
      timeout: 12000,
    });

    // Treat response as text so we can regex both JSON-like fields and HTML
    const txt = typeof data === "string" ? data : JSON.stringify(data);

    // 1) Prefer an exact epoch from JSON when present (listedAt)
    let listedAt = null;
    const mTime = txt.match(/"listedAt"\s*:\s*(\d{10,13})/);
    if (mTime) {
      const ts =
        mTime[1].length === 13 ? Number(mTime[1]) : Number(mTime[1]) * 1000;
      listedAt = new Date(ts);
    }

    // 2) If no listedAt, try to parse the visible relative time:
    //    Look for the .posted-time-ago__text element content in the HTML
    let postedTimeText = null;
    if (!listedAt) {
      // Grab the text node inside .posted-time-ago__text
      // The HTML varies; this regex looks for: <span class="posted-time-ago__text">TEXT</span>
      const mSpan = txt.match(
        /<[^>]*class="[^"]*posted-time-ago__text[^"]*"[^>]*>([\s\S]*?)<\/[^>]*>/i
      );
      if (mSpan) {
        // Strip tags/whitespace if nested
        const raw = mSpan[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        postedTimeText = raw;
      }
    }

    const listedOrRelative =
      listedAt || parsePostedTimeTextToDate(postedTimeText);

    // 3) Try to extract an external apply URL when present
    let applyUrl = null;
    const mApply =
      txt.match(/"companyApplyUrl"\s*:\s*"(https?:\\\/\\\/[^"]+)"/) ||
      txt.match(/"applyUrl"\s*:\s*"(https?:\\\/\\\/[^"]+)"/);
    if (mApply) {
      applyUrl = unescapeJsonString(mApply[1]);
    }

    return { listedAt: listedOrRelative, applyUrl };
  } catch {
    return { listedAt: null, applyUrl: null };
  }
}

function withinLastHours(date, hours) {
  if (!date) {
    return false;
  }
  return Date.now() - date.getTime() <= hours * 60 * 60 * 1000;
}

function uniqueBy(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = keyFn(x);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(x);
    }
  }
  return out;
}

// -------- Main pipeline ----------
(async function main() {
  const gathered = [];

  for (const kw of KEYWORDS) {
    const query = { ...BASE_QUERY, keyword: kw };
    try {
      const results = await linkedIn.query(query);
      results.forEach((r) => gathered.push({ ...r, _keyword: kw }));
    } catch (e) {
      console.error(`Query failed for keyword "${kw}":`, e.message);
    }
    await sleep(800);
  }

  const deduped = uniqueBy(gathered, (r) => r.jobUrl);

  const enriched = [];
  for (const job of deduped) {
    const jobId = extractJobIdFromUrl(job.jobUrl);
    let listedAt = null;
    let applyUrl = null;

    if (jobId) {
      const detail = await fetchJobDetail(jobId);
      listedAt = detail.listedAt;
      applyUrl = detail.applyUrl;
      await sleep(300);
    }

    let postedAt =
      listedAt ||
      parseAgoToDate(job.agoTime) ||
      (job.date ? new Date(`${job.date}T00:00:00Z`) : null);

    if (!withinLastHours(postedAt, HOURS_WINDOW)) {
      continue;
    }

    enriched.push({
      title: job.position || "",
      company: job.company || "",
      location: job.location || "India",
      type: DEFAULT_TYPE_LABEL,
      datePosted: postedAt ? toIsoStringUTC(postedAt) : null,
      url: applyUrl || job.jobUrl,

      source: "LinkedIn",
      sourceUrl: job.jobUrl,
      jobId,
      agoTime: job.agoTime || null,
      companyLogo: job.companyLogo || null,
      keywordMatched: job._keyword,
    });
  }

  const existing = readExisting();
  const sevenDaysAgo = Date.now() - DAYS_TO_KEEP * 24 * 60 * 60 * 1000;

  const prunedExisting = existing.filter((j) => {
    const d = j.datePosted ? new Date(j.datePosted).getTime() : 0;
    return d >= sevenDaysAgo;
  });

  const byKey = new Map();
  const keyFor = (j) => j.url || j.sourceUrl;

  for (const j of prunedExisting) byKey.set(keyFor(j), j);

  for (const j of enriched) {
    const k = keyFor(j);
    if (!byKey.has(k)) {
      byKey.set(k, j);
    } else {
      const curr = byKey.get(k);
      const currT = curr.datePosted ? new Date(curr.datePosted).getTime() : 0;
      const newT = j.datePosted ? new Date(j.datePosted).getTime() : 0;
      if (newT > currT) {
        byKey.set(k, { ...curr, ...j });
      }
    }
  }

  const finalList = Array.from(byKey.values()).sort(
    (a, b) => new Date(b.datePosted) - new Date(a.datePosted)
  );

  writeOutput(finalList);

  console.log(`Saved ${finalList.length} jobs to ${OUTPUT_FILE}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
