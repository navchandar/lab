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
 * Adds event listeners to a button for both click and touchstart events.
 * Ensures that the provided handler is called without triggering parent event handlers.
 *
 * @param {HTMLElement} button - The button element to attach listeners to.
 * @param {callback} handler - The function to execute when the button is activated.
 */
export function addListeners(button, callback) {
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    callback();
  });

  // Add a touchstart event listener for mobile devices
  button.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      callback();
    },
    { passive: false }
  );
}

/**
 * Adds event listeners to an element both click, touchstart and changeevents.
 */
function addMultiListeners(element, handlers, options = { passive: false }) {
  if (handlers.click) {
    element.addEventListener("click", handlers.click);
  }
  if (handlers.touchstart) {
    element.addEventListener("touchstart", handlers.touchstart, options);
  }
  if (handlers.change) {
    element.addEventListener("change", handlers.change);
  }
}

export function addUnifiedListeners(checkBoxElement, callback) {
  addMultiListeners(checkBoxElement, {
    click: (e) => {
      callback();
      e.stopPropagation();
    },
    change: (e) => {
      callback();
      e.stopPropagation();
    },
    touchstart: (e) => {
      callback();
      e.preventDefault();
      e.stopPropagation();
    },
  });
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

export function isMuted() {
  return localStorage.getItem("isMuted") === "true";
}

/**
 * Toggles Mute button for the page.
 */
export function toggleMute() {
  // Get the value and and change it
  let isMute = !isMuted();
  localStorage.setItem("isMuted", isMute);
  const muteButton = document.getElementById("muteButton");
  muteButton.textContent = isMute ? "🔇" : "🔊";
  muteButton.title = isMute ? "UnMute sound" : "Mute sound";
}

export function updateMuteBtn() {
  const muteButton = document.getElementById("muteButton");
  addListeners(muteButton, toggleMute);
  let isMute = isMuted();
  muteButton.textContent = isMute ? "🔇" : "🔊";
  let msg = isMute ? "UnMute sound" : "Mute sound";
  muteButton.title = msg;
  muteButton.setAttribute("aria-label", msg);
}

export function enableMuteBtn() {
  const muteButton = document.getElementById("muteButton");
  muteButton.disabled = false;
  let isMute = isMuted();
  muteButton.textContent = isMute ? "🔇" : "🔊";
  let msg = isMute ? "UnMute sound" : "Mute sound";
  muteButton.title = msg;
  muteButton.setAttribute("aria-label", msg);
}

export function disableMuteBtn(reason = "Speech not available in this device") {
  const muteButton = document.getElementById("muteButton");
  muteButton.disabled = true;
  muteButton.textContent = "🔇";
  muteButton.title = reason;
  muteButton.setAttribute("aria-label", reason);
}

// --- Add Fullscreen Button Listeners ---
export function updateFullScreenBtn() {
  const fullscreenbtn = document.getElementById("fullscreen-btn");
  addListeners(fullscreenbtn, toggleFullscreen);

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

export function isInteractiveElement(target) {
  const selectors = [
    "a",
    "button",
    "button img",
    "svg",
    "path",
    "input",
    "label",
    "select",
    "option",
    "textarea",
    "#settings-btn",
    "#settings-menu",
    "#settings-icon",
    ".allow-click",
  ];
  return target.closest(selectors.join(","));
}

export function bodyAction(callback) {
  document.body.addEventListener("click", (e) => {
    console.log("Clicked on:", e.target);
    if (!isInteractiveElement(e.target)) {
      callback();
    }
  });

  document.body.addEventListener(
    "touchstart",
    (e) => {
      console.log("Clicked on:", e.target);
      if (!isInteractiveElement(e.target)) {
        e.preventDefault();
        callback();
      }
    },
    { passive: false }
  );
}

/**
 * Gets a new random color, avoiding the current and previous colors.
 * @returns {string} A new color name from the given list.
 */
export function getNewColor(colorsList, previousColor, currentColor) {
  let newColor;
  do {
    newColor = colorsList[Math.floor(Math.random() * colorsList.length)];
  } while (newColor === currentColor || newColor === previousColor);
  return newColor;
}

export function onClickSettings() {
  toggleSettings();
  updateSettingsIcon();
}

function updateSettingsMenuPosition(isOpen) {
  const settingsBtn = document.getElementById("settings-btn");
  const settingsMenu = document.getElementById("settings-menu");
  if (isOpen) {
    // Get button position
    const btnPosition = settingsBtn.getBoundingClientRect();
    // Position the menu just below the icon
    settingsMenu.style.position = "fixed";
    // Add 10px from button bottom to account for margin/padding
    settingsMenu.style.top = `${btnPosition.bottom + 10}px`;
  }
}

/**
 * Updates the settings icon based on the visibility of the settings menu.
 * If the menu is opened (has the 'show' class), it sets the icon to 'settings-open.svg'.
 * Otherwise, it sets the icon back to 'settings.svg'.
 */
export function updateSettingsIcon() {
  const settingsIcon = document.getElementById("settings-icon");
  const settingsMenu = document.getElementById("settings-menu");
  settingsIcon.classList.remove("is-swapping");

  const isOpen = settingsMenu.classList.contains("show");
  const icon = isOpen ? "settings-open.svg" : "settings.svg";
  const currentIcon = settingsIcon.src.includes(icon);
  const src = "../static/icons/" + icon;

  if (currentIcon !== icon) {
    updateSettingsMenuPosition(isOpen);
    // Force reflow to ensure transition is registered
    void settingsIcon.offsetWidth;

    // Add transition class to start fade-out
    settingsIcon.classList.add("is-swapping");

    // Get transition duration from computed styles in milliseconds
    const transitionDuration =
      getComputedStyle(settingsIcon).transitionDuration;
    const duration = parseFloat(transitionDuration) * 1000;

    // Wait for the transition to complete
    setTimeout(() => {
      settingsIcon.src = src;
      // Fade back in
      requestAnimationFrame(() => {
        settingsIcon.classList.remove("is-swapping");
      });
    }, duration);
  }
}

/**
 * Toggles the visibility of the settings menu,
 * and then updates the settings icon to reflect the current state.
 */
export function toggleSettings() {
  const settingsMenu = document.getElementById("settings-menu");
  settingsMenu.classList.toggle("show");
}

/**
 * Hides the settings menu by removing the 'show' class,
 * and updates the settings icon to the default (closed) state.
 */
export function hideSettings() {
  const settingsMenu = document.getElementById("settings-menu");
  settingsMenu.classList.remove("show");
  updateSettingsIcon();
}
