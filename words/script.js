// =========================================================================
// GLOBAL VARIABLES & CONSTANTS
// =========================================================================
import * as utils from "../static/utils.js";
import { TTS } from "../static/speech_helper.js";

// --- DOM Element References ---
const wordElement = document.getElementById("word-display");
const settingsBtn = document.getElementById("settings-btn");
const settingsIcon = document.getElementById("settings-icon");
const randomizeCheckbox = document.getElementById("randomize-words");
const languageSelect = document.getElementById("language-select");

// --- Application State & Configuration ---
// Read language from URL, default to English
const urlParams = new URLSearchParams(window.location.search);
const lang = urlParams.get("lang")?.toLowerCase() || "english";
const languageData = window.wordsData[lang] || window.wordsData.english;

const WordList = languageData.words;
const Locale = languageData.locale;

let currentColor = null;
let previousColor = null;
let currentIndex = 0;
let history = [];
let locked = false;

// --- Speaker Initiation --
const ttsInstance = TTS();
ttsInstance.unlockSpeech();

// =========================================================================
// CORE APPLICATION LOGIC
// =========================================================================

function getNextSequentialWord() {
  currentIndex++;
  if (currentIndex >= WordList.length) {
    currentIndex = 0;
  }
  return WordList[currentIndex];
}

function getNextRandomWord() {
  let newWord;
  let randomIndex;
  let attempts = 0;
  const maxAttempts = WordList.length * 2;

  do {
    randomIndex = Math.floor(Math.random() * WordList.length);
    newWord = WordList[randomIndex];
    attempts++;
  } while (
    WordList.length > 1 &&
    history.includes(newWord) &&
    attempts < maxAttempts
  );

  const maxHistorySize = Math.min(WordList.length - 1, 10); // Keep last 10 words out of rotation
  if (WordList.length > 1) {
    history.push(newWord);
    if (history.length > maxHistorySize) {
      history.shift();
    }
  }

  return newWord;
}

function updateWord() {
  const isRandomEnabled = utils.getIsRandomEnabled();
  let wordToDisplay;
  previousColor = currentColor;

  if (isRandomEnabled) {
    wordToDisplay = getNextRandomWord();
    currentColor = utils.getRandomColor(previousColor, currentColor);
    currentIndex = -1;
  } else {
    wordToDisplay = getNextSequentialWord();
    currentColor = utils.getNextColor(previousColor, currentColor);
    history = [];
  }

  wordElement.textContent = wordToDisplay;
  wordElement.style.color = currentColor;

  setTimeout(() => {
    speaker();
    locked = false;
  }, 700); // Gives time for the color transition before speaking
}

function incrementWord() {
  if (locked) {
    return;
  }
  locked = true;
  setTimeout(updateWord, 100);
  utils.hideSettings();
}

// =========================================================================
// SPEECH SYNTHESIS
// =========================================================================

function speaker() {
  if (!utils.isMuted()) {
    ttsInstance.speakElement(wordElement.textContent, {
      directSpeech: true,
      rate: 0.8, // Slightly slower for clearer pronunciation of sight words
      locale: Locale,
    });
  }
}

// =========================================================================
// INITIALIZATION & EVENT LISTENERS
// =========================================================================
// --- Populate Language Dropdown ---
Object.keys(window.wordsData).forEach((langKey) => {
  const option = document.createElement("option");
  option.value = langKey;
  option.textContent = utils.toTitleCase(langKey);
  languageSelect.appendChild(option);
});

languageSelect.value = lang;
wordElement.textContent = WordList[0];

// --- Dropdown Event Listeners ---
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

function handleKeydown(event) {
  const target = event.target;

  switch (event.code) {
    case "Space":
    case "Enter":
    case "ArrowRight":
      if (utils.isInteractiveElement(target)) {
        return;
      }
      event.preventDefault();
      incrementWord();
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
  }
}

utils.addListeners(settingsBtn, utils.onClickSettings);
utils.addListeners(settingsIcon, utils.onClickSettings);

randomizeCheckbox.addEventListener("change", (e) => {
  e.stopPropagation();
  utils.setIsRandom(randomizeCheckbox.checked);
});

utils.setFullscreenIcon();

document.addEventListener("DOMContentLoaded", () => {
  settingsBtn.style.display = "block";

  document.addEventListener("keydown", handleKeydown);
  utils.bodyAction(incrementWord);
  utils.updateMuteBtn();
  utils.updateFullScreenBtn();

  if (ttsInstance.isSpeechReady()) {
    utils.enableMuteBtn();
    speaker();
  } else {
    utils.disableMuteBtn();
  }
});
