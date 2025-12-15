// GLOBAL VARIABLES
let currentOverlay = null;
let mapBounds = null;
let brandColors = {};
// Tracks the currently active service name to prevent image swapping race conditions
let activeServiceRequest = null;
let isLayerSwitching = false;
let globalTimestamp = new Date().getTime();

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
      mapEl.addEventListener("touchstart", (e) => {
        e.stopPropagation();
        collapseSheet();
      });
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

    const boundsData = await boundsResponse.json();
    globalTimestamp = new Date(boundsData.lastUpdated).getTime();

    // Store global data
    mapBounds = [boundsData.southWest, boundsData.northEast];
    brandColors = boundsData.colors || {};
    updateFooterTime(boundsData.lastUpdated);

    // Generate Radio Buttons
    generateControls(boundsData.services);

    // Initialize Search Logic
    const searchFn = initSearch();

    // --- RESTORE STATE FROM URL ---
    // 1. Check for 'service' param
    const savedService = UrlState.get("service");
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

    // 2. Check for 'q' (query/location) param
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

    map.on("zoom", () => {
      if (isLayerSwitching) {
        return;
      }
      // Only update if we have an active layer
      if (currentOverlay) {
        currentOverlay.setOpacity(getOpacityForZoom());
      }
    });

    map.on("zoomstart", () => {
      if (isLayerSwitching) {
        return;
      }
      if (currentOverlay && currentOverlay.getElement()) {
        // Remove smooth class during zoom so updates are instant
        currentOverlay.getElement().classList.remove("smooth-layer");
      }
    });
    map.on("zoomend", () => {
      if (currentOverlay && currentOverlay.getElement()) {
        // Add it back after zooming finishes
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
    return;
  }

  const container = document.getElementById("options-container");
  container.innerHTML = "";

  // Get partners from the list
  servicesList.forEach((partner, index) => {
    // Create the label element
    const label = document.createElement("label");
    label.className = "radio-card";
    // Default to first item checked, UNLESS URL overrides it later in initApp
    const isDefault = index === 0;
    const isChecked = isDefault ? "checked" : "";

    // Get color for this partner (Default green if missing)
    const color = brandColors[partner] || "#2ecc71";
    label.style.setProperty("--brand-color", color);

    label.innerHTML = `
            <input 
                type="radio" 
                name="service" 
                value="${partner}" 
                ${isChecked}
            >
            <div class="card-content">
                <span class="service-name">${capitalize(partner)}</span>
            </div>
        `;

    // Add Event Listener directly to the input
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
    });

    container.appendChild(label);
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
  const minOpacity = isDarkMode ? 0.3 : 0.4;

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

  // LOCK: Update the active request
  activeServiceRequest = serviceName;

  // URLS
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

    updateUIColors(activeColor, selectedInput);
    currentOverlay = newOverlay;

    // Trigger Animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Calculate dynamic opacity
        const targetOpacity = getOpacityForZoom();
        newOverlay.setOpacity(targetOpacity);

        // Fade OUT the Old Layer
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
          // Safety Check: update the opacity to match the *current* final zoom
          if (currentOverlay) {
            currentOverlay.setOpacity(getOpacityForZoom());
          }
        }, 700);
      });
    });
  };

  // Check Layer Cache (Fastest)
  if (layerCache.has(serviceName)) {
    const cachedData = layerCache.get(serviceName);

    // Refresh LRU Order
    layerCache.delete(serviceName);
    manageCacheMemory(serviceName, cachedData);

    setOverlay(cachedData.overlay);
    console.log(`Using cached Layer for ${serviceName}`);
    return;
  }

  // Fetch and Cache (First Load)
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
      manageCacheMemory(serviceName, { overlay: newOverlay, url: objectUrl });

      setOverlay(newOverlay);
      console.log(`Loaded WebP for ${serviceName}`);
    })
    .catch((err) => {
      console.error(err);
      handleError();
    });

  // 3. Fallback Logic (Timer)
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

    // Double failure catch
    if (currentOverlay) {
      const img = currentOverlay.getElement();
      if (img) {
        img.onerror = () => {
          if (map.hasLayer(currentOverlay)) {
            map.removeLayer(currentOverlay);
          }
          if (!navigator.onLine) {
            showToast("Offline: No map data.", true);
          }
        };
      }
    }
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

          manageCacheMemory(serviceName, { overlay: overlay, url: objectUrl });
        }
      })
      .catch(() => {});
  });
}

// Helper to update Legend and Card colors
function updateUIColors(color, selectedInput) {
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

// --- SEARCH LOGIC ---
function initSearch() {
  const input = document.getElementById("location-search");
  const btn = document.getElementById("search-btn");

  // Variable to track status
  let isSearching = false;

  if (!input || !btn) {
    return null;
  }

  // Reusable search function
  const performSearch = async (queryOverride = null) => {
    // Stop if already searching
    if (isSearching) {
      return;
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

    // Lock the Interface
    isSearching = true;
    input.disabled = true;
    btn.style.opacity = "0.5";
    btn.style.cursor = "not-allowed";

    try {
      const q = encodeURIComponent(query);
      // Using OpenStreetMap Nominatim API (Free) with 'countrycodes=in'
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${q}&countrycodes=in&limit=1`;

      const response = await fetch(url);
      const results = await response.json();

      if (results && results.length > 0) {
        const location = results[0];
        const lat = parseFloat(location.lat);
        const lon = parseFloat(location.lon);

        // --- Zoom to location: Use flyTo for smooth animation ---
        // 11 is the zoom level, 2 is the duration in seconds
        map.flyTo([lat, lon], 11, {
          duration: 2,
          easeLinearity: 1.42,
        });
        console.log(`Moved to ${location.name}`);

        // Hide keyboard on mobile
        input.blur();
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
      // Unlock the Interface
      isSearching = false;
      input.disabled = false;
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
    }
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

  return performSearch;
}

// Start the App
setupMapTiles(map);
initApp();
initModal();
