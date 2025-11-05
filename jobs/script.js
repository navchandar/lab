import { CITY_ALIAS } from "./constants.js";

// Global variable to hold all jobs
let allJobs = [];
let lastModified = null;
let initialLoadComplete = false;
let notificationPermission = "default";
let lastNotification = null;
// Unique tag to group/manage notifications
const NOTIFICATION_TAG = "job-update-notification";

const lastMod = document.getElementById("last-refresh");

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
function updateRefreshTimeDisplay(gmtDateString) {
  if (!lastMod || !gmtDateString) {
    return;
  }
  // convert the GMT date string to relative time
  const relativeTime = getRelativeTimeDisplay(gmtDateString);
  if (relativeTime) {
    lastMod.textContent = `Last updated: ${relativeTime}`;
  }
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
  if (!expStr || expStr === "—") {
    return null;
  }
  const match = expStr.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
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
  // Update message and show toast
  toast.classList.remove("show");
  message.textContent = `${message_text}`;
  console.log(message_text);
  toast.classList.add("show");

  // Manual close
  closeBtn.onclick = () => {
    toast.classList.remove("show");
  };
}

function closeErrorToast() {
  const toast = document.getElementById("ip-toast");
  const toast_message = toast.querySelector("#ip-toast-message").textContent;
  if (
    toast &&
    toast.classList.contains("show") &&
    toast_message.includes("Error")
  ) {
    toast.classList.remove("show");
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
  const dataTable = document.getElementById("jobTable");
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

async function main() {
  requestNotificationPermission();

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
      const headResponse = await fetch(url, {
        method: "HEAD",
        cache: "no-store",
      });
      if (!headResponse.ok) {
        throw new Error(`HTTP error! status: ${headResponse.status}`);
      }

      const newModified = headResponse.headers.get("Last-Modified");

      if (lastModified && newModified && newModified === lastModified) {
        console.log("No changes in jobs.json");
        return;
      }

      // Update stored value
      lastModified = newModified;

      // Fetch and update table
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Get the IANA Timezone Name
      const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      console.log("Local Timezone:", localTimeZone);

      const resp = await response.json();
      allJobs = resp.data;

      updateRefreshTimeDisplay(newModified);

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

      // Only send notification on subsequent updates, not the initial page load
      const added = resp.recentlyAddedCount;
      if (initialLoadComplete && added > 0) {
        const relativeTime = getRelativeTimeDisplay(newModified);
        // const displayTime = convertToLocalTime(newModified);
        console.log("Sending notification. Jobs recently added:", added);
        sendJobUpdateNotification(relativeTime || "Just Now", added);
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
      // The order MUST match <thead> columns
      let roleType = job.classification.roleType;
      let roleTypeLink = `<a href="#" class="search-role-type">#${roleType}</a>`;
      return [
        `<a href="${job.url}" ${props}>${job.title}</a>`,
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

    // Get the global search term
    const globalSearchTerm = jobsTable.search().toLowerCase();

    // Filter allJobs by the global search term ONLY
    const globallyFilteredJobs = allJobs.filter((job) => {
      if (!globalSearchTerm) {
        return true;
      }
      // Check all relevant fields for the search term
      return (
        (job.title && job.title.toLowerCase().includes(globalSearchTerm)) ||
        (job.company && job.company.toLowerCase().includes(globalSearchTerm)) ||
        (job.location &&
          job.location.toLowerCase().includes(globalSearchTerm)) ||
        (job.classification.roleType &&
          job.classification.roleType
            .toLowerCase()
            .includes(globalSearchTerm)) ||
        (job.experienceRequired &&
          job.experienceRequired.toLowerCase().includes(globalSearchTerm)) ||
        (job.datePosted &&
          job.datePosted.toLowerCase().includes(globalSearchTerm))
      );
    });

    // --- Now, populate dropdowns based on this globallyFilteredJobs list ---

    // Update Company Dropdown
    const companies = Array.from(
      new Set(globallyFilteredJobs.map((j) => j.company))
    ).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    populateFilter("#companyFilter", companies, selectedCompanies);

    // Update Location Dropdown
    const locations = Array.from(
      new Set(globallyFilteredJobs.map((j) => j.normalizedLocation))
    ).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    populateFilter("#locationFilter", locations, selectedLocations);

    // Update Experience Dropdown
    const experienceSet = new Set();
    globallyFilteredJobs.forEach((job) => {
      const exp = parseMinExperience(job.experienceRequired);
      if (exp !== null) {
        experienceSet.add(exp);
      }
    });
    const sortedExp = Array.from(experienceSet).sort((a, b) => a - b);
    populateFilter("#experienceFilter", sortedExp, asArray(selectedExperience));
  }

  /**
   * REVISED: Clears all filters and search, then redraws and updates dropdowns.
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
   * REVISED: Wires up the new, simplified filter logic.
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

  // Poll every 2 minutes
  setInterval(loadJobs, 2 * 60 * 1000);
}

document.addEventListener("DOMContentLoaded", main);
