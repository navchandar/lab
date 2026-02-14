import * as utils from "../static/utils.js";

const input = document.getElementById("big-input");

// Handles the UI state
const updateVisuals = () => {
  if (input.value.length > 0) {
    // Has text: Hide caret, trigger animation
    input.classList.add("hide-caret");

    // Reset animation hack (Reflow)
    input.classList.remove("animate-pop");
    void input.offsetWidth;
    input.classList.add("animate-pop");
  } else {
    // Empty: Show blinking caret, remove animation
    input.classList.remove("hide-caret");
    input.classList.remove("animate-pop");
  }
};

// --- Focus Logic ---
const forceFocus = () => {
  if (document.activeElement !== input) {
    input.focus();
  }
};

forceFocus(); // Initial focus

// Re-focus on blur
input.addEventListener("blur", () => {
  setTimeout(forceFocus, 10);
});

// Click anywhere to focus
document.addEventListener("click", forceFocus);

// --- Keydown Logic (Control Keys) ---
input.addEventListener("keydown", (e) => {
  // Clear Input logic
  if (["Space", "Enter", "Escape"].includes(e.code)) {
    e.preventDefault(); // Stop default browser actions
    input.value = ""; // Clear text
    updateVisuals(); // Update UI immediately
    return;
  }

  // Block Arrow Keys
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
    e.preventDefault();
  }
  // Handle sidebar in iframe
  if (["Equal"].includes(e.code)) {
    event.preventDefault();
    utils.handleSidebar();
  }
});

// --- Input Logic (Typing) ---
input.addEventListener("input", (e) => {
  let val = input.value;

  // Logic: Take last character only
  if (val.length > 1) {
    val = val.slice(-1);
  }

  // Validation: Allow only Alphanumeric
  val = val.replace(/[^a-zA-Z0-9]/g, "");

  // Apply sanitized value
  input.value = val;

  // Update UI (Animation/Caret)
  updateVisuals();
});
