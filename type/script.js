import * as utils from "../static/utils.js";

const inputEl = document.getElementById("big-input");
const titleEl = document.querySelector(".typing-title");
let isComposing = false;

// --- OPTIMIZATION: Cache expensive objects globally ---
const canvas = document.createElement("canvas");
const context = canvas.getContext("2d", { alpha: false }); // alpha: false for slight speed boost
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

const isUnicodeSupported = (() => {
  try {
    new RegExp("\\p{L}", "u");
    return true;
  } catch {
    return false;
  }
})();

const adjustFontSize = () => {
  try {
    const val = inputEl.value;
    if (!val) {
      inputEl.style.fontSize = "";
      return;
    }

    const parent = inputEl.parentElement;
    const boxWidth = parent.clientWidth * 0.9;
    const boxHeight = parent.clientHeight * 0.7;

    // --- OPTIMIZATION: Use the cached context ---
    context.font = `700 100px Lexend, sans-serif`;
    const textWidthAt100px = context.measureText(val).width;

    const sizeByWidth = (boxWidth / textWidthAt100px) * 100;
    let finalSize = Math.min(boxHeight, sizeByWidth);

    const minFloor = parent.clientHeight * 0.15;
    finalSize = Math.max(finalSize, minFloor);

    inputEl.style.fontSize = `${finalSize}px`;
  } catch (e) {
    console.error("Scaling error", e);
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

// --- OPTIMIZATION: Use requestAnimationFrame to prevent layout thrashing ---
let renderPending = false;
const renderUI = () => {
  if (renderPending) {
    return;
  }
  renderPending = true;

  requestAnimationFrame(() => {
    const val = inputEl.value;
    const hasValue = val.length > 0;

    titleEl.style.display = hasValue ? "none" : "block";
    inputEl.classList.toggle("hide-caret", hasValue);

    if (hasValue) {
      adjustFontSize();
      inputEl.classList.remove("animate-pop");
      // This is the one "expensive" line kept to restart the CSS animation
      void inputEl.offsetWidth;
      inputEl.classList.add("animate-pop");
    } else {
      inputEl.classList.remove("animate-pop");
      inputEl.style.fontSize = "";
    }
    renderPending = false;
  });
};

const resizeObserver = new ResizeObserver(renderUI);

const sanitizeInput = (rawVal) => {
  if (!rawVal) {
    return "";
  }

  // --- OPTIMIZATION: Use the cached segmenter ---
  const segments = Array.from(segmenter.segment(rawVal));
  let val = segments.length > 0 ? segments[segments.length - 1].segment : "";

  if (isUnicodeSupported) {
    return val.replace(/[^\p{L}\p{N}\p{M}]/gu, "");
  }
  return val.replace(/[^a-zA-Z0-9]/g, "");
};

const handleInput = (e) => {
  // If the user is still building a complex character (IME), don't sanitize yet
  // This prevents "flickering" or broken characters in languages like Tamil.
  if (isComposing) {
    return;
  }

  const rawVal = e.target.value;
  const cleanVal = sanitizeInput(rawVal);

  // --- OPTIMIZATION: Only update DOM if the value changed ---
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
