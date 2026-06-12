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
  function bump(id, host, ok){
    const s = scoreOf(id, host);
    health[hkey(id, host)] = Math.max(-5, Math.min(5, s * 0.8 + (ok ? 1 : -1)));  // EMA, mărginit [-5,5]
    try { localStorage.setItem(HEALTH_KEY, JSON.stringify(health)); } catch (e) {}
  }
  function orderedProxies(host){
    return PROXIES.slice().sort((a, b) => scoreOf(b.id, host) - scoreOf(a.id, host));
  }

  // ──────────────────────────────────────────────────────────────────
  // CACHE localStorage cu TTL (+ curățare la quota)
  // ──────────────────────────────────────────────────────────────────
  const CACHE_PREFIX = 'ttd:';
  function cacheGet(key, ttlSec){
    if (!ttlSec) return null;
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || (Date.now() - o.t) / 1000 > ttlSec) return null;
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
  // fetchJSON — proxy fallback + cache TTL + dedup în zbor + timeout
  //   opts: { ttl:sec, timeout:ms, cacheKey?, validate?(json)->bool }
  // ──────────────────────────────────────────────────────────────────
  const inflight = new Map();
  async function fetchJSON(rawUrl, opts){
    opts = opts || {};
    const ttl = opts.ttl || 0;
    const key = opts.cacheKey || rawUrl;
    const cached = cacheGet(key, ttl);
    if (cached != null) return cached;
    if (inflight.has(key)) return inflight.get(key);

    const p = (async () => {
      const timeout = opts.timeout || 8000;
      const host = hostOf(rawUrl);
      for (const px of orderedProxies(host)){
        const url = px.build(rawUrl);
        const ctrl = new AbortController();
        const tm = setTimeout(() => ctrl.abort(), timeout);
        try {
          const r = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: ctrl.signal });
          clearTimeout(tm);
          if (!r.ok) { bump(px.id, host, false); continue; }
          const j = await r.json();
          if (j == null || (opts.validate && !opts.validate(j))) { bump(px.id, host, false); continue; }
          bump(px.id, host, true);
          if (ttl) cacheSet(key, j);
          return j;
        } catch (e) { clearTimeout(tm); bump(px.id, host, false); }
      }
      return null;
    })();
    inflight.set(key, p);
    try { return await p; } finally { inflight.delete(key); }
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
    const j = await fetchJSON(url, { ttl, cacheKey: `bnc:${symbol}:${interval}:${limit}`, validate: Array.isArray });
    if (!Array.isArray(j) || !j.length) throw new Error('Binance: niciun rezultat pentru ' + symbol);
    return j.map(k => ({ o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5], t:+k[0] }));
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
      if ([o, h, l, c].every(x => x != null && !isNaN(x)))
        out.push({ o, h, l, c, v: (v != null && !isNaN(v)) ? v : 0, t: ts[i] * 1000 });
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
    return { rate, aprPct: rate * 3 * 365 * 100, mark: +j.markPrice, time: +j.time };  // 3 funding/zi
  }

  // fetchOpenInterest — open interest curent (Binance futures). { oi, time }
  async function fetchOpenInterest(symbol, opts){
    opts = opts || {};
    const url = `https://fapi.binance.com/fapi/v1/openInterest?symbol=${encodeURIComponent(symbol)}`;
    const j = await fetchJSON(url, { ttl: opts.ttl != null ? opts.ttl : 300, cacheKey: `oi:${symbol}`, validate: d => d && d.openInterest != null });
    if (!j || j.openInterest == null) return null;
    return { oi: +j.openInterest, time: +j.time };
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
    cacheGet, cacheSet, cacheClear, orderedProxies,
    _health: () => health  // pentru debugging
  };
})(typeof window !== 'undefined' ? window : globalThis);
