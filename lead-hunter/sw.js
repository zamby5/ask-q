// Lead Hunter Pro — Service Worker
// Amaç: PWA kurulabilirlik kriterini (fetch handler) karşılamak, böylece
// "Ana Ekrana Ekle" gerçek bir uygulama simgesi + standalone pencere olarak
// kurulur (tarayıcı sekmesi açan bir "kısayol" değil).
//
// ÖNEMLİ: API istekleri (worker proxy, /leads, /lead-status, /lead-delete vb.)
// HİÇBİR ZAMAN cache'lenmez — lead verisi her zaman canlı/güncel olmalı.

const CACHE_NAME = 'lead-hunter-shell-v1';

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .catch(() => {}) // tek bir dosya başarısız olsa bile kurulum çökmesin
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n !== CACHE_NAME)
          .map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

function isApiOrCrossOrigin(request) {
  const url = new URL(request.url);
  // Farklı origin (örn. groq-proxy.*.workers.dev) -> her zaman ağdan
  if (url.origin !== self.location.origin) return true;
  // Lead/API yollarını asla cache'leme
  if (/\/lead(s)?(-status|-delete|-restore)?\b/.test(url.pathname)) return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // POST/DELETE istekleri her zaman ağa gider

  if (isApiOrCrossOrigin(request)) {
    // Network-only: lead verisi asla bayatlamış cache'den servis edilmesin
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  // App shell: cache-first, arka planda güncelle (stale-while-revalidate)
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
