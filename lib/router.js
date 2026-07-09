// ═══════════════════════════════════════════════════════════════════
// router.js v3 — Regime Router avansat: context multi-sursă + GO score (RT.*)
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
    { id: 'r-fallback', when: { regim: ['*'] }, then: { strategy: 'ZLEMA Swing', sizingMult: 0.5, maxTrades: 2, preset: 'zlema-swing' }, note: 'Fallback conservator' }
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

  function _earningsToday(){
    const today = _etDay();
    let wlToday = 0, anyToday = 0, symbols = [];
    try {
      const c = JSON.parse(localStorage.getItem('pb_wl_events_cache_v1') || 'null');
      if (c && Array.isArray(c.events)){
        const earn = c.events.filter(e => e.type === 'earnings' && e.date === today);
        wlToday = earn.length;
        symbols = earn.map(e => e.symbol);
      }
    } catch(e){}
    return { wlToday, anyToday: wlToday, symbols };
  }

  function _sectorCtx(){
    let rotation = null, leaders = [], laggards = [], ageH = null;
    try {
      const reg = JSON.parse(localStorage.getItem('tt_risk_regime') || 'null');
      if (reg && reg.regime) rotation = String(reg.regime);
    } catch(e){}
    try {
      const scan = JSON.parse(localStorage.getItem('sr_last_scan') || 'null');
      if (scan && Array.isArray(scan.data)){
        const rows = scan.data.filter(d => typeof d.rsRatio === 'number').sort((a, b) => (b.rsRatio||0)-(a.rsRatio||0));
        leaders = rows.slice(0, 3).map(d => d.sym || d.name);
        laggards = rows.slice(-2).map(d => d.sym || d.name);
        ageH = scan.ts ? (Date.now() - scan.ts) / 3600000 : null;
      }
    } catch(e){}
    return { rotation, leaders, laggards, scanAgeH: ageH };
  }

  function _marketQuotes(){
    const q = { spy: null, qqq: null, vix: null };
    try {
      const m = global.__hubMkt;
      if (m && m.quotes){
        ['SPY','QQQ','VIX'].forEach(k => {
          const key = k === 'VIX' ? 'VIX' : k;
          const row = m.quotes[key] || m.quotes[k];
          if (row && typeof row.chgPct === 'number'){
            const lk = k.toLowerCase();
            q[lk] = row.chgPct;
          }
        });
      }
    } catch(e){}
    return q;
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
    let rawRegime = '?', composite = null, regimeAgeMin = null;
    try {
      const r = JSON.parse(localStorage.getItem('md_risk_regime') || 'null');
      if (r){
        rawRegime = r.label || '?';
        composite = typeof r.composite === 'number' ? r.composite : null;
        if (r.ts) regimeAgeMin = Math.round((Date.now() - r.ts) / 60000);
      }
    } catch(e){}
    let danger = null;
    try {
      const h = JSON.parse(localStorage.getItem('md_danger_daily') || '[]');
      if (Array.isArray(h) && h.length && typeof h[h.length - 1].score === 'number')
        danger = h[h.length - 1].score;
    } catch(e){}
    const et = _etNow();
    const macro = _macroEventsToday();
    const earn = _earningsToday();
    const sector = _sectorCtx();
    const quotes = _marketQuotes();
    const regStreak = _regimeStreak();
    const governor = global.GV && GV.status ? GV.status() : null;
    return {
      day: et.day,
      regime: rawRegime,
      regimeNorm: normalizeRegime(rawRegime),
      composite,
      regimeAgeMin,
      regimeStreak: regStreak.streak,
      danger,
      session: et.state,
      sessionLabel: et.label,
      hourET: et.hour,
      weekend: et.weekend,
      weekday: et.weekday,
      macroHighToday: macro.macroHighToday,
      macroMedToday: macro.macroMedToday,
      macroEvents: macro.list,
      earningsWlToday: earn.wlToday,
      earningsSymbols: earn.symbols,
      sectorRotation: sector.rotation,
      sectorLeaders: sector.leaders,
      sectorLaggards: sector.laggards,
      sectorScanAgeH: sector.scanAgeH,
      spyChg: quotes.spy,
      qqqChg: quotes.qqq,
      vixChg: quotes.vix,
      governor: governor ? governor.verdict : null,
      governorBudgetPct: governor ? governor.budgetUsedPct : null,
      tradesRemaining: governor ? governor.tradesRemaining : null
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

    // Global guards (settings) — pot suprascrie regula matched
    const guards = [];
    if (settings.macroFreezeHigh && ctx.macroHighToday){
      guards.push('Macro high-impact azi');
      matched = { id: '_guard_macro', when: {}, then: { strategy: 'STAY OUT', sizingMult: 0, maxTrades: 0, preset: 'none' }, note: 'Guard: macro freeze' };
    }
    if (settings.earningsGuard && ctx.earningsWlToday > 0){
      guards.push(`Earnings WL: ${ctx.earningsSymbols.join(', ')}`);
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
    if (guards.length && (settings.macroFreezeHigh || settings.earningsGuard)) strategy = 'STAY OUT';
    if (ctx.session === 'closed' || ctx.session === 'weekend') {
      if (strategy !== 'STAY OUT') reasons.push('Piața închisă — plan pentru sesiunea următoare');
    }

    const goScore = computeGoScore(ctx);
    const go = goLabel(goScore);
    const preset = then.preset || 'manual';
    const presetInfo = PRESETS[preset] || { label: preset, hint: preset };

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
    normalizeRegime, computeGoScore, PRESETS, DEFAULT_RULES, DEFAULT_SETTINGS, KEY
  };
})(typeof window !== 'undefined' ? window : globalThis);