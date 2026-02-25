import * as utils from "../static/utils.js";
import { TTS } from "../static/speech_helper.js";

// --- Speaker Initiation ---
const ttsInstance = TTS();
ttsInstance.unlockSpeech();

const nameTextEl = document.getElementById("country-name-text");
const flagImgEl = document.getElementById("flag-img");
const nameDisplayEl = document.getElementById("name-display");

function speaker() {
  ttsInstance.speakElement(nameTextEl, {
    directSpeech: false,
    rate: 0.8,
    locale: "en-US",
  });
}

// --- Map Initialization ---
const svg = d3.select("#map");
const width = 960;
const height = 600;

svg
  .attr("viewBox", `0 0 ${width} ${height}`)
  .attr("preserveAspectRatio", "xMidYMid meet");

const g = svg.append("g");

const maxZoomLimit = 4;

// Set up limited Zoom and Pan
const zoom = d3
  .zoom()
  .scaleExtent([1, maxZoomLimit]) // Can zoom in up to 4x
  .translateExtent([
    [0, 0],
    [width, height],
  ]) // Prevents panning outside the map
  .on("zoom", (event) => {
    g.attr("transform", event.transform);
    // Keep borders thin when zoomed in
    g.selectAll(".country").attr(
      "stroke-width",
      0.5 / event.transform.k + "px",
    );
  });

svg.call(zoom);

// Updated Projection: Robinson Compromise
const projection = d3
  .geoRobinson()
  .scale(150)
  .translate([width / 2, height / 2]);

const path = d3.geoPath().projection(projection);

// For now, loading the public CDN. Once we set up the python script,
// this will change to your local generated JSON file (e.g., "../data/map_data.json")
const dataUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";

d3.json(dataUrl)
  .then((world) => {
    const countries = topojson.feature(world, world.objects.countries).features;

    g.selectAll("path")
      .data(countries)
      .enter()
      .append("path")
      .attr("d", path)
      .attr("class", "country")
      .attr("tabindex", "0") // Keyboard accessibility
      .attr("aria-label", (d) => d.properties.name || "Unknown Country")
      .on("click", function (event, d) {
        handleInteraction(this, d);
      })
      .on("keypress", function (event, d) {
        if (event.key === "Enter" || event.key === " ") {
          handleInteraction(this, d);
        }
      });
  })
  .catch((err) => {
    console.error("Error loading map data:", err);
    nameDisplayEl.textContent = "Oops! Map couldn't load.";
    nameDisplayEl.classList.add("show");
  });

function handleInteraction(element, data) {
  // Remove active highlight from all countries
  d3.selectAll(".country").classed("active", false);

  // Highlight the clicked country
  d3.select(element).classed("active", true);

  // --- Dynamic Bounding Box Zoom Logic ---
  // 1. Calculate the exact boundaries of the clicked country
  const bounds = path.bounds(data);
  const dx = bounds[1][0] - bounds[0][0];
  const dy = bounds[1][1] - bounds[0][1];

  // 2. Find the center of that bounding box
  const x = (bounds[0][0] + bounds[1][0]) / 2;
  const y = (bounds[0][1] + bounds[1][1]) / 2;

  // 3. Calculate the perfect scale.
  // 0.4 is our padding factor (keeps the country from taking up the whole screen).
  // We cap it at maxZoomLimit (4) so tiny countries don't zoom in too far.
  const scale = Math.max(
    1,
    Math.min(maxZoomLimit, 0.4 / Math.max(dx / width, dy / height)),
  );

  // 4. Smoothly transition the map to the new centered box
  svg
    .transition()
    .duration(750)
    .call(
      zoom.transform,
      d3.zoomIdentity
        .translate(width / 2 - x * scale, height / 2 - y * scale)
        .scale(scale),
    );

  // --- UI Updates ---
  const countryName = data.properties.name || "Unknown";
  nameTextEl.textContent = countryName;

  // Flag Logic (Placeholder until we set up the Python script to map ISO codes)
  // Example: If we know the ISO code is 'in', we set src to 'https://flagcdn.com/w80/in.png'
  // For now, we will just show the name.
  flagImgEl.style.display = "none";

  // Animation
  nameDisplayEl.classList.remove("show");
  void nameDisplayEl.offsetWidth;
  nameDisplayEl.classList.add("show");

  // Trigger your custom TTS
  speaker();
}

// --- Keyboard Listeners mapping to your existing keys ---
window.addEventListener("keydown", (event) => {
  const target = event.target;
});
