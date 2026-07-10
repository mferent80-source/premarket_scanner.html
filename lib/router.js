// ═══════════════════════════════════════════════════════════════════
// router.js v9 — Regime Router Pro: blockers, actions, counterfactual, timeline (RT.*)
// Playbook: tt_router_playbook_v2 { rules, settings, version }
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';
  const KEY = 'tt_router_playbook_v2';
  const LEGACY_KEY = 'tt_router_playbook_v1';

  const PRESETS = {
    'none': { label: '—', hint: 'Fără preset' },
    'zlhma-scalp': { label: 'ZLHMA Scalping', hint: 'ZLHMA TOP · preset Scalping · 5–15m' },
    'zlema-swing': { label: 'ZLEMA Swing', hint: 'ZLEMA · preset Swing · 1h–4h' },
    'amd-phase': { label: 'AMD Phase', hint: 'AMD Phase Detector · cicluri ACCUM/DIST' },
    'suite-go': { label: 'ZL Osc Suite', hint: 'SUITE_GO + quality gate' },
    'antifomo': { label: 'AntiFOMO', hint: 'AntiFOMO Pro · macro gate integrat' },
    'manual': { label: 'Manual', hint: 'Fără preset automat' }
  };

  const DEFAULT_SETTINGS = {
    earningsGuard: true,
    macroFreezeHigh: true,
    sessionMult: { pre: 0.55, open: 1, after: 0.65, closed: 0, weekend: 0 }
  };

  const DEFAULT_RULES = [
    { id: 'r-macro', when: { macroHigh: true }, then: { strategy: 'STAY OUT', sizingMult: 0, maxTrades: 0, preset: 'none' }, note: 'Zi macro high-impact (NFP/CPI/FOMC)' },
    { id: 'r-earn', when: { earningsToday: 'watchlist' }, then: { strategy: 'STAY OUT', sizingMult: 0, maxTrades: 0, preset: 'none' }, note: 'Earnings pe watchlist azi' },
    { id: 'r-off', when: { regim: ['risk-off', 'stress'], dangerMin: 40 }, then: { strategy: 'STAY OUT', sizingMult: 0, maxTrades: 0, preset: 'none' }, note: 'Risk-off + danger ridicat' },
    { id: 'r-on-rth', when: { regim: ['risk-on'], session: ['open'], dangerMax: 38, sectorRot: ['ON', 'NEUTRAL', 'LEAN ON'] }, then: { strategy: 'ZLHMA Scalping', sizingMult: 1, maxTrades: 5, preset: 'zlhma-scalp' }, note: 'Risk-on RTH + rotație favorabilă' },
    { id: 'r-pre', when: { session: ['pre'], regim: ['risk-on', 'neutral'], dangerMax: 45 }, then: { strategy: 'ZLHMA Scalping (redus)', sizingMult: 0.5, maxTrades: 2, preset: 'zlhma-scalp' }, note: 'Premarket — sizing redus' },
    { id: 'r-neutral', when: { regim: ['neutral', 'cautious'], dangerMax: 55 }, then: { strategy: 'ZLEMA Swing', sizingMult: 0.75, maxTrades: 3, preset: 'zlema-swing' }, note: 'Neutral/cautious — swing' },
    { id: 'r-danger', when: { dangerMin: 45, dangerMax: 72 }, then: { strategy: 'AMD Phase only', sizingMult: 0.5, maxTrades: 2, preset: 'amd-phase' }, note: 'Danger mediu — doar AMD' },
    { id: 'r-after', when: { session: ['after'], dangerMax: 50 }, then: { strategy: 'ZLEMA Swing (redus)', sizingMult: 0.4, maxTrades: 1, preset: 'zlema-swing' }, note: 'After-hours — max 1 trade' },
    { id: 'r-fallback', when: { regim: ['*'] }, then: { strategy: 'ZLEMA Swing', sizingMult: 0.5, maxTrades: 2, preset: 'zlema-swing' }, note: 'Fallback conservator' },
    { id: 'r-eq-dd', when: { equityDdMin: 10 }, then: { strategy: 'STAY OUT', sizingMult: 0, maxTrades: 0, preset: 'none' }, note: 'DD rolling equity ≥10% — review capital' },
    { id: 'r-eq-drift', when: { equityDriftMin: 2 }, then: { strategy: 'STAY OUT', sizingMult: 0, maxTrades: 0, preset: 'none' }, note: 'Drift equity ≥2% — reconciliază snapshot' },
    { id: 'r-eq-stale', when: { snapshotStaleDays: 14 }, then: { strategy: 'Manual', sizingMult: 0.25, maxTrades: 1, preset: 'manual' }, note: 'Snapshot equity vechi — sizing redus' }
  ];

  function _etDay(ts){
    try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(ts ? new Date(ts) : new Date()); }
    catch(e){ return new Date(ts || Date.now()).toISOString().slice(0,10); }
  }

  function _etNow(){
    try {
      const fmt = new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', hour12:false,
        weekday:'short', hour:'2-digit', minute:'2-digit' });
      const p = fmt.formatToParts(new Date()).reduce((o, x) => (o[x.type]=x.value, o), {});
      const wd = p.weekday;
      const h = parseInt(p.hour, 10) % 24;
      const m = parseInt(p.minute, 10);
      const weekend = wd === 'Sat' || wd === 'Sun';
      const mins = h * 60 + m;
      let state = 'closed', label = 'Închis';
      if (!weekend){
        if (mins >= 240 && mins < 570){ state = 'pre'; label = 'Pre-market'; }
        else if (mins >= 570 && mins < 960){ state = 'open'; label = 'RTH'; }
        else if (mins >= 960 && mins < 1200){ state = 'after'; label = 'After-hours'; }
      } else { state = 'weekend'; label = 'Weekend'; }
      return { state, label, hour: h, minute: m, weekday: wd, weekend, day: _etDay() };
    } catch(e){ return { state: '?', label: '?', hour: 12, minute: 0, weekday: '?', weekend: false, day: _etDay() }; }
  }

  function normalizeRegime(label){
    const u = String(label || '').toUpperCase();
    if (/RISK[\s-]*OFF|STRESS/.test(u)) return 'risk-off';
    if (/RISK[\s-]*ON|LEAN/.test(u)) return 'risk-on';
    if (/CAUTIOUS/.test(u)) return 'cautious';
    if (/NEUTRAL/.test(u)) return 'neutral';
    return String(label || '?').toLowerCase().replace(/[^a-z-]/g, '') || '?';
  }

  function _macroEventsToday(){
    const today = _etDay();
    const etDateOf = dt => { try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(dt); } catch(e){ return ''; } };
    const wall = (ds, hm) => new Date(`${ds}T${hm}:00-04:00`);
    const out = [];
    const push = (ds, hm, event, impact) => out.push({ d: wall(ds, hm), event, impact });
    ['2026-01-28','2026-03-18','2026-04-29','2026-06-17','2026-07-29','2026-09-16','2026-11-04','2026-12-16'].forEach(ds => {
      push(ds, '14:00', 'FOMC Rate Decision', 'high');
    });
    ['2026-01-09','2026-02-06','2026-03-06','2026-04-03','2026-05-08','2026-06-05','2026-07-02','2026-08-07','2026-09-04','2026-10-02','2026-11-06','2026-12-04']
      .forEach(ds => push(ds, '08:30', 'NFP', 'high'));
    ['2026-01-13','2026-02-11','2026-03-11','2026-04-10','2026-05-12','2026-06-10','2026-07-14','2026-08-12','2026-09-11','2026-10-14','2026-11-10','2026-12-10']
      .forEach(ds => push(ds, '08:30', 'CPI', 'high'));
    const todayEv = out.filter(e => etDateOf(e.d) === today);
    return {
      high: todayEv.filter(e => e.impact === 'high'),
      med: todayEv.filter(e => e.impact === 'med'),
      macroHighToday: todayEv.some(e => e.impact === 'high'),
      macroMedToday: todayEv.some(e => e.impact === 'med'),
      list: todayEv
    };
  }

  function _pad2(n){ return String(n).padStart(2, '0'); }

  function _freshness(ageMin, freshMax, staleMax){
    if (ageMin == null) return { status: 'missing', label: 'lipsește' };
    if (ageMin <= freshMax) return { status: 'fresh', label: ageMin < 1 ? 'proaspăt' : ageMin + 'm' };
    if (ageMin <= staleMax) return { status: 'aging', label: ageMin < 60 ? ageMin + 'm' : Math.round(ageMin / 60) + 'h' };
    return { status: 'stale', label: Math.round(ageMin / 60) + 'h' };
  }

  function _earningsToday(){
    const today = _etDay();
    let wlToday = 0, symbols = [], cacheAgeH = null;
    try {
      const c = JSON.parse(localStorage.getItem('pb_wl_events_cache_v1') || 'null');
      if (c && Array.isArray(c.events)){
        const earn = c.events.filter(e => e.type === 'earnings' && e.date === today);
        wlToday = earn.length;
        symbols = earn.map(e => e.symbol);
        if (c.ts) cacheAgeH = (Date.now() - c.ts) / 3600000;
      }
    } catch(e){}
    return { wlToday, anyToday: wlToday, symbols, cacheAgeH };
  }

  function _sectorCtx(){
    let rotation = null, rotationCls = null, spread = null, leaders = [], laggards = [], leaderRows = [], laggardRows = [], ageH = null, scanTs = null;
    try {
      const reg = JSON.parse(localStorage.getItem('tt_risk_regime') || 'null');
      if (reg){
        if (reg.regime) rotation = String(reg.regime);
        rotationCls = reg.cls || null;
        if (typeof reg.spread === 'number') spread = reg.spread;
      }
    } catch(e){}
    try {
      const scan = JSON.parse(localStorage.getItem('sr_last_scan') || 'null');
      if (scan && Array.isArray(scan.data)){
        const rows = scan.data.filter(d => typeof d.rsRatio === 'number').sort((a, b) => (b.rsRatio||0)-(a.rsRatio||0));
        const pick = d => ({ sym: d.sym || d.name || '?', rs: d.rsRatio, chg1w: d.chg1w });
        leaderRows = rows.slice(0, 4).map(pick);
        laggardRows = rows.slice(-2).reverse().map(pick);
        leaders = leaderRows.map(d => d.sym);
        laggards = laggardRows.map(d => d.sym);
        scanTs = scan.ts || null;
        ageH = scanTs ? (Date.now() - scanTs) / 3600000 : null;
      }
    } catch(e){}
    return { rotation, rotationCls, spread, leaders, laggards, leaderRows, laggardRows, scanAgeH: ageH, scanTs };
  }

  function _marketTone(spyChg, qqqChg){
    const pair = [spyChg, qqqChg].filter(x => typeof x === 'number');
    if (!pair.length) return null;
    const avg = pair.reduce((s, x) => s + x, 0) / pair.length;
    if (avg >= 0.3) return { text: 'tape ferm', cls: 'ok', avg };
    if (avg <= -0.3) return { text: 'tape slab', cls: 'bear', avg };
    return { text: 'tape mixt', cls: 'warn', avg };
  }

  function _marketQuotes(){
    const out = { spy: null, qqq: null, vix: null, spyPrice: null, qqqPrice: null, vixPrice: null, source: null, ageMin: null, hubSession: null, dayLabel: null };
    let m = null;
    try {
      if (global.__hubMkt && global.__hubMkt.quotes && Object.keys(global.__hubMkt.quotes).length) m = global.__hubMkt;
      else {
        const c = JSON.parse(localStorage.getItem('tt_hub_mkt_v1') || 'null');
        if (c && c.quotes && Object.keys(c.quotes).length) m = c;
      }
      if (m){
        out.hubSession = m.session || null;
        out.dayLabel = m.dayLabel || null;
        if (m.ts) out.ageMin = Math.round((Date.now() - m.ts) / 60000);
        out.source = (global.__hubMkt && global.__hubMkt.quotes && Object.keys(global.__hubMkt.quotes).length) ? 'live' : 'cache';
        [['SPY','spy'],['QQQ','qqq'],['VIX','vix']].forEach(([k, lk]) => {
          const row = m.quotes[k];
          if (!row) return;
          if (typeof row.chgPct === 'number') out[lk] = row.chgPct;
          if (typeof row.price === 'number') out[lk + 'Price'] = row.price;
        });
      }
    } catch(e){}
    out.tone = _marketTone(out.spy, out.qqq);
    out.vixLevel = out.vixPrice == null ? null : (out.vixPrice >= 25 ? 'high' : out.vixPrice >= 18 ? 'med' : 'calm');
    return out;
  }

  function _dangerCtx(){
    let score = null, delta = null, trend = 'flat', history = [], band = { band: '?', label: '—', cls: '' };
    try {
      const h = JSON.parse(localStorage.getItem('md_danger_daily') || '[]');
      if (Array.isArray(h) && h.length){
        history = h.slice(-7).map(x => x.score).filter(x => typeof x === 'number');
        const last = h[h.length - 1];
        if (last && typeof last.score === 'number'){
          score = last.score;
          if (h.length >= 2 && typeof h[h.length - 2].score === 'number'){
            delta = score - h[h.length - 2].score;
            trend = delta > 2 ? 'up' : delta < -2 ? 'down' : 'flat';
          }
        }
      }
    } catch(e){}
    if (score != null){
      if (score >= 70) band = { band: 'extreme', label: 'PERICULOS', cls: 'bear', mult: 0.35 };
      else if (score >= 45) band = { band: 'high', label: 'RIDICAT', cls: 'warn', mult: 0.5 };
      else if (score >= 25) band = { band: 'med', label: 'MODERAT', cls: 'warn', mult: 0.75 };
      else band = { band: 'low', label: 'CALM', cls: 'ok', mult: 1 };
    }
    return { score, delta, trend, history, band };
  }

  function _sessionDetail(et){
    const mins = et.hour * 60 + et.minute;
    let untilMins = null, untilLabel = '', progress = 0;
    if (et.weekend){
      untilLabel = 'Luni pre-market';
    } else if (et.state === 'pre'){
      untilMins = Math.max(0, 570 - mins);
      untilLabel = 'RTH deschide';
      progress = Math.min(100, Math.max(0, ((mins - 240) / (570 - 240)) * 100));
    } else if (et.state === 'open'){
      untilMins = Math.max(0, 960 - mins);
      untilLabel = 'RTH închide';
      progress = Math.min(100, Math.max(0, ((mins - 570) / (960 - 570)) * 100));
    } else if (et.state === 'after'){
      untilMins = Math.max(0, 1200 - mins);
      untilLabel = 'After închide';
      progress = Math.min(100, Math.max(0, ((mins - 960) / (1200 - 960)) * 100));
    } else if (mins < 240){
      untilMins = Math.max(0, 240 - mins);
      untilLabel = 'Pre-market';
    }
    const fmtCd = m => {
      if (m == null) return '—';
      if (m >= 60) return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
      return m + 'm';
    };
    return {
      timeET: _pad2(et.hour) + ':' + _pad2(et.minute),
      weekday: et.weekday,
      untilMins,
      untilLabel,
      countdown: fmtCd(untilMins),
      progress: Math.round(progress)
    };
  }

  function _macroFreezeState(list){
    const now = Date.now();
    const events = (list || []).filter(e => e && e.d);
    if (!events.length) return { active: false, state: 'clear', next: null, message: null };
    const sorted = events.slice().sort((a, b) => a.d - b.d);
    const next = sorted.find(e => e.d.getTime() > now - 15 * 60000);
    if (!next) return { active: false, state: 'clear', next: null, message: null };
    const til = next.d.getTime() - now;
    let hm = '?';
    try {
      const p = new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', hour12:false, hour:'2-digit', minute:'2-digit' })
        .formatToParts(next.d).reduce((o, x) => (o[x.type] = x.value, o), {});
      hm = _pad2(parseInt(p.hour, 10) % 24) + ':' + _pad2(parseInt(p.minute, 10));
    } catch(e){}
    if (til <= 15 * 60000 && til >= -15 * 60000){
      const when = til >= 0 ? 'în ' + Math.max(1, Math.round(til / 60000)) + ' min' : 'acum ' + Math.round(-til / 60000) + ' min';
      return { active: true, state: 'freeze', next, event: next.event, hm, message: 'FREEZE ±15m — ' + next.event + ' ' + when };
    }
    if (til > 15 * 60000 && til <= 2 * 3600000){
      const mn = Math.round(til / 60000);
      return { active: false, state: 'soon', next, event: next.event, hm, minsTo: mn, message: 'Catalist în ' + mn + 'm: ' + next.event + ' (' + hm + ' ET)' };
    }
    return { active: false, state: 'clear', next: til > 0 ? next : null, message: null };
  }

  function _journalCtx(){
    let closed = 0, open = 0, todayPnl = 0;
    try {
      const day = _etDay();
      const etDayOf = ts => { try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(new Date(ts)); } catch(e){ return ''; } };
      let entries = [];
      if (global.JR && typeof JR.all === 'function') entries = JR.all();
      else entries = JSON.parse(localStorage.getItem('tt_journal_v1') || '[]');
      if (!Array.isArray(entries)) entries = [];
      entries.forEach(e => {
        if (!e) return;
        const isToday = (e.openTs && etDayOf(e.openTs) === day) || (e.closeTs && etDayOf(e.closeTs) === day);
        if (!isToday) return;
        if (e.exit != null){
          closed++;
          let p = null;
          if (global.JR && typeof JR.pnl === 'function') p = JR.pnl(e);
          else p = (e.dir === 'short' ? (e.entry - e.exit) : (e.exit - e.entry)) * e.size - (e.fees || 0);
          if (p != null) todayPnl += p;
        } else if (e.status === 'open' || e.exit == null) open++;
      });
    } catch(e){}
    return { closed, open, todayPnl };
  }

  function _sourceHealth(parts){
    const rows = [
      { id: 'macro', label: 'Regim macro', href: '../macro-dashboard/', ageMin: parts.regimeAgeMin, fresh: 360, stale: 720 },
      { id: 'danger', label: 'Danger score', href: '../macro-dashboard/', ageMin: parts.dangerAgeMin, fresh: 1440, stale: 2880 },
      { id: 'sector', label: 'Sector scan', href: '../sector-rotation/', ageMin: parts.sectorScanAgeH != null ? Math.round(parts.sectorScanAgeH * 60) : null, fresh: 360, stale: 720 },
      { id: 'market', label: 'SPY/QQQ/VIX', href: '../', ageMin: parts.marketAgeMin, fresh: 30, stale: 180 },
      { id: 'earnings', label: 'Earnings WL', href: '../watchlist-monitor/', ageMin: parts.earnCacheAgeH != null ? Math.round(parts.earnCacheAgeH * 60) : null, fresh: 720, stale: 1680 },
      { id: 'governor', label: 'Risk Desk', href: '../journal/#desk', ageMin: 0, fresh: 60, stale: 240 }
    ];
    return rows.map(r => {
      const f = _freshness(r.ageMin, r.fresh, r.stale);
      return Object.assign({}, r, { status: f.status, ageLabel: f.label });
    });
  }

  function _regimeStreak(){
    let streak = 0, label = '';
    try {
      const r = JSON.parse(localStorage.getItem('md_risk_regime') || 'null');
      label = r && r.label ? r.label : '';
      const rh = JSON.parse(localStorage.getItem('md_regime_daily') || '[]');
      if (label && Array.isArray(rh)){
        for (let i = rh.length - 1; i >= 0; i--){
          if (rh[i] && rh[i].label === label) streak++; else break;
        }
      }
    } catch(e){}
    return { streak, label };
  }

  function buildContext(){
    let rawRegime = '?', composite = null, regimeAgeMin = null, regimeColor = null;
    try {
      const r = JSON.parse(localStorage.getItem('md_risk_regime') || 'null');
      if (r){
        rawRegime = r.label || '?';
        composite = typeof r.composite === 'number' ? r.composite : null;
        regimeColor = r.color || null;
        if (r.ts) regimeAgeMin = Math.round((Date.now() - r.ts) / 60000);
      }
    } catch(e){}
    const dangerCtx = _dangerCtx();
    const et = _etNow();
    const sess = _sessionDetail(et);
    const macro = _macroEventsToday();
    const macroFreeze = _macroFreezeState(macro.list);
    const earn = _earningsToday();
    const sector = _sectorCtx();
    const market = _marketQuotes();
    const regStreak = _regimeStreak();
    const journal = _journalCtx();
    const governor = global.GV && GV.status ? GV.status() : null;
    let equityDdPct = null, equityDriftPct = null, snapshotAgeDays = null, equityDriftWarn = false;
    if (global.EQ && typeof EQ.hubSummary === 'function'){
      const eq = EQ.hubSummary();
      equityDdPct = eq.ddPct;
      equityDriftPct = eq.driftPct;
      snapshotAgeDays = eq.snapshotAgeDays;
      equityDriftWarn = eq.driftWarn;
    }
    let cdRiskPct = null, cdRLeft = null, cdGateHalt = false;
    if (global.CD && typeof CD.unified === 'function'){
      const b = CD.unified();
      cdRiskPct = b.portfolio.riskPct;
      cdRLeft = b.rBudget && b.rBudget.rLeft;
      const g = CD.canAddRisk((governor && governor.cfg) ? governor.cfg.accountSize * 0.01 : 100);
      cdGateHalt = g.halt;
    }
    const settings = load().settings;
    const flags = [];
    if (macroFreeze.active) flags.push({ text: 'FREEZE', cls: 'bear' });
    else if (macroFreeze.state === 'soon') flags.push({ text: 'CATALIST', cls: 'warn' });
    if (macro.macroHighToday) flags.push({ text: 'MACRO HIGH', cls: 'warn' });
    if (earn.wlToday > 0) flags.push({ text: 'EARNINGS WL', cls: 'warn' });
    if (governor && governor.verdict === 'HALTED') flags.push({ text: 'GOV HALTED', cls: 'bear' });
    else if (governor && governor.verdict === 'CAUTION') flags.push({ text: 'GOV CAUTION', cls: 'warn' });
    if (market.tone) flags.push({ text: market.tone.text.toUpperCase(), cls: market.tone.cls });
    const sources = _sourceHealth({
      regimeAgeMin,
      dangerAgeMin: dangerCtx.score != null ? 60 : null,
      sectorScanAgeH: sector.scanAgeH,
      marketAgeMin: market.ageMin,
      earnCacheAgeH: earn.cacheAgeH
    });
    return {
      day: et.day,
      regime: rawRegime,
      regimeNorm: normalizeRegime(rawRegime),
      regimeColor,
      composite,
      regimeAgeMin,
      regimeStreak: regStreak.streak,
      danger: dangerCtx.score,
      dangerDelta: dangerCtx.delta,
      dangerTrend: dangerCtx.trend,
      dangerBand: dangerCtx.band,
      dangerHistory: dangerCtx.history,
      session: et.state,
      sessionLabel: et.label,
      sessionDetail: sess,
      hourET: et.hour,
      minuteET: et.minute,
      weekend: et.weekend,
      weekday: et.weekday,
      macroHighToday: macro.macroHighToday,
      macroMedToday: macro.macroMedToday,
      macroEvents: macro.list,
      macroFreeze,
      earningsWlToday: earn.wlToday,
      earningsSymbols: earn.symbols,
      earningsCacheAgeH: earn.cacheAgeH,
      sectorRotation: sector.rotation,
      sectorRotationCls: sector.rotationCls,
      sectorSpread: sector.spread,
      sectorLeaders: sector.leaders,
      sectorLaggards: sector.laggards,
      sectorLeaderRows: sector.leaderRows,
      sectorLaggardRows: sector.laggardRows,
      sectorScanAgeH: sector.scanAgeH,
      market,
      spyChg: market.spy,
      qqqChg: market.qqq,
      vixChg: market.vix,
      spyPrice: market.spyPrice,
      qqqPrice: market.qqqPrice,
      vixPrice: market.vixPrice,
      marketTone: market.tone,
      vixLevel: market.vixLevel,
      journal,
      governor: governor ? governor.verdict : null,
      cdRiskPct,
      cdRLeft,
      cdGateHalt,
      governorDetail: governor ? {
        todayPnl: governor.todayPnl,
        todayTrades: governor.todayTrades,
        budgetUsedPct: governor.budgetUsedPct,
        budgetLeftUsd: governor.budgetLeftUsd,
        openCount: governor.openCount,
        consecutiveLosses: governor.consecutiveLosses,
        maxLossUsd: governor.maxLossUsd
      } : null,
      governorBudgetPct: governor ? governor.budgetUsedPct : null,
      tradesRemaining: governor ? governor.tradesRemaining : null,
      equityDdPct,
      equityDriftPct,
      snapshotAgeDays,
      equityDriftWarn,
      rollingDdPct: governor ? governor.rollingDdPct : null,
      sessionMultPreview: sessionMult(et.state, settings),
      dangerMultPreview: dangerSizeMult(dangerCtx.score),
      flags,
      sources,
      builtAt: Date.now()
    };
  }

  function load(){
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (o && Array.isArray(o.rules) && o.rules.length)
        return { rules: o.rules, settings: Object.assign({}, DEFAULT_SETTINGS, o.settings || {}), version: 2 };
    } catch(e){}
    try {
      const leg = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
      if (leg && Array.isArray(leg.rules) && leg.rules.length){
        const migrated = { rules: leg.rules, settings: DEFAULT_SETTINGS, version: 2 };
        savePlaybook(migrated);
        return migrated;
      }
    } catch(e){}
    return { rules: DEFAULT_RULES.slice(), settings: DEFAULT_SETTINGS, version: 2 };
  }

  function savePlaybook(o){
    o = o || load();
    try { localStorage.setItem(KEY, JSON.stringify({ rules: o.rules, settings: o.settings, updatedAt: Date.now(), version: 2 })); } catch(e){}
    return o;
  }

  function saveRules(rules){ const o = load(); o.rules = rules || DEFAULT_RULES; return savePlaybook(o); }
  function saveSettings(settings){ const o = load(); o.settings = Object.assign({}, o.settings, settings); return savePlaybook(o); }

  function matchRegime(wRegim, rawLabel){
    const norm = normalizeRegime(rawLabel);
    if (!wRegim || wRegim.includes('*')) return true;
    return wRegim.some(r => {
      const w = normalizeRegime(r);
      return w === norm || norm.indexOf(w) >= 0 || w.indexOf(norm) >= 0;
    });
  }

  function matchSectorRot(wRot, ctxRot){
    if (!wRot || wRot.includes('*')) return true;
    if (!ctxRot) return false;
    const u = String(ctxRot).toUpperCase();
    return wRot.some(r => u.indexOf(String(r).toUpperCase()) >= 0);
  }

  function matchRuleDetailed(rule, ctx, settings){
    const w = rule.when || {};
    const fails = [];
    if (!matchRegime(w.regim, ctx.regime)) fails.push('regim');
    if (w.dangerMin != null && (ctx.danger == null || ctx.danger < w.dangerMin)) fails.push('dangerMin');
    if (w.dangerMax != null && (ctx.danger == null || ctx.danger > w.dangerMax)) fails.push('dangerMax');
    if (w.compositeMin != null && (ctx.composite == null || ctx.composite < w.compositeMin)) fails.push('compositeMin');
    if (w.compositeMax != null && (ctx.composite == null || ctx.composite > w.compositeMax)) fails.push('compositeMax');
    if (w.session && !w.session.includes(ctx.session)) fails.push('session');
    if (w.sessionExclude && w.sessionExclude.includes(ctx.session)) fails.push('sessionExclude');
    if (w.macroHigh === true && !ctx.macroHighToday) fails.push('macroHigh');
    if (w.macroHigh === false && ctx.macroHighToday) fails.push('!macroHigh');
    if (w.earningsToday === 'watchlist' && !(ctx.earningsWlToday > 0)) fails.push('earningsWl');
    if (w.earningsToday === true && !(ctx.earningsWlToday > 0)) fails.push('earnings');
    if (w.earningsToday === false && ctx.earningsWlToday > 0) fails.push('!earnings');
    if (!matchSectorRot(w.sectorRot, ctx.sectorRotation)) fails.push('sectorRot');
    if (w.hourMin != null && ctx.hourET < w.hourMin) fails.push('hourMin');
    if (w.hourMax != null && ctx.hourET > w.hourMax) fails.push('hourMax');
    if (w.weekday && !w.weekday.map(x => String(x).toLowerCase().slice(0,3)).includes(String(ctx.weekday).toLowerCase().slice(0,3))) fails.push('weekday');
    if (w.spyChgMin != null && (ctx.spyChg == null || ctx.spyChg < w.spyChgMin)) fails.push('spyChgMin');
    if (w.spyChgMax != null && (ctx.spyChg == null || ctx.spyChg > w.spyChgMax)) fails.push('spyChgMax');
    if (w.governorMax){
      const order = { TRADE: 0, CAUTION: 1, HALTED: 2 };
      const g = order[ctx.governor] != null ? order[ctx.governor] : 2;
      const max = order[w.governorMax] != null ? order[w.governorMax] : 0;
      if (g > max) fails.push('governor');
    }
    if (w.equityDdMin != null && (ctx.equityDdPct == null || ctx.equityDdPct < w.equityDdMin)) fails.push('equityDdMin');
    if (w.equityDriftMin != null && (ctx.equityDriftPct == null || Math.abs(ctx.equityDriftPct) < w.equityDriftMin)) fails.push('equityDriftMin');
    if (w.snapshotStaleDays != null && (ctx.snapshotAgeDays == null || ctx.snapshotAgeDays < w.snapshotStaleDays)) fails.push('snapshotStaleDays');
    return { match: fails.length === 0, fails };
  }

  function dangerSizeMult(score){
    if (score == null) return 1;
    if (score >= 70) return 0.35;
    if (score >= 45) return 0.5;
    if (score >= 25) return 0.75;
    return 1;
  }

  function sessionMult(state, settings){
    const m = (settings && settings.sessionMult) || DEFAULT_SETTINGS.sessionMult;
    if (state === 'weekend' || state === 'closed') return m.weekend != null ? m.weekend : m.closed || 0;
    return m[state] != null ? m[state] : 1;
  }

  function computeGoScore(ctx){
    let s = 50;
    if (ctx.regimeNorm === 'risk-on') s += 18;
    else if (ctx.regimeNorm === 'risk-off') s -= 22;
    else if (ctx.regimeNorm === 'cautious') s -= 8;
    if (ctx.danger != null) s -= ctx.danger * 0.35;
    if (ctx.session === 'open') s += 12;
    else if (ctx.session === 'pre' || ctx.session === 'after') s += 2;
    else s -= 15;
    if (ctx.macroHighToday) s -= 25;
    else if (ctx.macroMedToday) s -= 8;
    if (ctx.earningsWlToday > 0) s -= 15;
    if (ctx.governor === 'HALTED') s -= 35;
    else if (ctx.governor === 'CAUTION') s -= 12;
    if (ctx.equityDdPct != null && ctx.equityDdPct >= 8) s -= Math.min(20, ctx.equityDdPct);
    if (ctx.equityDriftWarn) s -= 10;
    if (ctx.snapshotAgeDays != null && ctx.snapshotAgeDays > 14) s -= 8;
    if (ctx.sectorRotation && /ON|LEAN/i.test(ctx.sectorRotation)) s += 8;
    else if (ctx.sectorRotation && /OFF/i.test(ctx.sectorRotation)) s -= 8;
    if (ctx.spyChg != null) s += Math.max(-8, Math.min(8, ctx.spyChg * 2));
    return Math.max(0, Math.min(100, Math.round(s)));
  }

  function goLabel(score){
    if (score >= 65) return { text: 'GO', cls: 'go' };
    if (score >= 40) return { text: 'CAUTION', cls: 'caution' };
    return { text: 'NO-GO', cls: 'nogo' };
  }

  function dangerSparkSvg(vals, W, H){
    W = W || 120; H = H || 28;
    if (!vals || vals.length < 2) return '';
    const dx = W / (vals.length - 1);
    const pts = vals.map((v, i) => (i * dx).toFixed(1) + ',' + (H - (v / 100) * H).toFixed(1)).join(' ');
    const last = vals[vals.length - 1];
    const col = last >= 70 ? '#ff4d4d' : last >= 45 ? '#d4892c' : '#22d66b';
    return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="' + col + '" stroke-width="2"/></svg>';
  }

  function sessionTimeline(ctx){
    const sess = ctx.session;
    const sd = ctx.sessionDetail || {};
    const segments = [
      { id: 'pre', label: 'Pre', pct: 12.5 },
      { id: 'open', label: 'RTH', pct: 50 },
      { id: 'after', label: 'After', pct: 12.5 },
      { id: 'closed', label: 'Închis', pct: 25 }
    ];
    let marker = 0;
    if (sess === 'pre') marker = (sd.progress || 0) * 0.125;
    else if (sess === 'open') marker = 12.5 + (sd.progress || 0) * 0.5;
    else if (sess === 'after') marker = 62.5 + (sd.progress || 0) * 0.125;
    else if (sess === 'weekend') marker = 88;
    else marker = sess === 'closed' ? 75 : 50;
    return { segments, marker: Math.min(98, Math.max(2, marker)), active: sess, countdown: sd.countdown, untilLabel: sd.untilLabel };
  }

  function computeBlockers(ctx, strategy, guards){
    const out = [];
    if (ctx.macroFreeze && ctx.macroFreeze.active)
      out.push({ text: 'FREEZE ±15m', cls: 'bear', pri: 1 });
    if (ctx.governor === 'HALTED')
      out.push({ text: 'Governor HALTED', cls: 'bear', pri: 2 });
    else if (ctx.governor === 'CAUTION')
      out.push({ text: 'Governor CAUTION', cls: 'warn', pri: 3 });
    (guards || []).forEach(g => out.push({ text: g.replace(/^🛡\s*/, ''), cls: 'bear', pri: 4 }));
    if (ctx.earningsWlToday > 0 && !(guards || []).some(g => /earnings/i.test(g)))
      out.push({ text: 'Earnings: ' + (ctx.earningsSymbols || []).slice(0, 3).join(', '), cls: 'warn', pri: 5 });
    if (ctx.macroHighToday && !(guards || []).some(g => /macro/i.test(g)))
      out.push({ text: 'Macro HIGH azi', cls: 'warn', pri: 6 });
    if (strategy === 'STAY OUT' && ctx.danger != null && ctx.danger >= 55)
      out.push({ text: 'Danger ' + ctx.danger + '/100', cls: 'warn', pri: 7 });
    if (ctx.session === 'closed' || ctx.session === 'weekend')
      out.push({ text: 'Piață închisă', cls: 'warn', pri: 8 });
    if (ctx.equityDdPct != null && ctx.equityDdPct >= 8)
      out.push({ text: 'DD equity ' + ctx.equityDdPct.toFixed(1) + '%', cls: ctx.equityDdPct >= 10 ? 'bear' : 'warn', pri: 2 });
    if (ctx.equityDriftWarn)
      out.push({ text: 'Drift equity ' + (ctx.equityDriftPct >= 0 ? '+' : '') + (ctx.equityDriftPct != null ? ctx.equityDriftPct.toFixed(1) : '?') + '%', cls: 'warn', pri: 3 });
    if (ctx.snapshotAgeDays != null && ctx.snapshotAgeDays > 14)
      out.push({ text: 'Snapshot ' + ctx.snapshotAgeDays + 'z', cls: 'warn', pri: 6 });
    if (ctx.cdRiskPct != null && ctx.cdRiskPct >= 4)
      out.push({ text: 'Risc open ' + ctx.cdRiskPct.toFixed(1) + '%', cls: 'bear', pri: 2 });
    else if (ctx.cdRiskPct != null && ctx.cdRiskPct >= 2)
      out.push({ text: 'Risc open ' + ctx.cdRiskPct.toFixed(1) + '%', cls: 'warn', pri: 4 });
    if (ctx.cdGateHalt)
      out.push({ text: 'Capital gate STOP', cls: 'bear', pri: 1 });
    if (ctx.cdRLeft != null && ctx.cdRLeft < 0.5)
      out.push({ text: 'R rămas ' + ctx.cdRLeft.toFixed(1), cls: 'warn', pri: 5 });
    const seen = new Set();
    return out.filter(b => { if (seen.has(b.text)) return false; seen.add(b.text); return true; })
      .sort((a, b) => a.pri - b.pri).slice(0, 4);
  }

  function buildActions(p, ctx){
    const actions = [];
    if (p.strategy !== 'STAY OUT' && p.preset && p.preset !== 'none'){
      actions.push({ id: 'preset', label: '📊 ' + (p.presetLabel || p.preset), sub: p.chartHints || '', primary: true, copy: p.chartHints });
    } else if (p.strategy === 'STAY OUT'){
      actions.push({ id: 'review', label: '📋 Review plan', href: '../macro-dashboard/', ghost: true });
    }
    actions.push({ id: 'journal', label: '📓 Journal', href: '../journal/' });
    if (ctx.governor === 'HALTED' || ctx.governor === 'CAUTION')
      actions.push({ id: 'gov', label: '🛑 Risk Desk', href: '../journal/#desk', warn: true });
    if (ctx.cdGateHalt || (ctx.cdRiskPct != null && ctx.cdRiskPct >= 2))
      actions.push({ id: 'pf', label: '🛡️ Portfolio', href: '../journal/#portfolio', sub: ctx.cdRiskPct != null ? ctx.cdRiskPct.toFixed(1) + '% risc' : 'capital', warn: !!(ctx.cdGateHalt || (ctx.cdRiskPct != null && ctx.cdRiskPct >= 4)) });
    if (ctx.equityDriftWarn || (ctx.equityDdPct != null && ctx.equityDdPct >= 8))
      actions.push({ id: 'eq', label: '⚖ Capital', href: '../journal/#capital', warn: true });
    if ((ctx.sources || []).some(s => s.status === 'stale' || s.status === 'missing')){
      if ((ctx.sources || []).find(s => s.id === 'macro' && s.status !== 'fresh'))
        actions.push({ id: 'macro', label: '🌍 Macro', href: '../macro-dashboard/', stale: true });
      if ((ctx.sources || []).find(s => s.id === 'sector' && s.status !== 'fresh'))
        actions.push({ id: 'sector', label: '🔄 Sector', href: '../sector-rotation/', stale: true });
    }
    if (!(ctx.market && ctx.market.source))
      actions.push({ id: 'hub', label: '🏠 Hub quotes', href: '../', stale: true });
    return actions;
  }

  function evaluate(){
    const { rules, settings } = load();
    const ctx = buildContext();
    const audit = rules.map(r => {
      const d = matchRuleDetailed(r, ctx, settings);
      return { id: r.id, note: r.note, match: d.match, fails: d.fails, then: r.then };
    });
    let matched = null;
    for (const r of rules){
      if (matchRuleDetailed(r, ctx, settings).match){ matched = r; break; }
    }
    const rawMatched = matched ? Object.assign({}, matched) : null;
    const rawRuleOrder = rawMatched ? rules.findIndex(r => r.id === rawMatched.id) + 1 : null;

    // Global guards (settings) — pot suprascrie regula matched
    const guards = [];
    if (settings.macroFreezeHigh && ctx.macroHighToday){
      guards.push('Macro high-impact azi');
      matched = { id: '_guard_macro', when: {}, then: { strategy: 'STAY OUT', sizingMult: 0, maxTrades: 0, preset: 'none' }, note: 'Guard: macro freeze' };
    }
    if (settings.earningsGuard && ctx.earningsWlToday > 0){
      guards.push('Earnings WL: ' + ctx.earningsSymbols.join(', '));
      matched = { id: '_guard_earn', when: {}, then: { strategy: 'STAY OUT', sizingMult: 0, maxTrades: 0, preset: 'none' }, note: 'Guard: earnings watchlist' };
    }

    const then = matched ? matched.then : { strategy: 'Manual', sizingMult: 0.5, maxTrades: 2, preset: 'manual' };
    const dMult = dangerSizeMult(ctx.danger);
    const sMult = sessionMult(ctx.session, settings);
    const modifiers = [];
    if (dMult !== 1) modifiers.push({ k: 'danger', mult: dMult });
    if (sMult !== 1) modifiers.push({ k: 'session', mult: sMult });

    let sizingMult = (then.sizingMult || 0) * dMult * sMult;
    let maxTrades = then.maxTrades || 0;
    const reasons = [];
    if (matched) reasons.push(matched.note || matched.id);
    guards.forEach(g => reasons.push('🛡 ' + g));
    if (ctx.danger != null) reasons.push(`Danger ${ctx.danger}/100 → ×${dMult}`);
    if (sMult !== 1) reasons.push(`Sesiune ${ctx.sessionLabel} → ×${sMult}`);
    if (ctx.macroHighToday && !guards.length) reasons.push('⚠ Macro high azi (fără guard activ)');
    if (ctx.sectorLeaders.length) reasons.push(`Sectoare lider: ${ctx.sectorLeaders.join(', ')}`);

    const governor = global.GV && GV.status ? GV.status() : null;
    if (governor){
      if (governor.verdict === 'HALTED') reasons.push('Governor HALTED');
      maxTrades = Math.min(maxTrades, governor.tradesRemaining);
      if (governor.verdict === 'CAUTION') reasons.push('Governor CAUTION');
    }

    let strategy = then.strategy;
    if (governor && governor.verdict === 'HALTED') strategy = 'STAY OUT';
    if (global.CD && typeof CD.canAddRisk === 'function'){
      const estRisk = (governor && governor.cfg) ? governor.cfg.accountSize * 0.01 : 100;
      const gate = CD.canAddRisk(estRisk);
      if (gate.halt){
        strategy = 'STAY OUT';
        gate.reasons.forEach(r => reasons.push('🛑 ' + r));
      } else if (gate.caution){
        gate.reasons.forEach(r => reasons.push('⚠ ' + r));
      }
    }
    if (guards.length && (settings.macroFreezeHigh || settings.earningsGuard)) strategy = 'STAY OUT';
    if (ctx.session === 'closed' || ctx.session === 'weekend') {
      if (strategy !== 'STAY OUT') reasons.push('Piața închisă — plan pentru sesiunea următoare');
    }

    const goScore = computeGoScore(ctx);
    const go = goLabel(goScore);
    const preset = then.preset || 'manual';
    const presetInfo = PRESETS[preset] || { label: preset, hint: preset };

    let counterfactual = null;
    if (guards.length && rawMatched && rawMatched.then){
      const rt = rawMatched.then;
      counterfactual = {
        strategy: rt.strategy,
        ruleId: rawMatched.id,
        ruleOrder: rawRuleOrder,
        note: rawMatched.note,
        preset: rt.preset,
        sizingMult: rt.sizingMult
      };
    }

    const out = {
      strategy,
      sizingMult: Math.round(sizingMult * 100) / 100,
      maxTrades,
      tradesLeftToday: governor ? governor.tradesRemaining : maxTrades,
      preset,
      chartHints: presetInfo.hint,
      presetLabel: presetInfo.label,
      regime: ctx.regime,
      regimeNorm: ctx.regimeNorm,
      danger: ctx.danger,
      dangerMult: dMult,
      sessionMult: sMult,
      ruleId: matched ? matched.id : null,
      ruleOrder: matched ? (rules.findIndex(r => r.id === matched.id) + 1) : null,
      matchedNote: matched ? (matched.note || matched.id) : null,
      rawRuleId: rawMatched ? rawMatched.id : null,
      rawRuleOrder,
      counterfactual,
      blockers: computeBlockers(ctx, strategy, guards),
      actions: buildActions({ strategy, preset, presetLabel: presetInfo.label, chartHints: presetInfo.hint }, ctx),
      timeline: sessionTimeline(ctx),
      dangerSpark: dangerSparkSvg(ctx.dangerHistory),
      reasons,
      modifiers,
      governor: ctx.governor,
      goScore,
      goLabel: go.text,
      goCls: go.cls,
      context: ctx,
      audit,
      guards,
      evaluatedAt: Date.now()
    };
    try { localStorage.setItem('tt_router_state_v1', JSON.stringify(out)); } catch(e){}
    return out;
  }

  function rulesSummary(){ return load().rules.map((r, i) => ({ order: i + 1, id: r.id, when: r.when, then: r.then, note: r.note || '' })); }

  function addRule(rule){
    const o = load();
    rule.id = rule.id || ('r_' + Date.now().toString(36));
    o.rules.push(rule);
    savePlaybook(o);
    return rule;
  }

  function removeRule(id){
    const o = load();
    o.rules = o.rules.filter(r => r.id !== id);
    savePlaybook(o);
  }

  function moveRule(id, dir){
    const o = load();
    const i = o.rules.findIndex(r => r.id === id);
    if (i < 0) return;
    const j = i + (dir === 'up' ? -1 : 1);
    if (j < 0 || j >= o.rules.length) return;
    const tmp = o.rules[i];
    o.rules[i] = o.rules[j];
    o.rules[j] = tmp;
    savePlaybook(o);
  }

  global.RT = {
    load, savePlaybook, saveRules, saveSettings, evaluate, buildContext,
    rulesSummary, addRule, removeRule, moveRule, matchRuleDetailed,
    normalizeRegime, computeGoScore, computeBlockers, buildActions,
    sessionTimeline, dangerSparkSvg, PRESETS, DEFAULT_RULES, DEFAULT_SETTINGS, KEY
  };
})(typeof window !== 'undefined' ? window : globalThis);