document.addEventListener("DOMContentLoaded", () => {
  const jobTableBody = document.getElementById("jobTableBody");
  const searchInput = document.getElementById("searchInput");
  const locationFilter = document.getElementById("locationFilter");
  const typeFilter = document.getElementById("typeFilter");
  const noResultsMessage = document.getElementById("noResults");

  let allJobs = [];

  // --- 1. Load Data using Fetch API ---
  async function loadJobs() {
    try {
      const response = await fetch("jobs.json");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      allJobs = await response.json();

      // Initial setup after loading data
      populateFilters(allJobs);
      renderJobs(allJobs);
    } catch (error) {
      console.error("Could not fetch jobs data:", error);
      jobTableBody.innerHTML =
        '<tr><td colspan="5" style="text-align:center;">Failed to load job listings</td></tr>';
    }
  }

  // --- 2. Populate Filters (same logic as before) ---
  function populateFilters(jobs) {
    const locations = new Set(jobs.map((job) => job.location));
    const types = new Set(jobs.map((job) => job.type));

    locationFilter.innerHTML = '<option value="">All Locations</option>';
    typeFilter.innerHTML = '<option value="">All Types</option>';

    locations.forEach((loc) => {
      locationFilter.add(new Option(loc, loc));
    });

    types.forEach((type) => {
      typeFilter.add(new Option(type, type));
    });
  }

  // --- 3. Render Table---
  function renderJobs(jobs) {
    jobTableBody.innerHTML = "";
    if (jobs.length === 0) {
      noResultsMessage.style.display = "block";
      return;
    }
    noResultsMessage.style.display = "none";

    jobs.forEach((job) => {
      const row = jobTableBody.insertRow();

      // Title Cell with Link (Crucial for job listings)
      const titleCell = row.insertCell();
      titleCell.innerHTML = `<a href="${job.url}" target="_blank" rel="noopener noreferrer" title="View details for ${job.title} at ${job.company}">${job.title}</a>`;

      row.insertCell().textContent = job.company;
      row.insertCell().textContent = job.location;
      row.insertCell().textContent = job.type;
      row.insertCell().textContent = job.datePosted;
    });
  }

  // --- 4. Filtering Logic (Uses allJobs) ---
  function applyFilters() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const selectedLocation = locationFilter.value;
    const selectedType = typeFilter.value;

    const filteredJobs = allJobs.filter((job) => {
      const matchesSearch =
        job.title.toLowerCase().includes(searchTerm) ||
        job.company.toLowerCase().includes(searchTerm);

      const matchesLocation =
        !selectedLocation || job.location === selectedLocation;
      const matchesType = !selectedType || job.type === selectedType;

      return matchesSearch && matchesLocation && matchesType;
    });

    renderJobs(filteredJobs);
  }

  // --- 5. Event Listeners ---
  searchInput.addEventListener("input", applyFilters);
  locationFilter.addEventListener("change", applyFilters);
  typeFilter.addEventListener("change", applyFilters);

  // Start loading the jobs
  loadJobs();
});
