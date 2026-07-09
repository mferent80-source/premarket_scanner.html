// ═══════════════════════════════════════════════════════════════════
// router.js — Regime Router: playbook IF/THEN → strategie permisă azi (RT.*)
// Schema tt_router_playbook_v1: { rules: [{ id, when, then, note }], overrides }
// Folosire: RT.evaluate(); RT.rules(); RT.saveRules([...]);
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';
  const KEY = 'tt_router_playbook_v1';

  const DEFAULT_RULES = [
    { id: 'r1', when: { regim: ['risk-off', 'Risk-Off', 'RISK-OFF'], dangerMin: 55 }, then: { strategy: 'STAY OUT', sizingMult: 0, maxTrades: 0, preset: 'none' }, note: 'Regim defensiv + danger ridicat' },
    { id: 'r2', when: { regim: ['risk-on', 'Risk-On', 'RISK-ON'], dangerMax: 35 }, then: { strategy: 'ZLHMA Scalping', sizingMult: 1, maxTrades: 5, preset: 'zlhma-scalp' }, note: 'Risk-on curat — scalping permis' },
    { id: 'r3', when: { regim: ['neutral', 'Neutral', 'NEUTRAL'], dangerMax: 50 }, then: { strategy: 'ZLEMA Swing', sizingMult: 0.75, maxTrades: 3, preset: 'zlema-swing' }, note: 'Neutral — swing cu sizing redus' },
    { id: 'r4', when: { regim: ['*'], dangerMin: 45, dangerMax: 70 }, then: { strategy: 'AMD Phase only', sizingMult: 0.5, maxTrades: 2, preset: 'amd-phase' }, note: 'Danger mediu — doar cicluri AMD, jumătate sizing' },
    { id: 'r5', when: { regim: ['*'] }, then: { strategy: 'ZLEMA Swing', sizingMult: 0.5, maxTrades: 2, preset: 'zlema-swing' }, note: 'Fallback conservator' }
  ];

  function load(){
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (o && Array.isArray(o.rules) && o.rules.length) return o;
    } catch(e){}
    return { rules: DEFAULT_RULES.slice(), updatedAt: Date.now() };
  }
  function saveRules(rules){
    const o = { rules: rules || DEFAULT_RULES, updatedAt: Date.now() };
    try { localStorage.setItem(KEY, JSON.stringify(o)); return o; } catch(e){ return o; }
  }

  function regimeNow(){
    try {
      const r = JSON.parse(localStorage.getItem('md_risk_regime') || 'null');
      return (r && r.label) ? String(r.label).trim() : '?';
    } catch(e){ return '?'; }
  }

  function dangerNow(){
    try {
      const h = JSON.parse(localStorage.getItem('md_danger_daily') || '[]');
      if (Array.isArray(h) && h.length && typeof h[h.length - 1].score === 'number')
        return h[h.length - 1].score;
    } catch(e){}
    return null;
  }

  function matchRule(rule, ctx){
    const w = rule.when || {};
    const reg = ctx.regime || '?';
    if (w.regim && !w.regim.includes('*')){
      const ok = w.regim.some(r => String(r).toLowerCase() === String(reg).toLowerCase());
      if (!ok) return false;
    }
    if (w.dangerMin != null && (ctx.danger == null || ctx.danger < w.dangerMin)) return false;
    if (w.dangerMax != null && (ctx.danger == null || ctx.danger > w.dangerMax)) return false;
    return true;
  }

  function evaluate(){
    const ctx = { regime: regimeNow(), danger: dangerNow(), day: _etDay() };
    const { rules } = load();
    let matched = null;
    for (const rule of rules){
      if (matchRule(rule, ctx)){ matched = rule; break; }
    }
    const then = matched ? matched.then : { strategy: 'Manual', sizingMult: 0.5, maxTrades: 2, preset: 'manual' };
    const governor = global.GV && GV.status ? GV.status() : null;
    const reasons = [];
    if (matched) reasons.push(matched.note || matched.id);
    if (governor && governor.verdict === 'HALTED'){
      reasons.push('Governor HALTED — override la STAY OUT');
    }
    const strategy = (governor && governor.verdict === 'HALTED') ? 'STAY OUT' : then.strategy;
    const out = {
      strategy,
      sizingMult: then.sizingMult,
      maxTrades: then.maxTrades,
      preset: then.preset,
      regime: ctx.regime,
      danger: ctx.danger,
      ruleId: matched ? matched.id : null,
      reasons,
      governor: governor ? governor.verdict : null,
      chartHints: _chartLinks(then.preset),
      evaluatedAt: Date.now()
    };
    try { localStorage.setItem('tt_router_state_v1', JSON.stringify(out)); } catch(e){}
    return out;
  }

  function _chartLinks(preset){
    const m = {
      'zlhma-scalp': 'ZLHMA TOP — preset Scalping',
      'zlema-swing': 'ZLEMA — preset Swing',
      'amd-phase': 'AMD Phase Detector',
      'none': '—'
    };
    return m[preset] || preset;
  }

  function _etDay(){
    try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(new Date()); }
    catch(e){ return new Date().toISOString().slice(0,10); }
  }

  global.RT = { load, saveRules, evaluate, regimeNow, dangerNow, DEFAULT_RULES, KEY };
})(typeof window !== 'undefined' ? window : globalThis);