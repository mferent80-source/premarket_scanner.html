// hub-card-live.js — badge-uri live pe cardurile Plan (Macro / Router / Sector)
(function(global){
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const H = () => global.HS;

  const SLOTS = [
    { id: 'hubLiveRouter', kind: 'router' },
    { id: 'hubLiveMacro', kind: 'macro' },
    { id: 'hubLiveSector', kind: 'sector' }
  ];

  function sectorCtx(){
    let rotation = null, spread = null, leaders = [], ageH = null;
    try {
      const reg = JSON.parse(localStorage.getItem('tt_risk_regime') || 'null');
      if (reg){
        if (reg.regime) rotation = String(reg.regime);
        if (typeof reg.spread === 'number') spread = reg.spread;
      }
    } catch (e) {}
    try {
      const scan = JSON.parse(localStorage.getItem('sr_last_scan') || 'null');
      if (scan && Array.isArray(scan.data)){
        const rows = scan.data.filter(d => typeof d.rsRatio === 'number').sort((a, b) => (b.rsRatio || 0) - (a.rsRatio || 0));
        leaders = rows.slice(0, 2).map(d => d.sym || d.name || '?');
        if (scan.ts) ageH = (Date.now() - scan.ts) / 3600000;
      }
    } catch (e) {}
    return { rotation, spread, leaders, ageH };
  }

  function macroBadge(st){
    const macro = st && st.macro;
    if (!macro || !macro.regime){
      return { main: 'Macro n/a', sub: 'deschide Command Center', lvl: 'warn' };
    }
    const label = String(macro.regime.label || '—').replace(/^.\s*/, '');
    const parts = [];
    if (macro.danger && macro.danger.score != null) parts.push('Danger ' + macro.danger.score);
    const z = H() && H().regimeStreak ? H().regimeStreak(macro.regime.label) : 0;
    if (z > 1) parts.push(z + 'z');
    if (macro.source === 'fallback') parts.push('cache');
    else if (macro.stale && macro.ageMin != null) parts.push('📦' + macro.ageMin + 'm');
    const lvl = H() ? H().macroLvl(macro.regime.label) : 'neut';
    return { main: label, sub: parts.join(' · '), lvl };
  }

  function routerBadge(st){
    const p = st && st.rtPayload;
    if (!p){
      return { main: 'Router n/a', sub: 'deschide pentru verdict', lvl: 'neut' };
    }
    const main = p.strategy || '—';
    const parts = ['GO ' + (p.goScore != null ? p.goScore : '—')];
    if (p.goLabel) parts.push(p.goLabel);
    if (p.sizingMult != null) parts.push('×' + p.sizingMult);
    const c = p.context || {};
    if (c.macroFreeze && c.macroFreeze.active) parts.unshift('🚫 freeze');
    else if (c.macroFreeze && c.macroFreeze.state === 'soon') parts.unshift('⏳ catalyst');
    const lvl = p.goCls === 'go' ? 'ok' : p.goCls === 'nogo' ? 'bear' : 'warn';
    if (main === 'STAY OUT') return { main, sub: parts.join(' · '), lvl: 'bear' };
    if (st.verdictRaw === 'HALTED') return { main, sub: parts.join(' · '), lvl: 'bear' };
    return { main, sub: parts.join(' · '), lvl };
  }

  function sectorBadge(){
    const s = sectorCtx();
    if (!s.rotation && !s.leaders.length){
      return { main: 'Sector n/a', sub: 'rulează scan în Sector Rotation', lvl: 'neut' };
    }
    const main = s.rotation ? 'Rotație ' + s.rotation : 'Sector scan';
    const parts = [];
    if (s.leaders.length) parts.push('lead ' + s.leaders.join(' · '));
    if (typeof s.spread === 'number') parts.push('cyc−def ' + (s.spread >= 0 ? '+' : '') + s.spread.toFixed(1) + '%');
    if (s.ageH != null && s.ageH > 12) parts.push('📦' + Math.round(s.ageH) + 'h');
    const rl = String(s.rotation || '');
    const lvl = /risk-on|cyclical|growth/i.test(rl) ? 'ok' : /risk-off|defensive/i.test(rl) ? 'bear' : 'neut';
    return { main, sub: parts.join(' · '), lvl };
  }

  function badgeFor(kind, st){
    if (kind === 'macro') return macroBadge(st);
    if (kind === 'router') return routerBadge(st);
    return sectorBadge();
  }

  function paintSlot(slot, badge){
    if (!slot) return;
    slot.className = 'hub-card-live lvl-' + (badge.lvl || 'neut');
    slot.innerHTML =
      '<span class="hcl-main">' + esc(badge.main) + '</span>' +
      (badge.sub ? '<span class="hcl-sub">' + esc(badge.sub) + '</span>' : '');
    slot.title = badge.main + (badge.sub ? ' — ' + badge.sub : '');
  }

  function render(){
    if (!H() || !H().hubState) return;
    const st = H().hubState();
    SLOTS.forEach(({ id, kind }) => paintSlot($(id), badgeFor(kind, st)));
  }

  function init(){
    render();
    window.addEventListener('hub:market', render);
    setInterval(render, 60000);
  }

  global.HCL = { init, render, sectorCtx, macroBadge, routerBadge, sectorBadge };
})(typeof window !== 'undefined' ? window : global);