let previousIP = null;
let activeNotification = null;
let lastRefreshTime = new Date();

function showText(elementId, message) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = message;
  } else {
    console.error(`Element with ID ${elementId} not found!`);
  }
}

function updateRefreshTimeDisplay() {
  const now = new Date();
  const seconds = Math.floor((now - lastRefreshTime) / 1000);
  let displayText = "just now";
  // calculdate time difference
  if (seconds < 60) {
    displayText = `${seconds} seconds ago`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    displayText = `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  } else {
    const hours = Math.floor(seconds / 3600);
    displayText = `${hours} hour${hours > 1 ? "s" : ""} ago`;
  }
  // display text in the UI
  showText("last-refresh", `Last refreshed: ${displayText}`);
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
  updateRefreshTimeDisplay();
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
  } catch (e) {
    console.warn(`Primary IP fetch failed for ${elementId}:`, e);
    try {
      const fallbackIP = await fetchValidIPAddress(fallbackUrl, ipVersion);
      updateIPAddressDisplay(fallbackIP, elementId);
    } catch (f) {
      console.error(`Fallback IP fetch failed for ${elementId}:`, f);
      showText(elementId, "Error fetching IP");
    }
  }
}

async function fetchValidIPAddress(url, ipVersion) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const ip = (await response.text()).trim();

    if (!isIPAddressValid(ip, ipVersion)) {
      console.error(`Invalid ${ipVersion} format: ${ip}`);
      throw new Error(`Invalid ${ipVersion} format: ${ip}`);
    }

    return ip;
  } catch (error) {
    console.error("Failed to fetch a valid IP address:", error);
    throw error;
  }
}

function isIPAddressValid(ip, version) {
  const ipv4Pattern = /^(?:\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Pattern = /^(?:\d{1,3}\.){3}\d{1,3}|[a-fA-F0-9:]+$/;
  return version === "IPv4" ? ipv4Pattern.test(ip) : ipv6Pattern.test(ip);
}

function updateIPAddressDisplay(ip, elementId) {
  const ipElement = document.getElementById(elementId);
  const spinnerElement = document.getElementById(`spinner-${elementId}`);
  // Hide spinner
  if (spinnerElement) {
    spinnerElement.style.opacity = 0;
    setTimeout(() => {
      spinnerElement.style.display = "none";
      // update the IP content
      ipElement.textContent = ip;
    }, 200);
  } else {
    // Fallback if spinner doesn't exist
    ipElement.textContent = ip;
  }

  if (elementId === "ip1") {
    if (previousIP && previousIP !== ip) {
      notifyIPChange(previousIP, ip);
    }
    previousIP = ip;
  }
}

function updateButtons() {
  document.querySelectorAll(".ip-container").forEach((container) => {
    const button = container.querySelector(".copy-btn");
    const ipSpan = container.querySelector(".ip-text span:not(.spinner)");
    const ipId = ipSpan.id;

    button.addEventListener("click", function () {
      copyIP(ipId, this);
    });
  });
}

function setupChangeListeners() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      console.log("Tab is active");
      updateRefreshTimeDisplay();
    }
  });

  if (!sessionStorage.getItem("sessionStarted")) {
    sessionStorage.setItem("sessionStarted", "true");
    console.log("Browser/tab just opened");
    refreshIPAddresses();
  }
}

function showSpinnerAndText(elementId, message) {
  const spinner = document.getElementById(`spinner-${elementId}`);
  if (spinner) {
    spinner.style.display = "inline-block";
    spinner.style.opacity = 1;
  }
  if (message) {
    showText(elementId, message);
  }
}

// Network change detection
function setupNetworkListeners() {
  window.addEventListener("online", () => {
    console.log("Network connected. Refreshing IPs...");

    // display spinner
    showSpinnerAndText("ip1", "Network Online");
    showSpinnerAndText("ip2", "Network Online");

    document.title = "IP Finder";
    refreshIPAddresses();
  });

  window.addEventListener("offline", () => {
    console.log("Network disconnected");
    showText("ip1", "Network Offline");
    showText("ip2", "Network Offline");
    document.title = "Network Offline";
  });
}

// Initial setup
refreshIPAddresses();
updateButtons();

// Refresh every 5 minutes
setInterval(refreshIPAddresses, 300000);
// Update the time since last refresh every 30 seconds
setInterval(updateRefreshTimeDisplay, 30000);

setupChangeListeners();
setupNetworkListeners();
requestNotificationPermission();
