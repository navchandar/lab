import * as utils from "../static/utils.js";

const inputEl = document.getElementById("big-input");
const titleEl = document.querySelector(".typing-title");

// Track if the user is currently "composing" a character
let isComposing = false;

// Check Unicode support once at startup
const isUnicodeSupported = (() => {
  try {
    new RegExp("\\p{L}", "u");
    return true;
  } catch {
    return false;
  }
})();

/**
 * Improved Context-Aware Dynamic Font Resizer
 * Uses Canvas measurement to ensure the character fits the container
 */
const adjustFontSize = () => {
  try {
    const val = inputEl.value;
    if (!val) {
      inputEl.style.fontSize = "";
      return;
    }

    const parent = inputEl.parentElement;
    // Get the actual available space in the container
    const boxWidth = parent.clientWidth * 0.9; // 90% of width
    const boxHeight = parent.clientHeight * 0.7; // 70% of height

    // Create a "virtual ruler" to measure the text
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    // Measure based on your specific font
    context.font = `700 100px Lexend, sans-serif`;
    const metrics = context.measureText(val);
    const textWidthAt100px = metrics.width;

    // Calculate the best fit
    // How big can we go based on Height?
    const sizeByHeight = boxHeight;
    // How big can we go based on Width? (Width of box / width of 1 char) * 100
    const sizeByWidth = (boxWidth / textWidthAt100px) * 100;

    // Pick the smaller of the two to ensure it fits both ways
    let finalSize = Math.min(sizeByHeight, sizeByWidth);

    // Safety Floor: Never let it get smaller than a readable size
    // On mobile (narrow), we ensure it's at least 15% of the screen height
    const minFloor = parent.clientHeight * 0.15;
    finalSize = Math.max(finalSize, minFloor);

    // Apply instantly (no transitions to prevent "jumping")
    inputEl.style.transition = "none";
    inputEl.style.fontSize = `${finalSize}px`;
  } catch {
    console.error("Error scaling text size!");
  }
};

const resizeObserver = new ResizeObserver(() => {
  // Re-render and re-scale whenever the box changes
  renderUI();
});

/**
 * CORE LOGIC (Validation & Cleaning)
 * Extracts the single last "visual" character and removes unwanted symbols.
 */
const sanitizeInput = (rawVal) => {
  if (!rawVal) {
    return "";
  }

  // Use Intl.Segmenter to handle "Grapheme Clusters" (e.g., Tamil 'மெ' is one unit)
  // Use undefined to detect the user's system locale automatically.
  const segmenter = new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  });
  const segments = Array.from(segmenter.segment(rawVal));

  // Get the very last visual character entered
  let val = segments.length > 0 ? segments[segments.length - 1].segment : "";

  // Filter based on browser capability
  if (isUnicodeSupported) {
    // \p{L} = Letters, \p{N} = Numbers, \p{M} = Combining Marks (Vital for Tamil vowel signs)
    return val.replace(/[^\p{L}\p{N}\p{M}]/gu, "");
  } else {
    // Fallback for very old browsers
    return val.replace(/[^a-zA-Z0-9]/g, "");
  }
};

/**
 * UI RENDERING
 */
const renderUI = () => {
  const val = inputEl.value;
  const hasValue = val.length > 0;

  // Toggle Title visibility
  titleEl.style.display = hasValue ? "none" : "block";

  // Toggle Caret visibility
  inputEl.classList.toggle("hide-caret", hasValue);

  if (hasValue) {
    adjustFontSize();
    // Restart "pop" animation by forcing a reflow
    inputEl.classList.remove("animate-pop");
    void inputEl.offsetWidth;
    inputEl.classList.add("animate-pop");
  } else {
    inputEl.classList.remove("animate-pop");
    inputEl.style.fontSize = ""; // Reset
  }
};

/**
 * EVENT HANDLERS
 */
const handleKeyDown = (e) => {
  const { code } = e;
  utils.hideSidebar();

  // Clear Input Keys
  if (["Space", "Enter", "Escape"].includes(code)) {
    e.preventDefault();
    inputEl.value = "";
    renderUI();
    return;
  }

  // Block navigation within the single-character input
  if (code.startsWith("Arrow")) {
    e.preventDefault();
  }

  // Sidebar Utility
  if (code === "Equal") {
    e.preventDefault();
    utils.handleSidebar();
  }
};

const handleInput = (e) => {
  // If the user is still building a complex character (IME), don't sanitize yet
  // This prevents "flickering" or broken characters in languages like Tamil.
  if (isComposing) {
    return;
  }

  const rawVal = e.target.value;
  const cleanVal = sanitizeInput(rawVal);

  // Update the input field only if the value actually changed
  if (inputEl.value !== cleanVal) {
    inputEl.value = cleanVal;
  }

  renderUI();
};

const forceFocus = () => {
  if (document.activeElement !== inputEl) {
    inputEl.focus();
  }
};

/**
 * INITIALIZATION
 */
const init = () => {
  // Standard Listeners
  inputEl.addEventListener("keydown", handleKeyDown);
  inputEl.addEventListener("input", handleInput);
  document.addEventListener("click", forceFocus);

  // Start observing the element's size
  resizeObserver.observe(inputEl);

  // Composition Listeners (Crucial for multilingual typing)
  // compositionstart: User starts building a character
  // compositionend: User finishes the character
  inputEl.addEventListener("compositionstart", () => {
    isComposing = true;
  });
  inputEl.addEventListener("compositionend", (e) => {
    isComposing = false;
    // Trigger manual update once the composition is finished
    handleInput(e);
  });

  // Start state
  forceFocus();
  renderUI();
};

init();
