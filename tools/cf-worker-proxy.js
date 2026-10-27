// ═══════════════════════════════════════════════════════════════════
// CORS proxy PROPRIU pe Cloudflare Workers — pentru Trading Tools.
// 27.10.2026 (audit E, I-755): FĂRĂ cron. Dispatch-ul la 5 minute spre „Price Alerts" a fost scos pe 27.09.2026
//   (mânca toată cota lunară de Actions în ~6 zile); handler-ul `scheduled` și GH_DISPATCH_TOKEN au fost retrase
//   de aici, iar `tools/cf-proxy-wrangler.toml` nu mai declară [triggers]. Robotul de știri rulează pe cronul
//   GitHub (la 2 ore); singurul cron Cloudflare al suitei e monitorul contului din `premarket-scanner-html`.
//
// DE CE proxy: proxy-urile free partajate (codetabs/corsproxy/cors.lol) pică sau
// rate-limitează IP-ul când toată suita trage date. Worker-ul ăsta e doar al
// tău: free tier = 100.000 req/zi (de zeci de ori peste nevoia suitei).
//
// SETUP PROXY (10 minute, o singură dată):
//   1. https://dash.cloudflare.com → Sign up (gratuit, doar email)
//   2. Workers & Pages → Create → Create Worker → nume ex. `tt-proxy` → Deploy
//   3. Edit code → șterge tot → lipește TOT fișierul ăsta → Deploy
//   4. Copiază URL-ul (https://tt-proxy.<ceva>.workers.dev) și pe ORICE pagină
//      a suitei (F12 → Console):
//        localStorage.setItem('tt_custom_proxy', 'https://tt-proxy.<ceva>.workers.dev')
//      → lib/data.js îl folosește PRIMUL, cu fallback pe lanțul vechi.
//
// Securitate proxy: acceptă DOAR host-urile din ALLOW (Yahoo + CoinGecko) și DOAR
// origin-ul GitHub Pages al suitei (sau lipsă origin — ex. test din terminal).
// ═══════════════════════════════════════════════════════════════════
// 22.09.2026: + cointelegraph.com. Feed-ul RSS TRAIESTE (200, 52 KB, probat din terminal),
// dar pagina il cerea prin proxy si primea `host not allowed` (403) -> secțiunea „Crypto
// news" nu putea functiona DELOC. Reddit NU se adauga: `r/CryptoCurrency/new.json` da 403
// la sursa pentru orice acces anonim, deci ar fi o gaura deschisa degeaba.
const ALLOW_HOSTS = /^(query1|query2)\.finance\.yahoo\.com$|^api\.coingecko\.com$|^nfs\.faireconomy\.media$|^cointelegraph\.com$/;
const ALLOW_ORIGIN = 'https://mferent80-source.github.io';
function isAllowedOrigin(origin) {
  if (!origin) return true; // file://, curl, cron — fără header Origin
  if (origin === ALLOW_ORIGIN) return true;
  // Dev local (Live Server, python -m http.server etc.)
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

async function handleJournalIngest(request, env) {
  if (request.method !== 'POST') return new Response('POST only', { status: 405 });
  const secret = request.headers.get('X-TT-Secret') || '';
  const expected = (env && env.JOURNAL_INGEST_SECRET) || '';
  if (!expected || secret !== expected) return new Response('unauthorized', { status: 401 });
  let body;
  try { body = await request.json(); } catch (e) { return new Response('invalid json', { status: 400 }); }
  const entry = body.entry || body;
  if (!entry || typeof entry !== 'object') return new Response('missing entry', { status: 400 });
  const gistId = (env && env.JOURNAL_GIST_ID) || '';
  const gistToken = (env && env.JOURNAL_GIST_TOKEN) || '';
  if (!gistId || !gistToken) {
    return new Response(JSON.stringify({ ok: true, queued: false, entry, note: 'Set JOURNAL_GIST_ID + JOURNAL_GIST_TOKEN for persistence' }), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ALLOW_ORIGIN }
    });
  }
  try {
    const g = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: { 'Authorization': `Bearer ${gistToken}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'tt-proxy-ingest' }
    });
    const gd = await g.json();
    const fname = Object.keys(gd.files || {})[0] || 'journal-queue.json';
    let arr = [];
    try { arr = JSON.parse(gd.files[fname].content || '[]'); } catch (e) { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    arr.push(Object.assign({ ingestedAt: new Date().toISOString() }, entry));
    const patch = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${gistToken}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'tt-proxy-ingest' },
      body: JSON.stringify({ files: { [fname]: { content: JSON.stringify(arr, null, 2) } } })
    });
    if (!patch.ok) return new Response(await patch.text(), { status: patch.status });
    return new Response(JSON.stringify({ ok: true, queued: true, n: arr.length }), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ALLOW_ORIGIN }
    });
  } catch (e) {
    return new Response('gist error: ' + e.message, { status: 500 });
  }
}

// Raspuns de eroare pe care PAGINA il poate citi. Fara `Access-Control-Allow-Origin`,
// browserul blocheaza raspunsul inainte ca JS-ul sa vada statusul sau textul: un 403
// „host not allowed" ajunge in pagina doar ca „Failed to fetch". Masurat 22.09: ecranul
// spunea „proxy-ul nu raspunde" cand de fapt proxy-ul raspundea foarte clar de ce refuza.
// Un motiv care nu trece CORS nu ajuta pe nimeni.
function eroare(text, status, origin) {
  return new Response(text, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': origin || '*',
      'Vary': 'Origin'
    }
  });
}

export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    if (u.pathname === '/journal-ingest' || u.pathname.endsWith('/journal-ingest')) {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: {
          'Access-Control-Allow-Origin': origin || ALLOW_ORIGIN,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-TT-Secret'
        }});
      }
      const res = await handleJournalIngest(request, env);
      res.headers.set('Access-Control-Allow-Origin', origin || ALLOW_ORIGIN);
      return res;
    }
    if (origin && !isAllowedOrigin(origin)) return eroare('forbidden origin: ' + origin, 403, origin);

    const target = u.searchParams.get('url');
    let t;
    try { t = new URL(target); } catch (e) { return eroare('bad url: parametrul ?url= lipseste sau nu e o adresa valida', 400, origin); }
    if (t.protocol !== 'https:' || !ALLOW_HOSTS.test(t.host)) return eroare('host not allowed: ' + t.host, 403, origin);

    // faireconomy (ForexFactory) e în spatele Cloudflare și refuză UA-uri non-browser →
    // pentru host-ul ăsta trimitem un UA complet de Chrome; restul rămân pe UA-ul intern.
    const isFF = t.host === 'nfs.faireconomy.media';
    const ua = isFF
      ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      : 'Mozilla/5.0 (TradingTools CF Worker)';
    let upstream;
    try {
      upstream = await fetch(t.toString(), {
        headers: { 'User-Agent': ua, 'Accept': isFF ? 'application/json,text/plain,*/*' : '*/*' },
        cf: { cacheTtl: isFF ? 120 : 20, cacheEverything: true },   // FF feed se schimbă rar → cache 2 min
        signal: AbortSignal.timeout(15000)   // un upstream lent (Yahoo) nu mai ține conexiunea la infinit
      });
    } catch (e) {
      return new Response('upstream timeout/eroare: ' + (e && e.message || e), { status: 504, headers: { 'Access-Control-Allow-Origin': origin || '*' } });
    }
    const headers = new Headers();
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
    headers.set('Access-Control-Allow-Origin', origin || '*');
    headers.set('Cache-Control', 'public, max-age=20');
    // ACAO depinde de Origin-ul cererii, iar raspunsul e cache-abil 20s. Fara `Vary: Origin`,
    // un cache intermediar poate servi altui origin raspunsul cu ACAO-ul primului → eroare
    // CORS aparent aleatorie, exact genul de „merge la mine, nu merge la tine" greu de prins.
    headers.set('Vary', 'Origin');
    return new Response(upstream.body, { status: upstream.status, headers });
  }
};
