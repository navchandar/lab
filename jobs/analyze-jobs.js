import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import zlib from "zlib";

// --- Configuration ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RAW_DATA_FILE = path.resolve(__dirname, "jobs.json");
const CHART_DATA_FILE = path.resolve(__dirname, "charts_data.json");
const GZ_FILE = path.resolve(__dirname, "jobs.json.gz");

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
  const avgExp = parseExperience(job.experienceRequired);
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
 * Compresses a file using Gzip.
 * @param {string} inputPath - Path to the file to compress.
 * @param {string} outputPath - Path for the resulting .gz file.
 * @returns {Promise<void>}
 */
function gzipFile(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const input = fs.createReadStream(inputPath);
    const output = fs.createWriteStream(outputPath);
    const gzip = zlib.createGzip();

    input
      .pipe(gzip)
      .pipe(output)
      .on("finish", () => {
        const inputSize = fs.statSync(inputPath).size;
        const outputSize = fs.statSync(outputPath).size;
        const sizeDiff = inputSize - outputSize;
        const compressionRatio = ((sizeDiff / inputSize) * 100).toFixed(2);
        console.log(
          `Compressed ${path.basename(inputPath)} to ${path.basename(
            outputPath
          )}.`
        );
        console.log(`(Saved ${compressionRatio}%)`);
        resolve();
      })
      .on("error", (err) => {
        console.error(`Gzip failed for ${inputPath}: ${err.message}`);
        reject(err);
      });
  });
}

async function runAnalysis() {
  try {
    // 1. Read the raw data file
    const rawData = fs.readFileSync(RAW_DATA_FILE, "utf8");
    const jobData = JSON.parse(rawData);
    const jobs = jobData.data || [];

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

    // 4. Jobs by Company vs Experience Range (Top 20) - NEW REQUIRED ANALYSIS
    const companyVsExperience = aggregateCompanyVsExperience(jobs, 20);

    // 5. Combine the results into a single object
    const finalChartData = {
      byCompany: byCompany,
      byLocation: byLocation,
      byRoleType: byRoleType,
      companyVsExperience: companyVsExperience,
      totalCount: jobs.length,
      experienceRanges: EXPERIENCE_RANGES.map((r) => r.label),
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
