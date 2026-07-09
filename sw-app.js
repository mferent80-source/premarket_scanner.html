// Service Worker v2 — sw-app.js (înregistrare separată ca să ocolească sw.js vechi din cache)
const CACHE_VERSION = 'tt-v553-2026-07-09';
const CACHE_NAME = `trading-tools-${CACHE_VERSION}`;

const PRECACHE = [
  './nav.js',
  './nasdaq-scanner/index.html',
  './market-events/index.html',
  './watchlist-monitor/index.html',
  './smart-trade-long/index.html',
  './pump-radar/index.html',
  './earnings-hub/index.html',
  './sector-rotation/index.html',
  './macro-dashboard/index.html',
  './markov-lab/index.html',
  './lib/markov.js',
  './lib/indicators.js',
  './lib/data.js',
  './lib/insider.js',
  './lib/ledger.js',
  './lib/regime.js',
  './lib/backtest.js',
  './lib/ai.js',
  './lib/telegram.js',
  './lib/notifications.js',
  './lib/sound.js',
  './lib/utils.js',
  './lib/watchlist.js',
  './alerts/index.html',
  './guide/index.html',
  './health/index.html',
  './portfolio/index.html',
  './journal/index.html',
  './lib/journal.js',
  './weekly/index.html',
  './governor/index.html',
  './equity/index.html',
  './shadow-book/index.html',
  './router/index.html',
  './postmortem/index.html',
  './lib/account.js',
  './lib/governor.js',
  './lib/equity.js',
  './lib/capital-desk.js',
  './lib/morning-check.js',
  './lib/shadow.js',
  './lib/router.js',
  './lib/postmortem.js',
  './lib/suite-version.js',
  './lib/hub-brief.js',
  './lib/hub-ledger.js',
  './lib/hub-health.js',
  './404.html',
  './update.html',
  './migrate.html'
];

function isHubEntry(url, req) {
  const p = url.pathname;
  if (req.mode === 'navigate') return true;
  if (/\/index\.html$/.test(p) || /premarket_scanner\.html\/?$/.test(p)) return true;
  if (p.includes('/shell/')) return true;
  if (p.endsWith('/migrate.html') || p.endsWith('/update.html')) return true;
  if ((req.headers.get('accept') || '').includes('text/html')) return true;
  return false;
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c =>
      Promise.all(PRECACHE.map(u =>
        c.add(new Request(u, { cache: 'reload' })).catch(() => {})
      ))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith('trading-tools-') && k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.method !== 'GET') return;

  const hubEntry = isHubEntry(url, req);
  const fetchOpts = { cache: 'reload' };

  e.respondWith(
    fetch(req, fetchOpts).then(res => {
      if (res && res.status === 200 && res.type === 'basic' && !hubEntry) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => {
      if (hubEntry) {
        return new Response('Offline — reconectează-te pentru hub.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
      return caches.match(req).then(r => r || new Response('', { status: 504, statusText: 'offline' }));
    })
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});