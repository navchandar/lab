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
const spellWordsCheckbox = document.getElementById("spell-words-toggle");
const quizCheckbox = document.getElementById("quiz-words");
let isQuizMode = false;
let quizSegments = [];
let expectedSegmentIndex = 0;
let wrongTaps = 0;
let isQuizAnimating = false;
let isQuizComplete = false;

// --- Application State & Configuration ---
// Read language from URL, default to English
const urlParams = new URLSearchParams(window.location.search);
const lang = urlParams.get("lang")?.toLowerCase() || "english";
const languageData = window.wordsData[lang] || window.wordsData.english;

const WordList = languageData.words;
const Locale = languageData.locale;

let currentColor = null;
let previousColor = null;
let currentIndex = -1;
let previousWord = null;
let history = [];
let locked = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  // If pool is empty, refill and shuffle it
  if (history.length === 0) {
    history = shuffleArray([...WordList]);

    // Prevent the last word of the previous cycle
    // from being the first word of the new cycle
    if (history.length > 1 && history[history.length - 1] === previousWord) {
      const last = history.pop();
      history.unshift(last);
    }
  }

  const nextWord = history.pop();
  previousWord = nextWord;
  return nextWord;
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
    history = []; // Clear the pool when switching to sequential
    previousWord = null;
  }

  if (isQuizMode) {
    // Let the quiz handle the DOM injection
    initQuizWord(wordToDisplay);
  } else {
    // normal display logic
    wordElement.innerHTML = "";
    // Intl.Segmenter ensures combo letters like "கௌ" stays as one unit
    const segmenter = new Intl.Segmenter(Locale, { granularity: "grapheme" });
    const segments = segmenter.segment(wordToDisplay);

    for (const { segment } of segments) {
      const span = document.createElement("span");
      span.textContent = segment;
      span.className = "letter";
      wordElement.appendChild(span);
    }
    wordElement.style.color = currentColor;
    setTimeout(() => {
      speaker();
    }, 700); // Gives time for the color transition before speaking
  }
}

function incrementWord() {
  utils.hideSettings();
  if (locked) {
    console.warn("Text is locked!");
    return;
  }
  // Block skipping if quiz is active and NOT finished.
  // Instead, show a hint to guide the user.
  if (isQuizMode && !isQuizComplete) {
    showHint();
    return;
  }

  locked = true;
  ttsInstance.cancel();
  setTimeout(updateWord, 100);
  utils.hideSettings();
}

// Helper to shuffle an array, ensuring it never matches the original
function shuffleArray(array) {
  if (array.length <= 1) {
    return [...array];
  }

  // Safety check: Prevent infinite loop if all letters are identical (e.g., "OO")
  const allSame = array.every((val) => val === array[0]);
  if (allSame) {
    return [...array];
  }

  let shuffled;
  let isIdentical = true;

  while (isIdentical) {
    shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // Check if the shuffled array matches the original
    isIdentical = array.every((val, index) => val === shuffled[index]);
  }

  return shuffled;
}

// --- Core Quiz Logic ---
function initQuizWord(word) {
  wordElement.innerHTML = "";
  quizSegments = Array.from(
    new Intl.Segmenter(Locale, { granularity: "grapheme" }).segment(word),
  ).map((s) => s.segment);
  expectedSegmentIndex = 0;
  isQuizComplete = false;
  isQuizAnimating = false;
  locked = false;

  const quizContainer = document.createElement("div");
  quizContainer.className = "quiz-container";

  const jumbledContainer = document.createElement("div");
  jumbledContainer.className = "jumbled-row";

  const mouldContainer = document.createElement("div");
  mouldContainer.className = "mould-row";

  // Create Moulds
  quizSegments.forEach((segment, index) => {
    const mouldSpan = document.createElement("span");
    mouldSpan.textContent = segment;
    mouldSpan.className = "mould-letter unfulfilled";
    mouldSpan.dataset.index = index;
    mouldContainer.appendChild(mouldSpan);
  });

  // Create Jumbled Letters
  const shuffledSegments = shuffleArray(quizSegments);
  shuffledSegments.forEach((segment) => {
    const jSpan = document.createElement("span");
    jSpan.textContent = segment;
    jSpan.className = "jumbled-letter";

    const interactionHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleJumbledClick(e, jSpan, segment);
    };

    jSpan.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleJumbledClick(e, jSpan, segment);
    });
    jumbledContainer.appendChild(jSpan);
  });

  quizContainer.appendChild(jumbledContainer);
  quizContainer.appendChild(mouldContainer);
  wordElement.appendChild(quizContainer);

  updateClickableLetters();
}

function updateClickableLetters() {
  const jumbledLetters = wordElement.querySelectorAll(
    ".jumbled-letter:not(.hidden)",
  );
  const expectedLetter = quizSegments[expectedSegmentIndex];
  const clickableAdded = false;
  jumbledLetters.forEach((span) => {
    span.classList.remove("hint-glow"); // Clear previous hints
    if (!clickableAdded && span.textContent === expectedLetter) {
      span.classList.add("clickable");
      clickableAdded = true;
    } else {
      span.classList.remove("clickable");
    }
  });
}

function showHint() {
  const expectedLetter = quizSegments[expectedSegmentIndex];
  const jumbledLetters = wordElement.querySelectorAll(
    ".jumbled-letter:not(.hidden)",
  );
  for (let span of jumbledLetters) {
    if (span.textContent === expectedLetter) {
      span.classList.add("hint-glow");
      break; // Only highlight one if there are duplicates
    }
  }
}

function setQuizMode(on) {
  isQuizMode = on;
  document.body.classList.toggle("quiz-mode", on);
}
function markWrongTap(jumbledNode) {
  wrongTaps++;
  jumbledNode.classList.remove("hint-glow");
  jumbledNode.classList.add("wrong");
  setTimeout(() => jumbledNode.classList.remove("wrong"), 500);

  if (wrongTaps >= 2) {
    showHint();
    wrongTaps = 0;
  }
}

function markTileAsUsed(jumbledNode) {
  jumbledNode.classList.add("hidden");
  // jumbledNode.style.display = "none";
}

function fulfillMould(targetMould) {
  targetMould.classList.remove("unfulfilled");
  targetMould.classList.add("fulfilled");
  targetMould.style.color = currentColor;
}

function speak(text, { rate, locale }, timeoutMs = 1500) {
  if (utils.isMuted()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    if (!utils.isMuted()) {
      ttsInstance.speakElement(text, {
        directSpeech: true,
        rate,
        locale,
        onEnd: resolve,
      });
    }
    setTimeout(resolve, timeoutMs); // safety fallback
  });
}

async function handleQuizFinished() {
  isQuizComplete = true;
  const fullWord = quizSegments.join("");

  // Wait exactly 0.5s before speaking full word
  await sleep(500);

  if (!utils.isMuted()) {
    ttsInstance.speakElement(fullWord, {
      directSpeech: true,
      rate: 0.7,
      locale: Locale,
    });
  }

  locked = false;
}

async function handleJumbledClick(event, jumbledNode, segment) {
  if (isQuizAnimating || isQuizComplete) {
    return;
  }

  const expected = quizSegments[expectedSegmentIndex];
  if (segment !== expected) {
    markWrongTap(jumbledNode);
    return;
  }

  wrongTaps = 0;
  isQuizAnimating = true;
  jumbledNode.classList.remove("hint-glow", "wrong");

  const targetMould = document.querySelector(
    `.mould-letter[data-index="${expectedSegmentIndex}"]`,
  );

  try {
    // Animate flying text
    const flyPromise = animateTileFlyToTarget(jumbledNode, targetMould);
    jumbledNode.style.visibility = "hidden"; // reserve space, hide real tile
    await flyPromise;

    // Commit UI state
    markTileAsUsed(jumbledNode);
    fulfillMould(targetMould);

    // Advance state & enable next clickable immediately
    expectedSegmentIndex++;
    const isDone = expectedSegmentIndex >= quizSegments.length;

    if (!isDone) {
      updateClickableLetters();
      // Speak letter (does not block next click because isQuizAnimating resets in finally)
      await speak(segment, { rate: 0.75, locale: Locale });
      return;
    }

    // Completed: speak last segment then whole word
    await speak(segment, { rate: 0.75, locale: Locale });
    await handleQuizFinished();
  } finally {
    // Always release animation lock even if something errors
    isQuizAnimating = false;
  }
}

function animateTileFlyToTarget(sourceNode, targetNode) {
  const reduceMotion = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  )?.matches;

  // If reduced motion, skip fancy animation
  if (reduceMotion) {
    return Promise.resolve();
  }

  const first = sourceNode.getBoundingClientRect();
  const last = targetNode.getBoundingClientRect();
  const deltaX = last.left - first.left;
  const deltaY = last.top - first.top;

  // Create a "ghost" clone to animate (keeps original layout stable)
  const ghost = sourceNode.cloneNode(true);
  ghost.style.visibility = "visible";
  ghost.style.opacity = "1";
  ghost.classList.remove("hidden");
  ghost.classList.add("tile-ghost");

  Object.assign(ghost.style, {
    position: "fixed",
    left: `${first.left}px`,
    top: `${first.top}px`,
    width: `${first.width}px`,
    height: `${first.height}px`,
    margin: "0",
    zIndex: 1000,
    pointerEvents: "none",
    transform: "translate3d(0,0,0) scale(1)",
    willChange: "transform, filter, opacity",
  });
  document.body.appendChild(ghost);

  // Arc lift
  const lift = Math.min(36, Math.max(18, Math.abs(deltaY) * 0.15));

  const fly = ghost.animate(
    [
      {
        transform: "translate3d(0,0,0) scale(1)",
        filter: "drop-shadow(0 10px 14px rgba(0,0,0,0.25))",
        offset: 0,
      },
      {
        // arc midpoint: move partway + lift up a bit + slight grow
        transform: `translate3d(${deltaX * 0.6}px, ${deltaY * 0.6 - lift}px, 0) scale(1.08)`,
        filter: "drop-shadow(0 18px 18px rgba(0,0,0,0.30))",
        offset: 0.55,
      },
      {
        // overshoot past the target a touch (gives "snap-in" feel)
        transform: `translate3d(${deltaX}px, ${deltaY + 8}px, 0) scale(0.96)`,
        filter: "drop-shadow(0 8px 10px rgba(0,0,0,0.22))",
        offset: 0.88,
      },
      {
        // settle into place
        transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(1)`,
        filter: "drop-shadow(0 6px 8px rgba(0,0,0,0.18))",
        offset: 1,
      },
    ],
    {
      duration: 520,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)", // easeOutCubic-like
    },
  );

  const pop = targetNode.animate(
    [
      { transform: "scale(1)", boxShadow: "none", offset: 0 },
      {
        transform: "scale(1.12)",
        boxShadow: "0 10px 18px rgba(0,0,0,0.25)",
        offset: 0.6,
      },
      { transform: "scale(1)", boxShadow: "none", offset: 1 },
    ],
    { duration: 220, easing: "cubic-bezier(0.2, 0.9, 0.2, 1)" },
  );

  return Promise.allSettled([fly.finished, pop.finished]).then(() => {
    ghost.remove();
  });
}

// =========================================================================
// SPEECH SYNTHESIS
// =========================================================================
async function speaker() {
  const spellEnabled = spellWordsCheckbox ? spellWordsCheckbox.checked : false;
  const spans = wordElement.querySelectorAll(".letter");
  const fullWord = wordElement.textContent;

  // If muted: do NOT block skipping
  if (utils.isMuted() && !spellEnabled) {
    locked = false;
    return;
  }
  // If unmuted: lock until we’re fully done
  locked = true;

  if (spellEnabled) {
    // Spell the word letter by letter (or grapheme by grapheme)
    for (let i = 0; i < spans.length; i++) {
      const char = spans[i].textContent;
      spans[i].classList.add("active");

      // We always create a promise so the "timing" exists even when silent
      await new Promise((resolve) => {
        if (!utils.isMuted()) {
          ttsInstance.speakElement(char, {
            directSpeech: true,
            chunk: false,
            rate: 0.75,
            locale: Locale,
            onEnd: resolve,
          });
          // Safety timeout for TTS
          setTimeout(resolve, 2000);
        } else {
          // If muted, just wait 1000ms to simulate the "speaking" highlight
          setTimeout(resolve, 1000);
        }
      });

      spans[i].classList.remove("active");
      await sleep(200);
    }
    // Tiny pause before the final word delivery
    await sleep(300);
  }

  // Speak the full word everytime (unless muted or word length is one)
  if (spans && spans.length > 1) {
    if (!utils.isMuted()) {
      ttsInstance.speakElement(fullWord, {
        directSpeech: true,
        rate: 0.7, // Clear pronunciation
        locale: Locale,
        onEnd: () => {
          locked = false;
        },
      });
    } else {
      locked = false;
    }
  } else {
    // If it's a single letter or not found, unlock immediately
    locked = false;
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
// wordElement.textContent = WordList[0];

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

function updateSettingsMenu() {
  // =========================
  // Settings Menu
  // =========================

  utils.addListeners(settingsBtn, utils.onClickSettings);
  utils.addListeners(settingsIcon, utils.onClickSettings);

  randomizeCheckbox.addEventListener("change", (e) => {
    e.stopPropagation();
    utils.setIsRandom(randomizeCheckbox.checked);
  });

  spellWordsCheckbox.addEventListener("change", (e) => {
    e.stopPropagation();
    if (spellWordsCheckbox.checked) {
      speaker();
    }
  });

  if (quizCheckbox) {
    quizCheckbox.addEventListener("change", (e) => {
      e.stopPropagation();
      locked = false; // Reset lock when switching modes
      setQuizMode(quizCheckbox.checked);
      // Step back so the current word is rebuilt in the new mode
      currentIndex = Math.max(0, currentIndex - 1);
      updateWord();
    });
  }
}

function handleKeydown(event) {
  const target = event.target;
  utils.hideSidebar();

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
      break;
    case "Equal":
      event.preventDefault();
      utils.handleSidebar();
      break;
  }
}

utils.setFullscreenIcon();

document.addEventListener("DOMContentLoaded", () => {
  settingsBtn.style.display = "block";

  document.addEventListener("keydown", handleKeydown);
  utils.updateMuteBtn();
  utils.updateFullScreenBtn();
  utils.bodyAction(incrementWord);
  updateWord();

  if (ttsInstance.isSpeechReady()) {
    utils.enableMuteBtn();
  } else {
    utils.disableMuteBtn();
  }

  updateSettingsMenu();
  utils.addglobalHideSettings();
});
