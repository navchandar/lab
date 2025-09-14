// DOM Elements
const hourHand = document.getElementById("hourHand");
const minuteHand = document.getElementById("minuteHand");
const timeInput = document.getElementById("timeInput");
const clock = document.getElementById("analog");

// State
let current = { hours: 0, minutes: 0 };
let isDragging = false;
let dragHand = null;
let lastAngle = null;
let totalAngle = 0;
let selectedHand = null;
let previousMinutes = null;

/**
 * Update the info icon text to display on click/touch
 */
function updateInfoIcon() {
  document.addEventListener("DOMContentLoaded", () => {
    const infoIcons = document.querySelectorAll(".info-icon");

    infoIcons.forEach((icon) => {
      icon.addEventListener("click", (e) => {
        e.stopPropagation();
        // Close other tooltips
        infoIcons.forEach((i) => i.classList.remove("active"));
        // Toggle current tooltip
        icon.classList.toggle("active");
      });
    });

    // Close tooltip on outside click
    document.addEventListener("click", (e) => {
      infoIcons.forEach((icon) => icon.classList.remove("active"));
      if (!clock.contains(e.target)) {
        selectedHand = null;
      }
    });

    // Close tooltip on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        infoIcons.forEach((icon) => icon.classList.remove("active"));
      }
    });
  });
}

/**
 * Converts degrees to radians
 */
function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Creates and positions a clock number (1–12)
 */
function createClockNumber(i) {
  const angle = i * 30 - 90; // 30° per hour, offset to start at top
  const radius = 120;
  const x = 140 + radius * Math.cos(degToRad(angle));
  const y = 140 + radius * Math.sin(degToRad(angle));

  const num = document.createElement("div");
  num.className = "number";
  num.style.left = `${x}px`;
  num.style.top = `${y}px`;
  num.textContent = i;
  clock.appendChild(num);
}

/**
 * Inserts all clock numbers
 */
function insertNumbers() {
  for (let i = 1; i <= 12; i++) {
    createClockNumber(i);
  }
}

/**
 * Inserts tick marks every 5 minutes
 */
function insertTicks() {
  for (let i = 0; i < 60; i += 5) {
    const tick = document.createElement("div");
    tick.className = "tick";
    tick.dataset.index = i / 5;
    tick.style.transform = `rotate(${i * 6}deg)`;
    clock.appendChild(tick);
  }
}

function updateClockHands() {
  hourHand.addEventListener("click", () => (selectedHand = "hour"));
  minuteHand.addEventListener("click", () => (selectedHand = "minute"));

  document.querySelectorAll(".number").forEach((num) => {
    num.addEventListener("click", () => {
      const value = parseInt(num.textContent);
      if (selectedHand === "hour") {
        current.hours = value % 12;
      } else if (selectedHand === "minute") {
        current.minutes = value * 5;
      }
      updateClockDisplay();
    });
  });

  document.querySelectorAll(".tick").forEach((tick, i) => {
    tick.addEventListener("click", () => {
      if (selectedHand === "minute") {
        current.minutes = i * 5;
      } else if (selectedHand === "hour") {
        current.hours = i % 12;
      }
      updateClockDisplay();
    });
  });
}

/**
 * Initializes the clock
 */
function initClock() {
  insertNumbers();
  insertTicks();
  setCurrentTime(new Date());
  updateClockDisplay();
  enableDrag(hourHand);
  enableDrag(minuteHand);
  timeInput.addEventListener("change", onDigitalChange);
  updateInfoIcon();
  updateClockHands();
}

/**
 * Sets the current time from a Date object
 */
function setCurrentTime(date) {
  current.hours = date.getHours();
  current.minutes = date.getMinutes();
}

/**
 * Updates both analog and digital displays
 */
function updateClockDisplay() {
  // Normalize time values
  current.minutes = ((current.minutes % 60) + 60) % 60;
  current.hours = ((current.hours % 24) + 24) % 24;

  // Calculate angles
  const h12 = current.hours % 12;
  const hourAngle = h12 * 30 + current.minutes * 0.5;
  const minuteAngle = current.minutes * 6;

  // Update analog hands
  hourHand.style.transform = `translate(-50%, -90%) rotate(${hourAngle}deg)`;
  minuteHand.style.transform = `translate(-50%, -90%) rotate(${minuteAngle}deg)`;

  // Update digital input
  const hh = String(current.hours).padStart(2, "0");
  const mm = String(current.minutes).padStart(2, "0");
  timeInput.value = `${hh}:${mm}`;
  console.log(timeInput.value);
}

/**
 * Handles digital input change
 */
function onDigitalChange(e) {
  const value = e.target.value.trim();
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(value);

  // Invalid format
  if (!match) {
    console.warn(`Invalid value: ${value}`);
    return;
  }

  let [_, h, m] = match.map(Number);

  if (isNaN(h) || isNaN(m)) {
    return;
  }

  if (h === 24 && m === 0) {
    h = 0;
  }

  if (h < 0 || h > 23 || m < 0 || m > 59) {
    return;
  }

  current.hours = h;
  current.minutes = m;
  updateClockDisplay();
}

/**
 * Enables dragging for a clock hand
 */
function enableDrag(hand) {
  hand.addEventListener("pointerdown", (e) => {
    isDragging = true;
    dragHand = hand.dataset.hand;
    lastAngle = null;
    totalAngle = 0;
    previousMinutes = null;
    hand.setPointerCapture(e.pointerId);
    document.addEventListener("pointermove", onDrag);
    document.addEventListener("pointerup", endDrag);
  });
}

/**
 * Handles dragging movement
 */
function onDrag(e) {
  if (!isDragging) {
    return;
  }

  const rect = clock.getBoundingClientRect();
  const cX = rect.left + rect.width / 2;
  const cY = rect.top + rect.height / 2;
  const dx = e.clientX - cX;
  const dy = e.clientY - cY;

  let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
  if (angle < 0) {
    angle += 360;
  }

  // Prevent jumpiness when crossing 0°/360°

  if (lastAngle !== null) {
    let delta = angle - lastAngle;
    if (delta > 180) {
      delta -= 360;
    }
    if (delta < -180) {
      delta += 360;
    }
    totalAngle += delta;
  }

  lastAngle = angle;

  if (dragHand === "minute") {
    const newMinutes = Math.round(angle / 6) % 60;

    if (previousMinutes !== null) {
      const diff = newMinutes - previousMinutes;
      if (diff > 30) {
        current.hours = (current.hours - 1 + 24) % 24;
      } else if (diff < -30) {
        current.hours = (current.hours + 1) % 24;
      }
    }

    current.minutes = newMinutes;
    previousMinutes = newMinutes;
  } else if (dragHand === "hour") {
    const newHour = Math.round(angle / 30) % 12;
    const isPM = current.hours >= 12;
    current.hours = (isPM ? 12 : 0) + newHour;
  }

  updateClockDisplay();
}

/**
 * Ends dragging interaction
 */
function endDrag() {
  isDragging = false;
  dragHand = null;
  lastAngle = null;

  // Sync totalAngle to current hand position
  totalAngle =
    dragHand === "minute" ? current.minutes * 6 : (current.hours % 12) * 30;

  document.removeEventListener("pointermove", onDrag);
  document.removeEventListener("pointerup", endDrag);
}

// Initialize everything
initClock();
