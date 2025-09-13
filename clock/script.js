const hourHand = document.getElementById("hourHand");
const minuteHand = document.getElementById("minuteHand");
const timeInput = document.getElementById("timeInput");
const clock = document.getElementById("analog");

let current = { hours: 0, minutes: 0 };
let isDragging = false;
let dragHand = null;

// Place numbers 1–12
function insertNumbers() {
  for (let i = 1; i <= 12; i++) {
    const angle = i * 30 - 90; // 30° per hour
    const num = document.createElement("div");
    num.className = "number";
    const radius = 120;
    const x = 140 + radius * Math.cos((angle * Math.PI) / 180);
    const y = 140 + radius * Math.sin((angle * Math.PI) / 180);
    num.style.left = `${x}px`;
    num.style.top = `${y}px`;
    num.textContent = i;
    clock.appendChild(num);
  }
}

// Place tick marks (every 5 min)
function insertTicks() {
  for (let i = 0; i < 60; i += 5) {
    const tick = document.createElement("div");
    tick.className = "tick";
    tick.style.transform = `rotate(${i * 6}deg)`;
    clock.appendChild(tick);
  }
}

function init() {
  insertNumbers();
  insertTicks();
  const now = new Date();
  current.hours = now.getHours();
  current.minutes = now.getMinutes();
  updateClocks();
  setupDrag(hourHand);
  setupDrag(minuteHand);
  timeInput.addEventListener("change", onDigitalChange);
}

function updateClocks() {
  const h12 = current.hours % 12;
  const hourAngle = h12 * 30 + current.minutes * 0.5;
  const minuteAngle = current.minutes * 6;
  hourHand.style.transform = `translate(-50%, -90%) rotate(${hourAngle}deg)`;
  minuteHand.style.transform = `translate(-50%, -90%) rotate(${minuteAngle}deg)`;
  timeInput.value = `${String(current.hours).padStart(2, "0")}:${String(
    current.minutes
  ).padStart(2, "0")}`;
}

function onDigitalChange(e) {
  const [h, m] = e.target.value.split(":").map(Number);
  if (!isNaN(h) && !isNaN(m)) {
    current.hours = h;
    current.minutes = m;
    updateClocks();
  }
}

function setupDrag(hand) {
  hand.addEventListener("pointerdown", (e) => {
    isDragging = true;
    dragHand = hand.dataset.hand;
    hand.setPointerCapture(e.pointerId);
    document.addEventListener("pointermove", onDrag);
    document.addEventListener("pointerup", endDrag);
  });
}

function onDrag(e) {
  if (!isDragging) return;
  const rect = clock.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = e.clientX - cx;
  const dy = e.clientY - cy;
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  if (deg < 0) deg += 360;

  if (dragHand === "minute") {
    current.minutes = Math.round(deg / 6) % 60;
  } else {
    const totalHours = deg / 30;
    current.hours = Math.floor(totalHours) % 12;
    if (current.hours === 0) current.hours = 12;
    current.minutes = Math.round((totalHours % 1) * 60);
  }
  updateClocks();
}

function endDrag() {
  isDragging = false;
  dragHand = null;
  document.removeEventListener("pointermove", onDrag);
  document.removeEventListener("pointerup", endDrag);
}

init();
