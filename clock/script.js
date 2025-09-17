(function () {
  // ---------- Small utilities ----------
  const mod = (n, m) => ((n % m) + m) % m;
  const degToRad = (deg) => (deg * Math.PI) / 180;

  function angleFromCenter(e, rect) {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    // 0° at 12 o'clock, increase clockwise
    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (angle < 0) {
      angle += 360;
    }
    return angle;
  }

  class AnalogClock {
    /**
     * @param {Object} opts
     * @param {HTMLElement} opts.clockEl
     * @param {HTMLElement} opts.hourHandEl
     * @param {HTMLElement} opts.minuteHandEl
     * @param {HTMLInputElement} opts.timeInputEl
     * @param {Object} [opts.behavior]
     *   hourDragMode: 'snap' | 'smooth' (default: 'snap')
     *   roundToMinuteOnRelease: boolean (default: true)
     */
    constructor({
      clockEl,
      hourHandEl,
      minuteHandEl,
      timeInputEl,
      behavior = {},
    }) {
      // DOM
      this.clock = clockEl;
      this.hourHand = hourHandEl;
      this.minuteHand = minuteHandEl;
      this.timeInput = timeInputEl;

      // Config
      this.behavior = {
        hourDragMode: behavior.hourDragMode || "snap", // 'snap' is least surprising
        roundToMinuteOnRelease:
          behavior.roundToMinuteOnRelease !== undefined
            ? behavior.roundToMinuteOnRelease
            : true,
      };

      // Single source of truth: minutes since midnight (can be fractional while dragging)
      this.totalMinutes = 0;

      // Drag state
      this.isDragging = false;
      this.dragHand = null; // 'hour' | 'minute'
      this.lastAngle = null;
      this.cumulativeRotation = 0; // degrees accumulated
      this.dragStartTotalMinutes = 0;

      // UI state
      this.selectedHand = "hour"; // default selection for numbers/ticks

      // Bind handlers
      this.onPointerDown = this.onPointerDown.bind(this);
      this.onPointerMove = this.onPointerMove.bind(this);
      this.onPointerUp = this.onPointerUp.bind(this);
      this.onDigitalChange = this.onDigitalChange.bind(this);
      this.onDocumentClick = this.onDocumentClick.bind(this);
      this.onKeyDown = this.onKeyDown.bind(this);
    }

    // ---------- Lifecycle ----------
    init() {
      this.insertNumbers(); // 1–12 around the face
      this.insertTicks(); // 12 major ticks (every 5 minutes)
      this.attachHandSelection();
      this.attachClicksForNumbersAndTicks();
      this.attachDigitalInput();
      this.attachInfoIconBehavior();
      this.attachDrag(this.hourHand);
      this.attachDrag(this.minuteHand);

      this.updateCurrentTime(); // animate from 00:00 to now
    }

    // ---------- Rendering ----------
    render() {
      const total = this.totalMinutes;

      // Minute hand angle: minutes within current hour
      const minuteInHour = mod(total, 60); // [0, 60)
      const minuteAngle = minuteInHour * 6; // 6° per minute

      // Hour hand angle: 0.5° per minute within 12h cycle
      const minuteIn12h = mod(total, 720); // [0, 720)
      const hourAngle = minuteIn12h * 0.5; // 0.5° per minute
      this.hourHand.style.transform = `translate(-50%, -90%) rotate(${hourAngle}deg)`;
      this.minuteHand.style.transform = `translate(-50%, -90%) rotate(${minuteAngle}deg)`;

      // Digital display: rounded to nearest minute (user-facing)
      const rounded = Math.round(total);
      const minutes = mod(rounded, 60);
      const hours24 = Math.floor((((rounded % 1440) + 1440) % 1440) / 60);

      // Convert to 12-hour format
      const hours12 = ((hours24 + 11) % 12) + 1;
      const hh = String(hours12).padStart(2, "0");
      const mm = String(minutes).padStart(2, "0");

      this.timeInput.value = `${hh}:${mm}`;
      console.log(this.timeInput.value);
    }

    // Transition helpers (to reuse your CSS transitions nicely)
    addTransition() {
      this.hourHand.classList.remove("no-transition");
      this.minuteHand.classList.remove("no-transition");
    }
    removeTransition() {
      const duration = this.getTransitionDurationInMs(this.hourHand);
      setTimeout(() => {
        this.hourHand.classList.add("no-transition");
        this.minuteHand.classList.add("no-transition");
      }, duration);
    }
    getTransitionDurationInMs(el) {
      const cs = window.getComputedStyle(el);
      let dur = cs.transitionDuration || "0s";
      let del = cs.transitionDelay || "0s";
      dur = dur.split(",")[0].trim();
      del = del.split(",")[0].trim();
      const dMs = dur.endsWith("ms") ? parseFloat(dur) : parseFloat(dur) * 1000;
      const lMs = del.endsWith("ms") ? parseFloat(del) : parseFloat(del) * 1000;
      return dMs + lMs;
    }

    // ---------- Build clock face ----------
    insertNumbers() {
      // Your clock is 280x280, center at (140,140)
      // We'll place numbers on radius 120 (matches your existing visuals)
      const center = 140;
      const radius = 120;

      for (let i = 1; i <= 12; i++) {
        const angle = i * 30 - 90; // place with 12 at top
        const x = center + radius * Math.cos(degToRad(angle));
        const y = center + radius * Math.sin(degToRad(angle));

        const num = document.createElement("div");
        num.className = "number";
        num.style.left = `${x}px`;
        num.style.top = `${y}px`;
        num.textContent = i;
        this.clock.appendChild(num);
      }
    }

    insertTicks() {
      // We add 12 major ticks (every 5 minutes).
      // CSS already positions tick with translateY(-130px); we only set the rotation here.
      for (let i = 0; i < 60; i += 5) {
        const tick = document.createElement("div");
        tick.className = "tick";
        tick.dataset.index = i / 5; // 0..11
        tick.style.setProperty("--rotation", `${i * 6}deg`);
        this.clock.appendChild(tick);
      }
    }

    // ---------- Event wires ----------
    attachHandSelection() {
      this.hourHand.addEventListener(
        "click",
        () => (this.selectedHand = "hour")
      );
      this.minuteHand.addEventListener(
        "click",
        () => (this.selectedHand = "minute")
      );

      document.addEventListener("click", this.onDocumentClick);
      document.addEventListener("keydown", this.onKeyDown);
    }

    attachClicksForNumbersAndTicks() {
      // Numbers: when selectedHand='hour' set hour; when 'minute' set minute=(n*5)
      this.clock.querySelectorAll(".number").forEach((num) => {
        num.addEventListener("click", () => {
          if (!this.selectedHand) {
            return;
          }
          this.addTransition();

          const value = parseInt(num.textContent, 10); // 1..12
          const rounded = Math.round(this.totalMinutes);
          let hours = Math.floor(mod(rounded, 1440) / 60);
          let minutes = mod(rounded, 60);

          if (this.selectedHand === "hour") {
            // Map 12 -> 0, preserve AM/PM block
            const h12 = value % 12;
            const ampmBlock = Math.floor(hours / 12) * 12;
            hours = mod(ampmBlock + h12, 24);
          } else if (this.selectedHand === "minute") {
            minutes = (value % 12) * 5;
          }

          this.totalMinutes = hours * 60 + minutes;
          this.render();
          this.removeTransition();
        });
      });

      // Ticks: 12 major ticks (every 5 mins)
      this.clock.querySelectorAll(".tick").forEach((tick, i) => {
        tick.addEventListener("click", () => {
          if (!this.selectedHand) {
            return;
          }
          this.addTransition();

          const rounded = Math.round(this.totalMinutes);
          let hours = Math.floor(mod(rounded, 1440) / 60);
          let minutes = mod(rounded, 60);

          if (this.selectedHand === "minute") {
            minutes = (i * 5) % 60;
          } else if (this.selectedHand === "hour") {
            const h12 = i % 12;
            const ampmBlock = Math.floor(hours / 12) * 12;
            hours = mod(ampmBlock + h12, 24);
          }

          this.totalMinutes = hours * 60 + minutes;
          this.render();
          this.removeTransition();
        });
      });
    }

    attachDigitalInput() {
      this.timeInput.addEventListener("change", this.onDigitalChange);
    }

    attachInfoIconBehavior() {
      // Attach immediately (no nested DOMContentLoaded to avoid missing the event)
      const infoIcons = document.querySelectorAll(".info-icon");
      infoIcons.forEach((icon) => {
        icon.addEventListener("click", (e) => {
          e.stopPropagation();
          infoIcons.forEach((i) => i.classList.remove("active"));
          icon.classList.toggle("active");
        });
      });
      document.addEventListener("click", () => {
        infoIcons.forEach((icon) => icon.classList.remove("active"));
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          infoIcons.forEach((icon) => icon.classList.remove("active"));
        }
      });
    }

    attachDrag(handEl) {
      handEl.addEventListener("pointerdown", this.onPointerDown);
    }

    // ---------- Handlers ----------
    onPointerDown(e) {
      const hand = e.currentTarget.dataset.hand; // 'hour' | 'minute'
      this.isDragging = true;
      this.dragHand = hand;
      this.lastAngle = null;
      this.cumulativeRotation = 0;
      this.dragStartTotalMinutes = this.totalMinutes;

      e.currentTarget.setPointerCapture(e.pointerId);
      document.addEventListener("pointermove", this.onPointerMove);
      document.addEventListener("pointerup", this.onPointerUp);
    }

    onPointerMove(e) {
      if (!this.isDragging) {
        return;
      }

      const rect = this.clock.getBoundingClientRect();
      const angle = angleFromCenter(e, rect);

      if (this.lastAngle !== null) {
        let delta = angle - this.lastAngle;
        if (delta > 180) {
          delta -= 360;
        }
        if (delta < -180) {
          delta += 360;
        }
        this.cumulativeRotation += delta;

        if (this.dragHand === "minute") {
          // 6° per minute
          const deltaMinutes = this.cumulativeRotation / 6;
          this.totalMinutes = this.dragStartTotalMinutes + deltaMinutes;
        } else if (this.dragHand === "hour") {
          if (this.behavior.hourDragMode === "snap") {
            // 30° per hour => snap by full-hours
            const hourSteps = Math.round(this.cumulativeRotation / 30);
            const deltaMinutes = hourSteps * 60;
            this.totalMinutes = this.dragStartTotalMinutes + deltaMinutes;
          } else {
            // Smooth: 0.5° per minute => minutes = degrees * 2
            const deltaMinutes = this.cumulativeRotation * 2;
            this.totalMinutes = this.dragStartTotalMinutes + deltaMinutes;
          }
        }

        this.render();
      }
      this.lastAngle = angle;
    }

    onPointerUp(e) {
      if (!this.isDragging) {
        return;
      }

      if (this.behavior.roundToMinuteOnRelease) {
        this.totalMinutes = Math.round(this.totalMinutes);
      }
      this.render();

      this.isDragging = false;
      this.dragHand = null;
      this.lastAngle = null;
      this.cumulativeRotation = 0;

      if (e.target.releasePointerCapture) {
        e.target.releasePointerCapture(e.pointerId);
      }
      document.removeEventListener("pointermove", this.onPointerMove);
      document.removeEventListener("pointerup", this.onPointerUp);
    }

    onDigitalChange(e) {
      const value = e.target.value.trim();
      const match = /^(\d{1,2}):(\d{1,2})$/.exec(value);
      if (!match) {
        return;
      }

      let [, hStr, mStr] = match;
      let h = Number(hStr);
      let m = Number(mStr);
      if (Number.isNaN(h) || Number.isNaN(m)) {
        return;
      }

      // Permit 24:00 -> 00:00
      if (h === 24 && m === 0) {
        h = 0;
      }
      if (h < 0 || h > 23 || m < 0 || m > 59) {
        return;
      }

      this.addTransition();
      this.totalMinutes = h * 60 + m;
      this.render();
      this.removeTransition();
    }

    onDocumentClick(e) {
      if (!this.clock.contains(e.target)) {
        this.selectedHand = null;
      }
    }

    onKeyDown(e) {
      if (e.key === "Escape") {
        this.selectedHand = null;
      }
    }

    // ---------- Helpers ----------
    updateCurrentTime() {
      // Simple entry animation: 00:00 -> current time
      this.totalMinutes = 0;
      this.addTransition();
      this.render();

      setTimeout(() => {
        const now = new Date();
        const h = now.getHours();
        const m = now.getMinutes();
        this.totalMinutes = h * 60 + m;
        this.render();
        this.removeTransition();
      }, 100);
    }

    setCurrentTime(date) {
      this.totalMinutes = date.getHours() * 60 + date.getMinutes();
      this.render();
    }
  }

  // ---------- Boot ----------
  document.addEventListener("DOMContentLoaded", () => {
    const clockEl = document.getElementById("analog");
    const hourHandEl = document.getElementById("hourHand");
    const minuteHandEl = document.getElementById("minuteHand");
    const timeInputEl = document.getElementById("timeInput");

    const clock = new AnalogClock({
      clockEl,
      hourHandEl,
      minuteHandEl,
      timeInputEl,
      behavior: {
        hourDragMode: "smooth", // 'snap' or 'smooth'
        roundToMinuteOnRelease: true, // keep display aligned to minute
      },
    });

    clock.init();

    // For console debugging if you want:
    window.__analogClock = clock;
  });
})();
