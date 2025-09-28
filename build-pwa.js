const fs = require("fs");
const path = require("path");

console.log("🚀 Starting PWA file generation with Node.js...");

const ROOT_DIR = ".";
const IGNORED_DIRS = [
  ".git",
  ".github",
  "node_modules",
  "config",
  "Lychee",
  "stefanzweifel",
];
const IGNORED_FILES = [
  "build-pwa.js",
  "README.md",
  "service-worker.js",
  ".gitignore",
  "LICENSE",
];
const staticFiles = [
  "./",
  "./index.html",
  "./static/app_stylesheet.css",
  "./manifest.json",
  "./static/icons/icon-192x192.png",
  "./static/icons/icon-512x512.png",
];
// --- 1. Generate index.html ---

function generateIndexHtml() {
  console.log("🎨 Generating index.html...");
  const potentialAppDirs = fs
    .readdirSync(ROOT_DIR, { withFileTypes: true })
    .filter(
      (dirent) => dirent.isDirectory() && !IGNORED_DIRS.includes(dirent.name)
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
      const displayName = appName.toUpperCase();
      return `            <li><a href="./${appName}/index.html" target="appFrame">${displayName}</a></li>`;
    })
    .join("\n");

  const indexHtmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lab App</title>
    <link rel="manifest" href="manifest.json">

    <meta name="description" content="A centralized Progressive Web App (PWA) hosting a collection of small, useful web applications, educational games, and development tools.">
    <meta name="author" content="Naveenchandar">
    <meta property="og:title" content="Lab App">
    <meta property="og:type" content="website">

    <link rel="icon" type="image/png" sizes="192x192"  href="./static/icons/ico/android-icon-192x192.png">
    <link rel="icon" type="image/png" sizes="32x32" href="./static/icons/ico/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="96x96" href="./static/icons/ico/favicon-96x96.png">
    <link rel="icon" type="image/png" sizes="16x16" href="./static/icons/ico/favicon-16x16.png">
    <link rel="apple-touch-icon" sizes="57x57" href="./static/icons/ico/apple-icon-57x57.png">
    <link rel="apple-touch-icon" sizes="60x60" href="./static/icons/ico/apple-icon-60x60.png">
    <link rel="apple-touch-icon" sizes="72x72" href="./static/icons/ico/apple-icon-72x72.png">
    <link rel="apple-touch-icon" sizes="76x76" href="./static/icons/ico/apple-icon-76x76.png">
    <link rel="apple-touch-icon" sizes="114x114" href="./static/icons/ico/apple-icon-114x114.png">
    <link rel="apple-touch-icon" sizes="120x120" href="./static/icons/ico/apple-icon-120x120.png">
    <link rel="apple-touch-icon" sizes="144x144" href="./static/icons/ico/apple-icon-144x144.png">
    <link rel="apple-touch-icon" sizes="152x152" href="./static/icons/ico/apple-icon-152x152.png">
    <link rel="apple-touch-icon" sizes="180x180" href="./static/icons/ico/apple-icon-180x180.png">
    <meta name="msapplication-TileColor" content="#ffffff">
    <meta name="msapplication-TileImage" content="./static/icons/ico/ms-icon-144x144.png">
    <meta name="theme-color" content="#ffffff">

    <link rel="stylesheet" href="./static/app_stylesheet.css">
  </head>
<body>
    <header><h1>Apps</h1></header>

    <div id="app-container">
      <button id="hamburger-menu" aria-label="Toggle menu">☰</button>
      <nav id="sidebar">
          <ul id="app-links">
              ${appLinks}
          </ul>
      </nav>
      <main><iframe name="appFrame" id="appFrame"></iframe></main>
    </div>

    <script src="./static/app_script.js"></script>

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
    ])
  )
    .filter((file) => file && file.trim() !== "")
    .map((file) => `'${file}'`);

  console.log("🧾 Files to cache:", allFilesToCache);

  const swTemplate = `
const CACHE_NAME = 'lab-full-app-v1-' + new Date().getTime();
const urlsToCache = [
    ${allFilesToCache.join(",\n  ")}
];

const duplicates = urlsToCache.filter((item, index, arr) => arr.indexOf(item) !== index);
if (duplicates.length > 0) {
  console.warn("[SW] Duplicate URLs detected in cache list:", duplicates);
}

self.addEventListener("install", (event) => {
  console.log("[SW] Installing and caching:", CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Caching app shell...");
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
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
  event.respondWith(
    (async () => {

      try {
        const requestUrl = new URL(event.request.url);

        // Skip unsupported schemes like chrome-extension
        if (requestUrl.protocol !== 'http:' && requestUrl.protocol !== 'https:') {
          return fetch(event.request);
        }

        const cachedResponse = await caches.match(event.request);
        const fetchPromise = fetch(event.request).then(async networkResponse => {
          try {
            const cache = await caches.open(CACHE_NAME);
            cache.put(event.request, networkResponse.clone());
          } catch (cacheError) {
            console.warn("[SW] Failed to update cache:", cacheError);
          }
          return networkResponse;
        });

        // Return cached response immediately, update in background
        return cachedResponse || fetchPromise;
      } catch (error) {
        console.error("[SW] Fetch handler failed:", error);
        return new Response("Service unavailable", {
          status: 503,
          statusText: "Service Unavailable",
        });
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
