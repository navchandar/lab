/* eslint-disable no-console */
import fs from "fs";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";
import linkedIn from "linkedin-jobs-api";
import randomUA from "random-useragent";
import { fileURLToPath } from "url";
import { getJson } from "serpapi";
import { JOB_KEYWORDS as KEYWORDS } from "./constants.js";
import { LINKEDIN_SEARCH_QUERY, REMOVE_TITLES } from "./constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_FILE = path.resolve(__dirname, "jobs.json");
const HOURS_WINDOW = 8; // Add only jobs <= 8 hours old
const DAYS_TO_KEEP = 8; // purge jobs > 7 days old

// Define the workable search query
const SEARCH_QUERY = 'site:apply.workable.com "jobs" "india"';
let summaryContent = `## Results\n\n\n`;

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
 * Checks if the current UTC hour is one of the desired run times
 * and if the minutes are within the first 40 of that hour.
 *
 * This version supports any positive integer for runsPerDay by calculating
 * an approximate interval and rounding the resulting target hours.
 *
 * @param {number} runsPerDay The number of times the script should run each day (must be a positive integer).
 * @returns {boolean} True if the current time satisfies the calculated interval and minutes window.
 */
function limitedRun(runsPerDay) {
  if (
    typeof runsPerDay !== "number" ||
    !Number.isInteger(runsPerDay) ||
    runsPerDay < 1
  ) {
    console.error(
      `runsPerDay must be a positive integer. Input: ${runsPerDay}`
    );
    return false;
  }

  // Calculate the raw interval in hours (e.g., 24 / 5 runs = 4.8 hours)
  const rawInterval = 24 / runsPerDay;

  // Generate the target hours array by rounding the hours
  const targetHours = [];

  // Start at 0:00 UTC
  targetHours.push(0);

  // Calculate the subsequent hours
  for (let i = 1; i < runsPerDay; i++) {
    const calculatedHour = i * rawInterval;
    // Round to the nearest whole hour for the target hour
    const roundedHour = Math.round(calculatedHour);

    // Ensure the hour is unique and within the 0-23 range
    // The conditional check is mainly for robustness against edge cases and prevents
    // the final iteration from calculating 24 and pushing it.
    if (roundedHour < 24 && !targetHours.includes(roundedHour)) {
      targetHours.push(roundedHour);
    }
  }

  // Target hours in UTC (e.g., [0, 5, 10, 14, 19] for 5 runs, where the interval is ~4.8 hours)
  console.log(
    `Target run times set for ${runsPerDay} times a day with an approximate interval of ${rawInterval.toFixed(
      2
    )} hours.`
  );
  console.log(
    `Rounded Target UTC Hours: ${targetHours.sort((a, b) => a - b).join(", ")}.`
  );

  // --- 2. Check Current Time against Conditions ---

  // Get the current date and time in UTC
  const nowUtc = new Date();

  // Get the current UTC hour (0-23)
  const currentUTCHour = nowUtc.getUTCHours();

  // Get the current UTC minutes (0-59)
  const currentUTCMinutes = nowUtc.getUTCMinutes();

  // Check if the current hour is in the target hours array
  const isTargetHour = targetHours.includes(currentUTCHour);

  // Restrict the run to the first 40 minutes (0 to 39)
  const isFirstHalfHour = currentUTCMinutes < 40;

  const timeNow = `Current UTC Time: ${nowUtc.toISOString()}.`;

  // The script should run only if both conditions are met.
  if (isTargetHour && isFirstHalfHour) {
    console.log(`${timeNow} Condition met. Script can run.`);
    return true;
  } else {
    // --- Condition Failed: Print the reason ---
    let failureReason = "";
    if (!isTargetHour) {
      failureReason += `Hour condition not met: Current hour (${currentUTCHour} UTC) is not one of the target hours (${targetHours.join(
        ", "
      )} UTC).`;
    }

    if (!isFirstHalfHour) {
      if (failureReason) {
        failureReason += " AND ";
      }
      failureReason += `Minute condition not met: Current minutes (${currentUTCMinutes}) are 40 or greater.`;
    }

    if (!failureReason) {
      failureReason = "Unknown condition failure.";
    }

    console.log(`${timeNow} Condition NOT met. Script will skip.`);
    console.log(`Failure Reason: ${failureReason}`);
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
  const MAX_PAGES = 3;

  for (const kw of KEYWORDS) {
    let currentPage = 0;
    console.log(`--- Querying for keyword: "${kw}" ---`);

    while (currentPage < MAX_PAGES) {
      const query = {
        ...LINKEDIN_SEARCH_QUERY,
        keyword: kw,
        page: String(currentPage),
      };

      try {
        const results = await linkedIn.query(query);
        if (results.length > 0) {
          console.log(`Found ${results.length} jobs on page ${currentPage}`);
          results.forEach((r) => gathered.push({ ...r, _keyword: kw }));
          currentPage++;
          await sleep(200);
        } else {
          console.log(`No more jobs found for "${kw}" on page ${currentPage}.`);
          break;
        }
      } catch (e) {
        console.error(`Query failed for keyword "${kw}":`, e.message);
        break;
      }
    }
    await sleep(200);
  }

  return gathered;
}

/**
 * Deduplicates the gathered jobs by URL and filters out jobs whose IDs already exist in the saved data.
 * @param {Array<Object>} gatheredJobs - Array of job objects from the gathering stage.
 * @returns {Array<Object>} An array of unique, new job objects.
 */
function filterLinkedInSearchResults(gatheredJobs) {
  // Dedupe the current batch by clean URL to ensure no duplicates from the current scrape.
  let deduped = uniqueBy(gatheredJobs, (r) => clean_url(r.jobUrl));
  console.log(`Jobs count after URL deduplication: ${deduped.length}`);

  // Load and prepare existing job data
  const existingJobs = readExisting().data;
  const existingJobIds = new Set(existingJobs.map((j) => j.jobId));

  // Filter out any job whose ID already exists in the saved data.
  const newJobs = deduped.filter((job) => {
    const jobId = extractJobIdFromLinkedInUrl(job.jobUrl);

    if (!jobId) {
      console.warn("Could not parse jobId", job.jobUrl);
      return false; // Filter out jobs without a valid ID
    }

    // Check if this jobId already exists
    const isNew = !existingJobIds.has(jobId);
    // if (!isNew) {
    //   console.log(`Already existing jobId found (filtered out): ${jobId}`);
    // }
    // Keep the job post only if its ID is not already saved
    return isNew;
  });

  console.log(`Jobs count after removing existing jobs: ${newJobs.length}`);

  return newJobs;
}

async function fetchJobDetailFromLinkedIn(jobId) {
  const url = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;
  // Define threshild for a high-applicant count to trigger repost job detection
  const HIGH_APPLICANT_THRESHOLD = 100;
  const REPOST_WINDOW_HOURS = 4;
  let jobClosed = false;
  let likelyRepost = false;
  let applicants = null;

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

      // APPLICANTS COUNT EXTRACTION ---
      const applicantsElem = $(".num-applicants__caption");
      if (applicantsElem.length > 0) {
        const applicantsText = applicantsElem.text().trim();
        const match = applicantsText.match(/(\d+)/);
        if (match) {
          applicants = parseInt(match[1], 10);
          console.log(`${jobId} applicants count: ${applicants}`);
        }
      }

      const contentElem = $(".show-more-less-html__markup");
      if (contentElem.length > 0) {
        // Get the HTML of just the content
        let contentHtml = contentElem.html();
        if (contentHtml) {
          // Replace <li> tags with a standard bullet point (Unicode U+2022)
          contentHtml = contentHtml.replace(/<li[^>]*>/gi, "\n - ");

          // Replace block-level closing tags with guaranteed newlines
          contentHtml = contentHtml.replace(
            /<\/(p|div|h[1-6]|blockquote|pre)>/gi,
            "\n\n"
          );

          // Replace <br> tags with a single newline
          contentHtml = contentHtml.replace(/<br\s*\/?>/gi, "\n");

          // Replace H tags with text and ASCII separators for "heading"
          contentHtml = contentHtml.replace(
            /<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi,
            (match, p1) => `\n\n== ${p1.trim()} ==\n\n`
          );

          // Remove remaining structural/unwanted tags (ul, ol, li closing, span, etc.)
          contentHtml = contentHtml.replace(/<[^>]*>/g, "");
          description = htmlUnescape(contentHtml);

          // Clean up space and newlines
          description = description
            .replace(/[ \t]+/g, " ") // Normalize multiple spaces/tabs to a single space
            .replace(/(\n\s*){4,}/g, "\n\n\n") // Normalize excessive newlines to at most three
            .replace(/(\s*\n\s*){2,}/g, "\n\n") // Condense multiple newlines separated by space/tabs to two
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

      const jobClosedElem = $(".closed-job");
      if (jobClosedElem.length > 0) {
        jobClosed = true;
      }

      if (listedAt && applicants !== null) {
        const isRecentPost = withinLastHours(listedAt, REPOST_WINDOW_HOURS);
        if (applicants >= HIGH_APPLICANT_THRESHOLD && isRecentPost) {
          likelyRepost = true;
          // console.log(`${jobId} Flagged as LIKELY REPOST`);
        }
      }
    }
    await sleep(500);
    return {
      resolvedDate: listedAt,
      applyUrl,
      description,
      companyUrl,
      jobClosed,
      likelyRepost,
      applicants,
    };
  } catch (err) {
    const statusCode = err.response ? err.response.status : null;
    // failure codes: 404 (Not Found) or 410 (Gone), 403 (Forbidden)
    const failureCodes = [404, 410, 403];
    console.error("Error fetching job detail:", err.message);
    if (statusCode && failureCodes.includes(statusCode)) {
      jobClosed = true;
    }
    return {
      resolvedDate: null,
      applyUrl: null,
      description: null,
      companyUrl: null,
      jobClosed: jobClosed,
      likelyRepost: likelyRepost,
      applicants: 0,
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
      await sleep(100);
    } else {
      console.warn("Could not parse jobId", { jobUrl: jobUrlClean });
      continue;
    }

    if (detail.jobClosed) {
      console.warn("Closed job; skipping", {
        title: job.position,
        url: job.jobUrl,
      });
      continue;
    }
    if (detail.likelyRepost) {
      console.warn("Likely Reposted job; skipping", {
        title: job.position,
        url: job.jobUrl,
      });
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
    const job_title = clean_title(job.position, job.company);
    const company_name = clean_company(job.company);

    enriched.push({
      jobId,
      title: job_title,
      company: company_name,
      companyUrl: detail.companyUrl || "",
      applicants: detail.applicants || 0,
      location: clean_text(job.location) || "India",
      datePosted: postedAt ? toIsoStringUTC(postedAt) : null,
      url: detail.applyUrl || jobUrlClean || job.jobUrl,
      source: "LinkedIn",
      type: "Full-Time",
      description: clean_string_multiline(detail.description),
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

function clean_title(job_title, company_name) {
  if (!job_title) {
    return "";
  }
  job_title = clean_text(job_title);
  const company_names = [
    company_name + " -",
    company_name,
    ", " + company_name,
    "| " + company_name,
    "- " + company_name,
  ];
  const phrases_to_remove = company_names.concat(REMOVE_TITLES);
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
  company_name = clean_text(company_name);
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

/**
 * Cleans single-line strings (title, company, location) for JSON.
 * Removes control characters and excess whitespace.
 */
/* eslint-disable no-control-regex */
function clean_text(input) {
  if (!input) {
    return "";
  }
  let cleaned = String(input);

  // 1. Remove non-printable control characters (ASCII 0-31) that often corrupt JSON
  cleaned = cleaned.replace(
    /[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g,
    ""
  );
  // 2. Replace all newlines and tabs with a single space.
  cleaned = cleaned.replace(/[\n\r\t]+/g, " ");
  // 3. Normalize remaining multiple spaces to a single space.
  cleaned = cleaned.replace(/[ ]{2,}/g, " ");
  // 4. Remove leading/trailing whitespace.
  return cleaned.trim();
}

/**
 * Cleans multi-line strings (description) for JSON.
 * Removes control characters but preserves spaces, newlines, and common punctuation.
 */
function clean_string_multiline(input) {
  if (!input) {
    return "";
  }
  let cleaned = String(input);

  // 1. Remove non-printable control characters that can corrupt JSON
  // (e.g., NULL, vertical tab, form feed, non-breaking spaces, zero-width spaces).
  // \u200B is the zero-width space, common in web scraping.
  cleaned = cleaned.replace(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u00A0\u200B]/g,
    ""
  );

  // 2. Normalize multiple spaces and tabs within a line to a single space.
  cleaned = cleaned.replace(/[ \t]{2,}/g, " ");
  // 3. Normalize multiple newlines/carriage returns to a maximum of two,
  // preventing giant empty gaps, while preserving paragraph breaks.
  cleaned = cleaned.replace(/(\r?\n){3,}/g, "\n\n");
  // 4. Remove leading/trailing whitespace from the whole description.
  return cleaned.trim();
}
/* eslint-enable no-control-regex */

async function mergeAndCleanJobsData(output_data) {
  const json = readExisting();
  const existing = json ? json.data : [];
  if (output_data.length > 0) {
    json.recentlyAddedCount = output_data.length;
  }
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

  const removedCount = existing.length - prunedExisting.length;
  console.log(`Removed ${removedCount} old job posts`);
  summaryContent += ` - Removed **${removedCount}** old job posts from json.\n`;

  console.log(
    `Jobs after cleanup (within ${DAYS_TO_KEEP} days): ${prunedExisting.length}`
  );

  if (limitedRun(2)) {
    // Check 10hr old LinkedIn posts for closure ---
    const tenHours = 10 * 60 * 60 * 1000;
    const twoDays = 2 * 24 * 60 * 60 * 1000;
    const initialCutoff = Date.now() - tenHours;
    const twoDayCutoff = Date.now() - twoDays;
    const jobsToCheck = [];
    const jobsToKeep = [];

    for (const j of prunedExisting) {
      const isLinkedIn = j.source === "LinkedIn";
      const d = j.datePosted ? new Date(j.datePosted).getTime() : 0;
      const is10HrsOld = d < initialCutoff;
      const is2DaysOld = d < twoDayCutoff;
      const isApplicantsHigh = j.applicants ? j.applicants > 100 : false;

      // Identify old LinkedIn jobs for closure check
      if (isLinkedIn && is10HrsOld && isApplicantsHigh) {
        jobsToCheck.push(j);
      } else if (isLinkedIn && is2DaysOld) {
        jobsToCheck.push(j);
      } else {
        jobsToKeep.push(j);
      }
    }
    console.log(
      `Checking status for ${jobsToCheck.length} older LinkedIn jobs...`
    );
    let closedJobsRemovedCount = 0;

    for (const job of jobsToCheck) {
      try {
        // Fetch details for the *current* job and wait
        const details = await fetchJobDetailFromLinkedIn(job.jobId);
        const updatedJob = {
          ...job,
          applicants: details.applicants || job.applicants,
        };

        if (details.jobClosed || details.applicants >= 200) {
          // Job is closed, don't add it back
          closedJobsRemovedCount++;
        } else {
          // Job is still open, keep it
          jobsToKeep.push(updatedJob);
        }
        await sleep(100);
      } catch (error) {
        // If the check failed, keep the job to re-check later
        console.warn(`Failed to check job ${job.jobId}: ${error.message}`);
        jobsToKeep.push(job);
        await sleep(500);
      }
    }

    prunedExisting = jobsToKeep;
    console.log(
      `Removed ${closedJobsRemovedCount} closed/highly applied LinkedIn job posts.`
    );
    console.log(
      `Count after cleaning closed/highly applied jobs: ${prunedExisting.length}`
    );
    summaryContent += ` - Removed ${closedJobsRemovedCount} closed job posts.\n`;
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
      // Case 1: New job, add it to json
      byJobId.set(j.jobId, j);
      newJobsAddedCount++;
    } else {
      // Case 2: Job already Exists in json
      // 1. Check for a newer datePosted (and update ALL fields if newer)
      const existingTime = existingJob.datePosted
        ? new Date(existingJob.datePosted).getTime()
        : 0;
      const newTime = j.datePosted ? new Date(j.datePosted).getTime() : 0;

      // A. New post date is newer: Overwrite everything.
      if (newTime > existingTime) {
        byJobId.set(j.jobId, { ...existingJob, ...j });
      } else {
        // B. Post date is not newer, but we should update applicants
        const existingApplicants = existingJob.applicants || 0;
        const newApplicants = j.applicants || 0;

        // Only update if the new applicants count is greater
        if (newApplicants > existingApplicants) {
          byJobId.set(j.jobId, {
            ...existingJob,
            applicants: newApplicants,
          });
        }
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
 * Function to execute the workable search and processing logic.
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
  // After processing, generate Markdown for the summary
  summaryContent += ` - Found **${enrichedJobs.length}** new job posts.\n\n`;

  const total_jobs = await mergeAndCleanJobsData(enrichedJobs);
  summaryContent += ` - Total **${total_jobs}** job posts saved in json.\n`;

  if (limitedRun(1)) {
    // await runWorkableJobSearch();
  }

  try {
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
