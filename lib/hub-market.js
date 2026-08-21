// hub-market.js — SPY/QQQ/VIX bus + aux widgets + sesiune ET (HM.*)
(function(global){
  'use strict';

  const $ = id => document.getElementById(id);
  const fmtP = p => p >= 1000 ? '$' + p.toLocaleString('en', { maximumFractionDigits: 0 }) : '$' + p.toFixed(2);
  const fmtVix = p => p.toFixed(2);
  const CORS = u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u);

  function usSession(){
    // sursă unică I-208: SES știe sărbători + half-days (pe 4 iulie NU mai
    // raportăm „rth"); vocabularul local rămâne, holiday → 'closed'
    if (global.SES && SES.info){
      const s = SES.info().state;
      return s === 'holiday' ? 'closed' : s;
    }
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone:'America/New_York', hour12:false, weekday:'short', hour:'2-digit', minute:'2-digit'
      }).formatToParts(new Date()).map(x => [x.type, x.value]));
      if (p.weekday === 'Sat' || p.weekday === 'Sun') return 'weekend';
      const mins = (+p.hour) * 60 + (+p.minute);
      if (mins >= 240 && mins < 570) return 'pre';
      if (mins >= 570 && mins < 960) return 'rth';
      if (mins >= 960 && mins < 1200) return 'after';
      return 'closed';
    } catch (e) { return 'closed'; } // eroare Intl → conservator ÎNCHIS, nu „rth" fals
  }

  function dayLabel(sess){
    if (sess === 'weekend') return '% ult. sesiune';
    if (sess === 'pre') return '% pre';
    if (sess === 'after') return '% after';
    // overnight 00:00-04:00 ET (= dimineata RO): chart-ul range=1d e inca
    // ziua PRECEDENTA — "% azi" ar eticheta variatia de ieri ca a zilei
    if (sess === 'closed'){
      try {
        const h = parseInt(new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', hour:'2-digit', hour12:false }).format(new Date()), 10);
        if (h < 4) return '% ult. sesiune';
      } catch (e) {}
    }
    return '% azi';
  }

  // sesiunea se recalculeaza intotdeauna fresh (nu din __hubMkt) — o pagina
  // deschisa peste granita 9:30 ET ramanea altfel blocata pe 'pre' toata ziua
  function syncSession(){
    const sess = usSession();
    if (!global.__hubMkt) global.__hubMkt = { quotes: {} };
    global.__hubMkt.session = sess;
    global.__hubMkt.dayLabel = dayLabel(sess);
    return sess;
  }

  async function fetchQuote(sym){
    // I-214: bus proaspăt → zero rețea (alt tab / refresh recent)
    const busKey = String(sym).replace('%5E', '').replace('^', '') || sym;
    if (global.QB) {
      const hit = QB.get(busKey === 'VIX' || sym.indexOf('VIX') >= 0 ? 'VIX' : busKey, 30000);
      if (hit) return { price: hit.price, chgPct: hit.chgPct, fromBus: true };
    }
    const sess = usSession();
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1m&range=1d&includePrePost=true`;
    let data;
    // fără SWR: vrem preț fresh pe rețea; paint-ul instant e din restoreMarketWidgets
    // SWR: paint din cache expirat + revalidare async — hub-ul nu mai stă pe „…” la reload
    if (global.D && D.fetchJSON) data = await D.fetchJSON(url, { ttl: 30, timeout: 6000, swr: true, maxStale: 900 });
    else {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 9000);
      try {
        const r = await fetch(CORS(url), { signal: ctrl.signal });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        data = await r.json();
      } finally { clearTimeout(to); }
    }
    const res = data?.chart?.result?.[0];
    const meta = res?.meta;
    if (!meta) throw new Error('no meta');
    const closes = res?.indicators?.quote?.[0]?.close || [];
    let bar = null;
    for (let i = closes.length - 1; i >= 0; i--) { if (closes[i] != null) { bar = closes[i]; break; } }
    const price = bar
      ?? (sess === 'pre' ? meta.preMarketPrice : sess === 'after' ? meta.postMarketPrice : null)
      ?? meta.regularMarketPrice;
    // referinta pe sesiune: pre -> regularMarketPrice = close IERI;
    // after -> regularMarketPrice = close-ul oficial de AZI (altfel "% after"
    // afisa miscarea totala zi+AH vs close-ul de ieri — mislabel);
    // rest -> chartPreviousClose
    const prev = (sess === 'pre' || sess === 'after')
      ? (meta.regularMarketPrice ?? meta.chartPreviousClose)
      : (meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPrice);
    if (!price || !prev) throw new Error('no price');
    return { price, chgPct: ((price - prev) / prev) * 100 };
  }

  function stashMkt(key, q){
    try {
      syncSession();
      if (!global.__hubMkt.quotes) global.__hubMkt.quotes = {};
      // ts PER QUOTE — cu un singur ts global, un VIX picat repetat rămânea
      // „proaspăt" cât timp SPY reușea, iar staleAudit nu-l prindea
      const stamped = { ...q, ts: Date.now() };
      global.__hubMkt.quotes[key] = stamped;
      global.__hubMkt.ts = Date.now();
      localStorage.setItem('tt_hub_mkt_v1', JSON.stringify({
        session: global.__hubMkt.session,
        dayLabel: global.__hubMkt.dayLabel,
        quotes: global.__hubMkt.quotes,
        ts: global.__hubMkt.ts
      }));
      // I-214 quote bus — partajat cu macro/journal/scanner pe același device
      if (global.QB) {
        try { QB.set(key, stamped, { src: 'hub-market', silent: false }); } catch (e2) {}
      }
    } catch (e) {}
    // dispatch-ul NU sta in try-ul de persist: daca setItem arunca (quota
    // plina / private mode), consumatorii pe event tot trebuie notificati
    try { global.dispatchEvent(new CustomEvent('hub:market')); } catch (e) {}
    try { if (global.HB && HB.renderCockpit) HB.renderCockpit(); } catch (e) {}
  }

  function applyMktQuote(sym, valEl, subEl, fmt, wrapId, invert){
    const q = global.__hubMkt && global.__hubMkt.quotes && global.__hubMkt.quotes[sym];
    if (!q || !Number.isFinite(q.price) || !Number.isFinite(q.chgPct)) return; // cache corupt → nu randa $NaN
    const v = $(valEl), s = $(subEl);
    if (!v || !s) return;
    v.textContent = fmt(q.price);
    // quote mai vechi de 15 min marcat 📦 în sub — nu se prezintă ca live
    const qAge = Number.isFinite(q.ts) ? Date.now() - q.ts : null;
    const staleTag = qAge != null && qAge > 15 * 60000 ? ' 📦' + Math.round(qAge / 60000) + 'm' : '';
    s.innerHTML = (q.chgPct >= 0 ? '+' : '') + q.chgPct.toFixed(2) + (global.__hubMkt.dayLabel || '') + staleTag;
    const up = invert ? q.chgPct < 0 : q.chgPct >= 0;
    s.className = 'ht-m-sub w-sub ' + (up ? 'w-pos' : 'w-neg');
    const wrap = wrapId ? $(wrapId) : null;
    if (wrap && global.HS) HS.setCardLvl(wrap, HS.marketQuoteLvl(sym, q));
    else if (wrap) wrap.className = wrap.className.replace(/\blvl-\w+/g, '').trim() + ' lvl-' + (up ? 'ok' : 'bear');
    if (global.HS) HS.renderStaleNav();
  }

  async function renderTicker(sym, valEl, subEl, fmt, wrapId, invert){
    const dl = dayLabel(usSession());
    try {
      const q = await fetchQuote(sym);
      const v = $(valEl), s = $(subEl);
      if (v) v.textContent = fmt(q.price);
      if (s){
        s.innerHTML = (q.chgPct >= 0 ? '+' : '') + q.chgPct.toFixed(2) + dl;
        const up = invert ? q.chgPct < 0 : q.chgPct >= 0;
        s.className = 'ht-m-sub w-sub ' + (up ? 'w-pos' : 'w-neg');
      }
      if (wrapId){
        const w = $(wrapId);
        if (w && global.HS) HS.setCardLvl(w, HS.marketQuoteLvl(sym, q));
        else if (w) {
          const up = invert ? q.chgPct < 0 : q.chgPct >= 0;
          w.className = w.className.replace(/\blvl-\w+/g, '').trim() + ' lvl-' + (up ? 'ok' : 'bear');
        }
      }
      stashMkt(sym, q);
    } catch (e) {
      const s = $(subEl);
      if (s) s.textContent = 'indisponibil';
    }
  }

  function restoreMarketWidgets(){
    applyMktQuote('SPY', 'spyVal', 'spySub', fmtP, 'wSPY', false);
    applyMktQuote('QQQ', 'qqqVal', 'qqqSub', fmtP, 'wQQQ', false);
    applyMktQuote('VIX', 'vixVal', 'vixSub', fmtVix, 'wVIX', true);
  }

  // I-214 hot-set: open journal + top WL pe bus (max 10, skip dacă fresh)
  async function publishHotSet(){
    if (!global.QB) return;
    const want = [];
    try {
      const j = JSON.parse(localStorage.getItem('tt_journal_v1') || '[]') || [];
      j.forEach(e => {
        if (e && (e.status === 'open' || e.exit == null) && e.sym && +e.size > 0)
          want.push(String(e.sym).toUpperCase());
      });
    } catch (e) {}
    try {
      const wl = JSON.parse(localStorage.getItem('wl_stocks') || '[]') || [];
      wl.slice(0, 6).forEach(s => {
        if (s) want.push(String(s).toUpperCase());
      });
    } catch (e) {}
    const seen = new Set(['SPY', 'QQQ', 'VIX']);
    const list = [];
    want.forEach(s => {
      if (!s || seen.has(s)) return;
      seen.add(s);
      list.push(s);
    });
    const targets = list.slice(0, 10);
    if (!targets.length) return;
    // batch paralel mic — hit bus sare rețeaua
    await Promise.allSettled(targets.map(async sym => {
      if (QB.get(sym, 60000)) return;
      try {
        const q = await fetchQuote(sym);
        if (q && Number.isFinite(q.price)) QB.set(sym, { price: q.price, chgPct: q.chgPct, src: 'hot-set' });
      } catch (e) {}
    }));
  }

  async function refreshMarketQuotes(){
    syncSession();
    // PARALEL SPY+QQQ+VIX — secvențial = 3 × latența proxy (8–24s pe hang).
    // allSettled: un sim picat nu blochează restul.
    const dl = dayLabel(usSession());
    await Promise.allSettled([
      renderTicker('SPY', 'spyVal', 'spySub', fmtP, 'wSPY', false),
      renderTicker('QQQ', 'qqqVal', 'qqqSub', fmtP, 'wQQQ', false),
      (async () => {
        try {
          const q = await fetchQuote('%5EVIX');
          const v = $('vixVal'), s = $('vixSub');
          if (v) v.textContent = fmtVix(q.price);
          const up = q.chgPct < 0;
          if (s){
            s.innerHTML = (q.chgPct >= 0 ? '+' : '') + q.chgPct.toFixed(2) + dl;
            s.className = 'ht-m-sub w-sub ' + (up ? 'w-pos' : 'w-neg');
          }
          const w = $('wVIX');
          if (w && global.HS) HS.setCardLvl(w, HS.marketQuoteLvl('VIX', q));
          else if (w) w.className = w.className.replace(/\blvl-\w+/g, '').trim() + ' lvl-' + (q.price >= 25 ? 'bear' : q.price >= 18 ? 'warn' : up ? 'ok' : 'bear');
          stashMkt('VIX', q);
        } catch (e) {
          const vs = $('vixSub');
          if (vs) vs.textContent = 'indisponibil';
        }
      })()
    ]);
    // Hot-set (journal + WL) mult mai târziu — 10 Yahoo extra la boot = hub lent.
    setTimeout(() => { try { publishHotSet(); } catch (e) {} }, 8000);
  }

  function loadWlData(){
    let stockWL = [], cryptoWL = [];
    try { stockWL = JSON.parse(localStorage.getItem('wl_stocks') || '[]') || []; } catch (e) {}
    try {
      const scfg = JSON.parse(localStorage.getItem('scanner_cfg') || '{}');
      if (typeof scfg.watchlist === 'string' && scfg.watchlist.trim()) {
        cryptoWL = scfg.watchlist.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
      }
      const dash = JSON.parse(localStorage.getItem('dash_watchlist') || '[]') || [];
      const dashSet = new Set(cryptoWL);
      dash.forEach(c => { if (c && typeof c === 'string') dashSet.add(c.toUpperCase()); });
      cryptoWL = [...dashSet];
    } catch (e) {}
    global.__hubWlData = { stockWL, cryptoWL };
    return { stockWL, cryptoWL };
  }

  function refreshAuxWidgets(){
    try {
      const raw = JSON.parse(localStorage.getItem('wl_price_alerts') || '{}');
      let n = 0;
      for (const k in raw){ if (Array.isArray(raw[k])) n += raw[k].filter(a => a && a.armed !== false).length; }
      const av = $('alertsVal'), as = $('alertsSub'), wa = $('wAlerts');
      if (av) av.textContent = n;
      if (as) as.textContent = n ? 'preț armate' : 'niciuna activă';
      if (wa) wa.style.display = n ? '' : 'none';
    } catch (e) {}
    const { stockWL: sw, cryptoWL: cw } = loadWlData();
    const total = sw.length + cw.length;
    const wv = $('wlVal'), ws = $('wlSub');
    if (wv) wv.textContent = total;
    if (ws) ws.textContent = total === 0 ? 'gol — adaugă în scanere' : total === 1 ? '1 simbol' : total + ' simboluri';
    const stocksLink = '<a href="./watchlist-monitor/" target="_blank" style="color:var(--crypto-2);text-decoration:none">📈 ' + sw.length + ' stocks</a>';
    const cryptoLink = '<a href="https://mferent80-source.github.io/scanner/" target="_blank" style="color:#5bb0ff;text-decoration:none">🪙 ' + cw.length + ' crypto</a>';
    const wbv = $('wlBreakdownVal'), wbs = $('wlBreakdownSub');
    if (wbv) wbv.innerHTML = stocksLink + ' · ' + cryptoLink;
    const top = sw.slice(0, 3).concat(cw.slice(0, 3)).filter(Boolean);
    if (wbs) wbs.textContent = top.length ? 'Ex: ' + top.slice(0, 4).join(' · ') : 'click → listă';
  }

  function getETNow(){
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
    });
    const parts = fmt.formatToParts(new Date()).reduce((o, p) => { o[p.type] = p.value; return o; }, {});
    return {
      hour: parseInt(parts.hour, 10) % 24,
      minute: parseInt(parts.minute, 10),
      second: parseInt(parts.second, 10),
      day: new Date(new Date().toLocaleString('en-US', { timeZone:'America/New_York' })).getDay()
    };
  }

  function fmtCountdown(ms){
    if (ms <= 0) return 'acum';
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
    return m + 'm ' + String(sec).padStart(2, '0') + 's';
  }

  function updateSessionPillTimer(){
    const et = getETNow();
    const isWeekend = et.day === 0 || et.day === 6;
    const minutesNow = et.hour * 60 + et.minute;
    // half-day (SES): close 13:00 ET, AH scurt — pragurile se strâng
    const sesInfo = (global.SES && SES.info) ? SES.info() : null;
    const half = !!(sesInfo && sesInfo.halfDay);
    const PRE_OPEN = 4 * 60, REG_OPEN = 9 * 60 + 30, REG_CLOSE = half ? 13 * 60 : 16 * 60, AFTER_CLOSE = half ? 17 * 60 : 20 * 60;
    let label, sub, cls = '';
    if (sesInfo && sesInfo.state === 'holiday'){
      label = '🎌 Închis';
      sub = sesInfo.holidayName || 'sărbătoare NYSE';
    } else if (isWeekend){
      label = '🛌 Weekend';
      sub = 'Redeschidere luni 04:00 ET';
    } else if (minutesNow < PRE_OPEN){
      label = '🌙 Overnight';
      sub = 'Pre în ' + fmtCountdown((PRE_OPEN - minutesNow) * 60000 - et.second * 1000);
    } else if (minutesNow < REG_OPEN){
      label = '🌅 Pre-Market';
      sub = 'RTH în ' + fmtCountdown((REG_OPEN - minutesNow) * 60000 - et.second * 1000);
      cls = 'ext';
    } else if (minutesNow < REG_CLOSE){
      label = '🟢 RTH';
      sub = 'Închide în ' + fmtCountdown((REG_CLOSE - minutesNow) * 60000 - et.second * 1000);
      cls = 'rth';
    } else if (minutesNow < AFTER_CLOSE){
      label = '🌆 After-Hours';
      // suntem DEJA în AH — countdown-ul e până la închiderea lui, nu „AH în X"
      sub = 'AH închide în ' + fmtCountdown((AFTER_CLOSE - minutesNow) * 60000 - et.second * 1000);
      cls = 'ext';
    } else {
      label = '🌙 Overnight';
      const minsUntilTomorrowPre = (24 * 60 - minutesNow) + PRE_OPEN;
      sub = 'Pre în ' + Math.floor(minsUntilTomorrowPre / 60) + 'h';
    }
    const sp = $('hubSessionPill');
    if (sp){
      // strip primul TOKEN (emoji), nu primul code unit — /^./ taia jumatate
      // de pereche surrogate (🟢 etc.) si lasa "�" la inceputul textului
      const shortLbl = label.replace(/^[^\s]+\s*/, '');
      sp.textContent = sub ? shortLbl + ' · ' + sub : shortLbl;
      sp.className = 'hub-session-pill' + (cls ? ' ' + cls : '');
    }
  }

  function hydrateFromBus(){
    if (!global.QB) return;
    try {
      if (!global.__hubMkt) global.__hubMkt = { quotes: {} };
      if (!global.__hubMkt.quotes) global.__hubMkt.quotes = {};
      ['SPY', 'QQQ', 'VIX'].forEach(sym => {
        const q = QB.getAny(sym);
        if (!q || !Number.isFinite(q.price)) return;
        const cur = global.__hubMkt.quotes[sym];
        if (!cur || (q.ts && (!cur.ts || q.ts > cur.ts))) {
          global.__hubMkt.quotes[sym] = { price: q.price, chgPct: q.chgPct, ts: q.ts };
        }
      });
    } catch (e) {}
  }

  function init(){
    syncSession();
    try {
      // din cache se restaureaza DOAR quotes+ts — sesiunea cachetata era stale
      // (Object.assign cu tot obiectul re-ingheta sesiunea la fiecare reload)
      const cached = JSON.parse(localStorage.getItem('tt_hub_mkt_v1') || 'null');
      if (cached && cached.ts && Date.now() - cached.ts < 300000 && cached.quotes) {
        // doar quotes numerice valide — un cache corupt arunca în toFixed
        const clean = {};
        Object.entries(cached.quotes).forEach(([k, q]) => {
          if (q && Number.isFinite(q.price) && Number.isFinite(q.chgPct)) clean[k] = q;
        });
        global.__hubMkt.quotes = clean;
        global.__hubMkt.ts = cached.ts;
      }
    } catch (e) {}
    // I-214: completează din bus (alt tab poate fi mai fresh)
    hydrateFromBus();
    loadWlData();
    refreshAuxWidgets();
    // paint IMEDIAT din cache (tt_hub_mkt_v1 / bus) — fără asta SPY/QQQ/VIX stăteau
    // goale până la terminarea fetch-ului (chiar dacă aveam quotes <5 min)
    restoreMarketWidgets();
    refreshMarketQuotes();
    updateSessionPillTimer();
    setInterval(updateSessionPillTimer, 1000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshMarketQuotes();
    });
    // alt tab a scris bus → re-paint fără fetch
    if (global.QB && QB.subscribe) {
      QB.subscribe(function (ev) {
        if (!ev || (ev.type !== 'remote' && ev.type !== 'remote-many' && ev.type !== 'storage')) return;
        hydrateFromBus();
        restoreMarketWidgets();
      });
    }
  }

  global.HM = { init, refreshMarketQuotes, restoreMarketWidgets, refreshAuxWidgets, usSession, fetchQuote, hydrateFromBus, publishHotSet };
  global.hubRefreshMarketQuotes = refreshMarketQuotes;
  global.hubRestoreMarketWidgets = restoreMarketWidgets;
  global.hubRefreshAuxWidgets = refreshAuxWidgets;
})(typeof window !== 'undefined' ? window : global);