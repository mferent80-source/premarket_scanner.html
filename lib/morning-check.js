// morning-check.js — Morning checklist Pro (I-086) MC.*
(function(global){
  'use strict';
  const KEY = 'tt_morning_check_v1';

  function _day(){
    try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(new Date()); }
    catch(e){ return new Date().toISOString().slice(0,10); }
  }

  function items(){
    const ctx = global.RT && RT.buildContext ? RT.buildContext() : {};
    const gov = global.GV && GV.status ? GV.status() : null;
    const dr = global.EQ && EQ.drift ? EQ.drift() : {};
    const cd = global.CD && CD.unified ? CD.unified() : null;
    const list = [
      { id: 'regime', label: 'Regim macro proaspăt', auto: (ctx.regimeAgeMin != null && ctx.regimeAgeMin < 360), sub: ctx.regimeAgeMin != null ? ctx.regimeAgeMin + 'm' : 'lipsește' },
      { id: 'danger', label: 'Danger score', auto: ctx.danger != null, sub: ctx.danger != null ? ctx.danger + '/100' : '—' },
      { id: 'governor', label: 'Governor TRADE', auto: gov && gov.verdict === 'TRADE', sub: gov ? gov.verdict : '—' },
      { id: 'equity', label: 'Equity reconciliat', auto: dr.snapshot && !dr.warn, sub: dr.warn ? 'drift ' + (dr.driftPct != null ? dr.driftPct.toFixed(1) + '%' : '?') : (dr.snapshot ? 'OK' : 'fără snapshot') },
      { id: 'snapshot', label: 'Snapshot <14 zile', auto: dr.snapshotAgeDays != null && dr.snapshotAgeDays <= 14, sub: dr.snapshotAgeDays != null ? dr.snapshotAgeDays + 'z' : '—' },
      { id: 'earnings', label: 'Earnings WL verificat', auto: false, manual: true, sub: (ctx.earningsWlToday || 0) + ' azi' },
      { id: 'health', label: 'Health verde', auto: true, sub: 'proxy/chei' },
      { id: 'risk', label: 'Risc agregat <2%', auto: cd && cd.portfolio.riskPct != null && cd.portfolio.riskPct < 2, sub: cd && cd.portfolio.riskPct != null ? cd.portfolio.riskPct.toFixed(1) + '% @SL' : '—' },
      { id: 'riskhalt', label: 'Risc sub prag 4%', auto: cd && cd.portfolio.riskPct != null && cd.portfolio.riskPct < 4, sub: cd && cd.portfolio.riskPct != null && cd.portfolio.riskPct >= 4 ? 'HALT ' + cd.portfolio.riskPct.toFixed(1) + '%' : (cd && cd.portfolio.riskPct != null ? cd.portfolio.riskPct.toFixed(1) + '%' : '—') },
      { id: 'weekcap', label: 'Buget săptămână OK', auto: gov && gov.weekBudgetUsedPct != null && gov.weekBudgetUsedPct < 75, sub: gov && gov.weekBudgetUsedPct != null ? gov.weekBudgetUsedPct.toFixed(0) + '% consumat' : '—' },
      { id: 'liverisk', label: 'Risc live proaspăt', auto: cd && cd.portfolio.live && !cd.portfolio.liveStale, sub: cd && cd.portfolio.count > 0 ? (cd.portfolio.liveStale ? 'stale' : 'scan <30m') : 'fără open' }
    ];
    let manual = {};
    try { manual = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch(e){}
    if (manual.day !== _day()) manual = { day: _day() };
    list.forEach(it => {
      if (it.manual) it.done = !!manual[it.id];
      else it.done = !!it.auto;
    });
    const done = list.filter(x => x.done).length;
    return { list, done, total: list.length, pct: list.length ? Math.round(done / list.length * 100) : 0, day: _day() };
  }

  function toggleManual(id){
    let manual = {};
    try { manual = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch(e){}
    manual.day = _day();
    manual[id] = !manual[id];
    try { localStorage.setItem(KEY, JSON.stringify(manual)); } catch(e){}
    return items();
  }

  function criticalOk(){
    const s = items();
    const crit = ['regime', 'governor', 'equity', 'risk', 'riskhalt'];
    return crit.every(id => { const it = s.list.find(x => x.id === id); return it && it.done; });
  }

  global.MC = { items, toggleManual, criticalOk, KEY };
})(typeof window !== 'undefined' ? window : globalThis);