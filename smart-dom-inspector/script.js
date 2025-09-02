function copyToClipboard(elementId, button) {
  const input = document.getElementById(elementId);
  navigator.clipboard
    .writeText(input.value)
    .then(() => {
      console.log("Copied to clipboard!");
      if (button) {
        button.textContent = "Copied!";
        button.classList.add("success");
        setTimeout(() => {
          button.textContent = "Copy";
          button.classList.remove("success");
        }, 2000);
      }
    })
    .catch((err) => {
      console.error("Failed to copy: ", err);
      if (button) {
        button.textContent = "Error!";
        button.classList.add("error");
        setTimeout(() => {
          button.textContent = "Copy";
          button.classList.remove("error");
        }, 2000);
      }
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
  const path = [];
  const iframe = document.getElementById("renderFrame");

  function isStableID(id) {
    if (!id) {
      return false;
    }
    if (id.match(/^[a-zA-Z]{3,8}$/)) {
      return false;
    }

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    const matches = doc.querySelectorAll(`#${id}`);
    return matches.length === 1;
  }

  if (isStableID(element.id)) {
    return `#${element.id}`;
  }

  // Helper to check if an ID or class is meaningful
  // And avoid short random strings or automated class names
  function isStableIdentifier(value) {
    return (
      value &&
      typeof value === "string" &&
      !value.match(/^(jsname|jsx|ng|gLFyf|data-.*|aria-.*)$/) &&
      !value.match(/^[a-zA-Z]{3,8}$/)
    );
  }

  let stopAt = null;

  // Traverse up to find a stable ancestor
  let current = element;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    if (isStableIdentifier(current.id)) {
      stopAt = current;
      break;
    }

    const classList = current.className?.trim().split(/\s+/) || [];
    const meaningfulClasses = classList.filter((cls) =>
      isStableIdentifier(cls)
    );
    if (meaningfulClasses.length > 0) {
      stopAt = current;
      break;
    }

    current = current.parentElement;
  }

  // Build path from stopAt to element
  let node = element;
  while (node && node !== stopAt && node.nodeType === Node.ELEMENT_NODE) {
    let selector = node.nodeName.toLowerCase();

    const classList = node.className?.trim().split(/\s+/) || [];
    const meaningfulClasses = classList.filter((cls) =>
      isStableIdentifier(cls)
    );
    if (meaningfulClasses.length > 0) {
      selector += "." + meaningfulClasses.join(".");
    }

    path.unshift(selector);
    node = node.parentElement;
  }

  // Add the stable ancestor to the path
  if (stopAt) {
    if (stopAt.id) {
      path.unshift(`#${stopAt.id}`);
    } else {
      let selector = stopAt.nodeName.toLowerCase();
      const classList = stopAt.className?.trim().split(/\s+/) || [];
      const meaningfulClasses = classList.filter((cls) =>
        isStableIdentifier(cls)
      );
      if (meaningfulClasses.length > 0) {
        selector += "." + meaningfulClasses.join(".");
      }
      path.unshift(selector);
    }
  }

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

  if (!locator) {
    return;
  }

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

  // No duplicates to highlight
  if (matches.length <= 1) {
    return;
  }

  matches.forEach((el) => {
    const rect = el.getBoundingClientRect();
    const highlight = doc.createElement("div");
    highlight.className = "duplicate-highlight";
    highlight.style.position = "absolute";
    highlight.style.border = "2px dashed orange";
    highlight.style.pointerEvents = "none";
    highlight.style.zIndex = "9998";
    highlight.style.top = `${rect.top + doc.documentElement.scrollTop}px`;
    highlight.style.left = `${rect.left + doc.documentElement.scrollLeft}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;

    doc.body.appendChild(highlight);
  });
}

function validateID(id, doc, clickedElement) {
  if (!id) {
    return "ID not found";
  }
  if (id === "ID not found") {
    return "ID not found";
  }

  const matches = doc.querySelectorAll(`#${id}`);
  if (matches.length === 1) {
    return `${id}`;
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
  let idSelector = element.id || "ID not found";

  // Validate CSS Selector
  const cssMatches = doc.querySelectorAll(cssSelector);
  if (cssMatches.length === 1) {
    document.getElementById("cssSelector").value = cssSelector;
  } else if (cssMatches.length === 0) {
    document.getElementById("cssSelector").value =
      "⚠️ Valid Locator could not be found";
  } else {
    highlightDuplicates(cssSelector, doc, element, "CSS");
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
    highlightDuplicates(xpathSelector, doc, element, "XPATH");
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

function renderHTML(content = null) {
  const html = document.getElementById("htmlInput").value.trim();
  const iframe = document.getElementById("renderFrame");
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  if (null !== html && html !== "") {
    doc.write(html);
  } else if (
    null !== content &&
    typeof content === "string" &&
    content !== ""
  ) {
    doc.write(content);
  }
  doc.close();
  setTimeout(() => attachListeners(iframe), 500);
}

function setupIframe({
  textareaId = "htmlInput",
  renderBtnId = "renderBtn",
} = {}) {
  const textarea = document.getElementById(textareaId);
  const renderBtn = document.getElementById(renderBtnId);
  renderBtn.addEventListener("click", renderHTML);

  let defaultMessage =
    "Preview will appear here once you paste HTML content. Hover & click on any element to get the locator.";

  let style =
    "font-family:sans-serif; padding:10px; color:#555; font-size:25px; line-height:120%;";

  // Show default message on loadß
  window.addEventListener("load", () => {
    renderHTML(`<p id='preview' style='${style}'>${defaultMessage}</p>`);
  });

  // Clear iframe when user starts typing
  textarea.addEventListener("input", () => {
    const content = textarea.value.trim();
    if (content && content.length > 0) {
      // If the content is large (more than 10000 characters)
      if (content.length > 10000) {
        // Show the "Render" button
        renderBtn.style.display = "inline-block";
      } else {
        // Hide the button and render immediately
        renderBtn.style.display = "none";
        renderHTML();
      }
    } else {
      renderHTML(`<p id='preview' style='${style}'>${defaultMessage}</p>`);
      renderBtn.style.display = "none"; // Hide render button
    }
  });
}

// Initialize the iframe setup
setupIframe();
