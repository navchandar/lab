// --- Global Variables ---
const loadingSpinner = document.getElementById("loadingSpinner");
let sizeDistributionData = {};
let employmentTrendData = [];
let sizeChartInst = null;
let trendChartInst = null;

document.getElementById("year").textContent = new Date().getFullYear();
// Check if the screen width is mobile-sized
const isMobile = () => window.innerWidth <= 768;
Chart.register(ChartDataLabels);

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
    class="icon icon-link" 
    data-ticker="${ticker}"
    title="Public Company - View '${ticker}' on Yahoo Finance">
              ${icon}
            </a>`;
  }

  // Otherwise, just return the icon as a span
  return `<span class="icon no-link" title="${title}">${icon}</span>`;
}

function getLinkedInIcon(link) {
  return `<div class="icon-link ln-icon-container" title="LinkedIn Profile">
    <a href="${link}" target="_blank" class="icon linkedin-icon"></a></div>`;
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
 * Maps a numeric count to the specific string keys used in sizeBuckets
 */
function getBucketName(count) {
  if (count <= 10) {
    return "1-10";
  }
  if (count <= 50) {
    return "11-50";
  }
  if (count <= 200) {
    return "51-200";
  }
  if (count <= 1000) {
    return "201-1000";
  }
  if (count <= 5000) {
    return "1001-5000";
  }
  if (count <= 10000) {
    return "5001-10000";
  }
  if (count <= 50000) {
    return "10001-50000";
  }
  if (count <= 100000) {
    return "50001-100000";
  }
  return "100001+";
}

/**
 * Maps a bucket key (e.g., "1-10") to a descriptive label
 */
function getBucketLabel(bucketKey) {
  if (isMobile()) {
    return bucketKey;
  }
  const labels = {
    "1-10": "Micro (1-10)",
    "11-50": "Small (11-50)",
    "51-200": "Medium (51-200)",
    "201-1000": "Large (201-1000)",
    "1001-5000": "Enterprise (1001-5000)",
    "5001-10000": "Giant (5001-10000)",
    "10001-50000": "Conglomerate (10001-50000)",
    "50001-100000": "Global Corp (50001-100000)",
    "100001+": "Mega Corp (100000+)",
  };

  return labels[bucketKey] || bucketKey; // Fallback to key if not found
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

async function fetchTrendData() {
  try {
    const response = await fetch("charts_data.json");
    if (response.ok) {
      employmentTrendData = await response.json();
    }
  } catch (e) {
    console.error("Trend data load failed", e);
  }
}

// --- Chart Rendering Logic ---
function renderMarketCharts() {
  // Crucial for performance and bug-free re-renders
  if (sizeChartInst) {
    sizeChartInst.destroy();
  }
  if (trendChartInst) {
    trendChartInst.destroy();
  }

  const ctxSize = document.getElementById("sizeDistChart").getContext("2d");
  const ctxTrend = document
    .getElementById("employmentTrendChart")
    .getContext("2d");

  const getStyle = (varName) =>
    getComputedStyle(document.documentElement).getPropertyValue(varName).trim();

  const textColor = getStyle("--text-main");
  const mutedColor = getStyle("--text-muted");
  const accentColor = getStyle("--accent-color");
  const gridColor = getStyle("--row-border");

  // Indian Number Formatter (Lakhs/Crores)
  const IN_Format = new Intl.NumberFormat("en-IN");

  // GRADIENTS: Dynamic scaling
  const blueGrad = ctxSize.createLinearGradient(0, 0, 0, 300);
  blueGrad.addColorStop(0, "#0bb495");
  blueGrad.addColorStop(1, "rgba(56, 189, 248, 0.8)");

  const trendGrad = ctxTrend.createLinearGradient(0, 0, 0, 300);
  trendGrad.addColorStop(0, "rgba(48, 217, 236, 0.5)");
  trendGrad.addColorStop(1, "rgba(56, 189, 248, 0.8)");

  // SHARED CONFIGURATION
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: !isMobile(),
    aspectRatio: isMobile() ? 1.2 : 2, // Higher number = wider chart
    interaction: {
      intersect: false,
      mode: "index", // Shows the tooltip for the nearest x-axis value
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(15, 23, 42, 0.8)", // Darker glass look
        titleFont: { size: 14, weight: "bold" },
        padding: 12,
        cornerRadius: 10,
        displayColors: false,
        borderWidth: 1,
        borderColor: "rgba(255, 255, 255, 0.1)",
      },
      datalabels: {
        // If isMobile() is true, display is false. Otherwise, it's true.
        display: (context) => !isMobile(),
        anchor: "end",
        align: "top",
        color: textColor,
        font: {
          size: 11,
          weight: "600",
        },
        formatter: (value) => {
          if (value >= 1000000)
            return (value / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
          if (value >= 1000)
            return (value / 1000).toFixed(1).replace(/\.0$/, "") + "k";
          return value;
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: mutedColor, font: { size: 10 } },
      },
      y: {
        grid: { color: gridColor, drawBorder: false },
        ticks: {
          color: mutedColor,
          callback: (val) => {
            if (val >= 1000000) {
              return (val / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
            }
            if (val >= 1000) {
              return (val / 1000).toFixed(1).replace(/\.0$/, "") + "k";
            }
            return val;
          },
        },
      },
    },
  };

  // RENDER CHART 1: Size Distribution
  sizeChartInst = new Chart(ctxSize, {
    type: "bar",
    data: {
      // Transform keys like "1-10" into "Micro (1-10)"
      labels: Object.keys(sizeDistributionData).map((key) =>
        getBucketLabel(key),
      ),
      datasets: [
        {
          data: Object.values(sizeDistributionData),
          backgroundColor: blueGrad,
          borderColor: "#00604f",
          borderWidth: 1,
          borderRadius: 6,
          hoverBackgroundColor: "#025b4b",
          pointHitRadius: isMobile() ? 15 : 5, // Larger tap target for mobile
        },
      ],
    },
    options: {
      ...commonOptions,
      plugins: {
        ...commonOptions.plugins,
        title: {
          display: true,
          text: "COMPANIES BY SIZE",
          color: accentColor,
          font: { weight: "600" },
        },
        tooltip: {
          ...commonOptions.plugins.tooltip,
          callbacks: {
            // customize the tooltip title to show the friendly name
            title: (items) => items[0].label,
            label: (ctx) => ` ${ctx.parsed.y} Companies`,
          },
        },
      },
    },
  });

  // RENDER CHART 2: Employment Trend
  trendChartInst = new Chart(ctxTrend, {
    type: "line",
    data: {
      labels: employmentTrendData.map((d) => d.d),
      datasets: [
        {
          data: employmentTrendData.map((d) => d.ma),
          fill: true,
          backgroundColor: trendGrad,
          borderColor: "#0bb495",
          borderWidth: 2,
          pointRadius: isMobile() ? 2 : 4,
          pointHoverRadius: 6,
          pointBackgroundColor: "#025b4b",
          tension: 0.4,
          pointHitRadius: isMobile() ? 15 : 5, // Larger tap target for mobile
        },
      ],
    },
    options: {
      ...commonOptions,
      plugins: {
        ...commonOptions.plugins,
        title: {
          display: true,
          text: "TOTAL EMPLOYMENT VELOCITY",
          color: accentColor,
          font: { weight: "600" },
        },
        tooltip: {
          ...commonOptions.plugins.tooltip,
          callbacks: {
            label: (ctx) => {
              const item = employmentTrendData[ctx.dataIndex];
              const changeText =
                item.chg >= 0 ? `(+${item.chg}%)` : `(${item.chg}%)`;
              return ` Total Employed: ${IN_Format.format(ctx.parsed.y)} ${changeText}`;
            },
          },
        },
      },
    },
  });
}

// --- Hash & Modal Handling ---
function handleHashChange() {
  const chartModal = document.getElementById("chartModal");
  const discModal = document.getElementById("disclaimerModal");
  const hash = window.location.hash;

  // Reset state
  [chartModal, discModal].forEach((m) => m.classList.remove("show"));
  document.body.style.overflow = "auto";

  // Open specific modal based on hash
  if (hash === "#charts") {
    chartModal.classList.add("show");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      try {
        renderMarketCharts();
      } catch (e) {
        console.error("Charts failed to load:", e);
      }
    });
  } else if (hash === "#disclaimer") {
    discModal.classList.add("show");
    document.body.style.overflow = "hidden";
  }
}

function setupModals() {
  // Listen for hash changes
  window.addEventListener("hashchange", handleHashChange);

  // Close functionality (clearing the hash closes any active modal)
  const closeModal = (e) => {
    if (e) {
      e.preventDefault();
    }
    window.location.hash = "";
  };

  // Attach to all close buttons and backdrops
  document.querySelectorAll(".modal-close-btn").forEach((btn) => {
    btn.onclick = closeModal;
  });

  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.onclick = (e) => {
      if (e.target === backdrop) {
        closeModal();
      }
    };
  });

  // Escape key handler
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
    }
  });

  // Initial check on load
  handleHashChange();
}

async function loadData() {
  const tableBody = document.getElementById("tableBody");
  // Initialize Size Aggregator
  const sizeBuckets = {
    "1-10": 0,
    "11-50": 0,
    "51-200": 0,
    "201-1000": 0,
    "1001-5000": 0,
    "5001-10000": 0,
    "10001-50000": 0,
    "50001-100000": 0,
    "100001+": 0,
  };
  // Define helper functions at the top of the main function scope
  const handleSwipe = (touchstartX, touchendX, table) => {
    const info = table.page.info();
    const distance = touchendX - touchstartX;
    const minSwipeDistance = 30;

    if (distance < -minSwipeDistance) {
      if (info.page < info.pages - 1) {
        table.page("next").draw("page");
      }
    } else if (distance > minSwipeDistance) {
      if (info.page > 0) {
        table.page("previous").draw("page");
      }
    }
  };

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

      // USE THE NUMERIC RANK TO FILL BUCKETS
      if (sortRank > 0) {
        const bucketKey = getBucketName(sortRank);
        sizeBuckets[bucketKey]++;
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
      const name = `<strong>${item.name}</strong>`;
      const mobileName = item.website
        ? `<a href="${item.website}" class="mobile-only-link" target="_blank">${item.name}</a>`
        : "";
      const desktopLink = item.website
        ? `<a href="${item.website}" class="desktop-only-link" target="_blank">${domain}</a>`
        : "-";
      const tooltipText = getGrowthTitle(item);
      const sparklineHtml = item.sparkline
        ? `<div class="sparkline-wrapper" title="${tooltipText}">${item.sparkline}</div>`
        : ``;

      // Build Row with data
      const row = document.createElement("tr");
      row.innerHTML = `
              <td title="${item.name}">${isMobile() ? mobileName : name}</td>
              <td data-order="${sortRank}"><div class="emp-cell">
                  <span>${displayCount}</span>
                  ${sparklineHtml}
              </div>
              </td>
              <td>${desktopLink}</td>
              <td class="text-center">${getLinkedInIcon(linkedin_link)}</td>
              <td class="text-center" data-search="${status}">${getStatusIcon(item.public, item.ticker)}</td>
              <td>${item.last_updated ? new Date(item.last_updated).toLocaleDateString() : "-"}</td>
            `;
      fragment.appendChild(row);
    });

    tableBody.appendChild(fragment);
    sizeDistributionData = sizeBuckets;

    // This is a custom search function that allows us to filter by numeric ranges
    $.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
      const selectedRange = $("#empFilter").val(); // Get the selected value from dropdown
      // If "All Values", show everything
      if (!selectedRange) {
        return true;
      }

      // use the data-order attribute directly if available
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

    // --- KEYBOARD NAVIGATION ---
    $(document).on("keydown", function (e) {
      // IGNORE if typing in an input
      if ($(e.target).is("input, textarea")) {
        return;
      }

      // IGNORE if Ctrl, Alt, Shift, or Command(Meta) are pressed
      if (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) {
        return;
      }

      const info = table.page.info();

      if (e.which === 39) {
        // Right Arrow
        if (info.page < info.pages - 1) {
          table.page("next").draw("page");
        }
      } else if (e.which === 37) {
        // Left Arrow
        if (info.page > 0) {
          table.page("previous").draw("page");
        }
      } else if (e.which >= 49 && e.which <= 57) {
        // Numbers 1-9
        const pageNum = e.which - 49;
        if (pageNum < info.pages) {
          table.page(pageNum).draw("page");
        }
      }
    });

    // --- SWIPE NAVIGATION ---
    let touchstartX = 0;
    let touchendX = 0;

    // Attach listeners to the table container
    const tableContainer = document.getElementById("companyTable");
    tableContainer.addEventListener("touchstart", (e) => {
      touchstartX = e.changedTouches[0].screenX;
    });

    tableContainer.addEventListener("touchend", (e) => {
      touchendX = e.changedTouches[0].screenX;
      // Call the helper
      handleSwipe(touchstartX, touchendX, table);
    });

    // Get the trend info
    await fetchTrendData();
    // Trigger initial check for hash
    handleHashChange();
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
    loadingSpinner.classList.add("spinner-hidden");
    loadingSpinner.addEventListener(
      "transitionend",
      () => {
        loadingSpinner.style.display = "none";
      },
      { once: true },
    );
    const dataTable = document.querySelector(".table-card");
    // Show the table card regardless of success or failure
    dataTable.style.display = "block";
    dataTable.style.opacity = 1;
  }
}

// Call this inside your DOMContentLoaded or init function
document.addEventListener("DOMContentLoaded", () => {
  loadData();
  setupModals();
});
