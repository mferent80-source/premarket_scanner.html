// Service Worker — cache + offline pentru Trading Tools
// Strategie: network-first cu fallback la cache (nu blochează update-urile)
const CACHE_VERSION = 'tt-v1';
const CACHE_NAME = `trading-tools-${CACHE_VERSION}`;

// Resurse statice pre-cache-uite la instalare
const PRECACHE = [
  './',
  './index.html',
  './crypto-scanner/',
  './crypto-scanner/index.html',
  './nasdaq-scanner/',
  './nasdaq-scanner/index.html',
  './trading-journal/',
  './trading-journal/index.html',
  './404.html'
];

self.addEventListener('install', e => {
  // Activează imediat noua versiune fără să aștepte tab-urile vechi
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(PRECACHE).catch(() => {}))
  );
});

self.addEventListener('activate', e => {
  // Curăță cache-uri vechi (versiuni anterioare)
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith('trading-tools-') && k !== CACHE_NAME)
          .map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  // Cache doar same-origin (nu cache-uim API-uri externe — Yahoo, Finnhub, Nasdaq, news etc.)
  if (url.origin !== self.location.origin) return;
  // Cache doar GET (nu POST / PUT etc.)
  if (req.method !== 'GET') return;

  // Strategie network-first: încearcă rețeaua, salvează în cache, fallback la cache offline
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
