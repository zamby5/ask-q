// Ask·Q — Servis İşçisi (PWA) v4
const CACHE_ADI = 'askq-v4';
const ONBELLEK_DOSYALARI = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;1,400&family=Nunito:wght@300;400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_ADI).then((cache) =>
      Promise.allSettled(
        ONBELLEK_DOSYALARI.map(url => cache.add(url).catch(() => {}))
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((anahtarlar) =>
      Promise.all(
        anahtarlar
          .filter((k) => k !== CACHE_ADI)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  if (
    e.request.method !== 'GET' ||
    url.hostname.includes('groq') ||
    url.hostname.includes('workers.dev') ||
    url.hostname.includes('api.groq.com') ||
    url.protocol === 'chrome-extension:'
  ) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((response) => {
          if (
            response &&
            response.status === 200 &&
            (response.type === 'basic' || response.type === 'cors')
          ) {
            const kopyala = response.clone();
            caches.open(CACHE_ADI).then((cache) => cache.put(e.request, kopyala));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
