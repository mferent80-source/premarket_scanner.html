/* 17.10.2026 — fila „Raport” din Jurnal: citește execuțiile Trading 212 (T212Performance.read), cursul BNR (robotul), stopurile
   (analizele salvate înaintea intrării + Portofoliu) și barele zilnice pentru tranzacțiile din SUA; desenează lib/journal-report.js. */
(function () {
  'use strict';
  const J = window.JournalReport, host = document.getElementById('jrrRaport'); if (!J || !host) return;
  const K_ST = 'tt_journal_raport_v1', K_LIM = 'tt_journal_limita_luna_v1';
  const st = { perioada: 365, ticker: '', toateRandurile: false };
  try { const s = JSON.parse(localStorage.getItem(K_ST) || '{}'); if ([0, 30, 90, 365].includes(s.perioada)) st.perioada = s.perioada; } catch (_) { /* fără preferință */ }
  let baza = null, stare = '', exStare = '';
  const ex = new Map(), ratate = new Set(); // ratate: simbolurile fără bare în sesiunea asta (nu se mai cer la fiecare schimbare de perioadă)
  const limita = () => { try { const v = Number(localStorage.getItem(K_LIM)); return v > 0 ? v : null; } catch (_) { return null; } };
  function teze(scope) { try { const t = JSON.parse(localStorage.getItem('tt_holdings_theses_v1') || '{}'), o = {}; for (const [k, v] of Object.entries(t)) { const i = k.indexOf('|'), s = i >= 0 ? k.slice(0, i) : null, tk = i >= 0 ? k.slice(i + 1) : k; const x = Number(v?.stop); if ((!scope || !s || s === scope) && x > 0) o[tk] = x; } return o; } catch (_) { return {}; } }
  function analize(report) {
    const E = window.TradeEvidence; if (!E || !report?.scope) return [];
    try { return E.evaluate(E.read().entries, report).filter((o) => o.sellIds && o.sellIds.length); } catch (_) { return []; }
  }
  function filtrate() {
    if (!baza) return [];
    const de = st.perioada ? Date.now() - st.perioada * 86400000 : -Infinity;
    return baza.rows.filter((x) => x.iesire >= de && (!st.ticker || x.ticker === st.ticker));
  }
  function desen() {
    const tr = filtrate();
    host.innerHTML = J.render({ tr, toate: baza?.rows || [], moneda: baza?.moneda, perioada: st.perioada, ticker: st.ticker, tickere: baza ? [...new Set(baza.rows.map((x) => x.ticker))].sort() : [],
      ex, exStare, limita: limita(), stare, faraCumparare: baza?.faraCumparare || 0, alteMonede: baza?.alteMonede || 0, partiale: baza?.partiale || 0, corporative: baza?.corporative || 0, toateRandurile: st.toateRandurile, now: Date.now() });
  }
  // filtre, limită, CSV, tickere — delegat (raportul se redesenează întreg)
  host.addEventListener('click', (ev) => {
    const p = ev.target.closest('[data-jrr-per]'), t = ev.target.closest('[data-jrr-tk]');
    if (p) { st.perioada = Number(p.dataset.jrrPer); try { localStorage.setItem(K_ST, JSON.stringify({ perioada: st.perioada })); } catch (_) { /* doar preferință */ } desen(); barele(); return; }
    if (t) { st.ticker = t.dataset.jrrTk; desen(); host.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (ev.target.closest('#jrrToate')) { st.toateRandurile = !st.toateRandurile; desen(); return; }
    if (ev.target.closest('#jrrCsv')) {
      const blob = new Blob(['﻿' + J.csv(filtrate(), baza?.moneda || '')], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'raport-executie-' + new Date().toISOString().slice(0, 10) + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
  });
  host.addEventListener('change', (ev) => {
    if (ev.target.id === 'jrrTicker') { st.ticker = ev.target.value; desen(); }
    if (ev.target.id === 'jrrLimita') { const v = Number(ev.target.value); try { if (v > 0) localStorage.setItem(K_LIM, String(v)); else localStorage.removeItem(K_LIM); } catch (_) { /* rămâne pe ecran până la reîncărcare */ } desen(); }
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
    const lipsa = filtrate().filter((x) => x.intrare != null && J.symYahoo(x.ticker) && !ex.has(x.id) && !ratate.has(J.symYahoo(x.ticker))), simboluri = [...new Set(lipsa.map((x) => J.symYahoo(x.ticker)))].slice(0, 40);
    if (!simboluri.length) return;
    bareRuleaza = true; exStare = 'Se citesc barele zilnice pentru ' + simboluri.length + ' simboluri…'; desen();
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
    if (!report || !Array.isArray(report.rows)) { host.innerHTML = J.render({ tr: [], toate: [], perioada: st.perioada, stare: 'Istoricul Trading 212 nu poate fi citit.' }); return; }
    let curs = null; try { curs = await window.JournalReview?.cursFile?.(); } catch (_) { curs = null; }
    const c = J.calatorii(report.rows, { curs, moneda: report.currency });
    baza = { ...c, rows: J.stopuriR(c.rows, { analize: analize(report), teze: teze(report.scope), deschisa: c.deschisa }) };
    stare = report.state === 'partial' ? 'Istoricul importat e parțial: o parte din execuții lipsesc sau au fost respinse.' : report.state === 'error' ? (report.reason || '') : '';
    if (report.state === 'missing') stare = report.reason || '';
    if (!curs) stare += (stare ? ' ' : '') + 'Cursul BNR nu e încă publicat de robot: mărimea pozițiilor apare după prima rulare.';
    desen(); barele();
  }
  host.innerHTML = '<p class="jrr-gol">Se citesc execuțiile…</p>';
  incarca();
  // execuțiile stau în IndexedDB (T212FillsStore): după o sincronizare raportul se reface singur
  try { window.T212FillsStore?.subscribe?.(() => incarca()); } catch (_) { /* fără abonare: la reîncărcarea paginii */ }
  window.addEventListener('storage', (e) => { if (e.key === K_LIM) desen(); });
  window.JournalReportUI = { reincarca: incarca };
})();
