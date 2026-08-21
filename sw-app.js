// Service Worker v2 — sw-app.js (SW unic pentru întreaga suită)
const CACHE_VERSION = 'tt-v790-2026-08-21';
const CACHE_NAME = `trading-tools-${CACHE_VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './hub-demo/',
  './hub-demo/index.html',
  './hub-demo/steel.html',
  './shell/',
  './shell/index.html',
  './sw-app.js',
  './nav.js',
  './lib/hub-ui.css',
  './lib/capital-ui.css',
  './lib/scanner-ui.css',
  './lib/macro-ui.css',
  './lib/suite-ui.css',
  './lib/plex.css',
  './lib/fonts/ibm-plex-sans-400.woff2',
  './lib/fonts/ibm-plex-sans-400-ext.woff2',
  './lib/fonts/ibm-plex-sans-600.woff2',
  './lib/fonts/ibm-plex-sans-600-ext.woff2',
  './lib/fonts/ibm-plex-mono-400.woff2',
  './lib/fonts/ibm-plex-mono-400-ext.woff2',
  './lib/theme-light.css',
  './lib/theme.js',
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
  './mfx-screener/',
  './mfx-screener/index.html',
  './factor-lab/',
  './factor-lab/index.html',
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
  './lib/mfx.js',
  './lib/mfx-journal.js',
  './lib/factors.js',
  './lib/quote-bus.js',
  './lib/setup-levels.js',
  './lib/setup-builder.js',
  './lib/insider.js',
  './lib/ledger.js',
  './lib/regime.js',
  './lib/backtest.js',
  './lib/ai.js',
  './lib/telegram.js',
  './lib/toast-stack.js',
  './lib/price-day.js',
  './lib/poll-wake.js',
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
  './lib/cockpit.js',
  './lib/event-tape.js',
  './lib/hub-gappers.js',
  './lib/early-long.js',
  './lib/me-early-bird.js',
  './lib/me-desk.js',
  './lib/hub-market.js',
  './lib/hub-search.js',
  './lib/hub-card-live.js',
  './lib/hub-state.js',
  './lib/hub-next-action.js',
  './lib/suite-context.js',
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
  e.waitUntil((async () => {
    // precache INCREMENTAL: la bump de versiune, ce există în cache-ul vechi
    // se COPIAZĂ (zero rețea), doar ce lipsește se descarcă — înainte, fiecare
    // bump re-descărca toate cele ~100 fișiere (~6MB) cu cache:'reload', în
    // paralel cu încărcarea paginii. Prospețimea o asigură runtime-ul:
    // fiecare fetch reușit face cachePut peste copia veche.
    const fresh = await caches.open(CACHE_NAME);
    const oldKey = (await caches.keys()).filter(k => k.startsWith('trading-tools-') && k !== CACHE_NAME).pop();
    const old = oldKey ? await caches.open(oldKey) : null;
    await Promise.all(PRECACHE.map(async u => {
      try {
        if (old) {
          const hit = await old.match(u, { ignoreSearch: true });
          if (hit) { await fresh.put(u, hit); return; }
        }
        // 'no-cache' = revalidare ETag (304 dacă neschimbat), nu re-download orb
        await fresh.add(new Request(u, { cache: 'no-cache' }));
      } catch (err) {
        // eșecul de precache nu e înghițit mut — un typo în listă
        // înseamnă offline parțial rupt fără niciun semnal
        console.warn('[SW] precache fail:', u, err && err.message);
      }
    }));
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith('trading-tools-') && k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// peste acest prag, o navigare pe rețea lentă e servită din cache (dacă
// există) — rețeaua continuă în fundal și actualizează cache-ul; datele
// vii se împrospătează oricum din JS-ul paginii
const HTML_NET_TIMEOUT_MS = 3500;

// cheia de cache = pathname FĂRĂ query — paginile cer lib-urile cu ?v=NNN
// (cache-busting), dar precache-ul e queryless; fără normalizare se
// acumulau 2 copii/fișier și fallback-ul offline nu găsea varianta cerută
// Întoarce o promisiune care se încheie DUPĂ ce put-ul e persistat — cine
// rulează în fundal trebuie s-o dea la e.waitUntil, altfel SW-ul poate fi
// omorât înainte să se scrie cache-ul (refresh-ul nu s-ar aplica niciodată
// pe sesiuni scurte, ex. mobil).
function cachePut(url, res) {
  if (!(res && res.status === 200 && res.type === 'basic')) return Promise.resolve(res);
  const copy = res.clone();
  return caches.open(CACHE_NAME)
    .then(c => c.put(new Request(url.origin + url.pathname), copy))
    .catch(() => {})
    .then(() => res);
}

// HTML: network-first cu timeout — fără cache:'reload' (revalidare ETag/304,
// re-download integral doar când pagina chiar s-a schimbat; înainte macro =
// 377KB re-descărcați la fiecare vizită). Fetch-ul care nu „pică", doar
// durează (net lent), nu mai ține pagina albă la infinit.
function htmlNetworkFirst(e, req, url) {
  return new Promise(resolve => {
    let settled = false;
    const finish = r => { if (!settled) { settled = true; resolve(r); } };
    const timer = setTimeout(() => {
      caches.match(req, { ignoreSearch: true }).then(hit => { if (hit) finish(hit); });
      // fără hit în cache nu avem ce servi — lăsăm rețeaua să termine
    }, HTML_NET_TIMEOUT_MS);
    // 'no-cache' = revalidare ETag la ORIGINE (304 aproape gratuit dacă
    // pagina nu s-a schimbat, conținut proaspăt instant dacă s-a schimbat);
    // modul default lovea HTTP cache-ul browserului (max-age=600) și ținea
    // suita cu ~10 min în urmă după fiecare deploy
    const net = fetch(req, { cache: 'no-cache' }).then(res => {
      clearTimeout(timer);
      finish(res);
      // net e ținut de e.waitUntil → put-ul apucă să se persiste chiar
      // dacă răspunsul a fost deja livrat
      return cachePut(url, res);
    }).catch(() => {
      clearTimeout(timer);
      return caches.match(req, { ignoreSearch: true }).then(hit => {
        if (hit) { finish(hit); return; }
        return caches.match('./index.html').then(fb => {
          finish(fb || new Response('Offline — reconectează-te pentru hub.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
        });
      });
    });
    e.waitUntil(net.catch(() => {}));
  });
}

// Assets (lib/*.js?v=, CSS, nav.js): stale-while-revalidate — servește
// instant din cache, refresh-ul merge în fundal (vizita URMĂTOARE prinde
// versiunea nouă). Compromis asumat: imediat după un update, o pagină
// poate rula O dată lib-ul vechi; se auto-vindecă la refresh.
function assetSWR(e, req, url) {
  return caches.match(req, { ignoreSearch: true }).then(hit => {
    // refresh-ul din fundal cu 'no-cache': revalidare ETag la origine, nu
    // HTTP cache-ul browserului — altfel cache-ul SW re-primea 10 min
    // același conținut vechi și suita rămânea mereu cu un deploy în urmă
    const net = fetch(req, { cache: 'no-cache' }).then(res => cachePut(url, res)).catch(() =>
      hit || new Response('', { status: 504, statusText: 'offline' })
    );
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.method !== 'GET') return;

  // isHubEntry acoperă deja navigate + *.html + accept: text/html
  // suite-version.js e fișierul care DECIDE ce versiune de SW se înregistrează. Servit prin
  // assetSWR (care face `ignoreSearch:true`, deci ignoră până și `?v=`), un SW vechi returna
  // versiunea veche, paginile re-înregistrau exact acel SW și update-ul se bloca permanent.
  // Fișierul care rupe bucla nu are voie să vină din bucla însăși → network-first.
  if (isHubEntry(url, req) || /\/lib\/suite-version\.js$/.test(url.pathname)) {
    e.respondWith(htmlNetworkFirst(e, req, url));
  } else e.respondWith(assetSWR(e, req, url));
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
