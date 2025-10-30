// Global variable to hold all jobs
let allJobs = [];
let lastModified = null;
let initialLoadComplete = false;
let notificationPermission = "default";
let lastNotification = null;
// Unique tag to group/manage notifications
const NOTIFICATION_TAG = "job-update-notification";

const lastMod = document.getElementById("last-refresh");

const cityAliases = {
  bengaluru: [
    "bangalore",
    "bangalore urban",
    "bengaluru, karnataka",
    "bangalore, karnataka",
    "bengaluru, karnataka, india",
    "bangalore, karnataka, india",
    "bengaluru, india",
    "bangalore, india",
    "greater bangalore area",
    "bengaluru area",
    "bangalore area",
    "bengaluru metropolitan region",
    "bangalore metropolitan region",
    "bengaluru east",
    "electronic city",
    "whitefield",
  ],
  mumbai: [
    "bombay",
    "mumbai, maharashtra",
    "bombay, maharashtra",
    "mumbai, maharashtra, india",
    "bombay, maharashtra, india",
    "mumbai, india",
    "bombay, india",
    "greater mumbai area",
    "mumbai area",
    "mumbai metropolitan region",
    "mmr",
    "navi mumbai",
    "thane",
  ],
  delhi: [
    "new delhi",
    "delhi ncr",
    "delhi-ncr",
    "ncr",
    "national capital region",
    "national capital region (ncr)",
    "delhi, delhi",
    "new delhi, delhi",
    "delhi, india",
    "new delhi, india",
    "greater delhi area",
    "delhi area",
    "delhi metropolitan area",
  ],
  gurgaon: [
    "gurugram",
    "gurgaon, haryana",
    "gurugram, haryana",
    "gurgaon, haryana, india",
    "gurugram, haryana, india",
    "gurgaon, india",
    "gurugram, india",
    "gurgaon area",
    "gurugram area",
    "gurgaon ncr",
    "gurugram ncr",
  ],
  noida: [
    "noida, uttar pradesh",
    "noida, uttar pradesh, india",
    "noida, u.p.",
    "noida, up",
    "noida, india",
    "greater noida",
    "greater noida, uttar pradesh",
    "noida extension",
    "noida area",
    "noida ncr",
  ],
  hyderabad: [
    "hyderabad, telangana",
    "hyderabad, telangana, india",
    "hyderabad, india",
    "greater hyderabad area",
    "hyderabad metropolitan area",
    "hyderabad area",
    "secunderabad",
    "hyderabad/secunderabad",
    "cyberabad",
  ],
  pune: [
    "pune, maharashtra",
    "pune, maharashtra, india",
    "pune, india",
    "greater pune area",
    "pune area",
    "pune metropolitan region",
    "pmr",
    "hinjewadi",
    "pimpri-chinchwad",
  ],
  chennai: [
    "madras",
    "chennai, tamil nadu",
    "madras, tamil nadu",
    "chennai, tamil nadu, india",
    "madras, tamil nadu, india",
    "chennai, india",
    "madras, india",
    "greater chennai area",
    "chennai metropolitan area",
    "chennai area",
  ],
  kolkata: [
    "calcutta",
    "kolkata, west bengal",
    "calcutta, west bengal",
    "kolkata, west bengal, india",
    "calcutta, west bengal, india",
    "kolkata, india",
    "calcutta, india",
    "greater kolkata area",
    "kolkata metropolitan area",
    "kolkata area",
  ],
  ahmedabad: [
    "ahmedabad, gujarat",
    "ahmedabad, gujarat, india",
    "ahmedabad, india",
    "amdavad",
    "greater ahmedabad area",
    "ahmedabad area",
    "gandhinagar",
    "ahmedabad-gandhinagar",
  ],
  chandigarh: [
    "chandigarh, chandigarh",
    "chandigarh, india",
    "chandigarh area",
    "greater chandigarh area",
    "chandigarh tricity",
    "mohali",
    "panchkula",
  ],
  jaipur: [
    "jaipur, rajasthan",
    "jaipur, rajasthan, india",
    "jaipur, india",
    "jaipur area",
    "greater jaipur area",
  ],
  kochi: [
    "cochin",
    "kochi, kerala",
    "cochin, kerala",
    "kochi, kerala, india",
    "cochin, kerala, india",
    "kochi, india",
    "cochin, india",
    "ernakulam",
    "greater kochi area",
    "kochi area",
  ],
  indore: [
    "indore, madhya pradesh",
    "indore, madhya pradesh, india",
    "indore, m.p.",
    "indore, mp",
    "indore, india",
    "indore area",
    "greater indore area",
  ],
  coimbatore: [
    "coimbatore, tamil nadu",
    "coimbatore, tamil nadu, india",
    "coimbatore, india",
    "kovai",
    "coimbatore area",
    "greater coimbatore area",
  ],
  thiruvananthapuram: [
    "trivandrum",
    "thiruvananthapuram, kerala",
    "trivandrum, kerala",
    "thiruvananthapuram, kerala, india",
    "trivandrum, kerala, india",
    "thiruvananthapuram, india",
    "trivandrum, india",
    "tvm",
    "technopark",
  ],
  visakhapatnam: [
    "vizag",
    "visakhapatnam, andhra pradesh",
    "vizag, andhra pradesh",
    "visakhapatnam, andhra pradesh, india",
    "vizag, andhra pradesh, india",
    "visakhapatnam, india",
    "vizag, india",
    "visakhapatnam area",
    "vizag area",
  ],
  bhubaneswar: [
    "bhubaneswar, odisha",
    "bhubaneswar, orissa",
    "bhubaneswar, odisha, india",
    "bhubaneswar, india",
    "bhubaneswar area",
    "cuttack-bhubaneswar",
  ],
  lucknow: [
    "lucknow, uttar pradesh",
    "lucknow, uttar pradesh, india",
    "lucknow, u.p.",
    "lucknow, up",
    "lucknow, india",
    "lucknow area",
  ],
};

function normalizeLocation(location) {
  if (!location) {
    return "";
  }

  const locLower = location.toLowerCase().trim();

  // Normalize known city aliases
  for (const [canonical, aliases] of Object.entries(cityAliases)) {
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
function sendJobUpdateNotification(refreshTime) {
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
  const msg = `New job posts detected: ${refreshTime}.`;
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
      if (initialLoadComplete && resp.recentlyAddedCount > 0) {
        const relativeTime = getRelativeTimeDisplay(newModified);
        // const displayTime = convertToLocalTime(newModified);
        sendJobUpdateNotification(relativeTime || "Just Now");
      } else if (resp.recentlyAddedCount <= 0) {
        console.log(
          "No notification sent. Jobs recently added:",
          resp.recentlyAddedCount
        );
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

    // Extract unique company and location names
    const companies = [...new Set(jobs.map((j) => j.company))].sort();
    const locations = [
      ...new Set(jobs.map((j) => j.normalizedLocation)),
    ].sort();

    populateFilter("#companyFilter", companies);
    populateFilter("#locationFilter", locations);
    applyFilters();
  }

  function populateFilter(selector, options, selected) {
    const $el = $(selector);

    // Normalize inputs
    const opts = Array.isArray(options) ? options : [];
    const selectedArr = Array.isArray(selected)
      ? selected
      : selected
      ? [selected]
      : [];

    // Build a set of options and make sure existing selections stay present
    const set = new Set(opts);
    selectedArr.forEach((v) => {
      if (v !== undefined && v !== null && v !== "") {
        set.add(v);
      }
    });

    // Rebuild options
    $el.empty();
    Array.from(set).forEach((val) => {
      $el.append(new Option(val, val, false, selectedArr.includes(val)));
    });

    // trigger change
    $el.trigger("change.select2");
  }

  function applyFilters() {
    jobsTable.draw();
    updateDropdowns();
  }

  function updateDropdowns() {
    if (!Array.isArray(allJobs) || allJobs.length === 0) {
      return;
    }

    // Get ALL current filter values
    const selectedCompanies = asArray($("#companyFilter").val());
    const selectedLocations = asArray($("#locationFilter").val());

    // Get the indices of the rows currently being displayed in the table (after search/pagination)
    const filteredRowIndices = jobsTable
      .rows({
        page: "all",
        search: "applied", // only include rows that match the current search term
      })
      .indexes()
      .toArray();

    // Map these indices back to the original 'allJobs' array to get the currently visible job objects
    const searchedAndFilteredJobs = filteredRowIndices.map(
      (index) => allJobs[index]
    );

    // Use the new set of jobs for updating the dropdown options
    const getDropdownJobs = (ignoreFilter) => {
      return searchedAndFilteredJobs.filter((job) => {
        if (!job || !job.company || !job.normalizedLocation) {
          return false;
        }
        // For company dropdown: ignore company filter, apply location filter

        const companyMatch =
          ignoreFilter === "company" ||
          selectedCompanies.length === 0 ||
          selectedCompanies.includes(job.company);

        // For location dropdown: ignore location filter, apply company filter
        const locationMatch =
          ignoreFilter === "location" ||
          selectedLocations.length === 0 ||
          selectedLocations.includes(job.normalizedLocation);

        return companyMatch && locationMatch;
      });
    };

    // Update Company Dropdown
    const companyFilteredJobs = getDropdownJobs("company");
    if (companyFilteredJobs && companyFilteredJobs.length) {
      const companies = Array.from(
        new Set(companyFilteredJobs.map((j) => j.company))
      ).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

      populateFilter("#companyFilter", companies, selectedCompanies);
    } else {
      // If no rows match, keep existing selections but clear available options
      populateFilter("#companyFilter", [], selectedCompanies);
    }

    // Update Location Dropdown
    const locationFilteredJobs = getDropdownJobs("location");

    if (locationFilteredJobs && locationFilteredJobs.length) {
      const locations = Array.from(
        new Set(locationFilteredJobs.map((j) => j.normalizedLocation))
      ).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

      populateFilter("#locationFilter", locations, selectedLocations);
    } else {
      populateFilter("#locationFilter", [], selectedLocations);
    }
  }

  function resetAllFilters() {
    // Clear dropdowns (without triggering 'change' events)
    $("#companyFilter").val(null);
    $("#locationFilter").val(null);

    // Clear the DataTables global search
    jobsTable.search("");

    // Manually call applyFilters() ONCE to sync dropdowns and redraw the table
    applyFilters();
  }

  function setupEventListeners() {
    // Custom filtering function for DataTables
    $.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
      const selectedCompanies = $("#companyFilter").val();
      const selectedLocations = $("#locationFilter").val();

      const job = allJobs[dataIndex];
      const company = job.company; // or data[1]
      const location = job.normalizedLocation;

      const companyMatch =
        !selectedCompanies.length || selectedCompanies.includes(company);
      const locationMatch =
        !selectedLocations.length || selectedLocations.includes(location);

      return companyMatch && locationMatch;
    });

    // Attach filter change listeners
    // When a dropdown changes, apply all filters
    $("#companyFilter").on("change", applyFilters);
    $("#locationFilter").on("change", applyFilters);

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
