// =========================
// Initialization
// =========================
import * as utils from "../static/utils.js";

// --- DOM Element References ---
const numberElement = document.getElementById("number");
const muteButton = document.getElementById("muteButton");

const settingsBtn = document.getElementById("settings-btn");
const settingsIcon = document.getElementById("settings-icon");

let number = 1;
let currentColor = null;
let previousColor = null;

let intervalID = null;

const synth = window.speechSynthesis;
let Locale = null;
let utterance = null;
let isMute = utils.isMuted();
let retryCount = 0;
const maxRetries = 10;

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

// Initial mute button state
muteButton.disabled = true;
muteButton.title = "Setting up Speech Synthesis...";

function updateSpeakerOptions() {
  // Initial mute button state
  muteButton.disabled = true;
  muteButton.title = "Setting up Speech Synthesis...";

  Locale = "en-US";
  // =========================
  // Speech Synthesis Setup
  // =========================
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
    console.warn("Web Speech API is not supported in this browser.");
    muteButton.style.display = "none";
    window.speaker = () => console.warn("Speech API not available.");
  } else {
    // Initialize utterance only if supported
    utterance = new SpeechSynthesisUtterance();
    let availableVoices = [];

    let pop = function populateVoiceList() {
      let voices = synth.getVoices();

      if (!voices || !voices.length) {
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(populateVoiceList, 100);
        } else {
          console.warn("Failed to load voices after multiple attempts.");
          muteButton.disabled = true;
          muteButton.title = "Speech not available";
        }
        return;
      }

      availableVoices = voices.sort((a, b) => a.name.localeCompare(b.name));
      console.log(
        "Available voices:",
        availableVoices.map((v) => `${v.name} (${v.lang})`)
      );

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

      if (!preferredVoice) {
        const langPrefix = Locale.split("-")[0];
        preferredVoice =
          availableVoices.find((v) => v.lang.startsWith(langPrefix)) ||
          availableVoices.find((v) => v.lang.indexOf(Locale) !== -1) ||
          availableVoices[0];
      }

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
        muteButton.disabled = false;
        muteButton.style.display = "none";
      }
    };

    pop();
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = pop;
    }
  }
}
// =========================
// Utility Functions
// =========================

function speaker() {
  isMute = utils.isMuted();
  if (utterance && !isMute) {
    if (synth.speaking) {
      synth.cancel();
    }
    utterance.text = numberElement.textContent;
    try {
      synth.speak(utterance);
    } catch (error) {
      console.error("Error speaking:", error);
    }
  } else if (!utterance) {
    console.warn("Speech API not initialized. Cannot speak.");
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
    speaker();
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
      utils.toggleMute();
      utils.hideSettings();
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

utils.setFullscreenIcon();

document.addEventListener("DOMContentLoaded", () => {
  updateSpeakerOptions();
  speaker();
  updateSettingsMenu();

  document.addEventListener("keydown", handleKeydown);
  utils.bodyAction(incrementNumber);
  utils.updateMuteBtn();
  utils.updateFullScreenBtn();
});
