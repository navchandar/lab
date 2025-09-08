import {
  isDomElement,
  isUnstable,
  getTagOf,
  stableAttrPairs,
  AttributeWhitelist,
  AttributeBlacklist,
  xpathString,
  getIndexOfTag,
  cssEscape,
  evaluateXpath,
  CssMatch,
  isUnique,
} from "./locator_helper.js";

/**
 * copy given text from elementId when button is clicked
 */
function copyToClipboard(elementId, button) {
  const input = document.getElementById(elementId);
  const value = input.value.trim();

  if (!value) {
    console.warn("Nothing to copy: input is empty.");
    if (button) {
      button.textContent = "Empty!";
      button.classList.add("warning");
      setTimeout(() => {
        button.textContent = "Copy";
        button.classList.remove("warning");
      }, 2000);
    }
    return;
  }

  navigator.clipboard
    .writeText(value)
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

// Add listeners to the copy buttons
function updateButtons() {
  document.querySelectorAll(".locator-row").forEach((container) => {
    const button = container.querySelector(".copy-btn");
    const inputEl = container.querySelector("[type='text']");
    const inputId = inputEl.id;

    button.addEventListener("click", function () {
      copyToClipboard(inputId, this);
    });
  });
}

function cleanInputs() {
  // clear previously selected locators
  document.getElementById("cssSelector").value = "";
  document.getElementById("xpathSelector").value = "";
  document.getElementById("idSelector").value = "";
}

/**
 * Function to sanitize styles affecting mouse hover and click behavior
 * Read given HTML string and return cleaned HTML string
 */
function sanitizeHTML(htmlString) {
  // Create a temporary DOM container
  const container = document.createElement("div");
  container.innerHTML = htmlString;

  // Remove inline styles that affect interactivity
  container.querySelectorAll("[style]").forEach((el) => {
    const style = el.getAttribute("style");
    const sanitizedStyle = style
      .split(";")
      .filter((rule) => {
        const prop = rule.trim().split(":")[0]?.trim().toLowerCase();
        return ![
          "pointer-events",
          "z-index",
          "opacity",
          "visibility",
          // "display",
          "position",
          "clip",
          "overflow",
        ].includes(prop);
      })
      .join(";");
    if (sanitizedStyle) {
      el.setAttribute("style", sanitizedStyle);
    }
  });

  // Remove <style> tags that contain problematic rules
  container.querySelectorAll("style").forEach((styleTag) => {
    const cssText = styleTag.textContent;
    if (
      /pointer-events|clip|opacity|visibility|display\s*:\s*none|position\s*:\s*absolute/.test(
        cssText
      )
    ) {
      styleTag.remove();
    }
  });

  //target SVGs to ensure they have proper sizing
  container.querySelectorAll("svg").forEach((svg) => {
    svg.setAttribute("width", "20px");
    svg.setAttribute("height", "20px");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    // Optionally add a default viewBox if missing
    if (!svg.hasAttribute("viewBox")) {
      svg.setAttribute("viewBox", "0 0 20 20");
    }
  });

  return container.innerHTML;
}

/**
 * Calculates a stable and efficient XPath for a given DOM element.
 * Prioritizes ID-based paths and avoids overly specific indexing when possible.
 * The algorithm follows these steps in order:
 * 1.  **ID-based XPath**: If the element has a stable ID, use it (`//*[@id='...']`).
 * 2.  **Indexed ID-based XPath**: If the ID is not unique, use an index (`(//*[@id='...'])[n]`).
 * 3.  **Attribute-based XPath**: If no ID, use other stable, whitelisted attributes (`//tag[@attr='...']`).
 * 4.  **Indexed Attribute-based XPath**: If the attribute locator is not unique, use an index.
 * 5.  **Relative XPath from Stable Ancestor**: Traverse up the DOM to find an ancestor with a stable ID or attribute.
 * It then builds a precise path from that ancestor to the target element. It stops searching upwards as soon as an ancestor with an ID is found.
 * 6.  **Absolute XPath**: As a final fallback, it generates the full, absolute XPath from the root of the document.
 * @param {Element} el - The DOM element to generate XPath for.
 * @returns {string} - The XPath string.
 */
function getXPath(el, options = {}) {
  // Step 1: Validate the input
  if (!isDomElement(el)) {
    console.error("Target must be a DOM Element");
    return;
  }

  // Step 2: Initialize configuration
  const cfg = {
    root: el.ownerDocument,
    maxDepth: 8, // how far we search for anchors
    maxLeafPredicates: 2, // combine at most N predicates on the leaf
    allowIndexOnAncestors: false,
    allowIndexOnLeaf: true,
    preferShort: true,
    useText: false,
    textMaxLen: 40,
    classLimit: 2,

    // Attributes considered "stable" (ordered by preference).
    attrWhitelist: AttributeWhitelist,

    // Avoid using classes/ids/values that are auto-generated or volatile
    unstableMatchers: AttributeBlacklist,

    ...options,
  };
  const doc = cfg.root;

  // ## Helper Functions ##
  /**
   * Finds the 1-based index of an element within an array of nodes.
   * @param {Node[]} nodes - The array of nodes to search within.
   * @param {Node} element - The element to find.
   * @returns {number} The 1-based index, or 0 if not found.
   */
  const findIndex = (nodes, element) => {
    const index = nodes.findIndex((node) => node === element);
    return index !== -1 ? index + 1 : 0;
  };

  /**
   * Tests a candidate XPath. If it uniquely identifies the target element, it's returned.
   * If it matches multiple elements, it attempts to create an indexed XPath.
   * @param {string} xpath - The candidate XPath.
   * @returns {string|null} The valid XPath or null.
   */
  const testCandidate = (xpath) => {
    const nodes = evaluateXpath(xpath);
    if (nodes.length === 1 && nodes[0] === el) {
      return xpath; // Uniquely found
    }
    if (nodes.length > 1) {
      const index = findIndex(nodes, el);
      if (index > 0) {
        const indexedXpath = `(${xpath})[${index}]`;
        if (evaluateXpath(indexedXpath)[0] === el) {
          return indexedXpath; // Found with index
        }
      }
    }
    return null;
  };

  // ## XPath Generation Algorithm ##

  // **Step 1: Check for ID on the element itself**
  const id = el.getAttribute("id");
  if (id && !isUnstable(id, cfg.unstableMatchers)) {
    const idXpath = `//*[@id=${xpathString(id)}]`;
    const result = testCandidate(idXpath);
    if (result) {
      console.log("XPath found using element's ID:", result);
      return result;
    }
  }

  // **Step 2: Check for other stable whitelisted properties on the element**
  const attrs = stableAttrPairs(el, cfg).filter(([key]) => key !== "id");
  if (attrs.length > 0) {
    const tag = getTagOf(el) || "*";
    for (const [key, value] of attrs) {
      const attrXpath = `//${tag}[@${key}=${xpathString(value)}]`;
      const result = testCandidate(attrXpath);
      if (result) {
        console.log(`XPath found using element's attribute [${key}]:`, result);
        return result;
      }
    }
  }

  // **Step 3: Traverse up the DOM, looking for a stable parent to create a relative XPath**
  let pathFromAncestor = "";
  let current = el;

  while (
    current &&
    current.parentElement &&
    current.parentElement.nodeType === Node.ELEMENT_NODE
  ) {
    const parent = current.parentElement;
    const tag = getTagOf(current);
    const index = getIndexOfTag(current);
    pathFromAncestor = `/${tag}[${index}]` + pathFromAncestor;

    // **Priority 1: Parent with an ID**
    const parentId = parent.getAttribute("id");
    if (parentId && !isUnstable(parentId, cfg.unstableMatchers)) {
      const anchorXpath = `//*[@id=${xpathString(parentId)}]`;
      const candidate = anchorXpath + pathFromAncestor;
      const result = testCandidate(candidate);
      if (result) {
        console.log(
          `XPath found using relative path from an ancestor with ID [${parentId}]:`,
          result
        );
        return result;
      }
      break; // Stop ascending if an ID is found, as it's the most stable anchor.
    }

    // **Priority 2: Parent with other stable attributes**
    const parentAttrs = stableAttrPairs(parent, cfg).filter(
      ([key]) => key !== "id"
    );
    if (parentAttrs.length > 0) {
      const parentTag = getTagOf(parent) || "*";
      for (const [key, value] of parentAttrs) {
        const anchorXpath = `//${parentTag}[@${key}=${xpathString(value)}]`;
        const candidate = anchorXpath + pathFromAncestor;
        const result = testCandidate(candidate);
        if (result) {
          console.log(
            `XPath found using relative path from an ancestor with attribute [${key}]:`,
            result
          );
          return result;
        }
      }
    }
    current = parent;
    if (current === doc.documentElement) {
      break;
    }
  }

  // **Step 4: Fallback to an optimized, short absolute XPath**
  console.log(
    "No stable unique locator found. Falling back to optimized absolute XPath generation..."
  );
  const buildOptimizedAbsolute = (node) => {
    let segments = [];
    let current = node;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      const tag = getTagOf(current);
      const index = getIndexOfTag(current);
      segments.unshift({ tag, index });

      // Attempt 1: Path with tags only (e.g., //div/p)
      const tagsOnlyPath = "//" + segments.map((s) => s.tag).join("/");
      let result = testCandidate(tagsOnlyPath);
      if (result) {
        console.log("Found optimized absolute XPath (tags only):", result);
        return result;
      }

      // Attempt 2: Path with an index on the leaf element only (e.g., //div/p[1])
      if (segments.length > 1) {
        const segmentsForIndexedLeaf = segments.map((s) => s.tag);
        segmentsForIndexedLeaf[segments.length - 1] += `[${
          segments[segments.length - 1].index
        }]`;
        const indexedLeafPath = "//" + segmentsForIndexedLeaf.join("/");
        result = testCandidate(indexedLeafPath);
        if (result) {
          console.log("Found optimized absolute XPath (indexed leaf):", result);
          return result;
        }
      }

      if (
        !current.parentElement ||
        current.parentElement.nodeType !== Node.ELEMENT_NODE
      ) {
        break;
      }
      current = current.parentElement;
    }

    // Attempt 3: As a last resort, build the full indexed path
    const fullIndexedPath =
      "/" + segments.map((s) => `${s.tag}[${s.index}]`).join("/");
    console.log("Fallback to full indexed path:", fullIndexedPath);
    return fullIndexedPath;
  };

  return buildOptimizedAbsolute(el);
}

/**
 * Generates a maintainable CSS selector for a given DOM element.
 * Prioritizes ID-based selectors and builds a path using tag and class names.
 *
 * @param {Element} el - The DOM element to generate a selector for.
 * @returns {string} - The CSS selector string.
 */
function getCssSelector(el, options = {}) {
  // Step 1: Validate the input
  if (!isDomElement(el)) {
    console.error("Target must be a DOM Element");
    return;
  }

  // Step 2: Initialize configuration
  const cfg = {
    root: el.ownerDocument,
    maxDepth: 5,
    classLimit: 3,
    preferShort: true,
    useId: true,

    // Attributes considered "stable" (ordered by preference).
    attrWhitelist: AttributeWhitelist,

    // Avoid using classes/ids/values that are auto-generated or volatile
    unstableMatchers: AttributeBlacklist,
    ...options,
  };

  const d = cfg.root;

  // Step 3: Define utility functions
  const uniqueId = (node) => {
    if (!cfg.useId || !node.getAttribute) {
      return null;
    }
    const id = node.getAttribute("id");
    if (!id || isUnstable(id, cfg.unstableMatchers)) {
      return null;
    }
    const found = d.getElementById ? d.getElementById(id) : null;
    return found === node ? id : null;
  };

  const classSelectors = (node) => {
    if (!node.classList || node.classList.length === 0) {
      return [];
    }
    return Array.from(node.classList)
      .filter((c) => !isUnstable(c, cfg.unstableMatchers))
      .slice(0, cfg.classLimit)
      .map((c) => "." + cssEscape(c));
  };

  // Build candidate fragments for this node, from strongest to weakest
  const nodeCandidates = (node) => {
    const tag = getTagOf(node);
    const id = uniqueId(node);
    const attrs = stableAttrPairs(node, cfg);
    const classes = classSelectors(node);
    const candidates = [];

    if (id) {
      candidates.push(`#${cssEscape(id)}`);
    }
    // Attribute-only (strong) candidates
    for (const [k, v] of attrs) {
      candidates.push(`[${k}="${v}"]`);
    }
    // tag + attribute
    for (const [k, v] of attrs) {
      candidates.push(`${tag}[${k}="${v}"]`);
    }
    // tag + classes (avoid too many classes)
    if (classes.length) {
      candidates.push(tag + classes.join(""));
    }
    // bare tag
    if (tag) {
      candidates.push(tag);
    }
    // Finally, tag:nth-of-type(n)
    if (tag) {
      candidates.push(`${tag}:nth-of-type(${getIndexOfTag(node)})`);
    }

    console.log("Generated candidates for node:", candidates);

    return candidates;
  };

  // Step 4: Try to build a unique selector from bottom-up
  const path = [];
  let cur = el;
  let depth = 0;

  while (cur && cur.nodeType === 1 && depth <= cfg.maxDepth) {
    const parts = nodeCandidates(cur);
    const accumulated = path.length ? " > " + path.join(" > ") : "";
    const sorted = cfg.preferShort
      ? parts.slice().sort((a, b) => a.length - b.length)
      : parts;

    for (const p of sorted) {
      const cand = p + accumulated;
      if (isUnique(cand, d, "CSS") && CssMatch(cand, el, d)) {
        console.log("Unique selector found (bottom-up):", cand);
        return cand;
      }
    }

    // If nothing unique, fix the strongest for this level and climb
    path.unshift(parts[0]);
    cur = cur.parentElement;
    depth++;
  }

  // Step 5: Fallback to absolute path using nth-of-type
  const absolute = [];
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const tag = getTagOf(n) || "*";
    const nth = `${tag}:nth-of-type(${getIndexOfTag(n)})`;
    absolute.unshift(nth);
    const sel = absolute.join(" > ");
    if (isUnique(sel, d, "CSS") && CssMatch(sel, el, d)) {
      console.log("Unique selector found (absolute path):", sel);
      return sel;
    }
  }

  // Step 6: Final fallback
  const fallback = path.join(" > ");
  console.warn("Returning fallback selector:", fallback);
  return fallback;
}

/**
 * Highlights elements in the iframe on mouse hover.
 */
function highlightElement(element, iframe) {
  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
  const iframeWin = iframe.contentWindow;

  // Remove any existing highlight box
  const existingHighlights = iframeDoc.querySelectorAll(".highlight-box");
  existingHighlights.forEach((el) => el.remove());

  // Create a new highlight box
  const highlight = iframeDoc.createElement("div");
  highlight.className = "highlight-box";

  // Get bounding box of the element
  const rect = element.getBoundingClientRect();
  const scrollTop = iframeWin.scrollY;
  const scrollLeft = iframeWin.scrollX;

  // Style the highlight box to overlay the element
  highlight.style.position = "absolute";
  highlight.style.border = "2px dashed red";
  highlight.style.pointerEvents = "none";
  highlight.style.zIndex = "9999";
  highlight.style.top = `${rect.top + scrollTop}px`;
  highlight.style.left = `${rect.left + scrollLeft}px`;
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
  const win = doc.defaultView;

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

  if (matches.length <= 1) {
    return;
  }

  matches.forEach((el) => {
    const rect = el.getBoundingClientRect();
    const scrollTop = win.scrollY;
    const scrollLeft = win.scrollX;

    const highlight = doc.createElement("div");
    highlight.className = "duplicate-highlight";
    highlight.style.position = "absolute";
    highlight.style.border = "2px dashed orange";
    highlight.style.pointerEvents = "none";
    highlight.style.zIndex = "9998";
    highlight.style.top = `${rect.top + scrollTop}px`;
    highlight.style.left = `${rect.left + scrollLeft}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;

    doc.body.appendChild(highlight);
  });
}

function validateID(id, doc, clickedElement) {
  if (!id) {
    return "⚠️ ID not found";
  }
  if (id === "⚠️ ID not found") {
    return id;
  }

  const matches = doc.querySelectorAll(`#${id}`);
  if (matches.length === 1) {
    return `${id}`;
  } else if (matches.length === 0) {
    return `⚠️ ID not found`;
  } else {
    highlightDuplicates(id, doc, clickedElement, "ID");
    return `${id} ⚠️ Multiple elements share this ID`;
  }
}

function updateSelectors(element) {
  const iframe = document.getElementById("renderFrame");
  const doc = iframe.contentDocument || iframe.contentWindow.document;

  // Generate locators
  let cssSelector = getCssSelector(element);
  let xpathSelector = getXPath(element);
  let idSelector = element.id || "⚠️ ID not found";

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
    const cleanedHtml = sanitizeHTML(html);
    doc.write(cleanedHtml);
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
      // Hide render button
      renderBtn.style.display = "none";
      cleanInputs();
    }
  });
}

// Initalize setup
window.onload = cleanInputs;
updateButtons();
setupIframe();
