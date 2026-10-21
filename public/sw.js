// 元婴 Service Worker v2
// Navigations are network-first so the installed PWA never runs stale code.
// Hashed /_next/static assets are cache-first; API is never cached.
// ES-043/ES-050: any /api/ request MUST bypass the service worker entirely.

const CACHE_NAME = 'yuanying-v5';
const STATIC_ASSETS = ['/', '/manifest.json', '/avatar.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) return;
  // ES-043: network-only. Never intercept, cache, or wrap API requests.
  if (url.pathname.startsWith('/api/')) return;
  if (event.request.method !== 'GET') return;

  const accept = event.request.headers.get('accept') || '';
  const isHTML =
    event.request.mode === 'navigate' || accept.includes('text/html');

  // Navigations / HTML: network-first, fall back to cache when offline.
  if (isHTML) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return res;
        })
        .catch(() =>
          caches.match(event.request).then(r => r || caches.match('/'))
        )
    );
    return;
  }

  // Immutable hashed build assets: cache-first.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then(
        cached =>
          cached ||
          fetch(event.request).then(res => {
            const copy = res.clone();
            caches
              .open(CACHE_NAME)
              .then(cache => cache.put(event.request, copy));
            return res;
          })
      )
    );
    return;
  }

  // Everything else: stale-while-revalidate.
  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
