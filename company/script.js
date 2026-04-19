// --- Global Variables ---
const loadingSpinner = document.getElementById("loadingSpinner");
let sizeDistributionData = {};
let companyDistributionData = {};
let employmentTrendData = [];
let marketSnapshot = null;
let sizeChartInst = null;
let trendChartInst = null;
let ownershipChartInst = null;

document.getElementById("year").textContent = new Date().getFullYear();
// detects mobile / touch devices
const isMobile =
  window.innerWidth <= 768 ||
  (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

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

function getLinkedInIcon(link, alt) {
  return `<div class="icon-link ln-icon-container" title="LinkedIn Profile">
    <a href="${link}" target="_blank" class="icon linkedin-icon" alt="${alt}"></a></div>`;
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
  if (isMobile) {
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
  return labels[bucketKey] || bucketKey;
}

async function fetchTrendData() {
  try {
    const response = await fetch("charts_data.json");
    if (response.ok) {
      const fullData = await response.json();
      // Save the nested data to the correct variables
      employmentTrendData = fullData.history || [];
      marketSnapshot = fullData.snapshot || null;

      // Update the sizeDistributionData directly from the backend snapshot
      if (marketSnapshot) {
        sizeDistributionData = marketSnapshot.concentration_pct || {};
        companyDistributionData = marketSnapshot.company_distribution || {};
      }

      // Trigger render if we are already on the charts tab
      if (window.location.hash === "#charts") {
        requestAnimationFrame(renderMarketCharts);
      }
    }
  } catch (e) {
    console.error("Trend data load failed", e);
  }
}

function getHybridTrendData(rawData) {
  const now = new Date();
  const sevenDaysAgo = new Date().setDate(now.getDate() - 7);
  const ninetyDaysAgo = new Date().setDate(now.getDate() - 90);

  // Partition the data based on number of days
  const liveZone = [];
  const contextZone = [];
  const historyZone = [];

  rawData.forEach((item) => {
    const itemDate = new Date(item.d).getTime();
    if (itemDate >= sevenDaysAgo) {
      liveZone.push(item);
    } else if (itemDate >= ninetyDaysAgo) {
      contextZone.push(item);
    } else {
      historyZone.push(item);
    }
  });

  // Helper to aggregate a specific array
  const aggregate = (data, type) => {
    const grouped = data.reduce((acc, item) => {
      const date = new Date(item.d);
      const key =
        type === "month"
          ? date.toLocaleDateString("en-IN", {
            month: "short",
            year: "numeric",
          })
          : `Week of ${new Date(date.setDate(date.getDate() - date.getDay())).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;

      if (!acc[key]) {
        acc[key] = { sumMa: 0, sumChg: 0, count: 0 };
      }
      acc[key].sumMa += item.ma;
      acc[key].sumChg += item.chg;
      acc[key].count += 1;
      return acc;
    }, {});

    return Object.keys(grouped).map((key) => ({
      d: key,
      ma: Math.round(grouped[key].sumMa / grouped[key].count),
      chg: (grouped[key].sumChg / grouped[key].count).toFixed(2),
      isAggregated: true, // Useful for tooltips later!
    }));
  };

  // Stitch all data points together
  return [
    ...aggregate(historyZone, "month"),
    ...aggregate(contextZone, "week"),
    ...liveZone.map((d) => ({
      ...d,
      d: new Date(d.d).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      }),
      isAggregated: false,
    })),
  ];
}

// --- Chart Rendering Logic ---
function renderMarketCharts() {
  if (!marketSnapshot) {
    return;
  }

  const ctxSize = document.getElementById("sizeDistChart").getContext("2d");
  const ctxOwnership = document
    .getElementById("ownershipSplitChart")
    .getContext("2d");
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
  blueGrad.addColorStop(0, "#0bb495dd");
  blueGrad.addColorStop(1, "rgba(56, 189, 248, 0.8)");

  const trendGrad = ctxTrend.createLinearGradient(0, 0, 0, 300);
  trendGrad.addColorStop(0, "rgba(48, 217, 236, 0.5)");
  trendGrad.addColorStop(1, "rgba(56, 189, 248, 0.8)");

  // Generate an array of colors based on Market Share Intensity
  const backgroundColors = Object.keys(companyDistributionData).map((key) => {
    const pct = sizeDistributionData[key] || 0;
    // Logic: Higher percentage = more intense color
    // We use RGBA to vary the "Alpha" (opacity) based on impact
    if (pct > 25) {
      // Critical Impact (Solid)
      return "rgba(11, 180, 149, 1.0)";
    }
    if (pct > 10) {
      // High Impact
      return "rgba(17, 182, 152, 0.8)";
    }
    if (pct > 1) {
      // Minor Impact
      return "rgba(44, 205, 175, 0.5)";
    }
    // Low Impact (Pale)
    return "rgba(0, 205, 168, 0.25)";
  });

  const hoverColors = backgroundColors.map((color) => {
    // If it's already solid (1.0), shift to darker RGB
    if (color.includes("1.0")) {
      return "rgba(9, 140, 116, 1.0)";
    }
    // For others, just bump the opacity to 1.0
    return color.replace(/[\d.]+\)$/g, "1.0)");
  });

  // SHARED CONFIGURATION
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: !isMobile,
    aspectRatio: isMobile ? 1.2 : 2, // Higher number = wider chart
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
        // If isMobile is true, display is false. Otherwise, it's true.
        display: (context) => !isMobile,
        anchor: "end",
        align: "top",
        color: textColor,
        font: { size: 14, weight: "600" },
        formatter: (value) => {
          if (value >= 1000000) {
            return (value / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
          }
          if (value >= 1000) {
            return (value / 1000).toFixed(1).replace(/\.0$/, "") + "k";
          }
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

  // ---------------------------------------------------------
  // CHART 1: Size Distribution (Update or Create)
  // ---------------------------------------------------------
  const sizeData = {
    labels: Object.keys(companyDistributionData).map((key) =>
      getBucketLabel(key),
    ),
    datasets: [
      {
        label: "Number of Companies",
        data: Object.values(companyDistributionData),
        backgroundColor: backgroundColors,
        borderColor: "#0bb495",
        borderWidth: 2,
        borderRadius: 6,
        hoverBackgroundColor: hoverColors,
        pointHitRadius: isMobile ? 15 : 5,
      },
    ],
  };

  if (sizeChartInst) {
    sizeChartInst.data = sizeData;
    sizeChartInst.update();
  } else {
    sizeChartInst = new Chart(ctxSize, {
      type: "bar",
      data: sizeData,
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
              label: (ctx) => {
                const bucketKey = Object.keys(companyDistributionData)[
                  ctx.dataIndex
                ];
                const count = ctx.parsed.y;
                const pct = sizeDistributionData[bucketKey] || 0;
                return [
                  ` Companies: ${count}`,
                  ` Market Share: ${pct}% of total workforce`,
                ];
              },
            },
          },
        },
      },
    });
  }

  // ---------------------------------------------------------
  // CHART 2: Public vs Private Split (Update or Create)
  // ---------------------------------------------------------
  const ownershipDataArr = [
    marketSnapshot.ownership_split.public_emp_pct,
    marketSnapshot.ownership_split.private_emp_pct,
  ];

  if (ownershipChartInst) {
    ownershipChartInst.data.datasets[0].data = ownershipDataArr;
    ownershipChartInst.update();
  } else {
    ownershipChartInst = new Chart(ctxOwnership, {
      type: "doughnut",
      data: {
        labels: ["Publicly listed Companies", "Privately owned Companies"],
        datasets: [
          {
            data: ownershipDataArr,
            backgroundColor: ["#0bb495", "#38bdf8"],
            spacing: 5,
            hoverOffset: 10,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        layout: { padding: 30 },
        plugins: {
          datalabels: {
            display: true,
            color: textColor,
            font: { size: 14, weight: "bold" },
            formatter: (value) => value + "%",
            anchor: "center",
            align: "center",
            textStrokeColor: "rgba(0, 0, 0, 0.3)",
            textStrokeWidth: 1,
          },
          legend: { position: "top", labels: { color: textColor } },
          title: {
            display: true,
            text: "EMPLOYMENT SHARE: PUBLIC VS PRIVATE",
            color: accentColor,
          },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                `${ctx.raw}% of total workforce employed in ${ctx.label}`,
            },
          },
        },
      },
    });
  }

  // ---------------------------------------------------------
  // CHART 3: Employment Trend (Update or Create)
  // ---------------------------------------------------------
  const hybridData = getHybridTrendData(employmentTrendData);
  const trendDataObj = {
    labels: hybridData.map((item) => item.d),
    datasets: [
      {
        data: hybridData.map((item) => item.ma),
        fill: true,
        backgroundColor: trendGrad,
        borderColor: "#0bb495",
        borderWidth: 2,
        borderRadius: 6,
        pointRadius: isMobile ? 2 : 5,
        pointHoverRadius: 7,
        pointBackgroundColor: "#025b4b",
        tension: 0.4,
        pointHitRadius: isMobile ? 15 : 5,
        segment: {
          borderDash: (ctx) =>
            hybridData[ctx.p1DataIndex].isAggregated ? [5, 5] : [],
        },
      },
    ],
  };

  if (trendChartInst) {
    trendChartInst.data = trendDataObj;
    // Update tooltip callbacks to ensure they reference the latest hybridData array
    trendChartInst.options.plugins.tooltip.callbacks.title = (items) => {
      const item = hybridData[items[0].dataIndex];
      return item.isAggregated ? `Period: ${item.d}` : `Date: ${item.d}`;
    };
    trendChartInst.options.plugins.tooltip.callbacks.label = (ctx) => {
      const item = hybridData[ctx.dataIndex];
      const prefix = item.isAggregated ? "Avg. Employed" : "Total Employed";
      const changeText = item.chg >= 0 ? `(+${item.chg}%)` : `(${item.chg}%)`;
      return ` ${prefix}: ${IN_Format.format(ctx.parsed.y)} ${changeText}`;
    };
    trendChartInst.update();
  } else {
    trendChartInst = new Chart(ctxTrend, {
      type: "line",
      data: trendDataObj,
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
              title: (items) => {
                const item = hybridData[items[0].dataIndex];
                return item.isAggregated
                  ? `Period: ${item.d}`
                  : `Date: ${item.d}`;
              },
              label: (ctx) => {
                const item = hybridData[ctx.dataIndex];
                const prefix = item.isAggregated
                  ? "Avg. Employed"
                  : "Total Employed";
                const changeText =
                  item.chg >= 0 ? `(+${item.chg}%)` : `(${item.chg}%)`;
                return ` ${prefix}: ${IN_Format.format(ctx.parsed.y)} ${changeText}`;
              },
            },
          },
        },
      },
    });
  }
  updateMomentumUI(marketSnapshot.aggregate_momentum);
}

function updateMomentumUI(momentum) {
  // If you have a div for this, you can inject the comparison directly
  const container = document.getElementById("momentumStats");
  if (!container) {
    return;
  }

  const pub = momentum.public_avg_30d_chg;
  const priv = momentum.private_avg_30d_chg;
  if (pub && pub > 0 && priv && priv > 0) {
    container.innerHTML = `
        <div class="momentum-card" style="text-align: center;">
            <span>Public Market Momentum: <strong>${pub > 0 ? "+" : ""}${pub}%</strong></span>
            <span>Private Market Momentum: <strong>${priv > 0 ? "+" : ""}${priv}%</strong></span>
        </div>
    `;
  }
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
    const tryRender = () => {
      // If both data arrays have content, render the charts
      if (
        employmentTrendData.length > 0 &&
        Object.keys(sizeDistributionData).length > 0
      ) {
        requestAnimationFrame(() => {
          try {
            renderMarketCharts();
          } catch (e) {
            console.error("Charts failed to load:", e);
          }
        });
      } else {
        // Otherwise, wait 3s and check again
        setTimeout(tryRender, 3000);
      }
    };
    tryRender();
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
}

// =========================================================================
// INLINE WEB WORKER CREATION
// =========================================================================
const workerLogic = `
  // Helper functions scoped to the worker
  function normalizeEmployeeSize(countStr) {
    const count = parseInt(countStr.replace(/,/g, ""), 10);
    if (isNaN(count) || count <= 0) return { display: "-", rank: 0 };
    if (count < 10) return { display: "1-10", rank: 10 };
    const magnitude = Math.pow(10, Math.floor(Math.log10(count)));
    let rounded = Math.floor(count / magnitude) * magnitude;
    if (count >= 50 && count < 100) rounded = 50;
    return { display: rounded.toLocaleString() + "+", rank: count };
  }

  function getGrowthTitle(item) {
    const parts = [];
    if (item["Δ_10d"] !== null && item["Δ_10d"] !== undefined) parts.push("Δ10d: " + item["Δ_10d"] + "%");
    if (item["Δ_30d"] !== null && item["Δ_30d"] !== undefined) parts.push("Δ30d: " + item["Δ_30d"] + "%");
    if (item["Δ_90d"] !== null && item["Δ_90d"] !== undefined) parts.push("Δ90d: " + item["Δ_90d"] + "%");
    if (item["Δ_365d"] !== null && item["Δ_365d"] !== undefined) parts.push("Δ1yr: " + item["Δ_365d"] + "%");
    return parts.length > 0 ? "Growth Trend = " + parts.join("  |  ") : "";
  }

  self.onmessage = async function(e) {
    if (e.data && e.data.command === "start") {
      try {
      console.log("Worker: URL is ->", e.data.url);
        // The worker fetches the file, totally bypassing the Main Thread
        // Fetch the full URL passed from the main thread
        const response = await fetch(e.data.url);
        console.log("Worker: Response status is ->", response.status);
        if (!response.ok) {
          throw new Error("HTTP Error: " + response.status);
        }
        const data = await response.json();
        console.log("Worker: Successfully downloaded " + data.length + " items!");
        
        const processedData = [];

        data.forEach((item) => {
          // Data Quality Gate: Ignore row if BOTH critical fields are missing
          if (!item.emp_count && !item.website && !item.ln_count) {
            return;
          }
          if ("active" in item && item.active === false) {
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

          let domain = "-";
          let linkedin_link = "#";
          let status = item.public ? "Public" : "Private";

          try {
            if (item.website) domain = new URL(item.website).hostname.replace("www.", "");
            if (item.linkedin) linkedin_link = item.linkedin.split("?")[0];
          } catch (error) {}

          // PRE-CALCULATE DATES (Saves Main Thread 10k+ new Date() calls)
          let displayDate = "-";
          let fullTimestamp = "";
          if (item.last_updated) {
            const dateObj = new Date(item.last_updated);
            displayDate = dateObj.toLocaleDateString();
            fullTimestamp = dateObj.toLocaleString();
          }

          // PRE-CALCULATE TOOLTIPS
          const tooltipText = getGrowthTitle(item);

          processedData.push({
            ...item,
            displayCount,
            sortRank,
            domain,
            linkedin_link,
            status,
            displayDate,
            fullTimestamp,
            tooltipText
          });
        });

        // Send the finished array back to the Main Thread
        self.postMessage({ success: true, processedData });
      } catch (error) {
        self.postMessage({ success: false, error: error.message });
      }
    }
  };
`;

function loadData() {
  const tableBody = document.getElementById("tableBody");

  const handleSwipe = (touchstartX, touchendX, table) => {
    const info = table.page.info();
    const distance = touchendX - touchstartX;
    const minSwipeDistance = 50;

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

  // Convert the worker string into a Blob URL
  const blob = new Blob([workerLogic], { type: "application/javascript" });
  const workerUrl = URL.createObjectURL(blob);
  const dataWorker = new Worker(workerUrl);

  // Tell the worker to start fetching and processing
  // Calculate the exact, full URL based on the current page's location
  const absoluteUrl = new URL("company_data.json", document.baseURI).href;
  console.log(absoluteUrl);
  // Send the command AND the full URL to the worker
  dataWorker.postMessage({
    command: "start",
    url: absoluteUrl,
  });

  // Listen for the completed data
  dataWorker.onmessage = function (event) {
    if (!event.data.success) {
      // Handle Worker Error
      console.error("Worker Error:", event.data.error);
      tableBody.innerHTML = `<tr><td colspan="6" class="error"><br><strong>⚠️ Error loading data:</strong><br> ${event.data.error}.<br><br> Please refresh or try again later!</td></tr>`;
      loadingSpinner.classList.add("spinner-hidden");
      loadingSpinner.style.display = "none";
      const dataTableWrapper = document.querySelector(".table-card");
      dataTableWrapper.style.display = "block";
      dataTableWrapper.style.opacity = 1;
      return;
    }

    const processedData = event.data.processedData;

    // Custom search function updated to read directly from the row data
    $.fn.dataTable.ext.search.push(function (settings, searchData, dataIndex) {
      const selectedRange = $("#empFilter").val();
      if (!selectedRange) {
        return true;
      }

      // Read the pre-processed sortRank from the underlying data object
      const rowData = settings.aoData[dataIndex]._aData;
      const sortRank = rowData.sortRank || 0;
      const [min, max] = selectedRange.split("-").map(Number);

      if (isNaN(max)) {
        return sortRank >= min; // Handle "500+" cases
      }
      return sortRank >= min && sortRank <= max; // Handle "50-100" cases
    });

    // DataTable Initialization
    requestAnimationFrame(() => {
      const table = $("#companyTable").DataTable({
        data: processedData, // Direct Array Injection
        deferRender: true, // Critical Optimization for 10k+ rows
        responsive: true,
        pageLength: 10,
        order: [[1, "desc"]],
        fixedHeader: true,
        autoWidth: false,
        dom: '<"top-wrapper"lf>rtip',
        language: {
          search: isMobile ? "" : "Search",
          searchPlaceholder: isMobile
            ? "Search Companies"
            : "Search Companies   [ / ]",
          lengthMenu: "Show _MENU_ companies",
          info: "Showing _START_ to _END_ of _TOTAL_ companies",
        },
        columns: [
          {
            // Name Column
            data: null,
            render: function (data, type, row) {
              const name = `<strong title="${row.name}">${row.name}</strong>`;
              const mobileName = row.website
                ? `<a href="${row.website}" class="mobile-only-link" target="_blank" alt="${row.name} website" title="${row.name}">${row.name}</a>`
                : `<span title="${row.name}">${row.name}</span>`;
              return isMobile ? mobileName : name;
            },
          },
          {
            // Employee Count Column (Sorts by sortRank, Displays formatted HTML)
            data: "sortRank",
            render: function (data, type, row) {
              if (type === "display" || type === "filter") {
                // uses the pre-calculated tooltip string
                const sparklineHtml = row.sparkline
                  ? `<div class="sparkline-wrapper" title="${row.tooltipText}">${row.sparkline}</div>`
                  : ``;
                return `<div class="emp-cell"><span>${row.displayCount}</span>${sparklineHtml}</div>`;
              }
              return data;
            },
          },
          {
            // Website Domain Column
            data: "domain",
            render: function (data, type, row) {
              return row.website
                ? `<a href="${row.website}" class="desktop-only-link" target="_blank" alt="${row.name} website">${data}</a>`
                : "-";
            },
          },
          {
            // LinkedIn Column
            data: "linkedin_link",
            className: "text-center",
            render: function (data, type, row) {
              return getLinkedInIcon(data, `${row.name} linkedin page`);
            },
          },
          {
            // Public/Private Status Column
            data: "status",
            className: "text-center",
            render: function (data, type, row) {
              // Allows textual searching by "Public" or "Private"
              if (type === "filter" || type === "sort") {
                return data;
              }
              return getStatusIcon(row.public, row.ticker);
            },
          },
          {
            // Last Updated Column
            data: "last_updated",
            render: function (data, type, row) {
              if (!data) {
                return "-";
              }
              // Uses the pre-calculated date strings
              return `<span title="${row.fullTimestamp}">${row.displayDate}</span>`;
            },
          },
        ],
        initComplete: function () {
          const api = this.api();

          // Create the Range-Based Dropdown
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

          // Inject into the DOM
          $(".dataTables_length").after(filterHtml);

          // Trigger Redraw on Change
          $(document).on("change", "#empFilter", function () {
            api.draw(); // This triggers the $.fn.dataTable.ext.search.push function above
          });

          // Fixed Header Adjust
          setTimeout(() => {
            api.fixedHeader.adjust();
          }, 150);
        },
      });

      // --- KEYBOARD NAVIGATION ---
      $(document).on("keydown", function (e) {
        // IGNORE if Ctrl, Alt, Shift, or Command(Meta) are pressed
        if (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) {
          return;
        }

        const searchInput = $("input[type='search']");
        const modalOpen = document.querySelector(".modal.show");

        // HANDLE "/" KEY (Focus Search)
        if (e.key === "/" && !modalOpen) {
          e.preventDefault();
          searchInput.focus();
          searchInput.select();
          return;
        }

        // HANDLE "ESCAPE" KEY (Clear Search)
        if (e.key === "Escape") {
          // If a modal is open, let setupModals listener handle it
          if (modalOpen) {
            return;
          }

          // If search has text, clear it and blur
          if (table.search() !== "" || searchInput.val() !== "") {
            e.preventDefault();
            searchInput.val("");
            table.search("").draw();
          }
          // Remove focus from the search box!
          searchInput.blur();
          return;
        }

        // IGNORE if typing in an input
        if ($(e.target).is("input, textarea, .select2-search__field")) {
          return;
        }

        // ARROW & NUMBER NAVIGATION
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
      const tableContainer = document.getElementById("companyTable");

      tableContainer.addEventListener(
        "touchstart",
        (e) => {
          touchstartX = e.changedTouches[0].screenX;
        },
        { passive: true },
      );
      tableContainer.addEventListener(
        "touchend",
        (e) => {
          touchendX = e.changedTouches[0].screenX;
          handleSwipe(touchstartX, touchendX, table);
        },
        { passive: true },
      );

      // Show UI
      loadingSpinner.classList.add("spinner-hidden");
      loadingSpinner.addEventListener(
        "transitionend",
        () => {
          loadingSpinner.style.display = "none";
        },
        { once: true },
      );
      const dataTableWrapper = document.querySelector(".table-card");
      dataTableWrapper.style.display = "block";
      dataTableWrapper.style.opacity = 1;

      // Clean up worker memory
      dataWorker.terminate();
      URL.revokeObjectURL(workerUrl);
    });
  };
}

// Call this inside your DOMContentLoaded or init function
document.addEventListener("DOMContentLoaded", () => {
  setupModals();
  fetchTrendData();
  loadData();

  // Trigger initial check for hash
  handleHashChange();
});
