// GLOBAL VARIABLES
let currentOverlay = null;
let mapBounds = null;
let brandColors = {};
// Tracks the currently active service name to prevent image swapping race conditions
let activeServiceRequest = null;
let globalTimestamp = new Date().getTime();
const loadedWebpImages = new Set();

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

  toast.textContent = message;
  if (isError) {
    toast.classList.add("error");
  } else {
    toast.classList.remove("error");
  }

  toast.classList.add("show");
  // Reset timer if toast is triggered rapidly
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
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
const toggleSheet = () => () => {
  const card = document.getElementById("bottom-sheet");
  card.classList.toggle("collapsed");
};
const collapseSheet = () => {
  const card = document.getElementById("bottom-sheet");
  card.classList.add("collapsed");
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
      card.classList.add("collapsed");
    }
  }, 1500);
}

// MAIN INITIALIZATION
async function initApp() {
  try {
    // Load Data & Bounds in parallel
    const timestamp = new Date().getTime();
    const [availResponse, boundsResponse] = await Promise.all([
      fetch(`data/availability.json?t=${timestamp}`),
      fetch(`maps/bounds.json?t=${timestamp}`),
    ]);

    if (!availResponse.ok || !boundsResponse.ok) {
      throw new Error("Failed to load map data files.");
    }

    const availabilityData = await availResponse.json();
    const boundsData = await boundsResponse.json();
    globalTimestamp = new Date(boundsData.lastUpdated).getTime();

    // Store global data
    mapBounds = [boundsData.southWest, boundsData.northEast];
    brandColors = boundsData.colors || {};
    updateFooterTime(boundsData.lastUpdated);

    // Generate Radio Buttons
    generateControls(availabilityData);

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
        preloadRemainingLayers(availabilityData);
      });
    } else {
      // Fallback for older browsers
      setTimeout(() => {
        preloadRemainingLayers(availabilityData);
      }, 3000);
    }
  } catch (error) {
    console.error("Initialization failed:", error);
    showToast("Error loading map data. Please try refreshing.", true);
  }
}

// Function to Generate HTML
function generateControls(data) {
  if (!data || data.length === 0) {
    return;
  }

  // Get partners from the first item
  const firstItem = data[0];
  const partners = Object.keys(firstItem.partners);
  const container = document.getElementById("options-container");
  container.innerHTML = "";

  partners.forEach((partner, index) => {
    // Create the label element
    const label = document.createElement("label");
    label.className = "radio-card";
    // Default to first item checked, UNLESS URL overrides it later in initApp
    const isChecked = index === 0 ? "checked" : "";

    // Get color for this partner (Default green if missing)
    const color = brandColors[partner] || "#2ecc71";

    label.innerHTML = `
            <input 
                type="radio" 
                name="service" 
                value="${partner}" 
                ${isChecked}
            >
            <div class="card-content">
                <span class="service-name">${capitalize(partner)}</span>
                <span class="status-dot" style="background-color: ${color}"></span>
            </div>
        `;

    // Add Event Listener directly to the input
    const input = label.querySelector("input");
    input.addEventListener("change", () => {
      // Update URL when user clicks
      UrlState.set("service", partner);

      updateMapLayer();
      // collapse the card after selection on mobile
      if (window.innerWidth <= 600) {
        const card = document.getElementById("bottom-sheet");
        card.classList.add("collapsed");
      }
    });

    container.appendChild(label);
  });
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
  const setOverlay = (url) => {
    // Only proceed if the user hasn't switched to a different service
    if (activeServiceRequest !== serviceName) {
      return;
    }

    if (currentOverlay) {
      map.removeLayer(currentOverlay);
    }
    currentOverlay = L.imageOverlay(url, mapBounds, {
      opacity: 0.75,
      interactive: false,
    }).addTo(map);

    updateUIColors(activeColor, selectedInput);
  };

  // --- PROGRESSIVE STRATEGY ---
  // 1. Check if we KNOW it's already preloaded in this session
  const isPreloaded = loadedWebpImages.has(serviceName);

  const webpImg = new Image();
  let webpReady = false;

  webpImg.onload = () => {
    webpReady = true;
    // Mark as loaded for future reference
    loadedWebpImages.add(serviceName);
    // WebP is ready, show it (replaces PNG if it was showing)
    setOverlay(webpUrl);
    console.log(`Loaded WebP for ${serviceName}`);
  };

  webpImg.onerror = () => {
    console.error(`Failed to load WebP: ${webpUrl}`);
    // Only fallback if WebP dies completely
    if (!currentOverlay) {
      // Force PNG load if WebP errors out
      setOverlay(pngUrl);
      showToast(`High-res map unavailable. Showing fallback.`, true);
    }
  };

  // Start loading WebP
  webpImg.src = webpUrl;

  // 2. Immediate Cache Check (Memory)
  if (webpImg.complete) {
    webpReady = true;
    loadedWebpImages.add(serviceName);
    setOverlay(webpUrl);
    return;
  }

  // 3. Fallback Logic
  // If we know it's preloaded, we DO NOT show PNG. We just wait for WebP
  // If we don't know (first load or refresh), we start a timer to show PNG.
  if (!isPreloaded) {
    setTimeout(() => {
      // If user switched or WebP finished in the meantime, stop.
      if (activeServiceRequest !== serviceName) {
        return;
      }
      if (webpReady) {
        return;
      }
      console.log(
        `WebP not loaded yet. Showing PNG placeholder for ${serviceName}`
      );

      const pngImg = new Image();
      pngImg.src = pngUrl;
      pngImg.onload = () => {
        // Check flag again in case WebP finished while PNG was decoding
        if (!webpReady && activeServiceRequest === serviceName) {
          setOverlay(pngUrl);
        }
      };
    }, 100); // 100ms to allow Disk Cache to resolve
  }
}

// --- Preload Background Images (WEBP ONLY) ---
function preloadRemainingLayers(data) {
  if (!data || data.length === 0) {
    return;
  }

  const partners = Object.keys(data[0].partners);

  // Identify the currently active service so we don't download it twice
  const activeInput = document.querySelector('input[name="service"]:checked');
  const activeService = activeInput ? activeInput.value : null;

  console.log("Preloading High-Res WebP maps in background...");

  partners.forEach((serviceName) => {
    if (serviceName === activeService) {
      loadedWebpImages.add(serviceName);
      return;
    }

    // We only preload WebP.
    // If the user clicks this service later, the WebP will likely be in cache (Scenario A).
    // If not, the PNG logic (Scenario B) handles the wait.
    const img = new Image();
    img.onload = () => {
      loadedWebpImages.add(serviceName);
    };
    img.src = `maps/${serviceName}.webp?t=${globalTimestamp}`;
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

  if (!input || !btn) {
    return null;
  }

  // Reusable search function
  const performSearch = async (queryOverride = null) => {
    // If override is provided (from URL), use it. Otherwise read input.
    let query = queryOverride;
    if (query === null) {
      query = input.value.trim();
    }

    if (!query) {
      // Clean up URL and move to default state
      UrlState.set("q", null);
      if (window.innerWidth <= 600) {
        toggleSheet();
      }
      map.flyTo(defaultLocation, 8, {
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

    // Visual feedback: Change icon opacity or show loading cursor
    btn.style.opacity = "0.5";

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
      // uncollapse bottom sheet in mobile
      if (window.innerWidth <= 600) {
        toggleSheet();
      }
    } finally {
      btn.style.opacity = "1";
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
