// hub-health.js — pill rapid în hub (fără fetch la load; ping la click)
(function(global){
  'use strict';
  const $ = id => document.getElementById(id);

  function dot(cls, title){
    const el = $('hubHealthPill');
    if (!el) return;
    el.className = 'hub-health-pill '+cls;
    el.title = title || '';
    el.textContent = cls === 'ok' ? '🩺 OK' : cls === 'warn' ? '🩺 !' : '🩺 ?';
  }

  function syncCheck(){
    let issues = 0;
    const notes = [];
    try {
      if (!('serviceWorker' in navigator)) { issues++; notes.push('fără SW'); }
      else if (!navigator.serviceWorker.controller) { issues++; notes.push('SW neactiv'); }
    } catch(e){ issues++; }
    try {
      const live = global.SUITE_VERSION_SHORT || '';
      const cached = localStorage.getItem('tt_sw_version') || '';
      if (cached && live && cached !== live) { issues++; notes.push('cache vechi'); }
    } catch(e){}
    try {
      const fk = (global.FH_KEY && FH_KEY.get) ? FH_KEY.get() : (localStorage.getItem('finnhub_api_key') || localStorage.getItem('fh_key') || '');
      if (!fk) { issues++; notes.push('fără Finnhub'); }
    } catch(e){}
    if (issues >= 2) dot('err', notes.join(' · '));
    else if (issues === 1) dot('warn', notes.join(' · '));
    else dot('ok', 'Infrastructură OK — click pentru Health');
  }

  function init(){
    const el = $('hubHealthPill');
    if (!el) return;
    syncCheck();
    el.addEventListener('click', () => { location.href = './health/'; });
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg && reg.active) {
          try { localStorage.setItem('tt_sw_version', global.SUITE_VERSION_SHORT || ''); } catch(e){}
        }
        syncCheck();
      }).catch(() => {});
    }
  }

  global.HUB_HEALTH = { init, syncCheck };
})(typeof window !== 'undefined' ? window : global);