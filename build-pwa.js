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
  "./static/pwa-style.css",
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
      const displayName = appName.charAt(0).toUpperCase() + appName.slice(1);
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
    <meta name="description" content="A centralized Progressive Web App (PWA) hosting a collection of small, useful web applications, educational games, and development tools.">
    <meta name="author" content="Naveenchandar">

    <meta property="og:title" content="Lab App">
    <meta property="og:type" content="website">

    <link rel="manifest" href="manifest.json">
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

    <link rel="stylesheet" href="./static/pwa-style.css">
    <style>
        #update-notification { display: none; position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background-color: #333; color: white; padding: 15px 25px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.2); z-index: 1000; font-family: sans-serif; text-align: center; }
        #update-notification button { background-color: #4CAF50; color: white; border: none; padding: 8px 16px; border-radius: 5px; cursor: pointer; margin-left: 15px; }
    </style>
</head>
<body>
    <header><h1>Lab Apps</h1></header>
     <div id="app-container">
        <nav>
            <ul>
${appLinks}
            </ul>
        </nav>
        <main><iframe name="appFrame"></iframe></main>
    </div>

    <div id="update-notification">
        <span>A new version is available!</span>
        <button id="refresh-button">Refresh</button>
    </div>

    <script>
        const swPath = './service-worker.js';
        let newWorker;

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register(swPath, { scope: '/' })
                    .then(registration => {
                        console.log('✅ Service Worker registered with scope:', registration.scope);

                        registration.addEventListener('updatefound', () => {
                            newWorker = registration.installing;

                            newWorker.addEventListener('statechange', () => {
                                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                    if (navigator.vibrate) {
                                        navigator.vibrate(100);
                                    }

                                    // Show update notification
                                    const updateNotification = document.getElementById('update-notification');
                                    if (updateNotification) {
                                        updateNotification.style.display = 'block';
                                    }
                                }
                            });
                        });
                    })
                    .catch(error => {
                        console.error('❌ Service Worker registration failed:', error);
                    });

                // Listen for refresh button click to activate new worker
                const refreshButton = document.getElementById('refresh-button');
                if (refreshButton) {
                    refreshButton.addEventListener('click', () => {
                        if (newWorker) {
                            newWorker.postMessage({ action: 'skipWaiting' });
                        }
                    });
                }

                // Reload page when new service worker takes control
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    window.location.reload();
                });
            });
        }
    </script>

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
  const allFilesToCache = [...staticFiles, ...allAppFiles]
    // Remove duplicates
    .filter((value, index, self) => self.indexOf(value) === index)
    .map((file) => `    '${file}'`)
    .join(",\n");

  const swTemplate = `
const CACHE_NAME = 'lab-full-app-v1-' + new Date().getTime();
const urlsToCache = [
${allFilesToCache}
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => Promise.all(
      cacheNames.map(cacheName => {
        if (!cacheWhitelist.includes(cacheName)) {
          return caches.delete(cacheName);
        }
      })
    )).then(() => self.clients.claim())
  );
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
