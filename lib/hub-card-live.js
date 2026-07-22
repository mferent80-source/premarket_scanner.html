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
    let rotation = null, spread = null, leaders = [], ageH = null, regAgeH = null;
    try {
      const reg = JSON.parse(localStorage.getItem('tt_risk_regime') || 'null');
      if (reg){
        if (reg.regime) rotation = String(reg.regime);
        if (typeof reg.spread === 'number') spread = reg.spread;
        // vârsta regimului din propriul câmp `t` (sector-rotation îl scrie) —
        // înainte vârsta venea DOAR din sr_last_scan (altă cheie, poate lipsi)
        if (Number.isFinite(reg.t)) regAgeH = (Date.now() - reg.t) / 3600000;
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
    return { rotation, spread, leaders, ageH, regAgeH };
  }

  // vârstă lizibilă: minute sub 2h, ore peste („📦780m" era greu de citit)
  function fmtAgeMin(min){
    if (!Number.isFinite(min)) return '';
    return min > 120 ? Math.round(min / 60) + 'h' : Math.round(min) + 'm';
  }

  function macroBadge(st){
    const macro = st && st.macro;
    if (!macro || !macro.regime){
      return { main: 'Macro n/a', sub: 'deschide Command Center', lvl: 'warn' };
    }
    // strip primul TOKEN (emoji intreg) — /^./ taia un singur code unit din
    // perechea surrogate (🟢/🔴/🟡) si cardul afisa "� RISK-ON"; strip doar
    // daca label-ul are 2+ tokenuri (vine din localStorage, format extern)
    const rawLbl = String(macro.regime.label || '—');
    const label = /\s/.test(rawLbl) ? rawLbl.replace(/^[^\s]+\s*/, '') : rawLbl;
    const parts = [];
    if (macro.danger && macro.danger.score != null) parts.push('Danger ' + macro.danger.score);
    const z = H() && H().regimeStreak ? H().regimeStreak(macro.regime.label) : 0;
    if (z > 1) parts.push(z + 'z');
    if (macro.source === 'fallback') parts.push('cache' + (macro.ageMin != null ? ' 📦' + fmtAgeMin(macro.ageMin) : ''));
    else if (macro.stale && macro.ageMin != null) parts.push('📦' + fmtAgeMin(macro.ageMin));
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
    // vârsta rotației: preferă t-ul propriu al regimului, apoi sr_last_scan
    const rotAgeH = s.regAgeH != null ? s.regAgeH : s.ageH;
    if (rotAgeH != null && rotAgeH > 12) parts.push('📦' + Math.round(rotAgeH) + 'h');
    const rl = String(s.rotation || '');
    let lvl = /risk-on|cyclical|growth/i.test(rl) ? 'ok' : /risk-off|defensive/i.test(rl) ? 'bear' : 'neut';
    // regim scanat acum >12h (sau fără vârstă deloc) NU se colorează ca live —
    // „Rotație RISK-ON" verde de săptămâna trecută e semnal fals
    if (s.rotation && (rotAgeH == null || rotAgeH > 12)) lvl = 'neut';
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

  let inited = false;
  function init(){
    if (inited) return; // dublu init = listener + interval duplicate
    inited = true;
    render();
    window.addEventListener('hub:market', render);
    setInterval(render, 60000);
  }

  global.HCL = { init, render, sectorCtx, macroBadge, routerBadge, sectorBadge };
})(typeof window !== 'undefined' ? window : global);