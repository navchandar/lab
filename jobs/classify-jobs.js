const fs = require("fs");
const path = require("path");

const CATEGORIES = {
  SoftwareDEV: {
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
      "solution engineer",
      "feature engineering",
      "model training",
      "data pipeline",
      "computer vision",
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
      "genai",
      "rag",
      "sagemaker",
      "bedrock",
    ],
    negative: [
      // QA / Testing
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
      // DevOps/SRE
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
      // Hardware/Mech
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
      // Non-dev recruiting/ops
      "talent acquisition",
      "recruitment",
      "hiring",
      "sourcing candidates",
      "offer letter",
      "compensation",
      // Construction & civil
      "civil",
      "construction",
      "mep",
      // Out-of-scope tech mgmt
      "product manager",
      "project manager",
      "agile coach",
      "scrum master",
      "business intelligence",
    ],
  },

  SoftwareQA: {
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
      "manual and automation testing",
      "test coverage",
      "defect tracking",
      "defect triage",
      "testing web applications",
      "qa automation",
      "qa specialist",
      "qa architect",
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
      "seleniumbase",
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
      "validation",
      "logs",
      "testng",
      "junit",
      "zephyr",
      "post-release",
      "post-implementation",
      "bug bash",
      "sanity testing",
      "smoke testing",
    ],
    negative: [
      // Hardware
      "hardware",
      "pcb",
      "rtl",
      "firmware",
      "fpga",
      "asic",
      "oscilloscope",
      "electrical",
      // DevOps/SRE
      "sre",
      "site reliability",
      "platform engineer",
      "on-call",
      "incident management",
      // Pure architecture build roles
      "software architect",
      "building features",
      // Construction/Civil/Manufacturing
      "mep",
      "civil",
      "civil engineering",
      "construction",
      "plumbing",
      "fire fighting",
      "real estate",
      "residential construction",
      "structural",
      // Industry QA that is not SoftwareQA (we avoid misclassifying):
      "qms",
      "snagging",
      "sop",
      "itp",
      // Heavier BI/warehouse (goes to DataEngg)
      "data warehousing",
      "etl",
      // Non-tech roles
      "talent acquisition",
      "recruitment",
      "hiring",
      "mechanical",
      "casting",
      "machining",
      "manufacturing",
      "emotor",
      "electric vehicle",
      // Product/Program
      "product roadmap",
      "stakeholder management",
      "budget",
    ],
  },

  HardwareQA: {
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
      "ansys",
    ],
    negative: [
      // Software/web
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
      // Cloud/devops
      "cloud",
      "aws",
      "gcp",
      "azure",
      "devops",
      "sre",
      "ci/cd",
      // Non-relevant
      "mep",
      "civil",
      "construction",
      "plumbing",
      "talent acquisition",
      "recruitment",
      "hiring",
      "product roadmap",
      "stakeholder management",
      "etl",
      "data lake",
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
      "platform as code",
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
      "product strategy",
      "business analyst",
      "scrum master",
      "tableau",
    ],
  },

  DataEngg: {
    weight: 1,
    titleBoost: 1.4,
    phrases: [
      "data engineer",
      "etl developer",
      "data pipeline",
      "data warehousing",
      "business intelligence",
      "big data",
      "data modeling",
      "data governance",
      "data quality assurance",
      "master data management",
      "analytics engineer",
    ],
    terms: [
      "spark",
      "hadoop",
      "hive",
      "kafka",
      "airflow",
      "etl",
      "elt",
      "data lake",
      "databricks",
      "dbt",
      "tableau",
      "power bi",
      "qlik",
      "snowflake",
      "redshift",
      "dynamodb",
      "bigquery",
      "nosql",
      "ssis",
      "ssas",
      "ssrs",
      "data vault",
      "fivetran",
      "stitch",
      "glue",
      "lakehouse",
    ],
    negative: [
      "frontend",
      "ui",
      "ux",
      "react",
      "angular",
      "vue",
      "mobile",
      "qa",
      "tester",
      "sdet",
      "manual testing",
      "firmware",
      "hardware",
      "pcb",
      "fpga",
      "oscilloscope",
      "mechanical",
      "incident management",
      "on-call",
      "kubernetes",
      "scrum master",
      "product roadmap",
      "stakeholder",
    ],
  },

  "ML/AI": {
    weight: 1,
    titleBoost: 1.4,
    phrases: [
      "data scientist",
      "machine learning scientist",
      "applied scientist",
      "ml engineer",
      "ml research",
      "research scientist",
      "computer vision",
      "natural language processing",
      "nlp",
      "recommendation systems",
      "time series forecasting",
      "experiment design",
      "ab testing",
    ],
    terms: [
      "ml",
      "ai",
      "llm",
      "genai",
      "rag",
      "prompt engineering",
      "feature engineering",
      "model training",
      "model evaluation",
      "model tuning",
      "hyperparameter",
      "pytorch",
      "tensorflow",
      "sklearn",
      "xgboost",
      "lightgbm",
      "huggingface",
      "vector db",
      "faiss",
      "milvus",
      "weaviate",
      "sagemaker",
      "bedrock",
      "comet",
      "wandb",
      "mlflow",
      "notebook",
      "statistics",
      "bayesian",
      "regression",
      "classification",
      "clustering",
      "experiment tracking",
      "offline evaluation",
      "online metrics",
    ],
    negative: [
      "test case",
      "manual testing",
      "qa",
      "tester",
      "on-call",
      "incident",
      // DevOps
      "jenkins",
      "terraform",
      "kubernetes",
      "pcb",
      "rtl",
      "fpga",
      // Hardware
      "oscilloscope",
      "talent acquisition",
      "recruitment",
      "hiring",
      "product roadmap",
      "stakeholder management",
    ],
  },

  Security: {
    weight: 1,
    titleBoost: 1.4,
    phrases: [
      "security engineer",
      "application security",
      "cloud security",
      "product security",
      "security analyst",
      "security operations",
      "soc analyst",
      "penetration testing",
      "red team",
      "blue team",
      "threat detection",
      "security architecture",
      "identity and access management",
      "iam",
      "governance risk compliance",
      "grc",
      "risk management",
      "vulnerability management",
      "terminal security",
      "security operations",
      "access control and key management",
      "mock drills",
      "vvip movement",
    ],
    terms: [
      "infosec",
      "appsec",
      "secops",
      "siem",
      "soar",
      "splunk",
      "qrader",
      "sentinel",
      "crowdstrike",
      "okta",
      "auth0",
      "sso",
      "mfa",
      "oidc",
      "oauth",
      "nist",
      "iso 27001",
      "soc2",
      "pci-dss",
      "hipaa",
      "gdpr",
      "burp",
      "zap",
      "nessus",
      "qualys",
      "osint",
      "mitre att&ck",
      "owasp",
      "secrets scanning",
      "sast",
      "dast",
      "sca",
      "key management",
      "access control",
      "biometric",
      "concessionaires",
    ],
    negative: [
      "qa",
      "tester",
      "manual testing",
      "frontend",
      "react",
      "angular",
      "vue",
      "pcb",
      "fpga",
      "oscilloscope",
      "etl",
      "data warehousing",
      "scrum master",
      "product manager",
    ],
  },

  RPA: {
    weight: 1,
    titleBoost: 1.3,
    phrases: [
      "rpa developer",
      "uipath developer",
      "automation anywhere developer",
      "blue prism developer",
      "robotic process automation",
      "attended automation",
      "unattended automation",
      "UiPath Orchestrator",
      "UiPath Studio",
      "UiPath Assistant",
      "UiPath ReFramework",
      "UiPath Document Understanding",
      "UiPath AI Center",
      "UiPath Action Center",
      "UiPath Insights",
      "UiPath Governance",
      "UiPath Deployment",
      "UiPath Licensing",
      "UiPath Queue Management",
      "UiPath Trigger Management",
      "UiPath Asset Management",
      "UiPath Package Deployment",
      "UiPath Marketplace",
    ],
    terms: [
      "uipath",
      "automation anywhere",
      "blue prism",
      "orchestrator",
      "reframework",
      "workflow analyzer",
      "invoke workflow",
      "custom activity",
      "robot provisioning",
      "package publishing",
      "transaction item",
      "queue trigger",
      "automation hub",
      "document understanding",
      "ocr engines",
      "ai fabric",
      "action center",
      "insights dashboard",
    ],
    negative: [
      "qa",
      "test case",
      "manual testing",
      "kubernetes",
      "terraform",
      "jenkins",
      "pcb",
      "rtl",
      "fpga",
      // Physical/Aviation Security / Airport Ops
      "immigration",
      "customs",
      "airport",
      "terminal",
      "igia",
      "skytrax",
      "security operations",
      "key management",
      "access control",
      "biometric access",
      "mock drills",
      "vvip",
      "touting",
      "concessionaires",
      "house keeping agencies",
      // Cyber/DevOps terms
      "kubernetes",
      "terraform",
      "prometheus",
      "grafana",
      // QA specific test frameworks
      "selenium",
      "cypress",
      "postman",
      "api testing",
      "test case",
      "sdet",
      "recruitment",
      "talent acquisition",
      "hiring",
    ],
  },

  DBA: {
    weight: 1,
    titleBoost: 1.4,
    phrases: [
      "database administrator",
      "database reliability engineer",
      "performance tuning",
      "backup and recovery",
      "disaster recovery",
      "replication",
      "high availability",
    ],
    terms: [
      "oracle dba",
      "sql server dba",
      "mysql dba",
      "postgres dba",
      "pl/sql",
      "t-sql",
      "indexing",
      "query tuning",
      "partitioning",
      "rds",
      "aurora",
      "exadata",
      "asm",
      "golden gate",
      "logical replication",
    ],
    negative: [
      "etl",
      "spark",
      "airflow",
      "kubernetes",
      "terraform",
      "selenium",
      "cypress",
      "pcb",
      "rtl",
    ],
  },

  Management: {
    weight: 1,
    titleBoost: 1.8,
    phrases: [
      "product manager",
      "project manager",
      "scrum master",
      "agile coach",
      "product owner",
      "business analyst",
      "product strategy",
      "product roadmap",
      "stakeholder management",
      "user stories",
      "requirements gathering",
      "go-to-market",
      "pmp certified",
      "program manager",
      "delivery manager",
    ],
    terms: [
      "agile",
      "scrum",
      "kanban",
      "pmp",
      "csm",
      "jira",
      "confluence",
      "trello",
      "wbs",
      "budgeting",
      "timeline",
      "risk management",
      "stakeholder",
      "feature",
      "release",
      "mvp",
      "okr",
      "kpi",
      "gantt",
      "project",
      "product",
      "management",
      "analyst",
      "ux research",
      "market research",
      "roadmap",
      "portfolio",
    ],
    negative: [
      "coding",
      "javascript",
      "python",
      "java",
      "c#",
      "sql",
      "api development",
      "full stack",
      "backend",
      "frontend",
      "developer",
      "engineer",
      "qa",
      "tester",
      "sdet",
      "manual testing",
      "automation",
      "kubernetes",
      "terraform",
      "devops",
      "sre",
      "hardware",
      "pcb",
      "rtl",
      "firmware",
    ],
  },
};

// Role-defining title nudges only (specific > generic). Order matters.
const TITLE_NUDGES = [
  // --- SoftwareQA ---
  {
    regex: /\b(sdet|software\s*developer\s*in\s*test)\b/i,
    cat: "SoftwareQA",
    boost: 5,
  },
  {
    regex:
      /\b(qa\s*engineer|quality\s*engineer|test\s*automation|automation\s*tester)\b/i,
    cat: "SoftwareQA",
    boost: 4,
  },
  {
    regex: /\b(test\s*architect|qa\s*architect)\b/i,
    cat: "SoftwareQA",
    boost: 3,
  },

  // --- DevOps / SRE / Platform (infra) ---
  {
    regex: /\b(sre|site\s*reliability\s*engineer)\b/i,
    cat: "DevOps/SRE",
    boost: 5,
  },
  {
    regex:
      /\b(devops|platform\s*engineer|production\s*engineer|infrastructure\s*engineer)\b/i,
    cat: "DevOps/SRE",
    boost: 4,
  },

  // --- HardwareQA / Embedded / Silicon / Mechanical ---
  {
    regex:
      /\b(asic|fpga|rtl|post-?silicon|pre-?silicon|silicon\s*validation)\b/i,
    cat: "HardwareQA",
    boost: 5,
  },
  {
    regex:
      /\b(hardware|embedded|firmware|validation\s*engineer|mechatronics|electro-?mechanical|mechanical)\b/i,
    cat: "HardwareQA",
    boost: 4,
  },

  // --- Data Engineering / Analytics Engineering ---
  {
    regex:
      /\b(data\s*engineer|analytics\s*engineer|data\s*platform\s*engineer)\b/i,
    cat: "DataEngg",
    boost: 4,
  },
  {
    regex: /\b(etl\s*developer|data\s*architect)\b/i,
    cat: "DataEngg",
    boost: 3,
  },

  // --- Data Science / ML ---
  {
    regex: /\b(data\s*scientist|applied\s*scientist|research\s*scientist)\b/i,
    cat: "ML/AI",
    boost: 4,
  },
  // Ambiguous but useful signal; let description/keyword scoring finalize
  {
    regex:
      /\b(ml\s*engineer|machine\s*learning\s*engineer|computer\s*vision|nlp)\b/i,
    cat: "ML/AI",
    boost: 3,
  },

  // --- Security / InfoSec ---
  {
    regex:
      /\b(application\s*security|appsec|security\s*engineer|product\s*security|cloud\s*security)\b/i,
    cat: "Security",
    boost: 4,
  },
  {
    regex:
      /\b(soc\s*analyst|penetration\s*tester|red\s*team|blue\s*team|grc|governance\s*risk\s*compliance|iam)\b/i,
    cat: "Security",
    boost: 4,
  },

  // --- RPA / UiPath ---
  {
    regex:
      /\b(rpa\s*developer|uipath\s*developer|automation\s*anywhere\s*developer|blue\s*prism\s*developer|rpa\s*engineer)\b/i,
    cat: "RPA",
    boost: 5,
  },
  {
    regex: /\b(re-framework|robotic\s*process\s*automation)\b/i,
    cat: "RPA",
    boost: 4,
  },

  // --- DBA ---
  {
    regex:
      /\b(database\s*administrator|dba|database\s*reliability\s*engineer)\b/i,
    cat: "DBA",
    boost: 5,
  },
  {
    regex: /\b(oracle\s*dba|sql\s*server\s*dba|postgres\s*dba|mysql\s*dba)\b/i,
    cat: "DBA",
    boost: 5,
  },

  // --- Management / PM / Program / Scrum ---
  {
    regex:
      /\b(product\s*manager|project\s*manager|program\s*manager|delivery\s*manager|product\s*owner|scrum\s*master|agile\s*coach)\b/i,
    cat: "Management",
    boost: 5,
  },
];

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
  if (bestScore < 3 || margin < 1) {
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
    /(\d+\s*-\s*\d+|\d+\s*–\s*\d+|\d+\s*to\s*\d+|\d+\+?)\s*(?:years?|yrs?|y)?\s*(?:of\s*)?(?:experience|exp|prof|professional|background|testing|industry|relevant|hands)/gi;

  // Improved regex
  const EXPERIENCE_REGEX_2 =
    /\b(?:experience\s*[:-]?\s*|need\s+a\s*|overall\s*)?(?:(\d{1,2})\s*(?:–|-|to|plus|\+)?\s*(\d{1,2})?|\d{1,2}\s*\+?)\s*(?:years?|yrs?|y)\b(?:\s*of)?(?:\s*(?:experience|exp|background|testing|industry|relevant|hands[- ]on|experienced))?/gi;

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
        maxInMatch < 40
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
    const jobswithExp = addExperienceToJobs(jobs);
    const out = classifyJobs(jobswithExp);

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
