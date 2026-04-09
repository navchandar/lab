import { TTS } from "./speech_helper.js";

// Initialize TTS at the top level
window.SHARED_TTS = TTS();

// Start loading voices immediately so they are ready
if (window.SHARED_TTS.unlockSpeech) {
  window.SHARED_TTS.unlockSpeech();
}

// Constants
const BASE_PATH = "/lab/";
const swPath = `${BASE_PATH}service-worker.js`;
let iframeBodyObserver = null;

// --- DOM elements ---
const sidebar = document.getElementById("sidebar");
const hamburger = document.getElementById("hamburger-menu");
const header = document.querySelector("body header");
const iframe = document.getElementById("appFrame");
let appLinks = null;

document.addEventListener("DOMContentLoaded", () => {
  initializeAppUI();
  registerServiceWorker();
});

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    console.warn("🚫 Service workers not supported");
    return;
  }

  navigator.serviceWorker
    .register(swPath, { scope: "/lab/" })
    .then((registration) => {
      console.log("✅ Service Worker registered:", registration.scope);
      monitorServiceWorkerUpdates(registration);
    })
    .catch((error) => {
      console.error("❌ Service Worker registration failed:", error);
    });

  setupUpdateNotification();
}

/**
 * Monitors a service worker registration for available updates.
 * When an update is found and installed, it notifies the user.
 * @param {ServiceWorkerRegistration} registration The service worker registration object.
 */
function monitorServiceWorkerUpdates(registration) {
  if (registration.waiting && navigator.serviceWorker.controller) {
    // If we already have a waiting worker, it means an update is ready.
    showUpdateNotification();
    return;
  }

  registration.addEventListener("updatefound", () => {
    // Use 'const' to properly scope the new worker variable.
    const newWorker = registration.installing;
    if (!newWorker) {
      return;
    }

    newWorker.addEventListener("statechange", () => {
      // Check if the new worker is installed
      const isUpdateReady = newWorker.state === "installed";
      if (isUpdateReady && navigator.serviceWorker.controller) {
        // Separate the UI logic into its own function.
        showUpdateNotification();
      }
    });
  });
}

/**
 * Handles the UI logic to show the update notification to the user.
 */
function showUpdateNotification() {
  console.log("A new version is available. Showing update banner.");

  // Provide tactile feedback if the Vibration API is supported.
  if (navigator.vibrate) {
    navigator.vibrate(100);
  }

  // Safely get and display the notification banner.
  const updateBanner = document.getElementById("update-notification");
  if (updateBanner) {
    updateBanner.style.display = "block";
    updateBanner.classList.add("show");
  } else {
    console.log("Update notification element not found");
  }
}

/* Remove active link highlighted in the sidebar */
function removeActiveLinksInSidebar() {
  if (!appLinks) {
    appLinks = document.querySelectorAll("#app-links li a");
  }
  if (appLinks) {
    appLinks.forEach((l) => l.parentElement.classList.remove("active"));
  } else {
    console.warn("Sidebar links not found!");
  }
}

/* Make link highlighted in the sidebar */
function activateLinkInSidebar(link) {
  if (link && link.parentElement) {
    const activeItem = link.parentElement;
    activeItem.classList.add("active");
  } else {
    console.warn("Sidebar link not found!");
  }
}

function scrollToActiveSidebarItem() {
  // Find the parent <li> that currently has the "active" class
  const activeListItem = document.querySelector("#app-links li.active");
  // If it exists, scroll to it
  if (activeListItem) {
    activeListItem.scrollIntoView({
      behavior: "auto",
      block: "nearest", // Only scrolls if it's actually off-screen
    });
  } else {
    console.warn("No Active Sidebar link found!");
  }
}

/**
 * Creates and displays an update notification, attaching the necessary event listeners.
 */
function setupUpdateNotification() {
  // Use createElement for safer and more manageable DOM manipulation
  const notification = document.createElement("div");
  notification.id = "update-notification";
  notification.setAttribute("role", "alert");

  const message = document.createElement("span");
  message.textContent = "A new version is available!";

  const refreshButton = document.createElement("button");
  refreshButton.id = "refresh-button";
  refreshButton.textContent = "Refresh";

  notification.append(message, refreshButton);
  document.body.appendChild(notification);

  // Use async/await for cleaner asynchronous logic
  refreshButton.addEventListener("click", async () => {
    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        // Check for a waiting worker and post the message
        if (registration?.waiting) {
          navigator.serviceWorker.addEventListener("controllerchange", () => {
            window.location.reload();
          });
          registration.waiting.postMessage({ action: "skipWaiting" });
        } else {
          // Fallback if no waiting worker is found
          window.location.reload();
        }
      } else {
        window.location.reload();
      }
    } catch (error) {
      console.error("Error during service worker update:", error);
      // Always provide a fallback reload if an error occurs
      window.location.reload();
    }
  });
}

/**
 * Blends a semi-transparent color (top) with a solid color (bottom)
 * to find the visual result.
 */
function blendColors(top, bottom) {
  // Helper to convert any color string to [r, g, b, a]
  const parseColor = (color) => {
    const div = document.createElement("div");
    div.style.color = color;
    document.body.appendChild(div);
    const m = getComputedStyle(div).color.match(/\d+(\.\d+)?/g);
    div.remove();
    if (!m) {
      return [0, 0, 0, 1];
    }
    return [
      parseInt(m[0]),
      parseInt(m[1]),
      parseInt(m[2]),
      m[3] ? parseFloat(m[3]) : 1,
    ];
  };

  const [sR, sG, sB, sA] = parseColor(top);
  const [bR, bG, bB] = parseColor(bottom);

  // Alpha Blending Formula
  const r = Math.round(sR * sA + bR * (1 - sA));
  const g = Math.round(sG * sA + bG * (1 - sA));
  const b = Math.round(sB * sA + bB * (1 - sA));

  return `rgb(${r}, ${g}, ${b})`;
}

function updateThemeColorFromIframe() {
  const iframe = document.getElementById("appFrame");
  if (!iframe || !iframe.contentWindow) {
    console.error("Iframe not found.");
    return;
  }

  try {
    // Access the content document of the iframe
    const iframeDocument = iframe.contentWindow.document;

    // Get the computed background-color style of the iframe's body
    // Note: We use getComputedStyle to get the *actual* applied style
    const iframeBody = iframeDocument.body;
    if (!iframeBody) {
      console.error("Iframe body not found.");
      return;
    }
    const computedStyle = window.getComputedStyle(iframeBody);
    // Try to get the background image (where gradients are set)
    const backgroundImage = computedStyle.getPropertyValue("background-image");
    // Get the standard background color as a fallback
    const backgroundColor = computedStyle.getPropertyValue("background-color");
    let targetColor = backgroundColor;

    // If there is a gradient, extract the first color stop
    if (backgroundImage && backgroundImage !== "none") {
      // RegEx to find hex, rgb, rgba, or hsl colors
      const colorRegex = /(rgb|hsl)a?\([^)]+\)|#[a-fA-F0-9]{3,8}/i;
      const match = backgroundImage.match(colorRegex);
      if (match) {
        const topGradientColor = match[0];
        // Blend the gradient's top color with the solid background
        targetColor = blendColors(topGradientColor, backgroundColor);
        console.log(`Background Gradient detected: ${targetColor}`);
      }
    } else if (backgroundColor) {
      console.log(`Background Color detected: ${targetColor}`);
    }

    // Check if a color was successfully retrieved and Update the Meta Tag
    if (
      targetColor &&
      targetColor !== "transparent" &&
      targetColor !== "rgba(0, 0, 0, 0)"
    ) {
      let themeMetaTag = document.querySelector('meta[name="theme-color"]');
      if (!themeMetaTag) {
        themeMetaTag = document.createElement("meta");
        themeMetaTag.name = "theme-color";
        document.head.appendChild(themeMetaTag);
        console.log("Created new meta theme-color tag.");
      }

      // Get the current color from the existing tag and compare
      const currentThemeColor = themeMetaTag.content.trim();
      if (currentThemeColor !== targetColor) {
        themeMetaTag.content = targetColor;
        console.log(`Updated theme color to: ${targetColor}`);
      }
    } else {
      console.warn("Could not retrieve background-color from iframe body.");
    }
  } catch (e) {
    console.error(
      "Error accessing iframe content. Check for Same-Origin restrictions.",
      e,
    );
  }
}

function monitorIframeBackgroundColor() {
  const iframe = document.getElementById("appFrame");
  if (!iframe) {
    console.error("Iframe not found.");
    return;
  }

  // Prevent re-init if this is called more than once
  if (iframe.dataset.themeSyncInit === "1") {
    return;
  }
  iframe.dataset.themeSyncInit = "1";
  let debounceTimer = null;
  // Schedule update AFTER iframe click handlers complete (next tick)
  const scheduleUpdate = (() => {
    let scheduled = false;
    clearTimeout(debounceTimer);
    return () => {
      if (scheduled) {
        return;
      }
      scheduled = true;
      // Set a new timer for 100ms
      debounceTimer = setTimeout(() => {
        // Use requestAnimationFrame for the actual DOM write for smoothness
        requestAnimationFrame(() => {
          scheduled = false;
          updateThemeColorFromIframe();
        });
      }, 100);
    };
  })();

  const onLoad = function () {
    // Update immediately on each navigation
    updateThemeColorFromIframe();

    try {
      // Disconnect previous observer (for prior iframe document)
      if (iframeBodyObserver) {
        iframeBodyObserver.disconnect();
        iframeBodyObserver = null;
      }

      const doc = iframe.contentWindow.document;
      const body = doc.body;
      if (!body) {
        return;
      }

      body.addEventListener("click", collapseSidebar);

      // Watch for style/class changes on the body
      iframeBodyObserver = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
          if (
            mutation.type === "attributes" &&
            (mutation.attributeName === "style" ||
              mutation.attributeName === "class")
          ) {
            // Run AFTER any click handler mutations in the iframe
            scheduleUpdate();
          }
        }
      });

      iframeBodyObserver.observe(body, {
        attributes: true,
        attributeFilter: ["style", "class"],
        subtree: false,
      });

      doc.addEventListener("click", scheduleUpdate, false);
      body.addEventListener("transitionend", scheduleUpdate, false);

      console.log("MutationObserver started on iframe body.");
    } catch (e) {
      console.error(
        "Cannot set up MutationObserver due to Same-Origin Policy.",
        e,
      );
    }
  };

  // Use addEventListener to avoid overwriting onload
  iframe.addEventListener("load", onLoad);

  // If the iframe is already loaded when this runs, fire once now
  try {
    if (
      iframe.contentDocument &&
      iframe.contentDocument.readyState === "complete"
    ) {
      onLoad();
    }
  } catch {
    // Ignore if no iframe content
  }
}

const toHash = (href) =>
  "#" + toCanonicalRoute(href).replace(BASE_PATH, "").replace(/^\//, "");

function samePath(a, b) {
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }

  try {
    // Only parse if strings differ
    return (
      new URL(a, window.location.origin).pathname ===
      new URL(b, window.location.origin).pathname
    );
  } catch {
    return a === b;
  }
}

function toCanonicalRoute(href) {
  if (!href) {
    return null;
  }
  let s = href.trim();
  // strip leading hash if present
  if (s.startsWith("#")) {
    s = s.slice(1);
  }
  // ensure leading slash
  if (!s.startsWith("/")) {
    s = "/" + s;
  }
  // ensure BASE_PATH prefix
  if (!s.startsWith(BASE_PATH)) {
    // remove possible double leading slash before appending
    s = BASE_PATH + s.replace(/^\//, "");
  }
  return s; // always '/lab/...'
}

function getNormalizedHashPath() {
  const hash = window.location.hash;
  if (hash.length > 1) {
    let path = hash.slice(1).trim();
    // Ensure single leading slash before normalization
    if (!path.startsWith("/")) {
      path = "/" + path;
    }
    if (!path.startsWith(BASE_PATH)) {
      path = BASE_PATH + path.replace(/^\//, "");
    }
    return path;
  }
  return null;
}

/**
 * Handles browser navigation (Back/Forward buttons) by checking the history state.
 */
function handlePopState() {
  const iframe = document.getElementById("appFrame");
  if (!appLinks) {
    appLinks = document.querySelectorAll("#app-links li a");
  }
  let targetSrc = null;

  // The browser has already updated the URL and hash when popstate fires.
  // We must now read the new URL's hash to determine the content.
  const hashPath = getNormalizedHashPath();
  targetSrc = hashPath ? toCanonicalRoute(hashPath) : null;
  if (!targetSrc) {
    iframe.setAttribute("src", "");
    uncollapseSidebar();
    removeActiveLinksInSidebar();
    return;
  }

  if (!samePath(iframe.getAttribute("src") || "", targetSrc)) {
    safeSetIframeSrc(targetSrc);
    const activeKey = targetSrc.replace(BASE_PATH, "").replace(/^\//, "");
    appLinks.forEach((l) => {
      const linkHref = l.getAttribute("href");
      // Use toCanonicalRoute on the link's href to get the comparable key
      const linkCanonicalRoute = toCanonicalRoute(linkHref) || "";
      const linkKey = linkCanonicalRoute
        .replace(BASE_PATH, "")
        .replace(/^\//, "");
      l.parentElement.classList.toggle("active", linkKey === activeKey);
    });

    collapseSidebar();
  } else {
    // Close sidebar even if the src is the same
    collapseSidebar();
  }
}

function safeSetIframeSrc(src) {
  const iframe = document.getElementById("appFrame");
  if (!iframe) {
    return;
  }
  const current = iframe.getAttribute("src") || "";
  if (samePath(current, src)) {
    return;
  }

  try {
    iframe.src = src;
  } catch (e) {
    iframe.setAttribute("src", src);
  }
}

/**
 * Collapses the sidebar if iframe is loaded and visible.
 */
const collapseSidebar = () => {
  const iframeSrc = iframe?.getAttribute("src");

  if (!iframeSrc || iframeSrc === "" || !iframe.contentWindow) {
    return;
  }

  console.log("Collapsing sidebar and hiding header.");

  sidebar.classList.add("collapsed");
  sidebar.classList.remove("overlay");

  if (hamburger.style.display !== "block") {
    hamburger.style.display = "block";
  }

  if (header && header.style.display !== "none") {
    header.style.display = "none";
    sidebar.style.paddingTop = "3.75em";
  }
  hamburger.classList.remove("menu-open");
  updateHamburger();
};

/**
 * Uncollapses the sidebar and shows the header.
 */
const uncollapseSidebar = () => {
  console.log("Uncollapsing sidebar and showing header.");
  sidebar.classList.remove("collapsed");
  sidebar.classList.add("overlay");
  hamburger.classList.toggle("menu-open");
  updateHamburger();

  if (header) {
    header.style.display = "block";
    sidebar.style.paddingTop = "0em";
  }
  // Ensure focus leaves the iframe
  window.focus();
  scrollToActiveSidebarItem();
};

function toggleHamburgerMenu() {
  const isOpening = sidebar.classList.contains("collapsed");
  sidebar.classList.toggle("overlay");
  sidebar.classList.toggle("collapsed");
  hamburger.classList.toggle("menu-open");
  updateHamburger();
  // If we are opening the menu, pull focus back to the main page
  if (isOpening) {
    hamburger.focus();
  }
}

function updateHamburger() {
  if (hamburger.classList.contains("menu-open")) {
    // Menu is open, display the close symbol 'X'
    hamburger.textContent = "x";
    hamburger.setAttribute("aria-expanded", "true");
    hamburger.setAttribute("aria-label", "Close menu");
  } else {
    hamburger.textContent = "☰";
    hamburger.setAttribute("aria-expanded", "false");
    hamburger.setAttribute("aria-label", "Toggle menu");
  }
}

function updateIframeContent(link) {
  const iframe = document.getElementById("appFrame");
  const href = toCanonicalRoute(link.getAttribute("href"));

  // The link is already active and loaded
  if (iframe.getAttribute("src") === href) {
    console.log(`Already loaded ${href} in iframe`);
    return;
  }

  console.log(`Loading ${href} in iframe`);
  safeSetIframeSrc(href);

  const newHash = toHash(href); // e.g., #app-name
  if (window.location.hash !== newHash) {
    // Update the address bar and create a history entry
    window.location.hash = newHash;
  }

  setTimeout(() => {
    iframe.focus();
    iframe.dataset.themeSyncInit = 0;
  }, 200);
}

function initializeAppUI() {
  const iframe = document.getElementById("appFrame");
  appLinks = document.querySelectorAll("#app-links li a");
  if (!appLinks) {
    console.warn("App links not found in the sidebar!");
  }

  window.addEventListener("hashchange", handlePopState);

  // On load, sync iframe with current hash (if any):
  handlePopState();

  // Initialize theme sync once at startup
  monitorIframeBackgroundColor();

  iframe.addEventListener("load", collapseSidebar);
  iframe.addEventListener("error", () => {
    console.error("Iframe failed to load:", iframe.getAttribute("src"));
  });

  appLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      removeActiveLinksInSidebar();
      activateLinkInSidebar(link);
      collapseSidebar();
      updateIframeContent(link);
    });
  });

  // Toggle sidebar on hamburger click
  hamburger.addEventListener("click", toggleHamburgerMenu);

  document.addEventListener("keydown", (event) => {
    // '=' key shortcut to toggle the sidebar
    if (event.key === "=") {
      event.preventDefault();
      sidebar.classList.toggle("overlay");
    } else if (event.key === "Escape") {
      collapseSidebar();
    }
  });

  document.addEventListener("focusin", (event) => {
    // Check if the element that received focus is an iframe
    if (event.target.tagName === "IFRAME") {
      collapseSidebar();
    }
  });

  window.addEventListener("message", (event) => {
    // Security: Always verify the origin of the message
    if (event.origin !== window.location.origin) {
      return;
    }
    // Check for the specific command to toggle the sidebar
    if (event.data?.command === "toggleSidebar") {
      event.preventDefault();
      toggleHamburgerMenu();
    }
    if (event.data?.command === "collapseSidebar") {
      event.preventDefault();
      collapseSidebar();
    }
  });
}
