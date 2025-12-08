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

// 2. HELPER: Capitalize first letter (amazon -> Amazon)
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// 3. MAIN INITIALIZATION
async function initApp() {
  try {
    // A. Load Data & Bounds in parallel
    const [availResponse, boundsResponse] = await Promise.all([
      fetch("data/availability.json"),
      fetch("maps/bounds.json"),
    ]);

    const availabilityData = await availResponse.json();
    const boundsData = await boundsResponse.json();

    // Store bounds globally
    mapBounds = [boundsData.southWest, boundsData.northEast];

    // B. Generate Radio Buttons
    generateControls(availabilityData);

    // C. Load the initial map layer (Defaults to the first one found)
    updateMapLayer();
  } catch (error) {
    console.error("Initialization failed:", error);
  }
}

// 4. Function to Generate HTML
function generateControls(data) {
  if (!data || data.length === 0) return;

  // Get partners from the first item
  const firstItem = data[0];
  const partners = Object.keys(firstItem.partners); // ["amazon", "flipkart", ...]

  const container = document.getElementById("options-container");
  container.innerHTML = ""; // Clear any existing content

  partners.forEach((partner, index) => {
    // Create the label element
    const label = document.createElement("label");
    label.className = "radio-card";

    // Check the first one by default
    const isChecked = index === 0 ? "checked" : "";

    label.innerHTML = `
            <input 
                type="radio" 
                name="service" 
                value="${partner}" 
                ${isChecked}
            >
            <div class="card-content">
                <span class="service-name">${capitalize(partner)}</span>
                <span class="status-dot"></span>
            </div>
        `;

    // Add Event Listener directly to the input
    const input = label.querySelector("input");
    input.addEventListener("change", updateMapLayer);

    container.appendChild(label);
  });
}

// 5. Update Map Layer (Same logic as before)
function updateMapLayer() {
  if (!mapBounds) return;

  // Find the currently checked radio
  const selectedInput = document.querySelector('input[name="service"]:checked');
  if (!selectedInput) return;

  const serviceName = selectedInput.value;
  const imageUrl = `maps/${serviceName}.png`; // Ensure filename matches JSON key

  if (currentOverlay) {
    map.removeLayer(currentOverlay);
  }

  currentOverlay = L.imageOverlay(imageUrl, mapBounds, {
    opacity: 0.75,
    interactive: false,
  }).addTo(map);
}

// Start the App
initApp();
