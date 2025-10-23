const fs = require("fs");
const path = require("path");

const CATEGORIES = {
  "Software Dev": {
    weight: 1,
    titleBoost: 1.5,
    phrases: [
      "software engineer",
      "full stack",
      "application developer",
      "web developer",
      "solution architect",
      "software architect",
      "api development",
      "design patterns",
      "microservices",
      "rest api",
      "ai/ml",
      "ml pipeline",
      "feature engineering",
      "model training",
      "data pipeline",
      "data science",
      "solution engineer",
    ],
    terms: [
      "developer",
      "programmer",
      "frontend",
      "backend",
      "mobile",
      "javascript",
      "typescript",
      "java",
      "c#",
      ".net",
      "python",
      "golang",
      "go",
      "ruby",
      "php",
      "swift",
      "kotlin",
      "scala",
      "rust",
      "c++",
      "objective-c",
      "node.js",
      "nodejs",
      "react",
      "angular",
      "vue",
      "svelte",
      "jquery",
      "spring",
      "spring boot",
      "django",
      "flask",
      "fastapi",
      "rails",
      "laravel",
      "express.js",
      "graphql",
      "apollo",
      "architecture",
      "oop",
      "functional programming",
      "sql",
      "nosql",
      "mongodb",
      "postgres",
      "mysql",
      "database",
      "algorithm",
      "data structures",
      "coding",
      "ai",
      "ml",
      "mlops",
      "llm",
      "genai",
      "rag",
      "sagemaker",
      "bedrock",
    ],
    negative: [
      "qa",
      "quality",
      "tester",
      "sdet",
      "automation tester",
      "test plan",
      "test case",
      "manual testing",
      "bug tracking",
      "regression testing",
      "devops",
      "sre",
      "site reliability",
      "platform engineer",
      "infrastructure",
      "ci/cd",
      "jenkins",
      "prometheus",
      "grafana",
      "on-call",
      "incident",
      "hardware",
      "pcb",
      "rtl",
      "fpga",
      "asic",
      "embedded",
      "firmware",
      "oscilloscope",
      "mechanical",
      "mechatronics",
      "electromechanical",
      "3d cad",
      "piping",
      "hydrogen",
      "talent acquisition",
      "recruitment",
      "hiring",
      "sourcing candidates",
      "offer letter",
      "compensation",
      "civil",
      "construction",
      "mep",
      "automotive",
    ],
  },
  "Software QA": {
    weight: 1,
    titleBoost: 1.3,
    phrases: [
      "quality engineer",
      "quality assurance",
      "test engineer",
      "software developer in test",
      "test case",
      "test plan",
      "test strategy",
      "test execution",
      "bug report",
      "api testing",
      "ui testing",
      "regression testing",
      "functional testing",
      "performance testing",
      "load testing",
      "acceptance testing",
      "integration testing",
      "e2e testing",
      "black box",
      "white box",
      "software quality engineer",
      "manual & automation testing",
      "test coverage",
      "bug reports",
      "defect tracking",
      "testing web applications",
      "qa specialist",
      "selenium testing",
      "rest assured",
      "ready api",
      "smoke test",
      "test management tools",
      "root cause analysis",
      "agile qa",
      "compliance testing",
    ],
    terms: [
      "qa",
      "quality",
      "tester",
      "testing",
      "sdet",
      "automation",
      "selenium",
      "cypress",
      "playwright",
      "postman",
      "soapui",
      "jmeter",
      "testrail",
      "qtest",
      "jira",
      "appium",
      "webdriverio",
      "k6",
      "gatling",
      "sonarqube",
      "uipath test",
      "tosca",
      "tdd",
      "bdd",
      "defect",
      "manual testing",
      "databricks",
      "kubernetes",
      "validation",
      "logs",
      "testng",
      "junit",
      "bitbucket",
      "zephyr",
      "post-release",
      "post-implementation",
    ],
    negative: [
      "hardware",
      "pcb",
      "rtl",
      "firmware",
      "fpga",
      "asic",
      "oscilloscope",
      "electrical",
      "sre",
      "site reliability",
      "platform engineer",
      "on-call",
      "incident management",
      "software architect",
      "building features",
      "mep",
      "civil",
      "civil engineering",
      "construction",
      "plumbing",
      "fire fighting",
      "building system",
      "real estate",
      "residential construction",
      "structural",
      "sop",
      "itp",
      "qms",
      "snagging",
      "compliance",
      "banking regulations",
      "audit",
      "mis",
      "automotive",
      "mechanical",
      "casting",
      "machining",
      "manufacturing",
      "emotor",
      "electric vehicle",
      "drivetrain",
      "talent acquisition",
      "recruitment",
      "hiring",
    ],
  },
  "Hardware QA": {
    weight: 1,
    titleBoost: 1.4,
    phrases: [
      "hardware test",
      "validation engineer",
      "system validation",
      "silicon validation",
      "post-silicon",
      "pre-silicon",
      "board bring-up",
      "manufacturing test",
      "power integrity",
      "mechanical engineer",
      "mechanical design engineer",
      "electric motor",
      "electric vehicle",
      "manufacturing drawings",
      "bill of materials",
      "component development",
      "industrial manufacturing",
      "geometric dimensioning",
      "gd&t",
      "manufacturing processes",
      "additive manufacturing",
      "aluminum die casting",
      "plastic injection moulding",
    ],
    terms: [
      "hardware",
      "pcb",
      "rtl",
      "fpga",
      "asic",
      "embedded",
      "firmware",
      "board design",
      "schematic",
      "layout",
      "lab",
      "oscilloscope",
      "signal integrity",
      "logic analyzer",
      "spectrum analyzer",
      "jtag",
      "debugger",
      "multimeter",
      "test fixture",
      "electrical",
      "bench testing",
      "emc",
      "emi",
      "mechatronics",
      "electromechanical",
      "3d cad",
      "sensors",
      "valves",
      "fmea",
      "prototypes",
      "emotor",
      "automotive",
      "drivetrain",
      "casting",
      "machining",
      "stamping",
      "catia",
    ],
    negative: [
      "web",
      "frontend",
      "backend",
      "microservices",
      "ui",
      "api testing",
      "react",
      "node.js",
      "javascript",
      "css",
      "html",
      "java",
      "c#",
      "full stack",
      "cloud",
      "aws",
      "gcp",
      "azure",
      "devops",
      "sre",
      "ci/cd",
      "mep",
      "civil",
      "construction",
      "plumbing",
      "talent acquisition",
      "recruitment",
      "hiring",
    ],
  },
  "DevOps/SRE": {
    weight: 1,
    titleBoost: 1.3,
    phrases: [
      "site reliability",
      "platform engineer",
      "infrastructure engineer",
      "service mesh",
      "infrastructure as code",
      "incident management",
      "high availability",
      "disaster recovery",
    ],
    terms: [
      "devops",
      "sre",
      "reliability engineer",
      "cloud engineer",
      "kubernetes",
      "k8s",
      "docker",
      "helm",
      "terraform",
      "ansible",
      "puppet",
      "chef",
      "saltstack",
      "container",
      "ci/cd",
      "github actions",
      "jenkins",
      "gitlab ci",
      "circleci",
      "travis ci",
      "prometheus",
      "grafana",
      "observability",
      "pagerduty",
      "datadog",
      "cloudwatch",
      "splunk",
      "elk",
      "elasticsearch",
      "logstash",
      "kibana",
      "new relic",
      "cloud",
      "aws",
      "gcp",
      "azure",
      "istio",
      "envoy",
      "on-call",
      "incident",
      "postmortem",
      "iac",
      "automation",
      "scripting",
      "bash",
      "powershell",
      "slo",
      "sli",
      "sla",
      "scalability",
      "monitoring",
      "logging",
      "alerting",
    ],
    negative: [
      "manual testing",
      "test case",
      "ui automation",
      "qa",
      "quality assurance",
      "sdet",
      "test plan",
      "bug report",
      "selenium",
      "cypress",
      "frontend",
      "react",
      "angular",
      "vue",
      "ui/ux",
      "application developer",
      "hardware",
      "pcb",
      "fpga",
      "embedded",
      "firmware",
      "oscilloscope",
      "rtl",
      "talent acquisition",
      "recruitment",
      "hiring",
      "sourcing candidates",
      "offer letter",
      "compensation",
      "civil",
      "construction",
      "mep",
      "automotive",
      "mechanical",
    ],
  },
};

const UNKNOWN = "Unknown";

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
    if (/\bsdet\b/.test(title)) {
      if (cat === "Software QA") {
        s += 3;
      }
    }
    if (/\bdevops\b|\bsre\b/.test(title)) {
      if (cat === "DevOps/SRE") {
        s += 3;
      }
    }
    if (/\bhardware\b|\bembedded\b|\bfirmware\b/.test(title)) {
      if (cat === "Hardware QA") {
        s += 2;
      }
    }
    if (/\bdeveloper\b|\bsoftware engineer\b/.test(title)) {
      if (cat === "Software Dev") {
        s += 2;
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

    // Nudge for AI/ML: if 'mlops' and 'ci/cd' are present, boost 'Software Dev'
    if (cat === "Software Dev") {
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
  if (bestScore < 3 || margin < 1) {
    if (/\bqa\b|\btester\b|\bquality\b|\bsdet\b/.test(title)) {
      finalCat = "Software QA";
    } else if (/\bdevops\b|\bsre\b|\bsite reliability\b/.test(title)) {
      finalCat = "DevOps/SRE";
    } else if (
      /\bhardware\b|\bfirmware\b|\bembedded\b|\bmechanical\b/.test(title)
    ) {
      finalCat = "Hardware QA";
    }
  }

  // Unknown if very low confidence
  if (conf < 0.35 || bestScore < 2) {
    // Check for strong non-tech signals before defaulting to UNKNOWN
    if (
      /\b(talent acquisition|recruitment|hiring|recruiter)\b/.test(title) ||
      /\b(compliance|audit)\b/.test(title) ||
      /\b(civil|construction|mep)\b/.test(title)
    ) {
      finalCat = UNKNOWN; // This is definitely not a tech role we cover
    } else if (bestScore < 2) {
      finalCat = UNKNOWN; // Genuinely low score
    }
  }

  // Final check: if 'Software QA' won but has strong construction/civil negatives in title, kick to Unknown
  if (
    finalCat === "Software QA" &&
    /\b(mep|civil|construction)\b/.test(title)
  ) {
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

let OUTPUT_FILE = path.resolve(__dirname, "jobs.json");
// CLI usage: node classify.js
if (require.main === module) {
  const input = process.argv[2];
  if (input) {
    OUTPUT_FILE = path.resolve(input);
  }

  try {
    // Read the file
    const raw = fs.readFileSync(OUTPUT_FILE, "utf-8");
    const jobs = JSON.parse(raw);

    // Classify the jobs
    const out = classifyJobs(jobs);

    // Convert back to a nicely formatted JSON string
    const outputJson = JSON.stringify(out, null, 2);

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

module.exports = { classifyJobs, scoreDoc, CATEGORIES, UNKNOWN };
