// =========================================================================
// GLOBAL VARIABLES & CONSTANTS
// =========================================================================
import * as utils from "../static/utils.js";
import { TTS } from "../static/speech_helper.js";

// --- DOM Element References ---
const numberElement = document.getElementById("number");

const settingsBtn = document.getElementById("settings-btn");
const settingsIcon = document.getElementById("settings-icon");
const languageSelect = document.getElementById("language-select");
const randomizeCheckbox = document.getElementById("randomize-alphabet");

// --- Application State & Configuration ---
const urlParams = new URLSearchParams(window.location.search);
const lang = urlParams.get("lang")?.toLowerCase() || "english";
const languageData = window.alphabets[lang] || window.alphabets.english;
const Alphabet = languageData.chars;
const Locale = languageData.locale;
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

let currentColor = null;
let previousColor = null;
let currentIndex = 0;
let history = []; // Used to prevent immediate repeats in random mode

// --- Speaker Initiation --
const ttsInstance = TTS();
ttsInstance.unlockSpeech();

// =========================================================================
// CORE APPLICATION LOGIC
// =========================================================================

/**
 * Gets the next character in sequential order.
 * Resets to the beginning if the end of the alphabet is reached.
 * @returns {string} The next character.
 */
function getNextSequentialChar() {
  currentIndex++;
  if (currentIndex >= Alphabet.length) {
    currentIndex = 0; // Loop back to the start
  }
  return Alphabet[currentIndex];
}

/**
 * Gets a random character from the alphabet, avoiding recent repeats.
 * It uses a short history buffer to ensure the same character isn't shown too frequently.
 * @returns {string} A random character.
 */
function getNextRandomChar() {
  let newChar;
  let randomIndex;
  let attempts = 0;
  const maxAttempts = Alphabet.length * 2; // Safeguard against infinite loops

  // Find a new character that is not in the recent history.
  do {
    randomIndex = Math.floor(Math.random() * Alphabet.length);
    newChar = Alphabet[randomIndex];
    attempts++;
  } while (
    Alphabet.length > 1 &&
    history.includes(newChar) &&
    attempts < maxAttempts
  );

  // Update history: Add the new character and remove the oldest if history is too long.
  // The history size is capped to ensure variety.
  const maxHistorySize = Math.min(Alphabet.length - 1, 3);
  if (Alphabet.length > 1) {
    history.push(newChar);
    if (history.length > maxHistorySize) {
      history.shift(); // Remove the oldest character from the front
    }
  }

  return newChar;
}

/**
 * Updates the displayed character, its color, and triggers speech.
 * This is the main function that drives the UI change.
 */
function updateCharacter() {
  const isRandomAlphabetEnabled = utils.getIsRandomEnabled();
  let charToDisplay;

  // Determine which mode to use (random or sequential)
  if (isRandomAlphabetEnabled) {
    charToDisplay = getNextRandomChar();
    currentIndex = -1; // Reset sequential index for clarity
  } else {
    charToDisplay = getNextSequentialChar();
    history = []; // Clear history when switching to sequential mode
  }

  // Update the DOM element with the new character
  numberElement.textContent = charToDisplay;

  // Change and apply a new color
  previousColor = currentColor;
  currentColor = utils.getNewColor(colors, previousColor, currentColor);
  numberElement.style.color = currentColor;

  // Speak the new character
  setTimeout(speaker, 700);
}

/**
 * A wrapper for updateCharacter with a slight delay and closes the settings menu.
 */
function incrementAlphabet() {
  // Delay the execution slightly for visual/auditory pacing
  setTimeout(updateCharacter, 100);
  utils.hideSettings();
}

// =========================================================================
// SPEECH SYNTHESIS
// =========================================================================

/**
 * Speaks the given text displayed on the screen.
 */
function speaker() {
  if (!utils.isMuted()) {
    ttsInstance.speakElement(numberElement.textContent.toLowerCase(), {
      directSpeech: true,
      rate: 0.8,
      locale: Locale,
    });
  }
}

// =========================================================================
// INITIALIZATION
// =========================================================================

// --- Populate Language Dropdown ---
Object.keys(window.alphabets).forEach((langKey) => {
  const option = document.createElement("option");
  option.value = langKey;
  option.textContent = utils.toTitleCase(langKey);
  languageSelect.appendChild(option);
});

// --- Set Initial Values from URL and LocalStorage ---
languageSelect.value = lang;
numberElement.textContent = Alphabet[0];

// =========================================================================
// EVENT LISTENERS
// =========================================================================
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
      incrementAlphabet();
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
      break;
  }
}

// Toggle menu visibility
utils.addListeners(settingsBtn, utils.onClickSettings);
utils.addListeners(settingsIcon, utils.onClickSettings);

// --- Language Select Listeners ---
languageSelect.addEventListener("change", (e) => {
  e.stopPropagation();
  const selectedLang = e.target.value;
  window.location.href = `?lang=${selectedLang}`;
});
languageSelect.addEventListener("click", (e) => e.stopPropagation());
languageSelect.addEventListener("touchstart", (e) => e.stopPropagation(), {
  passive: false,
});
document
  .getElementById("language-label")
  .addEventListener("click", (e) => e.stopPropagation());
document
  .getElementById("language-label")
  .addEventListener("touchstart", (e) => e.stopPropagation(), {
    passive: false,
  });

// --- Randomize Checkbox Listeners ---
randomizeCheckbox.addEventListener("change", (e) => {
  e.stopPropagation();
  utils.setIsRandom(randomizeCheckbox.checked);
});
randomizeCheckbox.addEventListener("click", (e) => {
  e.stopPropagation();
  utils.setIsRandom(randomizeCheckbox.checked);
});
randomizeCheckbox.addEventListener(
  "touchstart",
  (e) => {
    e.stopPropagation();
    utils.setIsRandom(randomizeCheckbox.checked);
  },
  { passive: false }
);

utils.setFullscreenIcon();

document.addEventListener("DOMContentLoaded", () => {
  settingsBtn.style.display = "block";

  document.addEventListener("keydown", handleKeydown);
  utils.bodyAction(incrementAlphabet);
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
