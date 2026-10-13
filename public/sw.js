// 元婴 Service Worker v1

const CACHE_NAME = 'yuanying-v1';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/avatar.png',
];

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

  // 不缓存 API 调用
  if (url.pathname.startsWith('/api/')) {
    return; // 让浏览器直接处理
  }

  // 只处理 GET
  if (event.request.method !== 'GET') {
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request)
        .then(response => {
          // 只缓存成功响应
          if (!response || response.status !== 200) {
            return response;
          }

          const toCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, toCache);
          });

          return response;
        })
        .catch(() => {
          // 离线 fallback
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
        });
    })
  );
});
