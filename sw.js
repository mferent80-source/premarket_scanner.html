// Service Worker — cache + offline pentru Trading Tools
// Strategie: network-first cu fallback la cache (nu blochează update-urile)
//
// IMPORTANT: bump CACHE_VERSION manual la fiecare release semnificativ — invalidare automată în clienți.
// SW are scope `/` (rădăcina repo-ului), deci controlează hub + crypto-scanner + nasdaq-scanner + market-events + crypto-events + watchlist-monitor.
const CACHE_VERSION = 'tt-v140-2026-05-16';
const CACHE_NAME = `trading-tools-${CACHE_VERSION}`;

// Resurse statice pre-cache-uite la instalare
const PRECACHE = [
  './',
  './index.html',
  './nasdaq-scanner/',
  './nasdaq-scanner/index.html',
  './market-events/',
  './market-events/index.html',
  './watchlist-monitor/',
  './watchlist-monitor/index.html',
  './smart-trade-long/',
  './smart-trade-long/index.html',
  './pump-radar/',
  './pump-radar/index.html',
  './earnings-hub/',
  './earnings-hub/index.html',
  './sector-rotation/',
  './sector-rotation/index.html',
  './macro-dashboard/',
  './macro-dashboard/index.html',
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
      // Cache doar răspunsuri valide (status 200 + same-origin via res.type 'basic') — protejează împotriva
      // cache-poisoning pe WiFi public unde MITM ar putea injecta răspunsuri arbitrare cu opaque type.
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req).then(r => {
      if (r) return r;
      // Fallback la index doar pentru navigare HTML (nu pentru fișiere absente arbitrare)
      if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
        return caches.match('./index.html');
      }
      // Pentru asset-uri lipsă întoarce un 504 simplu — evită returnarea HTML-ului hub la /missing.css etc.
      return new Response('', { status: 504, statusText: 'offline' });
    }))
  );
});
