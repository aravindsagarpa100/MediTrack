// ─────────────────────────────────────────────────────────────────
//  MediTrack Service Worker
//
//  *** BUMP CACHE_VERSION ON EVERY DEPLOY ***
//  The browser detects the SW file changed, installs the new SW,
//  and skipWaiting() forces it to take over immediately so the
//  phone gets the update on next open — no stale app.
// ─────────────────────────────────────────────────────────────────

const CACHE_VERSION = 'meditrack-v4'; // ← bump this on every deploy

const ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', event => {
  self.skipWaiting(); // activate immediately — don't wait for old tabs to close
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      Promise.allSettled(
        ASSETS.map(url => cache.add(new Request(url, { cache: 'reload' })))
      )
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim()) // take control of all open tabs NOW
      .then(() =>
        self.clients.matchAll({ type: 'window' }).then(clients =>
          clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION }))
        )
      )
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;

  // Network-first for HTML — so new deploys reach the phone fast
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then(res => {
          caches.open(CACHE_VERSION).then(c => c.put(request, res.clone()));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Cache-first for everything else
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (res && res.status === 200) {
          caches.open(CACHE_VERSION).then(c => c.put(request, res.clone()));
        }
        return res;
      }).catch(() => null);
    })
  );
});