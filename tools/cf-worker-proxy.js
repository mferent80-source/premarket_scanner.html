// ═══════════════════════════════════════════════════════════════════
// CORS proxy PROPRIU pe Cloudflare Workers — pentru Trading Tools.
// + CRON TRIGGER: pornește la fix 5 min workflow-ul „Price Alerts" din GitHub
//   (vezi handler-ul `scheduled` de jos) — GitHub singur nu garantează cadența.
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
// SETUP CRON ALERTE (5 min REAL, 24/7 — o singură dată):
//   A. Creează un GitHub token care poate porni workflow-uri:
//      github.com/settings/personal-access-tokens → Generate new token (fine-grained)
//        · Resource owner: mferent80-source
//        · Repository access: Only select repositories → premarket_scanner.html
//        · Permissions → Actions: Read and write   (ASTA dă voie la workflow_dispatch)
//      Copiază tokenul (github_pat_...).
//   B. În worker: Settings → Variables and Secrets → Add → tip „Secret"
//        Name: GH_DISPATCH_TOKEN   Value: <tokenul de la A>   → Save and deploy
//   C. În worker: Settings → Triggers → Cron Triggers → Add Cron Trigger
//        Cron expression: */5 * * * *   → Add   (rulează la fix 5 min, non-stop)
//   Gata: la fiecare 5 min Cloudflare lovește GitHub → rulează check-alerts.mjs →
//   Telegram. Cron-ul nativ GitHub rămâne ca fallback (concurrency serializează,
//   deci nu se dublează alertele). Test: Triggers → lângă cron → „...” poate fi
//   declanșat manual, sau wrangler: `npx wrangler dev --test-scheduled` + curl /__scheduled.
//
// Securitate proxy: acceptă DOAR host-urile din ALLOW (Yahoo + CoinGecko) și DOAR
// origin-ul GitHub Pages al suitei (sau lipsă origin — ex. test din terminal).
// ═══════════════════════════════════════════════════════════════════
const ALLOW_HOSTS = /^(query1|query2)\.finance\.yahoo\.com$|^api\.coingecko\.com$|^nfs\.faireconomy\.media$/;
const ALLOW_ORIGIN = 'https://mferent80-source.github.io';
function isAllowedOrigin(origin) {
  if (!origin) return true; // file://, curl, cron — fără header Origin
  if (origin === ALLOW_ORIGIN) return true;
  // Dev local (Live Server, python -m http.server etc.)
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

// Repo + workflow care se declanșează din cron (workflow-ul are `workflow_dispatch:`).
const GH_OWNER = 'mferent80-source';
const GH_REPO = 'premarket_scanner.html';
const GH_WORKFLOW = 'price-alerts.yml';
const GH_REF = 'main';

// Logica de declanșare workflow_dispatch — apelată de handler-ul `scheduled` (cron).
// Întoarce {status, text} ca să poată fi logat (Workers → Logs / `wrangler tail`).
async function ghDispatch(env) {
  if (!env || !env.GH_DISPATCH_TOKEN) return { status: 0, text: 'GH_DISPATCH_TOKEN lipsește din secrets' };
  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GH_DISPATCH_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'tt-proxy-cron',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ref: GH_REF })
  });
  return { status: r.status, text: r.status === 204 ? 'OK (204)' : await r.text() };
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
    if (origin && !isAllowedOrigin(origin)) return new Response('forbidden origin', { status: 403 });

    const target = u.searchParams.get('url');
    let t;
    try { t = new URL(target); } catch (e) { return new Response('bad url', { status: 400 }); }
    if (t.protocol !== 'https:' || !ALLOW_HOSTS.test(t.host)) return new Response('host not allowed', { status: 403 });

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
  },

  // CRON TRIGGER — rulat de Cloudflare la cadența din „Cron Triggers" (*/5 * * * *).
  // Lovește GitHub API workflow_dispatch → pornește „Price Alerts" → check-alerts.mjs.
  // GitHub răspunde 204 la succes; orice altceva e logat (Workers → Logs / `wrangler tail`).
  async scheduled(event, env, ctx) {
    try {
      const res = await ghDispatch(env);
      if (res.status === 204) console.log('✓ workflow Price Alerts declanșat (204).');
      else console.log(`⚠ GitHub dispatch HTTP ${res.status}: ${res.text}`);
    } catch (e) {
      console.log('⚠ Cron dispatch a eșuat: ' + e.message);
    }
  }
};
