import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { CATEGORIES, TITLE_NUDGES } from "./constants.js";

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

function getExperience(jobDescription, jobId) {
  if (!jobDescription) {
    return null;
  }

  const desc = jobDescription.toString();

  // Original regex
  const EXPERIENCE_REGEX_1 =
    /(\d+)(?:\s*-\s*\d+|\s*–\s*\d+|\s*to\s*\d+|\s*\+)?\s*(?:years?|yrs?|y|year|year\(s\))(?:\s*of)?(?:\s*(?:experience|exp|prof|professional|background|testing|industry|relevant|hands))/gi;

  // Improved regex
  const EXPERIENCE_REGEX_2 =
    /\b(?:experience\s*[:-]?\s*|need\s+a\s*|overall\s*)?(?:(\d{1,2})\s*(?:–|-|to|plus|\+)?\s*(\d{1,2})?|\d{1,2}\s*\+?)\s*(?:years?|yrs?|y)\b(?!\s*full\s+time\s+education)(?:\s*of)?(?:\s*(?:experience|exp|background|testing|industry|relevant|hands[- ]on|experienced))?/gi;

  const matches1 = [...desc.matchAll(EXPERIENCE_REGEX_1)];
  const matches2 = [...desc.matchAll(EXPERIENCE_REGEX_2)];

  const requirements = new Set();
  let maxExperienceValue = 0;
  let maxExperienceString = null;

  const processMatches = (matches) => {
    for (const match of matches) {
      const raw = match[0];
      const cleaned = raw.replace(/\s+/g, " ").trim();

      // Extract all numbers from the string
      const numMatches = [...cleaned.matchAll(/\d+/g)].map((m) =>
        parseInt(m[0], 10)
      );

      // Determine the highest number in the match
      const maxInMatch = Math.max(...numMatches);

      // Filter: Avoid low numbers unless it's a range
      if (
        (cleaned.includes("-") ||
          cleaned.includes("to") ||
          cleaned.includes("plus") ||
          maxInMatch >= 2) &&
        maxInMatch < 35
      ) {
        requirements.add(cleaned);

        if (maxInMatch > maxExperienceValue) {
          maxExperienceValue = maxInMatch;
          maxExperienceString = cleaned;
        }
      } else {
        console.log(
          `Job: ${jobId} Skipped (filtered out):`,
          cleaned,
          `(max: ${maxInMatch})`
        );
      }
    }
  };

  processMatches(matches1);
  processMatches(matches2);

  if (maxExperienceString) {
    console.log(`Job: ${jobId}`);
    console.log("  Experiences found:", [...requirements]);
    console.log("  Maximum Experience:", maxExperienceString);
    const normYOE = normalizeExperience(maxExperienceString);
    console.log("  Normalized Experience:", normYOE);
    return normYOE;
  }

  console.log(`Job: ${jobId} - No valid experience found`);
  return null;
}

/**
 * Cleans and normalizes the experience string to only contain
 * the numeric requirement (e.g., "5+", "2 - 4", "10").
 * * @param {string} experienceString The raw value from experienceRequired.
 * @returns {string} The normalized experience value.
 */
function normalizeExperience(experienceString) {
  if (!experienceString) {
    return "";
  }

  // 1. Pre-cleanup to handle prefixes like "Experience", "Overall", etc.
  let cleanedString = experienceString
    .replace(/^(Experience|Overall)\s*[:-]?\s*/i, "")
    .trim();

  // 2. Regular Expression to capture the desired pattern:
  // This reliably extracts the numbers, range, or plus sign from the start.
  const regex = /^(\d+)(\s*[-]\s*(\d+))?([+])?/;

  const match = cleanedString.match(regex);

  if (match) {
    const firstNum = match[1];
    const rangePart = match[2];
    const plusSign = match[4];

    if (rangePart) {
      // Reconstruct as "X - Y"
      return `${firstNum} - ${match[3]}`;
    } else if (plusSign) {
      // Reconstruct as "X+"
      return `${firstNum}+`;
    } else {
      // Just a single number
      return firstNum;
    }
  }

  // Fallback if no expected pattern is found
  return "";
}

function addExperienceToJobs(jobs) {
  return jobs.map((j) => {
    // 1. Get the experience value
    const requiredExp = getExperience(j.description, j.jobId) || UNKNOWN;

    return {
      ...j,
      experienceRequired: requiredExp,
    };
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let OUTPUT_FILE = path.resolve(__dirname, "jobs.json");
// CLI usage: node classify.js
if (import.meta.url === `file://${process.argv[1]}`) {
  const input = process.argv[2];
  if (input) {
    OUTPUT_FILE = path.resolve(input);
  }

  try {
    // Read the file
    const raw = fs.readFileSync(OUTPUT_FILE, "utf-8");
    const json = JSON.parse(raw);
    const jobs = json.data;

    // Classify the jobs
    const jobswithExp = addExperienceToJobs(jobs);
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
}
