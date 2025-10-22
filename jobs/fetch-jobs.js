/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const axios = require("axios").default;
const cheerio = require("cheerio");
const linkedIn = require("linkedin-jobs-api");
const randomUA = require("random-useragent");

// -------- Config you can tune ----------
const KEYWORDS = [
  "Senior QA Automation Engineer",
  "QA Automation Lead",
  "Lead QA Engineer",
  "Senior SDET (Software Development Engineer in Test)",
  "SDET Lead",
  "Test Automation Lead",
  "Performance QA Engineer",
  "Quality Engineering Lead",
  "Senior Test Engineer",
  "Automation Architect",
  "QA Manager (Automation)",
];

const BASE_QUERY = {
  location: "India",
  jobType: "full time",
  sortBy: "relevant", // relevant or recent
  dateSincePosted: "24hr",
  experienceLevel: "senior",
  //valid values: internship, entry level, associate, senior, director, executive
  limit: "20",
  page: "0",
};

const OUTPUT_FILE = path.resolve(__dirname, "jobs.json");
const HOURS_WINDOW = 6; // Add only jobs <= 6 hours old
const DAYS_TO_KEEP = 7; // purge jobs > 7 days old

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
  try {
    // Ensure /jobs exists even if repo is fresh
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(
      OUTPUT_FILE,
      JSON.stringify(list, null, 2) + "\n",
      "utf-8"
    );
  } catch (e) {
    console.error(`Failed to save ${OUTPUT_FILE}:`, e.message);
  }
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
    const headers = {
      "User-Agent":
        randomUA.getRandom() ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      Accept: "application/json, text/html",
      "Accept-Language": "en-US,en;q=0.9",
    };

    const { data } = await axios.get(url, { headers, timeout: 12000 });

    // Try to parse JSON directly
    let listedAt = null;
    let applyUrl = null;
    let description = null;

    if (typeof data === "object") {
      listedAt = data.listedAt ? new Date(data.listedAt) : null;
      applyUrl = data.applyUrl || data.companyApplyUrl || null;
      description = data.description || null;
    } else {
      // Fallback: parse HTML with cheerio
      const $ = cheerio.load(data);
      const postedText = $(".posted-time-ago__text").text().trim();
      listedAt = parseRelativeTimeToDate(postedText);

      const descHtml = $(".description__text").html();
      description = descHtml ? cheerio.load(descHtml).text() : null;
      if (description) {
        description = description
          .replace("Show more", " ")
          .replace("Show less", " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      const applyMatch = data.match(/"applyUrl"\s*:\s*"([^"]+)"/);
      if (applyMatch) {
        applyUrl = applyMatch[1].replace(/\\\//g, "/");
      }
    }
    await sleep(1000);
    return { resolvedDate: listedAt, applyUrl, description };
  } catch (err) {
    console.error("Error fetching job detail:", err.message);
    return { resolvedDate: null, applyUrl: null, description: null };
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

function clean_title(job_title) {
  if (!job_title) {
    return "";
  }
  const phrases_to_remove = ["Interesting Job Opportunity"];
  // Remove each phrase from job_title
  phrases_to_remove.forEach((phrase) => {
    job_title = job_title.replace(phrase, "");
  });
  // Remove colons and trim whitespace
  job_title = job_title.replace(/:/g, "").trim();
  return job_title;
}

function clean_company(company_name) {
  if (!company_name) {
    return "";
  }
  const phrases_to_remove = ["®", "©", "™"];
  // Remove each phrase from job_title
  phrases_to_remove.forEach((phrase) => {
    company_name = company_name.replace(phrase, "");
  });
  // Remove colons and trim whitespace
  company_name = company_name.replace(/:/g, " ").trim();
  return company_name;
}

function clean_url(url) {
  if (!url) {
    return "";
  }
  url = htmlUnescape(url);
  // Create a URL object
  const urlObj = new URL(url);
  // Get the base URL without query parameters
  const clean_url = urlObj.origin + urlObj.pathname;
  return clean_url;
}

function mergeAndCleanJobsData(output_data) {
  const existing = readExisting();
  console.log(`Existing job posts before cleanup: ${existing.length}`);

  const sevenDaysAgo = Date.now() - DAYS_TO_KEEP * 24 * 60 * 60 * 1000;
  // Filter out old posts
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

  // Use jobId as the unique key
  const byJobId = new Map();

  for (const j of prunedExisting) {
    byJobId.set(j.jobId, j);
  }

  for (const j of output_data) {
    const existingJob = byJobId.get(j.jobId);
    if (!existingJob) {
      byJobId.set(j.jobId, j);
    } else {
      const existingTime = existingJob.datePosted
        ? new Date(existingJob.datePosted).getTime()
        : 0;
      const newTime = j.datePosted ? new Date(j.datePosted).getTime() : 0;
      if (newTime > existingTime) {
        byJobId.set(j.jobId, { ...existingJob, ...j });
      }
    }
  }

  // Final sorted list
  const finalList = Array.from(byJobId.values()).sort((a, b) => {
    const ta = a.datePosted ? new Date(a.datePosted).getTime() : 0;
    const tb = b.datePosted ? new Date(b.datePosted).getTime() : 0;
    return tb - ta;
  });

  console.log(`Filtered and finalized ${finalList.length} job posts`);
  writeOutput(finalList);
  console.log(`Saved ${finalList.length} jobs to ${OUTPUT_FILE}`);
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

  let deduped = uniqueBy(gathered, (r) => r.jobUrl);
  const existingJobs = readExisting();
  const existingJobIds = new Set(existingJobs.map((j) => j.jobId));

  // Filter out jobs that already exist
  deduped = deduped.filter((job) => {
    const jobId = extractJobIdFromUrl(job.jobUrl);
    return jobId && !existingJobIds.has(jobId);
  });

  console.log(`Gathered: ${gathered.length}`);
  console.log(`Deduped: ${deduped.length}`);

  const enriched = [];
  for (const job of deduped) {
    const jobId = extractJobIdFromUrl(job.jobUrl);
    const jobUrlClean = clean_url(job.jobUrl);

    let listedAt = null;
    let applyUrl = null;
    let description = null;

    if (jobId) {
      console.log("Parsed jobId", { jobId, jobUrl: jobUrlClean });

      const detail = await fetchJobDetail(jobId);

      listedAt = detail.resolvedDate;
      applyUrl = detail.applyUrl;
      description = detail.description || "";
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
        url: job.jobUrl,
      });
    } else if (!withinLastHours(postedAt, HOURS_WINDOW)) {
      console.warn("Older than window; skipping", {
        title: job.position,
        postedAt,
      });
    } else {
      const job_title = clean_title(job.position);
      const company_name = clean_company(job.company);
      enriched.push({
        title: job_title,
        company: company_name,
        location: job.location || "India",
        type: "Full-Time",
        datePosted: postedAt ? toIsoStringUTC(postedAt) : null,
        url: applyUrl || jobUrlClean || job.jobUrl,
        source: "LinkedIn",
        sourceUrl: job.jobUrl,
        jobId,
        description,
        companyLogo: job.companyLogo || null,
        keywordMatched: job._keyword,
      });
    }
  }

  if (enriched && enriched.length) {
    console.log("Sample:", enriched[0]);
  }

  mergeAndCleanJobsData(enriched);
  
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
