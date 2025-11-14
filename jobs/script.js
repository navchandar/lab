import { CITY_ALIAS } from "./constants.js";

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

const dataTableConfig = {
  // Add configurations
  // Sort by the 5th column (Date Posted) descending
  // order: [[4, "desc"]],
  order: [],
  pageLength: 10, // Show 10 rows per page
  lengthChange: true, // Allow user to change page length
  responsive: true, // Make table responsive
  autoWidth: false, // Prevent automatic column width
  language: {
    search: "Search jobs:",
    lengthMenu: "Show _MENU_ job posts per page",
    info: "Showing _START_ to _END_ of _TOTAL_ job posts",
  },
  columnDefs: [
    {
      // 1. Job Title (Index 0)
      targets: [0],
      className: "dt-head-left dt-body-left", // Ensure header and body text align left
      width: "30%",
    },
    {
      // 2. Company Name (Index 1)
      targets: [1],
      className: "dt-head-left dt-body-left",
      width: "13%",
    },
    {
      // 3. Location (Index 2)
      targets: [2],
      className: "dt-head-left dt-body-left",
      width: "20%",
    },
    {
      // 4. Type (Index 3 - QA / DEV / DEVOPS roles)
      targets: [3],
      className: "dt-head-center dt-body-center", // Center align for better visual grouping
      width: "15%",
    },
    {
      // 5. Years of Experience (Index 4)
      targets: [4],
      className: "dt-head-center dt-body-center",
      width: "7%",
    },
    {
      // 6. Date Posted (Index 5)
      targets: [5],
      type: "date", // Explicitly tell DataTables to sort this as a date
      className: "dt-head-right dt-body-right text-nowrap", // Align right and prevent wrapping
      width: "15%",
    },
  ],
};

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

  // --- Step 3: Show Search & Length Menu (Top Row) ---
  // The first DataTables layout row (usually the search box and page length)
  setTimeout(() => {
    if (rows[0]) {
      rows[0].style.display = "flex";
    }
  }, 500 + baseDelay * 2);

  // --- Step 4: Show Pagination & Info (Bottom Row) ---
  // The second DataTables layout row (usually the info and pagination controls)
  setTimeout(() => {
    if (rows[1]) {
      rows[1].style.display = "flex";
    }
    // Ensure ALL rows are visible in case of different DataTables layout configuration
    for (let i = 2; i < rows.length; i++) {
      rows[i].style.display = "flex";
    }
  }, 500 + baseDelay * 3); // 500ms + 450ms
}

// --- Utility: Fetch with Error Handling ---
async function get(url, options = {}) {
  try {
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
function addScrollOnPagination() {
  document.addEventListener("click", function (event) {
    if (event.target.classList.contains("dt-paging-button")) {
      if (dataTable) {
        dataTable.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  });
}

let globalChartData = null;
let chartLoadStatus = "unloaded"; // 'unloaded', 'loading', 'loaded', 'failed'
let currentChartInstance = null; // Store the Chart.js instance

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

// --- 1. General Color Palette (for Company/Location) ---
const COLOR_PALETTE = [
  { bg: "rgba(54, 162, 235, 0.7)" }, // Blue
  { bg: "rgba(255, 99, 132, 0.7)" }, // Red
  { bg: "rgba(75, 192, 192, 0.7)" }, // Green
  { bg: "rgba(153, 102, 255, 0.7)" }, // Purple
  { bg: "rgba(255, 159, 64, 0.7)" }, // Orange
  { bg: "rgba(255, 206, 86, 0.7)" }, // Yellow
  { bg: "rgba(201, 203, 207, 0.7)" }, // Grey
  { bg: "rgba(255, 0, 255, 0.7)" }, // Magenta
  { bg: "rgba(0, 255, 0, 0.7)" }, // Lime Green
  { bg: "rgba(128, 0, 0, 0.7)" }, // Maroon
  { bg: "rgba(0, 128, 128, 0.7)" }, // Teal
  { bg: "rgba(0, 0, 128, 0.7)" }, // Navy Blue
  { bg: "rgba(128, 128, 0, 0.7)" }, // Olive
  { bg: "rgba(128, 0, 128, 0.7)" }, // Plum/Dark Magenta
  { bg: "rgba(255, 105, 180, 0.7)" }, // Hot Pink
  { bg: "rgba(255, 215, 0, 0.7)" }, // Gold
  { bg: "rgba(173, 216, 230, 0.7)" }, // Light Blue
  { bg: "rgba(240, 128, 128, 0.7)" }, // Light Coral
  { bg: "rgba(144, 238, 144, 0.7)" }, // Light Green
  { bg: "rgba(238, 130, 238, 0.7)" }, // Violet
  { bg: "rgba(112, 128, 144, 0.7)" }, // Slate Grey
  { bg: "rgba(189, 183, 107, 0.7)" }, // Dark Khaki
  { bg: "rgba(255, 182, 193, 0.7)" }, // Light Pink
  { bg: "rgba(255, 228, 181, 0.7)" }, // Moccasin
  { bg: "rgba(100, 149, 237, 0.7)" }, // Cornflower Blue
  { bg: "rgba(255, 99, 71, 0.7)" }, // Tomato
  { bg: "rgba(60, 179, 113, 0.7)" }, // Medium Sea Green
  { bg: "rgba(72, 61, 139, 0.7)" }, // Dark Slate Blue
];

// --- 2. Semantic Role Type Colors (for byRoleType) ---
const ROLE_TYPE_COLORS = {
  SoftwareDEV: { bg: "rgba(54, 162, 235, 0.7)" }, // Blue
  SoftwareQA: { bg: "rgba(75, 192, 192, 0.7)" }, // Green
  Management: { bg: "rgba(255, 99, 132, 0.7)" }, // Red
  "ML/AI": { bg: "rgba(153, 102, 255, 0.7)" }, // Purple
  "DevOps/SRE": { bg: "rgba(255, 159, 64, 0.7)" }, // Orange
  DataEngg: { bg: "rgba(255, 206, 86, 0.7)" }, // Yellow
  HardwareQA: { bg: "rgba(0, 128, 128, 0.7)" }, // Teal
  PharmaQA: { bg: "rgba(60, 179, 113, 0.7)" }, // Medium Sea Green
  Security: { bg: "rgba(128, 0, 0, 0.7)" }, // Maroon
  RPA: { bg: "rgba(100, 149, 237, 0.7)" }, // Cornflower Blue
  DBA: { bg: "rgba(100, 136, 172, 0.7)" }, // Slate Grey
  Default: { bg: "rgba(201, 203, 207, 0.7)" }, // Grey (kept as default)
};

// --- CHART RENDERING LOGIC ---
/**
 * Renders the chart based on the selected analysis key.
 * @param {string} key - The data key to use (e.g., 'byRoleType').
 */
function drawChart(key) {
  if (!globalChartData || !globalChartData[key]) {
    console.error(`Data for key "${key}" not found.`);
    destroyCurrentChart();
    return;
  }

  const dataSet = globalChartData[key];
  const labels = dataSet.map((item) => item.label);
  const counts = dataSet.map((item) => item.count);

  destroyCurrentChart();

  const canvasElement = document.getElementById("roleChart");
  const ctx = canvasElement.getContext("2d");
  const descriptionElement = document.getElementById("chartDescription");
  let descriptionText = "";
  // Set a dynamic title/description
  if (key === "byCompany") {
    descriptionText = `Top ${dataSet.length} companies with the highest recent job posts.`;
  } else if (key === "byRoleType") {
    descriptionText = `Distribution of recent job posts across different roles.`;
  } else if (key === "byLocation") {
    descriptionText = `Distribution of recent job posts across various locations.`;
  }
  descriptionElement.textContent = descriptionText;

  // --- DYNAMIC COLOR GENERATION ---
  let backgroundColors = [];

  if (key === "byRoleType") {
    // Use semantic colors for role types
    backgroundColors = labels.map(
      (label) => (ROLE_TYPE_COLORS[label] || ROLE_TYPE_COLORS["Default"]).bg
    );
  } else {
    // Use the cycling palette for Company and Location
    backgroundColors = counts.map(
      (_, index) => COLOR_PALETTE[index % COLOR_PALETTE.length].bg
    );
  }
  // Calculate the border colors from the generated background colors
  const borderColors = backgroundColors.map(getBorderColor);

  // --- DYNAMIC HEIGHT CALCULATION ---
  if (key !== "byRoleType") {
    // For horizontal charts (Company/Location), set dynamic height
    // Use approx 40px per item to ensure clear label spacing
    const ITEM_HEIGHT = 40;
    // Add extra padding for chart title, legend, and axis labels (e.g., 100px)
    const requiredHeight = dataSet.length * ITEM_HEIGHT + 100;

    // Apply the calculated height to the canvas style
    canvasElement.style.height = `${requiredHeight}px`;
    canvasElement.style.width = "100%"; // Maintain full width
  } else {
    // For vertical charts, set a fixed default height
    // This assumes the default size is sufficient for few vertical bars
    canvasElement.style.height = "400px";
    canvasElement.style.width = "100%";
  }

  currentChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Total Jobs",
          data: counts,
          backgroundColor: backgroundColors,
          borderColor: borderColors,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      // Set specific options (e.g., horizontal bars for many locations/companies)
      indexAxis: key !== "byRoleType" ? "y" : "x", // Use horizontal bars for Company/Location
      scales: {
        // X-Axis Configuration
        x: {
          // Set beginAtZero only for the VALUE axis.
          // If indexAxis is 'y' (horizontal bars), x is the value axis.
          beginAtZero: key !== "byRoleType",
          // If indexAxis is 'x' (vertical bars), x is the CATEGORY axis.
          ticks: {
            autoSkip: key === "byRoleType" ? false : true,
          },
        },

        // Y-Axis Configuration
        y: {
          // Set beginAtZero only for the VALUE axis.
          // If indexAxis is 'x' (vertical bars), y is the value axis.
          beginAtZero: key === "byRoleType",
          // If indexAxis is 'y' (horizontal bars), y is the CATEGORY axis.
          ticks: {
            // Force display of all labels on the category axis
            autoSkip: key !== "byRoleType" ? false : true,
          },
        },
      },
    },
  });
}

async function renderCharts() {
  const toggleButton = document.getElementById("toggleView");
  const tableView = document.querySelector(".table-container");
  const chartView = document.getElementById("chart-view");
  const filters = document.getElementById("filters");
  const chartSelector = document.getElementById("chartSelector");

  // Add event listener for chart selection change
  chartSelector.addEventListener("change", (e) => {
    if (chartLoadStatus === "loaded") {
      drawChart(e.target.value);
    }
  });

  // Function to toggle between table and chart views
  toggleButton.addEventListener("click", async (e) => {
    e.preventDefault();
    const isTableViewActive =
      tableView.style.display !== "none" || dataTable.style.display !== "none";

    if (isTableViewActive) {
      // --- Switching to Chart View ---
      tableView.style.display = "none";
      dataTable.style.display = "none";
      filters.style.display = "none";
      chartView.style.display = "block";
      toggleButton.textContent = "Display Job Listings";

      // 1. Load data only if it hasn't been loaded successfully
      if (chartLoadStatus === "unloaded") {
        await loadChartData();
      }

      // 2. Draw the chart using the currently selected dropdown option
      if (chartLoadStatus === "loaded") {
        drawChart(chartSelector.value);
      }
    } else {
      // --- Switching back to Table View ---
      tableView.style.display = "block";
      dataTable.style.display = "table";
      filters.style.display = "flex";
      chartView.style.display = "none";
      toggleButton.textContent = "Display Charts";

      // Destroy chart instance to free up resources
      destroyCurrentChart();
    }
  });
}

async function main() {
  requestNotificationPermission();
  // Get the IANA Timezone Name
  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  console.log("Local Timezone:", localTimeZone);

  // --- Initialize an empty DataTable ---
  // We initialize it once with configuration, then add data later
  const jobsTable = jQuery("#jobTable").DataTable(dataTableConfig);

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
      const response = await get(url, { cache: "no-store" });
      const resp = await response.json();

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
        addScrollOnPagination();
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
        initialLoadComplete = true;
      }

      hideSpinner();
    } catch (error) {
      hideSpinner();
      if (error instanceof TypeError) {
        console.error("Network Error: Could not reach the server", error);
        showToast(`Network Error: Could not reach the server`);
      } else {
        console.error("Error: Failed to fetch jobs data:", error);
        showToast(`Error: Failed to fetch jobs data:\n${error.message}`);
      }
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

    // When reset is clicked, clear all filters and redraw
    $("#resetFilters").on("click", resetAllFilters);

    $("#jobTable").on("click", ".search-role-type", function (e) {
      e.preventDefault();
      // Get the text content of the link (e.g., "#SoftwareQA")
      let searchText = $(this).text();
      // Apply the search to DataTables
      jobsTable.search(searchText).draw();
      $("#dt-search-0").val(searchText);
    });

    window.addEventListener("online", loadJobs);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        console.log("Tab is active");
        loadJobs();
      }
    });
  }

  // Run once immediately to load jobs
  await loadJobs();

  await renderCharts();
  // Poll every 2 minutes
  setInterval(loadJobs, 2 * 60 * 1000);
}

document.addEventListener("DOMContentLoaded", main);
