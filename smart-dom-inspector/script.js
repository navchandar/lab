function copyToClipboard(id) {
  const input = document.getElementById(id);
  navigator.clipboard
    .writeText(input.value)
    .then(() => {
      console.log("Copied to clipboard!");
    })
    .catch((err) => {
      console.error("Failed to copy: ", err);
    });
}

/**
 * Generates a simplified and maintainable XPath for a given DOM element.
 * Prioritizes ID-based paths and avoids overly specific indexing when possible.
 *
 * @param {Element} element - The DOM element to generate XPath for.
 * @returns {string} - The XPath string.
 */
function getXPath(element) {
  // If the element has an ID, return a direct XPath using it
  if (element.id) {
    return `//*[@id="${element.id}"]`;
  }

  const parts = [];

  // Traverse up the DOM tree until the root
  while (element && element.nodeType === Node.ELEMENT_NODE) {
    let index = 1;
    let sibling = element.previousElementSibling;

    // Count how many previous siblings share the same tag name
    while (sibling) {
      if (sibling.nodeName === element.nodeName) {
        index++;
      }
      sibling = sibling.previousElementSibling;
    }

    const tagName = element.nodeName.toLowerCase();

    // Only include index if there are multiple siblings with the same tag
    const hasSameTagSiblings =
      element.nextElementSibling &&
      element.nextElementSibling.nodeName === element.nodeName;

    const part =
      index > 1 || hasSameTagSiblings ? `${tagName}[${index}]` : tagName;

    parts.unshift(part); // Add to the beginning of the path
    element = element.parentNode; // Move up the DOM tree
  }

  // Join all parts with slashes to form the full XPath
  return "/" + parts.join("/");
}
/**
 * Generates a maintainable CSS selector for a given DOM element.
 * Prioritizes ID-based selectors and builds a path using tag and class names.
 *
 * @param {Element} element - The DOM element to generate a selector for.
 * @returns {string} - The CSS selector string.
 */
function getCSSSelector(element) {
  // If the element has an ID, return a direct and unique selector
  if (element.id) {
    return `#${element.id}`;
  }

  const path = [];

  // Traverse up the DOM tree to build the selector path
  while (element && element.nodeType === Node.ELEMENT_NODE) {
    let selector = element.nodeName.toLowerCase(); // Use lowercase tag name

    // Add class names if they exist and are meaningful
    if (element.className && typeof element.className === "string") {
      const classList = element.className
        .trim()
        .split(/\s+/)
        .filter((cls) => cls && !cls.startsWith("ng-") && !cls.match(/^jsx-/)); // Filter out framework-specific or empty classes

      if (classList.length > 0) {
        selector += "." + classList.join(".");
      }
    }

    path.unshift(selector); // Add to the beginning of the path
    element = element.parentElement; // Move up the DOM tree
  }

  // Join the path with ' > ' to form a full CSS selector
  return path.join(" > ");
}

function updateSelectors(element) {
  document.getElementById("cssSelector").value = getCSSSelector(element);
  document.getElementById("xpathSelector").value = getXPath(element);
  document.getElementById("idSelector").value = element.id || "N/A";
}

function highlightElement(element, iframe) {
  const rect = element.getBoundingClientRect();
  const highlight = document.createElement("div");
  highlight.className = "highlight-box";
  highlight.style.top = rect.top + iframe.offsetTop + "px";
  highlight.style.left = rect.left + iframe.offsetLeft + "px";
  highlight.style.width = rect.width + "px";
  highlight.style.height = rect.height + "px";
  document.body.appendChild(highlight);
  setTimeout(() => highlight.remove(), 2000);
}

function attachListeners(iframe) {
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.body.addEventListener("mouseover", function (e) {
    e.stopPropagation();
    highlightElement(e.target, iframe);
  });
  doc.body.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    updateSelectors(e.target);
  });
}

function renderHTML() {
  const html = document.getElementById("htmlInput").value;
  const iframe = document.getElementById("renderFrame");
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => attachListeners(iframe), 500);
}

const renderBtn = document.getElementById("renderBtn");

document.getElementById("htmlInput").addEventListener("input", function () {
  const content = this.value;

  // If the content is large (more than 1000 characters)
  if (content.length > 1000) {
    // Show the "Render" button
    renderBtn.style.display = "inline-block";
  } else {
    // Hide the button and render immediately
    renderBtn.style.display = "none";
    renderHTML();
  }
});

renderBtn.addEventListener("click", renderHTML);
