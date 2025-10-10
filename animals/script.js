import * as utils from "../static/utils.js";
import { TTS } from "../static/speech_helper.js";

const ttsInstance = TTS();
ttsInstance.unlockSpeech();

document.addEventListener("DOMContentLoaded", () => {
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

  // --- DOM ELEMENTS ---
  const container = document.getElementById("animal-container");
  const animalImage = document.getElementById("animal-image");
  const animalName = document.getElementById("animal-name");
  const muteButton = document.getElementById("muteButton");
  const fullscreenBtn = document.getElementById("fullscreen-btn");
  const settingsBtn = document.getElementById("settings-btn");
  const settingsMenu = document.getElementById("settings-menu");
  const randomizeCheckbox = document.getElementById("randomize");
  const autoplayCheckbox = document.getElementById("autoplay");

  // --- STATE VARIABLES ---
  let currentIndex = -1;
  let isMuted = localStorage.getItem("isMuted") === "true";
  let autoplayInterval = null;
  let currentAudio = null;

  // --- CORE FUNCTIONS ---

  /**
   * Displays the next animal and plays its sound.
   */
  function showNextAnimal() {
    // Determine next index
    const isRandom = randomizeCheckbox.checked;
    let nextIndex = currentIndex;

    if (isRandom) {
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
    animalName.textContent = "";

    // Set the image source
    animalImage.src = animal.image;
    animalImage.alt = animal.name;

    // Attach a 'load' event listener to the image
    animalImage.onload = () => {
      animalName.textContent = animal.name;
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
    muteButton.addEventListener("click", utils.toggleMute);
    fullscreenBtn.addEventListener("click", utils.toggleFullscreen);
    settingsBtn.addEventListener("click", utils.toggleSettings);
    autoplayCheckbox.addEventListener("change", handleAutoplay);

    // Close settings if clicking outside
    document.addEventListener("click", (event) => {
      if (
        !settingsMenu.contains(event.target) &&
        !settingsBtn.contains(event.target)
      ) {
        utils.hideSettings();
      }
    });

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

  // --- INITIALIZATION ---
  function init() {
    settingsBtn.style.display = "block";
    randomizeCheckbox.checked = localStorage.getItem("isRandom") === "true";
    randomizeCheckbox.addEventListener("change", () => {
      localStorage.setItem("isRandom", randomizeCheckbox.checked);
    });

    utils.bodyAction(showNextAnimal);
    utils.updateMuteBtn();
    utils.setFullscreenIcon();
    utils.updateFullScreenBtn();

    setupEventListeners();
    // Load the first animal on page load
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
