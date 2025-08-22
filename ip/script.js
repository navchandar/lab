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

function showToast(oldIP, newIP) {
  const toast = document.getElementById("ip-toast");
  const message = document.getElementById("ip-toast-message");
  const closeBtn = document.getElementById("ip-toast-close");
  // Update message and show toast
  toast.classList.remove("show");
  message.textContent = `IP changed from ${oldIP} to ${newIP}`;
  console.log(message.textContent);
  toast.classList.add("show");

  // Manual close
  closeBtn.onclick = () => {
    toast.classList.remove("show");
  };
}

function notifyIPChange(previousIP, newIP) {
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
  showToast(previousIP, newIP);
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

async function refreshIPAddresses() {
  await Promise.all([
    retrieveIPAddress({
      primaryUrl: "https://api.ipify.org",
      fallbackUrl: "https://ipv4.icanhazip.com/",
      elementId: "ip1",
      ipVersion: "IPv4",
    }),
    retrieveIPAddress({
      primaryUrl: "https://api64.ipify.org",
      fallbackUrl: "https://ipv6.icanhazip.com/",
      elementId: "ip2",
      ipVersion: "IPv6",
    }),
  ]);

  lastRefreshTime = new Date();
  updateRefreshTimestamp();
}

async function retrieveIPAddress({
  primaryUrl,
  fallbackUrl,
  elementId,
  ipVersion,
}) {
  try {
    const ip = await fetchValidIPAddress(primaryUrl, ipVersion);
    updateIPAddressDisplay(ip, elementId);
  } catch (primaryError) {
    console.warn(`Primary IP fetch failed for ${elementId}:`, primaryError);
    try {
      const fallbackIP = await fetchValidIPAddress(fallbackUrl, ipVersion);
      updateIPAddressDisplay(fallbackIP, elementId);
    } catch (fallbackError) {
      console.error(
        `Fallback IP fetch failed for ${elementId}:`,
        fallbackError
      );
      showIPAddressError(elementId);
    }
  }
}

async function fetchValidIPAddress(url, ipVersion) {
  const response = await fetch(url);
  const ip = (await response.text()).trim();
  if (!isIPAddressValid(ip, ipVersion)) {
    console.error(`Invalid ${ipVersion} format: ${ip}`);
    throw new Error(`Invalid ${ipVersion} format: ${ip}`);
  }
  return ip;
}

function isIPAddressValid(ip, version) {
  const ipv4Pattern = /^(?:\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Pattern = /^[a-fA-F0-9:]+$/;
  return version === "IPv4" ? ipv4Pattern.test(ip) : ipv6Pattern.test(ip);
}

function updateIPAddressDisplay(ip, elementId) {
  document.getElementById(elementId).textContent = ip;
  if (elementId === "ip1") {
    if (previousIP && previousIP !== ip) {
      notifyIPAddressChange(previousIP, ip);
    }
    previousIP = ip;
  }
}

function showIPAddressError(elementId) {
  document.getElementById(elementId).textContent = "Error fetching IP";
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
