import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { CATEGORIES, TITLE_NUDGES, WORD_TO_NUM } from "./constants.js";

const UNKNOWN = "—";

function norm(s) {
  return (s || "")
    .toString()
    .toLowerCase()
    .normalize("NFKC") // handle unicode variants
    .replace(/[\u2019']/g, "'")
    .replace(/[^\w\s+#./-]/g, " ");
}

function buildRegexes(arr) {
  // Separate phrases (contain space or special chars) vs single tokens
  const phrases = [];
  const tokens = [];
  for (const item of arr || []) {
    if (/\s|[./+-]/.test(item)) {
      phrases.push(item);
    } else {
      tokens.push(item);
    }
  }
  // Word-boundary regex for tokens, literal regex for phrases
  const tokenRe = tokens.length
    ? new RegExp(`\\b(${tokens.map(escapeRe).join("|")})\\b`, "g")
    : null;
  const phraseRes = phrases.map((p) => new RegExp(escapeRe(p), "g"));
  return { tokenRe, phraseRes };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countMatches(text, tokenRe, phraseRes) {
  let count = 0;
  if (tokenRe) {
    const seen = new Set();
    for (const m of text.matchAll(tokenRe)) {
      const key = m[0] + "@" + m.index;
      if (!seen.has(key)) {
        seen.add(key);
        count += 1;
      }
    }
  }
  if (phraseRes) {
    for (const re of phraseRes) {
      const seen = new Set();
      for (const m of text.matchAll(re)) {
        const key = m[0] + "@" + m.index;
        if (!seen.has(key)) {
          seen.add(key);
          count += 1;
        }
      }
    }
  }
  return count;
}

function hasAny(text, tokenRe, phraseRes) {
  return (
    (tokenRe && tokenRe.test(text)) ||
    (phraseRes && phraseRes.some((re) => re.test(text)))
  );
}

function scoreDoc(job, config = CATEGORIES) {
  const title = norm(job.title);
  const desc = norm(job.description || "");

  const scores = {};
  const titleCap = 12; // prevent over-boost from long titles
  const descCap = 30; // prevent over-boost from long descriptions
  const negTitleCap = 12;
  const negDescCap = 30;

  // Pre-build regexes for each cat for speed if used repeatedly
  for (const [cat, meta] of Object.entries(config)) {
    const posPhrases = buildRegexes(meta.phrases || []);
    const posTerms = buildRegexes(meta.terms || []);
    const neg = buildRegexes(meta.negative || []);

    let s = 0;

    // Positive scoring
    // Phrases get a bit more weight than single terms
    const titlePhraseMatches = countMatches(title, null, posPhrases.phraseRes);
    const descPhraseMatches = countMatches(desc, null, posPhrases.phraseRes);
    const titleTermMatches = countMatches(
      title,
      posTerms.tokenRe,
      posTerms.phraseRes
    );
    const descTermMatches = countMatches(
      desc,
      posTerms.tokenRe,
      posTerms.phraseRes
    );

    // Base weights
    s += Math.min(titlePhraseMatches, 6) * 4; // phrases in title
    s += Math.min(descPhraseMatches, 10) * 2; // phrases in desc
    s += Math.min(titleTermMatches, 8) * 3; // terms in title
    s += Math.min(descTermMatches, 20) * 1; // terms in desc

    // Category title boost (capped)
    if (meta.titleBoost) {
      const titleHits = titlePhraseMatches + titleTermMatches;
      s += Math.min(titleHits * meta.titleBoost, 6);
    }

    // Negative scoring
    const negTitleMatches = countMatches(title, neg.tokenRe, neg.phraseRes);
    const negDescMatches = countMatches(desc, neg.tokenRe, neg.phraseRes);
    s -= Math.min(negTitleMatches, negTitleCap) * 2.5;
    s -= Math.min(negDescMatches, negDescCap) * 1.0;

    // Tie-breaker nudges based on title tokens
    for (const nudge of TITLE_NUDGES) {
      if (nudge.cat === cat && nudge.regex.test(title)) {
        s += nudge.boost;
      }
    }

    // Proximity nudge for DevOps/SRE: kubernetes + terraform both present
    if (cat === "DevOps/SRE") {
      const hasK8s = hasAny(
        desc,
        buildRegexes(["kubernetes", "k8s"]).tokenRe,
        null
      );
      const hasTf = hasAny(desc, buildRegexes(["terraform"]).tokenRe, null);
      if (hasK8s && hasTf) {
        s += 2;
      }
    }

    // Nudge for AI/ML: if 'mlops' and 'ci/cd' are present, boost 'SoftwareDEV'
    if (cat === "SoftwareDEV") {
      const hasMlops = hasAny(desc, buildRegexes(["mlops"]).tokenRe, null);
      const hasCiCd = hasAny(desc, buildRegexes(["ci/cd"]).tokenRe, null);
      if (hasMlops && hasCiCd) {
        s += 3;
      }
    }

    // Weight category if needed
    s *= meta.weight;

    scores[cat] = s;
  }

  // Select best with margin
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [bestCat, bestScore] = entries[0];
  const secondScore = entries[1]?.[1] ?? -Infinity;
  const margin = bestScore - secondScore;

  // Confidence: scaled sigmoid-like based on margin and absolute score
  const conf = confidence(bestScore, secondScore);

  // Fallbacks to explicit signals if scores are too close/weak
  let finalCat = bestCat;
  if (bestScore < 4 || margin < 1) {
    if (/\bqa\b|\btester\b|\bquality\b|\bsdet\b/.test(title)) {
      finalCat = "SoftwareQA";
    } else if (/\bdevops\b|\bsre\b|\bsite reliability\b/.test(title)) {
      finalCat = "DevOps/SRE";
    } else if (
      /\bhardware\b|\bfirmware\b|\bembedded\b|\bmechanical\b/.test(title)
    ) {
      finalCat = "HardwareQA";
    }
  }

  // Unknown if very low confidence
  if (conf < 0.35 || bestScore < 3) {
    // Check for strong non-tech signals before defaulting to UNKNOWN
    if (
      /\b(talent acquisition|recruitment|hiring|recruiter)\b/.test(title) ||
      /\b(compliance|audit)\b/.test(title) ||
      /\b(civil|construction|mep)\b/.test(title)
    ) {
      finalCat = UNKNOWN; // This is definitely not a tech role we cover
    } else if (bestScore < 3) {
      finalCat = UNKNOWN; // Genuinely low score
    }
  }

  // Final check: if 'SoftwareQA' won but has strong construction/civil negatives in title, kick to Unknown
  if (finalCat === "SoftwareQA" && /\b(mep|civil|construction)\b/.test(title)) {
    finalCat = UNKNOWN;
  }

  return { category: finalCat, scores, confidence: Number(conf.toFixed(2)) };
}

function confidence(best, second) {
  // Margin & absolute score → 0..1
  const margin = Math.max(0, best - (second ?? 0));
  const abs = Math.max(0, best);
  const mPart = Math.tanh(margin / 4); // 0..~1
  const aPart = Math.tanh(abs / 8);
  return 0.6 * mPart + 0.4 * aPart; // weighted blend
}

function classifyJobs(jobs) {
  return jobs.map((j) => {
    const { category, scores, confidence } = scoreDoc(j);
    // Combine the classification results into a single object under 'classification'
    const classification = {
      roleType: category,
      confidence,
      debugScores: scores,
    };
    return { ...j, classification };
  });
}

// Regex 1: General numeric patterns with "experience"
const REGEX_GENERAL =
  /\b(\d{1,2})(?:\s*[-–to]\s*(\d{1,2}))?\s*\+?\s*(?:years?|yrs?|y)\b(?!\s*full\s+time\s+education)(?:\s*(?:of\s+)?(?:experience|exp|prof|professional|background|testing|industry|relevant|hands[- ]on|experienced))?/gi;

// Regex 2: Header-based patterns
const REGEX_HEADER =
  /\b(?:Experience|Years\s+of\s+Experience|Required\s+Exp)\s*[:\s-]?\s*(\d{1,2})(?:\s*[-–to]\s*(\d{1,2}))?\s*\+?/gi;

// Regex 3: Written numbers
const REGEX_WRITTEN =
  /\b(?:at\s+least|minimum\s+of)?\s*(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:or\s+more\s+)?(?:years?|yrs?|y)\s+(?:of\s+(?:experience|industry|related))/gi;

// Regex 4: Simple "X+ years" without experience keyword
const REGEX_SIMPLE_PLUS =
  /\b(\d{1,2})\s*\+\s*(?:years?|yrs?|y)\b(?!\s*of\s*experience)/gi;

// Regex 5: Match numbers in words
const NUMBER_WORDS_RE = new RegExp(
  "\\b(" + Object.keys(WORD_TO_NUM).join("|") + ")\\b",
  "gi"
);

const REGEX_EXP =
  /^(Experience|Years of Experience|YoE|Years of Exp|Yrs of Exp|Overall)\s*[:-]?\s*/i;

const REGEX_EXP_TO_PLUS = /(\d+)\s*(?:[-–to]\s*(\d+))?(\+)?/i;

function wordToNumber(word) {
  return WORD_TO_NUM[word.toLowerCase()] ?? null;
}

function getExperience(jobTitle, jobDescription, jobId) {
  if (!jobDescription) {
    return null;
  }
  jobDescription = jobTitle + " " + jobDescription;
  // Normalize whitespace and remove newlines
  const desc = norm(jobDescription).replace(/\s+/g, " ");

  const matches = [
    ...desc.matchAll(REGEX_GENERAL),
    ...desc.matchAll(REGEX_HEADER),
    ...desc.matchAll(REGEX_SIMPLE_PLUS),
    ...desc.matchAll(REGEX_WRITTEN),
  ];

  const requirements = new Set();
  let bestMatch = null;
  let bestScore = 0;

  for (const match of matches) {
    let raw = match[0];
    let cleaned = raw.replace(/\s+/g, " ").trim();

    // Convert written numbers to digits
    cleaned = cleaned.replace(NUMBER_WORDS_RE, wordToNumber);

    const numMatches = [...cleaned.matchAll(/\d+/g)].map((m) =>
      parseInt(m[0], 10)
    );
    if (numMatches.length === 0) {
      continue;
    }

    const hasRange =
      cleaned.includes("-") || cleaned.includes("–") || cleaned.includes("to");
    const hasPlus = cleaned.includes("+");

    let score = 0;
    if (hasRange && numMatches.length > 1) {
      score = numMatches[1]; // upper bound
    } else if (hasPlus) {
      score = numMatches[0] + 0.5; // prioritize plus slightly
    } else {
      score = numMatches[0];
    }

    if (score > bestScore && score < 30) {
      bestScore = score;
      bestMatch = cleaned;
    }
  }

  if (bestMatch) {
    console.log(`Job: ${jobId}`);
    console.log(" Experiences found:", [...requirements]);
    console.log(" Best Match:", bestMatch);
    const normYOE = normalizeExperience(bestMatch);
    console.log(" Normalized Experience:", normYOE);
    return normYOE;
  }

  console.log(`Job: ${jobId} - No valid experience found`);
  return null;
}

function normalizeExperience(experienceString) {
  if (!experienceString) {
    return "";
  }

  let cleanedString = experienceString.replace(REGEX_EXP, "").trim();
  cleanedString = cleanedString.replace(NUMBER_WORDS_RE, wordToNumber);
  const match = cleanedString.match(REGEX_EXP_TO_PLUS);
  if (match) {
    const firstNum = parseInt(match[1], 10);
    const secondNum = match[2] ? parseInt(match[2], 10) : null;
    const plusSign = match[3];
    if (secondNum) {
      // Reconstruct as "X - Y"
      return `${firstNum} - ${secondNum}`;
    }
    if (plusSign) {
      // Reconstruct as "X+"
      return `${firstNum}+`;
    }
    // or return just a single number
    return `${firstNum}`;
  }
  // Fallback if no expected pattern is found
  return "";
}

// -- Get the experience value from title/description --
function addExperienceToJobs(jobs) {
  return jobs.map((j) => {
    const exp = getExperience(j.title, j.description, j.jobId);
    return {
      ...j,
      experienceRequired: exp || UNKNOWN,
    };
  });
}

function clean_string(jobs) {
  // 1. Regex to target invisible/control/separator characters (including LS and PS)
  const invisibleCharsRegex = /[\uFEFF\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/gu;

  // 2. Replacement map for common conversions (curly quotes, long dashes, etc.)
  const conversionMap = {
    // Curly Quotes / Single Quotes
    "‘": "'", // U+2018 LEFT SINGLE QUOTATION MARK
    "’": "'", // U+2019 RIGHT SINGLE QUOTATION MARK (your specific character)
    // Double Quotes
    "“": '"', // U+201C LEFT DOUBLE QUOTATION MARK
    "”": '"', // U+201D RIGHT DOUBLE QUOTATION MARK
    // Dashes
    "–": "-", // U+2013 EN DASH
    "—": "-", // U+2014 EM DASH
    // Ellipsis
    "…": "...", // U+2026 HORIZONTAL ELLIPSIS
    // No-Break Space (U+00A0) - replace with regular space
    "\u00A0": " ",
  };

  return jobs.map((j) => {
    let desc = j.description || "";

    // **A. Normalize Unicode**
    // NFKC normalization handles many of these conversions implicitly,
    // especially for things like combining characters and some smart quotes/dashes.
    desc = desc.normalize("NFKC");

    // **B. Apply Explicit Conversions**
    // Iterates through the map and applies replacements
    for (const [key, value] of Object.entries(conversionMap)) {
      desc = desc.replace(new RegExp(key, "g"), value);
    }

    // **C. Remove Invisible Characters (LS, PS, BOM, ZWS, etc.)**
    desc = desc.replace(invisibleCharsRegex, "");

    // **D. Cleanup Spacing**
    // Replace any remaining non-standard spaces (\p{Zs}) and multiple spaces with a single space.
    // Ensure a single space follows punctuation for readability: "word." -> "word. "
    desc = desc.replace(/([.,;:])([ \t]+)?/g, "$1 ");

    // Collapse multiple consecutive common punctuation
    desc = desc.replace(/[.]{2,}/g, ".");
    desc = desc.replace(/[,]{2,}/g, ",");
    desc = desc.replace(/;{2,}/g, ";");

    desc = desc.replace(/\p{Zs}/gu, " ");
    desc = desc.trim();

    // **E. (Optional) Sanitize - only use if you want to remove ALL characters not in your list**
    // const originalSanitizeRegex = /[^a-zA-Z0-9\s\\n'"<>:;,=+.?_–—\-()&@%/•*\u00A0-\u00FF]/g;
    // desc = desc.replace(originalSanitizeRegex, "");

    return {
      ...j,
      description: desc,
    };
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let OUTPUT_FILE = path.resolve(__dirname, "jobs.json");
// CLI usage: node classify-jobs.js

try {
  // Read the file
  const raw = fs.readFileSync(OUTPUT_FILE, "utf-8");
  const json = JSON.parse(raw);
  const jobs = json.data;

  // Classify the jobs
  const jobswithDesc = clean_string(jobs);
  const jobswithExp = addExperienceToJobs(jobswithDesc);
  const out = classifyJobs(jobswithExp);
  json.data = out;

  // Convert back to a nicely formatted JSON string
  const outputJson = JSON.stringify(json, null, 2);

  // Write back to the same file
  fs.writeFileSync(OUTPUT_FILE, outputJson, "utf-8");

  console.log(
    `Successfully classified ${jobs.length} entries and updated the file: ${OUTPUT_FILE}`
  );
} catch (error) {
  console.error(`Error processing file ${OUTPUT_FILE}:`, error.message);
  process.exit(1);
}
