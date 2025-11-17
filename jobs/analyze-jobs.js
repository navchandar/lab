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

    // 4. Combine the results into a single object
    const finalChartData = {
      byCompany: byCompany,
      byLocation: byLocation,
      byRoleType: byRoleType,
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
