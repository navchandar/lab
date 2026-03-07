import * as utils from "../static/utils.js";

const inputEl = document.getElementById("big-input");
const titleEl = document.querySelector(".typing-title");

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
 * CORE LOGIC (Validation & Cleaning)
 */
const sanitizeInput = (rawVal) => {
  // 1. Get the last character accurately (handles multi-byte Unicode)
  const chars = [...rawVal];
  let val = chars.length > 0 ? chars[chars.length - 1] : "";

  // 2. Filter based on browser capability
  if (isUnicodeSupported) {
    // Allows Letters, Numbers, and Marks (Accents/Vowel signs like மெ)
    return val.replace(/[^\p{L}\p{N}\p{M}]/gu, "");
  } else {
    // Fallback for ancient browsers
    return val.replace(/[^a-zA-Z0-9]/g, "");
  }
};

/**
 * UI RENDERING`
 */
const renderUI = () => {
  const hasValue = inputEl.value.length > 0;

  // Toggle Title
  titleEl.style.display = hasValue ? "none" : "block";

  // Toggle Classes
  inputEl.classList.toggle("hide-caret", hasValue);

  if (hasValue) {
    // Restart animation using a class trigger
    inputEl.classList.remove("animate-pop");
    void inputEl.offsetWidth; // Force reflow
    inputEl.classList.add("animate-pop");
  } else {
    inputEl.classList.remove("animate-pop");
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

  // Navigation Blocking
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
  inputEl.value = sanitizeInput(inputEl.value);
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
  // Listeners
  inputEl.addEventListener("keydown", handleKeyDown);
  inputEl.addEventListener("input", handleInput);
  document.addEventListener("click", forceFocus);

  // Start state
  forceFocus();
  renderUI();
};

init();
