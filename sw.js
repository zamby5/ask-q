// Ask·Q Service Worker v4.1
const CACHE_ADI = 'askq-v4.1';
const ONBELLEK_DOSYALARI = [
  './',
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;1,400&family=Nunito:wght@300;400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

// Kurulum
self.addEventListener('install', (e) => {
  console.log('[SW] Installing v4.1...');
  e.waitUntil(
    caches.open(CACHE_ADI).then((cache) => {
      console.log('[SW] Caching files...');
      return Promise.allSettled(
        ONBELLEK_DOSYALARI.map(url => 
          cache.add(url).catch(err => {
            console.warn(`[SW] Could not cache: ${url}`, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

// Etkinleştirme
self.addEventListener('activate', (e) => {
  console.log('[SW] Activating...');
  e.waitUntil(
    caches.keys().then((anahtarlar) => {
      return Promise.all(
        anahtarlar
          .filter((k) => k !== CACHE_ADI)
          .map((k) => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      );
    })
  );
  self.clients.claim();
});

// İstek yönetimi
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // API çağrılarını ve POST'ları bypass et
  const isAPI = 
    e.request.method !== 'GET' ||
    url.hostname.includes('groq') ||
    url.hostname.includes('workers.dev') ||
    url.hostname.includes('api.groq.com') ||
    url.hostname.includes('anthropic') ||
    url.protocol === 'chrome-extension:';

  if (isAPI) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) {
        console.log('[SW] Cache hit:', url.pathname);
        return cached;
      }

      return fetch(e.request)
        .then((response) => {
          if (
            response &&
            response.status === 200 &&
            (response.type === 'basic' || response.type === 'cors')
          ) {
            const kopyala = response.clone();
            caches.open(CACHE_ADI).then((cache) => {
              cache.put(e.request, kopyala);
              console.log('[SW] Cached:', url.pathname);
            });
          }
          return response;
        })
        .catch((err) => {
          console.warn('[SW] Fetch failed, serving offline fallback:', url.pathname);
          if (e.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          throw err;
        });
    })
  );
});

console.log('[SW] Service Worker loaded v4.1');
