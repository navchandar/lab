// GLOBAL VARIABLES
let currentOverlay = null;
let mapBounds = null;
let brandColors = {};
// Tracks the currently active service name to prevent image swapping race conditions
let activeServiceRequest = null;
let globalTimestamp = new Date().getTime();

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

// MAP SETUP
const defaultLocation = [22.5937, 78.9629];
const Zoom = { zoomControl: false };
const map = L.map("map", Zoom).setView(defaultLocation, 5);
L.control.zoom({ position: "bottomright" }).addTo(map);

// TILE LAYER SETUP
L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  attribution: "&copy; OpenStreetMap &copy; CARTO",
  subdomains: "abcd",
  maxZoom: 19,
}).addTo(map);

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

    // Format it nicely: "08 Dec, 10:30 PM"
    const formatted = new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    }).format(date);

    footerEl.textContent = `Last refreshed: ${formatted}`;
  } catch (e) {
    console.warn("Could not parse date:", e);
  }
}

// --- BOTTOM SHEET LOGIC for mobile ---
function initBottomSheet() {
  const card = document.getElementById("bottom-sheet");
  const header = document.getElementById("card-header");
  const mapEl = document.getElementById("map");

  // Toggle function
  const toggleSheet = () => {
    card.classList.toggle("collapsed");
  };

  const collapseSheet = () => {
    card.classList.add("collapsed");
  };

  // Click Header to Toggle
  header.addEventListener("click", toggleSheet);

  // Click Drag Handle to Toggle
  const handle = document.querySelector(".drag-handle");
  if (handle) {
    handle.addEventListener("click", toggleSheet);
  }

  // Collapse on clicking on map
  if (window.innerWidth <= 600) {
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

    // Load the initial map layer (Defaults to the first service)
    updateMapLayer();

    initBottomSheet();

    initSearch();

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

  const webpImg = new Image();
  // Set onload BEFORE setting src to ensure we catch cached events
  let webpLoaded = false;

  webpImg.onload = () => {
    webpLoaded = true;
    // Always prioritize WebP. If PNG is currently showing, this will overwrite it.
    setOverlay(webpUrl);
    console.log(`Using WebP for ${serviceName}`);
  };

  webpImg.onerror = () => {
    console.error(`Failed to load WebP: ${webpUrl}`);
    // If WebP fails, ensure PNG is visible (if it wasn't already)
    if (!currentOverlay) {
      showToast(
        `Coverage for ${capitalize(serviceName)} is unavailable.`,
        true
      );
      updateUIColors("#ccc", selectedInput);
    }
  };

  webpImg.src = webpUrl;

  // CHECK CACHE IMMEDIATELY
  if (webpImg.complete) {
    // If it's already cached, run the logic immediately
    // and skip the PNG logic entirely.
    webpLoaded = true;
    setOverlay(webpUrl);
    return;
  }

  // If we are here, WebP is NOT instantly ready.
  // Start loading PNG as a fallback, but with a small safety delay
  // to give the browser a moment to resolve disk cache for WebP.
  setTimeout(() => {
    if (activeServiceRequest !== serviceName) {
      return;
    } // User switched services
    if (webpLoaded) {
      return;
    } // WebP finished instantly, don't load PNG

    const pngImg = new Image();
    pngImg.src = pngUrl;

    pngImg.onload = () => {
      // CRITICAL CHECK: Only show PNG if WebP is STILL not ready
      if (!webpLoaded && activeServiceRequest === serviceName) {
        console.log(`Showing PNG placeholder for ${serviceName}`);
        setOverlay(pngUrl);
      }
    };
  }, 50); // 50ms buffer prevents flickering
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
      return;
    }

    // We only preload WebP.
    // If the user clicks this service later, the WebP will likely be in cache (Scenario A).
    // If not, the PNG logic (Scenario B) handles the wait.
    const img = new Image();
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

    if (!input || !btn) return;

    // Function to perform search
    const performSearch = async () => {
        const query = input.value.trim();
        if (!query) return;

        // Visual feedback: Change icon opacity or show loading cursor
        btn.style.opacity = "0.5";
        
        try {
            // Using OpenStreetMap Nominatim API (Free, no key required)
            // 'countrycodes=in' restricts results to India (Remove if you want global)
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=in&limit=1`;
            
            const response = await fetch(url);
            const results = await response.json();

            if (results && results.length > 0) {
                const location = results[0];
                const lat = parseFloat(location.lat);
                const lon = parseFloat(location.lon);

                // Zoom to location (Level 12 is a good city/area view)
                map.setView([lat, lon], 12);
                
                // Optional: Show toast confirmation
                // showToast(`Moved to ${location.name.split(',')[0]}`);
                
                // Hide keyboard on mobile
                input.blur();
            } else {
                showToast("Location not found. Try a City or Pincode.", true);
            }
        } catch (error) {
            console.error("Search failed:", error);
            showToast("Search failed due to network error.", true);
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
}

// Start the App
initApp();
initModal();
