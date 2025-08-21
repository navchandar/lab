let previousIP = null;
let activeNotification = null;
let lastRefreshTime = new Date();

function updateRefreshTimeDisplay() {
  const now = new Date();
  const seconds = Math.floor((now - lastRefreshTime) / 1000);
  let displayText = "just now";

  if (seconds < 60) {
    displayText = `${seconds} seconds ago`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    displayText = `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  } else {
    const hours = Math.floor(seconds / 3600);
    displayText = `${hours} hour${hours > 1 ? "s" : ""} ago`;
  }

  document.getElementById(
    "last-refresh"
  ).textContent = `Last refreshed: ${displayText}`;
}

function requestNotificationPermission() {
  if (Notification.permission !== "granted") {
    Notification.requestPermission();
  }
}

function notifyIPChange(newIP) {
  try {
    // Safely close previous notification if it's still open
    if (activeNotification && typeof activeNotification.close === "function") {
      activeNotification.close();
    }
  } catch (e) {
    console.warn("Error closing previous notification:", e);
  }

  if (Notification.permission === "granted") {
    // Show new notification and store reference
    activeNotification = new Notification("IP Changed", {
      body: `New IP: ${newIP}`,
    });
  }
}

function fetchIP(url, elementId) {
  return fetch(url)
    .then((response) => response.text())
    .then((ip) => {
      document.getElementById(elementId).textContent = ip;

      if (elementId === "ip1") {
        if (previousIP && previousIP !== ip) {
          notifyIPChange(ip);
        }
        previousIP = ip;
      }
    })
    .catch((error) => {
      document.getElementById(elementId).textContent = "Error fetching IP";
      console.error("Fetch error:", error);
    });
}

function copyIP(elementId, button) {
  const ipText = document.getElementById(elementId).textContent;
  navigator.clipboard
    .writeText(ipText)
    .then(() => {
      button.textContent = "Copied!";
      button.classList.add("success");
      setTimeout(() => {
        button.textContent = "Copy";
        button.classList.remove("success");
      }, 2000);
    })
    .catch(() => {
      button.textContent = "Error!";
      button.classList.add("error");
      setTimeout(() => {
        button.textContent = "Copy";
        button.classList.remove("error");
      }, 2000);
    });
}

async function refreshIPs() {
  await Promise.all([
    fetchIP("https://api.ipify.org", "ip1"),
    fetchIP("https://api64.ipify.org", "ip2"),
  ]);

  lastRefreshTime = new Date();
  updateRefreshTimeDisplay();
}

// Initial setup
refreshIPs();
requestNotificationPermission();

// Refresh every 5 minutes
setInterval(refreshIPs, 300000);
// Update the time since last refresh every 30 seconds
setInterval(updateRefreshTimeDisplay, 30000);

// Network change detection
window.addEventListener("online", () => {
  console.log("Network connected. Refreshing IPs...");
  refreshIPs();
  document.title = "Online";
});

window.addEventListener("offline", () => {
  console.log("Network disconnected");
  document.getElementById("ip1").textContent = "Network Offline";
  document.getElementById("ip2").textContent = "Network Offline";
  document.title = "Network Offline";
});
