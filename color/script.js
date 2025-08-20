let currentIndex = 0;

const urlParam = new URLSearchParams(window.location.search);
let currentLang = urlParam.get("lang") || "english";

// Create a 1x1 pixel canvas to do the color conversion
const canvas = document.createElement("canvas");
canvas.width = 1;
canvas.height = 1;
const ctx = canvas.getContext("2d");

const colorNameEl = document.getElementById("color-name");
const settings_Menu = document.getElementById("settings-menu");
const fullscreenbtn = document.getElementById("fullscreen-btn");
const fullscreenIcon = document.getElementById("fullscreen-icon");
const muteButton = document.getElementById("muteButton");
let intervalID = null;

const synth = window.speechSynthesis;
let Locale = null;
let utterance = null;
let isMuted = localStorage.getItem("isMuted") === "true";
let retryCount = 0;
const maxRetries = 10;

function getBrightness(color) {
  try {
    // Draw a 1x1 pixel rectangle to apply the color
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    // Get the color data for that single pixel in an array [R, G, B, Alpha].
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    // Formula to calculate a weighted average of the three primary colors
    // Baed on ITU-R BT.601 standard
    return (r * 299 + g * 587 + b * 114) / 1000;
  } catch (e) {
    // Assume bright background as fallback
    console.error(`Invalid color: ${color}`, e);
    return 255;
  }
}

function getTextStyleForBrightness(color) {
  const brightness = getBrightness(color);
  const isDark = brightness < 128;
  return {
    textColor: isDark ? "white" : "black",
    textShadow: `
            5px 5px 5px ${
              isDark ? "rgba(0, 0, 0, 0.4)" : "rgba(255, 255, 255, 0.4)"
            },
           -2px -2px 5px ${
             isDark ? "rgba(255, 255, 255, 0.4)" : "rgba(0, 0, 0, 0.4)"
           }
        `,
  };
}

function changeBodyColor(color) {
  // update color with importance to work on devices with Dark viewer
  document.body.style.setProperty("background-color", color, "important");
  // Update theme color on supported mobile devices
  const metaTag = document.getElementById("theme-color");
  if (metaTag) {
    metaTag.setAttribute("content", color);
  }
  console.log("Updated background color to: " + color);
}

function changeTextColor(color, label) {
  const { textColor, textShadow } = getTextStyleForBrightness(color);

  colorNameEl.style.color = textColor;
  colorNameEl.style.textShadow = textShadow;
  colorNameEl.textContent = label;
  console.log("Updated text content to: " + label);
  console.log("Updated text color to: " + textColor);
  speaker();
}

const lastColors = [];
function getRandomColorExcludingLast(colorsArray) {
  const availableColors = colorsArray.filter(
    (c) => !lastColors.includes(c.color)
  );
  if (availableColors.length === 0) {
    // If all colors are in the lastColors list, reset the history
    lastColors.length = 0;
    return getRandomColorExcludingLast(colorsArray);
  }
  const randomIndex = Math.floor(Math.random() * availableColors.length);
  return availableColors[randomIndex];
}

function updateColor() {
  // Get color data and label values
  const colorData =
    window.colors && window.colors[currentLang]
      ? window.colors[currentLang]
      : (console.error(`Color data for "${currentLang}" not found`), {});

  if (colorData) {
    Locale = colorData.locale;
    // Determine which mode to use (random or sequential)
    const isRandomEnabled = getIsRandomEnabled();
    let selectedColorData;
    if (isRandomEnabled) {
      selectedColorData = getRandomColorExcludingLast(colorData.names);
    } else {
      selectedColorData = colorData.names[currentIndex];
      currentIndex = (currentIndex + 1) % colorData.names.length;
    }
    const color = selectedColorData.color;
    const label = selectedColorData.label;

    changeBodyColor(color);
    changeTextColor(color, label);

    // Update lastColors history
    if (isRandomEnabled) {
      lastColors.push(color);
      // Keep only the last 3
      if (lastColors.length > 3) {
        lastColors.shift();
      }
    }
  }
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
}

function autoplay() {
  if (intervalID) {
    clearInterval(intervalID);
  }
  intervalID = setInterval(() => {
    updateColor();
  }, 5000);
}

function updateSettingsMenu() {
  // =========================
  // Settings Menu
  // =========================
  const settingsBtn = document.getElementById("settings-btn");
  const settingsMenu = document.getElementById("settings-menu");
  const languageSelect = document.getElementById("language-select");
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

  function toTitleCase(str) {
    return str
      .toLocaleLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  // Populate dropdown
  Object.keys(window.colors).forEach((lang) => {
    const option = document.createElement("option");
    option.value = lang;
    option.textContent = toTitleCase(lang);
    languageSelect.appendChild(option);
  });

  // Detect current language from URL
  languageSelect.value = currentLang;

  // Redirect on language change
  languageSelect.addEventListener("change", (e) => {
    e.stopPropagation();
    const selectedLang = e.target.value;
    window.location.href = `https://navchandar.github.io/lab/color/?lang=${selectedLang}`;
  });

  languageSelect.addEventListener(
    "touchstart",
    (e) => {
      e.stopPropagation();
    },
    { passive: false }
  );

  languageSelect.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  document.getElementById("language-label").addEventListener(
    "touchstart",
    (e) => {
      e.stopPropagation();
    },
    { passive: false }
  );

  document.getElementById("language-label").addEventListener("click", (e) => {
    e.stopPropagation();
  });

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
      updateColor();
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

function updateSpeakerOptions() {
  isMuted = localStorage.getItem("isMuted") === "true";
  // Set initial mute button icon based on the loaded state
  muteButton.textContent = isMuted ? "🔇" : "🔊";
  // Initial mute button state
  muteButton.disabled = true;
  muteButton.title = "Setting up Speech Synthesis...";

  Locale = window.colors[currentLang].locale;
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

function speaker() {
  muteButton.title = isMuted ? "Unmute button" : "Mute Button";
  if (utterance && !isMuted) {
    if (synth.speaking) synth.cancel();
    utterance.text = colorNameEl.textContent.toLowerCase();
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
  if (isMuted && synth.speaking) synth.cancel();
  if (!isMuted) speaker();
  muteButton.title = isMuted ? "Unmute button" : "Mute Button";
  settings_Menu.classList.remove("show");
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
      if (isInteractiveElement(target)) return;
      event.preventDefault();
      updateColor();
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
  updateColor();
  updateSettingsMenu();

  document.addEventListener("keydown", handleKeydown);

  addButtonListeners(muteButton, toggleMute);
  addButtonListeners(fullscreenbtn, toggleFullscreen);

  document.body.addEventListener("click", (e) => {
    console.log("Clicked on:", e.target);
    if (!isInteractiveElement(e.target)) {
      updateColor();
    }
  });

  document.body.addEventListener(
    "touchstart",
    (e) => {
      console.log("Clicked on:", e.target);
      if (!isInteractiveElement(e.target)) {
        e.preventDefault();
        updateColor();
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
