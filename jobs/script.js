// Assume jobsData is available globally from jobs.json script tag
// If you load the JSON using fetch, the setup is slightly different.

document.addEventListener("DOMContentLoaded", () => {
  const jobTableBody = document.getElementById("jobTableBody");
  const searchInput = document.getElementById("searchInput");
  const locationFilter = document.getElementById("locationFilter");
  const typeFilter = document.getElementById("typeFilter");
  const noResultsMessage = document.getElementById("noResults");

  let currentJobs = jobsData;

  // --- 1. Initial Setup: Populate Filters ---
  function populateFilters(jobs) {
    const locations = new Set(jobs.map((job) => job.location));
    const types = new Set(jobs.map((job) => job.type));

    // Clear existing options (except 'All')
    locationFilter.innerHTML = '<option value="">All Locations</option>';
    typeFilter.innerHTML = '<option value="">All Types</option>';

    // Add options
    locations.forEach((loc) => {
      const option = document.createElement("option");
      option.value = loc;
      option.textContent = loc;
      locationFilter.appendChild(option);
    });

    types.forEach((type) => {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type;
      typeFilter.appendChild(option);
    });
  }

  // --- 2. Render Table ---
  function renderJobs(jobs) {
    jobTableBody.innerHTML = "";
    if (jobs.length === 0) {
      noResultsMessage.style.display = "block";
      return;
    }
    noResultsMessage.style.display = "none";

    jobs.forEach((job) => {
      const row = jobTableBody.insertRow();

      // Add SEO-friendly content/semantics to the title cell
      const titleCell = row.insertCell();
      titleCell.innerHTML = `<a href="#" title="${job.title} at ${job.company}">${job.title}</a>`; // Internal linking placeholder

      row.insertCell().textContent = job.company;
      row.insertCell().textContent = job.location;
      row.insertCell().textContent = job.type;
      row.insertCell().textContent = job.datePosted;
    });
  }

  // --- 3. Filtering Logic ---
  function applyFilters() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const selectedLocation = locationFilter.value;
    const selectedType = typeFilter.value;

    const filteredJobs = jobsData.filter((job) => {
      const matchesSearch =
        job.title.toLowerCase().includes(searchTerm) ||
        job.company.toLowerCase().includes(searchTerm);

      const matchesLocation =
        !selectedLocation || job.location === selectedLocation;
      const matchesType = !selectedType || job.type === selectedType;

      return matchesSearch && matchesLocation && matchesType;
    });

    currentJobs = filteredJobs;
    renderJobs(currentJobs);
  }

  // --- 4. Event Listeners ---
  searchInput.addEventListener("input", applyFilters);
  locationFilter.addEventListener("change", applyFilters);
  typeFilter.addEventListener("change", applyFilters);

  // Initial load
  populateFilters(jobsData);
  renderJobs(jobsData);
});
