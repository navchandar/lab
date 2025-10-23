// version=v2025.10.23_17.21
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
  'static/images/cat.jpg',
  'static/images/dog.jpg',
  'static/settings.css',
  'static/speech_helper.js',
  'static/utils.js'
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

      // Map each URL to a Promise for cache.add()
      const cachePromises = urlsToCache.map((url) => {
        return cache.add(url)
          .then(() => ({ status: 'fulfilled', url }))
          .catch((error) => ({ status: 'rejected', url, error }));
      });

      // Wait for all caching attempts to finish (settle)
      return Promise.allSettled(cachePromises).then((results) => {
        const failed = results.filter(result => result.status === 'rejected');
        const successful = results.filter(result => result.status === 'fulfilled');

        console.log("[SW] Successfully cached", successful.length, "resources");
        if (failed.length > 0) {
          console.error("[SW]", failed.length, "resources failed to cache:", failed);
        }
      });
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