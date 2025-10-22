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
  const locLower = location.toLowerCase().trim();

  for (const [canonical, aliases] of Object.entries(cityAliases)) {
    for (const alias of aliases) {
      if (locLower.includes(alias)) {
        return canonical.charAt(0).toUpperCase() + canonical.slice(1);
      }
    }
  }

  return location;
}

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

// Global variable to hold all jobs
let allJobs = [];
let lastModified = null;

function main() {
  // --- Initialize an empty DataTable ---
  // We initialize it once with configuration, then add data later
  const jobsTable = jQuery("#jobTable").DataTable({
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
        width: "20%",
      },
      {
        // 3. Location (Index 2)
        targets: [2],
        className: "dt-head-left dt-body-left",
        width: "20%",
      },
      {
        // 4. Type (Index 3 - Full-Time/Part-Time/Contract)
        targets: [3],
        className: "dt-head-center dt-body-center", // Center align for better visual grouping
        width: "10%",
      },
      {
        // 5. Date Posted (Index 4)
        targets: [4],
        type: "date", // Explicitly tell DataTables to sort this as a date
        className: "dt-head-right dt-body-right text-nowrap", // Align right and prevent wrapping
        width: "20%",
      },
    ],
  });

  // Initialize Select2 on the dropdowns
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

  // --- Load Data using Fetch API ---
  async function loadJobs() {
    try {
      const headResponse = await fetch("jobs.json", { method: "HEAD" });
      const newModified = headResponse.headers.get("Last-Modified");

      if (lastModified && newModified && newModified === lastModified) {
        console.log("No changes in jobs.json");
        return;
      }

      // Update stored value
      lastModified = newModified;

      // Fetch and update table
      const response = await fetch("jobs.json", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Get the IANA Timezone Name
      const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      console.log("Local Timezone:", localTimeZone);

      allJobs = await response.json();
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
    } catch (error) {
      console.error("Could not fetch jobs data:", error);
    }
  }

  // --- Function to populate the table ---
  function populateTable(jobs) {
    // Clear the existing data
    jobsTable.clear();

    // Prepare data for DataTables. It expects an array of arrays.
    const dataToLoad = jobs.map((job) => {
      // The order MUST match <thead> columns
      return [
        `<a href="${job.url}" target="_blank" rel="noopener noreferrer">${job.title}</a>`,
        job.company,
        job.location,
        job.type,
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
  }

  function populateFilter(selector, items, selectedValues = []) {
    const select = $(selector);
    select.empty();

    // Create all Option objects in an array first
    const options = items.map((item) => {
      return new Option(item, item, false, selectedValues.includes(item));
    });
    // Append all at once and trigger select2
    select.append(options);
    select.trigger("change.select2");
  }

  function applyFilters() {
    jobsTable.draw();
    updateDropdowns();
  }

  function updateDropdowns() {
    // Get ALL current filter values
    const selectedCompanies = $("#companyFilter").val();
    const selectedLocations = $("#locationFilter").val();
    // Get the global search term from DataTables API
    const searchTerm = jobsTable.search().toLowerCase().trim();

    // Pre-filter by global search to reduce the number of items to loop through for the dropdowns.
    const searchedJobs = !searchTerm.length
      ? allJobs // If no search, use all jobs
      : allJobs.filter((job) => {
          // Check against the data you want to be searchable
          return (
            job.title.toLowerCase().includes(searchTerm) ||
            job.company.toLowerCase().includes(searchTerm) ||
            job.location.toLowerCase().includes(searchTerm) ||
            new Date(job.datePosted)
              ?.toISOString()
              .toLowerCase()
              .includes(searchTerm)
          );
        });

    // --- Helper function to filter jobs based on all active filters ---
    // We use 'ignoreFilter' to specify which dropdown we are currently populating,
    // so we don't filter it by its own selection.
    const getFilteredJobs = (ignoreFilter) => {
      return searchedJobs.filter((job) => {
        // 1. Check Company filter
        const companyMatch =
          ignoreFilter === "company" || // Always true if we are populating companies
          !selectedCompanies.length ||
          selectedCompanies.includes(job.company);

        // 2. Check Location filter
        const locationMatch =
          ignoreFilter === "location" || // Always true if we are populating locations
          !selectedLocations.length ||
          selectedLocations.includes(job.normalizedLocation);

        // 3. Global searchMatch is already handled by creating 'searchedJobs'
        return companyMatch && locationMatch;
      });
    };

    // --- Populate Company Dropdown ---
    // Get jobs filtered by LOCATION and SEARCH
    const companyFilteredJobs = getFilteredJobs("company");
    const companies = [
      ...new Set(companyFilteredJobs.map((j) => j.company)),
    ].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    populateFilter("#companyFilter", companies, selectedCompanies);

    // --- Populate Location Dropdown ---
    // Get jobs filtered by COMPANY and SEARCH
    const locationFilteredJobs = getFilteredJobs("location");
    const locations = [
      ...new Set(locationFilteredJobs.map((j) => j.normalizedLocation)),
    ].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    populateFilter("#locationFilter", locations, selectedLocations);
  }

  // Run once immediately to load jobs
  loadJobs();

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
  jobsTable.on("search.dt", function () {
    updateDropdowns();
  });

  // When reset is clicked, clear all filters and redraw
  $("#resetFilters").on("click", function () {
    // Clear dropdowns (without triggering 'change' events)
    $("#companyFilter").val(null);
    $("#locationFilter").val(null);

    // Clear the DataTables global search
    jobsTable.search("");

    // Manually call applyFilters() ONCE to sync dropdowns and redraw the table
    applyFilters();

    // Poll every 5 minutes
    setInterval(loadJobs, 5 * 60 * 1000); // 300000 ms = 5 minutes
  });
}

document.addEventListener("DOMContentLoaded", main);
