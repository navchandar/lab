import {
  isDomElement,
  isUnstable,
  getTagOf,
  stableAttrPairs,
  AttributeWhitelist,
  TagWhitelist,
  AttributeBlacklist,
  xpathString,
  getIndexOfTag,
  cssEscape,
  evaluateXpath,
  CssMatch,
  isUnique,
  scrollElementInIframe,
} from "./locator_helper.js";

/** Display warning in the button if the input is Empty */
function warnEmpty(button, value) {
  const btnText = button.dataset.originalText || "";
  if (!value) {
    console.warn("Input is empty");
    button.textContent = "Empty!";
    button.classList.add("warning");
    setTimeout(() => {
      button.textContent = btnText;
      button.classList.remove("warning");
    }, 2000);
    // Return true if empty
    return true;
  }
  // Return false if not empty
  return false;
}

/**
 * copy given text from elementId when button is clicked
 */
function copyToClipboard(elementId, button) {
  const input = document.getElementById(elementId);
  const value = input.value.trim();
  // Remove previous status classes
  button.classList.remove("success", "error", "warning");
  if (warnEmpty(button, value)) {
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

/**
 * Locate, Scroll element into view and highlighe element within iframe
 */
function testLocator(elementId, button) {
  // Verify if locator is identifying unique element
  const input = document.getElementById(elementId);
  const locator = input.value.trim();

  let element = null;
  let isValidSyntax = true;
  let foundCount = 0;
  let type = null;

  // Remove previous status classes
  button.classList.remove("success", "error", "warning");
  if (warnEmpty(button, locator)) {
    return;
  }

  const iframe = document.getElementById("renderFrame");
  if (!iframe) {
    button.textContent = "Iframe not found";
    button.classList.add("error");
    return;
  }

  const doc = iframe.contentDocument || iframe.contentWindow.document;

  try {
    if (elementId === "cssSelector") {
      type = "CSS";
      const matches = doc.querySelectorAll(locator);
      foundCount = matches.length;
      element = foundCount ? matches[0] : null;
    } else if (elementId === "xpathSelector") {
      type = "XPATH";
      const result = doc.evaluate(
        locator,
        doc,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      foundCount = result.snapshotLength;
      element = foundCount ? result.snapshotItem(0) : null;
    } else if (elementId === "idSelector") {
      type = "ID";
      // Basic ID validation: no spaces
      if (/\s/.test(locator)) {
        throw new Error("Invalid ID syntax");
      }
      const matches = doc.querySelectorAll(`[id="${locator}"]`);
      foundCount = matches.length;
      element = doc.getElementById(locator);
    }
  } catch (e) {
    isValidSyntax = false;
  }

  const originalText = button.dataset.originalText || "Check Locator";
  const resetState = () => {
    button.textContent = originalText;
    button.classList.remove("success", "error", "warning");
  };

  // Add appropriate class based on result
  if (!isValidSyntax) {
    button.textContent = "Invalid locator";
    button.classList.add("error");
  } else if (foundCount === 0) {
    button.textContent = "Not Found!";
    button.classList.add("error");
  } else if (foundCount > 1) {
    button.textContent = `Found ${foundCount}!`;
    button.classList.add("warning");
    try {
      if (element) {
        // Scroll inside the iframe so the element becomes visible
        scrollElementInIframe(element, doc, iframe);
        // Highlight after scrolling to ensure the outline is visible
        highlightDuplicates(locator, doc, element, type);
      }
    } catch (e) {
      console.error(e);
    }
  } else {
    button.textContent = "Found!";
    button.classList.add("success");
    try {
      if (element) {
        // Scroll inside the iframe so the element becomes visible
        scrollElementInIframe(element, doc, iframe);
        // Highlight after scrolling to ensure the outline is visible
        highlightElement(element, iframe, { mode: "once", durationMs: 3000 });
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Remove the class after 3 seconds
  setTimeout(resetState, 3000);
}

// Add listeners to the copy buttons
function updateButtons() {
  document.querySelectorAll(".locator-row").forEach((container) => {
    const inputEl = container.querySelector("[type='text']");
    const inputId = inputEl.id;

    const copyButton = container.querySelector(".copy-btn");
    const testBtn = container.querySelector(".test-btn");

    try {
      copyButton.dataset.originalText = copyButton.textContent;
      copyButton.addEventListener("click", () =>
        copyToClipboard(inputId, copyButton)
      );
    } catch (e) {
      console.error(e);
    }

    try {
      testBtn.dataset.originalText = testBtn.textContent;
      testBtn.addEventListener("click", () => testLocator(inputId, testBtn));
    } catch (e) {
      console.error(e);
    }
  });
}

function cleanInputs() {
  // clear previously selected locators
  try {
    document.getElementById("cssSelector").value = "";
    document.getElementById("xpathSelector").value = "";
    document.getElementById("idSelector").value = "";
    document.querySelectorAll(".copy-btn").forEach((button) => {
      if (button.textContent !== "Copy") {
        button.textContent = "Copy";
        button.classList.remove("success", "error", "warning");
      }
    });
    document.querySelectorAll(".test-btn").forEach((button) => {
      if (button.textContent !== "Check Locator") {
        button.textContent = "Check Locator";
        button.classList.remove("success", "error", "warning");
      }
    });
  } catch (e) {
    console.error(e);
  }
}

/**
 * Sanitize styles and attributes that can interfere with hover/click behavior,
 * with optional hardening against scripts and inline event handlers.
 * *
 * @param {string} htmlString - Third‑party or dynamic HTML string to sanitize.
 * @param {Object} [opts]
 * @param {string[]} [opts.disallowedInlineProps] - CSS properties to remove from inline `style` attributes (case-insensitive).
 * @param {boolean} [opts.removeDisplayNone=false] - If true, remove `display: none` from inline styles and <style> tags.
 * @param {boolean} [opts.scrubEventHandlers=true] - If true, removes attributes that start with "on" (onclick, onmouseover, …).
 * @param {boolean} [opts.stripScripts=true] - If true, removes <script> tags and javascript: URLs from href/src/xlink:href.
 * @returns {string} - Sanitized HTML string.
 */
function sanitizeHTML(htmlString, opts = {}) {
  try {
    const {
      // remove inline properties that can affect with mouse hover/click
      disallowedInlineProps = [
        "pointer-events",
        "z-index",
        "opacity",
        "visibility",
        "position",
        "clip",
        "overflow",
      ],
      removeDisplayNone = false,
      scrubEventHandlers = true,
      stripScripts = true,
      svgSize = { width: 20, height: 20 },
      onlySetSvgSizeIfMissing = false,
    } = opts;

    // Normalize the disallowed property names (lowercase + hyphenated).
    const blockedProps = new Set(
      disallowedInlineProps.map((p) => String(p).trim().toLowerCase())
    );

    // ---- Build a DOM container safely ----
    const container = document.createElement("div");
    container.innerHTML = htmlString;

    // ---- Helper: Escape strings for RegExp construction ----
    const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // ---- (A) Sanitize inline styles: remove problematic properties ----
    // Use the CSSOM API for correctness (avoids brittle string parsing).
    container.querySelectorAll("[style]").forEach((el) => {
      const style = el.style;
      // Collect property names first to avoid index shift during removal.
      const propNames = Array.from({ length: style.length }, (_, i) =>
        style.item(i)
      );

      propNames.forEach((prop) => {
        const lowerProp = prop.toLowerCase();

        // Remove blocked properties
        if (blockedProps.has(lowerProp)) {
          style.removeProperty(prop);
          return;
        }

        // Optionally remove only "display: none"
        if (removeDisplayNone && lowerProp === "display") {
          const val = style.getPropertyValue(prop);
          if (/\bnone\b/i.test(val)) {
            style.removeProperty(prop);
          }
        }
      });

      // If no styles remain, drop the attribute entirely.
      if (style.length === 0) {
        el.removeAttribute("style");
      }
    });

    // ---- (B) Sanitize <style> blocks by removing only offending declarations ----
    // This is a pragmatic approach (regex) that targets declarations without a full CSS parser.
    const basePropPatterns = Array.from(blockedProps).map((prop) => {
      // Matches: [start delimiter]prop: any value;  -> replace with delimiter only
      // Delimiters include start-of-text, ;, {, or whitespace, to avoid accidental partial matches.
      return new RegExp(
        `(^|[;{\\s])${escapeRegExp(prop)}\\s*:\\s*[^;}{]+;?`,
        "gi"
      );
    });

    const extraPatterns = [];
    if (removeDisplayNone) {
      // Remove only display:none (not all display values).
      extraPatterns.push(/(^|[;{\s])display\s*:\s*none\s*!?important?;?/gi);
    }

    container.querySelectorAll("style").forEach((styleTag) => {
      let cssText = styleTag.textContent || "";

      // Remove all blocked property declarations.
      [...basePropPatterns, ...extraPatterns].forEach((rx) => {
        cssText = cssText.replace(rx, "$1");
      });

      // If only comments/whitespace left, remove the <style> tag entirely.
      const stripped = cssText.replace(/\/\*[\s\S]*?\*\//g, "").trim();
      if (stripped.length === 0) {
        styleTag.remove();
      } else {
        styleTag.textContent = cssText;
      }
    });

    // ---- (C) Optional: strip scripts and javascript: URLs for extra safety ----
    if (stripScripts) {
      // Remove <script> tags completely.
      container.querySelectorAll("script").forEach((s) => s.remove());

      // Remove javascript: URLs from common URL-bearing attributes.
      container.querySelectorAll("[src],[xlink\\:href]").forEach((el) => {
        ["src", "xlink:href"].forEach((attr) => {
          if (!el.hasAttribute(attr)) {
            return;
          }
          const val = (el.getAttribute(attr) || "").trim();
          if (/^javascript\s*:/i.test(val)) {
            el.removeAttribute(attr);
          }
        });
      });
    }

    // ---- (D) Optional: scrub inline DOM event handlers (onclick, onmouseover, …) ----
    if (scrubEventHandlers) {
      container.querySelectorAll("*").forEach((el) => {
        // Copy attributes first; live removal mutates the NamedNodeMap.
        Array.from(el.attributes).forEach((attr) => {
          if (/^on/i.test(attr.name)) {
            el.removeAttribute(attr.name);
          }
        });
      });
    }

    // ---- (E) Normalize SVG sizing (without distorting aspect ratio) ----
    const normalizeUnit = (v) => {
      if (typeof v === "number") {
        return `${v}px`;
      }
      // Allow "20", "20px", "1em", etc.; append px only if it's purely numeric.
      return /^\d+(\.\d+)?$/.test(v) ? `${v}px` : String(v);
    };

    const widthVal = normalizeUnit(svgSize?.width ?? 20);
    const heightVal = normalizeUnit(svgSize?.height ?? 20);

    container.querySelectorAll("svg").forEach((svg) => {
      // Respect existing width/height when onlySetSvgSizeIfMissing is true.
      if (!onlySetSvgSizeIfMissing || !svg.hasAttribute("width")) {
        svg.setAttribute("width", widthVal);
      }
      if (!onlySetSvgSizeIfMissing || !svg.hasAttribute("height")) {
        svg.setAttribute("height", heightVal);
      }

      // Preserve aspect ratio unless explicitly set.
      if (!svg.hasAttribute("preserveAspectRatio")) {
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      }

      // Add a default viewBox if missing; derive from numeric width/height when possible.
      if (!svg.hasAttribute("viewBox")) {
        const wNum = parseFloat(String(svg.getAttribute("width") || widthVal));
        const hNum = parseFloat(
          String(svg.getAttribute("height") || heightVal)
        );
        const vw = Number.isFinite(wNum) ? wNum : 20;
        const vh = Number.isFinite(hNum) ? hNum : 20;
        svg.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
      }
    });

    // Return sanitized result
    return container.innerHTML;
  } catch (err) {
    console.error("sanitizeHTML failed:", err);
    return htmlString;
  }
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
    scopeToClosestRepeatingAncestor: true,
    scopeTags: TagWhitelist, // null = any tag
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
    const nodes = evaluateXpath(xpath, doc);
    if (nodes.length === 1 && nodes[0] === el) {
      return xpath; // Uniquely found
    }
    if (nodes.length > 1) {
      const index = findIndex(nodes, el);
      if (index > 0) {
        const indexedXpath = `(${xpath})[${index}]`;
        if (evaluateXpath(indexedXpath, doc)[0] === el) {
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

  // Priority 4: Scope to the closest repeating ancestor
  if (cfg.scopeToClosestRepeatingAncestor) {
    const scoped = buildScopedPathThroughRepeatingAncestor(
      el,
      doc,
      cfg,
      testCandidate
    );
    if (scoped) {
      console.log(
        "Found scoped XPath using closest repeating ancestor:",
        scoped
      );
      return scoped;
    }
  }

  // Priority 5 Fallback: optimized absolute (existing behavior)
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

/** ===================== Helpers for scoping ===================== **/

function buildScopedPathThroughRepeatingAncestor(el, doc, cfg, testCandidate) {
  const scopeAncestor = findClosestRepeatingAncestor(el, doc, cfg);
  if (!scopeAncestor) {
    return null;
  }

  // Build an anchor for the ancestor (prefer stable unique attribute; else doc-indexed tag)
  const anchor = buildAnchorForAncestor(scopeAncestor, doc, cfg, testCandidate);
  if (!anchor) {
    return null;
  } // If we can’t build a unique anchor, abort scoping.

  // Build the shortest reliable relative path from ancestor -> leaf
  const relative = buildRelativePath(scopeAncestor, el);

  // Try short variants first
  const candidates = [
    // tags only (no indices) from ancestor — sometimes sufficient
    `${anchor}//${relative.tagsOnly}`,
    // indexed leaf only within the ancestor
    `${anchor}//${relative.indexedLeaf}`,
    // fully indexed from ancestor — most specific
    `${anchor}/${relative.indexedFull}`,
  ].filter(Boolean);

  for (const xp of candidates) {
    const res = testCandidate(xp);
    if (res) {
      return res;
    }
  }
  return null;
}

function findClosestRepeatingAncestor(el, doc, cfg) {
  const tagPriority = (cfg.scopeTags || []).map((t) => t.toLowerCase());
  const candidates = [];

  let cur = el.parentElement;
  let depth = 0;
  while (cur && cur !== doc.documentElement) {
    const tag = cur.tagName && cur.tagName.toLowerCase();
    if (tag) {
      const priorityIdx = tagPriority.length ? tagPriority.indexOf(tag) : -1;

      // Consider only tags in the scope list if provided; otherwise, any tag
      const tagAllowed = tagPriority.length ? priorityIdx !== -1 : true;

      if (tagAllowed) {
        const sameTagInDoc = doc.getElementsByTagName(tag).length;
        const sibSameTag = cur.parentElement
          ? Array.from(cur.parentElement.children).filter(
              (n) => n.tagName && n.tagName.toLowerCase() === tag
            ).length
          : 0;

        const isRepeating = sameTagInDoc > 1 || sibSameTag > 1;
        if (isRepeating) {
          candidates.push({
            node: cur,
            tag,
            depth, // smaller = closer
            priorityIdx:
              priorityIdx === -1 ? Number.MAX_SAFE_INTEGER : priorityIdx,
          });
        }
      }
    }
    cur = cur.parentElement;
    depth++;
  }

  if (!candidates.length) {
    return null;
  }

  // Sort by (priority ascending) then (depth ascending)
  candidates.sort((a, b) => {
    if (a.priorityIdx !== b.priorityIdx) {
      return a.priorityIdx - b.priorityIdx;
    }
    return a.depth - b.depth;
  });

  return candidates[0].node;
}

function buildAnchorForAncestor(node, doc, cfg, testCandidate) {
  const tag = getTagOf(node);
  if (!tag) {
    return null;
  }

  // 1) Try stable attribute on ancestor (unique across doc)
  const attrs = stableAttrPairs(node, cfg).filter(([k]) => k !== "id");
  for (const [k, v] of attrs) {
    const xp = `//${tag}[@${k}=${xpathString(v)}]`;
    const res = testCandidate(xp);
    if (res) {
      return res;
    }
  }
  const id = node.getAttribute && node.getAttribute("id");
  if (id && !isUnstable(id, cfg.unstableMatchers)) {
    const xp = `//*[@id=${xpathString(id)}]`;
    const res = testCandidate(xp);
    if (res) {
      return res;
    }
  }

  // 2) Fallback: index this ancestor among all tags of same type in the document
  const all = Array.from(doc.getElementsByTagName(tag));
  const idx = all.indexOf(node);
  if (idx >= 0) {
    return `(//${tag})[${idx + 1}]`;
  }
  return null;
}

function buildRelativePath(ancestor, leaf) {
  // Build segments from ancestor (exclusive) to leaf (inclusive)
  const segments = [];
  let cur = leaf;
  while (cur && cur !== ancestor && cur.nodeType === Node.ELEMENT_NODE) {
    const tag = getTagOf(cur);
    const index = getIndexOfTag(cur); // index among same-tag siblings
    segments.unshift({ tag, index });
    cur = cur.parentElement;
  }

  // 1) tagsOnly: //a/b/c
  const tagsOnly = segments.map((s) => s.tag).join("/");

  // 2) indexedLeaf: //a/b/c[3]  (only the leaf is indexed)
  const indexedLeafParts = segments.map((s) => s.tag);
  if (segments.length > 0) {
    const last = segments[segments.length - 1];
    indexedLeafParts[indexedLeafParts.length - 1] += `[${last.index}]`;
  }
  const indexedLeaf = indexedLeafParts.join("/");

  // 3) indexedFull: /a[1]/b[2]/c[3]
  const indexedFull = segments.map((s) => `${s.tag}[${s.index}]`).join("/");

  return { tagsOnly, indexedLeaf, indexedFull };
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
 * Highlights an element inside an iframe either on hover or on-demand for a duration.
 *
 * Usage:
 *   // On-demand (once): highlight for 5 seconds
 *   highlightElement(el, iframe, { mode: "once", durationMs: 2000 });
 *
 *   // Hover-based (existing behavior)
 *   highlightElement(el, iframe, { mode: "hover" });
 *
 * @param {Element} element - The target element inside the iframe document.
 * @param {HTMLIFrameElement} iframe - The iframe element.
 * @param {Object} [opts]
 */
function highlightElement(element, iframe, opts = {}) {
  const {
    mode = "hover",
    durationMs = 5000,
    border = "2px dashed red",
    zIndex = 9999,
    borderRadius = "2px",
    boxShadow = "rgba(255,0,0,0.25) 0 0 0 2px inset",
  } = opts;

  if (!element || !iframe) {
    return;
  }

  // Access the iframe's document/window (same-origin required)
  let iframeDoc, iframeWin;
  try {
    iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    iframeWin = iframe.contentWindow;
  } catch (e) {
    // Cross-origin iframe; cannot highlight
    return;
  }
  if (!iframeDoc || !iframeWin) {
    return;
  }

  let overlayRef = null;
  // Create an overlay, position it over the element, and keep it in sync on scroll/resize
  const createOverlay = () => {
    // Remove previous highlight overlays to avoid stacking
    iframeDoc.querySelectorAll(".highlight-box").forEach((el) => el.remove());

    const highlight = iframeDoc.createElement("div");
    highlight.className = "highlight-box";
    // Base styles
    Object.assign(highlight.style, {
      position: "absolute",
      border: border,
      pointerEvents: "none",
      zIndex: String(zIndex),
      borderRadius,
      boxShadow,
      margin: "0",
      padding: "0",
    });

    // Compute and set position
    const positionOverlay = () => {
      const rect = element.getBoundingClientRect();

      // Fallbacks for scroll in iframe context
      const scrollTop =
        iframeWin.pageYOffset ||
        iframeDoc.documentElement.scrollTop ||
        iframeDoc.body.scrollTop ||
        0;
      const scrollLeft =
        iframeWin.pageXOffset ||
        iframeDoc.documentElement.scrollLeft ||
        iframeDoc.body.scrollLeft ||
        0;

      // Use integers for crisp borders on most displays
      const top = Math.max(0, Math.round(rect.top + scrollTop));
      const left = Math.max(0, Math.round(rect.left + scrollLeft));
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));

      highlight.style.top = `${top}px`;
      highlight.style.left = `${left}px`;
      highlight.style.width = `${width}px`;
      highlight.style.height = `${height}px`;
    };

    // Initial draw
    positionOverlay();

    // Keep overlay aligned if the iframe content scrolls or resizes.
    // Using capture phase to catch scroll events from nested containers.
    const onAnyScroll = () => positionOverlay();
    const onResize = () => positionOverlay();

    iframeDoc.addEventListener("scroll", onAnyScroll, true);
    iframeWin.addEventListener("resize", onResize);

    // If the element detaches, remove overlay
    const mo = new iframeWin.MutationObserver(() => {
      if (!iframeDoc.contains(element)) {
        cleanup();
      }
    });

    try {
      mo.observe(iframeDoc.documentElement, {
        childList: true,
        subtree: true,
      });
    } catch (e) {
      console.warning(e);
    }

    const cleanup = () => {
      try {
        iframeDoc.removeEventListener("scroll", onAnyScroll, true);
        iframeWin.removeEventListener("resize", onResize);
        mo.disconnect();
        highlight.remove();
      } catch (e) {
        console.warning(e);
      }
    };

    // Insert into the iframe body
    iframeDoc.body.appendChild(highlight);

    return { cleanup, positionOverlay, el: highlight };
  };

  if (mode === "hover") {
    // Attach listeners only once per element
    const onEnter = () => {
      overlayRef = createOverlay();
    };
    const onLeave = () => {
      overlayRef?.cleanup?.();
      overlayRef = null;
    };

    // Store refs on the element to avoid duplicate handlers
    if (!element.__hl_hoverBound) {
      element.addEventListener("mouseenter", onEnter);
      element.addEventListener("mouseleave", onLeave);
      element.__hl_hoverBound = true;
      // Clean up when element is removed later (best-effort)
      const ro = new (iframeWin.MutationObserver || MutationObserver)(() => {
        if (!iframeDoc.contains(element)) {
          element.removeEventListener("mouseenter", onEnter);
          element.removeEventListener("mouseleave", onLeave);
          overlayRef?.cleanup?.();
          ro.disconnect();
          delete element.__hl_hoverBound;
        }
      });
      try {
        ro.observe(iframeDoc.documentElement, {
          childList: true,
          subtree: true,
        });
      } catch (e) {
        console.warning(e);
      }
    }
  } else if (mode === "once") {
    // Highlight immediately and auto-remove after durationMs
    const { cleanup } = createOverlay() || {};
    if (typeof durationMs === "number" && durationMs > 0) {
      iframeWin.setTimeout(() => {
        cleanup?.();
      }, durationMs);
    }
  }
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
  doc.querySelectorAll(".duplicate-highlight").forEach((el) => el.remove());

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

    // Add a class for the clicked element to make it stand out
    if (el === clickedElement) {
      highlight.style.border = "2px dashed red";
    }

    doc.body.appendChild(highlight);
  });

  win.setTimeout(() => {
    doc.querySelectorAll(".duplicate-highlight").forEach((el) => el.remove());
  }, 2000);
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
  cleanInputs();
  const iframe = document.getElementById("renderFrame");
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  const cssEl = document.getElementById("cssSelector");
  const xpathEl = document.getElementById("xpathSelector");
  const idEl = document.getElementById("idSelector");

  // Generate locators
  let cssSelector = getCssSelector(element);
  let xpathSelector = getXPath(element);
  let idSelector = element.id || "⚠️ ID not found";

  // Validate CSS Selector
  const cssMatches = doc.querySelectorAll(cssSelector);
  if (cssMatches.length === 1) {
    cssEl.value = cssSelector;
  } else if (cssMatches.length === 0) {
    cssEl.value = "⚠️ Valid Locator could not be found";
  } else {
    highlightDuplicates(cssSelector, doc, element, "CSS");
    // Adjust to uniquely target the clicked element
    cssSelector = `${cssSelector}:nth-of-type(${
      Array.from(cssMatches).indexOf(element) + 1
    })`;
    cssEl.value = cssSelector;
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
    xpathEl.value = xpathSelector;
  } else if (xpathResult.snapshotLength === 0) {
    xpathEl.value = "⚠️ Valid Locator could not be found";
  } else {
    highlightDuplicates(xpathSelector, doc, element, "XPATH");
    // Adjust XPath to match the specific element
    const index = Array.from({ length: xpathResult.snapshotLength }, (_, i) =>
      xpathResult.snapshotItem(i)
    ).indexOf(element);

    xpathSelector = `(${xpathSelector})[${index + 1}]`;
    xpathEl.value = xpathSelector;
  }

  // ID is usually direct and unique but check for duplicates
  idSelector = validateID(idSelector, doc, element);
  idEl.value = idSelector;
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

function renderDefaultPreview() {
  let style =
    "font-family:sans-serif; padding:10px;\
  color:#555; font-size:25px; line-height:120%;";

  let defaultMsg =
    "Preview will appear here once you paste HTML content.\
 Hover & click on any element to get the locator.";

  renderHTML(`<p id='preview' style='${style}'>${defaultMsg}</p>`);
}

function setupIframe({
  textareaId = "htmlInput",
  renderBtnId = "renderBtn",
} = {}) {
  const textarea = document.getElementById(textareaId);
  const renderBtn = document.getElementById(renderBtnId);
  renderBtn.addEventListener("click", renderHTML);

  // Show default message on load
  window.addEventListener("load", renderDefaultPreview);

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
      renderDefaultPreview();
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
