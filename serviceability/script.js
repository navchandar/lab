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

// Capitalize first letter (amazon -> Amazon)
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// MAIN INITIALIZATION
async function initApp() {
    try {
        // Load Data & Bounds in parallel
        const [availResponse, boundsResponse] = await Promise.all([
            fetch("data/availability.json"),
            fetch("maps/bounds.json"),
        ]);

        const availabilityData = await availResponse.json();
        const boundsData = await boundsResponse.json();

        // Store global data
        mapBounds = [boundsData.southWest, boundsData.northEast];
        brandColors = boundsData.colors || {}; // Load colors from Python output

        // Generate Radio Buttons
        generateControls(availabilityData);

        // Load the initial map layer (Defaults to the first one found)
        updateMapLayer();
    } catch (error) {
        console.error("Initialization failed:", error);
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

    // Update Map Overlay
    if (currentOverlay) {
        map.removeLayer(currentOverlay);
    }
    currentOverlay = L.imageOverlay(imageUrl, mapBounds, {
        opacity: 0.75,
        interactive: false,
    }).addTo(map);

    // Update Legend "Serviceable" Dot Color
    const legendDot = document.querySelector(
        "div.legend-item:nth-child(1) > span"
    );
    if (legendDot) {
        legendDot.style.backgroundColor = activeColor;
        legendDot.style.boxShadow = `0 0 5px ${activeColor}66`;
    }

    // Update the Radio Card Border Color for extra polish
    // We need to reset all cards first, then color the active one
    document.querySelectorAll(".card-content").forEach((card) => {
        card.style.borderColor = "transparent";
        card.style.backgroundColor = "#f8f9fa";
    });

    // Style the active card
    const activeCard = selectedInput.nextElementSibling; // .card-content
    activeCard.style.borderColor = activeColor;
    activeCard.style.backgroundColor = `${activeColor}11`; // Very faint background tint
}

// Start the App
initApp();
