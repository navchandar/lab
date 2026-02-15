// --- Core Utilities ---
/**
 * Checks if an element is a valid DOM element.
 * @param {*} el The element to check.
 * @returns {boolean}
 */
export function isDomElement(el) {
  return !!el && el.nodeType === Node.ELEMENT_NODE;
}

/**
 * Checks if a string attribute value is "unstable" (auto-generated or volatile).
 * @param {string} value The value to check.
 * @param {Array<Function>} matchers A list of matcher functions.
 * @returns {boolean}
 */
export function isUnstable(value, matchers) {
  if (!value) {
    return true;
  }
  return matchers.some((fn) => {
    try {
      return fn(value);
    } catch {
      return false;
    }
  });
}

/**
 * Returns a node's tag name in lowercase.
 * @param {Element} node The DOM element.
 * @returns {string}
 */
export function getTagOf(node) {
  if (!node) {
    return "";
  }

  return (node.tagName || node.localName || "").toLowerCase();
}

/**
 * Finds stable attributes on a DOM node based on a whitelist.
 * @param {Element} node The DOM element.
 * @param {Object} config Configuration object.
 * @returns {Array<[string, string]>} A list of [key, value] pairs for stable attributes.
 */
export function stableAttrPairs(node, config) {
  const pairs = [];
  for (const attr of config.attrWhitelist) {
    if (!node.hasAttribute?.(attr)) {
      continue;
    }
    const val = node.getAttribute?.(attr);
    if (!val || isUnstable(val, config.unstableMatchers)) {
      continue;
    }
    pairs.push([attr, val]);
  }
  return pairs;
}

// --- Configuration Module Constants ---
/**
 * Prefer attributes explicitly added for testing first (data-*),
 * then accessibility attributes (ARIA), then a few semantic fallbacks.
 * Order matters: earlier attributes are tried first.
 */
export const AttributeWhitelist = [
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
  "role",
  "name",
  "placeholder",
  "aria-labelledby",
  "aria-describedby",
  "title",
  "alt",
  // Lowest-priority fallbacks (use sparingly)
  "value",
  "type",
  "href",
  "id",
];

// Prefer high-signal, semantic containers first; 'div' is a last-resort fallback.
export const TagWhitelist = [
  // Data / tabular structures
  "table",
  "tbody",

  // Lists & groups
  "ul",
  "ol",
  "dl",

  // Forms & controls grouping
  "form",
  "fieldset",

  // Page landmarks & content sections
  "main",
  "section",
  "article",
  "nav",
  "aside",

  // Overlays & disclosures
  "dialog",
  "details",

  // Page chrome containers
  "header",
  "footer",

  // Generic fallback
  "div",
];

/**
 * Avoid using classes/ids/values that look auto-generated or runtime-volatile
 */
export const AttributeBlacklist = [
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

  // Tailwind JIT-generated classes (e.g., tw-abc123)
  (v) => /^tw-[a-z0-9]{4,}$/i.test(v),

  // Webpack module identifiers (e.g., module__abc123)
  (v) => /^module__[\w-]{6,}$/.test(v),

  // Vite/Parcel hashed class names (e.g., v-abc123, p-xyz456)
  (v) => /^[vp]-[a-z0-9]{5,}$/i.test(v),

  // React DevTools auto-generated keys (e.g., .r123456)
  (v) => /^\.r\d{5,}$/.test(v),

  // Next.js image optimization keys (e.g., __next_image__hash)
  (v) => /^__next_image__/.test(v),

  // Astro scoped styles (e.g., astro-abc123)
  (v) => /^astro-[a-z0-9]{5,}$/i.test(v),

  // Shopify Polaris or similar design system hashes (e.g., Polaris-abc123)
  (v) => /^Polaris-[a-z0-9]{5,}$/i.test(v),

  // Random alphanumeric strings (e.g., abc123xyz456)
  (v) => /(?=.*\d)^[a-z0-9]{10,}$/i.test(v),

  // Short, random-looking strings (e.g., yZiJbe, gLFyf, Alh6id)
  (v) => /^[a-zA-Z]{3,6}$/.test(v), // 3–6 alphabetic characters

  // Mixed-case alphanumeric strings (e.g., Alh6id)
  (v) => /^[a-zA-Z0-9]{5,8}$/.test(v),

  // Google-style JS name attributes (e.g., jsname="yZiJbe")
  (v) => /^[a-zA-Z]{2,6}$/.test(v) && /[A-Z]/.test(v), // must include uppercase
];

// --- XPath Specific Utilities ---
/**
 * Wraps a string in single or double quotes for XPath.
 * @param {string} s The string to escape.
 * @returns {string}
 */
export function xpathString(s) {
  if (s.indexOf('"') === -1) {
    return `"${s}"`;
  }
  if (s.indexOf("'") === -1) {
    return `'${s}'`;
  }
  return `concat("${s.replace(/"/g, '",\'"\',"')}")`;
}

// --- CSS Specific Utilities ---
/**
 * Escapes a string for use in a CSS selector.
 * @param {string} v The string to escape.
 * @returns {string}
 */
export function cssEscape(v) {
  return typeof CSS !== "undefined" && CSS.escape
    ? CSS.escape(v)
    : String(v).replace(/["\\]/g, "\\$&");
}

/**
 * Returns the positional index of a node among its siblings of the same type.
 * @param {Element} node The DOM element.
 * @returns {number}
 */
export function getIndexOfTag(node) {
  let i = 1,
    sib = node;
  const tag = getTagOf(node);
  while ((sib = sib.previousElementSibling)) {
    if (getTagOf(sib) === tag) {
      i++;
    }
  }
  return i;
}

/**
 * Checks if a given XPath expression matches a specific DOM element.
 *
 * @param {string} xpath - The XPath expression to evaluate.
 * @param {Element} el - The DOM element to compare against.
 * @param {Document} doc - The document context in which to evaluate the XPath.
 * @returns {boolean} - True if the XPath resolves to the given element, false otherwise.
 */
export function XpathMatch(xpath, el, doc) {
  try {
    const result = doc.evaluate(
      xpath,
      doc,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    );
    return result.singleNodeValue === el;
  } catch {
    return false;
  }
}

/**
 * Evaluates an XPath expression and returns an array of matching nodes.
 * @param {string} xpath - The XPath expression to evaluate.
 * @returns {Node[]} An array of DOM nodes.
 */
export function evaluateXpath(xpath, doc) {
  try {
    const result = doc.evaluate(
      xpath,
      doc,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null,
    );
    const nodes = [];
    for (let i = 0; i < result.snapshotLength; i++) {
      nodes.push(result.snapshotItem(i));
    }
    return nodes;
  } catch (e) {
    console.warn(`Error evaluating XPath: ${xpath}`, e);
    return [];
  }
}

/**
 * Checks if a given CSS selector matches a specific DOM element.
 *
 * @param {string} selector - The CSS selector to evaluate.
 * @param {Element} el - The DOM element to compare against.
 * @param {Document} doc - The document context in which to query the selector.
 * @returns {boolean} - True if the selector resolves to the given element, false otherwise.
 */
export function CssMatch(selector, el, doc) {
  try {
    const matched = doc.querySelector(selector);
    return matched === el;
  } catch (e) {
    return false;
  }
}

/**
 * Counts the number of elements matched by an XPath expression.
 *
 * @param {string} xp - The XPath expression to evaluate.
 * @param {Document} d - The document context in which to evaluate the XPath.
 * @returns {number} - The number of matching elements, or NaN if evaluation fails.
 */
function countXpathElems(xp, d) {
  try {
    return d.evaluate(`count(${xp})`, d, null, XPathResult.NUMBER_TYPE, null)
      .numberValue;
  } catch {
    return NaN;
  }
}

/**
 * Counts the number of elements matched by a CSS selector.
 *
 * @param {string} sel - The CSS selector to evaluate.
 * @param {Document} d - The document context in which to query the selector.
 * @returns {number} - The number of matching elements, or NaN if query fails.
 */
function countCssElems(sel, d) {
  try {
    return d.querySelectorAll(sel).length;
  } catch {
    return NaN;
  }
}

/**
 * Determines whether a locator (XPath or CSS selector) uniquely identifies a single element.
 *
 * @param {string} locator - The XPath or CSS selector to evaluate.
 * @param {Document} d - The document context in which to evaluate the locator.
 * @param {string} type - The type of locator: "XPATH" or "CSS" or "ID".
 * @returns {boolean} - True if the locator matches exactly one element, false otherwise.
 */
export const isUnique = (locator, d, type = "XPATH") => {
  let count = 0;

  try {
    if (type === "XPATH") {
      count = countXpathElems(locator, d);
      console.log(
        `Checking uniqueness for XPath: ${locator} → Count: ${count}`,
      );
    } else if (type === "CSS") {
      count = countCssElems(locator, d);
      console.log(
        `Checking uniqueness for Selector: ${locator} → Count: ${count}`,
      );
    } else if (type === "ID") {
      count = countCssElems(`#${locator}`, d);
      console.log(`Checking uniqueness for ID: ${locator} → Count: ${count}`);
    } else {
      console.warn(`Invalid type ${type} for locator: ${locator}`);
    }
  } catch (e) {
    console.error(e);
  }

  return count === 1;
};

/**
 * Scroll an element into view *within an iframe document*, and ensure the iframe
 * is visible in the parent page as well.
 *
 * @param {Element} el - Element inside the iframe document.
 * @param {Document} doc - The iframe's document.
 * @param {HTMLIFrameElement} iframe - The iframe element in the parent DOM.
 * @param {Object} [opts]
 * @param {boolean} [opts.center=true] - Center the element in the viewport.
 */
export function scrollElementInIframe(el, doc, iframe, opts = {}) {
  const { center = true, behavior = "smooth" } = opts;

  try {
    // 1) Scroll the iframe element into view in the parent page .
    if (iframe && typeof iframe.scrollIntoView === "function") {
      iframe.scrollIntoView({
        behavior,
        block: "nearest",
        inline: "nearest",
      });
    }

    // 2) Scroll the target element into view inside the iframe.
    // Prefer standards-based API first:
    if (typeof el.scrollIntoView === "function") {
      el.scrollIntoView({
        behavior,
        block: center ? "center" : "nearest",
        inline: "nearest",
      });
      return;
    }

    // 3) Fallback: compute and scroll using the iframe's window.
    const win = doc.defaultView || (iframe ? iframe.contentWindow : null);
    if (win) {
      const rect = el.getBoundingClientRect();
      const currentY = win.pageYOffset || doc.documentElement.scrollTop || 0;
      const viewportH =
        win.innerHeight || doc.documentElement.clientHeight || 0;

      // Centering logic; if not centering, align to nearest edge.
      let targetY = currentY + rect.top;
      if (center) {
        const visibleH = Math.min(rect.height, viewportH);
        targetY = currentY + rect.top - (viewportH / 2 - visibleH / 2);
      }

      // Clamp to >= 0 to avoid negative positions
      targetY = Math.max(0, targetY);

      if (typeof win.scrollTo === "function") {
        win.scrollTo({ top: targetY, behavior });
      } else if (typeof win.scroll === "function") {
        win.scroll(0, targetY);
      } else {
        // Very old fallback
        doc.documentElement.scrollTop = targetY;
        doc.body && (doc.body.scrollTop = targetY);
      }
    }
  } catch (e) {
    console.warn("scrollElementInIframe failed:", e);
  }
}
