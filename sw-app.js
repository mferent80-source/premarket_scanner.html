// Service Worker v2 — sw-app.js (SW unic pentru întreaga suită)
const CACHE_VERSION = 'tt-v668-2026-07-22';
const CACHE_NAME = `trading-tools-${CACHE_VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './shell/',
  './shell/index.html',
  './sw-app.js',
  './nav.js',
  './lib/hub-ui.css',
  './lib/capital-ui.css',
  './lib/scanner-ui.css',
  './lib/macro-ui.css',
  './lib/suite-ui.css',
  './lib/finnhub-key.js',
  './lib/tracker.js',
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
  './markov-lab/',
  './markov-lab/index.html',
  './lib/markov.js',
  './lib/indicators.js',
  './lib/data.js',
  './lib/setup-levels.js',
  './lib/setup-builder.js',
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
  './lib/suite-sessions.js',
  './alerts/',
  './alerts/index.html',
  './guide/',
  './guide/index.html',
  './health/',
  './health/index.html',
  './portfolio/',
  './portfolio/index.html',
  './journal/',
  './journal/index.html',
  './lib/journal.js',
  './weekly/',
  './weekly/index.html',
  './governor/',
  './governor/index.html',
  './equity/',
  './equity/index.html',
  './shadow-book/',
  './shadow-book/index.html',
  './router/',
  './router/index.html',
  './postmortem/',
  './postmortem/index.html',
  './lib/capital-time.js',
  './lib/account.js',
  './lib/governor.js',
  './lib/equity.js',
  './lib/capital-desk.js',
  './lib/portfolio-risk.js',
  './lib/journal-workspace.js',
  './lib/journal-insights.js',
  './lib/morning-check.js',
  './lib/shadow.js',
  './lib/router.js',
  './lib/postmortem.js',
  './lib/suite-version.js',
  './lib/macro-context.js',
  './lib/event-tape.js',
  './lib/hub-gappers.js',
  './lib/early-long.js',
  './lib/me-early-bird.js',
  './lib/me-desk.js',
  './lib/hub-market.js',
  './lib/hub-search.js',
  './lib/hub-card-live.js',
  './lib/hub-state.js',
  './lib/hub-tableau.js',
  './lib/desk-macro-rail.js',
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
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(c =>
      Promise.all(PRECACHE.map(u =>
        // eșecul de precache nu mai e înghițit mut — un typo în listă
        // înseamnă offline parțial rupt fără niciun semnal
        c.add(new Request(u, { cache: 'reload' })).catch(err => console.warn('[SW] precache fail:', u, err && err.message))
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
  const isHtml = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  const fetchOpts = (hubEntry || isHtml) ? { cache: 'reload' } : {};

  e.respondWith(
    fetch(req, fetchOpts).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        // cheia de cache = pathname FĂRĂ query — paginile cer lib-urile cu
        // ?v=NNN (cache-busting), dar precache-ul e queryless; fără
        // normalizare se acumulau 2 copii/fișier și fallback-ul offline
        // nu găsea niciodată varianta cerută
        caches.open(CACHE_NAME).then(c => c.put(new Request(url.origin + url.pathname), copy)).catch(() => {});
      }
      return res;
    }).catch(() => {
      return caches.match(req, { ignoreSearch: true }).then(r => {
        if (r) return r;
        if (hubEntry || isHtml) {
          return caches.match('./index.html').then(fb =>
            fb || new Response('Offline — reconectează-te pentru hub.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
          );
        }
        return new Response('', { status: 504, statusText: 'offline' });
      });
    })
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
  // raportează versiunea REALĂ a SW-ului activ — hub-health o compară cu
  // versiunea paginii; înainte pagina își scria propria versiune și o
  // compara cu ea însăși (check tautologic, un SW vechi nu era prins)
  if (e.data && e.data.type === 'GET_VERSION') {
    const reply = { type: 'SW_VERSION', version: CACHE_VERSION };
    if (e.ports && e.ports[0]) e.ports[0].postMessage(reply);
    else if (e.source) e.source.postMessage(reply);
  }
});
