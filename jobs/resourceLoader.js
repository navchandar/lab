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
// <script src="https://unpkg.com/@popperjs/core@2"></script>
// <script src="https://unpkg.com/tippy.js@6"></script>

// <link
//   rel="stylesheet"
//   href="https://cdn.datatables.net/2.3.4/css/dataTables.dataTables.css"
// />

// <link
//   rel="stylesheet"
//   href="https://unpkg.com/tippy.js@6/themes/light.css"
// />
// <link
//   rel="stylesheet"
//   href="https://unpkg.com/tippy.js@6/themes/light-border.css"
// />
// <link
//   rel="stylesheet"
//   href="https://unpkg.com/tippy.js@6/themes/material.css"
// />

// <link rel="stylesheet" href="style.css" />

// <script
//   src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js"
//   integrity="sha512-v2CJ7UaYy4JwqLDIrZUI/4hqeoQieOmAZNXBeQyjo21dadnwR+8ZaIJVT8EE2iyI61OV8e6M8PP2/4hpQINQ/g=="
//   crossorigin="anonymous"
//   referrerpolicy="no-referrer"
// ></script>

// <script src="https://cdn.datatables.net/2.3.4/js/dataTables.js"></script>

// <link
//   href="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css"
//   rel="stylesheet"
// />
// <script src="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js"></script>
// <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

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
 * Defines the order in which resources must be loaded due to dependencies.
 * Critical resources are placed early.
 */
const LOAD_ORDER = [
  "JQUERY_JS", // Must be first
  "DATATABLES_JS", // Depends on JQUERY
  "POPPERJS_JS", // Depends on JQUERY
  "DATATABLES_CSS",
  "SELECT2_JS",
  "SELECT2_CSS",
  "TIPPYJS_JS", // Depends on POPPERJS
  "TIPPY_CSS_LIGHT",
  "TIPPY_CSS_MATERIAL",
  "CHARTJS_JS", // Independent
];

// =======================================================================
// === 2. HELPER FUNCTIONS ===============================================
// =======================================================================

/**
 * Checks for a loaded script by checking a global object it exposes.
 * @param {string} globalName - The name of the global variable (e.g., 'jQuery', 'Chart').
 * @returns {boolean}
 */
function isLoaded(globalName) {
  if (globalName.includes(".")) {
    // Handle nested checks like 'jQuery.fn.dataTable'
    const parts = globalName.split(".");
    let current = window;
    for (const part of parts) {
      if (!current[part]) {
        return false;
      }
      current = current[part];
    }
    return true;
  }
  return !!window[globalName];
}
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
 * @param {string} globalName
 * @returns {boolean}
 */
function isLoaded(globalName) {
  if (!globalName) {
    return true;
  }
  const parts = globalName.split(".");
  let current = window;
  for (const part of parts) {
    if (!current[part]) {
      return false;
    }
    current = current[part];
  }
  return true;
}

/**
 * Sequentially loads resources based on LOAD_ORDER.
 * @param {function} callback - Called when all resources are loaded.
 */
async function startAfterResources(callback) {
  for (const key of LOAD_ORDER) {
    const config = RESOURCES_CONFIG[key];
    const isCritical = key === "JQUERY_JS" || key === "DATATABLES_JS";

    try {
      await loadResourceWithFallback(config.type, config.urls);
      if (config.globalCheck && !isLoaded(config.globalCheck)) {
        console.error(
          `[WARNING] ${key} loaded but global check failed (${config.globalCheck}).`
        );
      }
    } catch (err) {
      console.error(`[FATAL ERROR] Failed to load resource: ${key}.`, err);
      if (isCritical) {
        const msg = `CRITICAL ERROR: Failed to load ${key}. Cannot load application!`;
        document.getElementById("last-refresh").textContent = msg;
        // Stop execution for critical failure
        return;
      }
    }
  }

  console.log("All dependencies processed. Calling main application.");
  callback();
}

// Expose globally
window.startAfterResources = startAfterResources;
