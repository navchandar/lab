const CACHE_NAME = 'lab-full-app-v1-' + new Date().getTime();
const urlsToCache = [
    './',
    './index.html',
    './static/pwa-style.css',
    './manifest.json',
    './static/icons/icon-192x192.png',
    './static/icons/icon-512x512.png',
    'alphabet/data.js',
    'alphabet/index.html',
    'alphabet/preview.gif',
    'alphabet/script.js',
    'alphabet/style.css',
    'clock/index.html',
    'clock/script.js',
    'clock/style.css',
    'color/data.js',
    'color/index.html',
    'color/preview.gif',
    'color/script.js',
    'color/style.css',
    'index.html',
    'ip/index.html',
    'ip/script.js',
    'ip/style.css',
    'manifest.json',
    'number/index.html',
    'number/preview.gif',
    'number/script.js',
    'number/style.css',
    'shapes/index.html',
    'shapes/script.js',
    'shapes/style.css',
    'smart-dom-inspector/index.html',
    'smart-dom-inspector/locator_helper.js',
    'smart-dom-inspector/script.js',
    'smart-dom-inspector/style.css',
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
    'static/icons/icon-192x192.png',
    'static/icons/icon-512x512.png',
    'static/icons/settings-open.svg',
    'static/icons/settings.svg',
    'static/pwa-style.css',
    'static/settings.css',
    'static/speech_helper.js',
    'static/utils.js'
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