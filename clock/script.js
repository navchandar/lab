import * as utils from "../static/utils.js";
import { TTS } from "../static/speech_helper.js";

// --- DOM Element References ---
const settingsBtn = document.getElementById("settings-btn");
const settingsIcon = document.getElementById("settings-icon");

// --- Speaker Initiation --
const ttsInstance = TTS();
ttsInstance.unlockSpeech();
let intervalID = null;

(function () {
  /**
   * A collection of utility functions.
   */
  const u = {
    /**
     * Performs a true modulo operation, ensuring the result is always positive.
     * @param {number} n The dividend.
     * @param {number} m The divisor.
     * @returns {number} The non-negative remainder.
     */
    mod: (n, m) => ((n % m) + m) % m,

    /**
     * Converts an angle from degrees to radians.
     * @param {number} deg The angle in degrees.
     * @returns {number} The angle in radians.
     */
    degToRad: (deg) => (deg * Math.PI) / 180,

    /**
     * Calculates the angle in degrees from the center of an element to a mouse event.
     * 0° is at the 12 o'clock position, increasing clockwise.
     * @param {PointerEvent} e The mouse event.
     * @param {DOMRect} rect The bounding rectangle of the reference element.
     * @returns {number} The angle in degrees [0, 360).
     */
    angleFromCenter: (e, rect) => {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
      return u.mod(angle, 360);
    },
  };

  /**
   * Defines fixed values used in clock calculations to avoid "magic numbers".
   */
  const CONSTANTS = {
    DEGREES_PER_MINUTE: 6, // 360° / 60 minutes
    DEGREES_PER_HOUR: 30, // 360° / 12 hours
    MINUTES_PER_DEGREE_HOUR_HAND: 2, // 1 / 0.5°
    MINUTES_IN_12_HOURS: 720,
    MINUTES_IN_24_HOURS: 1440,
    CLOCK_FACE_RADIUS: 120,
    CLOCK_CENTER_COORD: 140,
  };

  class AnalogClock {
    /**
     * Creates an interactive analog clock component.
     * @param {object} options - Configuration for the clock.
     * @param {HTMLElement} options.clockEl - The main clock container element.
     * @param {HTMLElement} options.hourHandEl - The hour hand element.
     * @param {HTMLElement} options.minuteHandEl - The minute hand element.
     * @param {HTMLInputElement} options.timeInputEl - The input element for digital time.
     * @param {object} [options.behavior={}] - Custom behavior settings.
     * @param {'snap'|'smooth'} [options.behavior.hourDragMode='snap'] - How the hour hand behaves when dragged.
     * @param {boolean} [options.behavior.roundToMinuteOnRelease=true] - Whether to round to the nearest minute after dragging.
     */
    constructor({
      clockEl,
      hourHandEl,
      minuteHandEl,
      timeInputEl,
      behavior = {},
    }) {
      // Group DOM elements for easy access
      this.elements = {
        clock: clockEl,
        hourHand: hourHandEl,
        minuteHand: minuteHandEl,
        timeInput: timeInputEl,
      };

      // Configuration settings with defaults
      this.config = {
        hourDragMode: behavior.hourDragMode || "snap",
        roundToMinuteOnRelease: behavior.roundToMinuteOnRelease !== false,
      };

      // Internal state of the clock
      this.state = {
        totalMinutes: 0, // Single source of truth: minutes since midnight
        isDragging: false,
        dragHand: null, // 'hour' | 'minute'
        lastAngle: 0,
        cumulativeRotation: 0,
        dragStartTotalMinutes: 0,
        selectedHand: "hour", // 'hour' or 'minute' for number/tick clicks
      };

      // Bind 'this' context for all event handlers
      this._bindEventHandlers();
    }

    // --- Public API ---

    /**
     * Initializes the clock by creating the face and attaching event listeners.
     */
    init() {
      this._createClockFace();
      this._attachEventListeners();
      this._animateToCurrentTime();
    }

    /**
     * Sets the clock's time based on a Date object.
     * @param {Date} date - The date and time to set.
     */
    setDate(date) {
      const hours = date.getHours();
      const minutes = date.getMinutes();
      this.setTime(hours, minutes);
    }

    /**
     * Sets the clock's time based on hours and minutes.
     * @param {number} hours - The hour (0-23).
     * @param {number} minutes - The minute (0-59).
     * @param {boolean} [withTransition=false] - Whether to animate the hands to the new time.
     */
    setTime(hours, minutes, withTransition = false) {
      if (withTransition) {
        this._addTransition();
      }

      this.state.totalMinutes = hours * 60 + minutes;
      this.render();

      if (withTransition) {
        this._removeTransition();
      }
    }

    // --- Rendering and UI Updates ---

    /**
     * Updates the clock hands and digital input based on the current state.
     */
    render() {
      const { totalMinutes } = this.state;

      // Calculate hand angles
      const minuteInHour = u.mod(totalMinutes, 60);
      const minuteAngle = minuteInHour * CONSTANTS.DEGREES_PER_MINUTE;

      const minuteIn12h = u.mod(totalMinutes, CONSTANTS.MINUTES_IN_12_HOURS);
      const hourAngle = minuteIn12h / CONSTANTS.MINUTES_PER_DEGREE_HOUR_HAND;

      // Apply transformations to the DOM
      this.elements.hourHand.style.transform = `translate(-50%, -90%) rotate(${hourAngle}deg)`;
      this.elements.minuteHand.style.transform = `translate(-50%, -90%) rotate(${minuteAngle}deg)`;

      // Update the digital time input, rounding to the nearest minute
      const { hh, mm } = this._formatTimeForDisplay(totalMinutes);
      const formattedTime = `${hh}:${mm}`;
      this.elements.timeInput.value = formattedTime;
      this.elements.timeInput.setAttribute("value", formattedTime);
    }

    speaker(timeText) {
      if (!utils.isMuted()) {
        ttsInstance.speakElement(timeText, {
          directSpeech: true,
          rate: 0.8,
        });
      }
    }

    speakTime() {
      if (!this.state) {
        return;
      }
      if (this.state.totalMinutes !== null) {
        const { hh, mm } = this._formatTimeForDisplay(this.state.totalMinutes);
        const hour = parseInt(hh, 10);
        const minutes = parseInt(mm, 10);

        let timeText = `${hour}`;
        if (minutes === 0) {
          timeText += ` o clock`;
        } else {
          timeText += ` ${minutes}`;
        }

        setTimeout(() => {
          // Speak the time value
          this.speaker(timeText);
        }, 700);
      }
    }

    /**
     * Increase minute by 1 everytime this function runs
     */
    incrementMinute() {
      const { hh, mm } = this._formatTimeForDisplay(this.state.totalMinutes);
      const hour = parseInt(hh, 10);
      const minutes = parseInt(mm, 10) + 1;
      this.setTime(hour, minutes, true);
      if (minutes === 0) {
        this.speakTime();
      }
    }
    /**
     * Increase hour by 1 everytime this function runs
     */
    incrementHour() {
      const { hh, mm } = this._formatTimeForDisplay(this.state.totalMinutes);
      const hour = parseInt(hh, 10) + 1;
      const minutes = parseInt(mm, 10);
      this.setTime(hour, minutes, true);
      this.speakTime();
    }

    setRandomTime() {
      const { hh, mm } = this._formatTimeForDisplay(this.state.totalMinutes);
      const hour = parseInt(hh, 10);
      const minutes = parseInt(mm, 10);
      // Random integer to add to the hour (e.g., between 1 and 5)
      const randomHourOffset = Math.floor(Math.random() * 5) + 1;
      // Random integer to get a multiple of 5 (e.g., 5, 10, 15, 20)
      const randomMinuteOffset = (Math.floor(Math.random() * 4) + 1) * 5;

      const newHour = hour + randomHourOffset;
      const newMinutes = minutes + randomMinuteOffset;

      this.setTime(newHour, newMinutes, true);
      this.speakTime();
    }

    /**
     * Formats the total minutes into a 12-hour display string.
     * @param {number} totalMinutes - The total minutes from midnight.
     * @returns {{hh: string, mm: string}} The formatted hours and minutes.
     */
    _formatTimeForDisplay(totalMinutes) {
      const roundedTotal = Math.round(totalMinutes);
      const minutes = u.mod(roundedTotal, 60);
      const hours24 = Math.floor(
        u.mod(roundedTotal, CONSTANTS.MINUTES_IN_24_HOURS) / 60
      );

      // Convert 24-hour format to 12-hour format for display
      const hours12 = ((hours24 + 11) % 12) + 1;
      const hh = String(hours12).padStart(2, "0");
      const mm = String(minutes).padStart(2, "0");

      return {
        hh,
        mm,
      };
    }

    // --- Clock Face Generation ---

    /**
     * Generates the clock numbers and ticks and adds them to the DOM.
     */
    _createClockFace() {
      this._createClockNumbers();
      this._createClockTicks();
    }

    /**
     * Creates and positions the 1-12 numbers around the clock face.
     */
    _createClockNumbers() {
      const { CLOCK_CENTER_COORD, CLOCK_FACE_RADIUS } = CONSTANTS;
      for (let i = 1; i <= 12; i++) {
        const angle = i * CONSTANTS.DEGREES_PER_HOUR - 90; // Adjust for 12 at top
        const x =
          CLOCK_CENTER_COORD + CLOCK_FACE_RADIUS * Math.cos(u.degToRad(angle));
        const y =
          CLOCK_CENTER_COORD + CLOCK_FACE_RADIUS * Math.sin(u.degToRad(angle));

        const numEl = document.createElement("div");
        numEl.className = "number";
        numEl.style.left = `${x}px`;
        numEl.style.top = `${y}px`;
        numEl.textContent = i;
        numEl.dataset.value = i;
        this.elements.clock.appendChild(numEl);
      }
    }

    /**
     * Creates and positions the 12 major ticks for every 5 minutes.
     */
    _createClockTicks() {
      for (let i = 0; i < 12; i++) {
        const tickEl = document.createElement("div");
        tickEl.className = "tick";
        tickEl.dataset.value = i === 0 ? 12 : i; // Use 12 for the 0th tick
        const rotation = i * CONSTANTS.DEGREES_PER_HOUR;
        tickEl.style.setProperty("--rotation", `${rotation}deg`);
        this.elements.clock.appendChild(tickEl);
      }
    }

    // --- Event Listener Setup ---

    /**
     * Binds the 'this' context to all event handler methods.
     */
    _bindEventHandlers() {
      this._onPointerDown = this._onPointerDown.bind(this);
      this._onPointerMove = this._onPointerMove.bind(this);
      this._onPointerUp = this._onPointerUp.bind(this);
      this._onDigitalChange = this._onDigitalChange.bind(this);
      this._onDocumentClick = this._onDocumentClick.bind(this);
      this._onKeyDown = this._onKeyDown.bind(this);
    }

    /**
     * Attaches all necessary event listeners to the DOM elements.
     */
    _attachEventListeners() {
      // Drag listeners for hands
      this.elements.hourHand.addEventListener(
        "pointerdown",
        this._onPointerDown
      );
      this.elements.minuteHand.addEventListener(
        "pointerdown",
        this._onPointerDown
      );

      // Hand selection listeners
      this.elements.hourHand.addEventListener(
        "click",
        () => (this.state.selectedHand = "hour")
      );
      this.elements.minuteHand.addEventListener(
        "click",
        () => (this.state.selectedHand = "minute")
      );

      // Click listeners for numbers and ticks on the clock face
      this.elements.clock.addEventListener("click", (e) => {
        const target = e.target;
        if (target.matches(".number, .tick") && target.dataset.value) {
          this._handleFaceClick(parseInt(target.dataset.value, 10));
        }
      });

      // Digital input change
      this.elements.timeInput.addEventListener("change", this._onDigitalChange);

      // Global listeners
      document.addEventListener("click", this._onDocumentClick);
      document.addEventListener("keydown", this._onKeyDown);

      this._attachInfoIconBehavior(); // Can remain separate if it's a distinct feature
    }

    // --- Event Handlers ---

    /**
     * Handles clicks on the clock face numbers or ticks to set the time.
     * @param {number} value - The numeric value of the clicked element (1-12).
     */
    _handleFaceClick(value) {
      if (!this.state.selectedHand) {
        return;
      }

      const rounded = Math.round(this.state.totalMinutes);
      let hours = Math.floor(
        u.mod(rounded, CONSTANTS.MINUTES_IN_24_HOURS) / 60
      );
      let minutes = u.mod(rounded, 60);

      if (this.state.selectedHand === "hour") {
        const h12 = value % 12; // Map 12 to 0 for calculation
        const isAm = hours < 12;
        hours = isAm ? h12 : h12 + 12;
      } else {
        // 'minute'
        minutes = (value % 12) * 5;
      }

      this.setTime(hours, minutes, true);
      this.speakTime();
    }

    /**
     * Handles the start of a drag operation on a clock hand.
     * @param {PointerEvent} e - The pointer down event.
     */
    _onPointerDown(e) {
      this.state.isDragging = true;
      this.state.dragHand = e.currentTarget.dataset.hand;
      this.state.dragStartTotalMinutes = this.state.totalMinutes;
      this.state.lastAngle = null;
      this.state.cumulativeRotation = 0;

      e.currentTarget.setPointerCapture(e.pointerId);
      document.addEventListener("pointermove", this._onPointerMove);
      document.addEventListener("pointerup", this._onPointerUp);
    }

    /**
     * Handles the pointer movement during a drag operation.
     * @param {PointerEvent} e - The pointer move event.
     */
    _onPointerMove(e) {
      if (!this.state.isDragging) {
        return;
      }

      const rect = this.elements.clock.getBoundingClientRect();
      const angle = u.angleFromCenter(e, rect);

      if (this.state.lastAngle !== null) {
        let delta = angle - this.state.lastAngle;
        // Handle angle wrapping (e.g., from 359° to 1°)
        if (delta > 180) {
          delta -= 360;
        }
        if (delta < -180) {
          delta += 360;
        }

        this.state.cumulativeRotation += delta;
        let deltaMinutes = 0;

        if (this.state.dragHand === "minute") {
          deltaMinutes =
            this.state.cumulativeRotation / CONSTANTS.DEGREES_PER_MINUTE;
        } else {
          // 'hour'
          if (this.config.hourDragMode === "snap") {
            const hourSteps = Math.round(
              this.state.cumulativeRotation / CONSTANTS.DEGREES_PER_HOUR
            );
            deltaMinutes = hourSteps * 60;
          } else {
            // 'smooth'
            deltaMinutes =
              this.state.cumulativeRotation *
              CONSTANTS.MINUTES_PER_DEGREE_HOUR_HAND;
          }
        }
        this.state.totalMinutes =
          this.state.dragStartTotalMinutes + deltaMinutes;
        this.render();
      }
      this.state.lastAngle = angle;
    }

    /**
     * Handles the end of a drag operation.
     * @param {PointerEvent} e - The pointer up event.
     */
    _onPointerUp(e) {
      if (!this.state.isDragging) {
        return;
      }

      if (this.config.roundToMinuteOnRelease) {
        this.state.totalMinutes = Math.round(this.state.totalMinutes);
        this.render();
      }

      // Reset drag state
      this.state.isDragging = false;
      this.state.dragHand = null;

      if (e.target.releasePointerCapture) {
        e.target.releasePointerCapture(e.pointerId);
      }
      document.removeEventListener("pointermove", this._onPointerMove);
      document.removeEventListener("pointerup", this._onPointerUp);
    }

    /**
     * Handles changes to the digital time input field.
     * @param {Event} e - The change event.
     */
    _onDigitalChange(e) {
      const value = e.target.value.trim();
      const match = /^(\d{1,2}):(\d{1,2})$/.exec(value);
      if (!match) {
        return;
      }

      let [, hStr, mStr] = match;
      let hours = Number(hStr);
      let minutes = Number(mStr);

      if (isNaN(hours) || isNaN(minutes) || hours > 23 || minutes > 59) {
        // Re-render to revert to the last valid time if input is invalid
        this.render();
        return;
      }

      this.setTime(hours, minutes, true);
      this.speakTime();
    }

    /**
     * Deselects the active hand if a click occurs outside the clock.
     * @param {MouseEvent} e - The click event.
     */
    _onDocumentClick(e) {
      if (!this.elements.clock.contains(e.target)) {
        this.state.selectedHand = null;
      }
    }

    /**
     * Deselects the active hand when the Escape key is pressed.
     * @param {KeyboardEvent} e - The keydown event.
     */
    _onKeyDown(e) {
      if (e.key === "Escape") {
        this.state.selectedHand = null;
      }

      const keyNum = parseInt(e.key, 10);
      if (!isNaN(keyNum) && keyNum >= 1 && keyNum <= 12) {
        // Convert to 24-hour format based on current time
        const currentMinutes = Math.round(this.state.totalMinutes);
        const currentHours = Math.floor(
          u.mod(currentMinutes, CONSTANTS.MINUTES_IN_24_HOURS) / 60
        );
        const isAm = currentHours < 12;
        const h12 = keyNum % 12;
        const newHour = isAm ? h12 : h12 + 12;
        this.setTime(newHour, 0, true);
        this.speakTime();
      }
    }

    // --- Helper Methods ---

    /**
     * Animates the clock from 00:00 to the current time on initialization.
     */
    _animateToCurrentTime() {
      this.setTime(0, 0); // Start at 00:00
      this._addTransition();

      setTimeout(() => {
        const now = new Date();
        this.setDate(now);
        this._removeTransition();
      }, 100); // A small delay to ensure the initial state is rendered
    }

    /** Enables CSS transitions on the clock hands. */
    _addTransition() {
      this.elements.hourHand.classList.remove("no-transition");
      this.elements.minuteHand.classList.remove("no-transition");
    }

    /**
     * Disables CSS transitions after they have completed.
     * This prevents unwanted animations during drag operations.
     */
    _removeTransition() {
      const duration = this._getTransitionDurationInMs(this.elements.hourHand);
      setTimeout(() => {
        this.elements.hourHand.classList.add("no-transition");
        this.elements.minuteHand.classList.add("no-transition");
      }, duration);
    }

    /**
     * Reads the transition duration from a CSS property.
     * @param {HTMLElement} el - The element to inspect.
     * @returns {number} The total transition duration in milliseconds.
     */
    _getTransitionDurationInMs(el) {
      const style = window.getComputedStyle(el);
      const durationStr = style.transitionDuration || "0s";
      const delayStr = style.transitionDelay || "0s";
      const parse = (str) =>
        str.endsWith("ms") ? parseFloat(str) : parseFloat(str) * 1000;
      return parse(durationStr) + parse(delayStr);
    }

    /**
     * Attaches behavior for info icons. This is kept separate as it might
     * not be core to the clock's time-telling functionality.
     */
    _attachInfoIconBehavior() {
      const infoIcons = document.querySelectorAll(".info-icon");
      const deactivateAll = () =>
        infoIcons.forEach((i) => i.classList.remove("active"));

      infoIcons.forEach((icon) => {
        icon.addEventListener("click", (e) => {
          e.stopPropagation();
          const wasActive = icon.classList.contains("active");
          deactivateAll();
          if (!wasActive) {
            icon.classList.add("active");
          }
        });
      });

      document.addEventListener("click", deactivateAll);
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          deactivateAll();
        }
      });
    }
  }

  function autoplay() {
    if (intervalID) {
      clearInterval(intervalID);
    }
    // Determine which mode to use (random or sequential)
    const isRandomEnabled = utils.getIsRandomEnabled();
    if (isRandomEnabled) {
      window.__analogClock.setRandomTime();
      intervalID = setInterval(() => {
        window.__analogClock.setRandomTime();
      }, 1000);
    } else {
      window.__analogClock.incrementMinute();
      intervalID = setInterval(() => {
        window.__analogClock.incrementMinute();
      }, 1000);
    }
  }

  function updateSettingsMenu() {
    // =========================
    // Settings Menu
    // =========================
    const randomizeCheckbox = document.getElementById("randomize");
    const autoplayCheckbox = document.getElementById("autoplay");

    // Toggle menu visibility
    settingsBtn.style.display = "block";
    utils.addListeners(settingsBtn, utils.onClickSettings);
    utils.addListeners(settingsIcon, utils.onClickSettings);

    utils.setIsRandom(randomizeCheckbox.checked);
    utils.addUnifiedListeners(randomizeCheckbox, () => {
      utils.setIsRandom(randomizeCheckbox.checked);
    });

    function handleAutoplayToggle() {
      if (autoplayCheckbox.checked) {
        autoplay();
      } else {
        clearInterval(intervalID);
      }
    }

    utils.addUnifiedListeners(autoplayCheckbox, handleAutoplayToggle);
  }

  // =========================
  // Event Listeners
  // =========================
  function handleKeydown(event) {
    const target = event.target;
    const isRandomEnabled = utils.getIsRandomEnabled();
    switch (event.code) {
      case "Space":
        // Ignore key presses if focused on an interactive element
        if (utils.isInteractiveElement(target)) {
          return;
        }
        event.preventDefault();
        if (isRandomEnabled) {
          window.__analogClock.setRandomTime();
        } else {
          window.__analogClock.incrementMinute();
        }
        break;
      case "Enter":
        // Ignore key presses if focused on an interactive element
        if (utils.isInteractiveElement(target)) {
          return;
        }
        event.preventDefault();
        if (isRandomEnabled) {
          window.__analogClock.setRandomTime();
        } else {
          window.__analogClock.incrementHour();
        }
        break;
      case "KeyM":
        event.preventDefault();
        utils.hideSettings();
        utils.toggleMute();
        if (utils.isMuted()) {
          ttsInstance.cancel();
        } else {
          window.__analogClock.speakTime();
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

  utils.setFullscreenIcon();

  // --- Bootstrapping ---

  /**
   * Initializes the clock when the DOM is fully loaded.
   */
  document.addEventListener("DOMContentLoaded", () => {
    const clockEl = document.getElementById("analog");
    const hourHandEl = document.getElementById("hourHand");
    const minuteHandEl = document.getElementById("minuteHand");
    const timeInputEl = document.getElementById("timeInput");
    document.addEventListener("keydown", handleKeydown);
    utils.updateMuteBtn();
    utils.updateFullScreenBtn();

    // Ensure all required elements are found before initializing
    if (!clockEl || !hourHandEl || !minuteHandEl || !timeInputEl) {
      console.error(
        "One or more required clock elements are missing from the DOM."
      );
      return;
    }

    const clock = new AnalogClock({
      clockEl,
      hourHandEl,
      minuteHandEl,
      timeInputEl,
      behavior: {
        hourDragMode: "smooth", // 'snap' or 'smooth'
        roundToMinuteOnRelease: true,
      },
    });

    clock.init();

    // Expose the clock instance for debugging purposes
    window.__analogClock = clock;

    updateSettingsMenu();

    // update mute button if speech supported
    if (ttsInstance.isSpeechReady()) {
      utils.enableMuteBtn();
      if (!utils.isMuted()) {
        setTimeout(window.__analogClock.speakTime, 1000);
      }
    } else {
      utils.disableMuteBtn();
    }
  });
})();
