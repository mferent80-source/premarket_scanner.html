// ═══════════════════════════════════════════════════════════════════
// router.js — Regime Router: playbook IF/THEN → strategie permisă azi (RT.*)
// Schema tt_router_playbook_v1: { rules: [{ id, when, then, note }], overrides }
// Folosire: RT.evaluate(); RT.rules(); RT.saveRules([...]);
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';
  const KEY = 'tt_router_playbook_v1';

  const DEFAULT_RULES = [
    { id: 'r1', when: { regim: ['risk-off', 'stress'], dangerMin: 50 }, then: { strategy: 'STAY OUT', sizingMult: 0, maxTrades: 0, preset: 'none' }, note: 'Risk-off / stress + danger ridicat' },
    { id: 'r2', when: { regim: ['risk-on'], dangerMax: 35 }, then: { strategy: 'ZLHMA Scalping', sizingMult: 1, maxTrades: 5, preset: 'zlhma-scalp' }, note: 'Risk-on curat — scalping permis' },
    { id: 'r3', when: { regim: ['neutral', 'cautious'], dangerMax: 50 }, then: { strategy: 'ZLEMA Swing', sizingMult: 0.75, maxTrades: 3, preset: 'zlema-swing' }, note: 'Neutral/cautious — swing cu sizing redus' },
    { id: 'r4', when: { regim: ['*'], dangerMin: 45, dangerMax: 70 }, then: { strategy: 'AMD Phase only', sizingMult: 0.5, maxTrades: 2, preset: 'amd-phase' }, note: 'Danger mediu — doar cicluri AMD' },
    { id: 'r5', when: { regim: ['*'] }, then: { strategy: 'ZLEMA Swing', sizingMult: 0.5, maxTrades: 2, preset: 'zlema-swing' }, note: 'Fallback conservator' }
  ];

  function normalizeRegime(label){
    const u = String(label || '').toUpperCase();
    if (/RISK[\s-]*OFF|STRESS/.test(u)) return 'risk-off';
    if (/RISK[\s-]*ON|LEAN/.test(u)) return 'risk-on';
    if (/CAUTIOUS/.test(u)) return 'cautious';
    if (/NEUTRAL/.test(u)) return 'neutral';
    return String(label || '?').toLowerCase().replace(/[^a-z-]/g, '') || '?';
  }

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

  function dangerSizeMult(score){
    if (score == null) return 1;
    if (score >= 70) return 0.35;
    if (score >= 45) return 0.5;
    if (score >= 25) return 0.75;
    return 1;
  }

  function matchRegime(wRegim, rawLabel){
    const norm = normalizeRegime(rawLabel);
    if (!wRegim || wRegim.includes('*')) return true;
    return wRegim.some(r => {
      const w = normalizeRegime(r);
      return w === norm || norm.indexOf(w) >= 0 || w.indexOf(norm) >= 0;
    });
  }

  function matchRule(rule, ctx){
    const w = rule.when || {};
    if (!matchRegime(w.regim, ctx.regime)) return false;
    if (w.dangerMin != null && (ctx.danger == null || ctx.danger < w.dangerMin)) return false;
    if (w.dangerMax != null && (ctx.danger == null || ctx.danger > w.dangerMax)) return false;
    return true;
  }

  function evaluate(){
    const rawRegime = regimeNow();
    const ctx = { regime: rawRegime, regimeNorm: normalizeRegime(rawRegime), danger: dangerNow(), day: _etDay() };
    const { rules } = load();
    let matched = null;
    for (const rule of rules){
      if (matchRule(rule, ctx)){ matched = rule; break; }
    }
    const then = matched ? matched.then : { strategy: 'Manual', sizingMult: 0.5, maxTrades: 2, preset: 'manual' };
    const governor = global.GV && GV.status ? GV.status() : null;
    const dMult = dangerSizeMult(ctx.danger);
    let sizingMult = (then.sizingMult || 0) * dMult;
    let maxTrades = then.maxTrades || 0;
    const reasons = [];
    if (matched) reasons.push(matched.note || matched.id);
    if (ctx.danger != null) reasons.push(`Danger ${ctx.danger}/100 → sizing ×${dMult}`);

    if (governor){
      if (governor.verdict === 'HALTED') reasons.push('Governor HALTED — override la STAY OUT');
      maxTrades = Math.min(maxTrades, governor.tradesRemaining);
      if (governor.verdict === 'CAUTION') reasons.push('Governor CAUTION — verifică bugetul');
    }

    const strategy = (governor && governor.verdict === 'HALTED') ? 'STAY OUT' : then.strategy;
    if (governor && maxTrades === 0 && strategy !== 'STAY OUT'){
      reasons.push('0 trade-uri rămase azi (Governor)');
    }

    const out = {
      strategy,
      sizingMult: Math.round(sizingMult * 100) / 100,
      maxTrades,
      tradesLeftToday: governor ? governor.tradesRemaining : maxTrades,
      preset: then.preset,
      regime: rawRegime,
      regimeNorm: ctx.regimeNorm,
      danger: ctx.danger,
      dangerMult: dMult,
      ruleId: matched ? matched.id : null,
      reasons,
      governor: governor ? governor.verdict : null,
      chartHints: _chartLinks(then.preset),
      evaluatedAt: Date.now()
    };
    try { localStorage.setItem('tt_router_state_v1', JSON.stringify(out)); } catch(e){}
    return out;
  }

  function rulesSummary(){
    return load().rules.map((r, i) => ({
      order: i + 1,
      id: r.id,
      when: r.when,
      then: r.then,
      note: r.note || ''
    }));
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

  global.RT = {
    load, saveRules, evaluate, regimeNow, dangerNow, normalizeRegime,
    rulesSummary, DEFAULT_RULES, KEY
  };
})(typeof window !== 'undefined' ? window : globalThis);