/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const axios = require("axios").default;
const cheerio = require("cheerio");
const linkedIn = require("linkedin-jobs-api");
const randomUA = require("random-useragent");
const { getJson } = require("serpapi");

// -------- Config you can tune ----------
const KEYWORDS = [
  "API Test Automation",
  "Cypress Automation Engineer",
  "Director of QA",
  "Head of Quality Engineering",
  "Lead Automation Engineer",
  "Lead QA Engineer",
  "Mobile Automation Engineer",
  "Performance QA Engineer",
  "Performance Test Engineer",
  "Playwright Automation",
  "Principal Automation Engineer",
  "Principal Quality Engineer",
  "Principal SDET",
  "Python Automation",
  "QA Automation Architect",
  "QA Automation Lead",
  "QA Manager (Automation)",
  "Quality Engineering Lead",
  "SDET Lead",
  "Selenium Automation",
  "Senior Automation Engineer",
  "Senior QA Automation Engineer",
  "Senior SDET (Software Development Engineer in Test)",
  "Senior Test Automation Engineer",
  "Senior Test Automation Specialist",
  "Senior Test Engineer",
  "Staff SDET Automation Engineer",
  "Staff Software Development Engineer in Test",
  "Test Automation Lead",
];

const BASE_QUERY = {
  location: "India",
  jobType: "full time",
  sortBy: "recent", // relevant or recent
  dateSincePosted: "24hr",
  experienceLevel: "senior",
  //valid values: internship, entry level, associate, senior, director, executive
  limit: "20",
  page: "0",
};

const OUTPUT_FILE = path.resolve(__dirname, "jobs.json");
const HOURS_WINDOW = 8; // Add only jobs <= 8 hours old
const DAYS_TO_KEEP = 8; // purge jobs > 7 days old

// Define the workable search query
const SEARCH_QUERY = 'site:apply.workable.com "jobs" "india"';

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

/**
 * Checks if the current UTC hour is one of the desired run times (00, 08, 16).
 * This function ensures the script runs only 3 times a day.
 * @returns {boolean} True if the current time satisfies the 8-hour interval.
 */
function limitedRun() {
  // Target hours in UTC (Covers the 8-hour interval: 00:00, 08:00, 16:00)
  const targetHours = [0, 8, 16];

  // Get the current date and time in UTC
  const nowUtc = new Date();

  // Get the current UTC hour (0-23)
  const currentUTCHour = nowUtc.getUTCHours();

  // Get the current UTC minutes (0-59)
  const currentUTCMinutes = (now = nowUtc.getUTCMinutes());

  // Check if the current hour is in the target hours array
  const isTargetHour = targetHours.includes(currentUTCHour);

  // OPTIONAL: Restrict the run to the first half-hour to avoid running twice per target hour
  // (e.g., at 08:00 and 08:30). If you only want it to run exactly once per 8 hours,
  // restrict it to minutes < 30.
  const isFirstHalfHour = currentUTCMinutes < 30;

  // The script should run only if it's one of the target hours AND it's in the first
  // half hour of the GitHub Actions schedule trigger.
  if (isTargetHour && isFirstHalfHour) {
    console.log(`Current UTC Time: ${nowUtc}. Condition met. Starting search`);
    return true;
  } else {
    console.log(
      `Current UTC Time: ${nowUtc}. Condition NOT met. Skipping search.`
    );
    return false;
  }
}

function htmlUnescape(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractJobIdFromLinkedInUrl(url) {
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

/**
 * Executes the search query across all keywords and pages,
 * collecting initial job summary data.
 * @param {Array<string>} KEYWORDS - List of keywords to search.
 * @returns {Array<Object>} An array of job objects gathered from the API.
 */
async function gatherLinkedInSearchResults(KEYWORDS) {
  const gathered = [];
  const MAX_PAGES = 5;

  for (const kw of KEYWORDS) {
    let currentPage = 0;
    console.log(`--- Querying for keyword: "${kw}" ---`);

    while (currentPage < MAX_PAGES) {
      const query = {
        ...BASE_QUERY,
        keyword: kw,
        page: String(currentPage),
      };

      try {
        const results = await linkedIn.query(query);
        if (results.length > 0) {
          console.log(`Found ${results.length} jobs on page ${currentPage}`);
          results.forEach((r) => gathered.push({ ...r, _keyword: kw }));
          currentPage++;
          await sleep(500);
        } else {
          console.log(`No more jobs found for "${kw}" on page ${currentPage}.`);
          break;
        }
      } catch (e) {
        console.error(`Query failed for keyword "${kw}":`, e.message);
        break;
      }
    }
    await sleep(1000);
  }

  return gathered;
}

/**
 * Deduplicates the gathered jobs and filters out existing jobs and old reposts from Linkedin
 * @param {Array<Object>} gatheredJobs - Array of job objects from the gathering stage.
 * @returns {Array<Object>} An array of unique, new job objects.
 */
function filterLinkedInSearchResults(gatheredJobs) {
  // Dedupe by URL
  let deduped = uniqueBy(gatheredJobs, (r) => clean_url(r.jobUrl));
  console.log(`Jobs count after deduping all gathered jobs: ${deduped.length}`);

  // Load and prepare existing job data
  const existingJobs = readExisting().data;
  const existingJobIds = new Set(existingJobs.map((j) => j.jobId));

  // Find the largest jobId in existingJobIds - Assuming jobIds are numerical
  const maxExistingJobId =
    existingJobIds.size > 0
      ? Math.max(...Array.from(existingJobIds).map((id) => Number(id)))
      : -Infinity; // Use -Infinity if the set is empty for smallest number

  // Filter out existing and old reposts
  deduped = deduped.filter((job) => {
    const jobId = extractJobIdFromLinkedInUrl(job.jobUrl);
    if (!jobId) {
      console.warn("Could not parse jobId", job.jobUrl);
      return false;
    }
    // Check if this already exists
    const isNew = !existingJobIds.has(jobId);
    if (!isNew) {
      console.log(`Already jobId exists in json: ${jobId}`);
    }
    // Check if the job id is actually a reposted job
    const isNotRepost = Number(jobId) >= maxExistingJobId;
    if (!isNotRepost) {
      console.log(`Reposted jobId: ${jobId}`);
    }
    // Keep the job post only if it's new and not already saved
    return isNew && isNotRepost;
  });

  console.log(
    `Jobs count after removing existing jobs and reposts: ${deduped.length}`
  );

  return deduped;
}

async function fetchJobDetailFromLinkedIn(jobId) {
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
    let companyUrl = null;

    if (typeof data === "object") {
      listedAt = data.listedAt ? new Date(data.listedAt) : null;
      applyUrl = data.applyUrl || data.companyApplyUrl || null;
      description = data.description || null;
      companyUrl = data.company || null;
    } else {
      // Fallback: parse HTML with cheerio
      const $ = cheerio.load(data);
      const postedText = $(".posted-time-ago__text").text().trim();
      listedAt = parseRelativeTimeToDate(postedText);

      const contentElem = $(".show-more-less-html__markup");
      if (contentElem.length > 0) {
        // Get the HTML of just the content
        let contentHtml = contentElem.html();
        if (contentHtml) {
          // Replace block-level tags with newline characters
          contentHtml = contentHtml
            .replace(/<br\s*\/?>/gi, "\n") // Replace <br> tags with a newline
            .replace(/<\/(p|div|h[1-6]|blockquote|pre)>/gi, "\n\n") // Add two newlines after paragraphs
            .replace(/<li[^>]*>/gi, "\n* ") // Handle opening <li> tags for bulleting and a newline
            .replace(/<(ul|ol)[^>]*>/gi, "\n") // Treat opening <ul> or <ol> as a guaranteed newline before the list starts
            .replace(/<\/(li|ul|ol)>/gi, "") // Remove closing list item tags
            .replace(/<\/span>/gi, "");

          // Load the modified HTML and *then* get the text
          description = cheerio.load(contentHtml).text();

          // Clean up space
          description = description
            .replace(/[ \t]+/g, " ")
            .replace(/(\n\s*){3,}/g, "\n\n")
            .trim();
        }
      }
      const applyMatch = data.match(/"applyUrl"\s*:\s*"([^"]+)"/);
      if (applyMatch) {
        applyUrl = applyMatch[1].replace(/\\\//g, "/");
      }

      const companyLinkSelector = 'a[href*="/company/"]';
      const linkElem = $(companyLinkSelector);
      if (linkElem.length > 0) {
        // get the URL from the first matching element
        companyUrl = linkElem.attr("href");
      }

      let jobClosed = false;
      const jobClosedElem = $(".closed-job");
      if (jobClosedElem.length > 0) {
        jobClosed = true;
      }
    }
    await sleep(500);
    return {
      resolvedDate: listedAt,
      applyUrl,
      description,
      companyUrl,
      jobClosed,
    };
  } catch (err) {
    console.error("Error fetching job detail:", err.message);
    return {
      resolvedDate: null,
      applyUrl: null,
      description: null,
      companyUrl: null,
      jobClosed: null,
    };
  }
}

/**
 * Fetches detailed information for a list of jobs and formats them for saving.
 * @param {Array<Object>} dedupedJobs - Array of unique, new job objects.
 * @returns {Array<Object>} An array of fully enriched and formatted job objects.
 */
async function enrichLinkedInJobDetails(dedupedJobs) {
  const enriched = [];

  for (const job of dedupedJobs) {
    const jobId = extractJobIdFromLinkedInUrl(job.jobUrl);
    const jobUrlClean = clean_url(job.jobUrl);
    let detail = {};

    if (jobId) {
      console.log("Parsed jobId", { jobId, jobUrl: jobUrlClean });
      detail = await fetchJobDetailFromLinkedIn(jobId);
    } else {
      console.warn("Could not parse jobId", { jobUrl: jobUrlClean });
      continue;
    }

    let postedAt =
      detail.resolvedDate ||
      parseRelativeTimeToDate(job.agoTime) ||
      (job.date ? new Date(`${job.date}T00:00:00Z`) : null);

    if (!postedAt) {
      console.warn("No postedAt; skipping", {
        title: job.position,
        url: job.jobUrl,
      });
      continue;
    }
    if (!withinLastHours(postedAt, HOURS_WINDOW)) {
      console.warn("Older than window; skipping", {
        title: job.position,
        postedAt,
      });
      continue;
    }

    // Final clean and structure
    const job_title = clean_title(job.position);
    const company_name = clean_company(job.company);

    enriched.push({
      title: job_title,
      company: company_name,
      location: job.location || "India",
      type: "Full-Time",
      datePosted: postedAt ? toIsoStringUTC(postedAt) : null,
      url: detail.applyUrl || jobUrlClean || job.jobUrl,
      source: "LinkedIn",
      sourceUrl: job.jobUrl,
      jobId,
      description: detail.description || "",
      companyUrl: detail.companyUrl || "",
    });
  }

  return enriched;
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
  const phrases_to_remove = [
    "Interesting Job Opportunity",
    ", India",
    ",India",
  ];
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

async function mergeAndCleanJobsData(output_data) {
  const json = readExisting();
  const existing = json ? json.data : [];
  json.recentlyAddedCount = output_data.length;
  // Add updated on Date only if new jobs are added
  // Dont save updated dates for removing job posts
  if (output_data.length > 0) {
    json.recentlyUpdatedOn = new Date(Date.now()).toISOString();
  }

  console.log(`Existing job posts before cleanup: ${existing.length}`);

  const now = new Date();
  const currentDayUtcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const DaysInMillis = DAYS_TO_KEEP * 24 * 60 * 60 * 1000;
  const cutoffTime = currentDayUtcMidnight - DaysInMillis;

  // Filter out old posts based on DAYS_TO_KEEP
  let prunedExisting = existing.filter((j) => {
    // Convert the job post's date string to a timestamp
    const d = j.datePosted ? new Date(j.datePosted).getTime() : 0;
    // Keep the post if its timestamp is equal to or LATER than the cutoff time
    return d >= cutoffTime;
  });

  console.log(
    `Removed ${existing.length - prunedExisting.length} old job posts`
  );
  console.log(
    `Jobs after cleanup (within ${DAYS_TO_KEEP} days): ${prunedExisting.length}`
  );

  if (limitedRun()) {
    // Check older LinkedIn posts for closure ---
    const TWO_DAYS_IN_MILLIS = 2 * 24 * 60 * 60 * 1000;
    const twoDayCutoffTime = Date.now() - TWO_DAYS_IN_MILLIS;
    const jobsToCheck = [];
    const jobsToKeep = [];

    for (const j of prunedExisting) {
      const isLinkedIn = j.source === "LinkedIn";
      const d = j.datePosted ? new Date(j.datePosted).getTime() : 0;
      const isOlderThan2Days = d < twoDayCutoffTime;

      // Identify old LinkedIn jobs for closure check
      if (isLinkedIn && isOlderThan2Days) {
        jobsToCheck.push(j);
      } else {
        jobsToKeep.push(j);
      }
    }
    console.log(
      `Checking status for ${jobsToCheck.length} older LinkedIn jobs...`
    );
    let closedJobsRemovedCount = 0;

    const results = await Promise.allSettled(
      jobsToCheck.map(async (job) => {
        const details = await fetchJobDetailFromLinkedIn(job.jobId);
        return { job, details };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        const { job, details } = result.value;
        if (details.jobClosed) {
          // Job is closed, remove it
          closedJobsRemovedCount++;
        } else {
          // Job is still open, keep it
          jobsToKeep.push(job);
        }
      } else {
        // If the check failed (e.g., error fetching), keep the job to re-check later
        console.warn(
          `Failed to check job ${result.value.job.jobId}: ${result.reason}`
        );
        jobsToKeep.push(result.value.job);
      }
    }

    prunedExisting = jobsToKeep;
    console.log(`Removed ${closedJobsRemovedCount} closed LinkedIn job posts.`);
    console.log(`Count after cleaning closed jobs: ${prunedExisting.length}`);
  }

  // Use jobId as the unique key
  const byJobId = new Map();

  for (const j of prunedExisting) {
    byJobId.set(j.jobId, j);
  }

  let newJobsAddedCount = 0;
  for (const j of output_data) {
    const existingJob = byJobId.get(j.jobId);
    if (!existingJob) {
      byJobId.set(j.jobId, j);
      newJobsAddedCount++;
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
  console.log(`Added ${newJobsAddedCount} new unique jobs.`);

  // Final sorted list
  const finalList = Array.from(byJobId.values()).sort((a, b) => {
    const ta = a.datePosted ? new Date(a.datePosted).getTime() : 0;
    const tb = b.datePosted ? new Date(b.datePosted).getTime() : 0;
    return tb - ta;
  });

  json.totalCount = finalList.length;
  json.data = finalList;
  console.log(`Filtered and finalized ${finalList.length} job posts`);
  writeOutput(json);
  console.log(`Saved ${json.data.length} jobs to ${OUTPUT_FILE}`);
  return finalList.length;
}

/**
 * Searches Workable for QA jobs in India, restricting results to the last 24 hours.
 * * @param {string} query The search query string.
 * @returns {Promise<Array|null>} A promise that resolves to an array of search results or null on failure/no results.
 */
async function getWorkableSearchResults(query) {
  // --- Configuration ---
  const API_KEY = process.env.SERP_API_KEY;
  if (!API_KEY) {
    throw new Error("SERP_API_KEY environment variable is not set.");
  }

  const params = {
    engine: "google",
    q: query,
    google_domain: "google.com",
    hl: "en",
    gl: "us",
    api_key: API_KEY,
    tbs: "qdr:d",
  };

  try {
    console.log(`Searching for: "${query}" (Last 24 hours)`);

    // Fetch the JSON results using async/await
    const json = await getJson(params);

    if (json.error) {
      console.error("SerpApi Error:", json.error);
      return null;
    }
    return json.organic_results || [];
  } catch (error) {
    console.error("An unexpected error occurred during the API call:", error);
    return null;
  }
}

/**
 * Transforms the raw search results into a clean, structured JSON format.
 * * @param {Array} results The raw organic results from the SerpApi call.
 * @param {string} query The original search query.
 * @returns {Array|null} The array of structured job results or null if no results.
 */
function processWorkableSearchResults(results, query) {
  if (!results || results.length === 0) {
    console.warn(`No organic results found for: "${query}"`);
    return null;
  }

  console.log(`Found ${results.length} organic results for: "${query}"`);

  // Map the results array to the desired JSON structure
  const jsonResults = results.map((result) => {
    return {
      title: result.title,
      url: result.link,
      // Add default/placeholder values
      company: "",
      location: "",
      source: "Workable",
    };
  });

  return jsonResults;
}

/**
 * Main function to execute the search and processing logic.
 */
async function runWorkableJobSearch() {
  // Get the search results (last 24 hours)
  const orCondition = KEYWORDS.map((kw) => `"${kw}"`).join(" OR ");
  const finalQuery = `${SEARCH_QUERY} (${orCondition})`;

  const rawResults = await getWorkableSearchResults(finalQuery);

  // Process and format the results
  const jsonOutput = processWorkableSearchResults(rawResults, SEARCH_QUERY);

  if (jsonOutput) {
    console.log("\n--- Workable Job Results ---");
    console.log(jsonOutput);
    return jsonOutput;
  } else {
    return [];
  }
}

// -------- Main pipeline ----------
(async function main() {
  // gather jobs and links from searching keywords
  const rawJobs = await gatherLinkedInSearchResults(KEYWORDS);
  console.log(`Jobs count gathered with different keywords: ${rawJobs.length}`);

  // filter and clean up results and save
  const newJobs = filterLinkedInSearchResults(rawJobs);
  const enrichedJobs = await enrichLinkedInJobDetails(newJobs);
  console.log(`Found ${enrichedJobs.length} new job posts to save.`);

  const total_jobs = await mergeAndCleanJobsData(enrichedJobs);

  if (limitedRun()) {
    // await runWorkableJobSearch();
  }

  let summaryContent = `## Results\n\n\n`;
  try {
    // After processing, generate Markdown for the summary
    summaryContent += ` - Found **${enrichedJobs.length}** new job posts.\n\n`;
    summaryContent += ` - Total **${total_jobs}** job posts saved in json.\n`;

    // Append the Markdown to the summary file
    const summaryFile = process.env.GITHUB_STEP_SUMMARY;
    if (summaryFile) {
      fs.appendFileSync(summaryFile, summaryContent);
    } else {
      console.log("\n--- SUMMARY ---");
      console.log(summaryContent.replace(/## /g, ""));
    }
  } catch (e) {
    console.error("Error writing summary:", e.message);
    console.log("Summary Content:", summaryContent);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
