const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

console.log("🚀 Starting PWA file generation with Node.js...");

const ROOT_DIR = ".";
const IGNORED_DIRS = [
  ".git",
  ".github",
  "config",
  "node_modules",
  "Lychee",
  "stefanzweifel",
  "ip",
  "jobs",
  "smart-dom-inspector",
  "serviceability",
  "hospitals",
  "pm-e-drive",
];
const IGNORED_FILES = [
  "build-pwa.js",
  "service-worker.js",
  ".gitignore",
  "README.md",
  "LICENSE",
  "package.json",
  "package-lock.json",
];
const staticFiles = [
  "./",
  "./index.html",
  "./static/app_stylesheet.css",
  "./manifest.json",
  "./static/icons/icon-192x192.png",
  "./static/icons/icon-512x512.png",
];

const now = new Date();
// Convert to IST (UTC + 5:30)
const istOffset = 5.5 * 60 * 60 * 1000;
const istTime = new Date(now.getTime() + istOffset);
const yr = String(istTime.getFullYear());
const mon = String(istTime.getMonth() + 1).padStart(2, "0");
const date = String(istTime.getDate()).padStart(2, "0");
const hh = String(istTime.getHours()).padStart(2, "0");
const mm = String(istTime.getMinutes()).padStart(2, "0");
// Format: vYYYY.MM.DD_HH.MM
const versionString = `v${yr}.${mon}.${date}`;
// +`_${hh}.${mm}`;

console.log(`Version: ${versionString}`);

// --- 1. Generate index.html ---

// Extract favicon path or base64 from index.html
function getFavicon(appDir) {
  const indexPath = path.join(appDir, "index.html");
  if (!fs.existsSync(indexPath)) {
    return "";
  }

  const html = fs.readFileSync(indexPath, "utf8");
  // Load the HTML into cheerio
  const $ = cheerio.load(html);

  // Use a CSS selector to find the icon link.
  // This robustly finds links with rel="icon", "shortcut icon", "apple-touch-icon", etc.
  // It also gracefully handles any attribute order.
  const faviconTag = $('link[rel*="icon"]').first();

  if (!faviconTag.length) {
    console.warn("No favicon found in", indexPath);
    return "";
  }

  const href = faviconTag.attr("href");

  if (!href) {
    console.warn("No favicon found in", indexPath);
    return "";
  }

  // Handle base64 image immediately
  if (href.startsWith("data:image")) {
    console.warn("Base64 favicon found in", indexPath);
    return href;
  }

  // Resolve the path for local files
  const faviconPath = path.join(appDir, href);
  const relativePath = path.relative(".", faviconPath).replace(/\\/g, "/");
  console.warn("Image favicon found in", indexPath);
  return relativePath;
}

function generateIndexHtml() {
  console.log("🎨 Generating index.html...");

  const potentialAppDirs = fs
    .readdirSync(ROOT_DIR, { withFileTypes: true })
    .filter(
      (dirent) => dirent.isDirectory() && !IGNORED_DIRS.includes(dirent.name),
    );

  // Filter directories to only include those with 'index.html'
  const appDirs = potentialAppDirs.filter((dir) => {
    const indexPath = path.join(ROOT_DIR, dir.name, "index.html");
    try {
      // Check if the file exists and is accessible
      fs.accessSync(indexPath, fs.constants.F_OK);
      return true; // Keep directory if index.html exists
    } catch (e) {
      // If fs.accessSync throws an error, the file does not exist or is inaccessible
      console.log(`⚠️ Skipping folder '${dir.name}': index.html not found.`);
      return false; // Skip directory
    }
  });

  //  Generate the app links using the filtered list (appDirs)
  const appLinks = appDirs
    .map((dir) => {
      const appName = dir.name;
      const displayName = appName.toUpperCase().replace("-", " ");
      const favicon = getFavicon(`./${appName}`);
      const faviconImg = favicon
        ? `<img src="${favicon}" alt="favicon" class="favicon">`
        : "";

      return `            <li><a href="${appName}/index.html" title="${displayName}" target="appFrame">${faviconImg}${displayName}</a></li>`;
    })
    .join("\n");

  const indexHtmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mini Apps</title>
    <link rel="canonical" href="https://navchandar.github.io/lab/" />

    <meta name="description" content="A centralized Progressive Web App (PWA) hosting a collection of small, useful mini web applications, educational games, and development tools.">
    <meta name="author" content="Naveenchandar">
    <meta property="og:title" content="Mini Apps">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://navchandar.github.io/lab/">

    <meta name="msapplication-TileColor" content="#ffffff">
    <meta name="theme-color" content="#ffffff">

    <link rel="manifest" href="manifest.json">
    <link rel="stylesheet" href="./static/app_stylesheet.css">
  </head>
<body>
    <header><h1>Apps</h1></header>

    <div id="app-container">
      <button id="hamburger-menu" aria-label="Toggle menu">☰</button>
      <nav id="sidebar" class="overlay">
        <div class="sidebar-content">
            <ul id="app-links">
${appLinks}
            </ul>

            <div class="version-label">${versionString}</div>

            <div class="sidebar-info">
              <h3>🛠️ Maintainer</h3>
              <a target="_blank" href="https://navchandar.github.io/">Naveenchandar</a>
              <h3>📑 License</h3>
              <a target="_blank" href="https://github.com/navchandar/lab/blob/main/LICENSE">GPLv3</a>
            </div>
        </div>
      </nav>
      <main><iframe name="appFrame" title="App Frame" id="appFrame"></iframe></main>
    </div>

    <script type="module" src="./static/app_script.js"></script>

</body>
</html>`;

  fs.writeFileSync("index.html", indexHtmlTemplate.trim());
  console.log("✅ index.html generated successfully.");
}

// --- 2. Generate service-worker.js ---

// Recursive function to get all file paths in a directory
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (IGNORED_DIRS.includes(file) || IGNORED_FILES.includes(file)) {
      return;
    }
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      // Use forward slashes for web compatibility
      arrayOfFiles.push(fullPath.replace(/\\/g, "/"));
    }
  });
  return arrayOfFiles;
}

function generateServiceWorker() {
  console.log("👷 Generating service-worker.js...");

  const allAppFiles = getAllFiles(ROOT_DIR);

  // Ensure all paths are consistent (e.g., no ./, no trailing slashes):
  const normalizePath = (filePath) => filePath.replace(/^\.\/|\/$/g, "");
  // remove duplicates
  const allFilesToCache = Array.from(
    new Set([
      ...staticFiles.map(normalizePath),
      ...allAppFiles.map(normalizePath),
    ]),
  )
    .filter((file) => file && file.trim() !== "")
    .map((file) => `'${file}'`);

  console.log("🧾 Files to cache:", allFilesToCache);

  const swTemplate = `
// version=${versionString}

const IGNORED_DIRS = ${JSON.stringify(IGNORED_DIRS)};

const CACHE_NAME = 'lab-full-app-v1-' + new Date().getTime();
const urlsToCache = [
    ${allFilesToCache.join(",\n  ")}
];

const ALLOWED_CDN_HOSTS = new Set([
  "cdn.datatables.net",
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
]);

const duplicates = urlsToCache.filter(
  (item, index, arr) => arr.indexOf(item) !== index
);
if (duplicates.length > 0) {
  console.warn("[SW] Duplicate URLs detected in cache list:", duplicates);
}

self.addEventListener("install", (event) => {
  console.log("[SW] Installing and caching:", CACHE_NAME);

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Caching app shell...");

      // Map each URL to a Promise for cache.add()
      const cachePromises = urlsToCache.map((url) => {
        return cache
          .add(url)
          .then(() => ({ status: "fulfilled", url }))
          .catch((error) => ({ status: "rejected", url, error }));
      });

      // Wait for all caching attempts to finish (settle)
      return Promise.allSettled(cachePromises).then((results) => {
        const failed = results.filter((result) => result.status === "rejected");
        const successful = results.filter(
          (result) => result.status === "fulfilled"
        );

        console.log("[SW] Successfully cached", successful.length, "resources");
        if (failed.length > 0) {
          console.error(
            "[SW]",
            failed.length,
            "resources failed to cache:",
            failed
          );
        }

        // ONLY AFTER CACHING IS COMPLETE, THEN SKIP WAITING
        self.skipWaiting();
      });
    })
  );
});

self.addEventListener("activate", (event) => {
  console.log("[SW] Activating:", CACHE_NAME);
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) {
              console.log("[SW] Deleting old cache:", name);
              return caches.delete(name);
            }
          })
        )
      )
      .then(() => {
        console.log("[SW] Activation complete. Claiming clients...");
        self.clients.claim();
      })
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Exit early: only handle safe, HTTP(S), GET requests
  if (req.method !== "GET") {
    return;
  }
  const url = new URL(req.url);
  if (!["http:", "https:"].includes(url.protocol)) {
    return;
  }

  // skip range/credentialed requests to avoid side effects
  if (req.headers.has("range")) {
    return;
  }
  if (req.credentials === "include") {
    return;
  }

  // Domain lockdown for GitHub Pages
  const ONLY_CURRENT_HOST = true;
  const isSameOrigin = url.origin === self.location.origin;
  const isGithubPagesHost = url.hostname.endsWith(".github.io");
  const isAllowedOrigin = ONLY_CURRENT_HOST
    ? url.hostname === self.location.hostname
    : isSameOrigin || isGithubPagesHost;

  const isAllowedCdn =
    typeof ALLOWED_CDN_HOSTS !== "undefined" &&
    ALLOWED_CDN_HOSTS.has(url.hostname);

  if (!isAllowedOrigin && !isAllowedCdn) {
    return;
  }

  const normalizedPath = url.pathname.replace(/^\\/|\\/$/g, "");

  event.respondWith(
    (async () => {
      try {
        const ignoreList = Array.isArray(IGNORED_DIRS) ? IGNORED_DIRS : [];
        const isIgnored = ignoreList.some((dir) => {
          const cleanDir = String(dir).replace(/^\\/|\\/$/g, "");
          return (
            normalizedPath === cleanDir ||
            normalizedPath.startsWith(cleanDir + "/")
          );
        });

        if (isIgnored) {
          return fetch(req); // Don't cache, just fetch
        }

        const cacheList = Array.isArray(urlsToCache) ? urlsToCache : [];
        const shouldBeCached = cacheList.some((path) => {
          const cleanPath = String(path).replace(/^\\/|\\/$/g, "");
          return (
            normalizedPath === cleanPath ||
            (normalizedPath === "" && cleanPath === "index.html")
          );
        });

        if (shouldBeCached) {
          const cached = await caches.match(req);

          // Background revalidation
          const refresh = fetch(req)
            .then(async (fresh) => {
              // Allow "basic" (same-origin) OR "cors" (CDN)
              const isCacheableType =
                fresh.type === "basic" || fresh.type === "cors";
              if (fresh.ok && isCacheableType) {
                const cache = await caches.open(CACHE_NAME);
                await cache.put(req, fresh.clone());
              }
              return fresh;
            })
            .catch(() => null);

          if (cached) {
            event.waitUntil(refresh);
            return cached;
          }

          const freshResponse = await refresh;
          return freshResponse || fetch(req);
        }

        return fetch(req);
      } catch (err) {
        console.warn("[SW] Fetch error:", err);
        return fetch(req); // If error, just fetch
      }
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.action === "skipWaiting") {
    console.log("[SW] Skipping waiting...");
    self.skipWaiting();
  }
});

`;

  fs.writeFileSync("service-worker.js", swTemplate.trim());
  console.log("✅ service-worker.js generated successfully.");
}

// --- Run the generation ---

try {
  generateIndexHtml();
  generateServiceWorker();
  console.log("🎉 All files generated!");
} catch (error) {
  console.error("❌ Error generating PWA files:", error);
  process.exit(1);
}
