import * as utils from "../static/utils.js";
import { TTS } from "../static/speech_helper.js";

const ttsInstance = TTS();
ttsInstance.unlockSpeech();

// --- DOM ELEMENTS ---
const container = document.getElementById("animal-container");
const animalImage = document.getElementById("animal-image");
const animalName = document.getElementById("animal-name");
const settingsBtn = document.getElementById("settings-btn");
const settingsIcon = document.getElementById("settings-icon");
const randomizeCheckbox = document.getElementById("randomize");
const autoplayCheckbox = document.getElementById("autoplay");

document.addEventListener("DOMContentLoaded", () => {
  utils.updateMuteBtn();
  utils.setFullscreenIcon();
  utils.updateFullScreenBtn();

  // --- DATA ---
  const animalNames = [
    "Dog",
    "Cat",
    "Rabbit",
    "Cow",
    "Ox",
    "Goat",
    "Sheep",
    "Buffalo",
    "Horse",
    "Donkey",
    "Camel",
    "Elephant",
    "Chicken",
    "Rooster",
    "Parrot",
    "Pigeon",
    "Duck",
  ];

  // 'image' is the path to each animals picture
  const animals = animalNames.map((name) => {
    const file = name.toLowerCase().replace(/ /g, "-");
    return {
      name: name,
      image: `../static/images/${file}.jpg`,
    };
  });

  // --- STATE VARIABLES ---
  let currentIndex = -1;
  let autoplayInterval = null;

  // --- CORE FUNCTIONS ---

  /**
   * Displays the next animal and plays its sound.
   */
  function showNextAnimal() {
    // Determine next index// Determine which mode to use (random or sequential)
    const isRandomEnabled = utils.getIsRandomEnabled();
    let nextIndex = currentIndex;

    if (isRandomEnabled) {
      // Ensure the next random animal is different from the current one
      while (nextIndex === currentIndex) {
        nextIndex = Math.floor(Math.random() * animals.length);
      }
    } else {
      nextIndex = (currentIndex + 1) % animals.length;
    }
    currentIndex = nextIndex;

    const animal = animals[currentIndex];

    // Temporarily clear the name to show the name
    animalName.style.opacity = 0;

    // Set the image source
    animalImage.src = animal.image;
    animalImage.alt = animal.name;

    // Attach a 'load' event listener to the image
    animalImage.onload = () => {
      animalName.textContent = animal.name;
      animalName.style.opacity = 1;
      setTimeout(() => {
        if (!utils.isMuted()) {
          ttsInstance.speakElement(animalName);
        }
      }, 500);
      animalImage.onload = null;
    };

    // Handle potential errors during image loading
    animalImage.onerror = () => {
      console.error("Error loading image:", animal.image);
      // You might want to update the name/UI even on error or show a placeholder
      animalImage.onload = null;
    };

    utils.hideSettings();
  }

  // --- UI & CONTROL FUNCTIONS ---

  function handleAutoplay() {
    if (autoplayCheckbox.checked) {
      if (autoplayInterval) {
        clearInterval(autoplayInterval);
      }
      showNextAnimal(); // Show one immediately
      autoplayInterval = setInterval(showNextAnimal, 5000);
    } else {
      clearInterval(autoplayInterval);
      autoplayInterval = null;
    }
  }

  // --- EVENT LISTENERS ---

  function setupEventListeners() {
    container.addEventListener("click", showNextAnimal);

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
          showNextAnimal();
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

    document.addEventListener("keydown", handleKeydown);
  }

  function updateSettingsMenu() {
    // =========================
    // Settings Menu
    // =========================
    // Toggle menu visibility
    settingsBtn.style.display = "block";
    utils.addListeners(settingsBtn, utils.onClickSettings);
    utils.addListeners(settingsIcon, utils.onClickSettings);

    utils.setIsRandom(randomizeCheckbox.checked);
    utils.addUnifiedListeners(randomizeCheckbox, () => {
      utils.setIsRandom(randomizeCheckbox.checked);
    });

    utils.addUnifiedListeners(autoplayCheckbox, handleAutoplay);
  }

  // --- INITIALIZATION ---
  function init() {
    updateSettingsMenu();
    setupEventListeners();
    // Load the first animal on page load
    utils.bodyAction(showNextAnimal);
    showNextAnimal();
    // update mute button if speech supported
    if (ttsInstance.isSpeechReady()) {
      utils.enableMuteBtn();
      if (!utils.isMuted()) {
        ttsInstance.speakElement(animalName);
      }
    } else {
      utils.disableMuteBtn();
    }
  }

  init();
});
