// Loop · service worker
// Caches the app shell so the app works offline once it has been loaded once.
// Cache-first for the app's own files; network-first for everything else.

const CACHE = 'loop-v2';
// List both possible filenames so the cache works whether the user renamed
// loop-app.html to index.html (for a clean bare URL) or kept the original.
// Missing files just fail to cache — the others still work.
const ASSETS = [
  './',
  './index.html',
  './loop-app.html',
  './manifest.json',
  './icon-180.png',
  './icon-512.png',
];

// On install: pre-cache the app shell. Use individual cache.add() calls so a
// missing file (e.g. only one of index.html / loop-app.html exists) doesn't
// abort the entire install. cache.addAll() fails atomically on any 404.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.all(ASSETS.map(url =>
        cache.add(url).catch(() => {
          // Asset missing — that's fine, skip it.
        })
      ))
    ).then(() => self.skipWaiting())
  );
});

// On activate: clear out any old caches.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// On fetch: cache-first for same-origin GET requests, network for everything else.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) {
        // Refresh the cache in the background so updates propagate next visit.
        fetch(req).then(res => {
          if (res && res.ok) {
            caches.open(CACHE).then(cache => cache.put(req, res));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      }).catch(() => {
        // If we have nothing cached and we're offline, fall back to the
        // app shell. Try index.html first, then loop-app.html.
        return caches.match('./index.html').then(r => r || caches.match('./loop-app.html'));
      });
    })
  );
});
