import { CITY_ALIAS, DATA_TABLE_CONFIG } from "./constants.js";
import { GENERAL_COLOR_PALETTE as GEN_COLORS } from "./constants.js";
import { ROLE_TYPE_COLOR_PALETTE as ROLE_COLORS } from "./constants.js";

// Global variable to hold all jobs
let allJobs = [];
let lastModified = null;
let lastAddedOn = null;
let initialLoadComplete = false;
let notificationPermission = "default";
let lastNotification = null;
// Unique tag to group/manage notifications
const NOTIFICATION_TAG = "job-update-notification";

const lastMod = document.getElementById("last-refresh");
const dataTable = document.getElementById("jobTable");

let globalChartData = null;
let chartLoadStatus = "unloaded"; // 'unloaded', 'loading', 'loaded', 'failed'
let currentChartInstance = null; // Store the Chart.js instance

// --- Initialize an empty DataTable ---
// We initialize it once with configuration, then add data later
let jobsTable = null;
if (typeof jQuery === "undefined") {
  showToast("Error: jQuery failed to load");
  lastMod.textContent = "Error: jQuery failed to load";
} else {
  console.log("jQuery is loaded. Initializing DataTable.");
  try {
    jobsTable = jQuery("#jobTable").DataTable(DATA_TABLE_CONFIG);
  } catch (e) {
    showToast("Error initializing the jobs table. Check console!");
    lastMod.textContent = "Error: Failed to initialize DataTable";
    console.error("DataTable initialization failed:", e);
  }
}

function normalizeLocation(location) {
  if (!location) {
    return "";
  }

  const locLower = location.toLowerCase().trim();

  // Normalize known city aliases
  for (const [canonical, aliases] of Object.entries(CITY_ALIAS)) {
    for (const alias of aliases) {
      if (locLower.includes(alias)) {
        return canonical.charAt(0).toUpperCase() + canonical.slice(1);
      }
    }
  }

  // Remove trailing country info
  if (location.includes(",")) {
    location = location
      .replace(
        /\s*,?\s*(usa|united states|india|canada|uk|australia|germany|france|italy|spain|uae|singapore|china|japan|brazil|mexico)\s*$/i,
        ""
      )
      .trim();
  }

  return location;
}

/**
 * Updates the UI with the download percentage.
 * @param {number} percentage The current download percentage (0-100).
 */
function updateDownloadProgress(percentage) {
  if (lastMod) {
    // Round to nearest integer for display
    const roundedPercentage = Math.round(percentage);
    if (percentage > 100) {
      lastMod.textContent = "Processing Jobs Data...";
    } else {
      lastMod.textContent = `Loading Jobs Data: ${roundedPercentage}%`;
    }
  }
}

// Update last modified timestamp from Jobs.json to UI
function updateRefreshTimeDisplay(gmtDateString, jobsAdded) {
  if (!lastMod || !gmtDateString) {
    return;
  }
  let txtContent = "";
  // convert the GMT date string to relative time
  const relativeTime = getRelativeTimeDisplay(gmtDateString);
  if (relativeTime) {
    txtContent = `Last updated: ${relativeTime}.`;
  }
  if (jobsAdded) {
    txtContent += ` ${jobsAdded} new posts detected!`;
  }
  lastMod.textContent = txtContent;
}

const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/**
 * Converts a UTC ISO 8601 date string to the user's local time.
 * * @param {string} utcDateString - Input date string (e.g., '2025-10-22T07:14:43.184Z')
 * @returns {string} The formatted local date string (formatted as 'yyyy-mm-dd hh:mm TZ').
 */
function convertToLocalTime(utcDateString) {
  try {
    const date = new Date(utcDateString);
    const formatter = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZoneName: "short",
    });

    const parts = formatter.formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value || "";

    const formatted = `${get("year")}-${get("month")}-${get("day")} ${get(
      "hour"
    )}:${get("minute")} ${get("timeZoneName")}`;
    return formatted.trim();
  } catch {
    console.log("Error converting to local timezone");
    return null;
  }
}

function parseMinExperience(expStr) {
  try {
    if (!expStr || expStr === "—") {
      return null;
    }
    const match = expStr.match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
  } catch (error) {
    console.error(error);
  }
}

/**
 * Calculates the time difference between a past date string and now,
 * and formats it into a human-readable string (e.g., "2 hours ago", "1 hour 30 mins ago").
 *
 * @param {string} gmtDateString - The date string from Jobs.json.
 * @returns {string} The human-readable relative time string.
 */
function getRelativeTimeDisplay(gmtDateString) {
  const pastDate = new Date(gmtDateString);
  const now = new Date();

  // 1. Basic Validation
  if (isNaN(pastDate.getTime())) {
    return "Invalid Date";
  }

  // 2. Calculate Difference in Minutes
  // Get time in milliseconds, find the absolute difference, and convert to minutes.
  const diffMinutes = Math.floor(
    (now.getTime() - pastDate.getTime()) / (1000 * 60)
  );

  // 3. Handle Time Ranges
  if (diffMinutes < 1) {
    return "just now";
  } else if (diffMinutes < 60) {
    // Less than 1 hour (e.g., "10 mins ago")
    return `${diffMinutes} min${diffMinutes !== 1 ? "s" : ""} ago`;
  } else {
    // 1 hour or more (e.g., "2 hours ago", "1 hour 30 mins ago")
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;

    let timeParts = [];

    // Build the hours part
    timeParts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);

    // Add minutes only if they are greater than 0
    if (minutes > 0) {
      timeParts.push(`${minutes} min${minutes !== 1 ? "s" : ""}`);
    }

    // Join the parts and append 'ago'
    return timeParts.join(" ") + " ago";
  }
}

function showToast(message_text) {
  const toast = document.getElementById("ip-toast");
  const message = document.getElementById("ip-toast-message");
  const closeBtn = document.getElementById("ip-toast-close");
  try {
    // Update message and show toast
    toast.classList.remove("show");
    message.textContent = `${message_text}`;
    console.log(message_text);
    toast.classList.add("show");

    // Manual close
    closeBtn.onclick = () => {
      toast.classList.remove("show");
    };
  } catch (error) {
    console.error(error);
  }
}

function closeErrorToast() {
  try {
    const toast = document.getElementById("ip-toast");
    const toast_message = toast.querySelector("#ip-toast-message").textContent;
    if (
      toast &&
      toast.classList.contains("show") &&
      toast_message.includes("Error")
    ) {
      toast.classList.remove("show");
    }
  } catch (error) {
    console.error(error);
  }
}

/**
 * Requests browser notification permission if it hasn't been granted or denied.
 * Updates the global notificationPermission variable.
 */
function requestNotificationPermission() {
  // Check if the browser supports notifications
  if (!("Notification" in window)) {
    console.warn("Notifications are not supported by this browser.");
    return;
  }

  // Check the current permission status
  if (
    Notification.permission === "granted" ||
    Notification.permission === "denied"
  ) {
    notificationPermission = Notification.permission;
    return;
  }

  // Request permission from the user
  Notification.requestPermission().then((permission) => {
    notificationPermission = permission;
    console.log(`Notification permission status: ${permission}`);
  });
}

/**
 * Sends a browser notification for the job update.
 * @param {string} refreshTime The time the jobs were updated (for display).
 */
function sendJobUpdateNotification(refreshTime, addedJobs) {
  // Only proceed if permission has been granted
  if (notificationPermission !== "granted") {
    console.log("Cannot send notification: Permission not granted.");
    return;
  }

  // Clear older notification (if it's still open)
  if (lastNotification) {
    lastNotification.close();
    lastNotification = null;
  }
  // Define the notification content
  const msg = `${addedJobs} new job post${
    addedJobs !== 1 ? "s" : ""
  } detected: ${refreshTime}`;
  const options = {
    body: msg,
    tag: NOTIFICATION_TAG, // Helps manage and replace existing notifications
    renotify: true, // Indicates that a new alert should be shown even if a notification with the same tag is already visible.
  };

  showToast(msg);
  const notification = new Notification("Updates", options);

  // 2. Add behavior for when the user clicks the notification
  notification.onclick = function (event) {
    // This ensures the current tab/window is brought to the foreground
    event.preventDefault();
    window.focus();
    window.open(window.location.href, "_self");
    // Close the notification after click
    notification.close();
  };

  // 3. Store the new notification reference
  lastNotification = notification;
}

function hideSpinner() {
  const spinner = document.getElementById("loadingSpinner");
  const filters = document.getElementById("filters");
  const rows = document.querySelectorAll(".dt-layout-row");

  // Ensure elements are available
  if (!spinner || !dataTable || !filters || rows.length < 2) {
    console.warn("Required UI elements for hideSpinner not found.");
  }

  if (spinner.style.display === "none") {
    return;
  }

  const baseDelay = 150; // ms between each step
  spinner.style.opacity = "0";

  // --- Step 1: Hide Spinner and Show Table Body (After Spinner Fade) ---
  setTimeout(() => {
    // Hide the spinner container
    spinner.style.display = "none";
    // Show the table body and fade it in
    // Note: The DataTables main element (likely the div wrapping the table)
    // should have initial opacity: 0 and transition: opacity 0.5s ease;
    dataTable.style.display = "block";
    dataTable.style.opacity = "1";
  }, 500);

  // --- Step 2: Show Filters ---
  setTimeout(() => {
    filters.style.display = "flex";
  }, 500 + baseDelay * 1);

  // --- Steps 3: Show DataTables Rows ---
  // Apply a dynamic delay for sequential showing
  rows.forEach((row, index) => {
    setTimeout(() => {
      // Append '!important' to the inline style value.
      // This forces the inline style to win over the external CSS '!important' rule.
      row.style.setProperty("display", "flex", "important");
    }, 500 + baseDelay * (2 + index));
  });
}

// --- Utility: Fetch with Error Handling ---
async function get(url, options = {}) {
  try {
    console.log(`Loading ${url}`);
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response;
  } catch (error) {
    console.error("Request Failed to", url, error);
    throw error;
  }
}

// -- Get jobs.json.gz compressed file and decompress --
async function fetchAndDecompressGzip(url) {
  // 1. Fetch the compressed file as a binary response
  const response = await get(url, { cache: "no-store" });
  // 2. Treat response as a binary stream (Blob is the easiest way)
  const blob = await response.blob();
  // 3. Decompress the stream
  const ds = new DecompressionStream("gzip");
  // Pipe the blob's stream through the decompressor
  const decompressedStream = blob.stream().pipeThrough(ds);
  // 4. Read the decompressed text and parse JSON
  const decompressedText = await new Response(decompressedStream).text();
  return JSON.parse(decompressedText);
}

/**
 * Fetches data using the fetch API, tracks progress by reading the stream,
 * and optionally decompresses GZIP using DecompressionStream.
 * @param {string} url The URL of the resource.
 * @param {boolean} isGzip Whether the resource is GZIP compressed.
 * @returns {Promise<object>} A promise that resolves with the parsed JSON data.
 */
async function fetchWithProgressAndDecompress(url, isGzip) {
  const response = await get(url, { cache: "no-store" });

  // Get the total size of the compressed file from the header
  const contentLength = response.headers.get("Content-Length");
  const totalSize = contentLength ? parseInt(contentLength, 10) : null;

  let loaded = 0;
  const chunks = [];

  // tee() creates two identical, independent streams from the original response body.
  const [downloadStream, processingStream] = response.body.tee();
  // --- 1. Progress Tracking (Reads the RAW compressed stream) ---
  const progressReader = downloadStream.getReader();

  // This promise runs asynchronously to update the UI while the other stream processes the data.
  const progressPromise = (async () => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await progressReader.read();

      // Once the raw download is finished, update the UI to 100%
      if (done) {
        if (totalSize) {
          updateDownloadProgress(100);
        }
        break;
      }
      // 'value' here is a chunk of the *compressed* data.
      loaded += value.length;
      if (totalSize) {
        const percentage = Math.min((loaded / totalSize) * 100, 100);
        updateDownloadProgress(percentage);
      }
    }
  })();

  // --- Data Processing (Decompresses and Collects the file) ---
  let finalStream = processingStream;
  if (isGzip) {
    if (!("DecompressionStream" in window)) {
      throw new Error("Browser does not support DecompressionStream for GZIP.");
    }
    // Pipe the second stream through the decompressor
    finalStream = finalStream.pipeThrough(new DecompressionStream("gzip"));
  }

  // Read the processed (decompressed or raw JSON) stream
  const finalReader = finalStream.getReader();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await finalReader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }
  // Read the stream chunk by chunk to track progress

  // --- Wait for both to finish and return the result ---
  // Ensure the progress tracking finishes before we proceed
  await progressPromise;

  // Combine chunks (now fully downloaded and decompressed/collected)
  const allChunks = new Uint8Array(
    chunks.reduce((acc, chunk) => acc + chunk.length, 0)
  );
  let offset = 0;
  for (const chunk of chunks) {
    allChunks.set(chunk, offset);
    offset += chunk.length;
  }

  // Decode to string and parse JSON
  const decoder = new TextDecoder("utf-8");
  const jsonString = decoder.decode(allChunks);

  updateDownloadProgress(101);
  return JSON.parse(jsonString);
}

async function fetchJobsData() {
  // Determine if GZIP is supported
  const supportsGzip = "DecompressionStream" in window;
  console.log(`GZIP support: ${supportsGzip}`);

  // Base URL for the JSON file
  const jsonUrl = `jobs.json?nocache=${Date.now()}`;
  const gzipUrl = `jobs.json.gz?nocache=${Date.now()}`;

  if (supportsGzip) {
    try {
      return await fetchWithProgressAndDecompress(gzipUrl, true);
      // return await fetchAndDecompressGzip(gzipUrl);
    } catch (e) {
      console.warn(
        `GZIP fetch/decompression failed. Falling back to JSON. Error: ${e.message}`
      );
    }
  }

  // --- Fallback to Direct JSON Fetch (Runs if GZIP failed or was unsupported) ---
  try {
    return await fetchWithProgressAndDecompress(jsonUrl, false);
    // const response = await get(jsonUrl, { cache: "no-store" });
    // return await response.json();
  } catch (jsonError) {
    throw new Error(
      `Failed to fetch job data (GZIP failed/unsupported, JSON failed): ${jsonError.message}`
    );
  }
}

/**
 * Scrolls the main content area or the table container into view.
 */
function scrollToTableTop() {
  const mainContent = document.querySelector("main");

  if (mainContent) {
    // Scroll the main container to the top of the viewport
    mainContent.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  } else {
    // Fallback: scroll the table container itself if 'main' isn't found
    const tableView = document.querySelector(".table-container");
    if (tableView) {
      tableView.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }
}

/**
 * Attaches a single delegated click listener to handle pagination clicks.
 */
function setupPaginationScrollListener() {
  document.addEventListener("click", function (event) {
    // Check if the clicked element (or its closest parent) has the target class.
    const clickedButton = event.target.closest(".dt-paging-button");
    if (clickedButton) {
      scrollToTableTop();
    }
  });
}

/**
 * Destroys any existing Chart.js instance on the canvas.
 */
function destroyCurrentChart() {
  if (currentChartInstance) {
    currentChartInstance.destroy();
    currentChartInstance = null;
  }
}

/**
 * Fetches the aggregated chart data using the reusable 'get' function.
 */
async function loadChartData() {
  const CHART_DATA_URL = "charts_data.json";
  chartLoadStatus = "loading";
  try {
    const response = await get(CHART_DATA_URL, { cache: "no-store" });
    globalChartData = await response.json();
    chartLoadStatus = "loaded";
    return true;
  } catch (error) {
    console.error("Error loading chart data:", error);
    showToast(`Error loading chart data:\n${error.message}`);
    chartLoadStatus = "failed";
    return false;
  }
}

function getBorderColor(bgColor) {
  if (bgColor.startsWith("rgba")) {
    // Replace the last number (the alpha channel) with 1
    // e.g., 'rgba(54, 162, 235, 0.7)' -> 'rgba(54, 162, 235, 1)'
    return bgColor.replace(/,\s*[\d.]+\)$/, ", 1)");
  }
  // If it's a simple color (like hex or RGB without alpha), return it as is
  return bgColor;
}

// Function to determine the best text color
function getTextColor() {
  // Check for dark mode preference
  const isDarkMode =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  // Return a light gray for dark mode, or a dark gray for light mode
  return isDarkMode ? "#EEEEEE" : "#333333";
}

// --- CHART RENDERING LOGIC ---
/**
 * Renders the chart based on the selected analysis key.
 * @param {string} key - The data key to use (e.g., 'byRoleType').
 */
function drawChart(key) {
  if (!globalChartData || !globalChartData[key]) {
    console.error(`Error: Data for key "${key}" not found.`);
    showToast(`Error: Failed to display Chart. "${key}" data not found.`);
    destroyCurrentChart();
    return;
  }

  destroyCurrentChart();

  const canvasElement = document.getElementById("roleChart");
  const ctx = canvasElement.getContext("2d");
  const descriptionElement = document.getElementById("chartDescription");
  const dataSet = globalChartData[key];

  let chartProps;

  // --- Delegation Logic (replaces the large if/else block) ---
  switch (key) {
    case "byCompany":
    case "byLocation":
      chartProps = prepareSimpleHorizontalChart(key, dataSet);
      break;
    case "byRoleType":
      chartProps = prepareRoleTypeChart(dataSet);
      break;
    case "companyVsExperience":
      chartProps = prepareStackedExperienceChart(
        dataSet,
        globalChartData.experienceRanges
      );
      break;
    default:
      console.error(`Unknown chart key: ${key}`);
      destroyCurrentChart();
      return;
  }

  // --- Applying Prepared Properties ---
  const {
    labels,
    datasets,
    descriptionText,
    indexAxis,
    isStacked,
    dynamicHeight,
  } = chartProps;

  descriptionElement.textContent = descriptionText;
  canvasElement.style.height = dynamicHeight;
  canvasElement.style.width = "100%";

  // --- CHART INITIALIZATION ---
  currentChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: getTextColor() },
        },
      },
      indexAxis: indexAxis,
      scales: {
        x: {
          stacked: isStacked,
          beginAtZero: true,
          ticks: { color: getTextColor() },
        },
        y: {
          stacked: isStacked,
          // Only beginAtZero for Y axis if it's the value axis (i.e., vertical bars)
          beginAtZero: indexAxis === "x",
          ticks: {
            autoSkip: indexAxis !== "y",
            color: getTextColor(),
          },
        },
      },
    },
  });
}

// --- HELPER FUNCTIONS FOR CHART LOGIC ---
/**
 * Prepares data and settings for simple count charts (byCompany, byLocation).
 */
function prepareSimpleHorizontalChart(key, dataSet) {
  const labels = dataSet.map((item) => item.label);
  const counts = dataSet.map((item) => item.count);

  let descriptionText = "";
  if (key === "byCompany") {
    descriptionText = `Top ${dataSet.length} companies with the highest recent job posts.`;
  } else if (key === "byLocation") {
    descriptionText = `Distribution of recent job posts across various locations.`;
  }

  // Color logic (using cycling palette)
  const backgroundColors = counts.map(
    (_, index) => GEN_COLORS[index % GEN_COLORS.length].bg
  );
  const borderColors = backgroundColors.map(getBorderColor);

  const datasets = [
    {
      label: "Total Jobs",
      data: counts,
      backgroundColor: backgroundColors,
      borderColor: borderColors,
      borderWidth: 1,
    },
  ];

  const ITEM_HEIGHT = 40;
  const requiredHeight = dataSet.length * ITEM_HEIGHT + 100;

  return {
    labels,
    datasets,
    descriptionText,
    indexAxis: "y",
    isStacked: false,
    dynamicHeight: `${requiredHeight}px`,
  };
}

/**
 * Prepares data and settings for the simple vertical 'byRoleType' chart.
 */
function prepareRoleTypeChart(dataSet) {
  const labels = dataSet.map((item) => item.label);
  const counts = dataSet.map((item) => item.count);

  const descriptionText = `Distribution of recent job posts across different roles.`;

  // Color logic (using semantic colors)
  const backgroundColors = labels.map(
    (label) => (ROLE_COLORS[label] || ROLE_COLORS["Default"]).bg
  );
  const borderColors = backgroundColors.map(getBorderColor);

  const datasets = [
    {
      label: "Total Jobs",
      data: counts,
      backgroundColor: backgroundColors,
      borderColor: borderColors,
      borderWidth: 1,
    },
  ];

  return {
    labels,
    datasets,
    descriptionText,
    indexAxis: "x",
    isStacked: false,
    dynamicHeight: "400px", // Fixed height for vertical
  };
}

/**
 * Prepares data and settings for the stacked 'companyVsExperience' chart.
 */
function prepareStackedExperienceChart(dataSet, experienceRanges) {
  const descriptionText = `Distribution of job experience requirements within the Top ${dataSet.length} companies.`;
  const labels = dataSet.map((item) => item.company);

  // Prepare Datasets (one dataset for each experience range)
  const datasets = experienceRanges.map((rangeLabel, rangeIndex) => {
    const colorSet = GEN_COLORS[rangeIndex % GEN_COLORS.length];
    const backgroundColor = colorSet.bg;
    const borderColor = getBorderColor(backgroundColor);

    return {
      label: rangeLabel,
      data: dataSet.map((companyData) => {
        const rangeItem = companyData.distribution.find(
          (d) => d.range === rangeLabel
        );
        return rangeItem ? rangeItem.count : 0;
      }),
      backgroundColor: backgroundColor,
      borderColor: borderColor,
      borderWidth: 1,
    };
  });

  const ITEM_HEIGHT = 40;
  const requiredHeight = dataSet.length * ITEM_HEIGHT + 100;

  return {
    labels,
    datasets,
    descriptionText,
    indexAxis: "y",
    isStacked: true,
    dynamicHeight: `${requiredHeight}px`,
  };
}

async function renderCharts() {
  const toggleButton = document.getElementById("toggleView");
  const tableView = document.querySelector(".table-container");
  const tableWrap = document.getElementById("jobTable_wrapper");
  const chartView = document.getElementById("chart-view");
  const filters = document.getElementById("filters");
  const chartSelector = document.getElementById("chartSelector");

  // Add event listener for chart selection change
  chartSelector.addEventListener("change", (e) => {
    if (chartLoadStatus === "loaded") {
      drawChart(e.target.value);
    }
  });

  // Function to handle the actual view toggling
  async function toggleView(switchToCharts) {
    // Removed pushHistory argument
    if (switchToCharts) {
      // --- Switching to Chart View ---
      tableView.style.display = "none";
      tableWrap.style.display = "none";
      filters.style.display = "none";
      chartView.style.display = "block";
      toggleButton.textContent = "Display Job Listings";

      if (chartLoadStatus === "unloaded") {
        await loadChartData();
      }

      if (chartLoadStatus === "loaded") {
        drawChart(chartSelector.value);
      }
    } else {
      // --- Switching back to Table View ---
      tableView.style.display = "block";
      tableWrap.style.display = "block";
      filters.style.display = "flex";
      chartView.style.display = "none";
      toggleButton.textContent = "Display Charts";

      destroyCurrentChart();
    }
  }

  // Add event listener for the toggle button
  toggleButton.addEventListener("click", async (e) => {
    e.preventDefault();
    const isTableViewActive =
      tableView.style.display !== "none" || tableWrap.style.display !== "none";

    // Change the URL Hash (This triggers the 'hashchange' event below)
    if (isTableViewActive) {
      window.location.hash = "charts";
    } else {
      window.location.hash = ""; // Clear hash for table view
    }
    // Note: The 'hashchange' listener handles toggleView.
  });

  // Expose toggleView on the window for external use
  window.toggleView = toggleView;
}

/**
 * Sets up a listener for URL hash changes to toggle views.
 * This handles both initial load (if hash is present) and back/forward buttons.
 */
function setupHashListener() {
  const hashHandler = () => {
    // Check if the hash is #charts
    const switchToCharts = window.location.hash === "#charts";
    if (window.toggleView) {
      window.toggleView(switchToCharts);
    }
  };
  // Handle view change when the URL hash is modified (by click or back/forward)
  window.addEventListener("hashchange", hashHandler);

  //Handle the initial load
  hashHandler();
}

/**
 * Parses the URL query string and returns an object of key-value pairs.
 * @returns {Object} { c: 'val1,val2', l: 'val3', y: 'val4', ... }
 */
function parseUrlQuery() {
  const params = {};
  const searchParams = new URLSearchParams(window.location.search);

  // Define short keys for URL brevity
  params.companies = searchParams.get("c")?.split(",") || [];
  params.locations = searchParams.get("l")?.split(",") || [];
  params.yoe = searchParams.get("y") || "";
  params.length = searchParams.get("len") || "";
  params.search = searchParams.get("s") || "";

  return params;
}

/**
 * Reads current filter values, updates the URL query string, and pushes the state.
 */
function updateURL() {
  const url = new URL(window.location.href);
  const params = url.searchParams;

  // Clear existing filter/search parameters
  params.delete("c");
  params.delete("l");
  params.delete("y");
  params.delete("s");
  params.delete("len");

  // Get current filter values
  const selectedCompanies = asArray($("#companyFilter").val());
  const selectedLocations = asArray($("#locationFilter").val());
  const selectedExperience = $("#experienceFilter").val();
  const currentSearch = jobsTable.search(); // Get the global search value
  const pageLength = jobsTable.page.len(); // Get DataTables page length

  // Add non-empty values to the URL using short keys
  if (selectedCompanies.length > 0) {
    // Join multiple selections with a comma
    params.set("c", selectedCompanies.join(","));
  }
  if (selectedLocations.length > 0) {
    params.set("l", selectedLocations.join(","));
  }
  if (selectedExperience) {
    params.set("y", selectedExperience);
  }
  if (currentSearch) {
    // URL-encode the search string
    params.set("s", encodeURIComponent(currentSearch));
  }
  // Store page length
  if (pageLength && pageLength !== 10) {
    // Only store if not the default
    params.set("len", pageLength);
  }

  // Update the URL without reloading the page
  // Note: history.pushState is better than just changing window.location.search
  // because it adds an entry for the back button.
  history.pushState(null, "", url.toString());
}

// Add this new function
function loadFiltersFromURL() {
  const params = parseUrlQuery();

  // If there are no filter/search parameters in the URL, there's nothing to do.
  if (
    !params.length &&
    !params.search &&
    params.companies.length === 0 &&
    params.locations.length === 0 &&
    !params.yoe
  ) {
    return;
  }

  // This must be done before the draw call
  if (params.length) {
    const len = parseInt(params.length, 10);
    // DataTables accepts -1 for 'All'
    if (len > 0 || len === -1) {
      jobsTable.page.len(len);
    }
  }

  // Apply Global Search
  let searchApplied = false;
  if (params.search) {
    const decodedSearch = decodeURIComponent(params.search);
    jobsTable.search(decodedSearch);
    $("#dt-search-0").val(decodedSearch);
    searchApplied = true;
  }

  // --- Apply Selections to Filters (Handles Non-existent Values Gracefully) ---
  // Company Filter (Multi-select)
  $("#companyFilter").val(params.companies).trigger("change.select2");
  // Location Filter (Multi-select)
  $("#locationFilter").val(params.locations).trigger("change.select2");
  // Experience Filter (Single-select)
  // We use params.yoe directly (which is a string or empty string)
  $("#experienceFilter").val(params.yoe).trigger("change.select2");

  if (searchApplied || params.length) {
    jobsTable.draw();
  }
}

async function main() {
  requestNotificationPermission();
  // Get the IANA Timezone Name
  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  console.log("Local Timezone:", localTimeZone);

  // Initialize Select2 on the dropdowns
  setupSelectDropdowns();

  // --- Load Data using Fetch API ---
  async function loadJobs() {
    const url = `jobs.json?nocache=${Date.now()}`;
    closeErrorToast();

    try {
      const headResponse = await get(url, {
        method: "HEAD",
        cache: "no-store",
      });

      const newModified = headResponse.headers.get("Last-Modified");
      if (lastModified && newModified && newModified === lastModified) {
        console.log("No changes in jobs.json");
        return;
      }
      // Update stored value
      lastModified = newModified;

      // Fetch and update table
      const resp = await fetchJobsData();

      allJobs = resp.data;
      const added = resp.recentlyAddedCount;
      const addedOn = resp.recentlyUpdatedOn;

      updateRefreshTimeDisplay(addedOn, added);

      allJobs.forEach((job) => {
        const originalDate = job.datePosted;
        const localTime = convertToLocalTime(originalDate);
        if (localTime) {
          job.datePosted = localTime;
        } else {
          // Replace 'T' with ' T' to insert a space
          job.datePosted = originalDate.replace("T", " T");
        }
        // Normalize location for dropdown
        job.normalizedLocation = normalizeLocation(job.location);
      });

      // --- Populate the table using the DataTables API ---
      populateTable(allJobs);

      if (initialLoadComplete) {
        // Since jobs.json changed, the chart data is now stale.
        // Reset the status to 'unloaded' and clear the old data.
        chartLoadStatus = "unloaded";
        globalChartData = null;
      }

      // Only send notification on subsequent updates, not the initial page load
      if (initialLoadComplete && added > 0 && lastAddedOn !== addedOn) {
        const relativeTime = getRelativeTimeDisplay(addedOn);
        // const displayTime = convertToLocalTime(newModified);
        console.log("Sending notification. Added:", added, "on", addedOn);
        sendJobUpdateNotification(relativeTime || "Just Now", added);
        lastAddedOn = addedOn;
      } else if (lastAddedOn === addedOn) {
        console.log("No notification sent. Jobs last updated:", lastAddedOn);
      } else if (added <= 0) {
        console.log("No notification sent. Jobs recently added:", added);
      }

      if (!initialLoadComplete) {
        setupEventListeners();
        // After initial load and setup, check the URL for filters
        loadFiltersFromURL();
        initialLoadComplete = true;
      }

      hideSpinner();
    } catch (error) {
      hideSpinner();
      let msg = "";
      if (error instanceof TypeError) {
        msg = "Network Error: Could not reach the server";
        console.error("Network Error: Could not reach the server", error);
        showToast(msg);
      } else {
        msg = "Error: Failed to fetch jobs data";
        console.error(console, error);
        showToast(`${console}:\n${error.message}`);
      }
      lastMod.textContent = msg;
    }
  }

  function setupSelectDropdowns() {
    $("#companyFilter").select2({
      placeholder: "Select Companies", // Friendly prompt
      allowClear: true, // Adds an 'x' to clear selection
      width: "100%", // Ensures it fits its container
    });

    $("#locationFilter").select2({
      placeholder: "Select Locations",
      allowClear: true,
      width: "100%",
    });

    $("#experienceFilter").select2({
      placeholder: "Min Exp",
      allowClear: true,
      width: "100%",
    });
  }

  // --- Function to populate the table ---
  function populateTable(jobs) {
    // Clear the existing data
    jobsTable.clear();
    let props = 'target="_blank" rel="noopener noreferrer"';

    // Prepare data for DataTables. It expects an array of arrays.
    const dataToLoad = jobs.map((job) => {
      // Add job title description
      let titleAttr = "";
      if (job.description) {
        // Escape quotes (") for the HTML attribute and replace newlines (\n)
        const descriptionTxt = job.description
          .replace(/"/g, "&quot;") // Escape double quotes
          .replace(/(\r\n|\r|\n)+/g, "\n")
          .replace(/\n/g, "&#10;"); // Replace newlines for tooltip

        titleAttr = `title="${descriptionTxt}"`;
      }
      let roleType = job.classification.roleType;
      let roleTypeLink = `<a href="#" class="search-role-type">#${roleType}</a>`;
      let jobTitleLink = `<a href="${job.url}" ${props} ${titleAttr}>${job.title}</a>`;
      // The data order returned MUST match <thead> column titles
      return [
        jobTitleLink,
        job.company,
        job.location,
        roleType === "—" ? roleType : roleTypeLink,
        job.experienceRequired,
        job.datePosted,
      ];
    });

    // Add the new data and redraw the table
    jobsTable.rows.add(dataToLoad).draw();

    // Populate filters based on ALL jobs ---
    // Extract unique company and location names
    const companies = [...new Set(jobs.map((j) => j.company))].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
    const locations = [...new Set(jobs.map((j) => j.normalizedLocation))].sort(
      (a, b) => a.toLowerCase().localeCompare(b.toLowerCase())
    );

    // Extract unique experience years
    const experienceSet = new Set();
    jobs.forEach((job) => {
      const exp = parseMinExperience(job.experienceRequired);
      if (exp !== null) {
        experienceSet.add(exp);
      }
    });
    const sortedExp = Array.from(experienceSet).sort((a, b) => a - b);

    // Populate filters with ALL options and clear selections
    populateFilter("#companyFilter", companies, []);
    populateFilter("#locationFilter", locations, []);
    populateFilter("#experienceFilter", sortedExp, []);
  }

  /**
   * Populates a filter dropdown.
   * Ensures string-based comparison for selected values.
   */
  function populateFilter(selector, options, selected) {
    const $el = $(selector);

    // Normalize inputs
    const opts = Array.isArray(options) ? options : [];
    // Ensure selected is always an array of STRINGS for comparison
    const selectedArr = asArray(selected).map((v) => String(v));

    // Build a set of options (as strings) and make sure existing selections stay present
    const set = new Set(opts.map((v) => String(v)));
    selectedArr.forEach((v) => {
      if (v !== undefined && v !== null && v !== "") {
        set.add(v);
      }
    });

    // Rebuild options
    $el.empty();

    // Add blank option for single-selects to allow placeholder
    if (!$el.prop("multiple")) {
      $el.append(new Option());
    }

    // Sort the values
    const sortedValues = Array.from(set);
    // Check if all are numeric to sort properly
    const allNumeric =
      sortedValues.length > 0 &&
      sortedValues.every((v) => v === "" || !isNaN(parseFloat(v)));

    sortedValues.sort((a, b) => {
      if (a === "") {
        return -1;
      } // Keep blank at top
      if (b === "") {
        return 1;
      }
      if (allNumeric) {
        return (parseFloat(a) || 0) - (parseFloat(b) || 0);
      }
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });

    sortedValues.forEach((val) => {
      if (val === "" && !$el.prop("multiple")) {
        return;
      } // Already added blank option

      // Compare strings to strings for correct selection
      $el.append(
        new Option(val, val, false, selectedArr.includes(String(val)))
      );
    });

    // Set the value *after* populating, then trigger Select2 update
    $el.val(selected);
    $el.trigger("change.select2");
  }

  /**
   * This function just triggers a redraw.
   * The actual filtering is handled by the DataTables search function.
   */
  function applyFilters() {
    jobsTable.draw();
    updateURL();
    scrollToTableTop();
  }

  /**
   * This function populates dropdowns based ONLY on the global search text.
   * This fixes the "shrinking dropdowns" bug.
   */
  function updateDropdowns() {
    // Get ALL current filter values to preserve them
    const selectedCompanies = asArray($("#companyFilter").val());
    const selectedLocations = asArray($("#locationFilter").val());
    const selectedExperience = $("#experienceFilter").val(); // Single string value

    // Get the indices of the rows that match the current global search (across all pages)
    const filteredRowIndices = jobsTable
      .rows({ search: "applied", page: "all" })
      .indexes()
      .toArray(); // Convert to a standard JS array

    // Map these indices back to the original 'allJobs' array to get the job objects
    const searchedJobs = filteredRowIndices.map((index) => allJobs[index]);

    // --- Now, populate dropdowns based on this 'searchedJobs' list ---
    // Update Company Dropdown
    const companies = Array.from(
      new Set(searchedJobs.map((j) => j.company))
    ).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    populateFilter("#companyFilter", companies, selectedCompanies);

    // Update Location Dropdown
    const locations = Array.from(
      new Set(searchedJobs.map((j) => j.normalizedLocation))
    ).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    populateFilter("#locationFilter", locations, selectedLocations);

    // Update Experience Dropdown
    const experienceSet = new Set();
    searchedJobs.forEach((job) => {
      const exp = parseMinExperience(job.experienceRequired);
      if (exp !== null) {
        experienceSet.add(exp);
      }
    });
    const sortedExp = Array.from(experienceSet).sort((a, b) => a - b);
    populateFilter("#experienceFilter", sortedExp, asArray(selectedExperience));
    updateURL();
  }

  /**
   * Clears all filters and search, then redraws and updates dropdowns.
   */
  function resetAllFilters() {
    // Clear the DataTables global search
    jobsTable.search("");
    // Also clear the physical input box (assuming default ID)
    $("#dt-search-0").val("");

    // Clear dropdown values and update Select2 display
    $("#companyFilter").val(null).trigger("change.select2");
    $("#locationFilter").val(null).trigger("change.select2");
    $("#experienceFilter").val(null).trigger("change.select2");

    // Push a clean URL state
    const clean_url = window.location.pathname + window.location.hash;
    history.pushState(null, "", clean_url);

    // Manually call applyFilters() ONCE to redraw the table with no filters
    applyFilters();

    // Manually call updateDropdowns() to repopulate them with all options
    updateDropdowns();
  }

  /**
   * Wires up the new, simplified filter logic.
   */
  function setupEventListeners() {
    // Custom filtering function for DataTables
    $.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
      // Get values from ALL filters
      const selectedCompanies = asArray($("#companyFilter").val());
      const selectedLocations = asArray($("#locationFilter").val());
      const selectedExperience = parseInt($("#experienceFilter").val(), 10);

      // Get the job object from our global array
      const job = allJobs[dataIndex];
      if (!job) {
        // Failsafe
        return false;
      }

      const company = job.company;
      const location = job.normalizedLocation;
      const jobExp = parseMinExperience(job.experienceRequired); // null or number

      // Check Company match
      const companyMatch =
        selectedCompanies.length === 0 || selectedCompanies.includes(company);

      // Check Location match
      const locationMatch =
        selectedLocations.length === 0 || selectedLocations.includes(location);

      // Check Experience match (Min YoE)
      const experienceMatch =
        isNaN(selectedExperience) ||
        (jobExp !== null && jobExp >= selectedExperience);

      // All must be true to show the row
      return companyMatch && locationMatch && experienceMatch;
    });

    // Attach filter change listeners
    // When a dropdown changes, apply all filters
    $("#companyFilter").on("change", applyFilters);
    $("#locationFilter").on("change", applyFilters);
    $("#experienceFilter").on("change", applyFilters);

    // When the DataTables global search input is used, update the dropdowns.
    jobsTable.on("search.dt", updateDropdowns);

    jobsTable.on("length.dt", updateURL);

    // When reset is clicked, clear all filters and redraw
    $("#resetFilters").on("click", resetAllFilters);

    $("#jobTable").on("click", ".search-role-type", function (e) {
      e.preventDefault();
      // Get the text content of the link (e.g., "#SoftwareQA")
      let searchText = $(this).text();
      // Apply the search to DataTables
      jobsTable.search(searchText).draw();
      $("#dt-search-0").val(searchText);
      scrollToTableTop();
    });

    window.addEventListener("online", loadJobs);

    setupPaginationScrollListener();

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        console.log("Tab is active");
        loadJobs();
      }
    });
  }

  // Handle the browser's back/forward buttons for query changes
  window.addEventListener("popstate", () => {
    // Only load filters if we're not currently in the chart view
    if (window.location.hash !== "#charts") {
      loadFiltersFromURL();
    }
  });

  // Run once immediately to load jobs
  await loadJobs();

  // Setup the chart view components
  await renderCharts();
  // Setup the simplified history handling (hash listener)
  setupHashListener();

  // Poll every 2 minutes
  setInterval(loadJobs, 2 * 60 * 1000);
}

document.addEventListener("DOMContentLoaded", main);
