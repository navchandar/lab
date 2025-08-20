function fetchIP(url, elementId) {
  fetch(url)
    .then((response) => response.text())
    .then((ip) => {
      document.getElementById(elementId).textContent = ip;
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
      }, 1500);
    })
    .catch(() => {
      button.textContent = "Error!";
      button.classList.add("error");
      setTimeout(() => {
        button.textContent = "Copy";
        button.classList.remove("error");
      }, 1500);
    });
}

function refreshIPs() {
  fetchIP("https://api.ipify.org", "ip1");
  fetchIP("https://api64.ipify.org", "ip2");
}

// Initial fetch
refreshIPs();

// Refresh every 10 minutes (600,000 ms)
setInterval(refreshIPs, 600000);

// Detect network changes
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
