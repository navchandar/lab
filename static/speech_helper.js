/**
 * Text-to-Speech helper for reading the textContent of a given HTML element.
 * - Detects support and warns if unavailable
 * - Loads & sorts voices deterministically for debugging
 * - Prefers high-quality voices (Google/Microsoft/Apple) when available
 * - Falls back to any voice matching a locale (e.g., 'en-US', 'hi-IN')
 * - Provides speak, pause, resume, cancel controls
 */
export const TTS = () => {
  // ---------------------------
  // Feature detection
  // ---------------------------
  function isSpeechSupported() {
    const supported =
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      "SpeechSynthesisUtterance" in window;
    if (!supported) {
      console.warn(
        "[TTS] Web Speech Synthesis API not supported in this browser/device."
      );
    }
    return supported;
  }

  // ---------------------------
  // Voice loading (robust across browsers)
  // ---------------------------
  /**
   * Load voices reliably. Some browsers populate voices asynchronously.
   * - Resolves with a non-empty array or an empty array after timeout.
   * - Uses 'voiceschanged' and a short polling fallback.
   */
  function loadVoices({ timeoutMs = 1500, pollIntervalMs = 100 } = {}) {
    return new Promise((resolve) => {
      if (!isSpeechSupported()) {
        return resolve([]);
      }

      const synth = window.speechSynthesis;
      const existing = synth.getVoices();
      if (existing && existing.length) {
        return resolve(existing.slice());
      }

      let resolved = false;
      const finish = (voices) => {
        if (!resolved) {
          resolved = true;
          resolve(voices || []);
        }
      };

      // Event handler (fires in Chrome/Edge; sometimes not in Safari)
      const onVoicesChanged = () => {
        const v = synth.getVoices();
        if (v && v.length) {
          synth.removeEventListener("voiceschanged", onVoicesChanged);
          finish(v.slice());
        }
      };

      synth.addEventListener("voiceschanged", onVoicesChanged);

      // Poll as fallback (helps on Safari where event occasionally misses)
      const started = Date.now();
      const poll = setInterval(() => {
        const v = synth.getVoices();
        if (v && v.length) {
          clearInterval(poll);
          synth.removeEventListener("voiceschanged", onVoicesChanged);
          finish(v.slice());
        } else if (Date.now() - started > timeoutMs) {
          clearInterval(poll);
          synth.removeEventListener("voiceschanged", onVoicesChanged);
          finish([]);
        }
      }, pollIntervalMs);
    });
  }

  // ---------------------------
  // Utilities & normalization
  // ---------------------------
  function normalizeLangTag(tag = "") {
    // Normalize to BCP-47 like en-US (tolerate en_US)
    return tag.replace("_", "-").trim();
  }

  function sameLangOrPrefixMatch(voiceLang, desiredLocale) {
    const v = normalizeLangTag(voiceLang).toLowerCase();
    const d = normalizeLangTag(desiredLocale).toLowerCase();
    if (!v || !d) {
      return false;
    }
    return v === d || v.startsWith(d.split("-")[0] + "-");
  }

  // Sort voices for stable debug output
  function sortVoicesForDebug(voices) {
    const vendorRank = (name = "", uri = "") => {
      const tag = (name + " " + uri).toLowerCase();
      if (tag.includes("google")) {
        return 1;
      }
      if (tag.includes("microsoft")) {
        return 2;
      }
      if (tag.includes("apple") || tag.includes("com.apple")) {
        return 3;
      }
      return 9; // other vendors
    };

    return voices.slice().sort((a, b) => {
      // Prefer local voices, then default voice, then vendor rank, then lang, then name
      const localA = a.localService === true ? 0 : 1;
      const localB = b.localService === true ? 0 : 1;
      if (localA !== localB) {
        return localA - localB;
      }

      const defA = a.default ? 0 : 1;
      const defB = b.default ? 0 : 1;
      if (defA !== defB) {
        return defA - defB;
      }

      const vendA = vendorRank(a.name, a.voiceURI);
      const vendB = vendorRank(b.name, b.voiceURI);
      if (vendA !== vendB) {
        return vendA - vendB;
      }

      const langA = normalizeLangTag(a.lang).toLowerCase();
      const langB = normalizeLangTag(b.lang).toLowerCase();
      if (langA !== langB) {
        return langA.localeCompare(langB);
      }

      return (a.name || "").localeCompare(b.name || "");
    });
  }

  // ---------------------------
  // Voice selection
  // ---------------------------
  /**
   * Attempt to find a high-quality voice from major vendors.
   * @param {SpeechSynthesisVoice[]} voices
   * @param {string} locale - e.g., 'en-US', 'hi-IN'
   * @param {string[]} preferredVendors - ranked vendor tokens
   */
  function findPreferredVoice(
    voices,
    locale,
    preferredVendors = ["Google", "Microsoft", "Apple"]
  ) {
    if (!Array.isArray(voices) || voices.length === 0) {
      return null;
    }
    const normLocale = normalizeLangTag(locale);
    const inLocale = voices.filter((v) =>
      sameLangOrPrefixMatch(v.lang, normLocale)
    );

    // Rank by vendor and "quality" keywords when possible
    const rank = (v) => {
      const tag = `${v.name} ${v.voiceURI}`.toLowerCase();
      let vendorScore = 99;
      preferredVendors.forEach((vendor, i) => {
        if (tag.includes(vendor.toLowerCase())) {
          vendorScore = Math.min(vendorScore, i); // smaller is better
        }
      });

      // Heuristic for "Natural"/"Neural" voices where surfaced
      const qualityBonus =
        tag.includes("natural") || tag.includes("neural") ? -1 : 0;

      // Prefer local voices slightly
      const localPenalty = v.localService === true ? -0.2 : 0.0;

      return vendorScore + qualityBonus + localPenalty;
    };

    const sorted = inLocale.slice().sort((a, b) => rank(a) - rank(b));
    return sorted[0] || null;
  }

  /**
   * Fallback: any voice that matches the locale; otherwise first available.
   */
  function findFallbackVoice(voices, locale) {
    const normLocale = normalizeLangTag(locale);
    const exact = voices.find(
      (v) => normalizeLangTag(v.lang).toLowerCase() === normLocale.toLowerCase()
    );
    if (exact) {
      return exact;
    }

    const prefix = normLocale.split("-")[0].toLowerCase();
    const byPrefix = voices.find((v) =>
      normalizeLangTag(v.lang)
        .toLowerCase()
        .startsWith(prefix + "-")
    );
    if (byPrefix) {
      return byPrefix;
    }

    return voices[0] || null;
  }

  // ---------------------------
  // Text helpers
  // ---------------------------
  function getElementFromInput(elOrSelector) {
    if (typeof elOrSelector === "string") {
      return document.querySelector(elOrSelector);
    }
    if (elOrSelector && elOrSelector.nodeType === 1) {
      return elOrSelector;
    }
    return null;
  }

  function extractTextContent(el) {
    if (!el) {
      return "";
    }
    // You can customize this to ignore hidden elements, ARIA, etc.
    return (el.textContent || "").replace(/\s+/g, " ").trim();
  }

  // Optional chunking for very long text (keeps engines stable)
  function splitIntoChunks(text, maxLen = 400) {
    if (!text || text.length <= maxLen) {
      return [text];
    }

    const chunks = [];
    let remaining = text.trim();
    const sepRegex = /([.!?。！？])\s+/g; // sentence-like separators

    while (remaining.length > maxLen) {
      let cut = -1;
      let lastMatch = null;

      // Find last sentence boundary within maxLen
      while ((lastMatch = sepRegex.exec(remaining)) !== null) {
        if (lastMatch.index + lastMatch[0].length <= maxLen) {
          cut = lastMatch.index + lastMatch[0].length;
        } else {
          break;
        }
      }

      if (cut <= 0) {
        // No sentence boundary found; hard cut
        cut = maxLen;
      }

      chunks.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }

    if (remaining) {
      chunks.push(remaining);
    }
    return chunks;
  }

  // ---------------------------
  // Public API
  // ---------------------------
  async function getVoicesSorted() {
    const voices = await loadVoices();
    return sortVoicesForDebug(voices);
  }

  async function isSpeechReady(locale = "en-US") {
    if (!isSpeechSupported()) {
      return false;
    }

    const voices = await loadVoices();
    if (!voices || voices.length === 0) {
      return false;
    }

    const preferredVoice = findPreferredVoice(voices, locale);
    return !!preferredVoice;
  }

  /**
   * Speak the textContent of an element.
   * @param {string|HTMLElement} elOrSelector
   * @param {Object} options
   * @param {string} [options.locale='en-US']
   * @param {number} [options.rate=1]   // 0.1 - 10 (browsers clamp internally)
   * @param {number} [options.pitch=1]  // 0 - 2
   * @param {number} [options.volume=1] // 0 - 1
   * @param {string[]} [options.preferredVendors=['Google','Microsoft','Apple']]
   * @param {string} [options.forceVoiceName] // exact voice name if you know it
   * @param {boolean} [options.chunk=true] // split long text into smaller utterances
   * @param {function} [options.onStart]
   * @param {function} [options.onEnd]
   * @param {function} [options.onBoundary] // word/char boundary events
   */
  async function speakElement(elOrSelector, options = {}) {
    if (!isSpeechSupported()) {
      return;
    }

    const {
      locale = "en-US",
      rate = 0.9,
      pitch = 1,
      volume = 1,
      preferredVendors = ["Google", "Microsoft", "Apple"],
      forceVoiceName,
      chunk = true,
      onStart,
      onEnd,
      onBoundary,
    } = options;

    const el = getElementFromInput(elOrSelector);
    if (!el) {
      console.warn("[TTS] Element not found for:", elOrSelector);
      return;
    }

    const text = extractTextContent(el);
    if (!text) {
      console.warn("[TTS] No textContent found to speak.");
      return;
    }

    const synth = window.speechSynthesis;

    // If already speaking, cancel the current queue to avoid overlap
    if (synth.speaking || synth.pending) {
      synth.cancel();
    }

    const allVoices = await getVoicesSorted();
    if (!allVoices.length) {
      console.warn("[TTS] No voices available from speech engine.");
      return;
    }

    let voice = null;

    if (forceVoiceName) {
      voice = allVoices.find((v) => v.name === forceVoiceName);
      if (!voice) {
        console.warn(
          `[TTS] forceVoiceName "${forceVoiceName}" not found. Continuing with selection logic.`
        );
      }
    }

    if (!voice) {
      voice =
        findPreferredVoice(allVoices, locale, preferredVendors) ||
        findFallbackVoice(allVoices, locale);
    }
    if (voice) {
      console.log(`[TTS] Selected Voice: ${voice}`);
    } else {
      console.warn("[TTS] Could not select any voice. Aborting.");
      return;
    }

    // Prepare one or multiple utterances
    const parts = (chunk ? splitIntoChunks(text) : [text]).filter(Boolean);

    let started = false;
    let remaining = parts.length;

    parts.forEach((part, idx) => {
      const u = new SpeechSynthesisUtterance(part);
      u.voice = voice;
      u.lang = normalizeLangTag(voice.lang || locale);
      u.rate = rate;
      u.pitch = pitch;
      u.volume = volume;

      u.onstart = () => {
        if (!started) {
          started = true;
          // Fire once at the start of the first utterance
          onStart && onStart({ voice, totalChunks: parts.length });
        }
      };
      u.onend = () => {
        remaining -= 1;
        if (remaining === 0) {
          onEnd && onEnd({ voice, totalChunks: parts.length });
        }
      };
      if (onBoundary) {
        u.onboundary = (ev) => onBoundary(ev);
      }
      u.onerror = (e) => {
        console.warn("[TTS] Utterance error:", e.error);
      };

      synth.speak(u);
    });
  }

  function cancel() {
    if (!isSpeechSupported()) {
      return;
    }
    window.speechSynthesis.cancel();
  }
  function pause() {
    if (!isSpeechSupported()) {
      return;
    }
    window.speechSynthesis.pause();
  }
  function resume() {
    if (!isSpeechSupported()) {
      return;
    }
    window.speechSynthesis.resume();
  }

  // Optional iOS warm-up helper
  function unlockSpeech() {
    if (!("speechSynthesis" in window)) {
      return;
    }
    try {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(" "));
    } catch {
      console.error(
        "[TTS] Web Speech Synthesis API not supported in this browser/device."
      );
    }
  }

  return {
    isSpeechSupported,
    loadVoices,
    getVoicesSorted,
    isSpeechReady,
    speakElement,
    unlockSpeech,
    cancel,
    pause,
    resume,
    // Expose internals for debugging/testing:
    _utils: {
      sortVoicesForDebug,
      findPreferredVoice,
      findFallbackVoice,
      splitIntoChunks,
      normalizeLangTag,
    },
  };
};

export const speakElement = TTS.speakElement;
