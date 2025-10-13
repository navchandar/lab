const BASE_PATH = "/lab/";
const swPath = `${BASE_PATH}service-worker.js`;
let iframeBodyObserver = null;

// --- DOM elements ---
const sidebar = document.getElementById("sidebar");
const hamburger = document.getElementById("hamburger-menu");
const header = document.querySelector("body header");
const iframe = document.getElementById("appFrame");

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

function updateThemeColorFromIframe() {
  const iframe = document.getElementById("appFrame");
  if (!iframe) {
    console.error("Iframe not found.");
    return;
  }

  try {
    // Access the content document of the iframe
    const iframeDocument = iframe.contentWindow.document;

    // Get the computed background-color style of the iframe's body
    // Note: We use getComputedStyle to get the *actual* applied style
    const iframeBody = iframeDocument.body;
    const computedStyle = window.getComputedStyle(iframeBody);
    const backgroundColor = computedStyle
      .getPropertyValue("background-color")
      .trim();

    // Check if a color was successfully retrieved
    if (backgroundColor) {
      // Find or create the meta theme-color tag in the main document
      let themeMetaTag = document.querySelector('meta[name="theme-color"]');
      if (!themeMetaTag) {
        themeMetaTag = document.createElement("meta");
        themeMetaTag.name = "theme-color";
        document.head.appendChild(themeMetaTag);
        console.log("Created new meta theme-color tag.");
        themeMetaTag.content = backgroundColor;
        console.log(`Initialized theme color to: ${backgroundColor}`);
        return;
      }

      // Get the current color from the existing tag and compare
      const currentThemeColor = themeMetaTag.content.trim();
      if (currentThemeColor !== backgroundColor) {
        themeMetaTag.content = backgroundColor;
        console.log(`Updated theme color to: ${backgroundColor}`);
      }
    } else {
      console.warn("Could not retrieve background-color from iframe body.");
    }
  } catch (e) {
    console.error(
      "Error accessing iframe content. Check for Same-Origin restrictions.",
      e
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

  // Schedule update AFTER iframe click handlers complete (next tick)
  const scheduleUpdate = (() => {
    let scheduled = false;
    return () => {
      if (scheduled) {
        return;
      }
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        updateThemeColorFromIframe();
      }, 0);
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
        e
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
  const links = document.querySelectorAll("#app-links li a");
  let targetSrc = null;

  // The browser has already updated the URL and hash when popstate fires.
  // We must now read the new URL's hash to determine the content.
  const hashPath = getNormalizedHashPath();
  targetSrc = hashPath ? toCanonicalRoute(hashPath) : null;
  if (!targetSrc) {
    iframe.setAttribute("src", "");
    uncollapseSidebar();
    links.forEach((l) => l.parentElement.classList.remove("active"));
    return;
  }

  if (iframe.getAttribute("src") !== targetSrc) {
    safeSetIframeSrc(targetSrc);
    const activeKey = targetSrc.replace(BASE_PATH, "").replace(/^\//, "");
    links.forEach((l) => {
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
  if (current === src) {
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
};

/**
 * Uncollapses the sidebar and shows the header.
 */
const uncollapseSidebar = () => {
  console.log("Uncollapsing sidebar and showing header.");

  sidebar.classList.remove("collapsed");
  sidebar.classList.add("overlay");

  if (header) {
    header.style.display = "block";
    sidebar.style.paddingTop = "0em";
  }
};

function initializeAppUI() {
  const iframe = document.getElementById("appFrame");
  const sidebar = document.getElementById("sidebar");
  const hamburger = document.getElementById("hamburger-menu");
  const links = document.querySelectorAll("#app-links li a");

  window.addEventListener("popstate", handlePopState);
  window.addEventListener("hashchange", handlePopState);

  const initialHashPath = getNormalizedHashPath();
  const initialIframeSrc = initialHashPath
    ? toCanonicalRoute(initialHashPath)
    : "";

  // Store initial state but do not modify the URL at all:
  history.replaceState({ iframeSrc: initialIframeSrc }, document.title);
  // Initialize theme sync once at startup
  monitorIframeBackgroundColor();

  iframe.addEventListener("load", collapseSidebar);
  iframe.addEventListener("error", () => {
    console.error("Iframe failed to load:", iframe.getAttribute("src"));
  });

  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      collapseSidebar();

      const href = toCanonicalRoute(link.getAttribute("href"));
      const title = link.getAttribute("title") || link.textContent;

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
        history.replaceState({ iframeSrc: href }, title);
      }

      links.forEach((l) => l.parentElement.classList.remove("active"));
      link.parentElement.classList.add("active");

      setTimeout(() => {
        iframe.focus();
        iframe.dataset.themeSyncInit = 0;
      }, 300);
    });
  });

  // Toggle sidebar on hamburger click
  hamburger.addEventListener("click", () => {
    sidebar.classList.toggle("overlay");
    sidebar.classList.toggle("collapsed");
  });

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
}
