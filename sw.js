/**
 * A Collection Catalog — Service Worker v2
 *
 * v0.16.3: Fixed cache strategy so customers never need to hard-refresh.
 *
 * Strategy:
 * - App shell (HTML/CSS/JS/manifest): stale-while-revalidate
 *   → serves cached version instantly, fetches fresh in background,
 *     if fresh differs, triggers update notification
 * - catalog.json + images: stale-while-revalidate (fast load + auto-update)
 * - Cross-origin CDN (Tailwind/Alpine/Fuse.js): network-only (don't cache)
 *
 * Update flow:
 * 1. SW_VERSION bumped on every deploy (set by build process)
 * 2. Browser detects SW file changed → installs new SW in background
 * 3. New SW calls skipWaiting() → activates immediately
 * 4. New SW claims all clients → clients.claim()
 * 5. Page receives 'controllerchange' event → shows "Update ready" toast
 * 6. User clicks refresh → new app shell loads
 *
 * If user ignores the toast, they'll get the new version on next visit.
 */

// v0.16.3: Bump this version on every catalog code update (HTML/JS/CSS changes)
// Format: YYYYMMDD-HHMM (deploy timestamp)
const SW_VERSION = '20260702-0800-v3';
const APP_SHELL_CACHE = `acollection-shell-${SW_VERSION}`;
const DATA_CACHE = `acollection-data-v2`;

// Files that make up the app shell (cached for offline use)
const APP_SHELL_FILES = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json',
  './logo-header.png',
  './icon-192.png',
  './icon-512.png',
];

// Install: pre-cache app shell
self.addEventListener('install', (event) => {
  console.log(`[SW ${SW_VERSION}] Installing...`);
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => {
      console.log(`[SW ${SW_VERSION}] Caching app shell`);
      return cache.addAll(APP_SHELL_FILES);
    })
  );
  // skipWaiting() makes the new SW activate immediately, without waiting
  // for all tabs to close. This means the update applies as soon as it's
  // downloaded — user just needs to refresh once.
  self.skipWaiting();
});

// Activate: clean up old caches + claim clients
self.addEventListener('activate', (event) => {
  console.log(`[SW ${SW_VERSION}] Activating...`);
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== APP_SHELL_CACHE && key !== DATA_CACHE)
          .map((key) => {
            console.log(`[SW ${SW_VERSION}] Deleting old cache:`, key);
            return caches.delete(key);
          })
      );
    })
  );
  // clients.claim() makes this SW control all open tabs immediately,
  // without requiring a page reload. Combined with skipWaiting(), this
  // means the new SW takes over as soon as it's activated.
  self.clients.claim();
});

// Fetch: route requests to appropriate caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests (Tailwind CDN, Alpine.js, Fuse.js, fonts)
  // — let them go to network, don't cache (CDN handles its own caching)
  if (url.origin !== self.location.origin) return;

  // catalog.json — stale-while-revalidate (must update on every publish)
  if (url.pathname.endsWith('catalog.json')) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }

  // Images — stale-while-revalidate (cache for fast load, update in background)
  if (url.pathname.includes('/data/images/')) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }

  // App shell (HTML, CSS, JS, manifest, icons) — stale-while-revalidate
  // Serves cached instantly (fast load), fetches fresh in background.
  // If fresh differs from cached, the page will get a 'controllerchange'
  // event on next SW update — but for app shell we also use a version
  // check via the SW_VERSION constant.
  event.respondWith(staleWhileRevalidate(request, APP_SHELL_CACHE));
});

// Stale-while-revalidate: serve from cache immediately, fetch fresh in background
function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then((cache) => {
    return cache.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        // Only cache successful basic responses
        if (response && response.status === 200 && response.type === 'basic') {
          cache.put(request, response.clone());
        }
        return response;
      }).catch(() => {
        // Network failed — return cached version if available
        return cached;
      });
      // Return cached immediately, or wait for network if no cache
      return cached || fetchPromise;
    });
  });
}

// Listen for messages from the page (e.g., "SKIP_WAITING" trigger)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'GET_VERSION') {
    // Report current SW version to the page (for update detection)
    event.ports[0].postMessage({ version: SW_VERSION });
  }
});
