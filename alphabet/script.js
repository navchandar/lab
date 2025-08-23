// =========================================================================
// GLOBAL VARIABLES & CONSTANTS
// =========================================================================
import * as utils from "../static/utils.js";

// --- DOM Element References ---
const numberElement = document.getElementById("number");
const settingsBtn = document.getElementById("settings-btn");
const settingsMenu = document.getElementById("settings-menu");
const languageSelect = document.getElementById("language-select");
const randomizeCheckbox = document.getElementById("randomize-alphabet");
const muteButton = document.getElementById("muteButton");


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
let isMuted = localStorage.getItem("isMuted") === "true";
let currentIndex = 0;
let history = []; // Used to prevent immediate repeats in random mode

// --- Speech Synthesis State ---
const synth = window.speechSynthesis;
let utterance = null;
let retryCount = 0;
const maxRetries = 10; // Max attempts to fetch voices

/**
 * Gets a new random color, avoiding the current and previous colors.
 * @returns {string} A new color name.
 */
function getNewColor() {
  let newColor;
  do {
    newColor = colors[Math.floor(Math.random() * colors.length)];
  } while (newColor === currentColor || newColor === previousColor);
  return newColor;
}

// =========================================================================
// STATE MANAGEMENT (LOCALSTORAGE)
// =========================================================================

/**
 * Gets the randomize state from localStorage.
 * @returns {boolean} True if randomize is enabled, otherwise false.
 */
function getIsRandomAlphabetEnabled() {
  return localStorage.getItem("randomizeAlphabet") === "true";
}

/**
 * Sets the randomize state in localStorage.
 * @param {boolean} value The new state for the randomize setting.
 */
function setIsRandomAlphabet(value) {
  localStorage.setItem("randomizeAlphabet", value);
}

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
  const isRandomAlphabetEnabled = getIsRandomAlphabetEnabled();
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
  currentColor = getNewColor();
  numberElement.style.color = currentColor;

  // Speak the new character
  speaker();
}

/**
 * A wrapper for updateCharacter with a slight delay and closes the settings menu.
 */
function incrementAlphabet() {
  // Delay the execution slightly for visual/auditory pacing
  setTimeout(updateCharacter, 100);
  settingsMenu.classList.remove("show");
}

// =========================================================================
// SPEECH SYNTHESIS
// =========================================================================

/**
 * Populates the list of available voices and selects the best one for the current language.
 * This function may be called multiple times as voices load asynchronously.
 */
function populateVoiceList() {
  let voices = synth.getVoices();

  // If voices are not ready, retry a few times.
  if (!voices || !voices.length) {
    if (retryCount < maxRetries) {
      retryCount++;
      setTimeout(populateVoiceList, 100);
    } else {
      console.warn(
        "Failed to load speech synthesis voices after multiple attempts."
      );
      muteButton.disabled = true;
      muteButton.title = "Speech not available";
    }
    return;
  }

  // Sort voices for consistency and debugging.
  let availableVoices = voices.sort((a, b) => a.name.localeCompare(b.name));

  // Attempt to find a preferred, high-quality voice from major vendors.
  let preferredVoice = availableVoices.find(
    (voice) =>
      voice.lang === Locale &&
      [
        "Google",
        "Microsoft",
        "Apple",
        "Samantha",
        "Monica",
        "Zira",
        "David",
      ].some((name) => voice.name.includes(name))
  );

  // If no high-quality voice is found, find any voice matching the language code.
  if (!preferredVoice) {
    const langPrefix = Locale.split("-")[0];
    preferredVoice =
      availableVoices.find((v) => v.lang.startsWith(langPrefix)) ||
      availableVoices.find((v) => v.lang.indexOf(Locale) !== -1);
  }

  // If a suitable voice is found, configure the utterance.
  if (preferredVoice) {
    utterance.voice = preferredVoice;
    utterance.lang = preferredVoice.lang;
    console.log(
      "Set default voice to:",
      preferredVoice.name,
      preferredVoice.lang
    );
    muteButton.disabled = false;
    muteButton.title = "Toggle sound";
  } else {
    console.warn("No suitable voice found for Locale: " + Locale);
    muteButton.style.display = "none"; // Hide button if no voice is available
  }
}

/**
 * Speaks the current character displayed on the screen.
 */
function speaker() {
  muteButton.title = isMuted ? "Unmute button" : "Mute Button";
  if (utterance && !isMuted) {
    if (synth.speaking) {
      synth.cancel(); // Stop any currently playing speech
    }
    utterance.text = numberElement.textContent.toLowerCase();
    try {
      synth.speak(utterance);
    } catch (error) {
      console.error("Error speaking:", error);
    }
  } else if (!utterance) {
    console.warn("Speech API not initialized. Cannot speak.");
  }
}

// =========================================================================
// UI CONTROL FUNCTIONS (MUTE, FULLSCREEN, SETTINGS)
// =========================================================================

/**
 * Toggles the mute state on/off.
 */
function toggleMute() {
  isMuted = !isMuted;
  localStorage.setItem("isMuted", isMuted);
  muteButton.textContent = isMuted ? "🔇" : "🔊";
  if (isMuted && synth.speaking) {
    synth.cancel();
  }
  if (!isMuted) {
    speaker(); // Speak immediately on unmute
  }
  muteButton.title = isMuted ? "Unmute button" : "Mute Button";
  settingsMenu.classList.remove("show");
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
muteButton.textContent = isMuted ? "🔇" : "🔊";
randomizeCheckbox.checked = getIsRandomAlphabetEnabled();

// --- Initialize Speech Synthesis ---
if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
  console.warn("Web Speech API is not supported in this browser.");
  muteButton.style.display = "none";
  window.speaker = () => console.warn("Speech API not available.");
} else {
  utterance = new SpeechSynthesisUtterance();
  muteButton.disabled = true;
  muteButton.title = "Setting up Speech Synthesis...";
  populateVoiceList();
  // This event is crucial for some browsers that load voices asynchronously.
  if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = populateVoiceList;
  }
}

// --- Initialize Fullscreen Icon ---
document.fullscreenElement
  ? utils.setExitFullscreenIcon()
  : utils.setEnterFullscreenIcon();

// --- Initial Sound on Load ---
speaker();

// =========================================================================
// EVENT LISTENERS
// =========================================================================

// --- General Body & Keyboard Listeners ---
document.body.addEventListener("click", incrementAlphabet);
document.body.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    incrementAlphabet();
  },
  { passive: false }
);

document.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "Enter") {
    event.preventDefault();
    incrementAlphabet();
  } else if (event.code === "KeyM") {
    event.preventDefault();
    toggleMute();
  } else if (event.code === "KeyF") {
    event.preventDefault();
    utils.toggleFullscreen();
    settingsMenu.classList.remove("show");
  } else if (event.code === "KeyS") {
    event.preventDefault();
    settingsMenu.classList.toggle("show");
  } else if (event.code === "Escape") {
    settingsMenu.classList.remove("show");
  }
});

// --- Settings Menu Listeners ---
settingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  settingsMenu.classList.toggle("show");
});
settingsBtn.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    e.stopPropagation();
    settingsMenu.classList.toggle("show");
  },
  { passive: false }
);
window.addEventListener("DOMContentLoaded", () => {
  settingsBtn.style.display = "block";
});

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
  setIsRandomAlphabet(randomizeCheckbox.checked);
});
randomizeCheckbox.addEventListener("click", (e) => {
  e.stopPropagation();
  setIsRandomAlphabet(randomizeCheckbox.checked);
});
randomizeCheckbox.addEventListener(
  "touchstart",
  (e) => {
    e.stopPropagation();
    setIsRandomAlphabet(randomizeCheckbox.checked);
  },
  { passive: false }
);
document.getElementById("randomize-label").addEventListener(
  "touchstart",
  (e) => {
    randomizeCheckbox.click();
    e.stopPropagation();
  },
  { passive: false }
);

// --- Mute Button Listeners ---
muteButton.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleMute();
});
muteButton.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMute();
  },
  { passive: false }
);

utils.updateFullScreenBtn();