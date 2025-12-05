import * as utils from "../static/utils.js";
import { TTS } from "../static/speech_helper.js";

// --- DOM Element References ---
const shapeElement = document.getElementById("shape");
const shapeNameElement = document.getElementById("shapename");

const settingsBtn = document.getElementById("settings-btn");
const settingsIcon = document.getElementById("settings-icon");

// --- Speaker Initiation --
const ttsInstance = TTS();
ttsInstance.unlockSpeech();

// List of shapes from 1 to 10 sides
const shapes = [
  "line", // 1 side
  "angle", // 2 sides
  "triangle", // 3 sides
  "square", // 4 sides
  "rectangle", // 4 sides
  "diamond", // 4 sides
  "pentagon", // 5 sides
  "hexagon", // 6 sides
  "heptagon", // 7 sides
  "octagon", // 8 sides
  "nonagon", // 9 sides
  "decagon", // 10 sides
  "star",
  "circle",
  "ellipse",
];

let intervalID = null;
let currentShapeIndex = 0;
let previousShapeIndex = 0;
let currentColor = null;
let previousColor = null;
let locked = false;

/**
 * Speaks the given text displayed on the screen.
 */
function speaker() {
  if (!utils.isMuted()) {
    ttsInstance.speakElement(shapeNameElement);
  }
}

function updateShape() {
  // If locked, stop immediately
  if (locked) {
    return;
  }

  // --- LOGIC: Determine next shape & color ---
  const isRandomEnabled = utils.getIsRandomEnabled();
  previousColor = currentColor;
  let newShape = null;
  locked = true;

  if (isRandomEnabled) {
    let randomIndex;
    let currentShape = shapes[currentShapeIndex];
    let previousShape = shapes[previousShapeIndex];

    // Keep picking a random shape until it's not the current or previous one
    do {
      randomIndex = Math.floor(Math.random() * shapes.length);
    } while (
      shapes[randomIndex] === currentShape ||
      shapes[randomIndex] === previousShape
    );

    // Update indices
    previousShapeIndex = currentShapeIndex;
    currentShapeIndex = randomIndex;
    currentColor = utils.getRandomColor(previousColor, currentColor);
  } else {
    // Update index
    currentShapeIndex = (currentShapeIndex + 1) % shapes.length;
    currentColor = utils.getNextColor(previousColor, currentColor);
  }

  newShape = shapes[currentShapeIndex];

  // Add fade-out class to the text
  shapeNameElement.classList.add("fade-out");

  // Wait for fade-out (700ms)
  setTimeout(() => {
    // Update Shape Visuals
    // Reset class list to base "shape" plus the new shape name
    shapeElement.className = "shape " + newShape;
    shapeElement.style.backgroundColor = currentColor;
    utils.hideSettings();

    setTimeout(() => {
      // Update Text of shape
      shapeNameElement.textContent = newShape;
      // Fade In (Remove fade-out class)
      shapeNameElement.classList.remove("fade-out");
      console.log("Updated text content to: " + newShape);
      // Unlock after speaker
      setTimeout(() => {
        speaker();
        locked = false;
      }, 500);
    }, 500);
  }, 700);
}

function autoplay() {
  if (intervalID) {
    clearInterval(intervalID);
  }
  updateShape();
  intervalID = setInterval(() => {
    updateShape();
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

  utils.setIsRandom(randomizeCheckbox.checked);
  utils.addUnifiedListeners(randomizeCheckbox, () => {
    utils.setIsRandom(randomizeCheckbox.checked);
  });

  function handleAutoplayToggle() {
    if (autoplayCheckbox.checked) {
      autoplay();
    } else {
      clearInterval(intervalID);
      updateShape();
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
      updateShape();
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

  shapeElement.style.backgroundColor = "cornflowerblue";
  document.addEventListener("keydown", handleKeydown);
  utils.bodyAction(updateShape);
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
