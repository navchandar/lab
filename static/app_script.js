const swPath = "/lab/service-worker.js";
let newWorker = null;

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
  listenForControllerChange();
}

/**
 * Monitors a service worker registration for available updates.
 * When an update is found and installed, it notifies the user.
 * @param {ServiceWorkerRegistration} registration The service worker registration object.
 */
function monitorServiceWorkerUpdates(registration) {
  registration.addEventListener("updatefound", () => {
    // Use 'const' to properly scope the new worker variable.
    const newWorker = registration.installing;
    if (!newWorker) {
      return;
    }

    newWorker.addEventListener("statechange", () => {
      // Check if the new worker is installed and a controller already exists.
      const isUpdateReady =
        newWorker.state === "installed" && navigator.serviceWorker.controller;

      if (isUpdateReady) {
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
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
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
 * Listens for when the new service worker takes control, then reloads the page.
 */
function listenForControllerChange() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  let isRefreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Prevent potential multiple reloads
    if (isRefreshing) {
      return;
    }
    isRefreshing = true;
    window.location.reload();
  });
}
function updateThemeColorFromIframe() {
  const iframe = document.getElementById("appFrame");

  try {
    // Access the content document of the iframe
    const iframeDocument = iframe.contentWindow.document;

    // Get the computed background-color style of the iframe's body
    // Note: We use getComputedStyle to get the *actual* applied style
    const iframeBody = iframeDocument.body;
    const computedStyle = window.getComputedStyle(iframeBody);
    const backgroundColor = computedStyle.getPropertyValue("background-color");

    // Check if a color was successfully retrieved
    if (backgroundColor) {
      // Find or create the meta theme-color tag in the main document
      let themeMetaTag = document.querySelector('meta[name="theme-color"]');
      if (!themeMetaTag) {
        // Create it if it doesn't exist
        themeMetaTag = document.createElement("meta");
        themeMetaTag.name = "theme-color";
        document.head.appendChild(themeMetaTag);
        console.log("Created new meta theme-color tag.");
      }

      // Set the content attribute to the iframe's body background color
      themeMetaTag.content = backgroundColor;
      console.log(`Updated theme color to: ${backgroundColor}`);
    } else {
      console.warn("Could not retrieve background-color from iframe body.");
    }
  } catch (e) {
    // This catch block will usually handle the Cross-Origin security error
    console.error(
      "Error accessing iframe content. Check for Cross-Origin policy restrictions (CORS).",
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

  // --- 1. Initial Load and Setup ---
  iframe.onload = function () {
    // Run the update once the content is loaded
    updateThemeColorFromIframe();

    try {
      const iframeBody = iframe.contentWindow.document.body;

      // --- 2. Create the MutationObserver ---
      const observer = new MutationObserver(function (mutationsList, observer) {
        // Check if any change was an attribute change on the body
        for (const mutation of mutationsList) {
          if (
            mutation.type === "attributes" &&
            mutation.attributeName === "style"
          ) {
            // The style attribute changed, re-run the update function
            // Wait for the next animation frame to ensure computed styles are ready.
            requestAnimationFrame(updateThemeColorFromIframe);
          }
        }
      });

      // --- 3. Configuration and Start Observing ---
      const config = {
        attributes: true, // Watch for attribute changes
        attributeFilter: ["style"], // Only care about the 'style' attribute
        subtree: false, // Don't watch children, just the body itself
      };

      // Start observing the iframe's body element
      observer.observe(iframeBody, config);
      console.log("MutationObserver started on iframe body.");
    } catch (e) {
      console.error(
        "Cannot set up MutationObserver due to Same-Origin Policy. The iframe content is likely cross-origin.",
        e
      );
    }
  };
}

function initializeAppUI() {
  const iframe = document.getElementById("appFrame");
  const sidebar = document.getElementById("sidebar");
  const hamburger = document.getElementById("hamburger-menu");
  const header = document.querySelector("body header");
  const links = document.querySelectorAll("#app-links li a");

  // Function to collapse the hamburger menu/sidebar
  const collapseSidebar = () => {
    sidebar.classList.remove("overlay");
    sidebar.classList.add("collapsed");
    hamburger.style.display = "block";
    if (header) {
      header.style.display = "none";
    }
    monitorIframeBackgroundColor();
  };

  iframe.addEventListener("load", collapseSidebar);

  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      collapseSidebar();
      const href = link.getAttribute("href");

      // The link is already active and loaded
      if (iframe.getAttribute("src") === href) {
        return;
      }

      iframe.setAttribute("src", href);

      links.forEach((l) => l.parentElement.classList.remove("active"));
      link.parentElement.classList.add("active");

      setTimeout(() => {
        iframe.focus();
      }, 300);
    });
  });

  hamburger.addEventListener("click", () => {
    sidebar.classList.toggle("overlay");
  });
}
