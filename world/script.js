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
const startTime = Date.now();
const MIN_LOAD_TIME = 2500;

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
  requestAnimationFrame(() => {
    const [mx, my] = d3.pointer(event, g.node());
    d3.select(gradientId)
      .attr("cx", mx)
      .attr("cy", my)
      .attr("fx", mx)
      .attr("fy", my);
  });
}

function hideLoading() {
  const loadingScreen = document.getElementById("loading-screen");
  if (!loadingScreen) {
    return;
  }

  const currentTime = Date.now();
  const elapsedTime = currentTime - startTime;

  // Calculate how much longer we need to wait to hit the minimum
  const remainingTime = Math.max(0, MIN_LOAD_TIME - elapsedTime);

  setTimeout(() => {
    loadingScreen.style.opacity = "0";
    loadingScreen.style.visibility = "hidden";

    setTimeout(() => {
      loadingScreen.style.display = "none";
    }, 500);
    intervalID = setTimeout(() => {
      nameDisplayEl.classList.remove("show");
    }, 3000);
  }, remainingTime);
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
const country = "country_data.json";

// Check if the screen width is mobile-sized
let isMobile = window.innerWidth <= 768;
window.addEventListener("resize", () => {
  isMobile = window.innerWidth <= 768;
});

Promise.all([d3.json(dataUrl), d3.json(country)])
  .then(([topoData, countryData]) => {
    // Both data files are now loaded and sorted!
    const countries = topojson.feature(
      topoData,
      topoData.objects.countries,
    ).features;

    // --- HIDE THE LOADING SCREEN ---
    hideLoading();

    g.selectAll("path")
      .data(countries)
      .enter()
      .append("path")
      .attr("d", path)
      .attr("class", "country")
      .style("opacity", 0) // Start completely invisible
      .style("will-change", "fill, opacity")
      .on("pointermove", function (event) {
        // --- DISABLE HOVER ON MOBILE ---
        if (isMobile) {
          return;
        }

        const el = d3.select(this);

        if (!el.classed("active")) {
          // Only update attributes if necessary to avoid layout thrashing
          if (!el.classed("hovering")) {
            el.style("fill", "url(#hoverGradient)");
            el.classed("hovering", true);
            hoverStop1.transition().duration(100).attr("stop-opacity", 1);
            hoverStop2.transition().duration(200).attr("stop-opacity", 1);
          }
          updateGradientPos(event, "#hoverGradient");
        }
      })
      .on("pointerout", function () {
        // --- DISABLE HOVER ON MOBILE ---
        if (isMobile) {
          return;
        }
        const el = d3.select(this);
        el.classed("hovering", false);

        // Fade the shared gradient out
        hoverStop1.interrupt().transition().duration(150).attr("stop-opacity", 0);
        hoverStop2.interrupt().transition().duration(150).attr("stop-opacity", 0);

        // Using setTimeout securely locks the context to THIS specific country path
        setTimeout(() => {
          // Double check that the user didn't re-hover or click during the fade
          if (!el.classed("hovering") && !el.classed("active")) {
            el.style("fill", null); // Remove the url(#hoverGradient)
          }
        }, 150);
      })
      .on("click", function (event, d) {
        // stops the click from "falling through" the country into the ocean
        event.stopPropagation();
        // FIX: event.isTrusted is ONLY true for real human mouse clicks
        if (event.isTrusted) {
          if (intervalID) {
            clearInterval(intervalID);
          }
          // Uncheck the autoplay box in the UI if a human takes over
          const autoplayCheckbox = document.getElementById("autoplay");
          if (autoplayCheckbox) {
            autoplayCheckbox.checked = false;
          }
        }

        const el = d3.select(this);

        d3.selectAll(".country").classed("active", false).style("fill", null);

        // Reset the hover styles immediately on click
        el.classed("hovering", false);
        hoverStop1.interrupt().attr("stop-opacity", 0.75);
        hoverStop2.interrupt().attr("stop-opacity", 0.75);
        el.classed("active", true);
        el.style("fill", "url(#activeGradient)");

        // Position the "source" of the flood where you clicked
        updateGradientPos(event, "#activeGradient");

        // The "Flood" effect: Animate radius from 0 to 100%
        d3.select("#activeGradient")
          .interrupt() // Stop any current animation
          .attr("r", "0%")
          .transition()
          .duration(500)
          .ease(d3.easeCubicOut)
          .attr("r", "120%");

        const countryId = String(d.id).padStart(3, "0");
        const info = countryData[countryId];
        console.log("Found Country:", info?.name);
        handleInteraction(this, d, info);
      })
      // ANIMATION LOGIC ---
      .transition() // Tell D3 to animate the next changes
      .duration(250) // Each country takes 200ms to fully fade in
      .delay((d, i) => i * 5) // Stagger them: index * 5 milliseconds
      .style("opacity", 1); // End state: fully visible
  })
  .catch((err) => {
    // --- Hide on error and Display error message ---
    hideLoading();
    console.error("Error loading map data:", err);
    nameDisplayEl.textContent =
      "Oops! Map couldn't load. Try refeshing the page!";
    nameDisplayEl.classList.add("show");
  });

// Helper to keep handleInteraction clean
function updateExtraInfo(info) {
  if (extrainfoCheckbox && extrainfoCheckbox.checked && info) {
    let capital = info.capital || "";
    let continent = info.continent || "";
    let infoArray = [];
    if (capital) {
      infoArray.push(`Capital: ${capital}`);
    }
    if (continent) {
      infoArray.push(`Continent: ${continent}`);
    }
    if (infoArray.length > 0) {
      extraInfoEl.innerHTML = infoArray.join("<br>");
      extraInfoEl.style.display = "block";
    } else {
      extraInfoEl.style.display = "none";
    }
  } else {
    extraInfoEl.style.display = "none";
  }
}

function updateFlag(info, countryName) {
  if (!flagImgEl || !countryName) {
    return;
  }

  if (info?.flag_svg) {
    const svgDataUrl =
      "data:image/svg+xml;charset=utf-8," + encodeURIComponent(info.flag_svg);
    flagImgEl.src = svgDataUrl;
    flagImgEl.style.display = "block";
  } else if (info?.alpha2) {
    flagImgEl.src = `https://flagcdn.com/w80/${info.alpha2.toLowerCase()}.png`;
    flagImgEl.style.display = "block";
  } else {
    flagImgEl.style.display = "none";
  }
}

// Helper to calculate dynamic duration
function getTransitionDuration(targetX, targetY, targetScale) {
  // Get current transform states
  const currentTransform = d3.zoomTransform(svg.node());
  const currX = currentTransform.x;
  const currY = currentTransform.y;
  const currK = currentTransform.k;

  // Calculate "Distance" to travel
  // We factor in both coordinate distance and the change in zoom level
  const dx = targetX - currX;
  const dy = targetY - currY;
  const dk = Math.abs(targetScale - currK) * 100; // Weight scale change

  const distance = Math.sqrt(dx * dx + dy * dy) + dk;

  // Minimum 500ms, Maximum 1500ms
  // This makes long jumps feel cinematic and short jumps feel snappy
  return Math.max(500, Math.min(1500, distance * 0.8));
}

function handleInteraction(element, data, info) {
  // hide existing name if any
  nameDisplayEl.classList.remove("show");
  void nameDisplayEl.offsetWidth;
  // --- Get country name ---
  const countryName = info?.name || data.properties?.name || "Unknown";
  const bounds = path.bounds(data);
  const dx = bounds[1][0] - bounds[0][0];
  const dy = bounds[1][1] - bounds[0][1];

  const x = (bounds[0][0] + bounds[1][0]) / 2;
  const y = (bounds[0][1] + bounds[1][1]) / 2;

  // --- Mobile Optimization Logic ---
  // Check if the screen width is mobile-sized
  // Dynamic Max Zoom: Allow deeper zooming on small screens
  const dynamicMaxZoom = isMobile ? 8 : maxZoomLimit; // 8x on mobile, 4x on desktop

  // Dynamic Padding: Countries should take up more of the screen on mobile
  // 0.7 means it fills 70% of the screen, 0.4 means 40%
  const paddingFactor = isMobile ? 0.8 : 0.5;

  // Calculate the perfect scale based on dynamic variables
  const scale = Math.max(
    1,
    Math.min(dynamicMaxZoom, paddingFactor / Math.max(dx / width, dy / height)),
  );

  // Y-Axis Offset: Shift the center down on mobile so the popup doesn't cover the country
  // Shifts the camera focus UP by 10% of the SVG height (which moves the map DOWN on screen)
  const yOffset = isMobile ? height * 0.1 : 0;

  // Calculate the target translation
  const targetX = width / 2 - x * scale;
  const targetY = height / 2 + yOffset - y * scale;

  // DYNAMIC SPEED: Calculate duration based on distance
  const dynamicDuration = getTransitionDuration(targetX, targetY, scale);

  // If they click another country before the zoom starts, cancel the old zoom
  if (zoomDelayTimer) {
    clearTimeout(zoomDelayTimer);
  }
  // Wait 1s (matching the gradient duration) before zooming into the country
  zoomDelayTimer = setTimeout(() => {
    svg
      .transition()
      .duration(dynamicDuration)
      .ease(d3.easeCubicInOut)
      .call(
        zoom.transform,
        d3.zoomIdentity.translate(targetX, targetY).scale(scale),
      )
      .on("end", () => {
        // This only runs AFTER the 1s zoom animation finishes
        setTimeout(() => {
          nameTextEl.textContent = countryName;
          updateFlag(info, countryName);
          updateExtraInfo(info);
          nameDisplayEl.classList.add("show");
          speaker();
        }, 10);
      });
  }, 400);
}

// --- Reset Zoom Logic ---
function resetMap() {
  // Remove active state from all countries
  d3.selectAll(".country").classed("active", false).style("fill", null);

  // Hide the popup display
  nameDisplayEl.classList.remove("show");

  // Smoothly zoom the map back to the original scale (1x) and center (0,0)
  svg
    .transition()
    .duration(1200)
    .ease(d3.easeExpOut) // Fast start, very slow finish for a "cinematic" feel
    .call(zoom.transform, d3.zoomIdentity);
  // d3.zoomIdentity represents the default unzoomed state
}

// Make the background (ocean) clickable to trigger the reset
svg.on("click", resetMap);

function clickNearByCountries() {
  utils.hideSettings();
  d3.selectAll(".country").classed("hovering", false).style("fill", null);

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
  utils.hideSidebar();

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
      resetMap();
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
