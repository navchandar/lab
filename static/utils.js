// =========================================================================
// UTILITY & HELPER FUNCTIONS
// =========================================================================

/**
 * Converts a string to Title Case.
 * @param {string} str The string to convert.
 * @returns {string} The Title Cased string.
 */
function toTitleCase(str) {
  return str.toLocaleLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Sets the fullscreen button icon to the 'enter fullscreen' state.
 */
function setEnterFullscreenIcon() {
  fullscreenIcon.innerHTML = `
      <path d="M9 21H3L3 15" stroke="lightgray" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
      <path d="M21 15V21H15" stroke="lightgray" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
      <path d="M15 3H21V9" stroke="lightgray" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
      <path d="M3 9V3H9" stroke="lightgray" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />`;
}

/**
 * Sets the fullscreen button icon to the 'exit fullscreen' state.
 */
function setExitFullscreenIcon() {
  fullscreenIcon.innerHTML = `
      <path d="M3 15H9V21" stroke="lightgray" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
      <path d="M15 21V15H21" stroke="lightgray" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
      <path d="M21 9H15V3" stroke="lightgray" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
      <path d="M9 3V9H3" stroke="lightgray" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>`;
}
