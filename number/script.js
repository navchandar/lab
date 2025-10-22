// =========================
// Initialization
// =========================
import * as utils from "../static/utils.js";
import { TTS } from "../static/speech_helper.js";

// --- DOM Element References ---
const numberElement = document.getElementById("number");

const settingsBtn = document.getElementById("settings-btn");
const settingsIcon = document.getElementById("settings-icon");

let number = 1;
let currentColor = null;
let previousColor = null;

let intervalID = null;
let Locale = null;

// --- Speaker Initiation --
const ttsInstance = TTS();
ttsInstance.unlockSpeech();

const colors = [
  "red",
  "blue",
  "green",
  "white",
  "orange",
  "brown",
  "pink",
  "yellow",
];

// =========================
// Utility Functions
// =========================

/**
 * Speaks the given text displayed on the screen.
 */
function speaker() {
  if (!utils.isMuted()) {
    ttsInstance.speakElement(numberElement.textContent, {
      directSpeech: true,
      rate: 0.8,
    });
  }
}

function incrementNumber() {
  // Determine which mode to use (random or sequential)
  const isRandomEnabled = utils.getIsRandomEnabled();

  setTimeout(() => {
    if (isRandomEnabled) {
      // select random number between 1 and 100.
      const randomValue = Math.floor(Math.random() * 100) + 1;
      numberElement.textContent = randomValue;
    } else {
      number++;
      numberElement.textContent = number;
    }
    previousColor = currentColor;
    currentColor = utils.getNewColor(colors, previousColor, currentColor);
    numberElement.style.color = currentColor;
    setTimeout(speaker, 700);
  }, 200);

  utils.hideSettings();
}

// Function to set the randomize state in localStorage
function setIsRandomNum(value) {
  localStorage.setItem("randomize", value);
  console.log("Randomize set to:", utils.getIsRandomEnabled());
  if (!value && number !== 1) {
    number = 0;
  }
}

function autoplay() {
  if (intervalID) {
    clearInterval(intervalID);
  }
  incrementNumber();
  intervalID = setInterval(() => {
    incrementNumber();
  }, 5000);
}

function updateSettingsMenu() {
  // =========================
  // Settings Menu
  // =========================
  const randomizeCheckbox = document.getElementById("randomize");
  const autoplayCheckbox = document.getElementById("autoplay");

  // Toggle menu visibility
  settingsBtn.style.display = "block";
  utils.addListeners(settingsBtn, utils.onClickSettings);
  utils.addListeners(settingsIcon, utils.onClickSettings);

  setIsRandomNum(randomizeCheckbox.checked);
  utils.addUnifiedListeners(randomizeCheckbox, () => {
    setIsRandomNum(randomizeCheckbox.checked);
  });

  function handleAutoplayToggle() {
    if (autoplayCheckbox.checked) {
      autoplay();
    } else {
      clearInterval(intervalID);
      incrementNumber();
    }
  }
  utils.addUnifiedListeners(autoplayCheckbox, handleAutoplayToggle);
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
      incrementNumber();
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
  updateSettingsMenu();

  document.addEventListener("keydown", handleKeydown);
  utils.bodyAction(incrementNumber);
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
