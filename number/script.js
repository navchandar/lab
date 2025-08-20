// =========================
// Initialization
// =========================
let number = 1;
let currentColor = null;
let previousColor = null;

const numberElement = document.getElementById("number");
const muteButton = document.getElementById("muteButton");
const fullscreenbtn = document.getElementById("fullscreen-btn");
const fullscreenIcon = document.getElementById("fullscreen-icon");
const settings_Menu = document.getElementById("settings-menu");
let intervalID = null;

const synth = window.speechSynthesis;
let Locale = null;
let utterance = null;
let isMuted = localStorage.getItem("isMuted") === "true";
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

// Set initial mute button icon based on the loaded state
muteButton.textContent = isMuted ? "🔇" : "🔊";
// Initial mute button state
muteButton.disabled = true;
muteButton.title = "Setting up Speech Synthesis...";

function updateSpeakerOptions() {
  isMuted = localStorage.getItem("isMuted") === "true";
  // Set initial mute button icon based on the loaded state
  muteButton.textContent = isMuted ? "🔇" : "🔊";
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
function getNewColor() {
  let newColor;
  do {
    newColor = colors[Math.floor(Math.random() * colors.length)];
  } while (newColor === currentColor || newColor === previousColor);
  return newColor;
}

function speaker() {
  muteButton.title = isMuted ? "Unmute button" : "Mute Button";
  if (utterance && !isMuted) {
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

function toggleMute() {
  isMuted = !isMuted;
  localStorage.setItem("isMuted", isMuted);
  muteButton.textContent = isMuted ? "🔇" : "🔊";
  if (isMuted && synth.speaking) {
    synth.cancel();
  }
  if (!isMuted) {
    speaker();
  }
  muteButton.title = isMuted ? "Unmute button" : "Mute Button";
  settings_Menu.classList.remove("show");
}

function incrementNumber() {
  // Determine which mode to use (random or sequential)
  const isRandomEnabled = getIsRandomEnabled();

  setTimeout(() => {
    if (isRandomEnabled) {
      const randomValue = Math.floor(Math.random() * 100) + 1;
      numberElement.textContent = randomValue;
    } else {
      number++;
      numberElement.textContent = number;
    }
    previousColor = currentColor;
    currentColor = getNewColor();
    numberElement.style.color = currentColor;
    speaker();
  }, 200);

  settings_Menu.classList.remove("show");
}

// Function to get the randomize state from localStorage
function getIsRandomEnabled() {
  return localStorage.getItem("randomize") === "true";
}

// Function to set the randomize state in localStorage
function setIsRandom(value) {
  localStorage.setItem("randomize", value);
  console.log("Randomize set to:", getIsRandomEnabled());
  if (!value && number !== 1) {
    number = 0;
  }
}

function autoplay() {
  if (intervalID) {
    clearInterval(intervalID);
  }
  intervalID = setInterval(() => {
    incrementNumber();
  }, 5000);
}

function updateSettingsMenu() {
  // =========================
  // Settings Menu
  // =========================
  const settingsBtn = document.getElementById("settings-btn");
  const settingsMenu = document.getElementById("settings-menu");
  const randomizeCheckbox = document.getElementById("randomize");
  const autoplayCheckbox = document.getElementById("autoplay");

  function addUnifiedListeners(
    element,
    handlers,
    options = { passive: false }
  ) {
    if (handlers.click) {
      element.addEventListener("click", handlers.click);
    }
    if (handlers.touchstart) {
      element.addEventListener("touchstart", handlers.touchstart, options);
    }
    if (handlers.change) {
      element.addEventListener("change", handlers.change);
    }
  }

  // Toggle menu visibility
  addUnifiedListeners(settingsBtn, {
    click: (e) => {
      e.stopPropagation();
      settingsMenu.classList.toggle("show");
    },
    touchstart: (e) => {
      e.preventDefault();
      e.stopPropagation();
      settingsMenu.classList.toggle("show");
    },
  });

  // Show settings button after DOM is ready
  window.addEventListener("DOMContentLoaded", () => {
    settingsBtn.style.display = "block";
  });

  addUnifiedListeners(randomizeCheckbox, {
    click: (e) => {
      setIsRandom(randomizeCheckbox.checked);
      e.stopPropagation();
    },
    change: (e) => {
      setIsRandom(randomizeCheckbox.checked);
      e.stopPropagation();
    },
    touchstart: (e) => {
      setIsRandom(randomizeCheckbox.checked);
      e.preventDefault();
      e.stopPropagation();
    },
  });

  setIsRandom(randomizeCheckbox.checked);

  function handleAutoplayToggle() {
    if (autoplayCheckbox.checked) {
      autoplay();
    } else {
      clearInterval(intervalID);
      incrementNumber();
    }
  }

  addUnifiedListeners(autoplayCheckbox, {
    click: (e) => {
      handleAutoplayToggle();
      e.stopPropagation();
    },
    change: (e) => {
      handleAutoplayToggle();
      e.stopPropagation();
    },
    touchstart: (e) => {
      handleAutoplayToggle();
      e.preventDefault();
      e.stopPropagation();
    },
  });
}

function setEnterFullscreenIcon() {
  fullscreenIcon.innerHTML = `
            <path d="M9 21H3L3 15" stroke="lightgray" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
            <path d="M21 15V21H15" stroke="lightgray" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
            <path d="M15 3H21V9" stroke="lightgray" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
            <path d="M3 9V3H9" stroke="lightgray" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />`;
}

function setExitFullscreenIcon() {
  fullscreenIcon.innerHTML = `
            <path d="M3 15H9V21" stroke="lightgray" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
            <path d="M15 21V15H21" stroke="lightgray" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
            <path d="M21 9H15V3" stroke="lightgray" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
            <path d="M9 3V9H3" stroke="lightgray" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>`;
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      console.log(
        `Error attempting to enable full-screen mode: ${err.message}`
      );
    });
  } else {
    document.exitFullscreen();
  }
  settings_Menu.classList.remove("show");
}

function isInteractiveElement(target) {
  const selectors = [
    "a",
    "button",
    "svg",
    "path",
    "input",
    "label",
    "select",
    "textarea",
    "#settings-menu",
    ".allow-click",
  ];
  return target.closest(selectors.join(","));
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
      if (isInteractiveElement(target)) {
        return;
      }
      event.preventDefault();
      incrementNumber();
      break;
    case "KeyM":
      event.preventDefault();
      toggleMute();
      break;
    case "KeyF":
      event.preventDefault();
      toggleFullscreen();
      break;
    case "KeyS":
      event.preventDefault();
      settings_Menu.classList.toggle("show");
      break;
    case "Escape":
      settings_Menu.classList.remove("show");
      break;
  }
}

function addButtonListeners(button, handler) {
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    handler();
  });

  button.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      handler();
    },
    { passive: false }
  );
}

document.fullscreenElement ? setExitFullscreenIcon() : setEnterFullscreenIcon();

document.addEventListener("DOMContentLoaded", () => {
  updateSpeakerOptions();
  speaker();
  updateSettingsMenu();

  document.addEventListener("keydown", handleKeydown);

  addButtonListeners(muteButton, toggleMute);
  addButtonListeners(fullscreenbtn, toggleFullscreen);

  document.body.addEventListener("click", (e) => {
    console.log("Clicked on:", e.target);
    if (!isInteractiveElement(e.target)) {
      incrementNumber();
    }
  });

  document.body.addEventListener(
    "touchstart",
    (e) => {
      console.log("Clicked on:", e.target);
      if (!isInteractiveElement(e.target)) {
        e.preventDefault();
        incrementNumber();
      }
    },
    { passive: false }
  );

  document.addEventListener("fullscreenchange", () => {
    const isFullscreen = !!document.fullscreenElement;
    fullscreenbtn.classList.toggle("fullscreen-active", isFullscreen);
    isFullscreen ? setExitFullscreenIcon() : setEnterFullscreenIcon();
  });
});
