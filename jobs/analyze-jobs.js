import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import zlib from "zlib";
import fsPromises from "fs/promises";
import { promisify } from "util";

// --- Configuration ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RAW_DATA_FILE = path.resolve(__dirname, "jobs.json");
const CHART_DATA_FILE = path.resolve(__dirname, "charts_data.json");
const GZ_FILE = path.resolve(__dirname, "jobs.json.gz");

// Promisify zlib.gzip for use with async/await
const gzip = promisify(zlib.gzip);

// --- Experience Range Configuration ---
// Define the ranges. The 'to' is inclusive for the range label.
const EXPERIENCE_RANGES = [
  { label: "0-3 Years", min: 0, max: 3 },
  { label: "4-6 Years", min: 4, max: 6 },
  { label: "7-9 Years", min: 7, max: 9 },
  { label: "10-12 Years", min: 10, max: 12 },
  { label: "13-16 Years", min: 13, max: 16 },
  { label: "17-20 Years", min: 17, max: 20 },
  { label: "21+ Years", min: 21, max: Infinity }, // The catch-all for high experience
];

// --- Tech Stack Configuration ---
const TECH_KEYWORDS = {
  // Languages
  JavaScript: [/javascript/i, /\bjs\b/i, /\bes6\b/i],
  TypeScript: [/typescript/i, /\bts\b/i],
  Python: [/python/i, /\bpy\b/i, /\bpytest\b/i],
  Java: [/\bjava\b/i, /\bjee\b/i],
  "C#": [/c#/i, /\.net/i, /\bdotnet\b/i],
  "C++": [/c\+\+/i],
  Go: [/\bgolang\b/i, /\bgo\b/i],
  Rust: [/\brust\b/i],
  PHP: [/\bphp\b/i],
  Ruby: [/\bruby\b/i],
  Swift: [/\bswift\b/i],
  Kotlin: [/\bkotlin\b/i],

  // Frontend Frameworks
  React: [/react/i, /react\.js/i, /reactjs/i],
  Angular: [/angular/i, /angularjs/i],
  Vue: [/vue/i, /vue\.js/i],
  NextJS: [/next\.js/i, /nextjs/i],
  Tailwind: [/tailwind/i, /tailwindcss/i, /tailwind css/i],

  // Backend & Runtime
  NodeJS: [/node\.js/i, /nodejs/i, /node js/i, /\bnode\b/i],
  Django: [/django/i],
  SpringBoot: [/spring boot/i, /spring framework/i],
  Express: [/express\.js/i, /\bexpress\b/i, /\bexpressjs\b/i],

  // Databases
  SQL: [/\bsql\b/i, /mysql/i, /postgres/i, /postgresql/i, /sql server/i],
  NoSQL: [/nosql/i, /mongodb/i, /mongo/i, /cassandra/i, /dynamodb/i],
  Redis: [/redis/i],

  // Cloud & DevOps
  AWS: [
    /\baws\b/i,
    /amazon web services/i,
    /amazonwebservices/i,
    /ec2/i,
    /lambda/i,
  ],
  Azure: [/\bazure\b/i, /\bazuredevops\b/i, /azure devops/i],
  GCP: [/\bgcp\b/i, /google cloud/i, /googlecloud/i],
  Docker: [/docker/i, /dockerfile/i, /dockercompose/i, /docker compose/i],
  Kubernetes: [/kubernetes/i, /\bk8s\b/i],
  Terraform: [/terraform/i],
  Jenkins: [/jenkins/i],
  Git: [/\bgit\b/i, /github/i, /gitlab/i, /bitbucket/i],

  // AI/ML
  ML: [
    /machine learning/i,
    /\bml\b/i,
    /\bai\/ml\b/i,
    /\bmlops\b/i,
    /pytorch/i,
    /tensorflow/i,
  ],
  GenAI: [/genai/i, /generative ai/i, /\bllm\b/i, /large language model/i],

  // QA & Testing
  Selenium: [/selenium/i, /seleniumbase/i],
  Cypress: [/cypress/i],
  Playwright: [/playwright/i],
  Appium: [/appium/i],
  RestAssured: [/rest assured/i, /restassured/i],
  Postman: [/\bpostman\b/i, /\bnewman\b/i],
  JMeter: [/jmeter/i, /blazemeter/i],
  Cucumber: [/cucumber/i, /\bbdd\b/i],
  JUnit: [/junit/i],
  TestNG: [/testng/i, /test ng/i],

  // Management & Methodologies
  Agile: [/\bagile\b/i, /\bsafe\b/i],
  Scrum: [/\bscrum\b/i],
  Kanban: [/kanban/i],
  Jira: [/jira/i],
  Confluence: [/confluence/i],
  PMP: [/\bpmp\b/i, /project management professional/i],
};

/**
 * Parses the experienceRequired string (e.g., "3 - 5", "21", "8+", "—")
 * and returns the average years of experience, or null if unparseable.
 * @param {string} expStr - The experience string from the job data.
 * @returns {number|null} The average experience in years, or null.
 */
function parseExperience(expStr) {
  if (!expStr || expStr === "—" || expStr === "-") {
    return null;
  }

  // Handle range (e.g., "3 - 5")
  const rangeMatch = expStr.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1], 10);
    const max = parseInt(rangeMatch[2], 10);
    // Return the average
    return (min + max) / 2;
  }

  // Handle single number or "N+" (e.g., "21", "8+")
  const singleMatch = expStr.match(/(\d+)/);
  if (singleMatch) {
    return parseInt(singleMatch[1], 10);
  }

  return null;
}

/**
 * Categorizes a job based on its experience into a defined range label.
 * @param {object} job - The job object.
 * @returns {string} The experience range label (e.g., "4-6 Years") or "N/A".
 */
function categorizeExperience(job) {
  const avgExp = parseExperience(job.yoe);
  if (avgExp === null) {
    return "N/A";
  }
  const range = EXPERIENCE_RANGES.find(
    (r) => avgExp >= r.min && avgExp <= r.max
  );
  return range ? range.label : "N/A";
}

/**
 * Helper function to count items, sort, and apply a limit.
 * Since every object is a job, counting the objects acts as counting 'jobId's.
 * @param {Array} jobs - The array of job objects.
 * @param {Function} keyExtractor - Function to extract the key (e.g., job => job.company).
 * @param {number|null} limit - Maximum number of results to return.
 * @returns {Array<{label: string, count: number}>} Sorted and optionally limited array.
 */
function aggregate(jobs, keyExtractor, limit = null) {
  const counts = jobs.reduce((acc, job) => {
    const key = keyExtractor(job);
    if (key) {
      acc[key] = (acc[key] || 0) + 1;
    }
    return acc;
  }, {});

  let result = Object.keys(counts)
    .map((label) => ({
      label: label,
      count: counts[label],
    }))
    .sort((a, b) => b.count - a.count); // Sort by count, descending

  if (limit !== null) {
    result = result.slice(0, limit);
  }
  return result;
}

/**
 * Performs a grouped aggregation, specifically for Company vs. Experience Range.
 * @param {Array} jobs - The array of job objects.
 * @param {number} topN - The number of top companies to include.
 * @returns {Array<{company: string, totalJobs: number, distribution: Array<{range: string, count: number}>}>}
 */
function aggregateCompanyVsExperience(jobs, topN = 20) {
  // 1. Get the list of Top N companies
  const topCompanies = aggregate(jobs, (job) => job.company, topN).map(
    (item) => item.label
  );
  const topCompanySet = new Set(topCompanies);

  // Initialize a map for the final results: { company: { totalJobs: N, distribution: { 'range': count } } }
  const companyAnalysis = new Map();

  // Initialize distribution structure for all ranges to ensure every company has all range keys
  const initialDistribution = {};
  for (const range of EXPERIENCE_RANGES) {
    initialDistribution[range.label] = 0;
  }

  // 2. Iterate through all jobs and aggregate for only the top companies
  jobs.forEach((job) => {
    const company = job.company;
    const expRange = categorizeExperience(job);

    if (topCompanySet.has(company)) {
      if (!companyAnalysis.has(company)) {
        companyAnalysis.set(company, {
          company: company,
          totalJobs: 0,
          distribution: { ...initialDistribution }, // Deep copy
        });
      }

      const data = companyAnalysis.get(company);
      data.totalJobs += 1;

      // Increment count for the specific range
      if (expRange !== "N/A" && expRange in data.distribution) {
        data.distribution[expRange] += 1;
      }
    }
  });

  // 3. Format the final output
  const finalResult = Array.from(companyAnalysis.values())
    .map((item) => ({
      company: item.company,
      totalJobs: item.totalJobs,
      distribution: Object.keys(item.distribution).map((range) => ({
        range: range,
        count: item.distribution[range],
      })),
    }))
    // Sort by totalJobs count, descending
    .sort((a, b) => b.totalJobs - a.totalJobs);

  return finalResult;
}

/**
 * Calculates jobs found per day and adds to historical data.
 * - Ignores counts for "Today" (incomplete day).
 * - Limits history to 5 years.
 * * @param {Array} currentJobs - The list of current jobs.
 * @param {Array} existingHistory - The existing dailyJobCounts array from charts_data.json.
 * @returns {Array} The updated history array sorted by date.
 */
function updateDailyJobCounts(currentJobs, existingHistory = []) {
  existingHistory = existingHistory || [];

  // 1. Aggregate counts from the current jobs list
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const currentCounts = {};

  currentJobs.forEach((job) => {
    if (job.datePosted) {
      // Extract YYYY-MM-DD
      const date = new Date(job.datePosted).toISOString().split("T")[0];

      // Only count if date is valid and NOT today
      if (date && date < today) {
        currentCounts[date] = (currentCounts[date] || 0) + 1;
      }
    }
  });

  // 2. Convert existing history to a Map for quick lookup
  // Map: DateString -> Object { date, count }
  const historyMap = new Map();
  existingHistory.forEach((entry) => {
    historyMap.set(entry.date, entry);
  });

  // 3. Merge job counts
  Object.keys(currentCounts).forEach((date) => {
    const newCount = currentCounts[date];
    const existingEntry = historyMap.get(date);

    // Update if:
    // A) The date doesn't exist yet (New Data) OR
    // B) The new count is higher than the old count
    if (!existingEntry || newCount > existingEntry.count) {
      historyMap.set(date, {
        date: date,
        count: newCount,
      });
    }
  });

  // 4. Convert back to array and sort by date (Ascending)
  let mergedHistory = Array.from(historyMap.values()).sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  // 5. Limit to max 5 years (~1825 entries)
  const MAX_ENTRIES = 5 * 365;
  if (mergedHistory.length > MAX_ENTRIES) {
    mergedHistory = mergedHistory.slice(mergedHistory.length - MAX_ENTRIES);
  }

  return mergedHistory;
}

/**
 * Aggregates tech stack counts grouped by job Role Type.
 * @param {Array} jobs - The array of job objects.
 * @returns {object} Map of RoleType -> Array<{label: string, count: number}>
 */
function aggregateTechByRole(jobs) {
  const rawCounts = {};

  jobs.forEach((job) => {
    // 1. Get the Role Type
    const roleType = job.classification?.roleType;

    // 2. FILTER: Ignore if role is missing, null, or 'Uncategorized'
    if (!roleType || roleType === "Uncategorized" || roleType === "—") {
      return;
    }

    const textToScan = `${job.title} ${job.description}`.toLowerCase();

    // 3. Ensure this role exists in our map
    if (!rawCounts[roleType]) {
      rawCounts[roleType] = {};
    }

    // 4. Scan against the global TECH_KEYWORDS dictionary
    Object.keys(TECH_KEYWORDS).forEach((techLabel) => {
      const patterns = TECH_KEYWORDS[techLabel];

      // Check if any pattern matches
      const isPresent = patterns.some((pattern) => pattern.test(textToScan));

      if (isPresent) {
        // Increment count for this specific Role + Tech combo
        rawCounts[roleType][techLabel] =
          (rawCounts[roleType][techLabel] || 0) + 1;
      }
    });
  });

  // 5. Format the output (Sort Descending by Count)
  const formattedResult = {};

  Object.keys(rawCounts).forEach((role) => {
    const techList = Object.entries(rawCounts[role])
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    // Only add roles that actually have data
    if (techList.length > 0) {
      formattedResult[role] = techList;
    }
  });

  return formattedResult;
}

/** Calculate the compression ratio between json file and json.gz file */
function getCompressionRatio(inputPath, outputPath) {
  try {
    const inputSize = fs.statSync(inputPath).size;
    const outputSize = fs.statSync(outputPath).size;

    const sizeDiff = inputSize - outputSize;
    const compressionRatio = ((sizeDiff / inputSize) * 100).toFixed(2);

    console.log(
      `Compressed ${path.basename(inputPath)} to ${path.basename(outputPath)}.`
    );
    console.log(`(Saved ${compressionRatio}%)`);
  } catch (err) {
    console.error("Error calculating compression stats:", err.message);
  }
}

/**
 * Compresses a file using Gzip (Async/Await version).
 * @param {string} inputPath - Path to the file to compress.
 * @param {string} outputPath - Path for the resulting .gz file.
 * @returns {Promise<void>}
 */
async function gzipFile(inputPath, outputPath) {
  try {
    // Read json file and parse the data
    console.log(`Reading file: ${inputPath}`);
    const fileData = await fsPromises.readFile(inputPath, "utf8");
    const json = JSON.parse(fileData);
    const keysToRemove = [
      "debugScores",
      "jobId",
      "applicants",
      "companyUrl",
      "confidence",
    ];

    // Modify & Stringify using the safe Replacer function
    const modifiedJson = JSON.stringify(json, (key, value) => {
      // If the key is 'debugScores', return undefined to remove it
      if (keysToRemove.includes(key)) {
        return undefined;
      }
      return value;
    });

    // Compress the modified string asynchronously
    console.log("Compressing data...");

    const buffer = await gzip(modifiedJson, { level: 9 });

    // Write the compressed buffer to the output path asynchronously
    await fsPromises.writeFile(outputPath, buffer);
    console.log(`Successfully wrote gzipped file to: ${outputPath}`);

    // Log compression stats
    getCompressionRatio(inputPath, outputPath);
  } catch (error) {
    // All errors (read, parse, gzip, write, or stat) bubble up here.
    console.error(`Gzip operation failed for ${inputPath}: ${error.message}`);
    // Rethrow the error to maintain the Promise chain
    throw error;
  }
}

async function runAnalysis() {
  try {
    // 1. Read the raw data file
    const rawData = fs.readFileSync(RAW_DATA_FILE, "utf8");
    const jobData = JSON.parse(rawData);
    const jobs = jobData.data || [];

    let existingChartData = {};
    try {
      if (fs.existsSync(CHART_DATA_FILE)) {
        const existingRaw = fs.readFileSync(CHART_DATA_FILE, "utf8");
        existingChartData = JSON.parse(existingRaw);
      }
    } catch (e) {
      console.warn("Could not read existing charts_data.json.");
    }

    // --- 2. Perform all required analyses ---

    // 1. Jobs by Company (Top 20)
    const byCompany = aggregate(jobs, (job) => job.company, 20);

    // 2. Jobs by Location (All)
    const byLocation = aggregate(jobs, (job) => job.location, 10);

    // 3. Jobs by Role Type (All)
    const byRoleType = aggregate(
      jobs,
      (job) => job.classification?.roleType || "N/A"
    );

    // 4. Jobs by Company vs Experience Range (Top 20)
    const companyVsExperience = aggregateCompanyVsExperience(jobs, 20);

    // 5. Jobs by Tech Stack per Job roletype
    const techVsRole = aggregateTechByRole(jobs);

    // Update Daily Job Counts History
    const dailyJobCounts = updateDailyJobCounts(
      jobs,
      existingChartData.dailyJobCounts
    );

    // Combine the results into a single object
    const finalChartData = {
      byCompany,
      byLocation,
      byRoleType,
      techVsRole,
      companyVsExperience,
      dailyJobCounts,
      experienceRanges: EXPERIENCE_RANGES.map((r) => r.label),
      totalCount: jobs.length,
    };

    // 5. Write the aggregated data to a new file
    fs.writeFileSync(
      CHART_DATA_FILE,
      JSON.stringify(finalChartData, null, 2),
      "utf8"
    );

    console.log(`Successfully analyzed ${jobs.length} jobs.`);
    console.log(`Aggregated data saved to ${CHART_DATA_FILE}`);

    // --- COMPRESS the jobs data ---
    await gzipFile(RAW_DATA_FILE, GZ_FILE);
  } catch (error) {
    console.error("An error occurred during analysis:", error.message);
    process.exit(1);
  }
}

runAnalysis();
