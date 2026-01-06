// version=v2026.01.06

const IGNORED_DIRS = [".git",".github","config","node_modules","Lychee","stefanzweifel","ip","jobs","smart-dom-inspector","serviceability"];

const CACHE_NAME = 'lab-full-app-v1-' + new Date().getTime();
const urlsToCache = [
    'index.html',
  'static/app_stylesheet.css',
  'manifest.json',
  'static/icons/icon-192x192.png',
  'static/icons/icon-512x512.png',
  'alphabet/data.js',
  'alphabet/index.html',
  'alphabet/preview.gif',
  'alphabet/script.js',
  'alphabet/style.css',
  'animals/index.html',
  'animals/script.js',
  'animals/style.css',
  'clock/index.html',
  'clock/script.js',
  'clock/style.css',
  'color/data.js',
  'color/index.html',
  'color/preview.gif',
  'color/script.js',
  'color/style.css',
  'number/index.html',
  'number/preview.gif',
  'number/script.js',
  'number/style.css',
  'shapes/index.html',
  'shapes/script.js',
  'shapes/style.css',
  'static/app_script.js',
  'static/icons/ico/android-icon-144x144.png',
  'static/icons/ico/android-icon-192x192.png',
  'static/icons/ico/android-icon-36x36.png',
  'static/icons/ico/android-icon-48x48.png',
  'static/icons/ico/android-icon-72x72.png',
  'static/icons/ico/android-icon-96x96.png',
  'static/icons/ico/apple-icon-114x114.png',
  'static/icons/ico/apple-icon-120x120.png',
  'static/icons/ico/apple-icon-144x144.png',
  'static/icons/ico/apple-icon-152x152.png',
  'static/icons/ico/apple-icon-180x180.png',
  'static/icons/ico/apple-icon-57x57.png',
  'static/icons/ico/apple-icon-60x60.png',
  'static/icons/ico/apple-icon-72x72.png',
  'static/icons/ico/apple-icon-76x76.png',
  'static/icons/ico/apple-icon-precomposed.png',
  'static/icons/ico/apple-icon.png',
  'static/icons/ico/browserconfig.xml',
  'static/icons/ico/favicon-16x16.png',
  'static/icons/ico/favicon-32x32.png',
  'static/icons/ico/favicon-96x96.png',
  'static/icons/ico/favicon.ico',
  'static/icons/ico/ms-icon-144x144.png',
  'static/icons/ico/ms-icon-150x150.png',
  'static/icons/ico/ms-icon-310x310.png',
  'static/icons/ico/ms-icon-70x70.png',
  'static/icons/settings-open.svg',
  'static/icons/settings.svg',
  'static/images/buffalo_1.jpg',
  'static/images/buffalo_2.jpg',
  'static/images/buffalo_3.jpg',
  'static/images/buffalo_4.jpg',
  'static/images/buffalo_5.jpg',
  'static/images/camel_1.jpg',
  'static/images/camel_2.jpg',
  'static/images/camel_3.jpg',
  'static/images/camel_4.jpg',
  'static/images/camel_5.jpg',
  'static/images/cat_1.jpg',
  'static/images/cat_2.jpg',
  'static/images/cat_3.jpg',
  'static/images/cat_4.jpg',
  'static/images/cat_5.jpg',
  'static/images/chicken_1.jpg',
  'static/images/chicken_2.jpg',
  'static/images/chicken_3.jpg',
  'static/images/chicken_4.jpg',
  'static/images/chicken_5.jpg',
  'static/images/cow_1.jpg',
  'static/images/cow_2.jpg',
  'static/images/cow_3.jpg',
  'static/images/cow_4.jpg',
  'static/images/cow_5.jpg',
  'static/images/cow_6.jpg',
  'static/images/crow_1.jpg',
  'static/images/crow_2.jpg',
  'static/images/crow_3.jpg',
  'static/images/crow_4.jpg',
  'static/images/crow_5.jpg',
  'static/images/crow_6.jpg',
  'static/images/dog_1.jpg',
  'static/images/dog_2.jpg',
  'static/images/dog_3.jpg',
  'static/images/dog_4.jpg',
  'static/images/dog_5.jpg',
  'static/images/dog_6.jpg',
  'static/images/dog_7.jpg',
  'static/images/donkey_1.jpg',
  'static/images/donkey_2.jpg',
  'static/images/donkey_3.jpg',
  'static/images/donkey_4.jpg',
  'static/images/donkey_5.jpg',
  'static/images/duck_1.jpg',
  'static/images/duck_2.jpg',
  'static/images/duck_3.jpg',
  'static/images/duck_4.jpg',
  'static/images/duck_5.jpg',
  'static/images/duck_6.jpg',
  'static/images/elephant_1.jpg',
  'static/images/elephant_2.jpg',
  'static/images/elephant_3.jpg',
  'static/images/elephant_4.jpg',
  'static/images/elephant_5.jpg',
  'static/images/goat_1.jpg',
  'static/images/goat_2.jpg',
  'static/images/goat_3.jpg',
  'static/images/goat_4.jpg',
  'static/images/goat_5.jpg',
  'static/images/horse_1.jpg',
  'static/images/horse_2.jpg',
  'static/images/horse_3.jpg',
  'static/images/horse_4.jpg',
  'static/images/horse_5.jpg',
  'static/images/ox_1.jpg',
  'static/images/ox_2.jpg',
  'static/images/ox_3.jpg',
  'static/images/ox_4.jpg',
  'static/images/ox_5.jpg',
  'static/images/parrot_1.jpg',
  'static/images/parrot_2.jpg',
  'static/images/parrot_3.jpg',
  'static/images/parrot_4.jpg',
  'static/images/parrot_5.jpg',
  'static/images/pigeon_1.jpg',
  'static/images/pigeon_2.jpg',
  'static/images/pigeon_3.jpg',
  'static/images/pigeon_4.jpg',
  'static/images/pigeon_5.jpg',
  'static/images/rabbit_1.jpg',
  'static/images/rabbit_2.jpg',
  'static/images/rabbit_3.jpg',
  'static/images/rabbit_4.jpg',
  'static/images/rabbit_5.jpg',
  'static/images/rooster_1.jpg',
  'static/images/rooster_2.jpg',
  'static/images/rooster_3.jpg',
  'static/images/rooster_4.jpg',
  'static/images/rooster_5.jpg',
  'static/images/sheep_1.jpg',
  'static/images/sheep_2.jpg',
  'static/images/sheep_3.jpg',
  'static/images/sheep_4.jpg',
  'static/images/sheep_5.jpg',
  'static/images/sparrow_1.jpg',
  'static/images/sparrow_2.jpg',
  'static/images/sparrow_3.jpg',
  'static/images/sparrow_4.jpg',
  'static/images/sparrow_5.jpg',
  'static/settings.css',
  'static/speech_helper.js',
  'static/utils.js'
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

  const normalizedPath = url.pathname.replace(/^\/|\/$/g, "");

  event.respondWith(
    (async () => {
      try {
        const ignoreList = Array.isArray(IGNORED_DIRS) ? IGNORED_DIRS : [];
        const isIgnored = ignoreList.some((dir) => {
          const cleanDir = String(dir).replace(/^\/|\/$/g, "");
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
          const cleanPath = String(path).replace(/^\/|\/$/g, "");
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