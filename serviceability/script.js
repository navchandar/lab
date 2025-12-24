// GLOBAL VARIABLES
let currentOverlay = null;
let mapBounds = null;
let brandColors = {};
let brandShortcuts = {};
// Tracks the currently active service name to prevent image swapping race conditions
let activeServiceRequest = null;
let isLayerSwitching = false;
let globalTimestamp = new Date().getTime();
// Global Search Cache local storage
const CACHE_KEY_PREFIX = "geo_cache_";
const CACHE_EXPIRY_DAYS = 7; // Expire cache after 1 week

// --- HYBRID MAP VARIABLES ---
let dotLayer = null;
let rawServiceData = []; // Stores the raw JSON points [lat, lng]
let isHighZoom = false;
const ZOOM_THRESHOLD = 11; // Zoom level to switch from Image -> Dots

// cache leaflet image layers
const layerCache = new Map();
const MAX_CACHE_SIZE = 5;

// --- URL STATE MANAGEMENT ---
const UrlState = {
  get: (key) => {
    const params = new URLSearchParams(window.location.search);
    return params.get(key);
  },
  set: (key, value) => {
    const url = new URL(window.location);
    if (value) {
      url.searchParams.set(key, value);
    } else {
      url.searchParams.delete(key);
    }
    // Update URL without reloading the page
    window.history.replaceState({}, "", url);
  },
};

// Display TOAST NOTIFICATION
function showToast(message, isError = false) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast-notification";
    document.body.appendChild(toast);
  }

  // Clear existing Auto-Hide timers
  if (toast.timer) {
    clearTimeout(toast.timer);
  }
  if (toast.animationTimer) {
    clearTimeout(toast.animationTimer);
  }

  // Helper function to actually update DOM and show
  const display = () => {
    toast.textContent = message;
    if (isError) {
      toast.classList.add("error");
    } else {
      toast.classList.remove("error");
    }
    // Trigger Reflow (Reset CSS animation capability)
    void toast.offsetWidth;
    toast.classList.add("show");
    // Set new Auto-Hide timer
    toast.timer = setTimeout(() => {
      toast.classList.remove("show");
    }, 3500);
  };

  // If visible, hide first. If hidden, show immediately.
  if (toast.classList.contains("show")) {
    toast.classList.remove("show");
    toast.animationTimer = setTimeout(() => {
      display();
    }, 300);
  } else {
    display();
  }
}

function hideToast() {
  const toast = document.getElementById("toast");
  if (toast && toast.classList.contains("show")) {
    toast.classList.remove("show");
  }
}

// CRITICAL DEPENDENCY CHECK: Is Leaflet Loaded?
if (typeof L === "undefined") {
  // If Leaflet didn't load, we can't render anything.
  document.body.innerHTML = `
        <div class="no-leaflet-error">
            <h2>Map Library Failed to Load</h2>
            <p>Please check your internet connection and refresh the page.</p>
            <button onclick="location.reload()" class="refresh-button">Refresh</button>
        </div>
    `;
  throw new Error("Leaflet JS is not loaded. Script aborted.");
}

// NETWORK STATUS CHECK
window.addEventListener("offline", () => {
  showToast("You seem to offline. Map may not load.", true);
});
window.addEventListener("online", () => {
  setTimeout(() => {
    showToast("You are back offline!", false);
    hideToast();
  }, 2000);
});

// MAP INSTANCE SETUP
const defaultLocation = [22.5937, 78.9629];
const Zoom = { zoomControl: false };
const map = L.map("map", Zoom).setView(defaultLocation, 5);
L.control.zoom({ position: "bottomright" }).addTo(map);

// Define custom Canvas Renderer Globally
const MaskedCanvas = L.Canvas.extend({
  // Store the overlay reference
  setMask: function (imageOverlay) {
    this._maskOverlay = imageOverlay;
  },

  // Override the main draw loop
  _update: function () {
    // 1. Run the standard Leaflet drawing (draws the dots)
    L.Canvas.prototype._update.call(this);

    // 2. Apply the Mask
    if (this._maskOverlay && this._map && this._bounds) {
      const imgElement = this._maskOverlay.getElement();

      // Safety checks: Image must be loaded and visible in DOM
      if (imgElement && imgElement.complete && imgElement.naturalWidth > 0) {
        this._ctx.save();

        // --- CALCULATE COORDINATES ---
        const bounds = this._maskOverlay.getBounds();
        const topLeft = this._map.latLngToLayerPoint(bounds.getNorthWest());
        const bottomRight = this._map.latLngToLayerPoint(bounds.getSouthEast());
        const offset = this._bounds.min;

        // Local coordinates relative to the Canvas
        const localX = topLeft.x - offset.x;
        const localY = topLeft.y - offset.y;
        const width = bottomRight.x - topLeft.x;
        const height = bottomRight.y - topLeft.y;

        // --- STEP 1: Fine-Grained Masking (Inside the Image) ---
        // Keep dots only where the WebP image is opaque (Land)
        this._ctx.globalCompositeOperation = "destination-in";
        this._ctx.drawImage(imgElement, localX, localY, width, height);

        // --- STEP 2: Global Cleanup (Outside the Image) ---
        // We must strictly remove dots that are outside the image boundaries.
        // We use 'destination-out' to act as an eraser.
        this._ctx.globalCompositeOperation = "destination-out";

        this._ctx.beginPath();
        // A. Define the Whole Canvas (Outer Box)
        this._ctx.rect(0, 0, this._ctx.canvas.width, this._ctx.canvas.height);
        // B. Define the Image Area (Inner Box)
        this._ctx.rect(localX, localY, width, height);

        // C. Fill using "evenodd" rule
        // This fills the space BETWEEN the Outer Box and Inner Box (The "Donut" shape)
        // effectively erasing everything outside the map image.
        this._ctx.fill("evenodd");

        // Restore normal drawing mode
        this._ctx.restore();
      }
    }
  },
});

// Initialize your renderer with this new class
const myCanvasRenderer = new MaskedCanvas();

// --- TILE LAYER SETUP ---
function setupMapTiles(mapInstance) {
  // Define multiple map providers for redundancy
  const PROVIDERS = [
    {
      name: "CartoDB Light",
      url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      options: {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 19,
      },
    },
    {
      name: "Esri World Gray",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      options: {
        attribution: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ",
        //  Esri stops at 16. This tells Leaflet to stretch zoom 16 tiles
        // if the user zooms in deeper, avoiding blank screens.
        maxNativeZoom: 16,
        maxZoom: 19,
      },
    },
  ];

  let currentLayer = null;
  let activeIndex = 0;
  let errorCount = 0;
  const ERROR_THRESHOLD = 5;

  function loadLayer(index) {
    if (index >= PROVIDERS.length) {
      return;
    }

    const provider = PROVIDERS[index];
    console.log(`Setting map provider to: ${provider.name}`);

    // 1. Remove the old layer (Clean up previous tiles/settings)
    if (currentLayer) {
      mapInstance.removeLayer(currentLayer);
    }

    // 2. Create the new layer
    currentLayer = L.tileLayer(provider.url, provider.options);

    // 3. Attach Error Logic
    currentLayer.on("tileerror", () => {
      // Check if user is offline. If so, do not count this as a server error.
      if (!navigator.onLine) {
        console.warn("Tile load failed, because device is offline.");
        return;
      }
      // if tile load fails even if device is online, then count and switch map providers
      errorCount++;
      if (errorCount > ERROR_THRESHOLD) {
        // Only switch if we haven't exhausted providers
        if (activeIndex < PROVIDERS.length - 1) {
          console.warn("Provider failing. Switching...");
          showToast("Map server slow. Switching provider...", true);

          errorCount = 0; // Reset counter for the new provider
          activeIndex++; // Move to next
          loadLayer(activeIndex);
        }
      }
    });

    // 4. Attach Self-Healing Logic
    // If a tile loads successfully, reset the counter.
    // This prevents a switch if we just had 5 random errors over 30 minutes.
    currentLayer.on("tileload", () => {
      if (errorCount > 0) {
        errorCount = 0;
      }
    });

    // 5. Add to map
    currentLayer.addTo(mapInstance);
  }

  // Initial Load
  loadLayer(0);
}

// Helper: Capitalize first letter
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// --- Format and Display Time ---
function updateFooterTime(isoString) {
  const footerEl = document.getElementById("last-refresh");
  if (!footerEl || !isoString) {
    return;
  }

  try {
    // Create Date object (Automatically converts UTC to User's Local Time)
    const date = new Date(isoString);

    // Format it nicely: "08 Dec"
    const formatted = new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date);

    footerEl.textContent = `Last refreshed: ${formatted}`;
  } catch (e) {
    console.warn("Could not parse date:", e);
  }
}
// Toggle function
const toggleSheet = () => {
  const card = document.getElementById("bottom-sheet");
  if (card) {
    card.classList.toggle("collapsed");
  }
};
const collapseSheet = () => {
  const card = document.getElementById("bottom-sheet");
  if (card) {
    card.classList.add("collapsed");
  }
};

// --- Save to LocalStorage ---
function saveToCache(query, data) {
  try {
    const record = {
      timestamp: Date.now(),
      data: data,
    };
    // Save to LocalStorage (Persists after refresh)
    localStorage.setItem(CACHE_KEY_PREFIX + query, JSON.stringify(record));
  } catch (e) {
    console.warn("LocalStorage full or disabled", e);
  }
}

// --- Read from LocalStorage ---
function getFromCache(query) {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + query);
    if (!raw) {
      return null;
    }

    const record = JSON.parse(raw);

    // Check Expiry (Time in milliseconds)
    const ageInMs = Date.now() - record.timestamp;
    const maxAgeInMs = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    if (ageInMs > maxAgeInMs) {
      // Delete old data and return null to force a new network fetch
      localStorage.removeItem(CACHE_KEY_PREFIX + query);
      return null;
    }

    return record.data;
  } catch (e) {
    return null;
  }
}

// --- BOTTOM SHEET LOGIC for mobile ---
function initBottomSheet() {
  const card = document.getElementById("bottom-sheet");
  const header = document.getElementById("card-header");
  const btn = document.getElementById("search-btn");
  const mapEl = document.getElementById("map");

  // Click Header to Toggle
  header.addEventListener("click", toggleSheet);

  // Click Drag Handle to Toggle
  const handle = document.querySelector(".drag-handle");
  if (handle) {
    handle.addEventListener("click", toggleSheet);
  }

  // Collapse on clicking on map
  if (window.innerWidth <= 600) {
    if (btn) {
      btn.addEventListener("click", collapseSheet);
    }

    if (mapEl) {
      mapEl.addEventListener("click", (e) => {
        e.stopPropagation();
        collapseSheet();
      });
      mapEl.addEventListener(
        "touchstart",
        (e) => {
          e.stopPropagation();
          collapseSheet();
        },
        { passive: true }
      );
    }
  }

  // Auto-Collapse logic after initial load after 1.5 seconds
  // so the user sees the options, then we slide it down
  setTimeout(() => {
    // Only collapse if we are on mobile (screen width < 600px)
    if (window.innerWidth <= 600) {
      collapseSheet();
    }
  }, 1500);
}

// MAIN INITIALIZATION
async function initApp() {
  try {
    // Load Data & Bounds in parallel
    const timestamp = new Date().getTime();
    const response = await fetch(`maps/bounds.json?t=${timestamp}`);

    if (!response.ok) {
      throw new Error("Failed to load map data files.");
    }

    const boundsData = await response.json();
    globalTimestamp = new Date(boundsData.lastUpdated).getTime();

    // Store global data
    mapBounds = [boundsData.southWest, boundsData.northEast];
    brandColors = boundsData.colors || {};
    brandShortcuts = boundsData.shortcuts || {};
    updateFooterTime(boundsData.lastUpdated);

    // Get the list of what is actually available
    const availableServices = boundsData.services || [];
    // Generate Radio Buttons
    generateControls(availableServices);

    // Initialize Search Logic
    const searchFn = initSearch();

    // --- RESTORE STATE FROM URL ---
    // Check for 'service' param
    let savedService = UrlState.get("service");
    // If we have services, but the URL is empty or incorrect
    if (availableServices.length > 0) {
      if (!savedService || !availableServices.includes(savedService)) {
        if (
          savedService &&
          savedService !== "" &&
          !availableServices.includes(savedService)
        ) {
          showToast(`${savedService.toUpperCase()} is not available`, true);
          console.warn(
            `${savedService} is not available in ${availableServices}`
          );
        }
        // Select the first available item
        savedService = availableServices[0];
        // Update the URL immediately
        UrlState.set("service", savedService);
        console.log(`URL reset to default service: ${savedService}`);
      }
    }

    // Select the radio button
    if (savedService) {
      // Try to select the radio button
      const input = document.querySelector(`input[value="${savedService}"]`);
      if (input) {
        input.checked = true;
        // Remove 'selected-card' class from other elements
        input.parentNode.parentNode
          .querySelectorAll(".radio-card")
          .forEach((c) => c.classList.remove("selected-card"));
        // Add to only the checked one
        input.parentNode.classList.add("selected-card");
      } else {
        console.warn(`Radiobutton for ${savedService} not found in the UI`);
      }
    }

    // Load map layer (will use the checked input)
    updateMapLayer();

    initBottomSheet();

    // Check for 'q' (query/location) param
    const savedQuery = UrlState.get("q");
    if (savedQuery && searchFn) {
      const input = document.getElementById("location-search");
      if (input) {
        input.value = savedQuery;
        // Execute search after 1s for the map to render tiles
        setTimeout(() => {
          searchFn(savedQuery);
        }, 1000);
      }
    }

    // Preload others after a short delay
    if ("requestIdleCallback" in window) {
      // Run when the browser is idle
      requestIdleCallback(() => {
        preloadRemainingLayers(boundsData.services);
      });
    } else {
      // Fallback for older browsers
      setTimeout(() => {
        preloadRemainingLayers(boundsData.services);
      }, 3000);
    }

    // --- EVENT LISTENERS FOR HYBRID MAP ---
    // Zoom Logic (Decide between Dots or Image)
    map.on("zoom", handleZoomChange);

    // Move Logic (Update visible dots when zoom in)
    map.on("moveend", () => {
      if (isHighZoom) {
        renderVisibleDots();
      }
    });

    // Animation Logic (For Image Overlay)
    map.on("zoomstart", () => {
      if (isLayerSwitching) {
        return;
      }
      // Only remove smooth class if the image is actually visible
      if (!isHighZoom && currentOverlay && currentOverlay.getElement()) {
        currentOverlay.getElement().classList.remove("smooth-layer");
      }
    });

    map.on("zoomend", () => {
      // Add it back after zooming finishes
      if (!isHighZoom && currentOverlay && currentOverlay.getElement()) {
        currentOverlay.getElement().classList.add("smooth-layer");
      }
    });
  } catch (error) {
    console.error("Initialization failed:", error);
    showToast("Error loading map data. Please try refreshing.", true);
  }
}

// Function to Generate HTML
function generateControls(servicesList) {
  if (!servicesList || servicesList.length === 0) {
    console.warn(`No services found: ${servicesList}`);
    return;
  }

  const bottomSheet = document.getElementById("bottom-sheet");
  const container = document.getElementById("options-container");
  container.innerHTML = "";

  // Get partners from the list
  servicesList.forEach((partner, index) => {
    const label = document.createElement("label");
    label.className = "radio-card";
    // Default to first item checked, UNLESS URL overrides it later in initApp
    const isDefault = index === 0;
    const isChecked = isDefault ? "checked" : "";

    // Get color for this partner (Default green if missing)
    const color = brandColors[partner] || "#2ecc71";
    label.style.setProperty("--brand-color", color);

    // --- Add the Visual Hint ---
    // Only generate the keyboard shortcut hint span if a key exists
    const shortcutKey = brandShortcuts[partner];
    const s = shortcutKey ? shortcutKey.toUpperCase() : "";
    const hintHtml = shortcutKey
      ? `<span title="Keyboard shortcut: ${s}" class="shortcut-hint">${s}</span>`
      : "";

    // Only add data-shortcut attribute if a key exists
    const dataAttribute = shortcutKey
      ? `data-shortcut="${shortcutKey.toLowerCase()}"`
      : "";

    label.innerHTML = `
            <input 
                type="radio" 
                name="service" 
                value="${partner}" 
                ${isChecked}
                ${dataAttribute}
            >
            <div class="card-content">
                <span class="service-name">${capitalize(partner)}</span>
                ${hintHtml}
            </div>
        `;

    // Standard Change Listener
    const input = label.querySelector("input");
    input.addEventListener("change", () => {
      // Remove 'selected-card' class from ALL radio cards in this container
      container
        .querySelectorAll(".radio-card")
        .forEach((c) => c.classList.remove("selected-card"));

      // Update URL when user clicks and update Map layer
      UrlState.set("service", partner);
      updateMapLayer();

      // Add 'selected-card' class to THIS card
      label.classList.add("selected-card");
      // collapse the card after selection on mobile
      if (window.innerWidth <= 600) {
        collapseSheet();
      }
      focusMap();
    });

    container.appendChild(label);
  });

  // --- EVENT LISTENER: Handle Key Presses ---
  // Ensure we don't add the listener multiple times if this function reruns
  if (!window.hasServiceShortcuts) {
    document.addEventListener("keydown", (e) => {
      // Stop if user is typing in the search box
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        return;
      }

      const key = e.key.toLowerCase();
      // Conditionally select the corresponding radio button
      const targetInput = container.querySelector(
        `input[data-shortcut="${key}"]`
      );
      // Trigger the 'change' event logic automatically
      if (targetInput) {
        targetInput.click();
      }
    });
    window.hasServiceShortcuts = true;
  }

  // Display the control box
  requestAnimationFrame(() => {
    if (bottomSheet) {
      bottomSheet.style.opacity = "1";
    }
  });
}

// --- MEMORY MANAGEMENT HELPER ---
function manageCacheMemory(key, data) {
  // data = { overlay: L.imageOverlay, url: blobUrl }
  // Add the new item
  layerCache.set(key, data);

  // Check if we exceeded the limit
  if (layerCache.size > MAX_CACHE_SIZE) {
    const oldestKey = layerCache.keys().next().value;
    const oldestData = layerCache.get(oldestKey);

    // Remove from map if it happens to be there
    if (map.hasLayer(oldestData.overlay)) {
      map.removeLayer(oldestData.overlay);
    }

    // Revoke Blob (Free RAM)
    URL.revokeObjectURL(oldestData.url);

    // Delete from Map
    layerCache.delete(oldestKey);
    console.log(`Cleared memory for: ${oldestKey}`);
  }
}

function getOpacityForZoom() {
  const currentzoom = map.getZoom();
  // Detect Dark Mode
  const isDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;

  /// Define your Start/End zoom levels
  const startZoom = 8; // Highest Opacity here
  const endZoom = 12; // Lowest Opacity here

  // Define Opacity Levels based on Mode
  // Light Mode: Needs higher opacity to stand out against white map
  // Night Mode: Needs lower opacity to blend with dark map
  const maxOpacity = isDarkMode ? 0.6 : 0.9;
  const minOpacity = isDarkMode ? 0.2 : 0.3;

  // Handle the "Fixed" ranges
  if (currentzoom <= startZoom) {
    return maxOpacity;
  }
  if (currentzoom >= endZoom) {
    return minOpacity;
  }

  // Calculate Linear Interpolation (The "In-Between")
  // e.g. If currentzoom is 12, range is 4, we are 2 steps in. 2/4 = 0.5 (50%)
  const progress = (currentzoom - startZoom) / (endZoom - startZoom);

  // Apply that progress to the opacity range
  // We want to go DOWN, so we subtract the difference from the Max
  const opacityRange = maxOpacity - minOpacity;
  const finalOpacity = maxOpacity - progress * opacityRange;

  return Number(finalOpacity.toFixed(1));
}

function getRadiusForZoom(zoom) {
  if (zoom < 10) {
    return 20; // Tiny dot (State view)
  }
  if (zoom < 11) {
    return 30; // Small Blob
  }
  if (zoom < 12) {
    return 60; // City view
  }
  if (zoom < 13) {
    return 120; // Medium circle (Area view)
  }
  if (zoom < 14) {
    return 240; // District view
  }
  if (zoom < 15) {
    return 480; // Neighborhood (Massive overlap)
  }
  return 1000; // Huge "Coverage Zone" (Street view)
}

// 1. The Switch Logic
function handleZoomChange() {
  // If we are currently animating a layer swap, don't interfere
  if (isLayerSwitching) {
    return;
  }

  const zoom = map.getZoom();

  // CASE A: High Zoom -> Show Dots
  if (zoom >= ZOOM_THRESHOLD) {
    if (!isHighZoom) {
      isHighZoom = true;
      // Hide Image Layer immediately
      if (currentOverlay) {
        currentOverlay.setOpacity(0);
      }
      // Render dots
      renderVisibleDots();
    } else {
      // Already in high zoom, ensure image is hidden
      if (currentOverlay) {
        currentOverlay.setOpacity(0);
      }
    }
  }

  // CASE B: Low Zoom -> Show Image
  else {
    if (isHighZoom) {
      isHighZoom = false;

      // Show Image Layer
      if (currentOverlay) {
        currentOverlay.setOpacity(getOpacityForZoom());
      }

      // DESTROY Dots (Save Memory)
      if (dotLayer) {
        map.removeLayer(dotLayer);
        dotLayer = null;
      }
    } else {
      // Just standard opacity update
      if (currentOverlay) {
        currentOverlay.setOpacity(getOpacityForZoom());
      }
    }
  }
}

// 2. The Render Logic
function renderVisibleDots() {
  // If no data loaded yet, do nothing
  if (!rawServiceData || rawServiceData.length === 0) {
    return;
  }

  // --- Get Zoom & Calculate ---
  const currentZoom = map.getZoom();
  // Get dynamic values based on zoom
  const dynamicRadius = getRadiusForZoom(currentZoom);
  const dynamicOpacity = getOpacityForZoom(currentZoom);

  // Filter: Only what is on screen
  const bounds = map.getBounds();
  const visiblePoints = rawServiceData.filter((point) => {
    return bounds.contains(L.latLng(point[0], point[1]));
  });

  // Clear or Create Layer
  if (dotLayer) {
    dotLayer.clearLayers();
  } else {
    dotLayer = L.layerGroup().addTo(map);
  }

  // Get active color
  const selectedInput = document.querySelector('input[name="service"]:checked');
  const serviceName = selectedInput ? selectedInput.value : "default";
  const color = brandColors[serviceName] || "#2ecc71";

  // Batch draw using Canvas Renderer
  visiblePoints.forEach((pt) => {
    L.circleMarker([pt[0], pt[1]], {
      renderer: myCanvasRenderer,
      radius: dynamicRadius,
      fillColor: color,
      color: "#ffffff00",
      weight: 1,
      opacity: 0.8,
      fillOpacity: 1,
      interactive: true,
    })
      .bindPopup(`<b>${capitalize(serviceName)}</b><br>Service available`)
      .addTo(dotLayer);
  });

  // --- Apply opacity to the entire Canvas Renderer element ---
  // This fades the whole "layer" after the dots have merged safely.
  if (myCanvasRenderer && myCanvasRenderer._container) {
    myCanvasRenderer._container.style.opacity = dynamicOpacity;
  }
}

// --- UPDATE MAP LAYER ---
function updateMapLayer() {
  if (!mapBounds) {
    return;
  }

  const selectedInput = document.querySelector('input[name="service"]:checked');
  if (!selectedInput) {
    return;
  }

  const serviceName = selectedInput.value;
  const activeColor = brandColors[serviceName] || "#2ecc71";

  if (dotLayer) {
    dotLayer.clearLayers();
  }

  // LOCK: Update the active request
  activeServiceRequest = serviceName;
  updateUIColors(activeColor, selectedInput);

  // --- PART 1: Fetch JSON Data (For High Zoom) ---
  fetch(`maps/${serviceName}.json?t=${globalTimestamp}`)
    .then((res) => res.json())
    .then((data) => {
      // Only update if user hasn't switched services again
      if (activeServiceRequest === serviceName) {
        rawServiceData = data;
        // If we are currently zoomed in, update dots immediately
        if (map.getZoom() >= ZOOM_THRESHOLD) {
          renderVisibleDots();
        }
      }
    })
    .catch((e) => console.warn("No JSON points found for this service", e));

  // --- PART 2: Handle Image Overlay (For Low Zoom) ---
  const pngUrl = `maps/${serviceName}.png?t=${globalTimestamp}`;
  const webpUrl = `maps/${serviceName}.webp?t=${globalTimestamp}`;

  // Helper to place overlay on map
  const setOverlay = (layerObj) => {
    if (activeServiceRequest !== serviceName) {
      return;
    }

    // Switch image layers and lock interactions
    isLayerSwitching = true;
    const oldOverlay = currentOverlay;
    const newOverlay = layerObj;

    // Ensure layer is initially invisible before adding
    newOverlay.setOpacity(0);

    // Add to Map (If not already there)
    if (!map.hasLayer(newOverlay)) {
      newOverlay.addTo(map);
    }

    currentOverlay = newOverlay;

    // Update the mask reference
    myCanvasRenderer.setMask(newOverlay);
    // Check if image is ALREADY loaded
    const img = newOverlay.getElement();
    if (img && img.complete) {
      if (isHighZoom) {
        renderVisibleDots();
      }
    } else {
      // Wait for it to load, then draw
      newOverlay.on("load", () => {
        if (isHighZoom && activeServiceRequest === serviceName) {
          console.log("Mask Image Loaded - Redrawing dots");
          renderVisibleDots();
        }
      });
    }

    // Trigger Animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Decide Visibility:
        // If High Zoom -> Opacity 0
        // If Low Zoom  -> Calculated Opacity
        const targetOpacity =
          map.getZoom() >= ZOOM_THRESHOLD ? 0 : getOpacityForZoom();
        newOverlay.setOpacity(targetOpacity);

        // Fade OUT Old Layer
        if (oldOverlay && oldOverlay !== newOverlay) {
          if (oldOverlay.getElement()) {
            oldOverlay.getElement().classList.add("smooth-layer");
          }
          oldOverlay.setOpacity(0);

          // Remove old layer from DOM after fade to save GPU memory
          // But KEEP it in layerCache object
          setTimeout(() => {
            if (map.hasLayer(oldOverlay) && oldOverlay !== currentOverlay) {
              map.removeLayer(oldOverlay);
            }
          }, 600);
        }

        // UNLOCK INTERACTIONS after CSS transition finishes
        setTimeout(() => {
          isLayerSwitching = false;
          // Final check in case user zoomed during the switch
          if (currentOverlay) {
            const finalOpacity =
              map.getZoom() >= ZOOM_THRESHOLD ? 0 : getOpacityForZoom();
            currentOverlay.setOpacity(finalOpacity);
          }
        }, 700);
      });
    });
  };

  // Check Cache
  if (layerCache.has(serviceName)) {
    const cachedData = layerCache.get(serviceName);

    // Refresh LRU Order
    layerCache.delete(serviceName);
    manageCacheMemory(serviceName, cachedData);

    setOverlay(cachedData.overlay);
    console.log(`Using cached Layer for ${serviceName}`);
    return;
  }

  // Fetch WebP
  let webpReady = false;
  fetch(webpUrl)
    .then((res) => {
      if (!res.ok) {
        throw new Error("Network error");
      }
      return res.blob();
    })
    .then((blob) => {
      if (activeServiceRequest !== serviceName) {
        return;
      }

      webpReady = true;
      const objectUrl = URL.createObjectURL(blob);

      // Create Layer
      const newOverlay = L.imageOverlay(objectUrl, mapBounds, {
        opacity: 0,
        interactive: false,
        className: "smooth-layer",
      });

      // Cache It
      manageCacheMemory(serviceName, {
        overlay: newOverlay,
        url: objectUrl,
      });

      setOverlay(newOverlay);
      console.log(`Loaded WebP for ${serviceName}`);
    })
    .catch((err) => {
      console.error(err);
      handleError();
    });

  // Fallback Timer
  setTimeout(() => {
    if (activeServiceRequest !== serviceName) {
      return;
    }
    if (webpReady) {
      return;
    }

    // Fallback: Create a temporary PNG layer (we don't cache this usually)
    console.log(`WebP slow. Showing PNG placeholder.`);
    const pngOverlay = L.imageOverlay(pngUrl, mapBounds, {
      opacity: 0,
      className: "smooth-layer",
    });
    setOverlay(pngOverlay);
  }, 2500);

  // --- ERROR HANDLER ---
  function handleError() {
    if (!navigator.onLine) {
      showToast("You are offline. Map layer could not be loaded.", true);
    } else if (!currentOverlay) {
      // If Online, it's a missing file/server error
      showToast(`High-res map unavailable.`, true);
    }
    // Try to load PNG
    setOverlay(pngUrl);
  }
}

// --- Preload Background Images (Create Layers with WebP in Background) ---
function preloadRemainingLayers(servicesList) {
  if (!servicesList || servicesList.length === 0) {
    return;
  }

  // Identify the currently active service so we don't download it twice
  const activeInput = document.querySelector('input[name="service"]:checked');
  const activeService = activeInput ? activeInput.value : null;
  let count = 0;

  console.log("Pre-warming map layers in background...");

  servicesList.forEach((serviceName) => {
    // Skip if active or already cached
    if (serviceName === activeService || layerCache.has(serviceName)) {
      return;
    }
    if (count >= MAX_CACHE_SIZE - 1) {
      return;
    }

    count++;
    const url = `maps/${serviceName}.webp?t=${globalTimestamp}`;
    // We only preload WebP.
    // If the user clicks this service later, the WebP will likely be in cache
    fetch(url)
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (blob) {
          const objectUrl = URL.createObjectURL(blob);

          // Create the layer NOW (but don't add to map yet)
          // This allows the browser to parse the image object in idle time
          const overlay = L.imageOverlay(objectUrl, mapBounds, {
            opacity: 0, // Ready to fade in
            interactive: false,
            className: "smooth-layer",
          });

          manageCacheMemory(serviceName, {
            overlay: overlay,
            url: objectUrl,
          });
        }
      })
      .catch(() => {});
  });
}

// Helper to update Legend and Card colors
function updateUIColors(color, selectedInput) {
  const themeColor = document.getElementById("theme-color");
  if (themeColor) {
    themeColor.setAttribute("content", color);
  }

  // Update Legend "Serviceable" Dot
  const legendDot = document.querySelector(
    "div.legend-item:nth-child(1) > span"
  );
  if (legendDot) {
    legendDot.style.backgroundColor = color;
    legendDot.style.boxShadow = `0 0 5px ${color}66`;
  }

  // Reset all cards
  document.querySelectorAll(".card-content").forEach((card) => {
    card.style.borderColor = "transparent";
    card.style.backgroundColor = "#f8f9fa";
  });

  // Style active card
  const activeCard = selectedInput.nextElementSibling;
  if (activeCard) {
    activeCard.style.borderColor = color;
    activeCard.style.backgroundColor = `${color}11`;
  }
}

// --- MODAL LOGIC ---
function initModal() {
  const modal = document.getElementById("disclaimerModal");
  const openBtn = document.getElementById("openDisclaimerModal");
  const closeSpan = document.querySelector(".modal-close-btn");
  const closeBtn = document.querySelector(".btn-close-modal");
  const backdrop = document.querySelector(".modal-backdrop");

  if (!modal || !openBtn) {
    return;
  }

  // Open Modal
  openBtn.addEventListener("click", (e) => {
    e.preventDefault();
    modal.classList.add("show");
  });

  // Close Actions
  const closeModal = () => modal.classList.remove("show");

  closeSpan.addEventListener("click", closeModal);
  closeBtn.addEventListener("click", closeModal);
  backdrop.addEventListener("click", closeModal);

  // Close on ESC key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("show")) {
      closeModal();
    }
  });
}

// Transfer keyboard focus to the map
function focusMap() {
  const mapEl = document.getElementById("map");
  if (mapEl) {
    // Leaflet maps usually have tabindex set, but we ensure it here
    // so the div can actually receive focus.
    if (!mapEl.hasAttribute("tabindex")) {
      mapEl.setAttribute("tabindex", "0");
    }
    mapEl.focus();
  }
}

// --- SEARCH LOGIC ---
function initSearch() {
  const input = document.getElementById("location-search");
  const btn = document.getElementById("search-btn");
  const searchContainer = input ? input.closest(".search-container") : null;

  // Variable to track status
  let isSearching = false;
  // If we are on big screen, show the shortcut hint
  if (input && window.matchMedia("(min-width: 600px)").matches) {
    input.placeholder = "Search City or Pincode  [ / ]";
  }

  if (!input || !btn) {
    console.warn("Search input/button not found");
    return null;
  }

  // Reusable search function
  const performSearch = async (queryOverride = null) => {
    // Stop if already searching
    if (isSearching) {
      return;
    }
    // check if it is a string. If not, set it to null.
    if (typeof queryOverride !== "string") {
      queryOverride = null;
    }

    // If override is provided (from URL), use it. Otherwise read input.
    let query = queryOverride;
    if (query === null) {
      query = input.value.trim();
    }

    // Handle "Clear" / Empty state (No network request needed here)
    if (!query) {
      UrlState.set("q", null);
      if (window.innerWidth <= 600) {
        toggleSheet();
      }
      map.flyTo(defaultLocation, 6, {
        duration: 1.5,
        easeLinearity: 1,
      });
      console.log(`Moved to Default view`);
      return;
    }

    // collapse bottom sheet in mobile
    if (window.innerWidth <= 600) {
      collapseSheet();
    }

    // Update URL if this is a fresh user search
    if (!queryOverride && query !== null) {
      UrlState.set("q", query);
    }

    // Normalize query key (lowercase)
    const cacheKey = query.toLowerCase();
    // CHECK CACHE (LocalStorage)
    const cachedResult = getFromCache(cacheKey);
    if (cachedResult) {
      console.log(`Loaded "${query}" from LocalStorage`);
      handleSearchResult(cachedResult);
      return;
    }

    // Lock the Interface
    isSearching = true;
    input.disabled = true;
    btn.style.opacity = "0.5";
    btn.style.cursor = "not-allowed";
    if (searchContainer) {
      searchContainer.classList.add("loading");
    }

    try {
      // SEND NETWORK REQUEST
      const q = encodeURIComponent(query);
      // Using OpenStreetMap Nominatim API (Free) with 'countrycodes=in'
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${q}&countrycodes=in&limit=1`;

      const response = await fetch(url);
      const results = await response.json();

      if (results && results.length > 0) {
        const bestMatch = results[0];
        // SAVE TO CACHE (LocalStorage)
        saveToCache(cacheKey, bestMatch);
        handleSearchResult(bestMatch);
      } else {
        showToast("Location not found. Try a City or Pincode.", true);
      }
    } catch (error) {
      console.error("Search failed:", error);
      showToast("Search failed due to network error.", true);

      // uncollapse bottom sheet in mobile on error so user can try again
      if (window.innerWidth <= 600) {
        toggleSheet();
      }
    } finally {
      focusMap();
      // Unlock the Interface
      if (searchContainer) {
        searchContainer.classList.remove("loading");
      }
      isSearching = false;
      input.disabled = false;
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
    }
  };

  // Helper to handle the moving logic on map
  const handleSearchResult = (location) => {
    const lat = parseFloat(location.lat);
    const lon = parseFloat(location.lon);
    const newLatLng = new L.LatLng(lat, lon);
    const currentCenter = map.getCenter();

    // --- Check if we are already here ---
    // If distance is less than 3km (3000 meters), consider it "Same Area"
    if (currentCenter.distanceTo(newLatLng) < 3000) {
      const name = location.display_name || location.name;
      showToast(`Already at ${name.split(",")[0]}`, false);
    } else {
      console.log(`Moving to ${location.name}`);
    }

    // --- Zoom to location: Use flyTo for smooth animation ---
    // 10 is the zoom level, 2 is the duration in seconds
    map.flyTo([lat, lon], 10, {
      duration: 2,
      easeLinearity: 1.42,
    });

    // Hide keyboard on mobile
    input.blur();
  };

  // Event Listener: 'Enter' key
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      performSearch();
    }
  });

  // Event Listener: Click Search Icon
  btn.addEventListener("click", performSearch);

  // Reset map when user clicks the "X" (clear) button
  input.addEventListener("search", () => {
    if (input.value === "") {
      performSearch();
    }
  });

  // --- Search Listener (/) ---
  document.addEventListener("keydown", (e) => {
    // Check if the key is '/'
    if (e.key === "/") {
      // Don't trigger if user is already typing in an input/textarea
      // (This prevents the shortcut from firing if they are typing a URL or date elsewhere)
      const tag = document.activeElement.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea") {
        return;
      }

      // Prevent the '/' character from actually being typed into the box
      e.preventDefault();

      // Expand bottom sheet on mobile if it's collapsed so input is visible
      const bottomSheet = document.getElementById("bottom-sheet");
      if (
        window.innerWidth <= 600 &&
        bottomSheet &&
        bottomSheet.classList.contains("collapsed")
      ) {
        bottomSheet.classList.remove("collapsed");
      }

      // Focus the input
      input.focus();

      // If text exists, select all of it (Autoselect)
      if (input.value) {
        input.select();
      }
    }
  });

  return performSearch;
}

// Start the App
setupMapTiles(map);
initApp();
initModal();
