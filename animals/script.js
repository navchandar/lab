import * as utils from "../static/utils.js";

document.addEventListener("DOMContentLoaded", () => {
  // --- DATA ---
  // 'image' the path to its picture, and 'sound' the path to its audio file.
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

  const animals = animalNames.map((name) => {
    const file = name.toLowerCase().replace(/ /g, "-");
    return {
      name: name,
      image: `../static/images/${file}.jpg`,
      sound: `../static/sounds/${file}.mp3`,
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

    // Update the UI
    animalImage.src = animal.image;
    animalImage.alt = animal.name;
    animalName.textContent = animal.name;

    playSound(animal.sound);
    hideSettings();
  }

  /**
   * Plays a sound file.
   * @param {string} soundSrc - The path to the audio file.
   */
  function playSound(soundSrc) {
    if (isMuted) {
      return;
    }

    // Stop any currently playing sound
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }

    currentAudio = new Audio(soundSrc);
    currentAudio
      .play()
      .catch((error) => console.error("Audio playback error:", error));
  }

  // --- UI & CONTROL FUNCTIONS ---

  function toggleMute() {
    isMuted = !isMuted;
    localStorage.setItem("isMuted", isMuted);
    utils.updateMuteBtn();
    if (isMuted && currentAudio) {
      currentAudio.pause();
    }
  }

  function handleAutoplay() {
    if (autoplayCheckbox.checked) {
      if (autoplayInterval) clearInterval(autoplayInterval);
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
    muteButton.addEventListener("click", toggleMute);
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
          toggleMute();
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
    randomizeCheckbox.checked = localStorage.getItem("isRandom") === "true";
    randomizeCheckbox.addEventListener("change", () => {
      localStorage.setItem("isRandom", randomizeCheckbox.checked);
    });

    utils.updateMuteBtn();
    utils.updateFullScreenBtn();
    setupEventListeners();
    // Load the first animal on page load
    showNextAnimal();
  }

  init();
});
