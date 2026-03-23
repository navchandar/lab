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
 * Measures the PARENT container so the font always fits the screen.
 */
const adjustFontSize = () => {
  const charCount = inputEl.value.length;
  const charCount = inputEl.value.length;
  const parentHeight = inputEl.parentElement.clientHeight;
  const parentWidth = inputEl.parentElement.clientWidth;

  // Detect Screen Type
  const isMobile = window.matchMedia("(max-width: 768px)").matches;

  // Set Variable Ratios
  // Mobile: Big and bold (80% height)
  // Desktop: Elegant and contained (50% height)
  const heightRatio = isMobile ? 0.8 : 0.5;

  // Mobile needs to shrink faster because the screen is narrow
  const shrinkFactor = isMobile ? 0.75 : 0.9;

  if (charCount > 0) {
    // Calculate base size using our context-aware ratio
    let targetSize = parentHeight * heightRatio;
    // Apply shrinkage for multiple characters
    if (charCount > 1) {
      targetSize = targetSize * Math.pow(shrinkFactor, charCount - 1);
    }

    // Width Protection: Prevents horizontal scrolling
    // Mobile uses 95% width, Desktop uses 80% width for padding
    const widthLimit = isMobile ? 0.95 : 0.8;
    const maxWidthFontSize = (parentWidth * widthLimit) / (charCount * 0.8);

    // Pick the safest (smallest) size to ensure NO overflow
    const finalSize = Math.min(targetSize, maxWidthFontSize);

    inputEl.style.fontSize = `${finalSize}px`;
  } else {
    // Caret size when empty
    inputEl.style.fontSize = isMobile ? "25vh" : "15vh";
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
