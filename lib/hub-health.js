// hub-health.js — health pill (HUB_HEALTH.*); banda PLATFORM e scoasă de pe Hub
(function(global){
  'use strict';

  let lastCls = 'ok';
  let lastTitle = '';

  // după hard-reload (Shift+F5) controller e null PRIN DESIGN de browser —
  // warning fals „SW neactiv"; getRegistration() confirmă dacă SW-ul există
  let swRegistered = false;
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistration){
      navigator.serviceWorker.getRegistration().then(r => { swRegistered = !!r; syncCheck(); }).catch(() => {});
    }
  } catch (e) {}

  function runChecks(){
    let issues = 0;
    const notes = [];
    try {
      if (!('serviceWorker' in navigator)) { issues++; notes.push('fără SW'); }
      else if (!navigator.serviceWorker.controller && !swRegistered) { issues++; notes.push('SW neactiv'); }
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
    } else {
      // modulul de staleness NEÎNCĂRCAT = tot auditul sărit — verde fals;
      // absența se contorizează, nu se trece ca „OK"
      issues++; notes.push('modul stale (HS) indisponibil');
    }
    try {
      const hp = global.CD && CD.healthProbe ? CD.healthProbe() : null;
      if (hp && hp.cls !== 'ok'){
        issues++;
        notes.push(hp.issues && hp.issues[0] ? hp.issues[0] : 'capital ' + hp.cls);
      }
      if (!global.CD){ issues++; notes.push('modul capital (CD) indisponibil'); }
    } catch (e) {}
    const cls = issues >= 2 ? 'bad' : issues === 1 ? 'warn' : 'ok';
    const title = notes.length ? notes.join(' · ') : 'Infrastructură OK — click pentru Health';
    return { cls, title };
  }

  // semnul întrebării pe starea CEA MAI gravă comunica incertitudine, nu
  // alarmă — bad = ✗, warn = ?
  function pillLabel(c){ return c === 'ok' ? 'Health OK' : c === 'warn' ? 'Health ?' : 'Health ✗'; }

  function pillHtml(){
    const c = lastCls;
    return '<a href="./health/" class="ht-pill ht-health ' + c + '" id="htHealthPill" title="' +
      String(lastTitle).replace(/"/g, '&quot;') + '">' + pillLabel(c) + '</a>';
  }

  function syncCheck(){
    const r = runChecks();
    lastCls = r.cls;
    lastTitle = r.title;
    const el = document.getElementById('htHealthPill');
    if (el){
      el.className = 'ht-pill ht-health ' + r.cls;
      el.textContent = pillLabel(r.cls);
      el.title = r.title;
    }
    const pills = document.getElementById('htPills');
    if (pills && !el){
      const hp = pills.querySelector('.ht-health');
      if (hp){
        hp.className = 'ht-pill ht-health ' + r.cls;
        hp.textContent = pillLabel(r.cls);
        hp.title = r.title;
      }
    }
  }

  // Intreaba SW-ul activ ce CACHE_VERSION ruleaza (MessageChannel) si scrie
  // valoarea REALA in tt_sw_version. Inainte se scria versiunea PAGINII
  // curente -> comparatia era tautologica (un SW/cache realmente vechi nu
  // era detectat niciodata, iar update.html/migrate.html hardcodau valori
  // stale care produceau warning FALS).
  function probeSwVersion(){
    const ctrl = navigator.serviceWorker.controller;
    if (!ctrl) return;
    try {
      const mc = new MessageChannel();
      const to = setTimeout(() => {
        // SW vechi, fara handler GET_VERSION — versiune necunoscuta:
        // stergem cheia ca sa nu compare cu o valoare care minte
        try { localStorage.removeItem('tt_sw_version'); } catch (e) {}
        syncCheck();
      }, 3000);
      mc.port1.onmessage = ev => {
        clearTimeout(to);
        try {
          const v = ev.data && ev.data.version ? String(ev.data.version) : '';
          const short = v.replace(/-\d{4}-\d{2}-\d{2}$/, '');
          if (short) localStorage.setItem('tt_sw_version', short);
        } catch (e) {}
        syncCheck();
      };
      ctrl.postMessage({ type: 'GET_VERSION' }, [mc.port2]);
    } catch (e) {}
  }

  // Banda PLATFORM e scoasă de pe Hub — Health rămâne pill-ul din tableau / pagina Health.
  function renderStrip(){
    const el = document.getElementById('hubPlatformStrip');
    if (el) {
      el.hidden = true;
      el.innerHTML = '';
      el.setAttribute('aria-hidden', 'true');
    }
    syncCheck();
  }

  function init(){
    syncCheck();
    renderStrip();
    if ('serviceWorker' in navigator) probeSwVersion();
    window.addEventListener('hub:market', function () {
      try { renderStrip(); syncCheck(); } catch (e) {}
    });
    window.addEventListener('tt:quotes', function () {
      try { renderStrip(); } catch (e) {}
    });
    setInterval(function () {
      try { renderStrip(); syncCheck(); } catch (e) {}
    }, 60000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) try { renderStrip(); } catch (e) {}
    });
  }

  global.HUB_HEALTH = { init, syncCheck, pillHtml, runChecks, renderStrip };
})(typeof window !== 'undefined' ? window : global);