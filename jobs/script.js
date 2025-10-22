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
    const locations = [...new Set(jobs.map((j) => j.location))].sort();

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

    jobsTable.rows().every(function () {
      const data = this.data();
      const company = data[1];
      const location = data[2];

      const companyMatch =
        !selectedCompanies.length || selectedCompanies.includes(company);
      const locationMatch =
        !selectedLocations.length || selectedLocations.includes(location);

      if (companyMatch && locationMatch) {
        $(this.node()).show();
      } else {
        $(this.node()).hide();
      }
    });
  }

  // --- Start loading the jobs ---
  loadJobs();

  // Attach filter change listeners
  $("#companyFilter").on("change", applyFilters);
  $("#locationFilter").on("change", applyFilters);
}

document.addEventListener("DOMContentLoaded", main);
