/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const axios = require("axios").default;
const linkedIn = require("linkedin-jobs-api");
const randomUA = require("random-useragent");

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
  sortBy: "recent", // relevant
  dateSincePosted: "24hr",
  experienceLevel: "senior",
  //valid values: internship, entry level, associate, senior, director, executive
  limit: "25",
  page: "0",
};

const OUTPUT_FILE = path.resolve(__dirname, "jobs.json");
const HOURS_WINDOW = 6; // Add only jobs <= 6 hours old
const DAYS_TO_KEEP = 7; // purge jobs > 7 days old
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

function htmlUnescape(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractJobIdFromUrl(url) {
  if (!url) {
    return null;
  }

  const clean = htmlUnescape(url);

  // Try the most reliable / common patterns first (prefer longer numeric tokens)
  const patterns = [
    /\/jobs\/view\/(\d{6,})/i, // .../jobs/view/4300865412
    /currentJobId=(\d{6,})/i, // ?currentJobId=4300865412
    /\/jobPosting\/(\d{6,})/i, // .../jobs/api/jobPosting/4300865412
    /[?&]trk=[^&]*-(\d{6,})(?:&|$)/i, // sometimes ID appears in tracking params
  ];

  for (const re of patterns) {
    const m = clean.match(re);
    if (m) {
      return m[1];
    }
  }

  // Fallback: pick the **longest** digit run from the URL (job IDs are long)
  const allNums = clean.match(/\d+/g);
  if (allNums && allNums.length) {
    allNums.sort((a, b) => b.length - a.length);
    return allNums[0]; // longest numeric token
  }

  return null;
}

function unescapeJsonString(s) {
  return s.replace(/\\\//g, "/").replace(/\\"/g, '"');
}

function parseRelativeTimeToDate(input) {
  if (!input) {
    return null;
  }
  let t = String(input).trim().toLowerCase();

  // Normalize common variants
  // e.g., "Posted just now", "Just posted", "Just now"
  if (/(^|\s)(just\s+posted|posted\s+just\s+now|just\s+now)\b/.test(t)) {
    return new Date();
  }

  // Remove noise like "active", "posted", "about", "approximately"
  t = t.replace(/\b(active|posted|about|approximately)\b/g, "").trim();

  // Normalize abbreviations: "min" -> "minute", "mins" -> "minutes", "hr"/"hrs" -> "hour"/"hours"
  t = t
    .replace(/\bmins?\b/g, (m) => (m === "min" ? "minute" : "minutes"))
    .replace(/\bhrs?\b/g, (m) => (m === "hr" ? "hour" : "hours"));

  // Handle "a minute ago" / "an hour ago"
  t = t
    .replace(/\ban?\s+minute\b/g, "1 minute")
    .replace(/\ban?\s+hour\b/g, "1 hour");

  // "yesterday"
  if (/\byesterday\b/.test(t)) {
    const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return d;
  }

  // Now match "X minute(s)/hour(s)/day(s) ago"
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

  const d = new Date(Date.now() - ms);

  // Clamp: never allow "future" date due to skew
  if (d.getTime() > Date.now()) {
    return new Date();
  }

  return d;
}

async function fetchJobDetail(jobId) {
  const url = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;
  try {
    const header = {
      "User-Agent":
        randomUA.getRandom() ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    };

    console.log("Detail fetch URL:", url);
    const { data } = await axios.get(url, { headers: header, timeout: 12000 });

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
      // Try real HTML first
      let mSpan = txt.match(
        /<[^>]*class="[^"]*posted-time-ago__text[^"]*"[^>]*>([\s\S]*?)<\/[^>]*>/i
      );
      if (!mSpan) {
        // Fallback: entity-escaped HTML (in case the response body is encoded)
        mSpan = txt.match(
          /&lt;[^&gt;]*class="[^"]*posted-time-ago__text[^"]*"[^&gt;]*&gt;([\s\S]*?)&lt;\/[^&gt;]*&gt;/i
        );
      }
      if (mSpan) {
        postedTimeText = mSpan[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
    }

    const resolvedDate = listedAt || parseRelativeTimeToDate(postedTimeText);

    // 3) Try to extract an external apply URL when present

    let applyUrl = null;
    const mApply =
      txt.match(/"companyApplyUrl"\s*:\s*"(https?:\\\/\\\/[^"]+)"/) ||
      txt.match(/"applyUrl"\s*:\s*"(https?:\\\/\\\/[^"]+)"/);
    if (mApply) {
      applyUrl = unescapeJsonString(mApply[1]);
    }

    return { resolvedDate, applyUrl };
  } catch {
    return { resolvedDate: null, applyUrl: null };
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
  console.log(`Gathered: ${gathered.length}`);
  console.log(`Deduped: ${deduped.length}`);

  let includedCount = 0;

  const enriched = [];
  for (const job of deduped) {
    const jobUrlClean = htmlUnescape(job.jobUrl || "");
    const jobId = extractJobIdFromUrl(jobUrlClean);

    let listedAt = null;
    let applyUrl = null;

    if (jobId) {
      console.log("Parsed jobId", { jobId, jobUrl: jobUrlClean });

      const detail = jobId
        ? await fetchJobDetail(jobId)
        : { resolvedDate: null, applyUrl: null };

      listedAt = detail.resolvedDate;
      applyUrl = detail.applyUrl;
      await sleep(500);
    } else {
      console.warn("Could not parse jobId", { jobUrl: jobUrlClean });
    }

    let postedAt =
      listedAt ||
      parseRelativeTimeToDate(job.agoTime) ||
      (job.date ? new Date(`${job.date}T00:00:00Z`) : null);

    if (!postedAt) {
      console.warn("No postedAt; skipping", {
        title: job.position,
        ago: job.agoTime,
        url: job.jobUrl,
      });
    } else if (!withinLastHours(postedAt, HOURS_WINDOW)) {
      console.warn("Older than window; skipping", {
        title: job.position,
        ago: job.agoTime,
        postedAt,
      });
    } else {
      includedCount++;

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
  }

  if (enriched && enriched.length) {
    console.log("Sample:", enriched[0]);
  }

  const existing = readExisting();

  console.log(`Existing job posts before cleanup: ${existing.length}`);

  const sevenDaysAgo = Date.now() - DAYS_TO_KEEP * 24 * 60 * 60 * 1000;

  const prunedExisting = existing.filter((j) => {
    const d = j.datePosted ? new Date(j.datePosted).getTime() : 0;
    return d >= sevenDaysAgo;
  });

  console.log(
    `Removed ${existing.length - prunedExisting.length} old job posts`
  );
  console.log(
    `Jobs after cleanup (within ${DAYS_TO_KEEP} days): ${prunedExisting.length}`
  );

  const byKey = new Map();
  const keyFor = (j) => j.url || j.sourceUrl;

  for (const j of prunedExisting) {
    byKey.set(keyFor(j), j);
  }

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

  const finalList = Array.from(byKey.values()).sort((a, b) => {
    const ta = a.datePosted ? new Date(a.datePosted).getTime() : 0;
    const tb = b.datePosted ? new Date(b.datePosted).getTime() : 0;
    return tb - ta;
  });

  console.log(`Filtered and finalized ${finalList.length} job posts`);

  writeOutput(finalList);

  console.log(`Saved ${finalList.length} jobs to ${OUTPUT_FILE}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
