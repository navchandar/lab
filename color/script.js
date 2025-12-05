import * as utils from "../static/utils.js";
import { TTS } from "../static/speech_helper.js";

// --- DOM Element References ---
const colorNameEl = document.getElementById("color-name");

const settingsBtn = document.getElementById("settings-btn");
const settingsIcon = document.getElementById("settings-icon");

// --- Application State & Configuration ---
let Locale = null;
let currentIndex = 0;
let intervalID = null;
let locked = false;

// --- Speaker Initiation --
const ttsInstance = TTS();
ttsInstance.unlockSpeech();

const urlParam = new URLSearchParams(window.location.search);
let currentLang = urlParam.get("lang") || "english";

// Create a 1x1 pixel canvas to do the color conversion
const canvas = document.createElement("canvas");
canvas.width = 1;
canvas.height = 1;
const ctx = canvas.getContext("2d", { willReadFrequently: true });
if (!ctx) {
  console.error("Failed to get 2D canvas context.");
}

function getBrightness(color) {
  try {
    // Draw a 1x1 pixel rectangle to apply the color
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    // Get the color data for that single pixel in an array [R, G, B, Alpha].
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    // Formula to calculate a weighted average of the three primary colors
    // Baed on ITU-R BT.601 standard
    return (r * 299 + g * 587 + b * 114) / 1000;
  } catch (e) {
    // Assume bright background as fallback
    console.error(`Invalid color: ${color}`, e);
    return 255;
  }
}

function getTextStyleForBrightness(color) {
  const brightness = getBrightness(color);
  const isDark = brightness < 128;
  return {
    textColor: isDark ? "white" : "black",
    textShadow: `
            5px 5px 5px ${
              isDark ? "rgba(0, 0, 0, 0.4)" : "rgba(255, 255, 255, 0.4)"
            },
           -2px -2px 5px ${
             isDark ? "rgba(255, 255, 255, 0.4)" : "rgba(0, 0, 0, 0.4)"
           }
        `,
  };
}

function changeBodyColor(color) {
  // Update theme color on supported mobile devices
  const metaTag = document.getElementById("theme-color");
  if (metaTag) {
    metaTag.setAttribute("content", color);
  }
  // update color with importance to work on devices with Dark viewer
  document.body.style.setProperty("background-color", color, "important");
  console.log("Updated background color to: " + color);
}

function changeColor(color, label) {
  const { textColor, textShadow } = getTextStyleForBrightness(color);
  colorNameEl.classList.add("fade-out");
  // Wait for fade-out to complete, then change text and fade in
  setTimeout(() => {
    changeBodyColor(color);
    setTimeout(() => {
      colorNameEl.style.color = textColor;
      colorNameEl.style.textShadow = textShadow;
      colorNameEl.textContent = label;
      colorNameEl.classList.remove("fade-out");
      speaker();
      locked = false;
      console.log("Updated text content to: " + label);
      console.log("Updated text color to: " + textColor);
    }, 700);
  }, 500);
}

const lastColors = [];
function getRandomColorExcludingLast(colorsArray) {
  const availableColors = colorsArray.filter(
    (c) => !lastColors.includes(c.color)
  );
  if (availableColors.length === 0) {
    // If all colors are in the lastColors list, reset the history
    lastColors.length = 0;
    return getRandomColorExcludingLast(colorsArray);
  }
  const randomIndex = Math.floor(Math.random() * availableColors.length);
  return availableColors[randomIndex];
}

function updateColor() {
  // If locked, stop immediately
  if (locked) {
    return;
  }

  // Get color data and label values
  const colorData =
    window.colors && window.colors[currentLang]
      ? window.colors[currentLang]
      : (console.error(`Color data for "${currentLang}" not found`), {});

  if (colorData) {
    locked = true;
    Locale = colorData.locale;
    // Determine which mode to use (random or sequential)
    const isRandomEnabled = utils.getIsRandomEnabled();
    let selectedColorData;
    if (isRandomEnabled) {
      selectedColorData = getRandomColorExcludingLast(colorData.names);
    } else {
      selectedColorData = colorData.names[currentIndex];
      currentIndex = (currentIndex + 1) % colorData.names.length;
    }
    const color = selectedColorData.color;
    const label = selectedColorData.label;

    changeColor(color, label);

    // Update lastColors history
    if (isRandomEnabled) {
      lastColors.push(color);
      // Keep only the last 3
      if (lastColors.length > 3) {
        lastColors.shift();
      }
    }
  }
  utils.hideSettings();
}

function autoplay() {
  if (intervalID) {
    clearInterval(intervalID);
  }
  updateColor();
  intervalID = setInterval(() => {
    updateColor();
  }, 5000);
}

function updateSettingsMenu() {
  // =========================
  // Settings Menu
  // =========================
  const languageSelect = document.getElementById("language-select");
  const randomizeCheckbox = document.getElementById("randomize");
  const autoplayCheckbox = document.getElementById("autoplay");

  // Toggle menu visibility
  settingsBtn.style.display = "block";
  utils.addListeners(settingsBtn, utils.onClickSettings);
  utils.addListeners(settingsIcon, utils.onClickSettings);

  // Populate dropdown
  Object.keys(window.colors).forEach((lang) => {
    const option = document.createElement("option");
    option.value = lang;
    option.textContent = utils.toTitleCase(lang);
    languageSelect.appendChild(option);
  });

  // Detect current language from URL
  languageSelect.value = currentLang;

  // Redirect on language change
  languageSelect.addEventListener("change", (e) => {
    e.stopPropagation();
    const selectedLang = e.target.value;
    window.location.href = `https://navchandar.github.io/lab/color/?lang=${selectedLang}`;
  });

  languageSelect.addEventListener(
    "touchstart",
    (e) => {
      e.stopPropagation();
    },
    { passive: false }
  );

  languageSelect.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  document.getElementById("language-label").addEventListener(
    "touchstart",
    (e) => {
      e.stopPropagation();
    },
    { passive: false }
  );

  document.getElementById("language-label").addEventListener("click", (e) => {
    e.stopPropagation();
  });

  utils.setIsRandom(randomizeCheckbox.checked);
  utils.addUnifiedListeners(randomizeCheckbox, () => {
    utils.setIsRandom(randomizeCheckbox.checked);
  });

  function handleAutoplayToggle() {
    if (autoplayCheckbox.checked) {
      autoplay();
    } else {
      clearInterval(intervalID);
      updateColor();
    }
  }

  utils.addUnifiedListeners(autoplayCheckbox, handleAutoplayToggle);
}

/**
 * Speaks the given text displayed on the screen.
 */
function speaker() {
  if (!utils.isMuted()) {
    ttsInstance.speakElement(colorNameEl.textContent, {
      directSpeech: true,
      rate: 0.8,
      locale: Locale,
    });
  }
}

// =========================
// Event Listeners
// =========================
function handleKeydown(event) {
  const target = event.target;

  switch (event.code) {
    case "Space":
    case "Enter":
      // Ignore key presses if focused on an interactive element
      if (utils.isInteractiveElement(target)) {
        return;
      }
      event.preventDefault();
      updateColor();
      break;
    case "KeyM":
      event.preventDefault();
      utils.hideSettings();
      utils.toggleMute();
      if (utils.isMuted()) {
        ttsInstance.cancel();
      } else {
        speaker();
      }
      break;
    case "KeyF":
      event.preventDefault();
      utils.toggleFullscreen();
      utils.hideSettings();
      break;
    case "KeyS":
      event.preventDefault();
      utils.onClickSettings();
      break;
    case "Escape":
      utils.hideSettings();
      utils.hideSidebar();
      break;
    case "Equal":
      event.preventDefault();
      utils.handleSidebar();
      break;
  }
}

utils.setFullscreenIcon();

document.addEventListener("DOMContentLoaded", () => {
  updateColor();
  updateSettingsMenu();

  document.addEventListener("keydown", handleKeydown);
  utils.bodyAction(updateColor);
  utils.updateMuteBtn();
  utils.updateFullScreenBtn();

  // update mute button if speech supported
  if (ttsInstance.isSpeechReady()) {
    utils.enableMuteBtn();
    speaker();
  } else {
    utils.disableMuteBtn();
  }
});
