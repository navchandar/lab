document.getElementById("year").textContent = new Date().getFullYear();
const loadingSpinner = document.getElementById("loadingSpinner");

// Check if the screen width is mobile-sized
const isMobile = () => window.innerWidth <= 768;

// HELPER: Generate Public/Private Icons with Financial Links
function getStatusIcon(isPublic, ticker) {
  const icon = isPublic ? "💹" : "🏢";
  const title = isPublic
    ? `Public Company ${ticker ? `(${ticker})` : ""}`
    : "Private Company";

  // If it's public and has a ticker, wrap it in a Yahoo Finance link
  if (isPublic && ticker) {
    const financeUrl = `https://finance.yahoo.com/quote/${ticker}/`;
    return `<a href="${financeUrl}" 
    target="_blank"
    class="public-icon icon-link" 
    data-ticker="${ticker}"
    title="View ${ticker} on Yahoo Finance">
              ${icon}
            </a>`;
  }

  // Otherwise, just return the icon as a span
  return `<span class="public-icon no-link" title="${title}">${icon}</span>`;
}

function getLinkedInIcon(link) {
  return `<a href="${link}" target="_blank" title="LinkedIn Profile" class="public-icon icon-link">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                  <path fill="#0077b5" d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                </svg>
              </a>`;
}

function normalizeEmployeeSize(countStr) {
  const count = parseInt(countStr.replace(/,/g, ""), 10);
  if (isNaN(count) || count <= 0) {
    return { display: "-", rank: 0 };
  }

  // For very small companies, keep it simple
  if (count < 10) {
    return { display: "1-10", rank: 10 };
  }

  // Logic: Find the scale (10, 100, 1000...)
  const magnitude = Math.pow(10, Math.floor(Math.log10(count)));

  // Find how many of that magnitude (e.g., 400 for 434)
  // We use a factor of 0.5 to allow for mid-steps like "50" if preferred,
  // but sticking to your "closest power" request:
  let rounded = Math.floor(count / magnitude) * magnitude;

  // Special case: if it lands on something like 73, and we want 50+,
  // we can add a mid-tier check for 5s
  if (count >= 50 && count < 100) {
    rounded = 50;
  }

  return {
    display: `${rounded.toLocaleString()}+`,
    rank: count, // Use the actual count for perfect sorting
  };
}

/**
 * Sets up the Disclaimer Modal interaction
 */
function setupDisclaimer() {
  const modal = document.getElementById("disclaimerModal");
  const openBtn = document.getElementById("openDisclaimerModal");
  const closeBtn = document.querySelector(".modal-close-btn");
  const backdrop = document.querySelector(".modal-backdrop");

  if (!modal || !openBtn) {
    return;
  }

  // Open modal
  openBtn.addEventListener("click", (e) => {
    e.preventDefault();
    modal.classList.add("show");
    document.body.style.overflow = "hidden"; // Disable background scroll
  });

  // Close modal function
  const closeModal = () => {
    modal.classList.remove("show");
    document.body.style.overflow = "auto"; // Re-enable scroll
  };

  closeBtn.addEventListener("click", closeModal);
  backdrop.addEventListener("click", closeModal);

  // Close on Escape key
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("show")) {
      closeModal();
    }
  });
}

// HELPER: Build a dynamic tooltip string for growth trends
function getGrowthTitle(item) {
  const parts = [];

  // Check each value and add to the list if it's not null
  if (item["Δ_30d"] !== null) {
    parts.push(`30d: ${item["Δ_30d"]}%`);
  }
  if (item["Δ_90d"] !== null) {
    parts.push(`90d: ${item["Δ_90d"]}%`);
  }
  if (item["Δ_365d"] !== null) {
    parts.push(`1yr: ${item["Δ_365d"]}%`);
  }

  // Join the existing parts with a separator, or return a default
  return parts.length > 0 ? `Growth Trend | ${parts.join(" • ")}` : "";
}

async function loadData() {
  const tableBody = document.getElementById("tableBody");
  try {
    const response = await fetch("company_data.json");
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await response.json();
    // We use a Map to store { displayValue: numericalRank }
    // This automatically handles duplicates and gives us sorting data.
    const filterOptionsMap = new Map();

    const fragment = document.createDocumentFragment(); // Efficient DOM manipulation

    data.forEach((item) => {
      // Data Quality Gate: Ignore row if BOTH critical fields are missing
      if (!item.emp_count && !item.website && !item.ln_count) {
        return;
      }

      let displayCount = "-";
      let sortRank = 0;

      // Normalize Count Size & Rank
      if (item.ln_count && item.ln_count !== "0") {
        const normalized = normalizeEmployeeSize(item.ln_count);
        displayCount = normalized.display;
        sortRank = normalized.rank;
      } else if (item.emp_count && item.emp_count !== "-") {
        displayCount = item.emp_count;
        sortRank = parseInt(displayCount.split(/[-+]/)[0]) || 0;
      }

      // Add to Filter Map (O(1) complexity for duplicates)
      if (displayCount !== "-") {
        // We store the lowest possible rank for this category to help sort the dropdown
        if (
          !filterOptionsMap.has(displayCount) ||
          sortRank < filterOptionsMap.get(displayCount)
        ) {
          filterOptionsMap.set(displayCount, sortRank);
        }
      }

      let domain = "";
      let linkedin_link = "";
      let status = "";
      try {
        domain = item.website
          ? new URL(item.website).hostname.replace("www.", "")
          : "-";
        linkedin_link = item.linkedin ? item.linkedin.split("?")[0] : "#";
        status = item.public ? "Public" : "Private";
      } catch (error) {
        console.warn(
          `${item.name} Website:'${item.website}' LinkedIn:'${item.linkedin}'`,
        );
        console.error(error);
      }

      const tooltipText = getGrowthTitle(item);
      const sparklineHtml = item.sparkline
        ? `<div class="sparkline-wrapper" title="${tooltipText}">${item.sparkline}</div>`
        : ``;

      // Build Row with data
      const row = document.createElement("tr");
      row.innerHTML = `
              <td title="${item.name}"><strong>${item.name}</strong></td>
              <td data-order="${sortRank}"><div class="emp-cell">
                  <span>${displayCount}</span>
                  ${sparklineHtml}
              </div>
              </td>
              <td>${item.website ? `<a href="${item.website}" target="_blank">${domain}</a>` : "-"}</td>
              <td class="text-center">${getLinkedInIcon(linkedin_link)}</td>
              <td class="text-center" data-search="${status}">${getStatusIcon(item.public, item.ticker)}</td>
              <td>${item.last_updated ? new Date(item.last_updated).toLocaleDateString() : "-"}</td>
            `;
      fragment.appendChild(row);
    });

    tableBody.appendChild(fragment);

    // This is a custom search function that allows us to filter by numeric ranges
    $.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
      const selectedRange = $("#empFilter").val(); // Get the selected value from dropdown
      // If "All Values", show everything
      if (!selectedRange) {
        return true;
      }

      const rank = parseFloat(data[1].match(/\d+/)) || 0; // Get numeric value from the Employee column
      // Or better: use the data-order attribute directly if available
      const sortRank =
        parseFloat(
          settings.aoData[dataIndex].anCells[1].getAttribute("data-order"),
        ) || 0;

      const [min, max] = selectedRange.split("-").map(Number);

      if (isNaN(max)) {
        return sortRank >= min; // Handle "500+" cases
      }
      return sortRank >= min && sortRank <= max; // Handle "50-100" cases
    });

    // DataTable Initialization
    const table = $("#companyTable").DataTable({
      responsive: true,
      pageLength: 10,
      order: [[1, "desc"]],
      fixedHeader: true,
      autoWidth: false,
      dom: '<"top-wrapper"lf>rtip',
      language: {
        search: isMobile() ? "" : "Search",
        searchPlaceholder: "Company name",
        lengthMenu: "Show _MENU_ companies",
        info: "Showing _START_ to _END_ of _TOTAL_ companies",
      },
      initComplete: function () {
        const api = this.api();

        // 1. Create the Range-Based Dropdown
        const filterHtml = `
    <div class="emp-filter-wrapper">
      <label for="empFilter">Company Size:</label>
      <select id="empFilter">
        <option value="">All Sizes</option>
        <option value="1-10">Micro (1-10)</option>
        <option value="11-50">Small (11-50)</option>
        <option value="51-200">Medium (51-200)</option>
        <option value="201-1000">Large (201-1000)</option>
        <option value="1001-5000">Enterprise (1001-5000)</option>
        <option value="5001-10000">Giant (5001-10000)</option>
        <option value="10001-50000">Conglomerate (10001-50000)</option>
        <option value="50001-100000">Global Corp (50001-100000)</option>
        <option value="100001">Mega Corp (100000+)</option>
      </select>
    </div>`;

        // 2. Inject into the DOM
        $(".dataTables_length").after(filterHtml);

        // 3. Trigger Redraw on Change
        $(document).on("change", "#empFilter", function () {
          api.draw(); // This triggers the $.fn.dataTable.ext.search.push function above
        });

        // 4. Fixed Header Adjust
        setTimeout(() => {
          api.fixedHeader.adjust();
        }, 150);
      },
    });
  } catch (error) {
    // ERROR HANDLING: Show message in table
    console.error("Critical Error:", error);
    tableBody.innerHTML = `
            <tr>
              <td colspan="6" class="error">
                <strong>⚠️ Error loading data:</strong> ${error.message}. Please refresh or try again later.
              </td>
            </tr>`;
  } finally {
    // Show the table card regardless of success or failure
    document.querySelector(".table-card").style.display = "block";
    loadingSpinner.classList.add("spinner-hidden");
  }
}

// Call this inside your DOMContentLoaded or init function
document.addEventListener("DOMContentLoaded", () => {
  loadData();
  setupDisclaimer();
});
