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

function highlightElement(element, iframe) {
  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

  // Remove any existing highlight box
  const existingHighlight = iframeDoc.querySelector(".highlight-box");
  if (existingHighlight) {
    existingHighlight.remove();
  }

  // Create a new highlight box
  const highlight = iframeDoc.createElement("div");
  highlight.className = "highlight-box";

  // Get bounding box of the element
  const rect = element.getBoundingClientRect();

  // Style the highlight box to overlay the element
  highlight.style.position = "absolute";
  highlight.style.border = "2px dashed red";
  highlight.style.pointerEvents = "none";
  highlight.style.zIndex = "9999";
  highlight.style.top = `${rect.top + iframeDoc.documentElement.scrollTop}px`;
  highlight.style.left = `${
    rect.left + iframeDoc.documentElement.scrollLeft
  }px`;
  highlight.style.width = `${rect.width}px`;
  highlight.style.height = `${rect.height}px`;

  // Append the highlight box to the iframe's body
  iframeDoc.body.appendChild(highlight);

  // Remove highlight when mouse leaves the element
  element.addEventListener(
    "mouseout",
    () => {
      highlight.remove();
    },
    { once: true }
  );
}

/**
 * Highlights all elements in the iframe that share the same locator.
 * Uses a distinct color and removes previous highlights before applying new ones.
 *
 * @param {string} locator - The locator string (ID, CSS, or XPath).
 * @param {Document} doc - The iframe's document.
 * @param {Element} clickedElement - The element that was clicked.
 * @param {string} type - Type of locator: "ID", "CSS", or "XPATH".
 */
function highlightDuplicates(locator, doc, clickedElement, type) {
  // Remove any existing duplicate highlights
  const existingHighlights = doc.querySelectorAll(".duplicate-highlight");
  existingHighlights.forEach((el) => el.remove());

  if (!locator) return;

  let matches = [];

  try {
    if (type === "ID") {
      matches = doc.querySelectorAll(`#${locator}`);
    } else if (type === "CSS") {
      matches = doc.querySelectorAll(locator);
    } else if (type === "XPATH") {
      const xpathResult = doc.evaluate(
        locator,
        doc,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      for (let i = 0; i < xpathResult.snapshotLength; i++) {
        matches.push(xpathResult.snapshotItem(i));
      }
    }
  } catch (error) {
    console.warn(`Error evaluating ${type} locator:`, error);
    return;
  }

  if (matches.length <= 1) return; // No duplicates to highlight

  matches.forEach((el) => {
    const rect = el.getBoundingClientRect();
    const highlight = doc.createElement("div");
    highlight.className = "duplicate-highlight";
    highlight.style.position = "absolute";
    highlight.style.border = "2px dashed orange";
    highlight.style.pointerEvents = "none";
    highlight.style.zIndex = "9999";
    highlight.style.top = `${rect.top + doc.documentElement.scrollTop}px`;
    highlight.style.left = `${rect.left + doc.documentElement.scrollLeft}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;

    doc.body.appendChild(highlight);
  });
}

function validateID(id, doc, clickedElement) {
  if (!id) return "N/A";

  const matches = doc.querySelectorAll(`#${id}`);
  if (matches.length === 1) {
    return `#${id}`;
  } else if (matches.length === 0) {
    return `ID not found`;
  } else {
    highlightDuplicates(id, doc, clickedElement, "ID");
    return `${id} ⚠️ Multiple elements share this ID`;
  }
}

function updateSelectors(element) {
  const iframe = document.getElementById("renderFrame");
  const doc = iframe.contentDocument || iframe.contentWindow.document;

  // Generate locators
  let cssSelector = getCSSSelector(element);
  let xpathSelector = getXPath(element);
  let idSelector = element.id || "N/A";

  // Validate CSS Selector
  const cssMatches = doc.querySelectorAll(cssSelector);
  if (cssMatches.length === 1) {
    document.getElementById("cssSelector").value = cssSelector;
  } else if (cssMatches.length === 0) {
    document.getElementById("cssSelector").value =
      "⚠️ Valid Locator could not be found";
  } else {
    highlightDuplicates(cssSelector, doc, clickedElement, "CSS");
    // Adjust to uniquely target the clicked element
    cssSelector = `${cssSelector}:nth-of-type(${
      Array.from(cssMatches).indexOf(element) + 1
    })`;
    document.getElementById("cssSelector").value = cssSelector;
  }

  // Validate XPath
  const xpathResult = doc.evaluate(
    xpathSelector,
    doc,
    null,
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
    null
  );
  if (xpathResult.snapshotLength === 1) {
    document.getElementById("xpathSelector").value = xpathSelector;
  } else if (xpathResult.snapshotLength === 0) {
    document.getElementById("xpathSelector").value =
      "⚠️ Valid Locator could not be found";
  } else {
    highlightDuplicates(xpathSelector, doc, clickedElement, "XPATH");
    // Adjust XPath to match the specific element
    const index = Array.from({ length: xpathResult.snapshotLength }, (_, i) =>
      xpathResult.snapshotItem(i)
    ).indexOf(element);

    xpathSelector = `(${xpathSelector})[${index + 1}]`;
    document.getElementById("xpathSelector").value = xpathSelector;
  }

  // ID is usually direct and unique but check for duplicates
  idSelector = validateID(idSelector, doc, element);
  document.getElementById("idSelector").value = idSelector;
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
