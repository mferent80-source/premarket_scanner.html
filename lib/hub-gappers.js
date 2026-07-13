// hub-gappers.js — PM/AH gappers în gold bar (HG.*)
(function(global){
  'use strict';

  const MEGAS = [
    'AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','AVGO','AMD','NFLX',
    'PLTR','SMCI','COIN','MSTR','RIVN','LCID','MARA','RIOT','HOOD','SOFI',
    'GME','AMC','ENPH','FSLR','NIO','UBER','CRWD','SNOW','ARKK','JPM'
  ];
  const CACHE_KEY = 'pm_gappers_cache';
  const CACHE_TTL = 60000;
  const MIN_GAP_PCT = 3;
  const TOP_N = 6;
  const REFRESH_MS = 60000;
  let refreshTimer = null;
  let lastHtml = '';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fmtNum = n => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

  function getFinnhubKey(){
    if (global.FH_KEY && FH_KEY.get) return FH_KEY.get();
    return localStorage.getItem('finnhub_api_key') || localStorage.getItem('fh_key') || '';
  }

  function getWatchlist(){
    try {
      const a = JSON.parse(localStorage.getItem('wl_stocks') || '[]');
      return (Array.isArray(a) ? a : []).map(x => typeof x === 'string' ? x : ((x && (x.symbol || x.sym)) || '')).filter(Boolean);
    } catch (e) { return []; }
  }

  function universe(){
    const s = new Set(MEGAS);
    // NU taia la punct: BRK.B -> "BRK" era ALT emitent pe Finnhub, iar
    // compararea cu watchlist-ul netaiat rupea prioritizarea WL. Simbolurile
    // EU (.PA/.DE) dau null pe Finnhub si sunt filtrate onest, nu inlocuite.
    getWatchlist().forEach(t => { if (t) s.add(String(t).toUpperCase()); });
    return [...s];
  }

  function getNYSESession(){
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', weekday:'short', hour:'2-digit', minute:'2-digit', hour12:false });
    const parts = fmt.formatToParts(new Date());
    const wd = parts.find(p => p.type === 'weekday')?.value || '';
    const h = parseInt(parts.find(p => p.type === 'hour')?.value, 10) || 0;
    const m = parseInt(parts.find(p => p.type === 'minute')?.value, 10) || 0;
    const mins = h * 60 + m;
    if (wd === 'Sat' || wd === 'Sun') return { state:'closed', label:'🛑 Weekend' };
    if (mins >= 240 && mins < 570) return { state:'pre', label:'🌅 Pre-Market' };
    if (mins >= 570 && mins < 960) return { state:'open', label:'🟢 RTH' };
    if (mins >= 960 && mins < 1200) return { state:'after', label:'🌙 After-Hours' };
    return { state:'closed', label:'🛑 Closed' };
  }

  function earnBadge(sym){
    if (global.JI && JI.earningsBadge) return JI.earningsBadge(sym);
    try {
      const raw = JSON.parse(localStorage.getItem('tt_jr_earnings_cal') || 'null');
      const d = raw?.map?.[String(sym).toUpperCase()];
      if (!d || !d.date) return null;
      // days recalculat din data, nu cel stocat la fetch (cache de vineri
      // ar arata luni "E3d" in loc de "EARN") — acelasi fix ca in event-tape
      const today = new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(new Date());
      const days = Math.round((new Date(String(d.date).slice(0,10) + 'T12:00:00') - new Date(today + 'T12:00:00')) / 86400000);
      if (!Number.isFinite(days) || days > 2 || days < 0) return null;
      return days === 0 ? 'EARN' : 'E' + days + 'd';
    } catch (e) { return null; }
  }

  async function fetchQuote(sym, key, wlSet){
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 9000);
    try {
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${encodeURIComponent(key)}`, { signal: ctrl.signal });
      if (!r.ok) return null;
      const d = await r.json();
      if (d?.c == null || d.c === 0 || d?.pc == null || d.pc === 0) return null;
      const gapPct = ((d.c - d.pc) / d.pc) * 100;
      return { sym, price: d.c, prev: d.pc, gapPct, inWl: !!(wlSet && wlSet.has(sym)) };
    } catch (e) { return null; }
    finally { clearTimeout(to); }
  }

  // dedup in-flight: tick() e chemat si din HT.render (~7x/min prin lantul
  // stashMkt -> renderCockpit); fara memoizare porneau sweep-uri Finnhub
  // PARALELE exact cand cache-ul expira (CACHE_TTL == REFRESH_MS) -> burst
  // 70-250 requesturi -> 429 -> lista goala cachetata ca rezultat valid.
  let inflightSweep = null;

  async function fetchAllGappers(){
    const key = getFinnhubKey();
    if (!key) return { gappers: [], reason: 'no_key' };
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c && Date.now() - c.ts < CACHE_TTL && Array.isArray(c.data)) return { gappers: c.data, reason: 'cache' };
    } catch (e) {}
    if (inflightSweep) return inflightSweep;
    inflightSweep = (async () => {
      const uni = universe();
      // parse-ul watchlist o data per sweep, nu per simbol (era ~36 JSON.parse identice)
      const wlSet = new Set(getWatchlist().map(x => String(x).toUpperCase()));
      const results = [];
      const batchSize = 8;
      for (let i = 0; i < uni.length; i += batchSize) {
        const batch = uni.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(s => fetchQuote(s, key, wlSet)));
        results.push(...batchResults.filter(Boolean));
        if (i + batchSize < uni.length) await new Promise(r => setTimeout(r, 50));
      }
      // esec total (429/offline) nu se cacheteaza — altfel "niciun gapper"
      // fals negativ ar fi servit 60s ca adevar tuturor consumatorilor
      if (!results.length) return { gappers: [], reason: 'error' };
      const gappers = results.filter(g => Math.abs(g.gapPct) >= MIN_GAP_PCT)
        .sort((a, b) => {
          if (a.inWl !== b.inWl) return a.inWl ? -1 : 1;
          return Math.abs(b.gapPct) - Math.abs(a.gapPct);
        })
        .slice(0, TOP_N);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: gappers })); } catch (e) {}
      return { gappers, reason: 'fresh' };
    })();
    try { return await inflightSweep; }
    finally { inflightSweep = null; }
  }

  function chipHtml(g, isAfter){
    const dir = g.gapPct >= 0 ? 'up' : 'down';
    const arrow = g.gapPct >= 0 ? '▲' : '▼';
    const earn = earnBadge(g.sym);
    const wl = g.inWl ? ' wl' : '';
    const earnHtml = earn ? '<span class="ht-gap-earn">' + esc(earn) + '</span>' : '';
    // in after-hours procentul e miscarea TOTALA a zilei vs close-ul de ieri
    // (Finnhub c/pc), nu gap de premarket — eticheta si nota din Journal
    // spun acum adevarul in ambele sesiuni
    const sessTxt = isAfter ? 'Δ zi vs close ieri (after-hours)' : 'gap premarket';
    const title = g.sym + ' · $' + fmtNum(g.price) + ' (prev ' + fmtNum(g.prev) + ') — ' + (isAfter ? 'after-hours: procentul = ziua intreaga vs close-ul de ieri' : 'premarket: spread/liquidity poate limita execuția');
    const notes = (g.gapPct >= 0 ? '+' : '') + g.gapPct.toFixed(1) + '% · ' + sessTxt;
    const jHref = './journal/?sym=' + encodeURIComponent(g.sym) + '&source=hub-gapper&notes=' + encodeURIComponent(notes);
    return '<span class="ht-gap-wrap">' +
      '<a href="./nasdaq-scanner/?sym=' + encodeURIComponent(g.sym) + '" class="ht-gap-chip' + wl + '" title="' + esc(title) + '">' +
      '<span class="ht-gap-sym">' + esc(g.sym) + '</span>' +
      '<span class="ht-gap-pct ' + dir + '">' + arrow + ' ' + (g.gapPct >= 0 ? '+' : '') + g.gapPct.toFixed(1) + '%</span>' +
      earnHtml +
      '</a>' +
      '<a href="' + jHref + '" class="ht-gap-j" title="Planifică execuție în Journal">📓</a>' +
      '</span>';
  }

  function render(el){
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return;
    const session = getNYSESession();
    if (session.state !== 'pre' && session.state !== 'after'){
      el.innerHTML = '';
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    if (!getFinnhubKey()){
      el.innerHTML = '<span class="ht-gappers-empty">Gappers: lipsește cheia Finnhub</span>';
      return;
    }
    if (lastHtml) el.innerHTML = lastHtml;
    else el.innerHTML = '<span class="ht-gappers-empty">Gappers…</span>';
  }

  async function tick(){
    const el = document.getElementById('hubGappersSlot');
    const session = getNYSESession();
    if (!el || (session.state !== 'pre' && session.state !== 'after')){
      if (el){ el.innerHTML = ''; el.style.display = 'none'; }
      lastHtml = '';
      return;
    }
    if (!getFinnhubKey()){
      lastHtml = '<span class="ht-gappers-empty">Gappers: Finnhub → Macro ⚙</span>';
      el.innerHTML = lastHtml;
      el.style.display = '';
      return;
    }
    const { gappers, reason } = await fetchAllGappers();
    if (reason === 'error'){
      lastHtml = '<span class="ht-gappers-empty">Gappers: date indisponibile (rețea/limită API)</span>';
    } else if (!gappers.length){
      lastHtml = '<span class="ht-gappers-empty">Gappers ≥' + MIN_GAP_PCT + '%: niciunul acum</span>';
    } else {
      const isAfter = session.state === 'after';
      lastHtml = '<span class="ht-gappers-lbl">Gappers</span><div class="ht-gappers-scroll">' + gappers.map(g => chipHtml(g, isAfter)).join('') + '</div>';
    }
    el.innerHTML = lastHtml;
    el.style.display = '';
  }

  function scheduleRefresh(){
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      await tick();
      scheduleRefresh();
    }, REFRESH_MS);
  }

  function init(){
    tick();
    scheduleRefresh();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  }

  global.HG = { init, tick, render, getNYSESession, universe, fetchAllGappers };
})(typeof window !== 'undefined' ? window : global);