
const BASE = new URL(self.registration.scope);
const VENDOR = new URL("vendor/", BASE);

const CACHE_PREFIX = `video-converter:${BASE.pathname}:`;
const CACHE_NAME = `${CACHE_PREFIX}assets-v1`;

self.addEventListener("install", (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();

        await Promise.all(
            keys
                .filter((key) => {
                    return key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME;
                })
                .map((key) => caches.delete(key))
        );

        await self.clients.claim();
    })());
});

function withIsolationHeaders(response) {
    if (
        !response ||
        response.status === 0 ||
        response.type === "opaque" ||
        response.type === "opaqueredirect"
    ) {
        return response;
    }

    const headers = new Headers(response.headers);

    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    headers.set("Cross-Origin-Resource-Policy", "same-origin");

    // A fetched response body may already be decompressed.
    // Avoid retaining stale transport-level metadata.
    headers.delete("Content-Encoding");
    headers.delete("Content-Length");

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}

async function getAsset(request) {
    let cache = null;

    try {
        cache = await caches.open(CACHE_NAME);

        const cached = await cache.match(request);

        if (cached) {
            return withIsolationHeaders(cached);
        }
    } catch {
        // Private browsing, storage restrictions or quota issues should not
        // prevent ordinary network loading.
    }

    const response = await fetch(request);

    if (cache && response.ok && response.status === 200) {
        try {
            await cache.put(request, response.clone());
        } catch {
            // Caching is best-effort.
        }
    }

    return withIsolationHeaders(response);
}

self.addEventListener("fetch", (event) => {
    const request = event.request;

    if (request.method !== "GET") {
        return;
    }

    const url = new URL(request.url);

    if (
        url.origin !== BASE.origin ||
        !url.pathname.startsWith(BASE.pathname)
    ) {
        return;
    }

    // IMPORTANT: handle document navigations BEFORE checking
    // request.cache. Reloads must receive isolation headers too.
    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request).then(withIsolationHeaders)
        );

        return;
    }

    // Only handle engine assets below this point.
    if (!url.pathname.startsWith(VENDOR.pathname)) {
        return;
    }

    // Background asset preloads write directly to Cache Storage.
    // This bypass no longer affects document navigations.
    if (request.cache === "no-cache") {
        return;
    }

    if (request.headers.has("Range")) {
        return;
    }

    event.respondWith(getAsset(request));
});