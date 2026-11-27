// Metro Planner service worker — makes the app a fully offline-capable PWA.
// All station/route/fare data is already inlined into index.html, so caching
// the shell once is enough for the whole app to work with no network at all,
// forever, from an iPhone home-screen icon.
//
// Strategy: cache-first. Once an asset is cached, it is served instantly from
// the cache every time, online or offline — the app never depends on a
// network round-trip to open. When there *is* a network, each request is
// also refreshed in the background for next time, but only if the response
// is clearly a real, same-origin, non-redirected 200 (so a login wall or
// any other unexpected page can never silently overwrite the good cache).
const CACHE = 'metro-planner-2026-11-27a';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c =>
      // cache each asset independently — one failing fetch must never stop
      // the rest (in particular index.html) from being cached
      Promise.all(ASSETS.map(a => fetch(a).then(r => r.ok && c.put(a, r)).catch(() => {})))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isTrustworthy(res, req) {
  // same-origin, not redirected elsewhere (e.g. to a sign-in page), and a real 200
  return res && res.ok && res.status === 200 && res.type === 'basic' && !res.redirected
    && new URL(req.url, self.location.href).origin === self.location.origin;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const isNav = req.mode === 'navigate';

  // Look only in this version's cache (faster than searching every cache),
  // and serve the app page for any navigation, whatever its query string.
  const fromCache = caches.open(CACHE).then(c =>
    isNav ? c.match('./index.html').then(r => r || c.match('./'))
          : c.match(req, { ignoreSearch: true }));

  e.respondWith(fromCache.then(cached => {
    if (cached) {
      // Instant answer from the phone. Only the page itself is refreshed in
      // the background (icons and the manifest never change between versions).
      if (isNav) e.waitUntil(fetch('./index.html', { cache: 'no-cache' }).then(res => {
        if (isTrustworthy(res, req)) return caches.open(CACHE).then(c => c.put('./index.html', res));
      }).catch(() => {}));
      return cached;
    }
    return fetch(req).then(res => {
      if (isTrustworthy(res, req)) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
      return res;
    }).catch(() => isNav ? caches.match('./index.html') : new Response('', { status: 504 }));
  }));
});
