// hub-gappers.js — PM/AH gappers ticker dens (HG.*)
// Yahoo primar (D.fetchJSON); Finnhub umplere opțională.
// UI: bandă 1-linie sub pills, nu panou înalt în gold-bar.
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
    getWatchlist().forEach(t => { if (t) s.add(String(t).toUpperCase()); });
    return [...s];
  }

  function getNYSESession(){
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
      const today = new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(new Date());
      const days = Math.round((new Date(String(d.date).slice(0,10) + 'T12:00:00') - new Date(today + 'T12:00:00')) / 86400000);
      if (!Number.isFinite(days) || days > 2 || days < 0) return null;
      return days === 0 ? 'EARN' : 'E' + days + 'd';
    } catch (e) { return null; }
  }

  // Yahoo 1m + prePost — gap real pre/AH (Finnhub free e close regular, nu pre)
  async function fetchQuoteYahoo(sym, wlSet, isAfter){
    if (!(global.D && D.fetchJSON)) return null;
    try {
      const j = await D.fetchJSON(
        'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) +
          '?interval=1m&range=1d&includePrePost=true',
        {
          ttl: 45, timeout: 5500, swr: true, maxStale: 240,
          cacheKey: 'hg:y1m:' + sym,
          validate: d => d && d.chart
        }
      );
      const res = j && j.chart && j.chart.result && j.chart.result[0];
      if (!res || !res.meta) return null;
      const m = res.meta;
      const closes = (res.indicators && res.indicators.quote && res.indicators.quote[0] && res.indicators.quote[0].close) || [];
      let last = null;
      for (let i = closes.length - 1; i >= 0; i--) {
        if (closes[i] != null && Number.isFinite(closes[i])) { last = closes[i]; break; }
      }
      if (last == null) {
        last = isAfter
          ? (m.postMarketPrice ?? m.regularMarketPrice)
          : (m.preMarketPrice ?? m.regularMarketPrice);
      }
      if (last == null || !Number.isFinite(last) || last <= 0) return null;
      // pre: regularMarketPrice = close ieri; after: chartPreviousClose / prev day
      let prev;
      if (isAfter) {
        prev = m.chartPreviousClose ?? m.previousClose ?? m.regularMarketPrice;
      } else {
        prev = m.regularMarketPrice ?? m.chartPreviousClose ?? m.previousClose;
      }
      if (prev == null || !Number.isFinite(prev) || prev <= 0) return null;
      // fără mișcare reală (fără pre/AH) — nu e gapper
      if (Math.abs(last - prev) / prev < 0.001) return null;
      const gapPct = ((last - prev) / prev) * 100;
      if (!Number.isFinite(gapPct)) return null;
      return { sym, price: last, prev, gapPct, inWl: !!(wlSet && wlSet.has(sym)), src: 'yahoo' };
    } catch (e) { return null; }
  }

  async function fetchQuoteFinnhub(sym, key, wlSet){
    if (!key) return null;
    try {
      if (Date.now() < (parseInt(localStorage.getItem('fh_gap_429_until'), 10) || 0)) return null;
    } catch (e) {}
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 7000);
    try {
      const r = await fetch(
        'https://finnhub.io/api/v1/quote?symbol=' + encodeURIComponent(sym) + '&token=' + encodeURIComponent(key),
        { signal: ctrl.signal }
      );
      if (!r.ok) {
        if (r.status === 429 || r.status === 403) {
          const backoffMs = r.status === 403 ? 24 * 3600000 : 15 * 60000;
          try { localStorage.setItem('fh_gap_429_until', String(Date.now() + backoffMs)); } catch (e2) {}
        }
        return null;
      }
      const d = await r.json();
      if (d?.c == null || d.c === 0 || d?.pc == null || d.pc === 0) return null;
      if (Number.isFinite(d.t) && d.t > 0 && Date.now() / 1000 - d.t > 5 * 86400) return null;
      const gapPct = ((d.c - d.pc) / d.pc) * 100;
      return { sym, price: d.c, prev: d.pc, gapPct, inWl: !!(wlSet && wlSet.has(sym)), src: 'fh' };
    } catch (e) { return null; }
    finally { clearTimeout(to); }
  }

  let inflightSweep = null;

  function readGapCache(){
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c && Array.isArray(c.data)) return c;
    } catch (e) {}
    return null;
  }

  async function fetchAllGappers(opts){
    opts = opts || {};
    const cached = readGapCache();
    if (cached) {
      const age = Date.now() - (cached.ts || 0);
      const fresh = age < CACHE_TTL;
      if (!opts.force && (fresh || opts.allowStale || opts.noNetwork)) {
        return {
          gappers: cached.data,
          reason: cached.partial ? 'partial' : (cached.data.length ? 'cache' : 'cache_empty'),
          stale: !fresh
        };
      }
    }
    if (opts.noNetwork) return { gappers: [], reason: 'pending', stale: true };

    if (inflightSweep) return inflightSweep;
    inflightSweep = (async () => {
      const session = getNYSESession();
      const isAfter = session.state === 'after';
      const uni = universe();
      const wlSet = new Set(getWatchlist().map(x => String(x).toUpperCase()));
      const bySym = {};
      const CONC = 6;
      let idx = 0;

      // 1) Yahoo primar (fără cheie Finnhub, fără 429 pe free tier)
      async function yWorker(){
        while (idx < uni.length) {
          const i = idx++;
          const sym = uni[i];
          const g = await fetchQuoteYahoo(sym, wlSet, isAfter);
          if (g) bySym[sym] = g;
        }
      }
      if (global.D && D.fetchJSON) {
        await Promise.all(Array.from({ length: Math.min(CONC, uni.length) }, () => yWorker()));
      }

      // 2) Finnhub umple golurile (opțional) — skip dacă backoff 429
      const key = getFinnhubKey();
      let fhBlocked = false;
      try { fhBlocked = Date.now() < (parseInt(localStorage.getItem('fh_gap_429_until'), 10) || 0); } catch (e) {}
      if (key && !fhBlocked) {
        const missing = uni.filter(s => !bySym[s]);
        for (let i = 0; i < missing.length; i += 6) {
          if (Date.now() < (parseInt(localStorage.getItem('fh_gap_429_until'), 10) || 0)) break;
          const batch = missing.slice(i, i + 6);
          const batchResults = await Promise.all(batch.map(s => fetchQuoteFinnhub(s, key, wlSet)));
          batchResults.forEach(g => { if (g) bySym[g.sym] = g; });
          if (i + 6 < missing.length) await new Promise(r => setTimeout(r, 80));
        }
      }

      const results = Object.values(bySym);
      if (!results.length) {
        // nu cache-ui empty ca „adevăr” 60s dacă e eroare rețea
        return { gappers: [], reason: (global.D && D.fetchJSON) ? 'error' : 'no_data' };
      }

      const partial = results.length < uni.length * 0.5;
      const gappers = results
        .filter(g => Math.abs(g.gapPct) >= MIN_GAP_PCT)
        .sort((a, b) => {
          if (a.inWl !== b.inWl) return a.inWl ? -1 : 1;
          return Math.abs(b.gapPct) - Math.abs(a.gapPct);
        })
        .slice(0, TOP_N);

      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          ts: Date.now(), data: gappers, partial, nRaw: results.length
        }));
      } catch (e) {}

      return { gappers, reason: partial ? 'partial' : 'fresh' };
    })();

    try { return await inflightSweep; }
    finally { inflightSweep = null; }
  }

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
    // Un singur semnal acționabil pe chip (nu propoziții)
    let label = '';
    let cls = '';
    if (t.posPct != null){
      if (t.posPct >= 70) { label = 'ține'; cls = 'up'; }
      else if (t.posPct <= 30) { label = 'fade'; cls = 'down'; }
      else { label = 'mid'; cls = ''; }
    }
    if (t.volPct != null && t.volPct < 5){
      label = label ? label + ' thin' : 'thin';
      if (cls !== 'up') cls = 'thin';
    } else if (t.volPct != null && t.volPct >= 15 && !label){
      label = 'vol+';
      cls = 'up';
    }
    if (!label) return '';
    const tip = [
      t.volPct != null ? ('vol ' + Math.round(t.volPct) + '% din media 20z') : '',
      t.posPct != null ? ('poziție range ' + Math.round(t.posPct) + '%') : ''
    ].filter(Boolean).join(' · ');
    return '<span class="ht-gap-trad ' + cls + '" title="' + esc(tip) + '">' + esc(label) + '</span>';
  }

  function chipHtml(g, isAfter){
    const dir = g.gapPct >= 0 ? 'up' : 'down';
    const arrow = g.gapPct >= 0 ? '▲' : '▼';
    const earn = earnBadge(g.sym);
    const wl = g.inWl ? ' wl' : '';
    const sessTxt = isAfter ? 'Δ zi vs close ieri' : 'gap premarket';
    const title = g.sym + ' · $' + fmtNum(g.price) + ' (prev ' + fmtNum(g.prev) + ') · ' + sessTxt;
    const notes = (g.gapPct >= 0 ? '+' : '') + g.gapPct.toFixed(1) + '% · ' + sessTxt;
    const nqHref = './nasdaq-scanner/?sym=' + encodeURIComponent(g.sym);
    const pctStr = (g.gapPct >= 0 ? '+' : '') + g.gapPct.toFixed(1) + '%';
    const tr = tradHtml(g.trad);
    // Bandă densă 1-linie: SYM  %  $px  [trad/earn] — fără card + journal rail
    return '<a href="' + nqHref + '" class="ht-gap-chip ' + dir + wl + '" data-sctx-sym="' + esc(g.sym) + '" data-sctx-source="hub-gapper" data-sctx-notes="' + esc(notes) + '" title="' + esc(title) + '">' +
      '<span class="ht-gap-sym">' + esc(g.sym) + '</span>' +
      '<span class="ht-gap-pct ' + dir + '">' + arrow + pctStr + '</span>' +
      '<span class="ht-gap-px">$' + fmtNum(g.price) + '</span>' +
      (earn ? '<span class="ht-gap-earn">' + esc(earn) + '</span>' : '') +
      (tr || '') +
      '</a>';
  }

  function panelShell(bodyInner, opts){
    opts = opts || {};
    const session = getNYSESession();
    const isAfter = session.state === 'after';
    const ico = isAfter ? '🌙' : '🌅';
    const tip = isAfter
      ? 'After-hours · mișcare ≥' + MIN_GAP_PCT + '%'
      : 'Premarket · gap ≥' + MIN_GAP_PCT + '%';
    const count = opts.count != null
      ? '<span class="ht-gap-count" title="gappers pe listă">' + opts.count + '</span>'
      : '';
    const warn = opts.warn
      ? '<span class="ht-gap-warn" title="' + esc(opts.warnTip || '') + '">' + esc(opts.warn) + '</span>'
      : '';
    // Strip orizontal dens (nu panou înalt cu spațiu gol)
    return '<div class="ht-gap-strip" title="' + esc(tip) + '">' +
      '<div class="ht-gap-kicker">' +
        '<span class="ht-gap-ico" aria-hidden="true">' + ico + '</span>' +
        '<span class="ht-gap-title">Gappers</span>' +
        count + warn +
      '</div>' +
      bodyInner +
      '</div>';
  }

  function render(el){
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return;
    const session = getNYSESession();
    if (session.state !== 'pre' && session.state !== 'after'){
      el.innerHTML = '';
      el.hidden = true;
      el.style.display = 'none';
      return;
    }
    el.hidden = false;
    el.style.display = '';
    if (lastHtml) el.innerHTML = lastHtml;
    else el.innerHTML = panelShell('<div class="ht-gap-empty">Se încarcă…</div>');
  }

  let lastTickAt = 0;

  async function tick(opts){
    opts = opts || {};
    const el = document.getElementById('hubGappersSlot');
    const session = getNYSESession();
    if (!el || (session.state !== 'pre' && session.state !== 'after')){
      if (el){ el.innerHTML = ''; el.hidden = true; el.style.display = 'none'; }
      lastHtml = '';
      return;
    }
    el.hidden = false;
    // fără cheie Finnhub tot merge (Yahoo)
    if (!(global.D && D.fetchJSON) && !getFinnhubKey()){
      lastHtml = panelShell('<div class="ht-gap-empty">Lipsește lib/data.js</div>');
      el.innerHTML = lastHtml;
      el.style.display = '';
      return;
    }
    lastTickAt = Date.now();
    const { gappers, reason } = await fetchAllGappers(opts);
    function paintChips(list, why){
      const isAfter = session.state === 'after';
      if (why === 'pending'){
        lastHtml = panelShell('<div class="ht-gap-empty">Se încarcă…</div>');
      } else if (why === 'error' || why === 'no_data'){
        lastHtml = panelShell('<div class="ht-gap-empty">Rețea indisponibilă — reîncearcă în 1 min</div>');
      } else if (!list.length){
        lastHtml = panelShell(
          '<div class="ht-gap-empty">Niciun gap ≥' + MIN_GAP_PCT + '% acum</div>',
          { warn: why === 'partial' ? 'parțial' : null, warnTip: 'univers de scan incomplet' }
        );
      } else {
        lastHtml = panelShell(
          '<div class="ht-gappers-scroll">' + list.map(g => chipHtml(g, isAfter)).join('') + '</div>',
          {
            count: list.length,
            warn: why === 'partial' ? 'parțial' : null,
            warnTip: 'sub 50% din univers a răspuns — top-ul poate fi incomplet'
          }
        );
      }
      el.innerHTML = lastHtml;
      el.hidden = false;
      el.style.display = '';
    }
    paintChips(gappers, reason);
    if (!opts.skipTrad && gappers.length){
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
      try { await tick(); } catch (e) {}
      scheduleRefresh();
    }, REFRESH_MS);
  }

  function init(){
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c && Array.isArray(c.data) && !c.data.length) localStorage.removeItem(CACHE_KEY);
    } catch (e) {}
    // First paint din cache (chiar stale) — zero Yahoo. Sweep-ul 30× e după 4s.
    tick({ allowStale: true, noNetwork: true, skipTrad: true });
    setTimeout(function () {
      tick({ force: true, skipTrad: true });
      scheduleRefresh();
    }, 4000);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (Date.now() - lastTickAt < 30000) return;
      tick({ skipTrad: true });
    });
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
