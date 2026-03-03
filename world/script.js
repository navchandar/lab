import * as utils from "../static/utils.js";
import { TTS } from "../static/speech_helper.js";

// --- DOM Element References ---
const settingsBtn = document.getElementById("settings-btn");
const settingsIcon = document.getElementById("settings-icon");
const nameDisplayEl = document.getElementById("name-display");
const nameTextEl = document.getElementById("country-name-text");
const flagImgEl = document.getElementById("flag-img");
const extrainfoCheckbox = document.getElementById("show-extra-info");
const extraInfoEl = document.getElementById("extra-info-text");

// --- Loading Screen Animation ---
const globeEl = document.getElementById("globe-emoji");
const globeFrames = ["🌍", "🌎", "🌏"];
let frameIndex = 0;
// Swap the emoji every 300 milliseconds
const loadingTimer = setInterval(() => {
  if (globeEl) {
    frameIndex = (frameIndex + 1) % globeFrames.length;
    globeEl.textContent = globeFrames[frameIndex];
  }
}, 300);

// --- Speaker Initiation ---
const ttsInstance = TTS();
ttsInstance.unlockSpeech();
let intervalID = null;
let visitedHistory = [];
// Store visited country history to prevent bouncing back and forth
let zoomDelayTimer = null;

function speaker() {
  if (!utils.isMuted()) {
    ttsInstance.speakElement(nameTextEl, {
      directSpeech: false,
      rate: 0.8,
      locale: "en-US",
    });
  }
}

// --- Map Initialization ---
const svg = d3.select("#map");
const defs = svg.append("defs");

// Hover Gradient (Soft)
const hoverGrad = defs
  .append("radialGradient")
  .attr("id", "hoverGradient")
  .attr("gradientUnits", "userSpaceOnUse")
  .attr("r", "50%");

// We use stop-opacity to animate the fade-in via D3 instead of CSS
const hoverStop1 = hoverGrad
  .append("stop")
  .attr("offset", "0%")
  .attr("stop-color", "var(--country-hover)")
  .attr("stop-opacity", 0.5); // Start invisible

const hoverStop2 = hoverGrad
  .append("stop")
  .attr("offset", "100%")
  .attr("stop-color", "var(--country-fill)")
  .attr("stop-opacity", 0.5); // Start invisible

// Active Gradient (Stronger contrast for the click)
const activeGrad = defs
  .append("radialGradient")
  .attr("id", "activeGradient")
  .attr("gradientUnits", "userSpaceOnUse")
  .attr("r", "0%"); // Start at 0

activeGrad
  .append("stop")
  .attr("offset", "0%")
  .attr("stop-color", "var(--country-active2)");
activeGrad
  .append("stop")
  .attr("offset", "100%")
  .attr("stop-color", "var(--country-active)");

const width = 960;
const height = 600;

svg
  .attr("viewBox", `0 0 ${width} ${height}`)
  .attr("preserveAspectRatio", "xMidYMid meet");

const g = svg.append("g");
const maxZoomLimit = 4;

function updateGradientPos(event, gradientId) {
  const [mx, my] = d3.pointer(event, g.node());
  d3.select(gradientId)
    .attr("cx", mx)
    .attr("cy", my)
    .attr("fx", mx)
    .attr("fy", my);
}

// Set up limited Zoom and Pan
const zoom = d3
  .zoom()
  .scaleExtent([1, maxZoomLimit])
  .translateExtent([
    [0, 0],
    [width, height],
  ])
  .on("zoom", (event) => {
    g.attr("transform", event.transform);
  });

svg.call(zoom);

// Updated Projection: Robinson Compromise
const projection = d3
  .geoRobinson()
  .scale(150)
  .translate([width / 2, height / 2]);

const path = d3.geoPath().projection(projection);

const dataUrl = "map_data.json";
// Check if the screen width is mobile-sized
const isMobile = () => window.innerWidth <= 768;

d3.json(dataUrl)
  .then((world) => {
    // --- HIDE THE LOADING SCREEN ---
    clearInterval(loadingTimer);
    const loadingScreen = document.getElementById("loading-screen");
    if (loadingScreen) {
      loadingScreen.style.opacity = "0";
      loadingScreen.style.visibility = "hidden";
      // remove it from the layout after the fade finishes
      setTimeout(() => {
        loadingScreen.style.display = "none";
      }, 500);
      setTimeout(() => {
        nameDisplayEl.classList.remove("show");
      }, 2000);
    }

    const countries = topojson.feature(world, world.objects.countries).features;

    g.selectAll("path")
      .data(countries)
      .enter()
      .append("path")
      .attr("d", path)
      .attr("class", "country")
      .style("opacity", 0) // Start completely invisible
      .on("pointermove", function (event) {
        // --- DISABLE HOVER ON MOBILE ---
        if (isMobile()) {
          return;
        }

        const el = d3.select(this);

        if (!el.classed("active")) {
          // Temporarily set the fill to the gradient URL
          el.style("fill", "url(#hoverGradient)");
          updateGradientPos(event, "#hoverGradient");
          el.classed("hovering", true);

          // Animate the opacity of the gradient stops to fade it in
          hoverStop1.transition().duration(50).attr("stop-opacity", 1);
          hoverStop2.transition().duration(100).attr("stop-opacity", 1);
        }
      })
      .on("pointerout", function () {
        // --- DISABLE HOVER ON MOBILE ---
        if (isMobile()) {
          return;
        }
        const el = d3.select(this);
        el.classed("hovering", false);

        // Fade the shared gradient out
        hoverStop1.transition().duration(100).attr("stop-opacity", 0.75);
        hoverStop2.transition().duration(100).attr("stop-opacity", 0.75);

        // Using setTimeout securely locks the context to THIS specific country path
        setTimeout(() => {
          // Double check that the user didn't re-hover or click during the 300ms fade
          if (!el.classed("hovering") && !el.classed("active")) {
            el.style("fill", null); // Remove the url(#hoverGradient)
          }
        }, 100);
      })
      .on("click", function (event, d) {
        // stops the click from "falling through" the country into the ocean
        event.stopPropagation();
        const el = d3.select(this);

        // Reset the hover styles immediately on click
        if (!isMobile()) {
          el.classed("hovering", false);
          hoverStop1.interrupt().attr("stop-opacity", 0.75);
          hoverStop2.interrupt().attr("stop-opacity", 0.75);
        }
        el.style("fill", "url(#activeGradient)");

        // Position the "source" of the flood where you clicked
        updateGradientPos(event, "#activeGradient");

        // The "Flood" effect: Animate radius from 0 to 100%
        d3.select("#activeGradient")
          .interrupt() // Stop any current animation
          .attr("r", "0%")
          .transition()
          .duration(800)
          .ease(d3.easeCubicOut)
          .attr("r", "150%");

        handleInteraction(this, d);
      })
      // ANIMATION LOGIC ---
      .transition() // Tell D3 to animate the next changes
      .duration(200) // Each country takes 200ms to fully fade in
      .delay((d, i) => i * 5) // Stagger them: index * 5 milliseconds
      .style("opacity", 1); // End state: fully visible
  })
  .catch((err) => {
    // --- Hide on error and Display error message ---
    const loadingScreen = document.getElementById("loading-screen");
    if (loadingScreen) {
      loadingScreen.style.display = "none";
    }
    console.error("Error loading map data:", err);
    nameDisplayEl.textContent =
      "Oops! Map couldn't load. Try refeshing the page!";
    nameDisplayEl.classList.add("show");
  });

function handleInteraction(element, data) {
  // hide existing name if any
  nameDisplayEl.classList.remove("show");
  void nameDisplayEl.offsetWidth;

  // remove selection from existing country and add to the selected country
  d3.selectAll(".country").classed("active", false);
  d3.select(element).classed("active", true);
  // --- Get country name ---
  const countryName = data.properties.name || "Unknown";

  const bounds = path.bounds(data);
  const dx = bounds[1][0] - bounds[0][0];
  const dy = bounds[1][1] - bounds[0][1];

  const x = (bounds[0][0] + bounds[1][0]) / 2;
  const y = (bounds[0][1] + bounds[1][1]) / 2;

  // --- Mobile Optimization Logic ---
  // Check if the screen width is mobile-sized
  // Dynamic Max Zoom: Allow deeper zooming on small screens
  const dynamicMaxZoom = isMobile() ? 8 : maxZoomLimit; // 8x on mobile, 4x on desktop

  // Dynamic Padding: Countries should take up more of the screen on mobile
  // 0.7 means it fills 70% of the screen, 0.4 means 40%
  const paddingFactor = isMobile() ? 0.7 : 0.4;

  // Calculate the perfect scale based on dynamic variables
  const scale = Math.max(
    1,
    Math.min(dynamicMaxZoom, paddingFactor / Math.max(dx / width, dy / height)),
  );

  // Y-Axis Offset: Shift the center down on mobile so the popup doesn't cover the country
  // Shifts the camera focus UP by 10% of the SVG height (which moves the map DOWN on screen)
  const yOffset = isMobile() ? height * 0.1 : 0;

  // If they click another country before the zoom starts, cancel the old zoom
  if (zoomDelayTimer) {
    clearTimeout(zoomDelayTimer);
  }
  // Wait 1s (matching the gradient duration) before zooming into the country
  zoomDelayTimer = setTimeout(() => {
    svg
      .transition()
      .duration(1000)
      .call(
        zoom.transform,
        d3.zoomIdentity
          .translate(width / 2 - x * scale, height / 2 + yOffset - y * scale)
          .scale(scale),
      );
    nameTextEl.textContent = countryName;
    nameDisplayEl.classList.add("show");
    speaker();
  }, 1000);

  if (extrainfoCheckbox && extrainfoCheckbox.checked) {
    let capital = data.properties.capital || "";
    let continent = data.properties.continent || "";

    // Use an array to collect only the valid, non-empty strings
    let infoArray = [];
    // Push data to the array only if it exists
    if (capital) {
      infoArray.push(`Capital: ${capital}`);
    }
    if (continent) {
      infoArray.push(`Continent: ${continent}`);
    }

    // If we have at least one valid piece of info, display it
    if (infoArray.length > 0) {
      // Join the array items with a line break HTML tag
      extraInfoEl.innerHTML = infoArray.join("<br>");
      extraInfoEl.style.display = "block";
    } else {
      // Hide the container if all three happened to be completely empty
      extraInfoEl.style.display = "none";
    }
  } else {
    // Hide the container if the checkbox is unchecked
    extraInfoEl.style.display = "none";
  }

  if (data.properties.flag_svg) {
    console.log(`Using SVG data for ${countryName} flag`);
    // Translate the SVG from json into a browser-readable image URL
    const svgDataUrl =
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(data.properties.flag_svg);
    flagImgEl.src = svgDataUrl;
    flagImgEl.style.display = "block";
  } else if (data.properties.alpha2) {
    console.log(`Using country code for ${countryName} flag`);
    // Utilize the alpha2 code we created in the python script
    flagImgEl.src = `https://flagcdn.com/w80/${data.properties.alpha2}.png`;
    flagImgEl.style.display = "block";
  } else {
    console.warn(`No SVG or code detected for country: ${countryName}`);
    flagImgEl.style.display = "none";
  }
}

// --- Reset Zoom Logic ---
function resetMap() {
  // Remove active state from all countries
  d3.selectAll(".country").classed("active", false);

  // Hide the popup display
  nameDisplayEl.classList.remove("show");

  // Smoothly zoom the map back to the original scale (1x) and center (0,0)
  svg.transition().duration(1500).call(
    zoom.transform,
    d3.zoomIdentity,
    // d3.zoomIdentity represents the default unzoomed state
  );
}

// Make the background (ocean) clickable to trigger the reset
svg.on("click", resetMap);

function clickNearByCountries() {
  utils.hideSettings();
  // Grab all countries and find the currently active one
  const allCountries = Array.from(document.querySelectorAll(".country"));
  if (allCountries.length === 0) {
    return;
  }

  const activeCountry = document.querySelector(".country.active");
  let nextCountryNode;

  if (!activeCountry) {
    // If nothing is selected yet, start randomly anywhere in the world
    nextCountryNode =
      allCountries[Math.floor(Math.random() * allCountries.length)];
  } else {
    // Get the mathematical center (x, y) of the current country
    const currentData = d3.select(activeCountry).datum();
    const [cx, cy] = path.centroid(currentData);
    const currentCountryId = currentData.id || currentData.properties.name;

    // Add current country to history (and keep history at a max of 10)
    visitedHistory.push(currentCountryId);
    if (visitedHistory.length > 10) {
      visitedHistory.shift();
    }

    // Measure the distance to all OTHER countries
    const distances = allCountries
      .filter((node) => node !== activeCountry)
      .map((node) => {
        const nodeData = d3.select(node).datum();
        const nodeId = nodeData.id || nodeData.properties.name;
        const [nx, ny] = path.centroid(nodeData);

        // Pythagorean theorem to find the straight-line distance
        const dist = Math.sqrt(Math.pow(nx - cx, 2) + Math.pow(ny - cy, 2));
        return { node, dist, nodeId };
      })
      // Exclude countries we just visited so we don't get stuck in a loop
      .filter((item) => !visitedHistory.includes(item.nodeId));

    // Sort the remaining countries by how close they are
    distances.sort((a, b) => a.dist - b.dist);

    // Pick randomly from the 4 closest unvisited neighbors to ensure "wandering"
    const nearestOptions = distances.slice(0, 4);

    if (nearestOptions.length > 0) {
      const randomNeighbor =
        nearestOptions[Math.floor(Math.random() * nearestOptions.length)];
      nextCountryNode = randomNeighbor.node;
    } else {
      // Fallback just in case history somehow filters everything out
      nextCountryNode =
        allCountries[Math.floor(Math.random() * allCountries.length)];
    }
  }

  // Trigger the click to run animations and TTS!
  if (nextCountryNode) {
    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
    });
    nextCountryNode.dispatchEvent(clickEvent);
  }
}
function autoplay() {
  if (intervalID) {
    clearInterval(intervalID);
  }
  clickNearByCountries();
  // Runs every 5 seconds
  intervalID = setInterval(clickNearByCountries, 5000);
}

function updateSettingsMenu() {
  // =========================
  // Settings Menu
  // =========================
  const autoplayCheckbox = document.getElementById("autoplay");

  // Toggle menu visibility
  settingsBtn.style.display = "block";
  utils.addListeners(settingsBtn, utils.onClickSettings);
  utils.addListeners(settingsIcon, utils.onClickSettings);

  function handleAutoplayToggle() {
    if (autoplayCheckbox.checked) {
      autoplay();
    } else {
      clearInterval(intervalID);
    }
  }

  function handleExtraInfoToggle() {
    if (extrainfoCheckbox.checked) {
      extraInfoEl.style.display = "block";
    } else {
      extraInfoEl.style.display = "none";
    }
  }
  utils.addUnifiedListeners(autoplayCheckbox, handleAutoplayToggle);
  utils.addUnifiedListeners(extrainfoCheckbox, handleExtraInfoToggle);
}

// =========================
// Event Listeners
// =========================
function handleKeydown(event) {
  const target = event.target;
  switch (event.code) {
    case "Space":
      // Ignore key presses if focused on an interactive element
      if (utils.isInteractiveElement(target)) {
        return;
      }
      event.preventDefault();
      clearInterval(intervalID);
      clickNearByCountries();
      break;
    case "Enter":
      // Ignore key presses if focused on an interactive element
      if (utils.isInteractiveElement(target)) {
        return;
      }
      event.preventDefault();
      clearInterval(intervalID);
      clickNearByCountries();
      break;
    case "KeyM":
      event.preventDefault();
      utils.hideSettings();
      utils.toggleMute();
      if (utils.isMuted()) {
        ttsInstance.cancel();
      } else {
        speaker();
      }
      break;
    case "KeyF":
      event.preventDefault();
      utils.toggleFullscreen();
      utils.hideSettings();
      break;
    case "KeyS":
      event.preventDefault();
      utils.onClickSettings();
      break;
    case "Escape":
      utils.hideSettings();
      utils.hideSidebar();
      break;
    case "Equal":
      event.preventDefault();
      utils.handleSidebar();
      break;
  }
}

utils.setFullscreenIcon();

/**
 * Initializes the clock when the DOM is fully loaded.
 */
document.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("keydown", handleKeydown);
  utils.updateMuteBtn();
  utils.updateFullScreenBtn();
  updateSettingsMenu();

  // update mute button if speech supported
  if (ttsInstance.isSpeechReady()) {
    utils.enableMuteBtn();
  } else {
    utils.disableMuteBtn();
  }
});
