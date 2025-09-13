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
    tick.style.transform = `rotate(${i * 6}deg)`;
    clock.appendChild(tick);
  }
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
  const h12 = current.hours % 12;
  const hourAngle = h12 * 30 + current.minutes * 0.5;
  const minuteAngle = current.minutes * 6;

  hourHand.style.transform = `translate(-50%, -90%) rotate(${hourAngle}deg)`;
  minuteHand.style.transform = `translate(-50%, -90%) rotate(${minuteAngle}deg)`;

  timeInput.value = `${String(current.hours).padStart(2, "0")}:${String(
    current.minutes
  ).padStart(2, "0")}`;
}

/**
 * Handles digital input change
 */
function onDigitalChange(e) {
  const [h, m] = e.target.value.split(":").map(Number);
  if (!isNaN(h) && !isNaN(m)) {
    current.hours = h;
    current.minutes = m;
    updateClockDisplay();
  }
}

/**
 * Enables dragging for a clock hand
 */
function enableDrag(hand) {
  hand.addEventListener("pointerdown", (e) => {
    isDragging = true;
    dragHand = hand.dataset.hand;
    lastAngle = null;
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
  if (lastAngle !== null && Math.abs(angle - lastAngle) > 300) {
    if (angle < lastAngle) {
      angle += 360;
    } else {
      angle -= 360;
    }
  }
  lastAngle = angle;

  if (dragHand === "minute") {
    current.minutes = Math.round(angle / 6) % 60;
  } else if (dragHand === "hour") {
    const totalHours = angle / 30;
    current.hours = Math.floor(totalHours) % 12 || 12;
    current.minutes = Math.round((totalHours % 1) * 60);
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
  document.removeEventListener("pointermove", onDrag);
  document.removeEventListener("pointerup", endDrag);
}

// Initialize everything
initClock();
