// ═══════════════════════════════════════════════════════════════════
// data.js — Strat de date UNIFICAT pentru toată suita (crypto + stocks)
// Înlocuiește logica de proxy CORS duplicată în 5 pagini cu o singură sursă.
//
// Caracteristici:
//   • Proxy fallback cu HEALTH-SCORING (ordonează proxy-urile după rata de succes recentă)
//   • Cache localStorage cu TTL (nu re-aduce aceleași bare la fiecare reload)
//   • Dedup de request-uri în zbor (2 apeluri identice simultane → 1 fetch)
//   • Timeout via AbortController
//   • Helper-e: fetchCrypto / fetchStock / fetchFunding / fetchOpenInterest
//
// Folosire: <script src="../lib/data.js"></script> apoi await D.fetchStock('AAPL') etc.
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';

  // ──────────────────────────────────────────────────────────────────
  // PROXY HEALTH — fiecare proxy are un scor; le ordonăm după succes recent.
  // ──────────────────────────────────────────────────────────────────
  // Aliniat cu lanțul verificat din pump-radar/watchlist-monitor (2026-06): scoase
  // thingproxy (DNS mort — ERR_NAME_NOT_RESOLVED) și allorigins (a eliminat headerele
  // CORS pentru github.io) — amândouă doar ardeau timeout-uri până le cobora health-ul.
  // Proxy PROPRIU (Cloudflare Worker — vezi tools/cf-worker-proxy.js) — scapă de
  // ruleta proxy-urilor free partajate (2026-06-12: codetabs 400, corsproxy 403,
  // cors.lol 429, allorigins timeout — TOATE jos simultan de pe IP-ul lui Marius).
  // Setare o dată per device (Console pe orice pagină a suitei):
  //   localStorage.setItem('tt_custom_proxy', 'https://NUME.workers.dev')
  // DEFAULT_CUSTOM_PROXY: completat după ce Marius creează workerul → merge și fără setare.
  const DEFAULT_CUSTOM_PROXY = 'https://tt-proxy.mferent80.workers.dev';
  let CUSTOM = '';
  try { CUSTOM = ((localStorage.getItem('tt_custom_proxy') || DEFAULT_CUSTOM_PROXY) + '').trim().replace(/\/+$/, ''); } catch (e) { CUSTOM = DEFAULT_CUSTOM_PROXY; }
  const PROXIES = [
    ...(CUSTOM ? [{ id: 'custom', build: u => CUSTOM + '/?url=' + encodeURIComponent(u) }] : []),
    { id: 'codetabs',    build: u => 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u) },
    { id: 'corsproxy',   build: u => 'https://corsproxy.io/?url=' + encodeURIComponent(u) },
    { id: 'corslol',     build: u => 'https://api.cors.lol/?url=' + encodeURIComponent(u) },
    { id: 'direct',      build: u => u }   // unele endpoint-uri (Binance) au CORS deschis
  ];
  const HEALTH_KEY = 'ttd_proxy_health';
  let health = {};
  try { health = JSON.parse(localStorage.getItem(HEALTH_KEY) || '{}') || {}; } catch (e) { health = {}; }
  // Health e PER (proxy × host): `direct` merge la Binance dar nu la Yahoo (CORS),
  // deci scorul trebuie separat pe gazdă, altfel un host bun îl strică pe altul.
  function hostOf(u){ try { return new URL(u).host; } catch (e) { return '?'; } }
  function hkey(id, host){ return id + '@' + host; }
  function scoreOf(id, host){ const v = health[hkey(id, host)]; return v != null ? v : 0; }
  // Contor de eșecuri CONSECUTIVE per (proxy × host) — 2 la rând → cooldown 90s.
  // Fără asta, un proxy care ATÂRNĂ (timeout 8-9s, fără status 429) era reîncercat
  // la FIECARE simbol dintr-un scan secvențial: 13 simboluri × 9s = minute întregi
  // de spinner („scan-ul nu finalizează"). Health-ul doar reordona, nu sărea.
  const _consecFail = new Map();
  function bump(id, host, ok){
    const s = scoreOf(id, host);
    health[hkey(id, host)] = Math.max(-5, Math.min(5, s * 0.8 + (ok ? 1 : -1)));  // EMA, mărginit [-5,5]
    try { localStorage.setItem(HEALTH_KEY, JSON.stringify(health)); } catch (e) {}
    const k = hkey(id, host);
    if (ok) { _consecFail.delete(k); return; }
    const f = (_consecFail.get(k) || 0) + 1;
    _consecFail.set(k, f);
    if (f >= 2) setCooldown(id, host, 90);
  }
  function orderedProxies(host){
    const sorted = PROXIES.slice().sort((a, b) => scoreOf(b.id, host) - scoreOf(a.id, host));
    // Proxy-ul propriu (CF Worker) e dedicat — rămâne PRIMUL cât timp scorul nu e
    // scorched (≤ -3). Fără asta, un free proxy cu scor EMA ușor mai mare
    // (ex. codetabs după un succes) bloca custom-ul pe locul 2–3, iar un hang
    // pe free ardea 8s × N înainte să ajungă la workerul rapid.
    if (CUSTOM){
      const custom = sorted.find(p => p.id === 'custom');
      if (custom && scoreOf('custom', host) > -3){
        return [custom].concat(sorted.filter(p => p.id !== 'custom'));
      }
    }
    return sorted;
  }

  // Backoff per (proxy × host) la 429/503: fără asta un rate-limit ardea TOATE proxy-urile
  // în lanț la fiecare apel (memoria proiectului: codetabs/corsproxy/cors.lol jos simultan).
  // Ținem un cooldown scurt (din Retry-After, plafonat) și sărim proxy-ul cât e „cald".
  const _cooldown = new Map(); // hkey(id,host) → timestamp până când e blocat
  function inCooldown(id, host){ const u = _cooldown.get(hkey(id, host)); return u && u > Date.now(); }
  function setCooldown(id, host, sec){ _cooldown.set(hkey(id, host), Date.now() + Math.min(Math.max(sec || 30, 5), 120) * 1000); }

  // ──────────────────────────────────────────────────────────────────
  // CACHE localStorage cu TTL (+ curățare la quota)
  // ──────────────────────────────────────────────────────────────────
  const CACHE_PREFIX = 'ttd:';
  function cacheGetRaw(key){
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const o = JSON.parse(raw);
      return o && o.v != null ? o : null;
    } catch (e) { return null; }
  }
  function cacheGet(key, ttlSec){
    if (!ttlSec) return null;
    try {
      const o = cacheGetRaw(key);
      if (!o || (Date.now() - o.t) / 1000 > ttlSec) return null;
      return o.v;
    } catch (e) { return null; }
  }
  // Cache expirat dar încă util (SWR): maxStaleSec = cât de vechi e acceptabil
  function cacheGetStale(key, maxStaleSec){
    if (!maxStaleSec) return null;
    try {
      const o = cacheGetRaw(key);
      if (!o) return null;
      if ((Date.now() - o.t) / 1000 > maxStaleSec) return null;
      return o.v;
    } catch (e) { return null; }
  }
  function cacheSet(key, value){
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
    } catch (e) {
      // quota plină → șterge cele mai vechi 10 intrări ttd: și reîncearcă o dată
      try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if (k && k.indexOf(CACHE_PREFIX) === 0) keys.push(k); }
        keys.map(k => { let t = 0; try { t = JSON.parse(localStorage.getItem(k)).t || 0; } catch (_) {} return { k, t }; })
            .sort((a, b) => a.t - b.t).slice(0, 10).forEach(x => localStorage.removeItem(x.k));
        localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
      } catch (e2) { /* renunță în liniște */ }
    }
  }
  function cacheClear(){
    try {
      const rm = [];
      for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if (k && k.indexOf(CACHE_PREFIX) === 0) rm.push(k); }
      rm.forEach(k => localStorage.removeItem(k));
    } catch (e) {}
  }

  // ──────────────────────────────────────────────────────────────────
  // fetchJSON — proxy fallback + cache TTL + dedup în zbor + timeout + SWR opt-in
  //   opts: { ttl:sec, timeout:ms, cacheKey?, validate?(json)->bool,
  //           swr?:bool (default FALSE), maxStale?:sec }
  // SWR (opt-in): la miss pe TTL, dacă există cache expirat sub maxStale,
  // îl returnăm IMEDIAT și revalidăm în fundal. Default OFF — un scan care
  // construiește o listă (premarket 80 simboluri) ar primi altfel DOAR stale
  // fără a aștepta rețeaua. Widget-urile hub pot trece swr:true.
  // ──────────────────────────────────────────────────────────────────
  const inflight = new Map(); // key → { p, t }  (t = start ms)
  // O promisiune hung (tab adormit peste noapte) NU e „în zbor" — e moartă.
  function inflightFresh(ent, now, maxAge) {
    return !!(ent && ent.p && (now - ent.t) < maxAge);
  }
  function dropInflight() { inflight.clear(); }
  async function fetchJSON(rawUrl, opts){
    opts = opts || {};
    const ttl = opts.ttl || 0;
    const key = opts.cacheKey || rawUrl;
    const cached = cacheGet(key, ttl);
    if (cached != null) return cached;

    // SWR opt-in: cache expirat dar încă „acceptabil" → servește-l, revalidează async
    const useSwr = !!(opts.swr && ttl > 0);
    const maxStale = opts.maxStale != null ? opts.maxStale : Math.max(ttl * 12, 900);
    const stale = useSwr ? cacheGetStale(key, maxStale) : null;

    const maxAge = (opts.timeout || 8000) * 2;
    const prev = inflight.get(key);
    if (inflightFresh(prev, Date.now(), maxAge)) {
      if (stale != null) return stale;
      return prev.p;
    }
    if (prev) inflight.delete(key); // hung — nu aștepta o promisiune care nu se mai rezolvă

    const p = (async () => {
      const baseTimeout = opts.timeout || 8000;
      const host = hostOf(rawUrl);
      let attempt = 0;
      for (const px of orderedProxies(host)){
        if (inCooldown(px.id, host)) continue; // proxy rate-limited recent pe acest host → sări-l
        attempt++;
        // Timeout progresiv: prima încercare eșuează rapid (proxy mort/hang),
        // următoarele mai răbdătoare. Fără asta un hang pe primul proxy ardea
        // 8s × fiecare simbol dintr-un scan.
        const timeout = attempt === 1
          ? Math.min(baseTimeout, 4000)
          : (attempt === 2 ? Math.min(baseTimeout, 6000) : baseTimeout);
        const url = px.build(rawUrl);
        const ctrl = new AbortController();
        const tm = setTimeout(() => ctrl.abort(), timeout);
        try {
          const r = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: ctrl.signal });
          clearTimeout(tm);
          if (!r.ok) {
            if (r.status === 429 || r.status === 503 || r.status === 418){
              setCooldown(px.id, host, parseInt(r.headers.get('Retry-After') || '0', 10) || 30);
            }
            bump(px.id, host, false); continue;
          }
          const j = await r.json();
          if (j == null || (opts.validate && !opts.validate(j))) { bump(px.id, host, false); continue; }
          bump(px.id, host, true);
          if (ttl) cacheSet(key, j);
          return j;
        } catch (e) { clearTimeout(tm); bump(px.id, host, false); }
      }
      // revalidarea a picat total: păstrează stale-ul dacă există (nu-l înlocui cu null)
      return stale != null ? stale : null;
    })();
    inflight.set(key, { p: p, t: Date.now() });

    if (stale != null){
      // fire-and-forget revalidate — consumatorul primește date imediat
      p.finally(() => { const cur = inflight.get(key); if (cur && cur.p === p) inflight.delete(key); });
      return stale;
    }
    try { return await p; } finally { const cur = inflight.get(key); if (cur && cur.p === p) inflight.delete(key); }
  }

  // ──────────────────────────────────────────────────────────────────
  // HELPER-E DE NIVEL ÎNALT
  // ──────────────────────────────────────────────────────────────────
  const TF_CRYPTO = { '1m':'1m','5m':'5m','15m':'15m','1h':'1h','4h':'4h','1d':'1d','1w':'1w','1wk':'1w' };

  // fetchCrypto — bare Binance spot. Returnează [{o,h,l,c,v,t}] cronologic.
  async function fetchCrypto(symbol, interval, limit, opts){
    opts = opts || {};
    interval = TF_CRYPTO[interval] || '1d';
    limit = limit || 1000;
    const ttl = opts.ttl != null ? opts.ttl : (interval.endsWith('m') ? 45 : interval === '1h' ? 300 : 1800);
    const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`;
    const j = await fetchJSON(url, { ttl, cacheKey: `bnc:${symbol}:${interval}:${limit}`, validate: d => Array.isArray(d) && d.length > 0 });
    if (!Array.isArray(j) || !j.length) throw new Error('Binance: niciun rezultat pentru ' + symbol);
    // Sanity numeric: aruncă barele cu valori incoerente de la proxy terț (preț ≤0, h<l).
    return j.map(k => ({ o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5], t:+k[0] }))
            .filter(b => [b.o, b.h, b.l, b.c].every(x => isFinite(x) && x > 0) && b.h >= b.l);
  }

  // fetchStock — bare Yahoo. Returnează [{o,h,l,c,v,t}] cronologic (null-uri eliminate).
  async function fetchStock(symbol, opts){
    opts = opts || {};
    const range = opts.range || '2y';
    const interval = opts.interval || '1d';
    const ttl = opts.ttl != null ? opts.ttl : (interval.endsWith('m') ? 60 : 1800);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}${opts.prePost ? '&includePrePost=true' : ''}`;
    const j = await fetchJSON(url, { ttl, cacheKey: `yh:${symbol}:${range}:${interval}`, validate: d => d && d.chart });
    const res = j && j.chart && j.chart.result && j.chart.result[0];
    if (!res) throw new Error('Yahoo: simbol invalid sau indisponibil — ' + symbol);
    const ts = res.timestamp || [];
    const q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
    const out = [];
    for (let i = 0; i < ts.length; i++){
      const o = q.open && q.open[i], h = q.high && q.high[i], l = q.low && q.low[i], c = q.close && q.close[i], v = q.volume && q.volume[i];
      // Sanity numeric: respinge bare cu valori absurde de la proxy terț (preț ≤0, OHLC
      // incoerent) — fără asta o bară coruptă/fabricată se scurge în indicatori și semnale.
      if ([o, h, l, c].every(x => x != null && isFinite(x) && x > 0)
          && h >= l && h >= Math.max(o, c) - 1e-9 && l <= Math.min(o, c) + 1e-9)
        out.push({ o, h, l, c, v: (v != null && isFinite(v) && v >= 0) ? v : 0, t: ts[i] * 1000 });
    }
    if (!out.length) throw new Error('Yahoo: serie goală pentru ' + symbol);
    return out;
  }

  // fetchFunding — funding rate curent (Binance USD-M futures). { rate, aprPct, time }
  async function fetchFunding(symbol, opts){
    opts = opts || {};
    const url = `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`;
    const j = await fetchJSON(url, { ttl: opts.ttl != null ? opts.ttl : 600, cacheKey: `fund:${symbol}`, validate: d => d && d.lastFundingRate != null });
    if (!j || j.lastFundingRate == null) return null;
    const rate = +j.lastFundingRate;
    // mark/time pot lipsi pe unele răspunsuri premiumIndex → null, NU NaN (care s-ar scurge tăcut în UI)
    return { rate, aprPct: rate * 3 * 365 * 100,
             mark: j.markPrice != null ? +j.markPrice : null,
             time: j.time != null ? +j.time : null };  // 3 funding/zi
  }

  // fetchOpenInterest — open interest curent (Binance futures). { oi, time }
  async function fetchOpenInterest(symbol, opts){
    opts = opts || {};
    const url = `https://fapi.binance.com/fapi/v1/openInterest?symbol=${encodeURIComponent(symbol)}`;
    const j = await fetchJSON(url, { ttl: opts.ttl != null ? opts.ttl : 300, cacheKey: `oi:${symbol}`, validate: d => d && d.openInterest != null });
    if (!j || j.openInterest == null) return null;
    return { oi: +j.openInterest, time: j.time != null ? +j.time : null };
  }

  // fetchOIHist — istoric open interest pt trend (period: 5m/15m/1h/4h/1d). [{oi, t}]
  async function fetchOIHist(symbol, period, limit, opts){
    opts = opts || {};
    period = period || '1h'; limit = limit || 30;
    const url = `https://fapi.binance.com/futures/data/openInterestHist?symbol=${encodeURIComponent(symbol)}&period=${period}&limit=${limit}`;
    const j = await fetchJSON(url, { ttl: opts.ttl != null ? opts.ttl : 600, cacheKey: `oih:${symbol}:${period}:${limit}`, validate: Array.isArray });
    if (!Array.isArray(j)) return null;
    return j.map(x => ({ oi: +x.sumOpenInterest, t: +x.timestamp }));
  }

  global.D = {
    fetchJSON, fetchCrypto, fetchStock, fetchFunding, fetchOpenInterest, fetchOIHist,
    cacheGet, cacheGetStale, cacheSet, cacheClear, orderedProxies,
    inflightFresh, dropInflight,
    _health: () => health  // pentru debugging
  };
})(typeof window !== 'undefined' ? window : globalThis);
