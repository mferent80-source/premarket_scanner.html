// ═══════════════════════════════════════════════════════════════════
// CORS proxy PROPRIU pe Cloudflare Workers — pentru Trading Tools.
//
// DE CE: proxy-urile free partajate (codetabs/corsproxy/cors.lol) pică sau
// rate-limitează IP-ul când toată suita trage date. Worker-ul ăsta e doar al
// tău: free tier = 100.000 req/zi (de zeci de ori peste nevoia suitei).
//
// SETUP (10 minute, o singură dată):
//   1. https://dash.cloudflare.com → Sign up (gratuit, doar email)
//   2. Workers & Pages → Create → Create Worker → nume ex. `tt-proxy` → Deploy
//   3. Edit code → șterge tot → lipește TOT fișierul ăsta → Deploy
//   4. Copiază URL-ul (https://tt-proxy.<ceva>.workers.dev) și pe ORICE pagină
//      a suitei (F12 → Console):
//        localStorage.setItem('tt_custom_proxy', 'https://tt-proxy.<ceva>.workers.dev')
//      → lib/data.js îl folosește PRIMUL, cu fallback pe lanțul vechi.
//
// Securitate: acceptă DOAR host-urile din ALLOW (Yahoo + CoinGecko) și DOAR
// origin-ul GitHub Pages al suitei (sau lipsă origin — ex. test din terminal).
// ═══════════════════════════════════════════════════════════════════
const ALLOW_HOSTS = /^(query1|query2)\.finance\.yahoo\.com$|^api\.coingecko\.com$/;
const ALLOW_ORIGIN = 'https://mferent80-source.github.io';

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    if (origin && origin !== ALLOW_ORIGIN) return new Response('forbidden origin', { status: 403 });

    const target = new URL(request.url).searchParams.get('url');
    let t;
    try { t = new URL(target); } catch (e) { return new Response('bad url', { status: 400 }); }
    if (t.protocol !== 'https:' || !ALLOW_HOSTS.test(t.host)) return new Response('host not allowed', { status: 403 });

    const upstream = await fetch(t.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (TradingTools CF Worker)' },
      cf: { cacheTtl: 20, cacheEverything: true }
    });
    const headers = new Headers();
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
    headers.set('Access-Control-Allow-Origin', origin || '*');
    headers.set('Cache-Control', 'public, max-age=20');
    return new Response(upstream.body, { status: upstream.status, headers });
  }
};
