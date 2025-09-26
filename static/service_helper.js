const swPath = "/lab/service-worker.js";
let newWorker;

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    console.warn("Service workers are not supported in this browser");
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(swPath, { scope: "/lab/" })
      .then((registration) => {
        console.log(
          "✅ Service Worker registered with scope:",
          registration.scope
        );
        handleServiceWorkerUpdates(registration);
      })
      .catch((error) => {
        console.error("❌ Service Worker registration failed:", error);
      });

    setupRefreshButton();
    listenForControllerChange();
  });
}

function handleHeaderDisplay() {
  document.addEventListener("DOMContentLoaded", () => {
    const appLinks = document.querySelectorAll('nav a[target="appFrame"]');
    const header = document.querySelector("body header");
    const iframe = document.querySelector('iframe[name="appFrame"]');

    appLinks.forEach((link) => {
      link.addEventListener("click", () => {
        if (header) {
          header.style.display = "none";
        }
      });
      if (iframe) {
        setTimeout(() => {
          iframe.focus();
        }, 300);
      }
    });
  });
}

function handleServiceWorkerUpdates(registration) {
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

        const update = document.getElementById("update-notification");
        if (update) {
          update.style.display = "block";
        }
      }
    });
  });
}

function setupRefreshButton() {
  const refreshButton = document.getElementById("refresh-button");
  if (refreshButton) {
    refreshButton.addEventListener("click", () => {
      if (newWorker) {
        newWorker.postMessage({ action: "skipWaiting" });
      }
    });
  }
}

function listenForControllerChange() {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });
}

handleHeaderDisplay();
registerServiceWorker();
