import * as utils from "../static/utils.js";

// --- DOM Element References ---
const display = document.getElementById("display-area");
const btn = document.getElementById("btn-generate");

// List of tasks
const simple = [
  "Jump 3 times",
  "Touch your nose",
  "Clap your hands twice",
  "Spin once",
  "Touch your toes",
  "Wiggle your fingers",
  "Nod your head",
  "Point to the ceiling",
  "Point to the floor",
  "Stick out your tongue",
  "Close your eyes",
  "Don't blink",
  "Pretend to swim",
  "Scratch your head",
  "Stomp your feet",
  "Give a thumbs up",
  "Cover your eyes",
  "Blink 5 times",
  "Moo like a cow",
  "Stand on one foot",
  "Touch your ears",
  "Meow like a cat",
  "Wash your hands",
  "Sit down",
  "Stand up",
  "Touch your knees",
  "Walk in the same place",
  "Point to something blue",
  "Make a circle in the air",
  "Cross your arms",
  "Touch your elbows",
  "Pretend to brush your teeth",
  "Yawn loudly",
  "Smile big",
  "Shake your head 'No'",
  "Shake your head 'Yes'",
  "Tap your chin",
  "Look at the floor",
  "Reach for the stars",
  "Flap your arms like a bird",
  "Give yourself a hug",
  "Touch your eyebrows",
  "Pretend to sleep",
  "Show 3 fingers",
  "Pretend to drink coffee",
  "Roar like a tiger",
  "Make a car sound",
  "Say your shirt color",
  "Freeze like a statue",
  "Tap your head 5 times",
  "Make a fish face",
];

const hard = [
  "Spell your name backwards",
  "Stand on one leg for 10 seconds",
  "Touch left ear with right hand",
  "Say days of the week",
  "Rub tummy and pat head",
  "Name 3 red fruits",
  "Sing a nursery rhyme",
  "Balance a book on your head",
  "Name 4 round things",
  "Count backwards from 10",
  "Sing Happy Birthday",
  "Do a slow-motion run in place",
  "Find something smaller than your hand",
  "Close eyes and touch nose",
  "Spell the word 'APPLE'",
  "List 3 colors in a rainbow",
  "Name 5 body parts",
  "Bark like a dog and then sit",
  "Say 'Hello' in a deep voice",
  "Point to your left and then right",
  "Whisper your favorite color",
  "Hum your favorite song",
  "Say the alphabet to M",
  "Pretend to sneeze but dont sneeze",
  "Count the windows in this room",
  "Walk like a robot",
  "Walk on your tiptoes",
  "Spin 3 times",
  "Touch your back",
  "Pretend to be a monkey",
  "Walk like a very old person",
  "Make the sound of a pressure cooker whistle",
  "Name 3 things that are yellow",
  "Act like you just bit into a chilli",
];

// Shuffle-pool approach: O(1) per pick, no repeats until pool is exhausted
function createShuffledPool(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

let pools = { simple: [], hard: [] };

function getUniqueRandom(arr, type) {
  if (pools[type].length === 0) {
    pools[type] = createShuffledPool(arr);
  }
  return pools[type].pop();
}

// Cooldown to prevent spam clicks
let cooldown = false;

// Trick prefixes — similar sounding to "Simon" to confuse kids
const trickPrefixes = [
  "Simran says: ",
  "Lemon says: ",
  "Sam says: ",
  "Diamond says: ",
];

function playGame() {
  if (cooldown) {
    return;
  }
  cooldown = true;

  btn.classList.add("on-cooldown");
  setTimeout(() => {
    cooldown = false;
    btn.classList.remove("on-cooldown");
  }, 500);

  // 20% chance for a Hard task
  const isHard = Math.random() < 0.2;
  const task = getUniqueRandom(
    isHard ? hard : simple,
    isHard ? "hard" : "simple",
  );

  // The Twist: 25% chance of trick or no prefix
  const twistRoll = Math.random();
  let prefix = "Simon says: ";
  let color = "var(--text-correct)";

  if (twistRoll < 0.15) {
    // Pick a random trick prefix
    prefix = trickPrefixes[Math.floor(Math.random() * trickPrefixes.length)];
    color = "var(--text-warn)";
  } else if (twistRoll < 0.25) {
    prefix = "";
    color = "var(--text-warn)";
  }

  display.innerText = `${prefix}${task}!`;
  display.style.color = color;

  // Animation reset
  display.classList.remove("pop-anim");
  void display.offsetWidth;
  display.classList.add("pop-anim");
}

// =========================
// Click anywhere to play
// =========================
document.addEventListener("click", (e) => {
  if (
    e.target.closest(".btn-generate") ||
    e.target.closest(".fullscreen-btn") ||
    e.target.closest(".help-btn") ||
    e.target.closest(".shortcuts-card")
  ) {
    return;
  }
  btn.click();
});

// =========================
// Keyboard Shortcuts
// =========================
function handleKeydown(event) {
  switch (event.code) {
    case "Space":
    case "Enter":
      utils.hideSidebar();
      event.preventDefault();
      btn.click();
      break;
    case "KeyF":
      utils.hideSidebar();
      event.preventDefault();
      utils.toggleFullscreen();
      break;
    case "Equal":
      event.preventDefault();
      utils.handleSidebar();
      break;
  }
}

utils.setFullscreenIcon();

document.addEventListener("DOMContentLoaded", () => {
  btn.addEventListener("click", playGame);
  document.addEventListener("keydown", handleKeydown);
  utils.updateFullScreenBtn();
});
