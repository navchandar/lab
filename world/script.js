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
const defs = svg.append("defs");

// Hover Gradient (Soft)
const hoverGrad = defs
    .append("radialGradient")
    .attr("id", "hoverGradient")
    .attr("gradientUnits", "userSpaceOnUse")
    .attr("r", "15%");

// We use stop-opacity to animate the fade-in via D3 instead of CSS
const hoverStop1 = hoverGrad
    .append("stop")
    .attr("offset", "0%")
    .attr("stop-color", "var(--country-hover)")
    .attr("stop-opacity", 0.75); // Start invisible

const hoverStop2 = hoverGrad
    .append("stop")
    .attr("offset", "100%")
    .attr("stop-color", "var(--country-fill)")
    .attr("stop-opacity", 0.75); // Start invisible

// Active Gradient (Stronger contrast for the click)
const activeGrad = defs
    .append("radialGradient")
    .attr("id", "activeGradient")
    .attr("gradientUnits", "userSpaceOnUse")
    .attr("r", "0%");

activeGrad
    .append("stop")
    .attr("offset", "0%")
    .attr("stop-color", "var(--country-active2)");
activeGrad
    .append("stop")
    .attr("offset", "20%")
    .attr("stop-color", "var(--country-active)");
activeGrad
    .append("stop")
    .attr("offset", "100%")
    .attr("stop-color", "var(--country-active)");

const width = 960;
const height = 600;

svg.attr("viewBox", `0 0 ${width} ${height}`).attr(
    "preserveAspectRatio",
    "xMidYMid meet",
);

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

const dataUrl = "map_data.json";

d3.json(dataUrl)
    .then((world) => {
        const countries = topojson.feature(
            world,
            world.objects.countries,
        ).features;

        g.selectAll("path")
            .data(countries)
            .enter()
            .append("path")
            .attr("d", path)
            .attr("class", "country")
            .style("opacity", 0) // Start completely invisible
            .on("pointermove", function (event) {
                const el = d3.select(this);

                if (!el.classed("active")) {
                    // Temporarily set the fill to the gradient URL
                    el.style("fill", "url(#hoverGradient)");
                    updateGradientPos(event, "#hoverGradient");
                    el.classed("hovering", true);

                    // Animate the opacity of the gradient stops to fade it in
                    hoverStop1
                        .transition()
                        .duration(100)
                        .attr("stop-opacity", 1);
                    hoverStop2
                        .transition()
                        .duration(150)
                        .attr("stop-opacity", 1);
                }
            })
            .on("pointerout", function () {
                const el = d3.select(this);
                el.classed("hovering", false);

                // Fade the shared gradient out
                hoverStop1
                    .transition()
                    .duration(100)
                    .attr("stop-opacity", 0.75);
                hoverStop2
                    .transition()
                    .duration(100)
                    .attr("stop-opacity", 0.75);

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
                el.style("fill", null);
                el.classed("hovering", false);

                hoverStop1.interrupt().attr("stop-opacity", 0.75);
                hoverStop2.interrupt().attr("stop-opacity", 0.75);

                updateGradientPos(event, "#activeGradient");

                // The "Flood" effect: Animate radius from 0 to 100%
                d3.select("#activeGradient")
                    .interrupt()
                    .attr("r", "0%")
                    .transition()
                    .duration(2500)
                    .ease(d3.easeCubicOut)
                    .attr("r", "100%");

                handleInteraction(this, d);
            })
            // ANIMATION LOGIC ---
            .transition() // Tell D3 to animate the next changes
            .duration(200) // Each country takes 200ms to fully fade in
            .delay((d, i) => i * 5) // Stagger them: index * 5 milliseconds
            .style("opacity", 1); // End state: fully visible
    })
    .catch((err) => {
        console.error("Error loading map data:", err);
        nameDisplayEl.textContent = "Oops! Map couldn't load.";
        nameDisplayEl.classList.add("show");
    });

function handleInteraction(element, data) {
    d3.selectAll(".country").classed("active", false);
    d3.select(element).classed("active", true);

    const bounds = path.bounds(data);
    const dx = bounds[1][0] - bounds[0][0];
    const dy = bounds[1][1] - bounds[0][1];

    const x = (bounds[0][0] + bounds[1][0]) / 2;
    const y = (bounds[0][1] + bounds[1][1]) / 2;

    // --- Mobile Optimization Logic ---
    // Check if the screen width is mobile-sized (768px matches your CSS breakpoint)
    const isMobile = window.innerWidth <= 768;

    // 1. Dynamic Max Zoom: Allow deeper zooming on small screens
    const dynamicMaxZoom = isMobile ? 8 : maxZoomLimit; // 8x on mobile, 4x on desktop

    // 2. Dynamic Padding: Countries should take up more of the screen on mobile
    // 0.7 means it fills 70% of the screen, 0.4 means 40%
    const paddingFactor = isMobile ? 0.7 : 0.4;

    // Calculate the perfect scale based on our dynamic variables
    const scale = Math.max(
        1,
        Math.min(
            dynamicMaxZoom,
            paddingFactor / Math.max(dx / width, dy / height),
        ),
    );

    // 3. Y-Axis Offset: Shift the center down on mobile so the popup doesn't cover the country
    // Shifts the camera focus UP by 10% of the SVG height (which moves the map DOWN on screen)
    const yOffset = isMobile ? height * 0.1 : 0;

    svg.transition()
        .duration(1500)
        .call(
            zoom.transform,
            d3.zoomIdentity
                .translate(
                    width / 2 - x * scale,
                    height / 2 + yOffset - y * scale,
                )
                .scale(scale),
        );

    // --- UI Updates ---
    const countryName = data.properties.name || "Unknown";
    nameTextEl.textContent = countryName;

    // Utilize the alpha2 code we created in the python script
    if (data.properties.alpha2) {
        flagImgEl.src = `https://flagcdn.com/w80/${data.properties.alpha2}.png`;
        flagImgEl.style.display = "block";
    } else {
        flagImgEl.style.display = "none";
    }

    nameDisplayEl.classList.remove("show");
    void nameDisplayEl.offsetWidth;
    nameDisplayEl.classList.add("show");

    speaker();
}

// --- Reset Zoom Logic ---
function resetMap() {
    // 1. Remove active state from all countries
    d3.selectAll(".country").classed("active", false);

    // 2. Hide the popup display
    nameDisplayEl.classList.remove("show");

    // 3. Smoothly zoom the map back to the original scale (1x) and center (0,0)
    svg.transition().duration(1500).call(
        zoom.transform,
        d3.zoomIdentity, // d3.zoomIdentity represents the default unzoomed state
    );
}

// Make the background (ocean) clickable to trigger the reset
svg.on("click", resetMap);

// --- Keyboard Listeners mapping to your existing keys ---
window.addEventListener("keydown", (event) => {
    const target = event.target;
    // Your utils handling goes here
});
