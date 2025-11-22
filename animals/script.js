import * as utils from "../static/utils.js";
import { TTS } from "../static/speech_helper.js";

// --- Configuration Constants ---
const IMAGE_BASE_PATH = "../static/images/";
const AUTOPLAY_INTERVAL = 5000;

// --- Speaker Initiation --
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
const loadingSpinner = document.getElementById("loadingSpinner");
/**
 * Speaks the given text displayed on the screen.
 */
function speaker() {
  if (!utils.isMuted()) {
    ttsInstance.speakElement(animalName);
  }
}

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

  /**
   * Data Structure: array of animal objects including state.
   * imageIndex tracks the current image (0 for cat_1.jpg, 1 for cat_2.jpg, etc.)
   */
  const animals = animalNames.map((name) => ({
    name: name,
    file: name.toLowerCase().replace(/ /g, "-"),
    imageIndex: 0,
    maxIndexFound: 0,
  }));

  // --- STATE VARIABLES ---
  let currentIndex = -1;
  let autoplayInterval = null;

  // --- CORE FUNCTIONS ---

  /**
   * Generates the full image path for a given animal object and specific index.
   */
  function generateImagePath(animal, index) {
    // 0-based index maps to 1-based filename (e.g., 0 -> _1, 1 -> _2)
    const imageNumber = index + 1;
    return `${IMAGE_BASE_PATH}${animal.file}_${imageNumber}.jpg`;
  }

  /**
   * Gets the path for the animal's current image index.
   */
  function getCurrentImagePath(animal) {
    return generateImagePath(animal, animal.imageIndex);
  }

  /**
   * Helper function to test image loading using a Promise.
   */
  function loadImage(path) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onerror = () => reject(path);
      img.onload = () => resolve(path);
      img.src = path;
    });
  }

  /**
   * Calculates the next animal and image index, then preloads the image.
   * This runs in the background to ensure the next image is ready when needed.
   */
  function preloadNextAnimalImage() {
    // 1. Calculate the next animal index (Sequential mode for prediction)
    const nextAnimalIndex = (currentIndex + 1) % animals.length;
    const nextAnimal = animals[nextAnimalIndex];

    // 2. Determine the path for the next image
    let nextImageIndex = nextAnimal.imageIndex;
    // 3. Check if the index we are about to try is greater than the max successful index.
    // If it is, we wrap the preloading index back to 0.
    if (
      nextImageIndex > nextAnimal.maxIndexFound &&
      nextAnimal.maxIndexFound >= 0
    ) {
      nextImageIndex = 0;
    }
    const preloadPath = generateImagePath(nextAnimal, nextImageIndex);

    // 4. Trigger the image load in the background
    const preloader = new Image();
    preloader.src = preloadPath;
    console.log(`Preloading next image: ${preloadPath}`);
  }

  /**
   * Updates the DOM to display the animal and calls the speaker.
   */
  function updateAnimalUI(animal, path) {
    animalImage.src = path;
    animalImage.alt = animal.name;
    animalName.textContent = animal.name;
    animalName.style.opacity = 1;
    setTimeout(speaker, 700);
    utils.hideSettings();
    // Preload the next image
    preloadNextAnimalImage();
  }

  /**
   * Attempts to load the current image index. If it fails, resets the index
   * and loads the first image (index 0).
   */
  async function loadAndDisplayImage(animal) {
    // Hide the current animal name
    animalName.style.opacity = 0;
    loadingSpinner.classList.remove("spinner-hidden");
    let path = getCurrentImagePath(animal);

    try {
      // 1. Try to load the current indexed image (e.g., cat_2.jpg)
      const successfulPath = await loadImage(path);

      // Success: The current index worked. Update max found index.
      animal.maxIndexFound = Math.max(animal.maxIndexFound, animal.imageIndex);

      // Increment the index for the next time this animal comes up
      animal.imageIndex++;
      loadingSpinner.classList.add("spinner-hidden");
      updateAnimalUI(animal, successfulPath);
    } catch (failedPath) {
      // 2. Error: The current indexed image does not exist (e.g., cat_2.jpg failed)
      console.warn(
        `Image not found: ${failedPath}. Resetting cycle for ${animal.name}.`
      );

      // The image at animal.imageIndex failed. Mark this as the maximum index found.
      animal.maxIndexFound = Math.max(0, animal.imageIndex - 1);
      // Reset the index to 0 (for the next image attempt)
      animal.imageIndex = 0;
      // Get the path for the first image (e.g., cat_1.jpg)
      path = getCurrentImagePath(animal);

      try {
        // 3. Try to load the first image (e.g., cat_1.jpg)
        const firstPath = await loadImage(path);

        // Success: Load the first image and set index to 1 for the next pass
        animal.imageIndex++;
        animal.maxIndexFound = Math.max(animal.maxIndexFound, 0); // Max index found is at least 0
        loadingSpinner.classList.add("spinner-hidden");
        updateAnimalUI(animal, firstPath);
      } catch (err) {
        // FATAL Error: Even the first image is missing
        console.error(
          `FATAL: Could not load first image for ${animal.name}: ${path}`,
          err
        );
        loadingSpinner.classList.add("spinner-hidden");
        animalName.textContent = `${animal.name} (Image Missing)`;
        animalName.style.opacity = 1;
        utils.hideSettings();
      }
    }
  }

  /**
   * Displays the next animal and plays its name.
   */
  function showNextAnimal() {
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

    loadAndDisplayImage(animal);
  }

  // --- UI & CONTROL FUNCTIONS ---

  function handleAutoplay() {
    if (autoplayCheckbox.checked) {
      if (autoplayInterval) {
        clearInterval(autoplayInterval);
      }
      showNextAnimal(); // Show one immediately
      autoplayInterval = setInterval(showNextAnimal, AUTOPLAY_INTERVAL);
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
          if (utils.isInteractiveElement(target)) {
            return;
          }
          event.preventDefault();
          showNextAnimal();
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

    document.addEventListener("keydown", handleKeydown);
  }

  function updateSettingsMenu() {
    // =========================
    // Settings Menu
    // =========================
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

    if (ttsInstance.isSpeechReady()) {
      utils.enableMuteBtn();
      speaker();
    } else {
      utils.disableMuteBtn();
    }
  }

  init();
});
