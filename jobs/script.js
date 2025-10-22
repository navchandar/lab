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

function main() {
  // --- Initialize an empty DataTable ---
  // We initialize it once with configuration, then add data later
  const jobsTable = jQuery("#jobTable").DataTable({
    // Add configurations
    // Sort by the 5th column (Date Posted) descending
    order: [[4, "desc"]],
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
        width: "15%",
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
        width: "25%",
      },
    ],
  });

  // --- Load Data using Fetch API ---
  async function loadJobs() {
    try {
      const response = await fetch("jobs.json");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const allJobs = await response.json();

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
      ...new Set(jobs.map((j) => normalizeLocation(j.location))),
    ].sort();

    populateFilter("#companyFilter", companies);
    populateFilter("#locationFilter", locations);
  }

  function populateFilter(selector, items) {
    const select = $(selector);
    select.empty(); // Clear existing options

    items.forEach((item) => {
      select.append(new Option(item, item));
    });

    // Initialize Select2
    select.select2({
      placeholder: "Select options",
      allowClear: true,
      width: "resolve",
    });
  }

  function applyFilters() {
    const selectedCompanies = $("#companyFilter").val();
    const selectedLocations = $("#locationFilter").val();
    jobsTable.draw();
  }

  // --- Start loading the jobs ---
  loadJobs();

  // Custom filtering function for DataTables
  $.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
    const selectedCompanies = $("#companyFilter").val();
    const selectedLocations = $("#locationFilter").val();

    const company = data[1]; // Company column
    const location = normalizeLocation(data[2]); // Location column

    const companyMatch =
      !selectedCompanies.length || selectedCompanies.includes(company);
    const locationMatch =
      !selectedLocations.length || selectedLocations.includes(location);

    return companyMatch && locationMatch;
  });

  // Attach filter change listeners
  $("#companyFilter").on("change", applyFilters);
  $("#locationFilter").on("change", applyFilters);
}

document.addEventListener("DOMContentLoaded", main);
