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

function monitorServiceWorkerUpdates(registration) {
  registration.addEventListener("updatefound", () => {
    newWorker = registration.installing;

    newWorker.addEventListener("statechange", () => {
      if (
        newWorker.state === "installed" &&
        navigator.serviceWorker.controller
      ) {
        // vibrate slightly if updates found
        if (navigator.vibrate) {
          navigator.vibrate(100);
        }
        const updateBanner = document.getElementById("update-notification");
        if (updateBanner) {
          updateBanner.style.display = "block";
        }
      }
    });
  });
}

function setupUpdateNotification() {
  const html = `
    <div id="update-notification" role="alert">
      <span>A new version is available!</span>
      <button id="refresh-button">Refresh</button>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", html);

  const refreshButton = document.getElementById("refresh-button");
  refreshButton?.addEventListener("click", () => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.waiting) {
          const worker = newWorker || reg.waiting;
          worker.postMessage({ type: "SKIP_WAITING" });
        } else {
          window.location.reload();
        }
      });
    } else {
      window.location.reload();
    }
  });
}

function listenForControllerChange() {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
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
      let appContainer = document.querySelector("#app-container");

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

      if (appContainer) {
        appContainer.style.backgroundColor = backgroundColor;
      }
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
            updateThemeColorFromIframe();
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

  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const href = link.getAttribute("href");
      iframe.setAttribute("src", href);

      sidebar.classList.remove("overlay");
      sidebar.classList.add("collapsed");
      hamburger.style.display = "block";

      if (header) {
        header.style.display = "none";
      }

      links.forEach((l) => l.parentElement.classList.remove("active"));
      link.parentElement.classList.add("active");

      setTimeout(() => {
        monitorIframeBackgroundColor();
        iframe.focus();
      }, 300);
    });
  });

  hamburger.addEventListener("click", () => {
    sidebar.classList.toggle("overlay");
  });

  iframe.addEventListener("load", () => {
    iframe.focus();
  });
}
