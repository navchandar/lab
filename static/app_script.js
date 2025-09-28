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

      sidebar.classList.add("collapsed");
      hamburger.style.display = "block";

      if (header) {
        header.style.display = "none";
      }

      links.forEach((l) => l.parentElement.classList.remove("active"));
      link.parentElement.classList.add("active");

      setTimeout(() => iframe.focus(), 300);
    });
  });

  hamburger.addEventListener("click", () => {
    sidebar.classList.toggle("overlay");
  });

  iframe.addEventListener("load", () => {
    iframe.focus();
  });
}
