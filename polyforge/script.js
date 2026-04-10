/**
 * Shape Coordinates are based on a 100x100 viewBox
 */
const SHAPE_LIB = {
  // --- Basic Polygons ---
  Triangle: { min: 3, d: "M 50 0 L 100 100 L 0 100 Z" },
  Square: {
    min: 8,
    d: "M 50 0 L 100 0 L 100 100 L 0 100 L 0 0 Z",
  },

  Rectangle: {
    min: 8,
    d: "M 50 25 L 90 25 L 90 75 L 10 75 L 10 25 Z",
  },
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
    min: 9,
    d: "M 50 0 L 70 0 L 100 30 L 100 70 L 70 100 L 30 100 L 0 70 L 0 30 L 30 0 Z",
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
  Diamond: {
    min: 8,
    d: "M 50 0 L 100 50 L 50 100 L 0 50 Z",
  },
  Trapezoid: {
    min: 8,
    d: "M 50 20 L 80 20 L 100 80 L 0 80 L 20 20 Z",
  },
  Parallelogram: {
    min: 8,
    d: "M 50 20 L 100 20 L 75 80 L 0 80 L 25 20 Z",
  },
  Rhombus: {
    min: 8,
    d: "M 50 0 L 90 50 L 50 100 L 10 50 Z",
  },
  // --- Symbols & UI ---
  Home: {
    min: 5,
    d: "M 50 10 L 90 40 V 90 H 10 V 40 Z",
  },
  Cloud: {
    min: 30,
    d: "M 50 25 C 65 25 75 35 78 45 C 88 45 95 55 90 70 C 85 80 75 80 75 80 H 25 C 25 80 15 80 10 70 C 5 55 12 45 22 45 C 25 35 35 25 50 25 Z",
  },
  Lightning: {
    min: 7,
    d: "M 50 0 L 15 60 H 50 L 35 100 L 85 40 H 50 Z",
  },
  Star: {
    min: 10,
    d: "M 50 0 L 61 35 L 98 35 L 68 57 L 79 91 L 50 70 L 21 91 L 32 57 L 2 35 L 39 35 Z",
  },
  Crescent: {
    min: 25,
    d: "M 50 0 C 100 0 100 100 50 100 C 80 80 80 20 50 0 Z",
  },
  Heart: {
    min: 30,
    d: "M 50 30 C 50 0 0 0 0 40 C 0 70 50 100 50 100 C 50 100 100 70 100 40 C 100 0 50 0 50 30",
  },
  Circle: {
    min: 40,
    d: "M 50 0 C 77.6 0 100 22.4 100 50 C 100 77.6 77.6 100 50 100 C 22.4 100 0 77.6 0 50 C 0 22.4 22.4 0 50 0 Z",
  },
  Ellipse: {
    min: 40,
    d: "M 50 20 C 77.6 20 100 33.4 100 50 C 100 66.6 77.6 80 50 80 C 22.4 80 0 66.6 0 50 C 0 33.4 22.4 20 50 20 Z",
  },
  Line: {
    min: 4,
    d: "M 50 90 H 100 V 100 H 0 V 90 Z",
  },
  Angle: {
    min: 8,
    d: "M 50 0 L 40 0 L 20 50 L 0 100 H 100 V 90 H 60 L 16 90 Z",
  },

  // --- Directional Arrows ---
  "Arrow Right": {
    min: 7,
    d: "M 50 30 H 60 V 0 L 100 50 L 60 100 V 70 H 0 V 30 Z",
  },
  "Arrow Left": {
    min: 7,
    d: "M 50 30 H 100 V 70 H 40 V 100 L 0 50 L 40 0 V 30 Z",
  },
  "Arrow Up": {
    min: 7,
    d: "M 50 0 L 100 40 H 70 V 100 H 30 V 40 H 0 Z",
  },
  "Arrow Down": {
    min: 7,
    d: "M 50 0 H 70 V 60 H 100 L 50 100 L 0 60 H 30 V 0 Z",
  },

  // --- UI Elements ---
  Chevron: {
    min: 6,
    d: "M 50 20 L 80 50 L 30 100 H 0 L 50 50 L 0 0 H 30 Z",
  },
  Cross: {
    min: 12,
    d: "M 50 0 H 65 V 35 H 100 V 65 H 65 V 100 H 35 V 65 H 0 V 35 H 35 V 0 Z",
  },
  Shield: {
    min: 15,
    d: "M 50 0 H 100 V 50 C 100 80 50 100 50 100 C 50 100 0 80 0 50 V 0 Z",
  },
  Message: {
    min: 6,
    d: "M 50 0 H 100 V 75 H 35 L 0 100 V 0 Z",
  },
  Badge: {
    min: 16,
    d: "M 50 0 L 65 15 H 85 V 35 L 100 50 L 85 65 V 85 H 65 L 50 100 L 35 85 H 15 V 65 L 0 50 L 15 35 V 15 H 35 Z",
  },
  Ticket: {
    min: 12,
    d: "M 50 0 H 100 V 35 C 91.7 35 85 41.7 85 50 C 85 58.3 91.7 65 100 65 V 100 H 0 V 65 C 8.3 65 15 58.3 15 50 C 15 41.7 8.3 35 0 35 V 0 Z",
  },
  Infinity: {
    min: 30,
    d: "M 50 45 C 75 10 100 25 100 50 C 100 75 75 90 50 55 C 25 90 0 75 0 50 C 0 25 25 10 50 45 Z",
  },
  Clover: {
    min: 40,
    d: "M 50 0 C 75 0 75 40 55 45 C 60 25 100 25 100 50 C 100 75 60 75 55 55 C 75 60 75 100 50 100 C 25 100 25 60 45 55 C 40 75 0 75 0 50 C 0 25 40 25 45 45 C 25 40 25 0 50 0 Z",
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

  // Initialize our Pure Math Engine
  const mathEngine = new SVGMathEngine(shape.d);
  const totalLen = mathEngine.totalLength;

  // Extract Exact Mathematical Corners (The AST Junctions)
  const segments = [];
  let currentDist = 0;

  for (let seg of mathEngine.segments) {
    segments.push({
      startDist: currentDist,
      endDist: currentDist + seg.length,
      length: seg.length,
      pointsToPlace: 0,
      startX: seg.getPoint(0).x,
      startY: seg.getPoint(0).y,
    });
    currentDist += seg.length;
  }

  // Exact Point Distribution
  let pointsLeftToDistribute = target - segments.length;

  // First Pass: Floor allocation
  segments.forEach((seg) => {
    const share = (seg.length / totalLen) * (target - segments.length);
    seg.pointsToPlace = Math.floor(share);
    pointsLeftToDistribute -= seg.pointsToPlace;
  });

  // Second Pass: Remainder distribution via sorting
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

  // Final Array Construction using Math
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
      // Get coordinates directly from JS Memory, no DOM querying!
      const pt = mathEngine.getPointAtLength(subDist);
      finalPoints.push(`${pt.x.toFixed(2)}% ${pt.y.toFixed(2)}%`);
    }
  });

  // --- Apply Anti-Twist Alignment ---
  // const alignedPoints = alignToTopCenter(finalPoints);
  const alignedPoints = finalPoints;

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

class SVGMathEngine {
  constructor(d) {
    this.segments = [];
    this.totalLength = 0;
    this.parse(d);
  }

  parse(d) {
    // Regex to extract commands and numbers
    const tokens = d.match(
      /[a-zA-Z]|[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g,
    );
    let x = 0,
      y = 0,
      startX = 0,
      startY = 0;
    let i = 0;

    while (i < tokens.length) {
      const cmd = tokens[i++];
      if (cmd === "M") {
        x = parseFloat(tokens[i++]);
        y = parseFloat(tokens[i++]);
        startX = x;
        startY = y;
      } else if (cmd === "L") {
        let nx = parseFloat(tokens[i++]),
          ny = parseFloat(tokens[i++]);
        this.addSegment(new LineSegment(x, y, nx, ny));
        x = nx;
        y = ny;
      } else if (cmd === "H") {
        let nx = parseFloat(tokens[i++]);
        this.addSegment(new LineSegment(x, y, nx, y));
        x = nx;
      } else if (cmd === "V") {
        let ny = parseFloat(tokens[i++]);
        this.addSegment(new LineSegment(x, y, x, ny));
        y = ny;
      } else if (cmd === "C") {
        let cx1 = parseFloat(tokens[i++]),
          cy1 = parseFloat(tokens[i++]);
        let cx2 = parseFloat(tokens[i++]),
          cy2 = parseFloat(tokens[i++]);
        let nx = parseFloat(tokens[i++]),
          ny = parseFloat(tokens[i++]);
        this.addSegment(new BezierSegment(x, y, cx1, cy1, cx2, cy2, nx, ny));
        x = nx;
        y = ny;
      } else if (cmd === "Z") {
        this.addSegment(new LineSegment(x, y, startX, startY));
        x = startX;
        y = startY;
      }
    }
  }

  addSegment(seg) {
    if (seg.length > 0) {
      this.segments.push(seg);
      this.totalLength += seg.length;
    }
  }

  getPointAtLength(distance) {
    if (distance <= 0) {
      return this.segments[0].getPoint(0);
    }
    if (distance >= this.totalLength) {
      return this.segments[this.segments.length - 1].getPoint(1);
    }

    let currentDist = 0;
    for (let seg of this.segments) {
      if (currentDist + seg.length >= distance) {
        // Find how far along THIS specific segment we are (from 0.0 to 1.0)
        let t = (distance - currentDist) / seg.length;
        return seg.getPoint(t);
      }
      currentDist += seg.length;
    }
  }
}

// --- Mathematical Geometry Classes ---

class LineSegment {
  constructor(x0, y0, x1, y1) {
    this.x0 = x0;
    this.y0 = y0;
    this.x1 = x1;
    this.y1 = y1;
    this.length = Math.hypot(x1 - x0, y1 - y0);
  }
  getPoint(t) {
    return {
      x: this.x0 + (this.x1 - this.x0) * t,
      y: this.y0 + (this.y1 - this.y0) * t,
    };
  }
}

class BezierSegment {
  constructor(x0, y0, cx1, cy1, cx2, cy2, x1, y1) {
    this.pts = [x0, y0, cx1, cy1, cx2, cy2, x1, y1];
    this.length = this.calculateLength();
  }

  // Fast 10-step chord approximation for curve length
  calculateLength() {
    let len = 0;
    let prev = this.getPoint(0);
    for (let i = 1; i <= 10; i++) {
      let curr = this.getPoint(i / 10);
      len += Math.hypot(curr.x - prev.x, curr.y - prev.y);
      prev = curr;
    }
    return len;
  }

  getPoint(t) {
    const [x0, y0, cx1, cy1, cx2, cy2, x1, y1] = this.pts;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    return {
      x: x0 * mt2 * mt + 3 * cx1 * mt2 * t + 3 * cx2 * mt * t2 + x1 * t2 * t,
      y: y0 * mt2 * mt + 3 * cy1 * mt2 * t + 3 * cy2 * mt * t2 + y1 * t2 * t,
    };
  }
}

// Run
init();
