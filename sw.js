/**
 * A Collection Catalog — Service Worker
 *
 * PWA offline caching strategy:
 * - App shell (HTML, CSS, JS, manifest): cache-first (instant load)
 * - catalog.json + images: stale-while-revalidate (fast load + auto-update)
 *
 * Versioned by SW_VERSION — bump this when changing the cached app shell.
 * catalog.json is NEVER long-cached — it must update on every publish.
 */

const SW_VERSION = 'v1.0.0';
const APP_SHELL_CACHE = `acollection-shell-${SW_VERSION}`;
const DATA_CACHE = `acollection-data-${SW_VERSION}`;

// Files that make up the app shell (cached on install for offline use)
const APP_SHELL_FILES = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json',
];

// Install: cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => {
      console.log('[SW] Caching app shell');
      return cache.addAll(APP_SHELL_FILES);
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== APP_SHELL_CACHE && key !== DATA_CACHE)
          .map((key) => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    })
  );
  self.clients.claim();
});

// Fetch: route requests to appropriate caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests (Tailwind CDN, Alpine.js, Fuse.js, fonts)
  if (url.origin !== self.location.origin) return;

  // catalog.json — stale-while-revalidate (must update on every publish)
  if (url.pathname.endsWith('catalog.json') || url.pathname.includes('catalog.json')) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }

  // Images — stale-while-revalidate (cache for fast load, update in background)
  if (url.pathname.startsWith('/data/images/') || url.pathname.includes('/data/images/')) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }

  // App shell (HTML, CSS, JS, manifest) — cache-first for instant load
  event.respondWith(
    caches.match(request).then((cached) => {
      return cached || fetch(request).then((response) => {
        // Cache newly fetched app shell files
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(APP_SHELL_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});

// Stale-while-revalidate: serve from cache immediately, fetch fresh in background
function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then((cache) => {
    return cache.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        // Only cache successful responses
        if (response && response.status === 200 && response.type === 'basic') {
          cache.put(request, response.clone());
        }
        return response;
      }).catch(() => {
        // Network failed — return cached version if available, else undefined
        return cached;
      });
      // Return cached immediately, or wait for network if no cache
      return cached || fetchPromise;
    });
  });
}

// Allow page to trigger immediate SW update
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
