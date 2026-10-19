/* 17.10.2026 — fila „Raport” din Jurnal: citește execuțiile Trading 212 (T212Performance.read), cursul BNR (robotul), stopurile
   (analizele salvate înaintea intrării + Portofoliu), barele zilnice pentru tranzacțiile din SUA și seria SPY; desenează lib/journal-report.js.
   Etichetele (I-690) și limita lunară (I-692) stau în „Setările jurnalului” (lib/monthly-limit.js), sincronizate între dispozitive. */
(function () {
  'use strict';
  const J = window.JournalReport, ML = window.MonthlyLimit, host = document.getElementById('jrrRaport'); if (!J || !host) return;
  const K_ST = 'tt_journal_raport_v1';
  const st = { perioada: 365, ticker: '', toateRandurile: false, editez: null };
  try { const s = JSON.parse(localStorage.getItem(K_ST) || '{}'); if ([0, 30, 90, 365].includes(s.perioada)) st.perioada = s.perioada; } catch (_) { /* fără preferință */ }
  let baza = null, stare = '', exStare = '', spy = null, spyEsuat = false;
  const ex = new Map(), ratate = new Set(); // ratate: simbolurile fără bare în sesiunea asta (nu se mai cer la fiecare schimbare de perioadă)
  const limita = () => (ML ? ML.limita() : null);
  const harta = () => { const h = ML ? ML.setari().t212Etichete : null; return h && typeof h === 'object' && !Array.isArray(h) ? h : {}; };
  function teze(scope) { try { const t = JSON.parse(localStorage.getItem('tt_holdings_theses_v1') || '{}'), o = {}; for (const [k, v] of Object.entries(t)) { const i = k.indexOf('|'), s = i >= 0 ? k.slice(0, i) : null, tk = i >= 0 ? k.slice(i + 1) : k; const x = Number(v?.stop); if ((!scope || !s || s === scope) && x > 0) o[tk] = x; } return o; } catch (_) { return {}; } }
  function analize(report) {
    const E = window.TradeEvidence; if (!E || !report?.scope) return [];
    try { return E.evaluate(E.read().entries, report).filter((o) => o.sellIds && o.sellIds.length); } catch (_) { return []; }
  }
  function filtrate() {
    if (!baza) return [];
    const de = st.perioada ? Date.now() - st.perioada * 86400000 : -Infinity, h = harta();
    return J.cuEtichete(baza.rows.filter((x) => x.iesire >= de && (!st.ticker || x.ticker === st.ticker)), h);
  }
  // I-692: banner-ul limitei lunare și în fila „Risc & capital” (lângă Governor)
  function bannerGovernor() {
    const el = document.getElementById('jrMonthlyLimit'); if (!el || !ML) return;
    const t = ML.text(ML.stare()); el.hidden = !t; el.className = 'jrr-limita-banner' + (t ? ' grav-' + t.grav : ''); if (el.textContent !== (t ? t.text : '')) el.textContent = t ? t.text : '';
  }
  function desen() {
    const tr = filtrate();
    host.innerHTML = J.render({ tr, toate: baza?.rows || [], moneda: baza?.moneda, perioada: st.perioada, ticker: st.ticker, tickere: baza ? [...new Set(baza.rows.map((x) => x.ticker))].sort() : [],
      ex, exStare, spy, spyEsuat, limita: limita(), stare, faraCumparare: baza?.faraCumparare || 0, alteMonede: baza?.alteMonede || 0, partiale: baza?.partiale || 0, corporative: baza?.corporative || 0,
      toateRandurile: st.toateRandurile, editez: st.editez, now: Date.now() });
    bannerGovernor();
  }
  function puneEticheta(id, k) {
    if (!ML) return; const h = { ...harta() }, cur = new Set(h[id]?.e || []); if (cur.has(k)) cur.delete(k); else cur.add(k);
    if (cur.size) h[id] = [...cur].sort(); else delete h[id]; // fără ora scrierii: altfel conflict de sincronizare între dispozitive
    ML.scrie({ t212Etichete: h });
  }
  // filtre, limită, etichete, CSV, tickere — delegat (raportul se redesenează întreg)
  host.addEventListener('click', (ev) => {
    const p = ev.target.closest('[data-jrr-per]'), t = ev.target.closest('[data-jrr-tk]'), ed = ev.target.closest('[data-jrr-et-ed]'), et = ev.target.closest('[data-jrr-et]');
    if (p) { st.perioada = Number(p.dataset.jrrPer); try { localStorage.setItem(K_ST, JSON.stringify({ perioada: st.perioada })); } catch (_) { /* doar preferință */ } desen(); barele(); return; }
    if (t) { st.ticker = t.dataset.jrrTk; desen(); host.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (et) { puneEticheta(et.dataset.jrrId, et.dataset.jrrEt); desen(); host.querySelector(`[data-jrr-et="${et.dataset.jrrEt}"][data-jrr-id="${CSS.escape(et.dataset.jrrId)}"]`)?.focus(); return; }
    if (ed) { const id = ed.dataset.jrrEtEd || null; st.editez = st.editez === id ? null : id; if (st.editez && !st.toateRandurile && !filtrate().slice(-15).some((x) => x.id === st.editez)) st.toateRandurile = true; desen(); if (st.editez) host.querySelector('[data-jrr-et][data-jrr-id="' + CSS.escape(st.editez) + '"]')?.focus(); return; }
    if (ev.target.closest('#jrrToate')) { st.toateRandurile = !st.toateRandurile; desen(); return; }
    if (ev.target.closest('#jrrCsv')) {
      const blob = new Blob(['﻿' + J.csv(filtrate(), baza?.moneda || '')], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'raport-executie-' + new Date().toISOString().slice(0, 10) + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
  });
  host.addEventListener('change', (ev) => {
    if (ev.target.id === 'jrrTicker') { st.ticker = ev.target.value; desen(); }
    if (ev.target.id === 'jrrLimita' && ML) { ML.puneLimita(Number(ev.target.value)); desen(); }
  });
  // atingere / mouse pe grafice: textul din data-tip
  const tip = document.createElement('div'); tip.className = 'jrr-tip'; tip.hidden = true; document.body.appendChild(tip);
  const arata = (ev, el) => { tip.textContent = el.getAttribute('data-tip'); tip.hidden = false; const w = tip.offsetWidth, h = tip.offsetHeight; let x = ev.clientX + 14, y = ev.clientY + 14; if (x + w > innerWidth - 8) x = ev.clientX - w - 14; if (y + h > innerHeight - 8) y = ev.clientY - h - 14; tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px'; };
  host.addEventListener('pointermove', (ev) => { const el = ev.target.closest('[data-tip]'); if (el) arata(ev, el); else tip.hidden = true; });
  host.addEventListener('pointerleave', () => { tip.hidden = true; });
  host.addEventListener('focusin', (ev) => { const el = ev.target.closest('[data-tip]'); if (el) { const r = el.getBoundingClientRect(); arata({ clientX: r.right, clientY: r.bottom }, el); } });
  host.addEventListener('focusout', () => { tip.hidden = true; });
  document.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });
  // barele zilnice: doar tranzacțiile din SUA din perioadă, câte un simbol o dată (cache 6 h în D.fetchStock — ttl în SECUNDE)
  let bareRuleaza = false, bareReia = false;
  async function barele() {
    const fetchStock = window.D?.fetchStock; if (!baza || typeof fetchStock !== 'function') return;
    if (bareRuleaza) { bareReia = true; return; } // altă perioadă aleasă în timpul citirii: se reia la final
    bareRuleaza = true;
    if (!spy && !spyEsuat) { try { const b = await fetchStock('SPY', { range: '5y', interval: '1d', ttl: 21600 }); if (Array.isArray(b) && b.length) spy = b.map((x) => ({ t: x.t, c: x.c })); else spyEsuat = true; } catch (_) { spyEsuat = true; } desen(); }
    const lipsa = filtrate().filter((x) => x.intrare != null && J.symYahoo(x.ticker) && !ex.has(x.id) && !ratate.has(J.symYahoo(x.ticker))), simboluri = [...new Set(lipsa.map((x) => J.symYahoo(x.ticker)))].slice(0, 40);
    if (!simboluri.length) { bareRuleaza = false; if (bareReia) { bareReia = false; barele(); } return; }
    exStare = 'Se citesc barele zilnice pentru ' + simboluri.length + ' simboluri…'; desen();
    const celMaiVechi = Math.min(...lipsa.map((x) => x.intrare)), range = Date.now() - celMaiVechi > 700 * 86400000 ? '5y' : '2y';
    for (const s of simboluri) {
      try { const b = await fetchStock(s, { range, interval: '1d', ttl: 21600 }); if (Array.isArray(b)) for (const x of lipsa.filter((r) => J.symYahoo(r.ticker) === s)) { const e = J.excursie(x, b); ex.set(x.id, e || { nepotrivit: true }); } else ratate.add(s); } catch (_) { ratate.add(s); }
    }
    bareRuleaza = false; exStare = ex.size ? '' : 'Barele zilnice nu au putut fi citite acum (rețea / Yahoo). Reîncarcă mai târziu.'; desen();
    if (bareReia) { bareReia = false; barele(); }
  }
  async function incarca() {
    try { await window.T212FillsStore?.ready?.(); } catch (_) { /* citim ce e în registru */ }
    try { await window.TTEvidenceVault?.ready?.(); } catch (_) { /* fără analize: R doar din Portofoliu */ }
    let report = null; try { report = window.T212Performance?.read?.() || null; } catch (_) { report = null; }
    if (!report || !Array.isArray(report.rows)) { host.innerHTML = J.render({ tr: [], toate: [], perioada: st.perioada, stare: 'Istoricul Trading 212 nu poate fi citit.' }); bannerGovernor(); return; }
    let curs = null; try { curs = await window.JournalReview?.cursFile?.(); } catch (_) { curs = null; }
    const c = J.calatorii(report.rows, { curs, moneda: report.currency });
    let istoricStop = {}; try { istoricStop = window.StopSetter ? window.StopSetter.istoric(JSON.parse(localStorage.getItem('tt_holdings_theses_v1') || '{}'), report.scope) : {}; } catch (_) { istoricStop = {}; }
    baza = { ...c, rows: J.stopuriR(c.rows, { analize: analize(report), teze: teze(report.scope), deschisa: c.deschisa, istoricStop }) };
    if (ML && report.rows.length) ML.salveazaLuna(ML.dinExecutii(report.rows, { moneda: c.moneda })); // I-692: rezultatul lunii, pentru Astăzi și Planuri
    stare = report.state === 'partial' ? 'Istoricul importat e parțial: o parte din execuții lipsesc sau au fost respinse.' : report.state === 'error' ? (report.reason || '') : '';
    if (report.state === 'missing') stare = report.reason || '';
    if (!curs) stare += (stare ? ' ' : '') + 'Cursul BNR nu e încă publicat de robot: mărimea pozițiilor apare după prima rulare.';
    desen(); barele();
  }
  // 19.10.2026 (perf): raportul (SPY 5 ani + până la 40 de simboluri unul după altul + bootstrap) se calcula la fiecare deschidere a
  // Jurnalului, pe orice filă, și cu pagina parcată în aplicație. Acum: complet doar cu fila Raport deschisă și pagina pe ecran; altfel
  // doar rezultatul lunii pentru limita lunară (Astăzi îl citește din tt_journal_luna_t212_v1) și bannerul din Risc & capital.
  const pane = document.getElementById('jpaneRaport');
  const activ = () => (!pane || !pane.hidden) && (window.TTShell?.visible ? window.TTShell.visible() : !document.hidden);
  let deIncarcat = true, deDesenat = false;
  async function doarLuna() { try { await ML?.reimprospateaza?.(); } catch (_) { /* rămâne ultimul rezultat salvat */ } bannerGovernor(); }
  function cere() { if (activ()) { deIncarcat = false; deDesenat = false; incarca(); } else { deIncarcat = true; doarLuna(); } }
  function activeaza() { if (!activ()) return; if (deIncarcat) { deIncarcat = false; deDesenat = false; incarca(); } else if (deDesenat) { deDesenat = false; desen(); } }
  host.innerHTML = '<p class="jrr-gol">Se citesc execuțiile…</p>';
  cere();
  try { window.TTShell?.onChange?.((v) => { if (v) activeaza(); }); } catch (_) { /* pagină deschisă direct */ }
  // execuțiile stau în IndexedDB (T212FillsStore): după o sincronizare raportul se reface singur
  try { window.T212FillsStore?.subscribe?.(() => cere()); } catch (_) { /* fără abonare: la reîncărcarea paginii */ }
  // limita / etichetele schimbate pe alt dispozitiv (sincronizare) sau în altă filă
  let amanat = false;
  const ocupat = () => { const a = document.activeElement; return !!(a && host.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || st.editez)); };
  host.addEventListener('focusout', () => { if (amanat) setTimeout(() => { if (amanat && !ocupat()) { amanat = false; desen(); } }, 0); });
  window.addEventListener('storage', (e) => { if (e.key !== (ML?.K_SET || 'tt_journal_settings_v1') && e.key !== ML?.K_LUNA) return; bannerGovernor(); if (!activ()) deDesenat = true; else if (ocupat()) amanat = true; else desen(); });
  window.JournalReportUI = { reincarca: cere, activeaza };
})();
