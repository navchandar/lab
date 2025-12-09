// 1. Map Setup
const defaultLocation = [22.5937, 78.9629];
const Zoom = { zoomControl: false };
const map = L.map("map", Zoom).setView(defaultLocation, 5);
let globalTimestamp = new Date().getTime();

L.control.zoom({ position: "bottomright" }).addTo(map);
L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  attribution: "&copy; OpenStreetMap &copy; CARTO",
  subdomains: "abcd",
  maxZoom: 19,
}).addTo(map);

let currentOverlay = null;
let mapBounds = null;
let brandColors = {};

// Helper: Capitalize first letter
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Display TOAST NOTIFICATION ---
function showToast(message, isError = false) {
  // Check if toast element exists, if not create it
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast-notification";
    document.body.appendChild(toast);
  }

  // Set content and style
  toast.textContent = message;
  if (isError) {
    toast.classList.add("error");
  } else {
    toast.classList.remove("error");
  }

  // Display and Hide after 3 seconds
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

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

// Update Map Layer
function updateMapLayer() {
  if (!mapBounds) {
    return;
  }

  // Find the currently checked radio
  const selectedInput = document.querySelector('input[name="service"]:checked');
  if (!selectedInput) {
    return;
  }

  const serviceName = selectedInput.value;
  const imageUrl = `maps/${serviceName}.png?t=${globalTimestamp}`;

  // Get Color for UI updates
  const activeColor = brandColors[serviceName] || "#2ecc71";

  // Remove existing layer
  if (currentOverlay) {
    map.removeLayer(currentOverlay);
    currentOverlay = null;
  }

  // --- VALIDATE IMAGE ---
  // Leaflet's 'error' event can be flaky, so we use a native Image object to test loading first
  const tempImg = new Image();
  tempImg.src = imageUrl;

  tempImg.onload = function () {
    // Update Legend & UI only on success
    updateUIColors(activeColor, selectedInput);

    // Image loaded successfully, add to map - Safety check
    if (currentOverlay) {
      map.removeLayer(currentOverlay);
    }

    currentOverlay = L.imageOverlay(imageUrl, mapBounds, {
      opacity: 0.75,
      interactive: false,
    }).addTo(map);
  };

  tempImg.onerror = function () {
    console.error(`Failed to load overlay: ${imageUrl}`);
    showToast(`Coverage for ${capitalize(serviceName)} is unavailable.`, true);

    // Reset UI or visual indication that it failed
    updateUIColors("#ccc", selectedInput); // Turn grey to indicate failure
  };
}

// --- Preload Background Images ---
function preloadRemainingLayers(data) {
  if (!data || data.length === 0) {
    return;
  }

  const partners = Object.keys(data[0].partners);

  // Identify the currently active service so we don't download it twice
  const activeInput = document.querySelector('input[name="service"]:checked');
  const activeService = activeInput ? activeInput.value : null;

  console.log("Preloading other layers in the background...");

  partners.forEach((serviceName) => {
    // Skip the current one (it's already loading/loaded)
    if (serviceName === activeService) {
      return;
    }
    // Create an image object to download into the browser cache
    const img = new Image();
    img.src = `maps/${serviceName}.png?t=${globalTimestamp}`;
  });
}

// Helper to update Legend and Card colors (Refactored for cleanliness)
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

// Start the App
initApp();
initModal();
