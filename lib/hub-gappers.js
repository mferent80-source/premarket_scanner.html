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
    // sursă unică I-208 (SES) — sărbătorile NU mai declanșează sweep-uri pe
    // un pre-market inexistent; vocabular local păstrat ('open' pt RTH)
    if (global.SES && SES.info){
      const s = SES.info();
      if (s.state === 'holiday') return { state:'closed', label:'🎌 ' + (s.holidayName || 'Sărbătoare') };
      if (s.state === 'weekend') return { state:'closed', label:'🛑 Weekend' };
      if (s.state === 'pre') return { state:'pre', label:'🌅 Pre-Market' };
      if (s.state === 'rth') return { state:'open', label: s.halfDay ? '🟢 RTH (half-day)' : '🟢 RTH' };
      if (s.state === 'after') return { state:'after', label:'🌙 After-Hours' };
      return { state:'closed', label:'🛑 Closed' };
    }
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

  // status-ul ultimului răspuns rate-limited din sweep-ul curent (429/403) —
  // fetchQuote întorcea null identic la 429 și la rețea picată, deci sweep-ul
  // nu putea face backoff
  let sweepRateLimited = 0;

  async function fetchQuote(sym, key, wlSet){
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 9000);
    try {
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${encodeURIComponent(key)}`, { signal: ctrl.signal });
      if (!r.ok){
        if (r.status === 429 || r.status === 403) sweepRateLimited = r.status;
        return null;
      }
      const d = await r.json();
      if (d?.c == null || d.c === 0 || d?.pc == null || d.pc === 0) return null;
      // simbol halted/delistat: Finnhub îngheață c/pc de zile întregi — un gap%
      // vechi prezentat ca actual; prag 5 zile ca să nu pice fals pe weekend+sărbători
      if (Number.isFinite(d.t) && d.t > 0 && Date.now() / 1000 - d.t > 5 * 86400) return null;
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
    // backoff persistat pe 429/403 (convenția fh_econ_403_until) — fără el,
    // ~36 requesturi/sweep se reluau la fiecare tick fix când eram limitați
    try { if (Date.now() < (parseInt(localStorage.getItem('fh_gap_429_until'), 10) || 0)) return { gappers: [], reason: 'error' }; } catch (e) {}
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c && Date.now() - c.ts < CACHE_TTL && Array.isArray(c.data)) return { gappers: c.data, reason: c.partial ? 'partial' : 'cache' };
    } catch (e) {}
    if (inflightSweep) return inflightSweep;
    inflightSweep = (async () => {
      const uni = universe();
      // parse-ul watchlist o data per sweep, nu per simbol (era ~36 JSON.parse identice)
      const wlSet = new Set(getWatchlist().map(x => String(x).toUpperCase()));
      const results = [];
      const batchSize = 8;
      sweepRateLimited = 0;
      for (let i = 0; i < uni.length; i += batchSize) {
        const batch = uni.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(s => fetchQuote(s, key, wlSet)));
        results.push(...batchResults.filter(Boolean));
        if (sweepRateLimited) break; // rate-limited: nu mai lovim restul batch-urilor
        if (i + batchSize < uni.length) await new Promise(r => setTimeout(r, 50));
      }
      if (sweepRateLimited){
        const backoffMs = sweepRateLimited === 403 ? 24 * 3600000 : 10 * 60000;
        try { localStorage.setItem('fh_gap_429_until', String(Date.now() + backoffMs)); } catch (e) {}
      }
      // esec total (429/offline) nu se cacheteaza — altfel "niciun gapper"
      // fals negativ ar fi servit 60s ca adevar tuturor consumatorilor
      if (!results.length) return { gappers: [], reason: 'error' };
      // sweep PARȚIAL (sub 80% răspunsuri): top-ul e pe univers incomplet —
      // se marchează, nu se prezintă ca listă completă „fresh"
      const partial = results.length < uni.length * 0.8;
      const gappers = results.filter(g => Math.abs(g.gapPct) >= MIN_GAP_PCT)
        .sort((a, b) => {
          if (a.inWl !== b.inWl) return a.inWl ? -1 : 1;
          return Math.abs(b.gapPct) - Math.abs(a.gapPct);
        })
        .slice(0, TOP_N);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: gappers, partial })); } catch (e) {}
      return { gappers, reason: partial ? 'partial' : 'fresh' };
    })();
    try { return await inflightSweep; }
    finally { inflightSweep = null; }
  }

  // I-209 — tradability pe top gappers: participare (vol azi vs media 20z)
  // + poziția în range-ul zilei. Un gap +6% pe volum anemic e netradabil
  // (spread, fill imposibil); +3% cu participare mare e setup-ul real.
  // Pragurile (15%/5% vol, 70%/30% poziție) sunt IPOTEZE — de validat pe ledger.
  async function fetchTradability(sym){
    if (!(global.D && D.fetchJSON)) return null;
    try {
      const enc = encodeURIComponent(sym);
      const [intra, daily] = await Promise.all([
        D.fetchJSON('https://query1.finance.yahoo.com/v8/finance/chart/' + enc + '?interval=5m&range=1d&includePrePost=true', { ttl: 300 }),
        D.fetchJSON('https://query1.finance.yahoo.com/v8/finance/chart/' + enc + '?interval=1d&range=1mo', { ttl: 1800 })
      ]);
      const ir = intra?.chart?.result?.[0];
      const dr = daily?.chart?.result?.[0];
      if (!ir || !dr) return null;
      const iq = ir.indicators?.quote?.[0] || {};
      const vols = (iq.volume || []).filter(Number.isFinite);
      const highs = (iq.high || []).filter(Number.isFinite);
      const lows = (iq.low || []).filter(Number.isFinite);
      const closes = (iq.close || []).filter(Number.isFinite);
      const volToday = vols.reduce((s, v) => s + v, 0);
      const dVols = (dr.indicators?.quote?.[0]?.volume || []).filter(Number.isFinite);
      // media pe barele ANTERIOARE (fără azi) — azi e parțial
      const prevVols = dVols.slice(0, Math.max(0, dVols.length - 1));
      const avgVol = prevVols.length >= 5 ? prevVols.reduce((s, v) => s + v, 0) / prevVols.length : null;
      const volPct = avgVol > 0 && volToday > 0 ? volToday / avgVol * 100 : null;
      let posPct = null;
      if (highs.length && lows.length && closes.length){
        const hi = Math.max(...highs), lo = Math.min(...lows), last = closes[closes.length - 1];
        if (hi > lo) posPct = (last - lo) / (hi - lo) * 100;
      }
      if (volPct == null && posPct == null) return null;
      return { volPct, posPct };
    } catch (e) { return null; }
  }

  function tradHtml(t){
    if (!t) return '';
    const parts = [];
    let cls = '';
    if (t.volPct != null){
      parts.push('vol ' + Math.round(t.volPct) + '% din media 20z');
      if (t.volPct >= 15) cls = 'up';
      else if (t.volPct < 5) cls = 'thin';
    }
    if (t.posPct != null){
      if (t.posPct >= 70) parts.push('ține sus');
      else if (t.posPct <= 30){ parts.push('fade jos'); cls = 'down'; }
      else parts.push('mijloc range');
    }
    if (!parts.length) return '';
    return '<span class="ht-gap-trad ' + cls + '" title="participare = volum cumulat azi vs media zilnică 20z · poziția ultimului preț în range-ul zilei — praguri ipoteze, validează pe ledger">' + esc(parts.join(' · ')) + '</span>';
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
    const nqHref = './nasdaq-scanner/?sym=' + encodeURIComponent(g.sym);
    // data-sctx: handoff I-213 la click (scrie tt_ctx_v1 înainte de navigare)
    return '<span class="ht-gap-wrap">' +
      '<a href="' + nqHref + '" class="ht-gap-chip' + wl + '" data-sctx-sym="' + esc(g.sym) + '" data-sctx-source="hub-gapper" data-sctx-notes="' + esc(notes) + '" title="' + esc(title) + '">' +
      '<span class="ht-gap-sym">' + esc(g.sym) + '</span>' +
      '<span class="ht-gap-pct ' + dir + '">' + arrow + ' ' + (g.gapPct >= 0 ? '+' : '') + g.gapPct.toFixed(1) + '%</span>' +
      earnHtml +
      tradHtml(g.trad) +
      '</a>' +
      '<a href="' + jHref + '" class="ht-gap-j" data-sctx-sym="' + esc(g.sym) + '" data-sctx-source="hub-gapper" data-sctx-notes="' + esc(notes) + '" title="Planifică execuție în Journal">📓</a>' +
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
    // Paint PRIMUL fără tradability (Finnhub e gata) — 6×2 Yahoo pe trad
    // bloca anterior chip-urile 4–20s pe proxy lent. Trad se lipește async.
    function paintChips(list, why){
      if (why === 'error'){
        lastHtml = '<span class="ht-gappers-empty">Gappers: date indisponibile (rețea/limită API)</span>';
      } else if (!list.length){
        lastHtml = '<span class="ht-gappers-empty">Gappers ≥' + MIN_GAP_PCT + '%: niciunul acum' + (why === 'partial' ? ' <span title="sweep incomplet — univers parțial">⚠ parțial</span>' : '') + '</span>';
      } else {
        const isAfter = session.state === 'after';
        const partialTag = why === 'partial' ? '<span class="ht-gappers-empty" title="sub 80% din univers a răspuns — top-ul poate fi incomplet">⚠ parțial</span>' : '';
        lastHtml = '<span class="ht-gappers-lbl">Gappers</span>' + partialTag + '<div class="ht-gappers-scroll">' + list.map(g => chipHtml(g, isAfter)).join('') + '</div>';
      }
      el.innerHTML = lastHtml;
      el.style.display = '';
    }
    paintChips(gappers, reason);
    // I-209: tradability pe top-ul deja plafonat (max 6 × 2 fetch-uri Yahoo,
    // prin D.fetchJSON cu cache) — eșecul lasă chip-ul fără rândul secundar
    if (gappers.length){
      try {
        const trads = await Promise.all(gappers.map(g => fetchTradability(g.sym)));
        let any = false;
        gappers.forEach((g, i) => { if (trads[i]) { g.trad = trads[i]; any = true; } });
        if (any) paintChips(gappers, reason);
      } catch (e) {}
    }
  }

  function scheduleRefresh(){
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      // try/catch ca o respingere a tick() să nu oprească DEFINITIV lanțul
      // de refresh (rearmarea e după await)
      try { await tick(); } catch (e) {}
      scheduleRefresh();
    }, REFRESH_MS);
  }

  function init(){
    tick();
    scheduleRefresh();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    // I-213: la click pe chip/journal scrie context suite
    document.addEventListener('click', function (e) {
      const a = e.target.closest && e.target.closest('a[data-sctx-sym]');
      if (!a || !global.SCTX) return;
      const sym = a.getAttribute('data-sctx-sym');
      const source = a.getAttribute('data-sctx-source') || 'hub-gapper';
      const notes = a.getAttribute('data-sctx-notes') || '';
      try {
        SCTX.write({
          sym: sym,
          source: source,
          notes: notes,
          nextAction: 'Gapper ' + sym,
          href: a.getAttribute('href')
        });
      } catch (err) {}
    }, true);
  }

  global.HG = { init, tick, render, getNYSESession, universe, fetchAllGappers };
})(typeof window !== 'undefined' ? window : global);