const swPath = "/lab/service-worker.js";
let iframeBodyObserver = null;

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
    const backgroundColor = computedStyle.getPropertyValue("background-color");

    iframeBody.addEventListener("click", collapseSidebar);

    // Check if a color was successfully retrieved
    if (backgroundColor) {
      // Find or create the meta theme-color tag in the main document
      let themeMetaTag = document.querySelector('meta[name="theme-color"]');
      if (!themeMetaTag) {
        themeMetaTag = document.createElement("meta");
        themeMetaTag.name = "theme-color";
        document.head.appendChild(themeMetaTag);
        console.log("Created new meta theme-color tag.");
      }
      themeMetaTag.content = backgroundColor.trim();
      console.log(`Updated theme color to: ${backgroundColor}`);
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

// Add this function anywhere in your script.js, outside of other functions.

/**
 * Handles browser navigation (Back/Forward buttons) by checking the history state.
 * @param {PopStateEvent} event The popstate event object.
 */
function handlePopState(event) {
  const iframe = document.getElementById("appFrame");
  const links = document.querySelectorAll("#app-links li a");

  let targetSrc;

  if (event && event.state && event.state.iframeSrc) {
    // If we have a state object pushed by pushState, use its source.
    targetSrc = event.state.iframeSrc;
  } else {
    // If the state is null (e.g., first load or navigating to a manually entered URL)
    const path = window.location.pathname;
    // URLs are structured like: /lab/#app-name.html
    const hash = window.location.hash;
    const match = hash.startsWith("#") ? hash.substring(1) : "";

    targetSrc = match || links[0]?.getAttribute("href") || "";
  }

  if (targetSrc && iframe.getAttribute("src") !== targetSrc) {
    console.log(`PopState: Loading ${targetSrc} in iframe`);
    iframe.setAttribute("src", targetSrc);

    // Update active state in the sidebar
    links.forEach((l) => {
      const isActive = l.getAttribute("href") === targetSrc;
      l.parentElement.classList.toggle("active", isActive);
    });
  }
}

const collapseSidebar = () => {
  const sidebar = document.getElementById("sidebar");
  const hamburger = document.getElementById("hamburger-menu");
  const header = document.querySelector("body header");
  const iframe = document.getElementById("appFrame");
  const iframeSrc = iframe.getAttribute("src");

  // If the iframe's src is empty or null, dont collapse.
  if (!iframeSrc || iframeSrc === "") {
    return;
  }
  if (!iframe.contentWindow) {
    return;
  }

  if (!sidebar.classList.contains("collapsed")) {
    sidebar.classList.add("collapsed");
  }
  if (sidebar.classList.contains("overlay")) {
    sidebar.classList.remove("overlay");
  }
  if (hamburger.style.display !== "block") {
    hamburger.style.display = "block";
  }

  if (header && header.style.display !== "none") {
    header.style.display = "none";
    sidebar.style.paddingTop = "6.75em";
  }
};

function initializeAppUI() {
  const iframe = document.getElementById("appFrame");
  const sidebar = document.getElementById("sidebar");
  const hamburger = document.getElementById("hamburger-menu");
  const links = document.querySelectorAll("#app-links li a");

  // Initialize theme sync once at startup
  monitorIframeBackgroundColor();

  iframe.addEventListener("load", collapseSidebar);

  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      collapseSidebar();
      const href = link.getAttribute("href");
      const title = link.getAttribute("title") || link.textContent;

      // The link is already active and loaded
      if (iframe.getAttribute("src") === href) {
        console.log(`Already loaded ${href} in iframe`);
        return;
      }

      iframe.setAttribute("src", href);
      console.log(`Loading ${href} in iframe`);

      const newState = { iframeSrc: href };
      const newPath = `/lab/#${href}`;

      // Use history.pushState(state, title, url)
      history.pushState(newState, title, newPath);
      console.log(`Pushed state: ${newPath}`);

      links.forEach((l) => l.parentElement.classList.remove("active"));
      link.parentElement.classList.add("active");

      setTimeout(() => {
        iframe.focus();
        iframe.dataset.themeSyncInit = 0;
      }, 300);
    });
  });

  window.addEventListener("popstate", handlePopState);
  handlePopState();

  hamburger.addEventListener("click", () => {
    sidebar.classList.toggle("overlay");
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
