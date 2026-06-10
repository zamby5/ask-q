// Ask·Q — Servis İşçisi (PWA) v4
const CACHE_ADI = 'askq-v5';
const ONBELLEK_DOSYALARI = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;1,400&family=Nunito:wght@300;400;500;600;700&display=swap',
  
];

// Kurulum
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

// Etkinleştirme — eski önbellekleri temizle
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((anahtarlar) =>
      Promise.all(
        anahtarlar
          .filter((k) => k !== CACHE_ADI && !k.startsWith('askq-'))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// İstek yönetimi
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // API çağrılarını, POST'ları ve chrome-extension'ı önbelleğe ALMA
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
        .catch(() => {
          if(e.request.mode === 'navigate'){
            return caches.match('./index.html');
          }
          return new Response('Offline', {status: 503, statusText: 'Service Unavailable'});
        });
    })
  );
});