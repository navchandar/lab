/**
 * copy given text from elementId when button is clicked
 */
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

//Node type check to detect instanceof Element
const isDomElement = (el) => !!el && el.nodeType === Node.ELEMENT_NODE;

/**
 * Generates a simplified and maintainable XPath for a given DOM element.
 * Prioritizes ID-based paths and avoids overly specific indexing when possible.
 *
 * @param {Element} element - The DOM element to generate XPath for.
 * @returns {string} - The XPath string.
 */
function getXPath(el, options = {}) {
  if (!isDomElement(el)) {
    console.error("Target must be a DOM Element");
    return;
  }

  const cfg = {
    root: el.ownerDocument, // evaluate within the element's document (iframe-safe)
    maxDepth: 10,

    // Prefer test IDs and accessibility first, then semantic fallbacks
    attrWhitelist: [
      // Test hooks used by Playwright/Cypress/RTL/etc.
      "data-testid",
      "data-test-id",
      "data-test",
      "data-cy",
      "data-qa",
      "data-qa-id",
      "data-automation-id",
      "data-automationid",
      "data-automation",
      "data-qe-id",

      // Accessibility & semantics (user-facing and relatively stable)
      "aria-label",
      "aria-labelledby",
      "aria-describedby",
      "role",
      "name",
      "placeholder",
      "title",
      "alt",

      // Low-priority fallbacks
      "type",
      "href",
    ],

    // Detect auto-generated / volatile tokens to avoid brittle predicates
    unstableMatchers: [
      (v) => /^\d{3,}$/.test(v), // all-numeric
      (v) =>
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(v), // UUID
      (v) => /(^|[_-])[a-f0-9]{6,}($|[_-])/i.test(v), // long hex shards
      (v) => /__{2,3}[A-Za-z0-9_-]{4,}$/.test(v), // CSS Modules ___hash
      (v) => /^css-[a-z0-9]{4,}/.test(v), // Emotion/MUI css-<hash>
      (v) => /^sc-[a-zA-Z0-9]+/.test(v), // styled-components
      (v) => /^ng-/.test(v), // Angular state/runtime
      (v) => /^svelte-[a-zA-Z0-9]+/.test(v), // Svelte scope hash
    ],

    classLimit: 2, // at most N classes in a class-based predicate
    preferShort: true,
    useText: false, // optionally use text() when short & stable
    textMaxLen: 40, // max length for text predicate
    ...options,
  };

  const d = cfg.root;

  // === Helpers ===
  const isUnstable = (v) =>
    !v ||
    cfg.unstableMatchers.some((fn) => {
      try {
        return fn(v);
      } catch {
        return false;
      }
    });
  const tagOf = (node) => (node.tagName || "").toLowerCase();

  const indexAmongType = (node) => {
    let i = 1,
      sib = node;
    const tag = node.localName;
    while ((sib = sib.previousElementSibling)) {
      if (sib.localName === tag) i++;
    }
    return i;
  };

  const xpathString = (s) => {
    // Escape string literal for XPath
    if (s.indexOf('"') === -1) {
      return `"${s}"`;
    }
    if (s.indexOf("'") === -1) {
      return `'${s}'`;
    }
    // concat("a", '"', "b")
    return 'concat("' + s.replace(/"/g, '",\'"\',"') + '")';
  };

  const isUnique = (xp) => {
    try {
      const expr = `count(${xp})`;
      const r = d.evaluate(expr, d, null, XPathResult.NUMBER_TYPE, null);
      return r.numberValue === 1;
    } catch {
      return false;
    }
  };

  const stableAttrPairs = (node) => {
    const pairs = [];
    for (const a of cfg.attrWhitelist) {
      if (!node.hasAttribute || !node.hasAttribute(a)) {
        continue;
      }
      const val = node.getAttribute(a);
      if (!val || isUnstable(val)) {
        continue;
      }
      pairs.push([a, val]);
    }
    return pairs;
  };

  const uniqueId = (node) => {
    if (!node.getAttribute) {
      return null;
    }
    const id = node.getAttribute("id");
    // Use only if looks stable (and likely unique). We still test uniqueness below anyway.
    return id && !isUnstable(id) ? id : null;
  };

  const stableClasses = (node) => {
    if (!node.classList || node.classList.length === 0) {
      return [];
    }
    return Array.from(node.classList)
      .filter((c) => !isUnstable(c))
      .slice(0, cfg.classLimit);
  };

  const classPredicates = (classes) => {
    // Robust class membership test in XPath
    return classes.map(
      (c) => `contains(concat(' ', normalize-space(@class), ' '), ' ${c} ')`
    );
  };

  const textPredicate = (node) => {
    if (!cfg.useText) {
      return null;
    }
    const t = (node.textContent || "").trim();
    if (!t || t.length > cfg.textMaxLen) {
      return null;
    }
    // Avoid pure numbers or volatile dates by a simple heuristic
    if (/^\d{1,}$/.test(t)) {
      return null;
    }
    return `normalize-space()=${xpathString(t)}`;
  };

  // Build candidate expressions for this node alone (relative, starting with //)
  const nodeCandidates = (node) => {
    const tag = tagOf(node) || "*";
    const preds = [];

    // id first if stable
    const id = uniqueId(node);
    if (id) {
      preds.push(`@id=${xpathString(id)}`);
    }

    // whitelisted attributes
    const attrs = stableAttrPairs(node);
    for (const [k, v] of attrs) preds.push(`@${k}=${xpathString(v)}`);

    // class contains(...) predicates
    const classes = stableClasses(node);
    preds.push(...classPredicates(classes));

    // optional text()
    const tp = textPredicate(node);
    if (tp) {
      preds.push(tp);
    }

    const candidates = [];

    // Try: by id only
    if (id) {
      candidates.push(`//*[@id=${xpathString(id)}]`);
    }

    // Try single-attribute-only, regardless of tag
    for (const [k, v] of attrs) {
      candidates.push(`//*[@${k}=${xpathString(v)}]`);
    }

    // Try tag + each attribute
    for (const [k, v] of attrs) {
      candidates.push(`//${tag}[@${k}=${xpathString(v)}]`);
    }

    // Try combining up to two attributes on tag (stronger)
    for (let i = 0; i < Math.min(attrs.length, 2); i++) {
      for (let j = i + 1; j < Math.min(attrs.length, 3); j++) {
        const [k1, v1] = attrs[i],
          [k2, v2] = attrs[j];
        candidates.push(
          `//${tag}[@${k1}=${xpathString(v1)} and @${k2}=${xpathString(v2)}]`
        );
      }
    }

    // Try tag + classes
    if (classes.length) {
      const clsPred = classPredicates(classes).join(" and ");
      candidates.push(`//${tag}[${clsPred}]`);
    }

    // Try text predicate
    if (tp) {
      candidates.push(`//${tag}[${tp}]`);
      candidates.push(`//*[${tp}]`);
    }

    // Bare tag (rarely unique, but cheap)
    candidates.push(`//${tag}`);

    return candidates;
  };

  // Try node-only candidates
  for (const xp of cfg.preferShort
    ? nodeCandidates(el)
        .slice()
        .sort((a, b) => a.length - b.length)
    : nodeCandidates(el)) {
    if (isUnique(xp)) {
      // relative XPath
      return xp;
    }
  }

  // Build a relative path from a stable ancestor
  const segments = [];
  let cur = el;
  let depth = 0;

  while (cur && cur.nodeType === 1 && depth <= cfg.maxDepth) {
    const tag = tagOf(cur) || "*";
    const attrs = stableAttrPairs(cur);
    const classes = stableClasses(cur);
    const tp = textPredicate(cur);

    // Prefer attribute predicates; if none, use class; else positional index
    let seg;
    if (attrs.length) {
      // Use up to two attributes for stronger uniqueness per segment
      const parts = attrs
        .slice(0, 2)
        .map(([k, v]) => `@${k}=${xpathString(v)}`);
      seg = `${tag}[${parts.join(" and ")}]`;
    } else if (classes.length) {
      seg = `${tag}[${classPredicates(classes).join(" and ")}]`;
    } else if (tp) {
      seg = `${tag}[${tp}]`;
    } else {
      seg = `${tag}[${indexAmongType(cur)}]`;
    }

    // relative path from anywhere
    segments.unshift(seg);
    const xp = "//" + segments.join("/"); 

    if (isUnique(xp)) {
      return xp;
    }

    cur = cur.parentElement;
    depth++;
  }

  // Absolute fallback from the document root
  const absolute = [];
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const tag = tagOf(n) || "*";
    absolute.unshift(`${tag}[${indexAmongType(n)}]`);
  }
  return "/" + absolute.join("/");
}

/**
 * Generates a maintainable CSS selector for a given DOM element.
 * Prioritizes ID-based selectors and builds a path using tag and class names.
 *
 * @param {Element} el - The DOM element to generate a selector for.
 * @returns {string} - The CSS selector string.
 */
function getCssSelector(el, options = {}) {
  if (!isDomElement(el)) {
    console.error("Target must be a DOM Element");
    return;
  }

  const cssEscape = (v) =>
    typeof CSS !== "undefined" && CSS.escape
      ? CSS.escape(v)
      : String(v).replace(/["\\]/g, "\\$&");

  const cfg = {
    // Where uniqueness is tested — use the element's own document (iframe-safe)
    root: el.ownerDocument,
    maxDepth: 5,
    useId: true,

    /**
     * Prefer attributes explicitly added for testing first (data-*),
     * then accessibility attributes (ARIA), then a few semantic fallbacks.
     *
     * Order matters: earlier attributes are tried first.
     */
    attrWhitelist: [
      // Test IDs (widely used by Playwright, Cypress, Testing Library)
      "data-testid",
      "data-test-id",
      "data-test",
      "data-cy",
      "data-qa",
      "data-qa-id",
      "data-automation-id",
      "data-automationid",
      "data-automation",
      "data-qe-id",

      // Accessibility & semantics (stable, user-facing)
      "aria-label",
      "aria-labelledby",
      "aria-describedby",
      "role",
      "name",
      "placeholder",
      "title",
      "alt",

      // Lowest-priority fallbacks (use sparingly)
      "type",
      "href",
    ],

    // Avoid using classes/ids/values that look auto-generated or runtime-volatile
    unstableMatchers: [
      // All-numeric tokens (ids/classes like "12345")
      (v) => /^\d{3,}$/.test(v),

      // UUID/GUIDs
      (v) =>
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(v),

      // Long hex-ish chunks surrounded by delimiters (common in build hashes)
      (v) => /(^|[_-])[a-f0-9]{6,}($|[_-])/i.test(v),

      // CSS Modules patterns: name__local___hash / local___hash
      (v) => /__{2,3}[A-Za-z0-9_-]{4,}$/.test(v),

      // Emotion/MUI runtime classes: css-<hash>
      (v) => /^css-[a-z0-9]{4,}/.test(v),

      // styled-components: sc-*
      (v) => /^sc-[a-zA-Z0-9]+/.test(v),

      // Angular runtime/state classes: ng-*
      (v) => /^ng-/.test(v),

      // Svelte scoping: svelte-<hash>
      (v) => /^svelte-[a-zA-Z0-9]+/.test(v),
    ],

    classLimit: 3,
    preferShort: true,
    ...options,
  };

  const d = cfg.root;

  const isUnstable = (value) => {
    if (!value) {
      return true;
    }
    return cfg.unstableMatchers.some((fn) => {
      try {
        return fn(value);
      } catch {
        return false;
      }
    });
  };

  const isUnique = (sel) => {
    try {
      return d.querySelectorAll(sel).length === 1;
    } catch {
      return false;
    }
  };

  const tagOf = (node) => (node.tagName || "").toLowerCase();

  const nthOfType = (node) => {
    let i = 1,
      sib = node;
    const tag = tagOf(node);
    while ((sib = sib.previousElementSibling)) {
      if (tagOf(sib) === tag) {
        i++;
      }
    }
    return i;
  };

  const uniqueId = (node) => {
    if (!cfg.useId || !node.getAttribute) {
      return null;
    }
    const id = node.getAttribute("id");
    if (!id || isUnstable(id)) {
      return null;
    }
    const found = d.getElementById ? d.getElementById(id) : null;
    return found === node ? id : null;
  };

  const stableAttrPairs = (node) => {
    const pairs = [];
    for (const attr of cfg.attrWhitelist) {
      if (!node.hasAttribute || !node.hasAttribute(attr)) {
        continue;
      }
      const val = node.getAttribute(attr);
      if (!val || isUnstable(val)) {
        continue;
      }
      pairs.push([attr, cssEscape(val)]);
    }
    return pairs;
  };

  const classSelectors = (node) => {
    if (!node.classList || node.classList.length === 0) {
      return [];
    }
    const classes = Array.from(node.classList)
      .filter((c) => !isUnstable(c)) // drop volatile tokens
      .slice(0, cfg.classLimit)
      .map((c) => "." + cssEscape(c));
    return classes;
  };

  // Build candidate fragments for this node, from strongest to weakest
  const nodeCandidates = (node) => {
    const tag = tagOf(node);
    const id = uniqueId(node);
    const attrs = stableAttrPairs(node);
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
      candidates.push(`${tag}:nth-of-type(${nthOfType(node)})`);
    }

    return candidates;
  };

  // Try to find a unique selector by combining ancestors
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
      if (isUnique(cand)) {
        return cand;
      }
    }

    // If nothing unique, fix the strongest for this level and climb
    path.unshift(parts[0]);
    cur = cur.parentElement;
    depth++;
  }

  // Last resort: absolute path from root with nth-of-type
  const absolute = [];
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const tag = tagOf(n) || "*";
    const nth = `${tag}:nth-of-type(${nthOfType(n)})`;
    absolute.unshift(nth);
    const sel = absolute.join(" > ");
    if (isUnique(sel)) {
      return sel;
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
  let cssSelector = getCssSelector(element);
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

// Initalize setup
updateButtons();
setupIframe();
