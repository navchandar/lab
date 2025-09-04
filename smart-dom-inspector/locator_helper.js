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
export function findStableAttributePairs(node, config) {
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

// --- Configuration Module ---
/**
 * Provides a common, extensible configuration for selector generation.
 */
export const DefaultConfig = {
  root: document,
  maxDepth: 8,
  preferShort: true,
  classLimit: 2,
  useText: false,
  textMaxLen: 40,
  allowIndexOnAncestors: false,
  allowIndexOnLeaf: true,
  useId: true, // CSS Selector specific

  // Attributes considered "stable" (ordered by preference)
  attrWhitelist: [
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
    "aria-label",
    "aria-labelledby",
    "aria-describedby",
    "role",
    "name",
    "placeholder",
    "title",
    "alt",
    "type",
    "href",
    "id",
  ],

  // Patterns to ignore (auto-generated / volatile)
  unstableMatchers: [
    (v) => /^\d{3,}$/.test(v),
    (v) =>
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(v),
    (v) => /(^|[_-])[a-f0-9]{6,}($|[_-])/i.test(v),
    (v) => /__{2,3}[A-Za-z0-9_-]{4,}$/.test(v),
    (v) => /^css-[a-z0-9]{4,}/.test(v),
    (v) => /^sc-[a-zA-Z0-9]+/.test(v),
    (v) => /^ng-/.test(v),
    (v) => /^svelte-[a-zA-Z0-9]+/.test(v),
  ],
};

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

export function XpathMatch(xpath, el, doc) {
  try {
    const result = doc.evaluate(
      xpath,
      doc,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    return result.singleNodeValue === el;
  } catch {
    return false;
  }
}

export function CssMatch(selector, el, doc) {
  try {
    const matched = doc.querySelector(selector);
    return matched === el;
  } catch (e) {
    return false;
  }
}

function countXpathElems(xp, d) {
  try {
    return d.evaluate(`count(${xp})`, d, null, XPathResult.NUMBER_TYPE, null)
      .numberValue;
  } catch {
    return NaN;
  }
}

function countCssElems(sel, d) {
  try {
    return d.querySelectorAll(sel).length;
  } catch {
    return NaN;
  }
}

const isUnique = (locator, d, type = "XPATH") => {
  let count = 0;
  if (type === "XPATH") {
    const count = countXpathElems(locator, d);
    console.log(`Checking uniqueness for XPath: ${xp} → Count: ${count}`);
  } else if (type === "CSS") {
    const count = countCssElems(locator, d);
    console.log(`Checking uniqueness for Selector: ${sel} → Count: ${count}`);
  } else {
    console.warning("Invalid isUnique type");
  }

  return count === 1;
};
