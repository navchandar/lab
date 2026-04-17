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
  tabPreset: document.getElementById("tab-preset"),
  tabCustom: document.getElementById("tab-custom"),
  presetBlock: document.getElementById("preset-block"),
  customBlock: document.getElementById("custom-block"),
  customSvg: document.getElementById("custom-svg"),
  svgWarning: document.getElementById("svg-warning"),
  select: document.getElementById("shape-select"),
  points: document.getElementById("point-count"),
  canvas: document.getElementById("canvas-shape"),
  output: document.getElementById("output-code"),
  copy: document.getElementById("copy-btn"),
  copysvg: document.getElementById("copy-svg-btn"),
};

let currentMode = "preset";
let debounceTimer;
let lastPathData = null;
let customViewBox = null;

/**
 * Initialization Logic
 */
function init() {
  const shapeNames = Object.keys(SHAPE_LIB);
  const options = shapeNames.map((name) => new Option(name, name));
  elements.select.append(...options);

  // Event Listeners
  elements.tabPreset.addEventListener("click", () => switchTab("preset"));
  elements.tabCustom.addEventListener("click", () => switchTab("custom"));
  elements.select.addEventListener("change", handleShapeChange);
  // Real-time render while typing
  elements.points.addEventListener("input", render);
  // Gentle UI clamp: Only forces the minimum into the box when the user clicks away
  elements.points.addEventListener("blur", () => {
    let val = parseInt(elements.points.value);
    let min = parseInt(elements.points.min);
    if (isNaN(val) || val < min) {
      elements.points.value = min;
      render();
    }
  });
  // Copy icons
  elements.copy.addEventListener("click", copyClipPath);
  elements.copysvg.addEventListener("click", copySvgToClipboard);

  // Custom SVG Input with Debounce
  elements.customSvg.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 300);
  });

  elements.select.value = shapeNames[0];
  handleShapeChange();
}

function switchTab(mode) {
  currentMode = mode;
  if (mode === "preset") {
    elements.tabPreset.classList.add("active");
    elements.tabCustom.classList.remove("active");
    elements.presetBlock.classList.remove("hidden");
    elements.customBlock.classList.add("hidden");
    elements.svgWarning.style.display = "none";
    handleShapeChange();
  } else {
    elements.tabCustom.classList.add("active");
    elements.tabPreset.classList.remove("active");
    elements.customBlock.classList.remove("hidden");
    elements.presetBlock.classList.add("hidden");
    render();
  }
}

function handleShapeChange() {
  if (currentMode !== "preset") {
    return;
  }
  render();
}

/**
 * Parses user input. Extracts 'd' if they pasted a whole <svg> block.
 * High-Precision Vertex and SVG sampling to generate polygon points
 * Optimized for shape retention and auto-clamping
 * Automatically detects sharp corners and smoothly traverses curves.
 * Automatically converts primitive shapes (rect, circle, polygon) to paths.
 */
function getPathData() {
  customViewBox = null; // Reset it on every parse

  if (currentMode === "preset") {
    return SHAPE_LIB[elements.select.value].d;
  }

  const val = elements.customSvg.value.trim();
  if (!val) {
    return null;
  }

  // If user pasted raw HTML/SVG
  if (val.includes("<svg") || val.includes("<path") || val.includes("<rect")) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(val, "image/svg+xml");

      // Extract the explicit viewBox if it exists
      const svgNode = doc.querySelector("svg");
      if (svgNode && svgNode.getAttribute("viewBox")) {
        customViewBox = svgNode
          .getAttribute("viewBox")
          .split(/[\s,]+/)
          .map(parseFloat);
      }

      // Find all valid shapes, ignoring invisible bounding boxes (fill="none")
      const shapeNodes = Array.from(
        doc.querySelectorAll("path, rect, circle, ellipse, polygon, polyline"),
      ).filter(
        (node) =>
          node.getAttribute("fill") !== "none" &&
          node.getAttribute("fill") !== "transparent",
      );

      if (shapeNodes.length === 0) {
        return null;
      }

      // Convert every SVG primitive into standard 'd' string math
      const combinedPath = shapeNodes
        .map((node) => {
          const tag = node.tagName.toLowerCase();

          if (tag === "path") {
            return node.getAttribute("d");
          } else if (tag === "rect") {
            const x = parseFloat(node.getAttribute("x")) || 0;
            const y = parseFloat(node.getAttribute("y")) || 0;
            const w = parseFloat(node.getAttribute("width")) || 0;
            const h = parseFloat(node.getAttribute("height")) || 0;
            return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
          } else if (tag === "circle") {
            const cx = parseFloat(node.getAttribute("cx")) || 0;
            const cy = parseFloat(node.getAttribute("cy")) || 0;
            const r = parseFloat(node.getAttribute("r")) || 0;
            return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
          } else if (tag === "ellipse") {
            const cx = parseFloat(node.getAttribute("cx")) || 0;
            const cy = parseFloat(node.getAttribute("cy")) || 0;
            const rx = parseFloat(node.getAttribute("rx")) || 0;
            const ry = parseFloat(node.getAttribute("ry")) || 0;
            return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
          } else if (tag === "polygon" || tag === "polyline") {
            // Scrub all alphabet letters out of the points array so words like 'evenodd' don't crash the engine
            const rawPoints = (node.getAttribute("points") || "")
              .replace(/[a-zA-Z]/g, "")
              .trim();
            const pts = rawPoints.split(/[\s,]+/).filter((p) => p !== "");

            if (pts.length < 2) {
              return "";
            }
            let d = `M ${pts[0]} ${pts[1]} `;
            for (let i = 2; i < pts.length; i += 2) {
              if (pts[i] && pts[i + 1]) {
                d += `L ${pts[i]} ${pts[i + 1]} `;
              }
            }
            return tag === "polygon" ? d + "Z" : d;
          }
          return "";
        })
        .join(" "); // Join multiple shapes so the engine treats them as subpaths (holes)

      return combinedPath;
    } catch (e) {
      console.warn("DOMParser failed", e);
      return null;
    }
  }

  // Assume user just pasted a raw "M 50 0 L..." d-string
  return val;
}

/**
 * Render Pipeline
 */
function render() {
  const pathData = getPathData();

  if (!pathData && currentMode === "custom") {
    elements.canvas.style.clipPath = "none";
    elements.output.textContent = "Awaiting valid SVG input...";
    return;
  }

  // Did the actual SVG geometry change since the last render?
  const isShapeChange = pathData !== lastPathData;
  lastPathData = pathData;

  try {
    // Parse Path and Math
    const mathEngine = new SVGMathEngine(pathData);
    if (mathEngine.segments.length === 0) {
      throw new Error("No valid segments found.");
    }

    elements.svgWarning.style.display = "none";
    const totalLen = mathEngine.totalLength;

    // Extract Exact Segments
    const segmentData = [];
    let currentDist = 0;
    for (let seg of mathEngine.segments) {
      segmentData.push({
        startDist: currentDist,
        length: seg.length,
        pointsToPlace: 0,
      });
      currentDist += seg.length;
    }

    // --- THE DYNAMIC RESET LOGIC ---
    // Calculate the absolute mathematical minimum needed
    // Adding 2 points for proximity bridge
    const slitCount = Math.max(0, mathEngine.subpaths.length - 1) * 2;
    const structuralMin = segmentData.length + slitCount;

    let requiredMin = structuralMin;
    if (currentMode === "preset") {
      requiredMin = Math.max(
        structuralMin,
        SHAPE_LIB[elements.select.value].min,
      );
    }

    // Update HTML attribute
    elements.points.min = requiredMin;

    let target = parseInt(elements.points.value);

    // Auto-Reset: If the user just pasted a new SVG or selected a new preset,
    // immediately reset the input box to show them the new minimum!
    if (isShapeChange) {
      target = requiredMin;
      elements.points.value = target;
    }
    // Internal Clamp: Protect the math engine if they are typing a low number,
    // but don't overwrite the UI box so they can finish typing safely.
    else if (isNaN(target) || target < requiredMin) {
      target = requiredMin;
    }

    // Precise Point Allocation
    let pointsLeftToDistribute = target - structuralMin;

    segmentData.forEach((seg) => {
      seg.pointsToPlace = Math.floor(
        (seg.length / totalLen) * (target - structuralMin),
      );
      if (seg.pointsToPlace < 0) {
        seg.pointsToPlace = 0;
      }
      pointsLeftToDistribute -= seg.pointsToPlace;
    });

    const sortedByLength = [...segmentData].sort((a, b) => b.length - a.length);
    while (pointsLeftToDistribute > 0) {
      for (let seg of sortedByLength) {
        if (pointsLeftToDistribute <= 0) {
          break;
        }
        seg.pointsToPlace++;
        pointsLeftToDistribute--;
      }
    }

    // Calculate Custom Bounds
    let bMinX = mathEngine.minX;
    let bMinY = mathEngine.minY;
    let width = mathEngine.maxX - mathEngine.minX;
    let height = mathEngine.maxY - mathEngine.minY;
    // If the user pasted an SVG with a viewBox, respect their canvas padding!
    if (
      currentMode === "custom" &&
      customViewBox &&
      customViewBox.length === 4
    ) {
      bMinX = customViewBox[0];
      bMinY = customViewBox[1];
      width = customViewBox[2];
      height = customViewBox[3];
    }

    if (width === 0) {
      width = 1;
    }
    if (height === 0) {
      height = 1;
    }

    // 5. Final Geometry Construction (Handling Holes / Subpaths)
    const subpathPointArrays = [];
    let globalSegIndex = 0;

    mathEngine.subpaths.forEach((subpath) => {
      const currentSubpathPoints = [];

      subpath.forEach((seg) => {
        const sData = segmentData[globalSegIndex];
        globalSegIndex++;

        // Anchor
        let pt = mathEngine.getPointAtLength(sData.startDist);
        currentSubpathPoints.push(
          getNormalizedPoint(pt, bMinX, bMinY, width, height),
        );

        // Sub-segments
        for (let j = 1; j <= sData.pointsToPlace; j++) {
          const subDist =
            sData.startDist + (j / (sData.pointsToPlace + 1)) * sData.length;
          pt = mathEngine.getPointAtLength(subDist);
          currentSubpathPoints.push(
            getNormalizedPoint(pt, bMinX, bMinY, width, height),
          );
        }
      });
      subpathPointArrays.push(currentSubpathPoints);
    });

    // --- THE PROXIMITY BRIDGE TECHNIQUE (Anti-Twist/Anti-Crisscross) ---
    // Start with the primary outer boundary
    let finalPath = [...subpathPointArrays[0]];

    // Inject all inner holes at their mathematically closest points
    for (let i = 1; i < subpathPointArrays.length; i++) {
      const innerPath = subpathPointArrays[i];
      const innerStart = innerPath[0];

      // Find closest point on the CURRENT accumulated outer path
      let closestIdx = 0;
      let minDist = Infinity;
      for (let j = 0; j < finalPath.length; j++) {
        const dist = Math.hypot(
          finalPath[j].x - innerStart.x,
          finalPath[j].y - innerStart.y,
        );
        if (dist < minDist) {
          minDist = dist;
          closestIdx = j;
        }
      }

      // Split the outer path at the closest vertex
      const before = finalPath.slice(0, closestIdx + 1);
      const after = finalPath.slice(closestIdx + 1);

      // Inject: Go to hole -> Trace hole -> Ensure hole is closed -> Bridge back out
      finalPath = [
        ...before,
        ...innerPath,
        innerStart, // +1 point: Force inner loop closed
        finalPath[closestIdx], // +1 point: Draw bridge back to the outer wall
        ...after,
      ];
    }

    const finalPointsStr = finalPath.map((p) => p.str);

    // Final Integrity Check
    if (finalPointsStr.length !== target) {
      console.warn(
        `Drift detected in Final Points: ${finalPointsStr.length} vs Input:${target}!`,
      );
    }

    // Update UI (Injecting 'evenodd' rule to force hollow cuts)
    const resultStr = `polygon(evenodd, ${finalPointsStr.join(", ")})`;
    elements.canvas.style.clipPath = resultStr;
    elements.canvas.style.display = "block";
    elements.output.textContent = `clip-path: ${resultStr};`;
  } catch (e) {
    console.error("Path Parse Error:", e);
    if (currentMode === "custom") {
      elements.svgWarning.textContent = `⚠️ Invalid SVG: ${e.message}`;
      elements.svgWarning.style.display = "block";
      elements.canvas.style.clipPath = "none";
      elements.output.textContent = "Error parsing path.";
    }
  }
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
 * Returns a normalized point object with both coordinates and CSS string
 */
function getNormalizedPoint(pt, minX, minY, w, h) {
  let px = pt.x;
  let py = pt.y;

  if (currentMode === "custom") {
    px = ((px - minX) / w) * 100;
    py = ((py - minY) / h) * 100;
  }

  px = Math.max(0, Math.min(100, px));
  py = Math.max(0, Math.min(100, py));

  return {
    x: px,
    y: py,
    str: `${px.toFixed(2)}% ${py.toFixed(2)}%`,
  };
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
    const pointsRaw = clipPath
      .replace("polygon(", "")
      .replace(")", "")
      .replace("evenodd,", "")
      .trim();

    const svgPoints = pointsRaw
      .split(",")
      .map((p) => p.trim().replace(/%/g, ""))
      .join(" ");

    const svgTemplate = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <polygon points="${svgPoints}" fill="currentColor" fill-rule="evenodd"/>
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

/**
 * Normalizes wild SVG coordinates into perfect 0-100 CSS percentages
 */
function pushNormalizedPoint(pt, arr, engine, w, h) {
  let px = pt.x;
  let py = pt.y;

  if (currentMode === "custom") {
    px = ((px - engine.minX) / w) * 100;
    py = ((py - engine.minY) / h) * 100;
  }

  // Clamp edge floating point bugs
  px = Math.max(0, Math.min(100, px));
  py = Math.max(0, Math.min(100, py));

  arr.push(`${px.toFixed(2)}% ${py.toFixed(2)}%`);
}

// ---------------------------------------------------------
// PURE MATH GEOMETRY ENGINE (AST Parser & Evaluator)
// ---------------------------------------------------------

class SVGMathEngine {
  constructor(d) {
    this.segments = [];
    this.subpaths = []; // Tracks inner vs outer shapes
    this.currentSubpath = [];
    this.totalLength = 0;
    this.minX = Infinity;
    this.minY = Infinity;
    this.maxX = -Infinity;
    this.maxY = -Infinity;
    this.parse(d);
  }

  updateBounds(x, y) {
    if (x < this.minX) {
      this.minX = x;
    }
    if (x > this.maxX) {
      this.maxX = x;
    }
    if (y < this.minY) {
      this.minY = y;
    }
    if (y > this.maxY) {
      this.maxY = y;
    }
  }

  parse(d) {
    const tokens = d.match(
      /[a-zA-Z]|[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g,
    );
    if (!tokens) {
      return;
    }

    let x = 0,
      y = 0,
      startX = 0,
      startY = 0;
    let lastCx = 0,
      lastCy = 0; // Memory for Smooth Curves (S & T)
    let i = 0;
    let lastCmd = "";

    while (i < tokens.length) {
      let cmd = tokens[i];
      let isRelative = false;

      if (/[a-zA-Z]/.test(cmd)) {
        i++;
      } else {
        cmd = lastCmd;
        if (cmd === "M") {
          cmd = "L";
        }
        if (cmd === "m") {
          cmd = "l";
        }
      }

      const upCmd = cmd.toUpperCase();
      isRelative = cmd !== upCmd;

      if (upCmd === "M") {
        if (this.currentSubpath.length > 0) {
          this.subpaths.push(this.currentSubpath);
          this.currentSubpath = [];
        }
        let nx = parseFloat(tokens[i++]),
          ny = parseFloat(tokens[i++]);
        if (isRelative) {
          nx += x;
          ny += y;
        }
        x = nx;
        y = ny;
        startX = x;
        startY = y;
        lastCx = x;
        lastCy = y;
        this.updateBounds(x, y);
      } else if (upCmd === "L") {
        let nx = parseFloat(tokens[i++]),
          ny = parseFloat(tokens[i++]);
        if (isRelative) {
          nx += x;
          ny += y;
        }
        this.addSegment(new LineSegment(x, y, nx, ny));
        x = nx;
        y = ny;
        lastCx = x;
        lastCy = y;
        this.updateBounds(x, y);
      } else if (upCmd === "H") {
        let nx = parseFloat(tokens[i++]);
        if (isRelative) {
          nx += x;
        }
        this.addSegment(new LineSegment(x, y, nx, y));
        x = nx;
        lastCx = x;
        lastCy = y;
        this.updateBounds(x, y);
      } else if (upCmd === "V") {
        let ny = parseFloat(tokens[i++]);
        if (isRelative) {
          ny += y;
        }
        this.addSegment(new LineSegment(x, y, x, ny));
        y = ny;
        lastCx = x;
        lastCy = y;
        this.updateBounds(x, y);
      } else if (upCmd === "C") {
        let cx1 = parseFloat(tokens[i++]),
          cy1 = parseFloat(tokens[i++]);
        let cx2 = parseFloat(tokens[i++]),
          cy2 = parseFloat(tokens[i++]);
        let nx = parseFloat(tokens[i++]),
          ny = parseFloat(tokens[i++]);
        if (isRelative) {
          cx1 += x;
          cy1 += y;
          cx2 += x;
          cy2 += y;
          nx += x;
          ny += y;
        }

        this.addSegment(new BezierSegment(x, y, cx1, cy1, cx2, cy2, nx, ny));
        lastCx = cx2;
        lastCy = cy2; // Save control point
        x = nx;
        y = ny;
        this.updateBounds(x, y);
      } else if (upCmd === "S") {
        // Smooth Cubic Bezier: Mirrors the previous C/S control point
        let cx2 = parseFloat(tokens[i++]),
          cy2 = parseFloat(tokens[i++]);
        let nx = parseFloat(tokens[i++]),
          ny = parseFloat(tokens[i++]);
        if (isRelative) {
          cx2 += x;
          cy2 += y;
          nx += x;
          ny += y;
        }

        let cx1 = x,
          cy1 = y;
        if (lastCmd.toUpperCase() === "C" || lastCmd.toUpperCase() === "S") {
          cx1 = x + (x - lastCx);
          cy1 = y + (y - lastCy);
        }

        this.addSegment(new BezierSegment(x, y, cx1, cy1, cx2, cy2, nx, ny));
        lastCx = cx2;
        lastCy = cy2;
        x = nx;
        y = ny;
        this.updateBounds(x, y);
      } else if (upCmd === "Q") {
        let cx = parseFloat(tokens[i++]),
          cy = parseFloat(tokens[i++]);
        let nx = parseFloat(tokens[i++]),
          ny = parseFloat(tokens[i++]);
        if (isRelative) {
          cx += x;
          cy += y;
          nx += x;
          ny += y;
        }

        let cx1 = x + (2 / 3) * (cx - x),
          cy1 = y + (2 / 3) * (cy - y);
        let cx2 = nx + (2 / 3) * (cx - nx),
          cy2 = ny + (2 / 3) * (cy - ny);

        this.addSegment(new BezierSegment(x, y, cx1, cy1, cx2, cy2, nx, ny));
        lastCx = cx;
        lastCy = cy; // Save ORIGINAL Q control point, not converted C point
        x = nx;
        y = ny;
        this.updateBounds(x, y);
      } else if (upCmd === "T") {
        // Smooth Quadratic Bezier: Mirrors the previous Q/T control point
        let nx = parseFloat(tokens[i++]),
          ny = parseFloat(tokens[i++]);
        if (isRelative) {
          nx += x;
          ny += y;
        }

        let cx = x,
          cy = y;
        if (lastCmd.toUpperCase() === "Q" || lastCmd.toUpperCase() === "T") {
          cx = x + (x - lastCx);
          cy = y + (y - lastCy);
        }

        let cx1 = x + (2 / 3) * (cx - x),
          cy1 = y + (2 / 3) * (cy - y);
        let cx2 = nx + (2 / 3) * (cx - nx),
          cy2 = ny + (2 / 3) * (cy - ny);

        this.addSegment(new BezierSegment(x, y, cx1, cy1, cx2, cy2, nx, ny));
        lastCx = cx;
        lastCy = cy;
        x = nx;
        y = ny;
        this.updateBounds(x, y);
      } else if (upCmd === "A") {
        let rx = Math.abs(parseFloat(tokens[i++]));
        let ry = Math.abs(parseFloat(tokens[i++]));
        let xAxisRot = parseFloat(tokens[i++]);
        let largeArcFlag = parseFloat(tokens[i++]);
        let sweepFlag = parseFloat(tokens[i++]);
        let nx = parseFloat(tokens[i++]),
          ny = parseFloat(tokens[i++]);
        if (isRelative) {
          nx += x;
          ny += y;
        }

        if (rx === 0 || ry === 0) {
          this.addSegment(new LineSegment(x, y, nx, ny));
        } else {
          const curves = svgArcToCubicBezier(
            x,
            y,
            rx,
            ry,
            xAxisRot,
            largeArcFlag,
            sweepFlag,
            nx,
            ny,
          );
          for (let c of curves) {
            this.addSegment(
              new BezierSegment(x, y, c.cp1x, c.cp1y, c.cp2x, c.cp2y, c.x, c.y),
            );
            x = c.x;
            y = c.y;
          }
        }
        x = nx;
        y = ny;
        lastCx = x;
        lastCy = y;
        this.updateBounds(x, y);
      } else if (upCmd === "Z") {
        this.addSegment(new LineSegment(x, y, startX, startY));
        x = startX;
        y = startY;
        lastCx = x;
        lastCy = y;
      } else {
        throw new Error(`Unsupported SVG command: ${upCmd}`);
      }

      lastCmd = cmd;
    }

    if (this.currentSubpath.length > 0) {
      this.subpaths.push(this.currentSubpath);
    }
  }

  addSegment(seg) {
    if (seg.length > 0) {
      this.segments.push(seg);
      this.currentSubpath.push(seg);
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
        let t = (distance - currentDist) / seg.length;
        return seg.getPoint(t);
      }
      currentDist += seg.length;
    }
  }
}

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
  calculateLength() {
    let len = 0,
      prev = this.getPoint(0);
    for (let i = 1; i <= 10; i++) {
      let curr = this.getPoint(i / 10);
      len += Math.hypot(curr.x - prev.x, curr.y - prev.y);
      prev = curr;
    }
    return len;
  }
  getPoint(t) {
    const [x0, y0, cx1, cy1, cx2, cy2, x1, y1] = this.pts;
    const mt = 1 - t,
      mt2 = mt * mt,
      t2 = t * t;
    return {
      x: x0 * mt2 * mt + 3 * cx1 * mt2 * t + 3 * cx2 * mt * t2 + x1 * t2 * t,
      y: y0 * mt2 * mt + 3 * cy1 * mt2 * t + 3 * cy2 * mt * t2 + y1 * t2 * t,
    };
  }
}

/**
 * Converts an SVG Elliptical Arc to an array of Cubic Bezier curves.
 * Required to support wild SVGs using 'A' or 'a' commands.
 */
function svgArcToCubicBezier(
  x0,
  y0,
  rx,
  ry,
  xAxisRot,
  largeArcFlag,
  sweepFlag,
  x1,
  y1,
) {
  if (x0 === x1 && y0 === y1) {
    return [];
  }

  const phi = (xAxisRot * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx = (x0 - x1) / 2;
  const dy = (y0 - y1) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  let rxSq = rx * rx;
  let rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;

  // Scale radii up if they are mathematically too small to reach the target point
  let lambda = x1pSq / rxSq + y1pSq / rySq;
  if (lambda > 1) {
    const root = Math.sqrt(lambda);
    rx *= root;
    ry *= root;
    rxSq = rx * rx;
    rySq = ry * ry;
  }

  let sign = largeArcFlag === sweepFlag ? -1 : 1;
  let num = rxSq * rySq - rxSq * y1pSq - rySq * x1pSq;
  let den = rxSq * y1pSq + rySq * x1pSq;
  let sq = num / den;
  sq = sq < 0 ? 0 : sq;
  let coef = sign * Math.sqrt(sq);

  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * (-(ry * x1p) / rx);

  const cx = cosPhi * cxp - sinPhi * cyp + (x0 + x1) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y0 + y1) / 2;

  const angle = (ux, uy, vx, vy) => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    let ang = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    if (ux * vy - uy * vx < 0) {
      ang = -ang;
    }
    return ang;
  };

  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;

  let theta1 = angle(1, 0, ux, uy);
  let dTheta = angle(ux, uy, vx, vy);

  if (sweepFlag === 0 && dTheta > 0) {
    dTheta -= 2 * Math.PI;
  }
  if (sweepFlag === 1 && dTheta < 0) {
    dTheta += 2 * Math.PI;
  }

  // Split the arc into 90-degree segments max for smooth curves
  const segments = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  dTheta /= segments;

  const curves = [];
  let currentTheta = theta1;

  for (let i = 0; i < segments; i++) {
    const t0 = currentTheta;
    const t1 = currentTheta + dTheta;
    const alpha = (4 / 3) * Math.tan(dTheta / 4);

    const p0 = [Math.cos(t0), Math.sin(t0)];
    const p1 = [Math.cos(t1), Math.sin(t1)];

    const cp1 = [p0[0] - p0[1] * alpha, p0[1] + p0[0] * alpha];
    const cp2 = [p1[0] + p1[1] * alpha, p1[1] - p1[0] * alpha];

    const map = (p) => [
      cosPhi * (rx * p[0]) - sinPhi * (ry * p[1]) + cx,
      sinPhi * (rx * p[0]) + cosPhi * (ry * p[1]) + cy,
    ];

    const c1 = map(cp1);
    const c2 = map(cp2);
    const pE = map(p1);

    curves.push({
      cp1x: c1[0],
      cp1y: c1[1],
      cp2x: c2[0],
      cp2y: c2[1],
      x: pE[0],
      y: pE[1],
    });

    currentTheta = t1;
  }

  // Hard-snap the last point to prevent floating point drift
  curves[curves.length - 1].x = x1;
  curves[curves.length - 1].y = y1;

  return curves;
}

// Run
init();
