// 1. Map Setup
const defaultLocation = [22.5937, 78.9629];
const Zoom = { zoomControl: false };
const map = L.map("map", Zoom).setView(defaultLocation, 5);

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

// MAIN INITIALIZATION
async function initApp() {
    try {
        // Load Data & Bounds in parallel
        const [availResponse, boundsResponse] = await Promise.all([
            fetch("data/availability.json"),
            fetch("maps/bounds.json"),
        ]);

        if (!availResponse.ok || !boundsResponse.ok) {
            throw new Error("Failed to load map data files.");
        }

        const availabilityData = await availResponse.json();
        const boundsData = await boundsResponse.json();

        // Store global data
        mapBounds = [boundsData.southWest, boundsData.northEast];
        brandColors = boundsData.colors || {};
        updateFooterTime(boundsData.lastUpdated);

        // Generate Radio Buttons
        generateControls(availabilityData);

        // Load the initial map layer (Defaults to the first one found)
        updateMapLayer();
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
        input.addEventListener("change", updateMapLayer);
        container.appendChild(label);
    });
}

// Update Map Layer
function updateMapLayer() {
    if (!mapBounds) {
        return;
    }

    // Find the currently checked radio

    const selectedInput = document.querySelector(
        'input[name="service"]:checked'
    );
    if (!selectedInput) {
        return;
    }

    const serviceName = selectedInput.value;
    const imageUrl = `maps/${serviceName}.png`;

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
        // Image loaded successfully, add to map - Safety check
        if (currentOverlay) {
            map.removeLayer(currentOverlay);
        }

        currentOverlay = L.imageOverlay(imageUrl, mapBounds, {
            opacity: 0.75,
            interactive: false,
        }).addTo(map);

        // Update Legend & UI only on success
        updateUIColors(activeColor, selectedInput);
    };

    tempImg.onerror = function () {
        console.error(`Failed to load overlay: ${imageUrl}`);
        showToast(
            `Coverage for ${capitalize(serviceName)} is unavailable.`,
            true
        );

        // Reset UI or visual indication that it failed
        updateUIColors("#ccc", selectedInput); // Turn grey to indicate failure
    };
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

// Start the App
initApp();
