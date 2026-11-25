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
const CACHE = 'metro-planner-2026-11-25i';
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
  if (e.request.method !== 'GET') return;
  const req = e.request;
  const isNav = req.mode === 'navigate';

  e.respondWith(
    caches.match(req).then(cached => {
      const refresh = fetch(req).then(res => {
        if (isTrustworthy(res, req)) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => null);

      if (cached) {
        // serve instantly from cache; refresh quietly in the background
        e.waitUntil(refresh);
        return cached;
      }

      // nothing cached yet for this exact request — try the network once,
      // and for a page navigation fall back to the cached app shell either way
      return refresh.then(res => {
        if (res) return res;
        return isNav ? caches.match('./index.html') : new Response('', { status: 504 });
      });
    })
  );
});
