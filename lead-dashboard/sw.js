/* Ask·Q SW v5.1 — Self-diagnostic */
const CACHE_ADI = 'askq-v5';
const ONBELLEK_DOSYALARI = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;1,400&family=Nunito:wght@300;400;500;600;700&display=swap'
];

self.addEventListener('install', (e) => {
  console.log('[SW] Install started');
  e.waitUntil(
    caches.open(CACHE_ADI).then((cache) =>
      Promise.allSettled(
        ONBELLEK_DOSYALARI.map(url => 
          cache.add(url).then(() => console.log('[SW] Cached:', url))
                     .catch(err => console.warn('[SW] Cache fail:', url, err.message))
        )
      )
    ).then(() => console.log('[SW] Install complete'))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  console.log('[SW] Activate');
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter(k => k !== CACHE_ADI).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' ||
      url.hostname.includes('groq') ||
      url.hostname.includes('workers.dev') ||
      url.protocol === 'chrome-extension:') {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const clone = res.clone();
          caches.open(CACHE_ADI).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline', {status: 503});
      });
    })
  );
});
