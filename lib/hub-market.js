// hub-market.js — SPY/QQQ/VIX bus + aux widgets + sesiune ET (HM.*)
(function(global){
  'use strict';

  const $ = id => document.getElementById(id);
  const fmtP = p => p >= 1000 ? '$' + p.toLocaleString('en', { maximumFractionDigits: 0 }) : '$' + p.toFixed(2);
  const fmtVix = p => p.toFixed(2);
  const CORS = u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u);

  function usSession(){
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
    } catch (e) { return 'rth'; }
  }

  function dayLabel(sess){
    return sess === 'weekend' ? '% ult. sesiune' : sess === 'pre' ? '% pre' : sess === 'after' ? '% after' : '% azi';
  }

  async function fetchQuote(sym){
    const sess = global.__hubMkt?.session || usSession();
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1m&range=1d&includePrePost=true`;
    let data;
    if (global.D && D.fetchJSON) data = await D.fetchJSON(url, { ttl: 30 });
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
    const prev = sess === 'pre'
      ? (meta.regularMarketPrice ?? meta.chartPreviousClose)
      : (meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPrice);
    if (!price || !prev) throw new Error('no price');
    return { price, chgPct: ((price - prev) / prev) * 100 };
  }

  function stashMkt(key, q){
    try {
      if (!global.__hubMkt) global.__hubMkt = { session: usSession(), dayLabel: dayLabel(usSession()), quotes: {} };
      global.__hubMkt.quotes[key] = q;
      global.__hubMkt.ts = Date.now();
      localStorage.setItem('tt_hub_mkt_v1', JSON.stringify({
        session: global.__hubMkt.session,
        dayLabel: global.__hubMkt.dayLabel,
        quotes: global.__hubMkt.quotes,
        ts: global.__hubMkt.ts
      }));
      global.dispatchEvent(new CustomEvent('hub:market'));
      if (global.HB && HB.renderCockpit) HB.renderCockpit();
    } catch (e) {}
  }

  function applyMktQuote(sym, valEl, subEl, fmt, wrapId, invert){
    const q = global.__hubMkt && global.__hubMkt.quotes && global.__hubMkt.quotes[sym];
    if (!q) return;
    const v = $(valEl), s = $(subEl);
    if (!v || !s) return;
    v.textContent = fmt(q.price);
    s.innerHTML = (q.chgPct >= 0 ? '+' : '') + q.chgPct.toFixed(2) + (global.__hubMkt.dayLabel || '');
    const up = invert ? q.chgPct < 0 : q.chgPct >= 0;
    s.className = 'ht-m-sub w-sub ' + (up ? 'w-pos' : 'w-neg');
    const wrap = wrapId ? $(wrapId) : null;
    if (wrap && global.HS) HS.setCardLvl(wrap, HS.marketQuoteLvl(sym, q));
    else if (wrap) wrap.className = wrap.className.replace(/\blvl-\w+/g, '').trim() + ' lvl-' + (up ? 'ok' : 'bear');
    if (global.HS) HS.renderStaleNav();
  }

  async function renderTicker(sym, valEl, subEl, fmt, wrapId, invert){
    const dl = global.__hubMkt?.dayLabel || dayLabel(usSession());
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

  async function refreshMarketQuotes(){
    await renderTicker('SPY', 'spyVal', 'spySub', fmtP, 'wSPY', false);
    await renderTicker('QQQ', 'qqqVal', 'qqqSub', fmtP, 'wQQQ', false);
    const dl = global.__hubMkt?.dayLabel || dayLabel(usSession());
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
    const PRE_OPEN = 4 * 60, REG_OPEN = 9 * 60 + 30, REG_CLOSE = 16 * 60, AFTER_CLOSE = 20 * 60;
    let label, sub, cls = '';
    if (isWeekend){
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
      sub = 'AH în ' + fmtCountdown((AFTER_CLOSE - minutesNow) * 60000 - et.second * 1000);
      cls = 'ext';
    } else {
      label = '🌙 Overnight';
      const minsUntilTomorrowPre = (24 * 60 - minutesNow) + PRE_OPEN;
      sub = 'Pre în ' + Math.floor(minsUntilTomorrowPre / 60) + 'h';
    }
    const sp = $('hubSessionPill');
    if (sp){
      const shortLbl = label.replace(/^.\s*/, '');
      sp.textContent = sub ? shortLbl + ' · ' + sub : shortLbl;
      sp.className = 'hub-session-pill' + (cls ? ' ' + cls : '');
    }
  }

  function init(){
    const sess = usSession();
    global.__hubMkt = { session: sess, dayLabel: dayLabel(sess), quotes: {} };
    try {
      const cached = JSON.parse(localStorage.getItem('tt_hub_mkt_v1') || 'null');
      if (cached && cached.ts && Date.now() - cached.ts < 300000 && cached.quotes) {
        global.__hubMkt = Object.assign({}, global.__hubMkt, cached);
      }
    } catch (e) {}
    loadWlData();
    refreshAuxWidgets();
    refreshMarketQuotes();
    updateSessionPillTimer();
    setInterval(updateSessionPillTimer, 1000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshMarketQuotes();
    });
  }

  global.HM = { init, refreshMarketQuotes, restoreMarketWidgets, refreshAuxWidgets, usSession, fetchQuote };
  global.hubRefreshMarketQuotes = refreshMarketQuotes;
  global.hubRestoreMarketWidgets = restoreMarketWidgets;
  global.hubRefreshAuxWidgets = refreshAuxWidgets;
})(typeof window !== 'undefined' ? window : global);