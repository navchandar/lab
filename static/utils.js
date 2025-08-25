// =========================================================================
// UTILITY & HELPER FUNCTIONS
// =========================================================================

/**
 * Converts a string to Title Case.
 * @param {string} str The string to convert.
 * @returns {string} The Title Cased string.
 */
export function toTitleCase(str) {
  return str.toLocaleLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Sets the fullscreen button icon to the 'enter fullscreen' state.
 */
export function setEnterFullscreenIcon() {
  const fullscreenIcon = document.getElementById("fullscreen-icon");
  fullscreenIcon.innerHTML = `
      <path d="M9 21H3L3 15" stroke="lightgray" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
      <path d="M21 15V21H15" stroke="lightgray" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
      <path d="M15 3H21V9" stroke="lightgray" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
      <path d="M3 9V3H9" stroke="lightgray" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />`;
}

/**
 * Sets the fullscreen button icon to the 'exit fullscreen' state.
 */
export function setExitFullscreenIcon() {
  const fullscreenIcon = document.getElementById("fullscreen-icon");
  fullscreenIcon.innerHTML = `
      <path d="M3 15H9V21" stroke="lightgray" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
      <path d="M15 21V15H21" stroke="lightgray" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
      <path d="M21 9H15V3" stroke="lightgray" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
      <path d="M9 3V9H3" stroke="lightgray" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>`;
}

// --- Initialize Fullscreen Icon ---
export function setFullscreenIcon() {
  document.fullscreenElement
    ? setExitFullscreenIcon()
    : setEnterFullscreenIcon();
}

/**
 * Toggles fullscreen mode for the page.
 */
export function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      console.log(
        `Error attempting to enable full-screen mode: ${err.message}`
      );
    });
  } else {
    document.exitFullscreen();
  }
}

// --- Add Fullscreen Button Listeners ---
export function updateFullScreenBtn() {
  const fullscreenbtn = document.getElementById("fullscreen-btn");
  fullscreenbtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFullscreen();
  });
  fullscreenbtn.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFullscreen();
    },
    { passive: false }
  );

  document.addEventListener("fullscreenchange", () => {
    const isFullscreen = !!document.fullscreenElement;
    fullscreenbtn.classList.toggle("fullscreen-active", isFullscreen);
    isFullscreen ? setExitFullscreenIcon() : setEnterFullscreenIcon();
  });
}

/**
 * Gets the randomize state from localStorage.
 * @returns {boolean} True if randomize is enabled, otherwise false.
 */
export function getIsRandomEnabled() {
  return localStorage.getItem("randomize") === "true";
}

/**
 * Saves the randomize state in localStorage.
 * @param {boolean} value The new state for the randomize setting.
 */
export function setIsRandom(value) {
  localStorage.setItem("randomize", value);
  console.log("Randomize set to:", getIsRandomEnabled());
}
