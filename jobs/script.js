import { CITY_ALIAS, DATA_TABLE_CONFIG } from "./constants.js";
import { GENERAL_COLOR_PALETTE as GEN_COLORS } from "./constants.js";
import { ROLE_TYPE_COLOR_PALETTE as ROLE_COLORS } from "./constants.js";

// Global variable to hold all jobs
let allJobs = [];
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
let lastETag = null;

// --- Function to safely initialize DataTable ---
function initializeJobsTable() {
  if (typeof jQuery !== "undefined" && jQuery.fn.dataTable) {
    console.log("jQuery and DataTable are available. Initializing DataTable.");
    try {
      jobsTable = jQuery("#jobTable").DataTable(DATA_TABLE_CONFIG);
      jobsTable.on("draw.dt", initializeTippyOnVisibleRows);
    } catch (e) {
      showToast("Error initializing the jobs table. Check console!");
      lastMod.textContent = "Error: Failed to initialize DataTable";
      console.error("DataTable initialization failed:", e);
    }
  } else {
    showToast("Fatal Error: DataTables or jQuery is missing.");
    lastMod.textContent = "Fatal Error: DataTables or jQuery is missing.";
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
        "",
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
    if (roundedPercentage >= 95) {
      updateProgressBar(95);
      setTimeout(() => updateProgressBar(100), 500);
    } else {
      updateProgressBar(roundedPercentage);
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
    });

    const parts = formatter.formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value || "";

    const formatted = `${get("year")}-${get("month")}-${get("day")}`;
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
 * Parses a job experience string (e.g., "2-5", "5+", "10") into a min/max object.
 * @param {string} expStr - The raw experience string from the job data.
 * @returns {object|null} {min: number, max: number} or null if N/A.
 */
function parseJobExperienceRange(expStr) {
  try {
    if (!expStr || expStr === "—" || expStr.toLowerCase() === "n/a") {
      return null;
    }

    // 1. Match Range: "X-Y" (e.g., "2-5")
    const rangeMatch = expStr.match(/(\d+)\s*-\s*(\d+)/);
    if (rangeMatch) {
      const min = parseInt(rangeMatch[1], 10);
      const max = parseInt(rangeMatch[2], 10);
      // Ensure min is not greater than max (handles bad data)
      return { min: Math.min(min, max), max: Math.max(min, max) };
    }

    // 2. Match Minimum: "X+" (e.g., "5+")
    const plusMatch = expStr.match(/(\d+)\s*\+/);
    if (plusMatch) {
      const min = parseInt(plusMatch[1], 10);
      return {
        min: min,
        // Set maximum as minimum + 3 years
        max: min + 3,
      };
    }

    // 3. Match Single Value: "X" (e.g., "10")
    const singleMatch = expStr.match(/^(\d+)$/);
    if (singleMatch) {
      const min = parseInt(singleMatch[1], 10);
      return {
        min: min - 1,
        max: min + 2,
      };
    }

    return null;
  } catch (error) {
    console.error("Error parsing job experience range:", expStr, error);
    return null;
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
    (now.getTime() - pastDate.getTime()) / (1000 * 60),
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

// --- Toast Notification State ---
let toastTimer = null;
let activeInteractionHandler = null;

function cleanToastListener() {
  if (activeInteractionHandler) {
    document.removeEventListener("click", activeInteractionHandler);
    document.removeEventListener("keydown", activeInteractionHandler);
    activeInteractionHandler = null;
  }
}

function toastInteractionListener() {
  console.log("User interaction detected. Closing toast in 10s...");

  // Start the countdown
  toastTimer = setTimeout(() => {
    const toast = document.getElementById("ip-toast");
    toast.classList.remove("show");
  }, 5000); // 5 seconds

  // Stop listening now that the user has interacted once
  cleanToastListener();
}

function showToast(message_text) {
  const toast = document.getElementById("ip-toast");
  const message = document.getElementById("ip-toast-message");
  const closeBtn = document.getElementById("ip-toast-close");

  // DOM elements check
  if (!toast || !message || !closeBtn) {
    return;
  }

  try {
    toast.classList.remove("show");
    // 1. Reset: Clear existing timers and listeners
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    cleanToastListener();

    // 2. Display: Update content and show
    message.textContent = `${message_text}`;
    toast.classList.add("show");

    // 3. Manual Close Logic
    closeBtn.onclick = () => {
      toast.classList.remove("show");
      cleanToastListener();
      if (toastTimer) {
        clearTimeout(toastTimer);
      }
    };

    activeInteractionHandler = toastInteractionListener;

    // 4. Attach Listener
    setTimeout(() => {
      document.addEventListener("click", activeInteractionHandler);
      document.addEventListener("keydown", activeInteractionHandler);
    }, 100);
  } catch (error) {
    console.error("Toast Error:", error);
  }
}

function closeErrorToast() {
  try {
    const toast = document.getElementById("ip-toast");
    if (!toast) {
      return;
    }
    let messageEl = toast.querySelector("#ip-toast-message");
    if (!messageEl) {
      return;
    }
    let toast_message = messageEl.textContent.toLowerCase();
    const errMsg =
      toast_message.includes("error") || toast_message.includes("fail");

    // Check if it is open and is an error message
    if (toast.classList.contains("show") && errMsg) {
      toast.classList.remove("show");

      // Cleanup timer if we force close it
      if (toastTimer) {
        clearTimeout(toastTimer);
      }
      cleanToastListener();
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
    dataTable.style.opacity = "1";
  }, 500);

  // --- Step 2: Show Filters ---
  setTimeout(
    () => {
      filters.style.display = "flex";
    },
    500 + baseDelay * 1,
  );

  // --- Steps 3: Show DataTables Rows ---
  // Apply a dynamic delay for sequential showing
  rows.forEach((row, index) => {
    setTimeout(
      () => {
        // Append '!important' to the inline style value.
        // This forces the inline style to win over the external CSS '!important' rule.
        row.style.setProperty("display", "flex", "important");
      },
      500 + baseDelay * (2 + index),
    );
  });
}

// Function to update the progress bar width
function updateProgressBar(percentage) {
  const progressBar = document.getElementById("pageProgress");
  const container = progressBar ? progressBar.parentElement : null;
  if (!progressBar || !container) {
    return;
  }
  const currentWidth = parseFloat(progressBar.style.width) || 0;
  if (currentWidth !== percentage) {
    progressBar.style.width = percentage + "%";
  }

  if (percentage > 0 && percentage < 100) {
    container.style.opacity = "1";
  }

  // Hide the bar when loading is complete
  if (percentage >= 100) {
    setTimeout(() => {
      container.style.opacity = "0";
      setTimeout(() => {
        progressBar.style.width = "0%";
      }, 2000);
    }, 3000);
  }
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
    let lastUpdate = 0;

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
      const now = Date.now();
      if (totalSize && now - lastUpdate > 100) {
        const percentage = Math.min((loaded / totalSize) * 100, 100);
        updateDownloadProgress(percentage);
        lastUpdate = now;
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
    chunks.reduce((acc, chunk) => acc + chunk.length, 0),
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
        `GZIP fetch/decompression failed. Falling back to JSON. Error: ${e.message}`,
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
      `Failed to fetch job data (GZIP failed/unsupported, JSON failed): ${jsonError.message}`,
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

// ==========================================
// 1. STATE & UTILITIES
// ==========================================

/** Destroys existing Chart instance */
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

// Color Utilities
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
  const isDarkMode =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  // Return a light gray for dark mode, or a dark gray for light mode
  return isDarkMode ? "#EEEEEE" : "#333333";
}

// ==========================================
// 2. CHART OPTION FACTORIES
// ==========================================

/**
 * Generates options for standard Bar/Line charts.
 */
function createStandardOptions(config) {
  const { indexAxis = "x", isStacked = false, chartType = "bar" } = config;
  const commonTextColor = getTextColor();

  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: indexAxis,
    plugins: {
      legend: { labels: { color: commonTextColor } },
      datalabels: {
        color: (context) => {
          // Logic for line chart points vs bar backgrounds
          const dataset = context.dataset;
          if (chartType === "line") {
            const color = dataset.pointBorderColor || dataset.borderColor;
            return getBorderColor(
              Array.isArray(color)
                ? color[context.dataIndex]
                : color || commonTextColor,
            );
          }
          const color = Array.isArray(dataset.backgroundColor)
            ? dataset.backgroundColor[context.dataIndex]
            : dataset.backgroundColor;
          return getBorderColor(color || commonTextColor);
        },
        anchor: "end",
        align: (context) => {
          const cType = context.chart.config.type;
          const iAxis = context.chart.options.indexAxis;
          if (cType === "line") {
            return "end";
          }
          return iAxis === "y" ? "right" : "top";
        },
        offset: 4,
        font: { weight: "bold" },
        formatter: (value) => (value > 0 ? value.toLocaleString() : ""),
      },
    },
    scales: {
      x: {
        stacked: isStacked,
        beginAtZero: chartType === "bar",
        ticks: { color: commonTextColor },
      },
      y: {
        stacked: isStacked,
        beginAtZero: true,
        ticks: {
          autoSkip: indexAxis !== "y",
          color: commonTextColor,
        },
      },
    },
  };
}

/**
 * Generates specific options for the Tech/Role Bubble Matrix.
 */
function createBubbleOptions(labels, yLabels) {
  const commonTextColor = getTextColor();

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      datalabels: { display: false },
      tooltip: {
        displayColors: true,
        callbacks: {
          title: () => null,
          label: (context) => {
            const raw = context.raw;
            return `${raw._roleName} — ${raw._techName}: ${raw._rawCount} Jobs`;
          },
        },
      },
    },
    scales: {
      x: {
        type: "category",
        labels: labels,
        offset: true,
        position: "bottom",
        ticks: { color: commonTextColor },
        grid: { display: false },
      },
      xTop: {
        type: "category",
        labels: labels,
        offset: true,
        position: "top",
        ticks: { color: commonTextColor },
        grid: { display: false },
      },
      y: {
        type: "category",
        labels: yLabels,
        offset: true,
        ticks: { color: commonTextColor },
        grid: { color: "#44444422", tickLength: 0 },
      },
    },
    layout: { padding: 10 },
  };
}

// ==========================================
// 3. DATA PREPARATION (TRANSFORMERS)
// ==========================================

function prepareSimpleHorizontalChart(key, dataSet) {
  const labels = dataSet.map((item) => item.label);
  const counts = dataSet.map((item) => item.count);

  const descMap = {
    byCompany: `Top ${dataSet.length} companies with the highest recent job posts.`,
    byLocation: `Distribution of recent job posts across various locations.`,
  };

  const backgroundColors = counts.map(
    (_, i) => GEN_COLORS[i % GEN_COLORS.length].bg,
  );

  const data = {
    labels,
    datasets: [
      {
        label: "Total Jobs",
        data: counts,
        backgroundColor: backgroundColors,
        borderColor: backgroundColors.map(getBorderColor),
        borderWidth: 1,
      },
    ],
  };

  const height = dataSet.length * 40 + 100;

  return {
    type: "bar",
    data: data,
    options: createStandardOptions({ indexAxis: "y", isStacked: false }),
    height: `${height}px`,
    description: descMap[key] || "",
  };
}

function prepareRoleTypeChart(dataSet) {
  const labels = dataSet.map((item) => item.label);
  const counts = dataSet.map((item) => item.count);

  const backgroundColors = labels.map(
    (label) => (ROLE_COLORS[label] || ROLE_COLORS["Default"]).bg,
  );

  const data = {
    labels,
    datasets: [
      {
        label: "Total Jobs",
        data: counts,
        backgroundColor: backgroundColors,
        borderColor: backgroundColors.map(getBorderColor),
        borderWidth: 1,
      },
    ],
  };

  return {
    type: "bar",
    data: data,
    options: createStandardOptions({ indexAxis: "x", isStacked: false }),
    height: "400px",
    description: "Distribution of recent job posts across different roles.",
  };
}

/**
 * Prepares data and settings for the stacked 'companyVsExperience' chart.
 */
function prepareStackedExperienceChart(dataSet, experienceRanges) {
  // Safety check: Ensure ranges exist, otherwise chart will be empty
  const ranges = experienceRanges || [];

  const labels = dataSet.map((item) => item.company);

  const datasets = ranges.map((rangeLabel, index) => {
    // Safety check: Ensure GEN_COLORS exists and has length
    const colorSet = GEN_COLORS[index % (GEN_COLORS.length || 1)];

    return {
      label: rangeLabel,
      data: dataSet.map((c) => {
        const dist = c.distribution || [];
        const match = dist.find((d) => d.range === rangeLabel);
        return match ? match.count : 0;
      }),
      backgroundColor: colorSet.bg,
      borderColor: getBorderColor(colorSet.bg),
      borderWidth: 1,
    };
  });

  const ITEM_HEIGHT = 40;
  const height = dataSet.length * ITEM_HEIGHT + 100;

  return {
    type: "bar",
    data: { labels, datasets },
    // Ensure indexAxis is 'y' for horizontal bars
    options: createStandardOptions({ indexAxis: "y", isStacked: true }),
    height: `${height}px`,
    description: `Distribution of job experience requirements within the Top ${dataSet.length} companies.`,
  };
}

function prepareDailyJobCountChart(dataSet) {
  const labels = dataSet.map((item) =>
    new Date(item.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  );

  const datasets = [
    {
      label: "Job Posts per day",
      data: dataSet.map((item) => item.count),
      backgroundColor: "rgba(54, 162, 235, 0.5)",
      borderColor: "rgb(54, 162, 235)",
      borderWidth: 2,
      pointRadius: 5,
      fill: true,
      tension: 0.2,
    },
  ];

  return {
    type: "line",
    data: { labels, datasets },
    options: createStandardOptions({
      indexAxis: "x",
      isStacked: false,
      chartType: "line",
    }),
    height: "400px",
    description: "Daily trend of new job postings that were detected.",
  };
}

function prepareTechRoleBubbleChart(roleDataMap) {
  const MIN_JOB_THRESHOLD = 100;

  // Define visual constants
  const ROW_HEIGHT = 50;
  const MAX_RADIUS = ROW_HEIGHT / 2.2;

  // 1) Sort roles by TOTAL JOBS (descending) and apply threshold
  const sortedRoles = Object.keys(roleDataMap)
    .filter((role) => roleDataMap[role].totalJobs >= MIN_JOB_THRESHOLD)
    .sort((a, b) => roleDataMap[b].totalJobs - roleDataMap[a].totalJobs);

  // If no roles pass the threshold, return an empty chart configuration
  if (sortedRoles.length === 0) {
    return {
      type: "bubble",
      data: { datasets: [] },
      height: "0px",
      description: "No roles met the minimum job count threshold.",
    };
  }

  // 2) Identify Relevant Techs (Y-Axis)
  // We still need a global list of techs to determine the Y-Axis rows
  const relevantTechs = new Set();
  const techWeightedScore = {};

  sortedRoles.forEach((role) => {
    const { techs, totalJobs } = roleDataMap[role];
    // Take top 30 from each role to ensure coverage
    techs
      .sort((a, b) => b.count / totalJobs - a.count / totalJobs)
      .slice(0, 30)
      .forEach((t) => {
        relevantTechs.add(t.label);
        techWeightedScore[t.label] =
          (techWeightedScore[t.label] || 0) + (t.count / totalJobs) * 100;
      });
  });

  const yAxisLabels = Array.from(relevantTechs).sort(
    (a, b) => techWeightedScore[b] - techWeightedScore[a],
  );

  // 3) Build Bubble Points with LOCAL SCALING
  const allPoints = [];
  const pointBg = [];
  const pointBorder = [];

  sortedRoles.forEach((role, rIndex) => {
    // Determine color based on role index
    const colorSet = GEN_COLORS[rIndex % GEN_COLORS.length];

    // Get the specific data for THIS role
    const { techs, totalJobs } = roleDataMap[role];

    // Filter only techs that are on our Y-Axis
    const activeTechs = techs.filter((t) => relevantTechs.has(t.label));

    // --- STEP 3a: Find Local Maximum for THIS specific Role ---
    let localMaxPercentage = 0;
    activeTechs.forEach((t) => {
      const pct = (t.count / totalJobs) * 100;
      if (pct > localMaxPercentage) {
        localMaxPercentage = pct;
      }
    });

    // Guard against divide by zero if a role has no matching techs
    if (localMaxPercentage === 0) {
      localMaxPercentage = 1;
    }

    // --- STEP 3b: Calculate Radius relative to Local Max ---
    activeTechs.forEach((t) => {
      const percentage = (t.count / totalJobs) * 100;

      // SCALING LOGIC:
      // If Selenium is 40% (the max for QA), it gets scaled to 100% of MAX_RADIUS.
      // If React is 90% (the max for Dev), it ALSO gets scaled to 100% of MAX_RADIUS.
      let r_val = (percentage / localMaxPercentage) * MAX_RADIUS;

      // Minimum visibility floor (e.g., 3px)
      r_val = Math.max(3, r_val);

      allPoints.push({
        x: role,
        y: t.label,
        r: r_val,
        // Metadata for tooltips
        _rawCount: t.count,
        _roleTotal: totalJobs,
        _percentage: percentage.toFixed(1),
        _localMax: localMaxPercentage.toFixed(1),
        _roleName: role,
        _techName: t.label,
      });
      pointBg.push(colorSet.bg);
      pointBorder.push(getBorderColor(colorSet.bg));
    });
  });

  const height = yAxisLabels.length * ROW_HEIGHT + 80;

  return {
    type: "bubble",
    data: {
      labels: sortedRoles,
      datasets: [
        {
          label: "Relative Tech Dominance", // Changed label to reflect logic
          data: allPoints,
          backgroundColor: pointBg,
          borderColor: pointBorder,
          borderWidth: 1,
        },
      ],
    },
    options: createBubbleOptions(sortedRoles, yAxisLabels),
    height: `${height}px`,
    description:
      "Tech Stack Clusters: Bubble size is normalized per role (largest bubble in each column represents the most popular tech for that role).",
  };
}

// ==========================================
// 4. MAIN RENDERING LOGIC
// ==========================================

function drawChart(key) {
  // Guard against empty or null keys
  if (!key) {
    console.warn("drawChart called without a valid key.");
    return;
  }

  // Validate Data
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

  let chartConfig;

  // Delegate to specific preparer
  switch (key) {
    case "byCompany":
    case "byLocation":
      chartConfig = prepareSimpleHorizontalChart(key, dataSet);
      break;
    case "byRoleType":
      chartConfig = prepareRoleTypeChart(dataSet);
      break;
    case "companyVsExperience":
      chartConfig = prepareStackedExperienceChart(
        dataSet,
        globalChartData.experienceRanges,
      );
      break;
    case "dailyJobCounts":
      chartConfig = prepareDailyJobCountChart(dataSet);
      break;
    case "techVsRole":
      chartConfig = prepareTechRoleBubbleChart(dataSet);
      break;
    default:
      console.error(`Unknown chart key: ${key}`);
      return;
  }

  // Apply Config
  descriptionElement.textContent = chartConfig.description;
  canvasElement.style.height = chartConfig.height;
  canvasElement.style.width = "100%";

  // Render
  currentChartInstance = new Chart(ctx, {
    plugins: [ChartDataLabels],
    type: chartConfig.type,
    data: chartConfig.data,
    options: chartConfig.options,
  });
}

// ==========================================
// 5. VIEW CONTROLLER
// ==========================================

async function renderCharts() {
  const elements = {
    toggleBtn: document.getElementById("toggleView"),
    tableView: document.querySelector(".table-container"),
    tableWrap: document.getElementById("jobTable_wrapper"),
    chartView: document.getElementById("chart-view"),
    filters: document.getElementById("filters"),
    selector: document.getElementById("chartSelector"),
    closeBtn: document.getElementById("closeChartView"),
  };

  // Selector Change
  elements.selector.addEventListener("change", (e) => {
    if (chartLoadStatus === "loaded") {
      drawChart(e.target.value);
    }
  });

  // Toggle Logic
  async function toggleView(switchToCharts) {
    if (switchToCharts) {
      elements.tableView.style.display = "none";
      elements.tableWrap.style.display = "none";
      elements.filters.style.display = "none";
      elements.chartView.style.display = "block";
      elements.toggleBtn.textContent = "Display Job Listings";

      if (chartLoadStatus === "unloaded") {
        await loadChartData();
      }
      if (chartLoadStatus === "loaded") {
        const selectedKey = elements.selector.value || "byRoleType";
        // Update the dropdown UI to match the default
        if (!elements.selector.value) {
          elements.selector.value = selectedKey;
        }
        drawChart(selectedKey);
      }
    } else {
      // --- Switching back to Table View ---
      elements.tableView.style.display = "block";
      elements.tableWrap.style.display = "block";
      elements.filters.style.display = "flex";
      elements.chartView.style.display = "none";
      elements.toggleBtn.textContent = "Display Charts";
      destroyCurrentChart();
    }
  }

  // Event Listeners
  elements.toggleBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const isTableActive = elements.tableView.style.display !== "none";
    window.location.hash = isTableActive ? "charts" : "";
  });

  if (elements.closeBtn) {
    elements.closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.hash = "";
    });
  }
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

/** Handle the click events to show and hide the modal */
function setupDisclaimer() {
  const openModalBtn = document.getElementById("openDisclaimerModal");
  const modal = document.getElementById("disclaimerModal");
  const closeModalBtn = modal.querySelector(".modal-close-btn");
  const modalBackdrop = modal.querySelector(".modal-backdrop");

  // Function to open the modal
  const openModal = (event) => {
    event.preventDefault();
    // Use class to enable CSS transition (opacity/transform)
    modal.classList.add("show");
    // Ensure screen readers know the main content is inactive
    document.body.style.overflow = "hidden";
  };

  // Function to close the modal
  const closeModal = () => {
    // Remove class to trigger CSS transition
    modal.classList.remove("show");
    document.body.style.overflow = "";
  };

  // 1. Open the modal when the footer link is clicked
  if (openModalBtn) {
    openModalBtn.addEventListener("click", openModal);
  }

  // 2. Close the modal when the 'X' button is clicked
  if (closeModalBtn) {
    // Use an event listener on the parent modal element to ensure closure
    closeModalBtn.addEventListener("click", closeModal);
  }

  // 3. Close the modal when the backdrop is clicked
  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", closeModal);
  }

  // 4. Close the modal when the ESC key is pressed
  document.addEventListener("keydown", (event) => {
    // Check if the modal has the 'show' class
    if (event.key === "Escape" && modal.classList.contains("show")) {
      closeModal();
    }
  });
}

/**
 * Limits the Tippy popover's height to not exceed the height
 * * @param {object} instance - The Tippy instance object provided by the onShow hook.
 */
function limitTippyHeight(instance) {
  // Get Elements and Dimensions
  const popper = instance.popper;
  const tippyBox = popper.querySelector(".tippy-box");
  const tippyContent = popper.querySelector(".tippy-content");

  if (!tippyBox || !tippyContent) {
    console.warn("Tippy box element not found.");
    return;
  }

  // Get the position of the cell being hovered
  const rect = instance.reference.getBoundingClientRect();

  // Use the actual browser window height as the ultimate boundary
  const viewportHeight = window.innerHeight;
  const padding = 20; // Safety gap from screen edges
  let maxHeight = 0;

  // Determine current placement
  const placement = instance.props.placement || "bottom";

  if (placement.startsWith("bottom")) {
    // If showing below: Screen Bottom - Cell Bottom
    maxHeight = viewportHeight - rect.bottom - padding;
  } else {
    // If showing above: Cell Top - Screen Top
    maxHeight = rect.top - padding;
  }

  // Ensure a minimum height so it's not tiny
  const safeMax = Math.max(maxHeight, 100);

  // Apply styles directly to the box and content
  tippyBox.style.maxHeight = `${safeMax}px`;
  tippyBox.style.display = "flex";
  tippyBox.style.flexDirection = "column";

  tippyContent.style.overflowY = "auto";
  tippyContent.style.maxHeight = "100%";
}

function stickyTableHeader() {
  // Target the THs directly
  const headers = dataTable.querySelectorAll("th");

  window.addEventListener("scroll", function () {
    const tableRect = dataTable.getBoundingClientRect();
    const headerHeight = headers[0].offsetHeight;

    // Calculate how far the table top is from the top of the viewport
    // If negative, it means we have scrolled past the top of the table
    let offset = 0;

    if (tableRect.top < 0) {
      // We are scrolling inside the table.
      // The offset is the positive version of tableRect.top
      offset = Math.abs(tableRect.top);

      // Keep header inside table bounds
      const maxOffset = dataTable.offsetHeight - headerHeight;
      if (offset > maxOffset) {
        offset = maxOffset;
      }
    }

    // Apply the 'push' to keep headers visible
    // Using requestAnimationFrame for better performance
    requestAnimationFrame(() => {
      headers.forEach((th) => {
        th.style.transform = `translateY(${offset}px)`;
      });
    });
  });
}

/**
 * Initializes Tippy on all currently visible job title cells.
 */
function initializeTippyOnVisibleRows() {
  // detect current theme
  const isDarkMode =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  // detects touch devices
  const isMobile =
    window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  // Calculate maxWidth based on viewport size
  const viewportWidth = window.innerWidth;
  const maxWidth = viewportWidth < 768 ? 250 : viewportWidth < 1200 ? 500 : 900;

  // Use the DataTable API selector for efficiency, targeting only *visible* rows
  document.querySelectorAll("#jobTable tbody tr").forEach((row) => {
    // Job Title cell (assuming it's the first <td>)
    const td = row.querySelector("td:first-child");
    const description =
      td.querySelector("a")?.getAttribute("data-description") || "";

    // **CHECK**: If the element already has a tippy instance, skip it.
    // This prevents re-initialization on subsequent draws.
    if (td._tippy || !description) {
      return;
    }

    tippy(td, {
      content: description,
      allowHTML: true,
      interactive: true,
      theme: isDarkMode ? "material" : "light-border",
      maxWidth: maxWidth,
      placement: "bottom",
      trigger: isMobile ? "click" : "mouseenter",
      hideOnClick: true,
      flip: true,
      boundary: "viewport",
      flipBehavior: ["bottom", "top"],
      // Keep Tippy inside the body
      appendTo: () => document.body,
      // Pass the necessary variables to the onMount
      onMount: (i) => limitTippyHeight(i),
    });
  });
}

async function main() {
  requestNotificationPermission();
  // Get the IANA Timezone Name
  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  console.log("Local Timezone:", localTimeZone);

  // Initialize Jobs table
  initializeJobsTable();
  stickyTableHeader();

  // Initialize Select2 on the dropdowns
  setupSelectDropdowns();
  setupDisclaimer();

  // --- Load Data using Fetch API ---
  async function loadJobs() {
    const url = `jobs.json?nocache=${Date.now()}`;

    try {
      closeErrorToast();

      // Only send the file if the hash is different
      const headers = new Headers();
      if (lastETag) {
        headers.append("If-None-Match", lastETag);
      }

      const headResponse = await fetch(url, {
        method: "HEAD",
        headers: headers,
        cache: "no-store",
      });

      // Handle 304 Not Modified
      if (headResponse.status === 304) {
        console.log("Content identical via ETag hash. No changes");
        closeErrorToast();
        return;
      }

      // Update the stored ETag for the next loop
      lastETag = headResponse.headers.get("ETag");

      // Preserve Current Filters BEFORE fetching/populating
      // We only read from the DOM if the initial load is complete
      let currentCompanyFilters = [];
      let currentLocationFilters = [];
      let currentExperienceFilter = [];

      if (initialLoadComplete) {
        currentCompanyFilters = $("#companyFilter").val() || [];
        currentLocationFilters = $("#locationFilter").val() || [];
        currentExperienceFilter = $("#experienceFilter").val() || "";
      }

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
      // PASS the preserved filter selections to populateTable
      populateTable(
        allJobs,
        currentCompanyFilters,
        currentLocationFilters,
        currentExperienceFilter,
      );

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
  function populateTable(
    jobs,
    selectedCompanies = [],
    selectedLocations = [],
    selectedExperience = "",
  ) {
    // Clear the existing data
    jobsTable.clear();
    let props = 'target="_blank" rel="noopener noreferrer"';

    // Prepare data for DataTables. It expects an array of arrays.

    const dataToLoad = jobs.map((job) => {
      let descriptionAttr = "";
      if (job.description) {
        const descriptionTxt = job.description
          .replace(/"/g, "&quot;")
          .replace(/(\r\n|\r|\n)+/g, "\n")
          .replace(/\n/g, "<br>"); // Use <br> for better formatting
        descriptionAttr = `data-description="${descriptionTxt}"`;
      }

      let roleType = job.classification.roleType;
      let roleTypeLink = `<a href="#" class="search-role-type">#${roleType}</a>`;
      let jobTitleLink = `<a href="${job.url}" title="${job.title}" ${props} class="job-title-link" ${descriptionAttr}>${job.title}</a>`;
      let websiteLink = job.companyWebsite;
      let companyLink = "";
      if (websiteLink && websiteLink !== "-") {
        companyLink = `<a href="${websiteLink}" title="${job.company}" ${props} class="job-title-link">${job.company}</a>`;
      } else {
        companyLink = `<span title="${job.company}">${job.company}</span>`;
      }
      let location = job.location
        ? `<span title="${job.location}">${job.location}</span>`
        : "—";
      let datePosted = job.datePosted
        ? `<span title="${job.datePosted}">${job.datePosted}</span>`
        : "—";
      let employeeCount = job.employeeCount
        ? `<span data-order="${job.employeeRank}">${job.employeeCount}</span>`
        : "—";

      return [
        jobTitleLink,
        companyLink,
        location,
        roleType === "—" ? roleType : roleTypeLink,
        job.yoe,
        employeeCount,
        datePosted,
      ];
    });

    // Add the new data and redraw the table
    jobsTable.rows.add(dataToLoad).draw();

    // Populate filters based on ALL jobs ---
    // Extract unique company and location names
    const companies = [...new Set(jobs.map((j) => j.company))].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    );
    const locations = [...new Set(jobs.map((j) => j.normalizedLocation))].sort(
      (a, b) => a.toLowerCase().localeCompare(b.toLowerCase()),
    );

    // Extract unique experience years
    const experienceSet = new Set();
    jobs.forEach((job) => {
      const exp = parseMinExperience(job.yoe);
      if (exp !== null) {
        experienceSet.add(exp);
      }
    });
    const sortedExp = Array.from(experienceSet).sort((a, b) => a - b);

    // Populate filters with ALL options and USE the saved selections
    populateFilter("#companyFilter", companies, selectedCompanies);
    populateFilter("#locationFilter", locations, selectedLocations);
    populateFilter("#experienceFilter", sortedExp, selectedExperience);
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
        new Option(val, val, false, selectedArr.includes(String(val))),
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
    // Note: selectedExperience is a single string/value, not an array
    const selectedExperience = $("#experienceFilter").val();

    // IF no custom filters are active, narrow the dropdown options based on the global search results.
    // Get the indices of the rows that match the current global search (across all pages)
    const filteredRowIndices = jobsTable
      .rows({ search: "applied", page: "all" })
      .indexes()
      .toArray(); // Convert to a standard JS array

    // Map these indices back to the original 'allJobs' array to get the job objects
    const searchedJobs = filteredRowIndices.map((index) => allJobs[index]);

    // Define the filtering function for a job
    const passesAllOtherFilters = (job, excludeDropdown) => {
      const company = job.company;
      const location = job.normalizedLocation;
      const jobExp = parseMinExperience(job.yoe);
      const selectedExpInt = parseInt(selectedExperience, 10);

      // Check Company match (only if we're NOT excluding the company filter)
      const companyMatch =
        excludeDropdown === "company" ||
        selectedCompanies.length === 0 ||
        selectedCompanies.includes(company);

      // Check Location match (only if we're NOT excluding the location filter)
      const locationMatch =
        excludeDropdown === "location" ||
        selectedLocations.length === 0 ||
        selectedLocations.includes(location);

      // Check Experience match (only if we're NOT excluding the experience filter)
      const experienceMatch =
        excludeDropdown === "experience" ||
        isNaN(selectedExpInt) ||
        (jobExp !== null && jobExp >= selectedExpInt);

      return companyMatch && locationMatch && experienceMatch;
    };

    // --- Update Company Dropdown ---
    // Only consider jobs that pass the Location and YoE filters (and global search)
    const companyJobs = searchedJobs.filter((j) =>
      passesAllOtherFilters(j, "company"),
    );
    const companies = Array.from(
      new Set(companyJobs.map((j) => j.company)),
    ).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    // Crucially, we only update the options if there is no selection in the filter itself
    // to preserve all options for multi-select after a user starts filtering.
    if (selectedCompanies.length === 0) {
      populateFilter("#companyFilter", companies, selectedCompanies);
    } else {
      // If a filter is selected, ensure the full set of options is restored
      // based on the initial load, so the user can select more.
      // This is complex, so for simplicity and to honor the multi-select requirement,
      // we'll rely on the initial load to provide the full list.
      // A simple compromise: just check if the current selection exists in the new list.
      // In this complex scenario, the best multi-select fix is to only narrow
      // options if the filter is completely empty.
      // Since we're here, we only ensure the selected items remain available.
      // If we want a full set always when selected, we rely on the initial load.
      // We'll proceed with conditional narrowing only if no selection is made.
    }

    // --- Update Location Dropdown ---
    // Only consider jobs that pass the Company and YoE filters (and global search)
    const locationJobs = searchedJobs.filter((j) =>
      passesAllOtherFilters(j, "location"),
    );
    const locations = Array.from(
      new Set(locationJobs.map((j) => j.normalizedLocation)),
    ).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    if (selectedLocations.length === 0) {
      populateFilter("#locationFilter", locations, selectedLocations);
    }

    // --- Update Experience Dropdown ---
    // Only consider jobs that pass the Company and Location filters (and global search)
    const experienceJobs = searchedJobs.filter((j) =>
      passesAllOtherFilters(j, "experience"),
    );
    const experienceSet = new Set();
    experienceJobs.forEach((job) => {
      const exp = parseMinExperience(job.yoe);
      if (exp !== null) {
        experienceSet.add(exp);
      }
    });
    const sortedExp = Array.from(experienceSet).sort((a, b) => a - b);

    // Note: Experience is single-select, so conditional narrowing is less critical
    // but still applied for consistency.
    if (selectedExperience === null || selectedExperience === "") {
      populateFilter(
        "#experienceFilter",
        sortedExp,
        asArray(selectedExperience),
      );
    }

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
      const jobExpRange = parseJobExperienceRange(job.yoe); // null or number

      // Check Experience match (Range Inclusion)
      let experienceMatch = false;
      // Show all jobs if filter is empty/invalid
      if (isNaN(selectedExperience)) {
        experienceMatch = true;
      }
      // Case 2: Filter is selected AND job has an experience range
      else if (jobExpRange !== null) {
        // A job is a match if the selected experience falls anywhere
        // within the job's required experience range.
        experienceMatch =
          selectedExperience >= jobExpRange.min &&
          selectedExperience <= jobExpRange.max;
      }
      // Case 3: Job has no experience data (null) but filter is selected
      else {
        experienceMatch = false;
      }

      // Check Company match
      const companyMatch =
        selectedCompanies.length === 0 || selectedCompanies.includes(company);

      // Check Location match
      const locationMatch =
        selectedLocations.length === 0 || selectedLocations.includes(location);

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

    window.addEventListener("resize", () => {
      const newWidth =
        window.innerWidth < 768 ? 250 : window.innerWidth < 1200 ? 500 : 900;
      document.querySelectorAll(".job-title-link").forEach((el) => {
        if (el._tippy) {
          el._tippy.setProps({ maxWidth: newWidth });
        }
      });
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
  await loadChartData();
  await renderCharts();
  // Setup the simplified history handling (hash listener)
  setupHashListener();

  // Poll every 2 minutes
  setInterval(loadJobs, 2 * 60 * 1000);
}

// Wait for the DOM to be ready before initiating the loading process
document.addEventListener("DOMContentLoaded", () => {
  // Pass your main function to the loader as the callback to run
  if (window.startAfterResources) {
    window.startAfterResources(main);
  } else {
    console.error("resourceLoader.js script failed to load or execute.");
  }
});
