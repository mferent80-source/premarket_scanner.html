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
    getWatchlist().forEach(t => { if (t) s.add(String(t).toUpperCase().split('.')[0]); });
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
      if (!d || d.days > 2 || d.days < 0) return null;
      return d.days === 0 ? 'EARN' : 'E' + d.days + 'd';
    } catch (e) { return null; }
  }

  async function fetchQuote(sym, key){
    try {
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${encodeURIComponent(key)}`);
      if (!r.ok) return null;
      const d = await r.json();
      if (d?.c == null || d.c === 0 || d?.pc == null || d.pc === 0) return null;
      const gapPct = ((d.c - d.pc) / d.pc) * 100;
      return { sym, price: d.c, prev: d.pc, gapPct, inWl: getWatchlist().map(x => String(x).toUpperCase()).includes(sym) };
    } catch (e) { return null; }
  }

  async function fetchAllGappers(){
    const key = getFinnhubKey();
    if (!key) return { gappers: [], reason: 'no_key' };
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c && Date.now() - c.ts < CACHE_TTL) return { gappers: c.data, reason: 'cache' };
    } catch (e) {}
    const uni = universe();
    const results = [];
    const batchSize = 8;
    for (let i = 0; i < uni.length; i += batchSize) {
      const batch = uni.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(s => fetchQuote(s, key)));
      results.push(...batchResults.filter(Boolean));
      if (i + batchSize < uni.length) await new Promise(r => setTimeout(r, 50));
    }
    const gappers = results.filter(g => Math.abs(g.gapPct) >= MIN_GAP_PCT)
      .sort((a, b) => {
        if (a.inWl !== b.inWl) return a.inWl ? -1 : 1;
        return Math.abs(b.gapPct) - Math.abs(a.gapPct);
      })
      .slice(0, TOP_N);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: gappers })); } catch (e) {}
    return { gappers, reason: 'fresh' };
  }

  function chipHtml(g){
    const dir = g.gapPct >= 0 ? 'up' : 'down';
    const arrow = g.gapPct >= 0 ? '▲' : '▼';
    const earn = earnBadge(g.sym);
    const wl = g.inWl ? ' wl' : '';
    const earnHtml = earn ? '<span class="ht-gap-earn">' + esc(earn) + '</span>' : '';
    const title = g.sym + ' · $' + fmtNum(g.price) + ' (prev ' + fmtNum(g.prev) + ') — premarket: spread/liquidity poate limita execuția';
    const notes = 'Gap ' + (g.gapPct >= 0 ? '+' : '') + g.gapPct.toFixed(1) + '% · premarket';
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
    const { gappers } = await fetchAllGappers();
    if (!gappers.length){
      lastHtml = '<span class="ht-gappers-empty">Gappers ≥' + MIN_GAP_PCT + '%: niciunul acum</span>';
    } else {
      lastHtml = '<span class="ht-gappers-lbl">Gappers</span><div class="ht-gappers-scroll">' + gappers.map(chipHtml).join('') + '</div>';
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