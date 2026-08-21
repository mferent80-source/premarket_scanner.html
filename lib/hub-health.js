// hub-health.js — health pill + badge-uri first paint (HUB_HEALTH.*)
(function(global){
  'use strict';

  let lastCls = 'ok';
  let lastTitle = '';
  const RISK_HALT = () => (global.CD && CD.RISK_HALT_PCT) || 4;

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

  function ageMin(ts){
    if (!Number.isFinite(ts) || ts <= 0) return null;
    const t = ts < 1e12 ? ts * 1000 : ts;
    return (Date.now() - t) / 60000;
  }

  function chipHtml(cls, label, href, title){
    const t = title ? ' title="' + String(title).replace(/"/g, '&quot;') + '"' : '';
    const body = '<span class="hps-dot"></span><span class="hps-txt">' + label + '</span>';
    if (href){
      return '<a class="hps-chip ' + cls + '" href="' + href + '"' + t + '>' + body + '</a>';
    }
    return '<span class="hps-chip ' + cls + '"' + t + '>' + body + '</span>';
  }

  // Badge-uri first paint: Trust / SPY / Bus / freeze / risc / Health / stale
  function renderStrip(){
    const el = document.getElementById('hubPlatformStrip');
    if (!el) return;

    let trustPct = null, trustDeg = false;
    try {
      if (global.HS && HS.dataTrust){
        const t = HS.dataTrust();
        trustPct = t.pct;
        trustDeg = !!t.degraded;
      }
    } catch (e) {}

    let mktAge = null;
    let busAgeSec = null;
    try {
      if (global.QB && QB.ageMs) {
        const a = QB.ageMs('SPY');
        if (a != null && a >= 0) {
          busAgeSec = Math.round(a / 1000);
          mktAge = a / 60000;
        }
      }
      if (mktAge == null) {
        let mkt = global.__hubMkt;
        if (!mkt || !mkt.ts){
          const c = JSON.parse(localStorage.getItem('tt_hub_mkt_v1') || 'null');
          if (c) mkt = c;
        }
        if (mkt && mkt.ts) mktAge = ageMin(mkt.ts);
        else if (mkt && mkt.quotes && mkt.quotes.SPY && mkt.quotes.SPY.ts) mktAge = ageMin(mkt.quotes.SPY.ts);
      }
    } catch (e) {}

    let freeze = false;
    try {
      if (global.HS && HS.hubState){
        const st = HS.hubState();
        const c = st.rtPayload && st.rtPayload.context;
        freeze = !!(c && c.macroFreeze && c.macroFreeze.active);
      }
      if (!freeze){
        const r = JSON.parse(localStorage.getItem('tt_router_state_v1') || 'null');
        const c = r && r.context;
        freeze = !!(c && c.macroFreeze && c.macroFreeze.active);
      }
    } catch (e) {}

    let riskPct = null, riskStale = false;
    try {
      if (global.CD && CD.unified){
        const pf = CD.unified().portfolio || {};
        riskPct = pf.riskPct;
        riskStale = !!pf.liveStale;
      }
    } catch (e) {}

    const infra = runChecks();
    lastCls = infra.cls;
    lastTitle = infra.title;

    const chips = [];
    if (trustPct != null){
      const tc = trustDeg || trustPct < 50 ? 'err' : trustPct < 75 ? 'warn' : 'ok';
      chips.push(chipHtml(tc, 'Trust ' + trustPct + '%', './health/', 'Surse decizionale proaspete (staleAudit)'));
    } else {
      chips.push(chipHtml('warn', 'Trust n/a', './health/', 'HS.dataTrust indisponibil'));
    }
    if (mktAge != null){
      const mc = mktAge > 45 ? 'err' : mktAge > 12 ? 'warn' : 'ok';
      let lbl;
      if (busAgeSec != null && busAgeSec < 120) lbl = 'SPY ' + busAgeSec + 's';
      else if (mktAge < 1.5) lbl = 'SPY ' + Math.max(1, Math.round(mktAge * 60)) + 's';
      else lbl = 'SPY ' + Math.round(mktAge) + 'm';
      chips.push(chipHtml(mc, lbl, './', 'Vârsta quote SPY (bus tt_quotes_v1 / hub cache)'));
    } else {
      chips.push(chipHtml('warn', 'SPY n/a', './', 'Fără quote în cache'));
    }
    try {
      if (global.QB && QB.all) {
        const all = QB.all(false) || {};
        const n = Object.keys(all).length;
        if (n > 0) {
          const fresh = Object.keys(QB.all(45000) || {}).length;
          const bc = fresh >= 3 ? 'ok' : fresh >= 1 ? 'warn' : 'err';
          chips.push(chipHtml(bc, 'Bus ' + fresh + '/' + n, './', 'Simboluri proaspete pe quote bus (<45s) / total în cache'));
        }
      }
    } catch (e) {}
    chips.push(chipHtml(
      freeze ? 'err' : 'ok',
      freeze ? 'FREEZE' : 'No freeze',
      './macro-dashboard/',
      freeze ? 'Macro freeze activ — eveniment high-impact' : 'Niciun freeze macro activ'
    ));
    if (riskPct != null && Number.isFinite(riskPct)){
      const halt = RISK_HALT();
      const rc = riskPct >= halt ? 'err' : riskPct >= 2 ? 'warn' : 'ok';
      chips.push(chipHtml(
        rc,
        'Risc ' + riskPct.toFixed(1) + '%' + (riskStale ? ' ⏳' : ''),
        './journal/#portfolio',
        riskStale ? 'Risc live stale — rescan Portfolio' : 'Risc agregat @ SL'
      ));
    } else {
      chips.push(chipHtml('neut', 'Risc —', './journal/#portfolio', 'Fără portofoliu / CD'));
    }
    const ic = infra.cls === 'bad' ? 'err' : infra.cls === 'warn' ? 'warn' : 'ok';
    chips.push(chipHtml(ic, pillLabel(infra.cls), './health/', infra.title));
    try {
      if (global.HS && HS.staleAudit){
        const sa = HS.staleAudit();
        if (sa.count > 0){
          chips.push(chipHtml(
            sa.worst === 'err' ? 'err' : 'warn',
            sa.count + ' stale',
            './health/',
            sa.items.map(i => i.label).join(' · ')
          ));
        }
      }
    } catch (e) {}

    el.innerHTML =
      '<span class="hps-lbl">PLATFORM</span>' +
      chips.join('') +
      '<a class="hps-more" href="./health/" title="Suite Health detaliat">detalii →</a>';
    el.hidden = false;
    el.setAttribute('aria-hidden', 'false');

    const pill = document.getElementById('htHealthPill');
    if (pill){
      pill.className = 'ht-pill ht-health ' + infra.cls;
      pill.textContent = pillLabel(infra.cls);
      pill.title = infra.title;
    }
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