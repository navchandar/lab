import * as utils from "../static/utils.js";
import { TTS } from "../static/speech_helper.js";

// --- DOM Element References ---
const shapeElement = document.getElementById("shape");
const shapeNameElement = document.getElementById("shapename");

const settingsBtn = document.getElementById("settings-btn");

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
  "egg",
];

const colors = [
  "black",
  "darkgray",
  "red",
  "maroon",
  "gold",
  "olive",
  "lime",
  "green",
  "teal",
  "blue",
  "navy",
  "purple",
];

let intervalID = null;
let currentShapeIndex = 0;
let previousShapeIndex = 0;
let currentColor = null;
let previousColor = null;
let isMute = utils.isMuted();

function changeTextColor(color, label) {
  shapeNameElement.classList.add("fade-out");
  // Wait for fade-out to complete, then change text and fade in
  setTimeout(() => {
    shapeNameElement.textContent = label;
    shapeNameElement.classList.remove("fade-out");
    // Speak the shape name
    if (!utils.isMuted()) {
      ttsInstance.speakElement(shapeNameElement);
    }
  }, 700);
  console.log("Updated text content to: " + label);
}

function updateShape() {
  // Remove current shape class
  shapeElement.className = "";
  shapeElement.classList.add("shape");
  let newShape = null;

  // Determine which mode to use (random or sequential)
  const isRandomEnabled = utils.getIsRandomEnabled();
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
  } else {
    // Update index
    currentShapeIndex = (currentShapeIndex + 1) % shapes.length;
  }

  // Add new shape class
  newShape = shapes[currentShapeIndex];
  shapeElement.classList.add(newShape);
  // Apply random background color
  previousColor = currentColor;
  currentColor = utils.getNewColor(colors, previousColor, currentColor);
  shapeElement.style.backgroundColor = currentColor;
  changeTextColor(currentColor, newShape);
  utils.hideSettings();
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
  utils.addListeners(settingsBtn, utils.toggleSettings);

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
      utils.toggleMute();
      utils.hideSettings();
      if (utils.isMuted()) {
        ttsInstance.cancel();
      } else {
        ttsInstance.speakElement(shapeNameElement);
      }
      break;
    case "KeyF":
      event.preventDefault();
      utils.toggleFullscreen();
      utils.hideSettings();
      break;
    case "KeyS":
      event.preventDefault();
      utils.toggleSettings();
      break;
    case "Escape":
      utils.hideSettings();
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
    if (!utils.isMuted()) {
      ttsInstance.speakElement(shapeNameElement);
    }
  } else {
    utils.disableMuteBtn();
  }
});
