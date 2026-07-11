// hub-health.js — health pill în tableau (HUB_HEALTH.*)
(function(global){
  'use strict';

  let lastCls = 'ok';
  let lastTitle = '';

  function runChecks(){
    let issues = 0;
    const notes = [];
    try {
      if (!('serviceWorker' in navigator)) { issues++; notes.push('fără SW'); }
      else if (!navigator.serviceWorker.controller) { issues++; notes.push('SW neactiv'); }
    } catch (e) { issues++; }
    try {
      const live = global.SUITE_VERSION_SHORT || '';
      const cached = localStorage.getItem('tt_sw_version') || '';
      if (cached && live && cached !== live) { issues++; notes.push('cache vechi'); }
    } catch (e) {}
    try {
      const fk = (global.FH_KEY && FH_KEY.get) ? FH_KEY.get() : (localStorage.getItem('finnhub_api_key') || localStorage.getItem('fh_key') || '');
      if (!fk) { issues++; notes.push('fără Finnhub'); }
    } catch (e) {}
    if (global.HS && HS.staleAudit){
      const sa = HS.staleAudit();
      if (sa.worst === 'err'){ issues += Math.min(2, sa.count); notes.push(sa.items.map(i => i.label).join('; ')); }
      else if (sa.worst === 'warn' && sa.count){ issues++; notes.push(sa.items.slice(0, 2).map(i => i.label).join('; ')); }
      HS.renderStaleNav();
    }
    try {
      const hp = global.CD && CD.healthProbe ? CD.healthProbe() : null;
      if (hp && hp.cls !== 'ok'){
        issues++;
        notes.push(hp.issues && hp.issues[0] ? hp.issues[0] : 'capital ' + hp.cls);
      }
    } catch (e) {}
    const cls = issues >= 2 ? 'bad' : issues === 1 ? 'warn' : 'ok';
    const title = notes.length ? notes.join(' · ') : 'Infrastructură OK — click pentru Health';
    return { cls, title };
  }

  function pillHtml(){
    const c = lastCls;
    const label = c === 'ok' ? 'Health OK' : c === 'warn' ? 'Health !' : 'Health ?';
    return '<a href="./health/" class="ht-pill ht-health ' + c + '" id="htHealthPill" title="' +
      String(lastTitle).replace(/"/g, '&quot;') + '">' + label + '</a>';
  }

  function syncCheck(){
    const r = runChecks();
    lastCls = r.cls;
    lastTitle = r.title;
    const el = document.getElementById('htHealthPill');
    if (el){
      el.className = 'ht-pill ht-health ' + r.cls;
      el.textContent = r.cls === 'ok' ? 'Health OK' : r.cls === 'warn' ? 'Health !' : 'Health ?';
      el.title = r.title;
    }
    const pills = document.getElementById('htPills');
    if (pills && !el){
      const hp = pills.querySelector('.ht-health');
      if (hp){
        hp.className = 'ht-pill ht-health ' + r.cls;
        hp.textContent = r.cls === 'ok' ? 'Health OK' : r.cls === 'warn' ? 'Health !' : 'Health ?';
        hp.title = r.title;
      }
    }
  }

  function init(){
    syncCheck();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg && reg.active) {
          try { localStorage.setItem('tt_sw_version', global.SUITE_VERSION_SHORT || ''); } catch (e) {}
        }
        syncCheck();
      }).catch(() => {});
    }
  }

  global.HUB_HEALTH = { init, syncCheck, pillHtml, runChecks };
})(typeof window !== 'undefined' ? window : global);