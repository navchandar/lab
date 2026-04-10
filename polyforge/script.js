/**
 * Shape Coordinates are based on a 100x100 viewBox
 */
const SHAPE_LIB = {
  // --- Basic Polygons ---
  Triangle: { min: 3, d: "M 50 0 L 100 100 L 0 100 Z" },
  Square: { min: 4, d: "M 0 0 L 100 0 L 100 100 L 0 100 Z" },
  Rectangle: { min: 4, d: "M 10 25 H 90 V 75 H 10 Z" },
  Pentagon: { min: 5, d: "M 50 0 L 98 35 L 79 90 L 21 90 L 2 35 Z" },
  Hexagon: {
    min: 6,
    d: "M 50 0 L 93 25 L 93 75 L 50 100 L 7 75 L 7 25 Z",
  },
  Heptagon: {
    min: 7,
    d: "M 50 0 L 89 22 L 100 66 L 72 100 L 28 100 L 0 66 L 11 22 Z",
  },
  Octagon: {
    min: 8,
    d: "M 30 0 L 70 0 L 100 30 L 100 70 L 70 100 L 30 100 L 0 70 L 0 30 Z",
  },
  Nonagon: {
    min: 9,
    d: "M 50 0 L 82 11.7 L 100 41.3 L 94 75 L 67.1 97 L 32.9 97 L 6 75 L 0 41.3 L 17.9 11.7 Z",
  },
  Decagon: {
    min: 10,
    d: "M 50 0 L 79.4 9.5 L 100 34.5 L 100 65.5 L 79.4 90.5 L 50 100 L 20.6 90.5 L 0 65.5 L 0 34.5 L 20.6 9.5 Z",
  },

  // --- Geometric Variations ---
  Diamond: { min: 8, d: "M 50 0 L 100 50 L 50 100 L 0 50 Z" },
  Trapezoid: { min: 8, d: "M 20 20 H 80 L 100 80 H 0 Z" },
  Parallelogram: { min: 8, d: "M 25 20 H 100 L 75 80 H 0 Z" },
  Rhombus: { min: 8, d: "M 50 0 L 90 50 L 50 100 L 10 50 Z" },

  // --- Symbols & UI ---
  Home: {
    min: 10,
    d: "M 10 90 V 40 L 50 10 L 90 40 V 90 Z",
  },
  Cloud: {
    min: 30,
    d: "M 25 80 A 15 15 0 0 1 25 50 A 20 20 0 0 1 65 40 A 15 15 0 0 1 85 55 A 15 15 0 0 1 75 80 Z",
  },
  Lightning: {
    min: 12,
    d: "M 60 0 L 20 50 H 50 L 40 100 L 80 50 H 50 Z",
  },
  Star: {
    min: 10,
    d: "M 50 0 L 61 35 L 98 35 L 68 57 L 79 91 L 50 70 L 21 91 L 32 57 L 2 35 L 39 35 Z",
  },
  Heart: {
    min: 30,
    d: "M 50 30 C 50 0 0 0 0 40 C 0 70 50 100 50 100 C 50 100 100 70 100 40 C 100 0 50 0 50 30",
  },
  Circle: {
    min: 40,
    d: "M 50 0 A 50 50 0 1 1 50 100 A 50 50 0 1 1 50 0",
  },
  Ellipse: {
    min: 40,
    d: "M 0 50 A 50 30 0 1 1 100 50 A 50 30 0 1 1 0 50 Z",
  },
  Line: {
    min: 20,
    d: "M 0 100 L 25 100 L 50 100 L 75 100 L 100 100 L 100 95 L 75 95 L 50 95 L 25 95 L 0 95 Z",
  },
  Angle: {
    min: 20,
    d: "M 0 100 L 50 100 L 100 100 L 100 90 L 60 90 L 16 90 L 50 0 L 40 0 L 20 50 Z",
  },
  "Arrow Right": {
    min: 8,
    d: "M 0 30 L 60 30 L 60 0 L 100 50 L 60 100 L 60 70 L 0 70 Z",
  },
  "Arrow Left": {
    min: 8,
    d: "M 100 30 L 40 30 L 40 0 L 0 50 L 40 100 L 40 70 L 100 70 Z",
  },
  "Arrow Up": {
    min: 8,
    d: "M 30 100 V 40 H 0 L 50 0 L 100 40 H 70 V 100 Z",
  },
  "Arrow Down": {
    min: 8,
    d: "M 30 0 V 60 H 0 L 50 100 L 100 60 H 70 V 0 Z",
  },
  Chevron: {
    min: 10,
    d: "M 0 0 L 50 50 L 0 100 L 30 100 L 80 50 L 30 0 Z",
  },
  Cross: {
    min: 16,
    d: "M 35 0 H 65 V 35 H 100 V 65 H 65 V 100 H 35 V 65 H 0 V 35 H 35 Z",
  },
  Shield: {
    min: 42,
    d: "M 0 0 H 100 V 50 C 100 80 50 100 50 100 C 50 100 0 80 0 50 Z",
  },
  Message: { min: 8, d: "M 0 0 H 100 V 75 H 35 L 0 100 Z" },
  Crescent: {
    min: 25,
    d: "M 80 10 C 30 10 30 90 80 90 C 10 110 10 -10 80 10 Z",
  },
  Bolt: { min: 9, d: "M 60 0 L 20 50 H 50 L 40 100 L 80 40 H 50 Z" },
  Badge: {
    min: 20,
    d: "M 50 0 L 65 15 H 85 V 35 L 100 50 L 85 65 V 85 H 65 L 50 100 L 35 85 H 15 V 65 L 0 50 L 15 35 V 15 H 35 Z",
  },
  Ticket: {
    min: 70,
    d: "M 0 0 H 100 V 35 A 15 15 0 0 0 100 65 V 100 H 0 V 65 A 15 15 0 0 0 0 35 Z",
  },
  Infinity: {
    min: 50,
    d: "M 30 35 C 0 35 0 65 30 65 C 45 65 55 35 70 35 C 100 35 100 65 70 65 C 55 65 45 35 30 35 Z",
  },
  Clover: {
    min: 50,
    d: "M 50 50 C 50 20 20 20 20 50 C 20 80 50 80 50 50 C 50 80 80 80 80 50 C 80 20 50 20 50 50 M 50 50 V 90",
  },
};

// DOM Elements
const elements = {
  select: document.getElementById("shape-select"),
  points: document.getElementById("point-count"),
  engine: document.getElementById("engine"),
  canvas: document.getElementById("canvas-shape"),
  output: document.getElementById("output-code"),
  copy: document.getElementById("copy-btn"),
  copysvg: document.getElementById("copy-svg-btn"),
};

/**
 * Initialization Logic
 */
function init() {
  try {
    // Populate Select dropdown values
    const shapeNames = Object.keys(SHAPE_LIB);
    const options = shapeNames.map((name) => new Option(name, name));
    elements.select.append(...options);

    // Event Listeners
    elements.select.addEventListener("change", handleShapeChange);
    elements.points.addEventListener("input", render);
    elements.copy.addEventListener("click", copyClipPath);
    elements.copysvg.addEventListener("click", copySvgToClipboard);

    // Default State - Use the first key in the object
    elements.select.value = shapeNames[0];
    handleShapeChange(); // This will trigger the first render
  } catch (e) {
    console.error("Initialization Failed:", e);
  }
}

/**
 * Handles updating UI when a new shape is chosen
 */
function handleShapeChange() {
  const config = SHAPE_LIB[elements.select.value];
  elements.points.min = config.min;

  // Only reset value if current value is invalid for new shape
  if (parseInt(elements.points.value) < config.min || !elements.points.value) {
    elements.points.value = config.min;
  }
  render();
}

/**
 * High-Precision Vertex and SVG sampling to generate polygon points
 * Optimized for shape retention and auto-clamping
 * Automatically detects sharp corners and smoothly traverses curves.
 */
function render() {
  const shape = SHAPE_LIB[elements.select.value];
  let target = parseInt(elements.points.value);

  // Validation & Auto-clamp
  if (isNaN(target) || target < shape.min) {
    target = shape.min;
    elements.points.value = target;
  }

  elements.engine.setAttribute("d", shape.d);
  const totalLen = elements.engine.getTotalLength();

  // Advanced Corner Detection (The Hybrid Heuristic)
  const corners = [];
  const scanResolution = 600; // Higher resolution for better curve analysis
  let lastAngle = null;

  for (let i = 0; i <= scanResolution; i++) {
    const dist = (i / scanResolution) * totalLen;
    // Step slightly backward and forward to find the tangent angle
    const p1 = elements.engine.getPointAtLength(Math.max(0, dist - 0.5));
    const p2 = elements.engine.getPointAtLength(Math.min(totalLen, dist + 0.5));

    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

    if (lastAngle !== null) {
      // Calculate angle difference and normalize it (handle 360-degree wrap-around)
      let delta = Math.abs(angle - lastAngle);
      if (delta > Math.PI) {
        delta = 2 * Math.PI - delta;
      }

      // THRESHOLD: 0.25 radians (~14 degrees)
      // Smooth curves change by tiny fractions.
      // Sharp corners (like a star or shield point) change abruptly.
      if (delta > 0.25) {
        const pt = elements.engine.getPointAtLength(dist);
        corners.push({ dist, x: pt.x, y: pt.y });
      }
    }
    lastAngle = angle;
  }

  // Always lock in the absolute start/end point
  if (corners.length === 0 || corners[0].dist > 1) {
    const start = elements.engine.getPointAtLength(0);
    corners.unshift({ dist: 0, x: start.x, y: start.y });
  }

  // Segment Preparation
  // A Circle will have 1 long segment. A Square will have 4. A Shield will have 3.
  const segments = [];
  for (let i = 0; i < corners.length; i++) {
    const startDist = corners[i].dist;
    const endDist = i === corners.length - 1 ? totalLen : corners[i + 1].dist;
    segments.push({
      startDist: startDist,
      endDist: endDist,
      length: endDist - startDist,
      pointsToPlace: 0,
      startX: corners[i].x,
      startY: corners[i].y,
    });
  }

  // Mathematical Precision: Point Distribution
  // We subtract the corners we've already "locked in"
  let pointsLeftToDistribute = target - corners.length;

  // First Pass: Assign the floor value (guaranteed points)
  segments.forEach((seg) => {
    const share = (seg.length / totalLen) * (target - corners.length);
    seg.pointsToPlace = Math.floor(share);
    pointsLeftToDistribute -= seg.pointsToPlace;
  });

  // Second Pass: Distribute the remainders to the longest segments first
  // This is the "Self-Healing" part that ensures the count is EXACT
  const sortedByLength = [...segments].sort((a, b) => b.length - a.length);
  while (pointsLeftToDistribute > 0) {
    for (let seg of sortedByLength) {
      if (pointsLeftToDistribute <= 0) {
        break;
      }
      seg.pointsToPlace++;
      pointsLeftToDistribute--;
    }
  }

  // Final Array Construction
  // Because we use getPointAtLength on the native SVG, points distributed
  // along a "curved" segment will perfectly follow the curve!
  const finalPoints = [];
  segments.forEach((seg) => {
    // Add the Anchor/Corner
    finalPoints.push(
      `${parseFloat(seg.startX).toFixed(2)}% ${parseFloat(seg.startY).toFixed(2)}%`,
    );

    // Add the distributed points along this segment
    for (let j = 1; j <= seg.pointsToPlace; j++) {
      const subDist =
        seg.startDist + (j / (seg.pointsToPlace + 1)) * seg.length;
      const pt = elements.engine.getPointAtLength(subDist);
      finalPoints.push(`${pt.x.toFixed(2)}% ${pt.y.toFixed(2)}%`);
    }
  });

  // --- Apply Anti-Twist Alignment ---
  const alignedPoints = alignToTopCenter(finalPoints);

  // Final Integrity Check
  if (alignedPoints.length !== target) {
    console.warn(
      `Drift detected in Final Points: ${alignedPoints.length} vs Input:${target}!`,
    );
  }

  // Update UI using the aligned points
  const resultStr = `polygon(${alignedPoints.join(", ")})`;
  elements.canvas.style.clipPath = resultStr;
  elements.canvas.style.display = "block";
  elements.output.textContent = `clip-path: ${resultStr};`;
  console.log("Rendered Shaped:", elements.select.value);
}

/**
 * Aligns the polygon array so the point closest to Top-Center (50% 0%) is at Index 0.
 * Prevents "twisting" during CSS clip-path morphing animations.
 */
function alignToTopCenter(points) {
  let closestIndex = 0;
  let minDistance = Infinity;

  for (let i = 0; i < points.length; i++) {
    // Extract X and Y numbers from the "X% Y%" string
    const [xStr, yStr] = points[i].replace(/%/g, "").split(" ");
    const x = parseFloat(xStr);
    const y = parseFloat(yStr);

    // Calculate distance to 50% 0% (We skip Math.sqrt for performance since we only need relative comparison)
    const distanceToTopCenter = Math.pow(x - 50, 2) + Math.pow(y - 0, 2);

    if (distanceToTopCenter < minDistance) {
      minDistance = distanceToTopCenter;
      closestIndex = i;
    }
  }

  // Rotate the array without losing or scrambling points
  return [...points.slice(closestIndex), ...points.slice(0, closestIndex)];
}

function copyClipPath() {
  try {
    navigator.clipboard.writeText(elements.output.textContent);
    elements.copy.textContent = "✅";
    setTimeout(() => (elements.copy.textContent = "📋"), 1000);
  } catch (err) {
    console.error("SVG Copy failed", err);
    elements.copy.textContent = "⚠️";
    setTimeout(() => (elements.copy.textContent = "📋"), 1000);
  }
}

/**
 * Serializes the current clip-path into a standard SVG string
 */
async function copySvgToClipboard() {
  const clipPath = elements.canvas.style.clipPath;
  if (!clipPath.includes("polygon")) {
    console.warn("No polygon shape found to copy!");
    return;
  }

  try {
    // Extract coordinates: "50% 0%, 100% 100%..." -> "50 0, 100 100..."
    const pointsRaw = clipPath.replace("polygon(", "").replace(")", "");
    const svgPoints = pointsRaw
      .split(",")
      .map((p) => p.trim().replace(/%/g, ""))
      .join(" ");

    const svgTemplate = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <polygon points="${svgPoints}" fill="currentColor"/>
</svg>`;

    await navigator.clipboard.writeText(svgTemplate);
    elements.copysvg.textContent = "✅";
    setTimeout(() => (elements.copysvg.textContent = "📋"), 1000);
  } catch (err) {
    console.error("SVG Copy failed", err);
    elements.copysvg.textContent = "⚠️";
    setTimeout(() => (elements.copysvg.textContent = "📋"), 1000);
  }
}

// Run
init();
