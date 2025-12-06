import * as utils from "../static/utils.js";
import { TTS } from "../static/speech_helper.js";

// --- Configuration Constants ---
const IMAGE_BASE_PATH = "../static/images/";
const AUTOPLAY_INTERVAL = 5000;

// --- Speaker Initiation --
const ttsInstance = TTS();
ttsInstance.unlockSpeech();

// --- DOM ELEMENTS ---
const animalImage = document.getElementById("animal-image");
const animalName = document.getElementById("animal-name");
const settingsBtn = document.getElementById("settings-btn");
const settingsIcon = document.getElementById("settings-icon");
const randomizeCheckbox = document.getElementById("randomize");
const autoplayCheckbox = document.getElementById("autoplay");
const loadingSpinner = document.getElementById("loadingSpinner");
let initialLoadComplete = false;

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
    "Goat",
    "Sheep",
    "Cow",
    "Ox",
    "Buffalo",
    "Horse",
    "Donkey",
    "Camel",
    "Sparrow",
    "Crow",
    "Pigeon",
    "Parrot",
    "Chicken",
    "Rooster",
    "Duck",
  ];

  const wildAnimals = [
    "Tiger",
    "Lion",
    "Elephant",
    "Deer",
    "Monkey",
    "Fox",
    "Crocodile",
    "Peacock",
    "Eagle",
    "Vulture",
    "Snake",
    "Bear",
    "Rhinoceros",
    "Mongoose",
  ];

  /**
   * Data Structure: array of animal objects including state.
   * imageIndex tracks the current image (0 for cat_1.jpg, 1 for cat_2.jpg, etc.)
   * maxIndexFound tracks the highest valid index known (initially -1 for unknown)
   */
  const animals = animalNames.map((name) => ({
    name: name,
    file: name.toLowerCase().replace(/ /g, "-"),
    imageIndex: 0,
    maxIndexFound: -1,
  }));

  // --- STATE VARIABLES ---
  let currentIndex = -1;
  let autoplayInterval = null;
  let locked = false;
  const preloadedUrls = new Set();

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
   * Helper: Uses a HEAD request to check if an image exists without downloading the body.
   * Returns true if exists (200 OK), false otherwise.
   */
  async function checkImageExists(url) {
    try {
      const response = await fetch(url, { method: "HEAD" });
      return response.ok;
    } catch (error) {
      // Image doesnt exist or Network error
      return false;
    }
  }

  /**
   * Helper function to fully load an image for display using a Promise.
   * This actually downloads the image data.
   */
  function loadImage(path) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onerror = () => reject(path);
      img.onload = () => {
        // If loaded successfully, add to our preload cache set too
        preloadedUrls.add(path);
        resolve(path);
      };
      img.src = path;
    });
  }

  /**
   * Calculates the next animal and image index, then preloads the image.
   * Uses HEAD requests to verify existence and updates maxIndexFound accordingly.
   */
  async function preloadNextAnimalImage() {
    let nextAnimalIndex;

    // 1. Determine next animal based on mode
    if (utils.getIsRandomEnabled()) {
      // Pick a random animal (different from current if possible)
      do {
        nextAnimalIndex = Math.floor(Math.random() * animals.length);
      } while (nextAnimalIndex === currentIndex && animals.length > 1);
    } else {
      // Sequential neighbor
      nextAnimalIndex = (currentIndex + 1) % animals.length;
    }

    const nextAnimal = animals[nextAnimalIndex];

    // 2. Determine the target index
    let nextImageIndex = nextAnimal.imageIndex;

    // Check against known limits immediately
    if (
      nextAnimal.maxIndexFound > -1 &&
      nextImageIndex > nextAnimal.maxIndexFound
    ) {
      nextImageIndex = 0;
    }

    const preloadPath = generateImagePath(nextAnimal, nextImageIndex);

    // Check if we have already preloaded this specific URL
    if (preloadedUrls.has(preloadPath)) {
      console.log(`Skipping: ${preloadPath} is already cached.`);
      return;
    }

    console.log(
      `Checking existence for preload (${nextAnimal.name}): ${preloadPath}`
    );

    const exists = await checkImageExists(preloadPath);
    if (exists) {
      // Now actually trigger a background download so it's in the browser cache
      const preloader = new Image();
      preloader.src = preloadPath;

      // Mark as cached so we don't check again
      preloadedUrls.add(preloadPath);

      console.log(`Preloading confirmed image: ${preloadPath}`);
    } else {
      // Image does not exist (404). Update the maxIndexFound value.
      console.warn(
        `Limit detected for ${nextAnimal.name} at index ${nextImageIndex}`
      );
      // The valid limit is the previous index
      nextAnimal.maxIndexFound = Math.max(0, nextImageIndex - 1);
    }
  }

  /**
   * Updates the DOM to display the animal and calls the speaker.
   */
  function updateAnimalUI(animal, path) {
    // Add fade-out class to start the transition
    animalImage.classList.add("fade-out");
    animalName.classList.add("fade-out");
    // Wait for the fade-out to complete
    setTimeout(() => {
      animalImage.src = path;
      animalImage.alt = animal.name;
      // Fade back in the image
      animalImage.classList.remove("fade-out");
      // Trigger text change
      animalName.textContent = animal.name;
      animalName.classList.remove("fade-out");
      speaker();
      console.log("Updated text content to: " + animal.name);
      // Unlock the interface
      setTimeout(() => {
        locked = false;
      }, 1000);
    }, 700);

    utils.hideSettings();
    // Start preloading the NEXT one now
    preloadNextAnimalImage();
  }

  /**
   * Attempts to load the current image index. If it fails, resets the index
   * and loads the first image (index 0).
   */
  async function loadAndDisplayImage(animal) {
    // Display spinner in 1 second
    const currentDelay = initialLoadComplete ? 1000 : 0;
    let spinnerTimer = setTimeout(() => {
      loadingSpinner.classList.remove("spinner-hidden");
    }, currentDelay);

    // Get image path of given animal
    let path = getCurrentImagePath(animal);

    try {
      // Try to load the current indexed image
      // Note: If preloadNextAnimalImage ran successfully, this should load from cache instantly.
      const successfulPath = await loadImage(path);

      clearTimeout(spinnerTimer);
      loadingSpinner.classList.add("spinner-hidden");
      if (!initialLoadComplete) {
        initialLoadComplete = true;
      }

      // Success! Prepare index for NEXT time.
      animal.imageIndex++;

      // Check if we just exceeded a KNOWN limit
      if (
        animal.maxIndexFound > -1 &&
        animal.imageIndex > animal.maxIndexFound
      ) {
        animal.imageIndex = 0;
      }

      updateAnimalUI(animal, successfulPath);
    } catch (failedPath) {
      // Error: Current indexed image missing (404)
      console.warn(
        `Image not found during display: ${failedPath}. Resetting cycle for ${animal.name}.`
      );

      // CRITICAL: Update the limit so we don't try this again.
      animal.maxIndexFound = Math.max(0, animal.imageIndex - 1);

      // Reset to 0
      animal.imageIndex = 0;
      path = getCurrentImagePath(animal);

      try {
        // Fallback: Load the first image
        const firstPath = await loadImage(path);
        clearTimeout(spinnerTimer);
        loadingSpinner.classList.add("spinner-hidden");
        if (!initialLoadComplete) {
          initialLoadComplete = true;
        }

        // Prepare for next time (0 is done, next is 1)
        animal.imageIndex = 1;
        updateAnimalUI(animal, firstPath);
      } catch (err) {
        clearTimeout(spinnerTimer);
        loadingSpinner.classList.add("spinner-hidden");

        // FATAL: Even the first image is missing
        console.error(`Skipping ${animal.name}: No images found.`);
        locked = false;
        utils.hideSettings();
        // Call your "next animal"
        showNextAnimal();
      }
    }
  }

  /**
   * Displays the next animal and plays its name.
   */
  function showNextAnimal() {
    // If UI is locked, Do nothing
    if (locked) {
      return;
    }
    locked = true;
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
