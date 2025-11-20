/**
 * =======================================================================
 * Resource Loader and Fallback Utility
 * -----------------------------------------------------------------------
 * Provides functions to dynamically load external CSS and JavaScript
 * resources from a list of fallback URLs, ensuring high availability
 * (e.g., CDN 1 -> CDN 2 -> etc).
 * =======================================================================
 */

// =======================================================================
// === 1. RESOURCE CONFIGURATION =========================================
// =======================================================================

const RESOURCES_CONFIG = {
  JQUERY_JS: {
    type: "script",
    globalCheck: "jQuery",
    urls: [
      "https://code.jquery.com/jquery-3.7.1.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js",
      "https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js",
      "https://unpkg.com/jquery@3.7.1/dist/jquery.min.js",
    ],
  },
  DATATABLES_JS: {
    type: "script",
    globalCheck: "jQuery.fn.dataTable",
    urls: [
      "https://cdn.datatables.net/2.3.5/js/dataTables.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/datatables.net/2.3.4/dataTables.min.js",
      "https://cdn.jsdelivr.net/npm/datatables.net@2.3.5/js/dataTables.min.js",
      "https://unpkg.com/datatables.net@2.3.5/js/dataTables.min.js",
    ],
  },
  SELECT2_JS: {
    type: "script",
    // No simple global check; relies on successful execution after jQuery is loaded.
    urls: [
      "https://cdnjs.cloudflare.com/ajax/libs/select2/4.1.0-rc.0/js/select2.min.js",
      "https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js",
      "https://unpkg.com/select2@4.1.0-rc.0/dist/js/select2.min.js",
    ],
  },
  CHARTJS_JS: {
    type: "script",
    globalCheck: "Chart",
    urls: [
      "https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js",
      "https://unpkg.com/chart.js@4.5.1/dist/chart.umd.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.5.0/chart.umd.min.js",
    ],
  },
  POPPERJS_JS: {
    type: "script",
    urls: [
      "https://cdnjs.cloudflare.com/ajax/libs/popper.js/2.11.8/umd/popper.min.js",
      "https://unpkg.com/@popperjs/core@2.11.8/dist/umd/popper.min.js",
      "https://cdn.jsdelivr.net/npm/@popperjs/core@2.11.8/dist/umd/popper.min.js",
    ],
  },
  TIPPYJS_JS: {
    type: "script",
    globalCheck: "tippy",
    urls: [
      "https://cdnjs.cloudflare.com/ajax/libs/tippy.js/6.3.7/tippy-bundle.umd.min.js",
      "https://unpkg.com/tippy.js@6.3.7/dist/tippy-bundle.umd.min.js",
      "https://cdn.jsdelivr.net/npm/tippy.js@6.3.7/dist/tippy-bundle.umd.min.js",
    ],
  },
  DATATABLES_CSS: {
    type: "link",
    // No global check possible for CSS.
    urls: [
      "https://cdn.datatables.net/2.3.5/css/dataTables.dataTables.css",
      "https://unpkg.com/datatables.net-dt@2.3.5/css/dataTables.dataTables.css",
      "https://cdn.jsdelivr.net/npm/datatables.net-dt@2.3.5/css/dataTables.dataTables.css",
      "https://cdnjs.cloudflare.com/ajax/libs/datatables.net-dt/2.3.4/css/dataTables.dataTables.css",
    ],
  },
  SELECT2_CSS: {
    type: "link",
    urls: [
      "https://cdnjs.cloudflare.com/ajax/libs/select2/4.1.0-rc.0/css/select2.min.css",
      "https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css",
      "https://unpkg.com/select2@4.1.0-rc.0/dist/css/select2.min.css",
    ],
  },
  TIPPY_CSS_LIGHT: {
    type: "link",
    urls: [
      "https://cdnjs.cloudflare.com/ajax/libs/tippy.js/6.3.7/themes/light-border.min.css",
      "https://cdn.jsdelivr.net/npm/tippy.js@6.3.7/themes/light-border.css",
      "https://unpkg.com/tippy.js@6.3.7/themes/light-border.css",
    ],
  },
  TIPPY_CSS_MATERIAL: {
    type: "link",
    urls: [
      "https://cdnjs.cloudflare.com/ajax/libs/tippy.js/6.3.7/themes/material.min.css",
      "https://cdn.jsdelivr.net/npm/tippy.js@6.3.7/themes/material.css",
      "https://unpkg.com/tippy.js@6.3.7/themes/material.css",
    ],
  },
};

/**
 * Grouped resources to allow parallel loading.
 * Inner arrays load simultaneously. Outer arrays load sequentially.
 */
const LOAD_STAGES = [
  // === STAGE 1: Core Libraries & All CSS (Parallel) ===
  // These start downloading immediately and simultaneously.
  [
    "JQUERY_JS", // Core dependency
    "POPPERJS_JS", // Core dependency (indep of jQuery)
    "CHARTJS_JS", // Independent
    "DATATABLES_CSS", // CSS can always load parallel
    "SELECT2_CSS",
    "TIPPY_CSS_LIGHT",
    "TIPPY_CSS_MATERIAL",
  ],

  // === STAGE 2: Dependent Plugins (Parallel) ===
  // These start only after ALL items in Stage 1 are finished.
  [
    "DATATABLES_JS", // Needs jQuery
    "SELECT2_JS", // Needs jQuery
    "TIPPYJS_JS", // Needs Popper
  ],
];

// =======================================================================
// === 2. HELPER FUNCTIONS ===============================================
// =======================================================================

/**
 * Loads a resource (script or CSS) from a list of URLs with failover logic using Promises.
 * @param {string} type - 'script' or 'link' (for CSS).
 * @param {string[]} urls - Array of URLs to try in sequence.
 * @param {number} timeoutDuration - Timeout per attempt in milliseconds.
 * @returns {Promise<void>} Resolves when resource is loaded or rejects after all attempts fail.
 */
async function loadResourceWithFallback(type, urls, timeoutDuration = 5000) {
  for (const url of urls) {
    try {
      await loadSingleResource(type, url, timeoutDuration);
      console.log(`[SUCCESS] ${type} loaded from: ${url}`);
      return; // Stop after first success
    } catch (err) {
      console.warn(`[FAILOVER] ${type} failed from: ${url}. Trying next...`);
    }
  }
  throw new Error(`All attempts failed for resource type ${type}.`);
}

/**
 * Loads a single resource with timeout.
 * @param {string} type - 'script' or 'link'.
 * @param {string} url - Resource URL.
 * @param {number} timeoutDuration - Timeout in ms.
 * @returns {Promise<void>}
 */
function loadSingleResource(type, url, timeoutDuration) {
  return new Promise((resolve, reject) => {
    const element = document.createElement(type);

    if (type === "script") {
      element.src = url;
      element.async = true;
    } else {
      element.rel = "stylesheet";
      element.href = url;
    }

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout loading ${url}`));
    }, timeoutDuration);

    const cleanup = () => {
      clearTimeout(timeoutId);
      element.onload = null;
      element.onerror = null;
    };

    element.onload = () => {
      cleanup();
      resolve();
    };

    element.onerror = () => {
      cleanup();
      reject(new Error(`Error loading ${url}`));
    };

    document.head.appendChild(element);
  });
}

/**
 * Checks if a global variable exists (supports nested checks like 'jQuery.fn.dataTable').
 * @param {string} globalName - The name of the global variable (e.g., 'jQuery', 'Chart').
 * @returns {boolean}
 */
function isLoaded(globalName) {
  if (!globalName) {
    return true;
  }
  const parts = globalName.split(".");
  let current = window;

  // This loop handles both 'jQuery' and 'jQuery.fn.dataTable' gracefully.
  for (const part of parts) {
    // If the current part does not exist on the current object, the path is broken.
    if (!current || typeof current[part] === "undefined") {
      return false;
    }
    current = current[part];
  }
  return true;
}

/**
 * Loads resources in stages. Items in the same stage load in parallel.
 * @param {function} callback - Called when all stages are complete.
 */
async function startAfterResources(callback) {
  console.log("Starting optimized parallel resource loader...");
  const lastMod = document.getElementById("last-refresh");

  // 1. Initial Status
  if (lastMod) {
    lastMod.textContent = "Loading resources...";
  }

  for (let i = 0; i < LOAD_STAGES.length; i++) {
    const stage = LOAD_STAGES[i];
    console.log(`--- Starting Stage ${i + 1} ---`);

    // 2. Update UI for the current stage
    if (lastMod) {
      lastMod.textContent = `Loading resources... Stage ${i + 1}`;
    }

    // 3. Create an array of promises for this stage
    const promises = stage.map((key) => {
      const config = RESOURCES_CONFIG[key];
      return loadResourceWithFallback(config.type, config.urls)
        .then(() => ({ key, status: "success" }))
        .catch((err) => ({ key, status: "error", error: err }));
    });

    // 4. Wait for EVERYTHING in this stage to finish (Parallel execution)
    const results = await Promise.all(promises);

    // 5. Post-Stage Check: Did anything critical fail?
    for (const result of results) {
      if (result.status === "error") {
        console.error(`[FATAL] Failed to load ${result.key}`);

        // Identify if this is a critical failure
        if (
          ["JQUERY_JS", "DATATABLES_JS", "POPPERJS_JS"].includes(result.key)
        ) {
          if (lastMod) {
            lastMod.textContent = `CRITICAL ERROR: Failed to load ${result.key}. App stopped.`;
          }
          return; // Stop execution
        }
      } else {
        // Check globals if they exist
        const config = RESOURCES_CONFIG[result.key];
        if (config.globalCheck && !isLoaded(config.globalCheck)) {
          console.warn(
            `[WARNING] ${result.key} loaded but global '${config.globalCheck}' not found.`
          );
        }
      }
    }
  }

  console.log("All dependencies processed. Calling main application.");

  callback();
}

// Expose globally
window.startAfterResources = startAfterResources;
