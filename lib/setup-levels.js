// setup-levels.js — niveluri tehnice pentru Setup Builder (SL.*)
// Yahoo via D.fetchStock + proxy fallback · Binance/CoinGecko crypto · Finnhub/TwelveData stocks
(function(global){
  'use strict';

  function getCustomProxyUrl(){
    try { return ((localStorage.getItem('tt_custom_proxy') || 'https://tt-proxy.mferent80.workers.dev') + '').trim().replace(/\/+$/, ''); }
    catch (e) { return 'https://tt-proxy.mferent80.workers.dev'; }
  }
  const CORS_PROXIES = [
    { build: u => getCustomProxyUrl() + '/?url=' + encodeURIComponent(u), extract: r => r.text() },
    { build: u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u), extract: r => r.text() },
    { build: u => 'https://corsproxy.io/?url=' + encodeURIComponent(u), extract: r => r.text() },
    { build: u => 'https://api.cors.lol/?url=' + encodeURIComponent(u), extract: r => r.text() }
  ];
  const PROXY_DEAD = new Set();
  const PROXY_TIMEOUTS = new Map();
  let _proxyResetTs = Date.now();
  let _proxyIdx = 0;

  async function fetchViaProxy(url, timeoutMs){
    timeoutMs = timeoutMs || 9000;
    if (Date.now() - _proxyResetTs > 5 * 60000) { PROXY_DEAD.clear(); PROXY_TIMEOUTS.clear(); _proxyResetTs = Date.now(); }
    const tried = new Set();
    let lastError = null;
    for (let attempt = 0; attempt < CORS_PROXIES.length; attempt++){
      const idx = (_proxyIdx + attempt) % CORS_PROXIES.length;
      if (PROXY_DEAD.has(idx) || tried.has(idx)) continue;
      tried.add(idx);
      const p = CORS_PROXIES[idx];
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        const r = await fetch(p.build(url), { signal: ctrl.signal });
        clearTimeout(t);
        if (!r.ok){
          if ([400, 403, 408, 429, 502, 503, 504].includes(r.status)) PROXY_DEAD.add(idx);
          lastError = 'HTTP ' + r.status;
          continue;
        }
        const txt = await p.extract(r);
        if (typeof txt === 'string' && txt.trim().startsWith('<')) { PROXY_DEAD.add(idx); continue; }
        _proxyIdx = idx;
        PROXY_TIMEOUTS.delete(idx);
        try { return JSON.parse(txt); } catch (e) { return txt; }
      } catch (e){
        if (e.name === 'AbortError'){
          const strikes = (PROXY_TIMEOUTS.get(idx) || 0) + 1;
          PROXY_TIMEOUTS.set(idx, strikes);
          if (strikes >= 2) PROXY_DEAD.add(idx);
        } else PROXY_DEAD.add(idx);
        lastError = e.message;
      }
    }
    throw new Error('proxy fail: ' + (lastError || '?'));
  }

  function finnhubKey(){ return localStorage.getItem('finnhub_api_key') || ''; }
  function twelveKey(){ return localStorage.getItem('twelvedata_api_key') || ''; }

  const CRYPTO_BINANCE_MAP = {
    'BTC-USD':'BTCUSDT','ETH-USD':'ETHUSDT','SOL-USD':'SOLUSDT','BNB-USD':'BNBUSDT',
    'XRP-USD':'XRPUSDT','ADA-USD':'ADAUSDT','DOGE-USD':'DOGEUSDT','AVAX-USD':'AVAXUSDT',
    'LINK-USD':'LINKUSDT','DOT-USD':'DOTUSDT','LTC-USD':'LTCUSDT','MATIC-USD':'MATICUSDT'
  };
  const CRYPTO_COINGECKO_MAP = {
    'BTC-USD':'bitcoin','ETH-USD':'ethereum','SOL-USD':'solana','BNB-USD':'binancecoin',
    'XRP-USD':'ripple','ADA-USD':'cardano','DOGE-USD':'dogecoin','AVAX-USD':'avalanche-2',
    'LINK-USD':'chainlink','DOT-USD':'polkadot','LTC-USD':'litecoin','MATIC-USD':'matic-network'
  };
  const ETF_PROXY_MAP = { '^VIX':'VXX', 'DX-Y.NYB':'UUP', '^TNX':'IEF' };

  async function fetchCryptoChartFromCoinGecko(coinId, days){
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/coins/' + coinId + '/market_chart?vs_currency=usd&days=' + days + '&interval=daily');
      if (!r.ok) return null;
      const d = await r.json();
      const prices = d?.prices || [];
      if (prices.length < 5) return null;
      return { points: prices.map(p => ({ ts: Math.floor(p[0] / 1000), close: p[1] })), meta: { regularMarketPrice: prices[prices.length - 1][1] } };
    } catch (e) { return null; }
  }

  async function fetchCryptoChartFromBinance(pair, days){
    try {
      const limit = Math.min(1000, Math.max(30, days));
      const r = await fetch('https://api.binance.com/api/v3/klines?symbol=' + encodeURIComponent(pair) + '&interval=1d&limit=' + limit);
      if (!r.ok) return null;
      const j = await r.json();
      if (!Array.isArray(j) || j.length < 5) return null;
      const points = j.map(k => ({ ts: Math.floor(k[0] / 1000), close: parseFloat(k[4]) })).filter(p => p.close > 0);
      return points.length >= 5 ? { points, meta: { regularMarketPrice: points[points.length - 1].close } } : null;
    } catch (e) { return null; }
  }

  async function fetchFinnhubCandle(symbol, days){
    const key = finnhubKey();
    if (!key) return null;
    try {
      const to = Math.floor(Date.now() / 1000);
      const from = to - days * 86400;
      const r = await fetch('https://finnhub.io/api/v1/stock/candle?symbol=' + encodeURIComponent(symbol) + '&resolution=D&from=' + from + '&to=' + to + '&token=' + encodeURIComponent(key));
      if (!r.ok) return null;
      const d = await r.json();
      if (d?.s !== 'ok' || !Array.isArray(d.c) || !d.c.length) return null;
      const points = d.c.map((close, i) => ({ ts: d.t[i], close }));
      return { points, meta: { regularMarketPrice: points[points.length - 1].close } };
    } catch (e) { return null; }
  }

  async function fetchTwelveDataChart(symbol, days){
    const key = twelveKey();
    if (!key) return null;
    try {
      const r = await fetch('https://api.twelvedata.com/time_series?symbol=' + encodeURIComponent(symbol) + '&interval=1day&outputsize=' + days + '&apikey=' + encodeURIComponent(key));
      if (!r.ok) return null;
      const d = await r.json();
      if (d?.status === 'error' || !Array.isArray(d?.values)) return null;
      const points = d.values.slice().reverse().map(v => ({
        ts: Math.floor(new Date(v.datetime).getTime() / 1000),
        close: parseFloat(v.close)
      })).filter(p => !isNaN(p.close));
      return points.length >= 5 ? { points, meta: { regularMarketPrice: points[points.length - 1].close } } : null;
    } catch (e) { return null; }
  }

  const _chartCache = new Map();
  async function fetchYahooChart(symbol, range){
    range = range || '3mo';
    const cached = _chartCache.get(symbol + ':' + range);
    if (cached && Date.now() - cached.ts < 10 * 60000) return cached.data;
    try {
      const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) + '?interval=1d&range=' + range;
      const data = await fetchViaProxy(url);
      const res = data?.chart?.result?.[0];
      if (!res) return null;
      const closes = res.indicators?.quote?.[0]?.close || [];
      const ts = res.timestamp || [];
      const points = closes.map((c, i) => ({ ts: ts[i], close: c })).filter(p => p.close != null);
      if (points.length < 5) return null;
      const out = { points, meta: res.meta };
      _chartCache.set(symbol + ':' + range, { ts: Date.now(), data: out });
      return out;
    } catch (e) { return null; }
  }

  async function fetchChartWithFallback(yahooSym, days){
    days = days || 90;
    let d = await fetchYahooChart(yahooSym, days > 90 ? '1y' : '3mo');
    if (d?.points?.length >= 5) return d;
    const isCrypto = /-USD$/i.test(yahooSym);
    if (isCrypto){
      const bnb = CRYPTO_BINANCE_MAP[yahooSym];
      if (bnb){ d = await fetchCryptoChartFromBinance(bnb, days); if (d?.points?.length >= 5) return d; }
      const cg = CRYPTO_COINGECKO_MAP[yahooSym];
      if (cg){ d = await fetchCryptoChartFromCoinGecko(cg, Math.min(days, 365)); if (d?.points?.length >= 5) return d; }
    }
    const etf = ETF_PROXY_MAP[yahooSym];
    if (etf){ d = await fetchFinnhubCandle(etf, days); if (d?.points?.length >= 5) return d; }
    if (!isCrypto && !yahooSym.startsWith('^') && !/=F$/.test(yahooSym)){
      d = await fetchFinnhubCandle(yahooSym, days);
      if (d?.points?.length >= 5) return d;
      if (twelveKey()){ d = await fetchTwelveDataChart(yahooSym, days); if (d?.points?.length >= 5) return d; }
    }
    return null;
  }

  const _briefLevelsCache = new Map();
  function levelsFromPoints(sym, points){
    const cl = points.map(p => p.close);
    const n = cl.length;
    const last = cl[n - 1];
    const prev = cl[n - 2] ?? last;
    const chgPct = prev ? ((last - prev) / prev) * 100 : 0;
    const avg = arr => arr.reduce((s, x) => s + x, 0) / arr.length;
    const ma50 = n >= 50 ? avg(cl.slice(-50)) : null;
    const ma200 = n >= 200 ? avg(cl.slice(-200)) : null;
    const rets = [];
    for (let i = Math.max(1, n - 14); i < n; i++) rets.push(Math.abs(cl[i] / cl[i - 1] - 1) * 100);
    const atrPct = rets.length ? avg(rets) : null;
    const win20 = cl.length >= 21 ? cl.slice(-21, -1) : cl.slice(0, -1);
    return {
      sym, last, chgPct, ma50, ma200,
      distMa50: ma50 ? ((last - ma50) / ma50) * 100 : null,
      distMa200: ma200 ? ((last - ma200) / ma200) * 100 : null,
      atrPct,
      hi20: win20.length ? Math.max(...win20) : last,
      lo20: win20.length ? Math.min(...win20) : last
    };
  }

  async function fetchBriefLevels(sym){
    const cached = _briefLevelsCache.get(sym);
    if (cached){
      const ttl = cached.data ? 10 * 60000 : 90000;
      if (Date.now() - cached.ts < ttl) return cached.data;
    }
    let points = null;
    if (global.D?.fetchStock){
      try {
        const bars = await global.D.fetchStock(sym, { range: '1y', interval: '1d', ttl: 600 });
        if (bars?.length >= 5) points = bars.map(b => ({ ts: Math.floor(b.t / 1000), close: b.c }));
      } catch (e) {}
    }
    if (!points || points.length < 5){
      try {
        const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?interval=1d&range=1y';
        const data = await fetchViaProxy(url);
        const r = data?.chart?.result?.[0];
        const closes = r?.indicators?.quote?.[0]?.close || [];
        const ts = r?.timestamp || [];
        points = closes.map((c, i) => ({ ts: ts[i], close: c })).filter(p => p.close != null);
      } catch (e) {}
    }
    if (!points || points.length < 5){
      const fb = await fetchChartWithFallback(sym, 365);
      points = fb?.points || null;
    }
    if (!points || points.length < 5){
      _briefLevelsCache.set(sym, { ts: Date.now(), data: null });
      return null;
    }
    const out = levelsFromPoints(sym, points);
    _briefLevelsCache.set(sym, { ts: Date.now(), data: out });
    return out;
  }

  async function fetchBriefLevelsAll(syms, concurrency){
    concurrency = concurrency || 4;
    const out = {};
    let i = 0;
    async function worker(){
      while (i < syms.length){
        const sym = syms[i++];
        try { out[sym] = await fetchBriefLevels(sym); } catch (e) { out[sym] = null; }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    return out;
  }

  const _reactionSeriesCache = new Map();
  async function getReactionSeries(sym){
    const c = _reactionSeriesCache.get(sym);
    if (c && Date.now() - c.ts < 30 * 60000) return c.points;
    let points = null;
    if (global.D?.fetchStock){
      try {
        const bars = await global.D.fetchStock(sym, { range: '2y', interval: '1d', ttl: 1800 });
        if (bars?.length >= 30) points = bars.map(b => ({ ts: Math.floor(b.t / 1000), close: b.c }));
      } catch (e) {}
    }
    if (!points || points.length < 30){
      try {
        const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?interval=1d&range=2y';
        const data = await fetchViaProxy(url);
        const r = data?.chart?.result?.[0];
        const closes = r?.indicators?.quote?.[0]?.close || [];
        const ts = r?.timestamp || [];
        points = closes.map((cl, i) => ({ ts: ts[i], close: cl })).filter(p => p.close != null && p.ts != null);
      } catch (e) {}
    }
    if (!points || points.length < 30){
      const fb = await fetchChartWithFallback(sym, 730);
      points = (fb?.points || []).filter(p => p && p.close != null && p.ts != null);
    }
    if (!points || points.length < 30) points = null;
    _reactionSeriesCache.set(sym, { ts: Date.now(), points });
    return points;
  }

  function clearProxyDead(){
    PROXY_DEAD.clear();
    PROXY_TIMEOUTS.clear();
    _proxyResetTs = Date.now();
    _chartCache.clear();
  }

  global.SL = {
    fetchBriefLevels, fetchBriefLevelsAll, getReactionSeries,
    fetchChartWithFallback, clearProxyDead, levelsFromPoints
  };
})(typeof window !== 'undefined' ? window : globalThis);