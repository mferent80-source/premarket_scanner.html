/* 17.10.2026 — fila „Raport” din Jurnal: citește execuțiile Trading 212 (T212Performance.read), cursul BNR (robotul), stopurile
   (analizele salvate înaintea intrării + Portofoliu), barele zilnice pentru tranzacțiile din SUA și seria SPY; desenează lib/journal-report.js.
   Etichetele (I-690) și limita lunară (I-692) stau în „Setările jurnalului” (lib/monthly-limit.js), sincronizate între dispozitive. */
(function () {
  'use strict';
  const J = window.JournalReport, ML = window.MonthlyLimit, host = document.getElementById('jrrRaport'); if (!J || !host) return;
  const K_ST = 'tt_journal_raport_v1';
  const st = { perioada: 365, ticker: '', toateRandurile: false, editez: null, detector: null };
  try { const s = JSON.parse(localStorage.getItem(K_ST) || '{}'); if ([0, 30, 90, 365].includes(s.perioada)) st.perioada = s.perioada; } catch (_) { /* fără preferință */ }
  let baza = null, stare = '', exStare = '', spy = null, spyEsuat = false;
  const ex = new Map(), ratate = new Set(); // ratate: simbolurile fără bare în sesiunea asta (nu se mai cer la fiecare schimbare de perioadă)
  const limita = () => (ML ? ML.limita() : null);
  const harta = () => { const h = ML ? ML.setari().t212Etichete : null; return h && typeof h === 'object' && !Array.isArray(h) ? h : {}; };
  function teze(scope) { try { const t = JSON.parse(localStorage.getItem('tt_holdings_theses_v1') || '{}'), o = {}; for (const [k, v] of Object.entries(t)) { const i = k.indexOf('|'), s = i >= 0 ? k.slice(0, i) : null, tk = i >= 0 ? k.slice(i + 1) : k; const x = Number(v?.stop); if ((!scope || !s || s === scope) && x > 0) o[tk] = x; } return o; } catch (_) { return {}; } }
  function analizeToate(report) {
    const E = window.TradeEvidence; if (!E || !report?.scope) return [];
    try { return E.evaluate(E.read().entries, report); } catch (_) { return []; }
  }
  // 20.10.2026 (I-726 / I-729 / I-730): planurile Shadow, valoarea contului în moneda raportului și limitele Governor — pentru disciplină, alunecare și cozi
  function planuriShadow() { try { const a = JSON.parse(localStorage.getItem('tt_trade_plans_v1') || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } }
  function contValoare(moneda) { try { const sn = window.T212Snapshot?.read?.('live'), s = sn && sn[1] && sn[1].summary; return s && s.currency === moneda && Number.isFinite(s.totalValue) ? s.totalValue : null; } catch (_) { return null; } }
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
  /* 27.10.2026 (I-761): tiparele de comportament (lib/journal-comportament.js) pe tranzacțiile perioadei; butonul unui tipar filtrează tot raportul
     la tranzacțiile lui (st.detector), a doua apăsare îl scoate. Notele Tiltmeter stau în setările sincronizate ale Jurnalului (tilt: { ziNY: note }). */
  const JC = window.JournalComportament;
  let det = null, tiltMsg = '';
  const aziNY = () => (window.CT && typeof window.CT.ziNY === 'function' ? window.CT.ziNY(Date.now()) : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()));
  const noteTilt = () => { const t = ML ? ML.setari().tilt : null; return t && typeof t === 'object' && !Array.isArray(t) ? t : {}; };
  function deAfisat(baseTr) { if (!st.detector || !det || !det[st.detector]) return baseTr; const ids = new Set(det[st.detector].ids); return baseTr.filter((x) => ids.has(x.id)); }
  function salveazaTilt(zi) {
    if (!JC || !ML || !/^\d{4}-\d{2}-\d{2}$/.test(zi || '')) return;
    const nota = {}; host.querySelectorAll('[data-jrr-tilt]').forEach((s) => { nota[s.dataset.jrrTilt] = s.value === '' ? null : Number(s.value); });
    const v = JC.valideazaNota(nota);
    if (!v.ok) { tiltMsg = v.erori.join(' '); desen(); return; }
    const toate = { ...noteTilt(), [zi]: { somn: nota.somn, concentrare: nota.concentrare, stres: nota.stres } }, chei = Object.keys(toate).sort().slice(-400); // un an și ceva, ca setările să rămână mici
    ML.scrie({ tilt: Object.fromEntries(chei.map((k) => [k, toate[k]])) }); tiltMsg = 'Notele zilei ' + zi + ' sunt salvate.'; desen();
  }
  /* 27.10.2026 (I-762): MAE / MFE din barele de 1 / 5 minute, LA CERERE (butonul din panou): o cerere pe simbol și interval, rezultatul în cache-ul local */
  const JM = window.JournalMae;
  let maeStare = '', maeRuleaza = false;
  async function maeCalculeaza() {
    const fetchStock = window.D?.fetchStock; if (!JM || typeof fetchStock !== 'function' || maeRuleaza || !baza) return;
    const cache = JM.citesteCache(), now = Date.now(), lipsa = deAfisat(filtrate()).filter((x) => !cache[x.id]).map((x) => ({ x, e: JM.eligibil(x, now) })).filter((o) => o.e.ok);
    if (!lipsa.length) return;
    maeRuleaza = true; const grupe = new Map(); let i = 0, rau = 0;
    for (const o of lipsa) { const k = o.e.simbol + '|' + o.e.interval; if (!grupe.has(k)) grupe.set(k, { e: o.e, xs: [] }); grupe.get(k).xs.push(o.x); }
    for (const gr of grupe.values()) {
      i++; maeStare = 'Se citesc barele de ' + gr.e.interval + ' pentru ' + gr.e.simbol + ' (' + i + ' din ' + grupe.size + ')…'; desen();
      try { const b = await fetchStock(gr.e.simbol, { range: gr.e.range, interval: gr.e.interval, ttl: 3600 }); for (const x of gr.xs) { const r = JM.calcul(x, b, gr.e.interval); if (r) cache[x.id] = { ...r, la: Date.now() }; else rau++; } }
      catch (_) { rau += gr.xs.length; }
    }
    JM.scrieCache(undefined, cache); maeRuleaza = false;
    maeStare = rau ? rau + ' tranzacții fără bare în fereastră acum (Yahoo / rețea) — încearcă mai târziu.' : 'Calculat.'; desen();
  }
  /* 27.10.2026 (I-763): etichetele zilei, tranzacțiile ratate (cu ce a făcut prețul în 5 sesiuni după) și heatmap-ul oră × zi (lib/journal-zile.js);
     etichetele și ratatele stau în setările sincronizate ale Jurnalului (zile, ratate) */
  const JZ = window.JournalZile;
  let zileMsg = ''; const ratateDupa = new Map(), ratateCerute = new Set();
  const setariJ = () => (ML ? ML.setari() : {});
  function citesteCampuri(sel, cheie) { const o = {}; host.querySelectorAll(sel).forEach((s) => { o[s.dataset[cheie]] = s.value; }); return o; }
  function salveazaZi(zi) {
    if (!JZ || !ML || !/^\d{4}-\d{2}-\d{2}$/.test(zi || '')) return;
    const o = citesteCampuri('[data-jrr-zi]', 'jrrZi'), v = JZ.valideazaZi(o);
    if (!v.ok) { zileMsg = v.erori.join(' '); desen(); return; }
    ML.scrie(JZ.cuZi(setariJ(), zi, o)); zileMsg = 'Ziua ' + zi + ' e etichetată.'; desen();
  }
  function adaugaRatata() {
    if (!JZ || !ML) return;
    const x = citesteCampuri('[data-jrr-rat]', 'jrrRat'), r = JZ.adaugaRatata(setariJ(), x, Date.now());
    if (!r.ok) { zileMsg = r.erori.join(' '); desen(); return; }
    ML.scrie({ ratate: r.ratate }); zileMsg = 'Notată: ' + String(x.simbol || '').trim().toUpperCase() + '.'; desen(); ratateBare();
  }
  function stergeRatata(id) { if (!ML) return; ML.scrie({ ratate: (setariJ().ratate || []).filter((r) => r && r.id !== id) }); desen(); }
  async function ratateBare() {
    const fetchStock = window.D?.fetchStock; if (!JZ || typeof fetchStock !== 'function') return;
    const lista = (Array.isArray(setariJ().ratate) ? setariJ().ratate : []).filter((r) => r && r.id && !ratateDupa.has(r.id) && !ratateCerute.has(r.id)).slice(-20);
    if (!lista.length) return;
    const pe = new Map(); for (const r of lista) { ratateCerute.add(r.id); if (!pe.has(r.simbol)) pe.set(r.simbol, []); pe.get(r.simbol).push(r); }
    for (const [s, rs] of pe) {
      try { const b = await fetchStock(s.replace('.', '-'), { range: '1y', interval: '1d', ttl: 21600 }); for (const r of rs) ratateDupa.set(r.id, JZ.dupaRatata(r, b) || { pending: true }); }
      catch (_) { for (const r of rs) ratateDupa.set(r.id, { eroare: true }); }
    }
    desen();
  }
  function desen() {
    const baseTr = filtrate();
    det = JC && baza ? JC.detectoare(baseTr, baza.fills || [], { now: Date.now() }) : null;
    if (st.detector && det && det[st.detector] && !det[st.detector].ids.length) st.detector = null;
    const tr = deAfisat(baseTr), azi = aziNY(), note = noteTilt();
    const comportamentHtml = det ? JC.html(det, JC.tilt(baza?.rows || [], note, { now: Date.now() }), { activ: st.detector, azi, notaAzi: note[azi] }) + (tiltMsg ? '<p class="jrr-nota" role="status">' + tiltMsg.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) + '</p>' : '') : '';
    const maeCache = JM ? JM.citesteCache() : {}, maeHtml = JM ? JM.html(tr, maeCache, { eligibile: maeRuleaza ? 0 : tr.filter((x) => !maeCache[x.id] && JM.eligibil(x, Date.now()).ok).length, stare: maeStare }) : '';
    const sj = setariJ(), zileHtml = JZ ? JZ.htmlZile({ azi, zile: sj.zile, ratate: sj.ratate, dupa: ratateDupa, agregat: JZ.peEticheteZi(baseTr, sj.zile), moneda: baza?.moneda, mesaj: zileMsg }) : '';
    const heatmapHtml = JZ ? JZ.htmlHeatmap(JZ.heatmap(tr), baza?.moneda) : '';
    const filtruDet = st.detector && det ? ' Filtru activ: ' + det[st.detector].titlu + ' (' + tr.length + ' tranzacții) — „Arată toate” în „Tiparele tale de comportament”.' : '';
    host.innerHTML = J.render({ tr, toate: baza?.rows || [], moneda: baza?.moneda, perioada: st.perioada, ticker: st.ticker, tickere: baza ? [...new Set(baza.rows.map((x) => x.ticker))].sort() : [], comportamentHtml, maeHtml, zileHtml, heatmapHtml,
      ex, exStare, spy, spyEsuat, limita: limita(), stare: stare + filtruDet, faraCumparare: baza?.faraCumparare || 0, alteMonede: baza?.alteMonede || 0, partiale: baza?.partiale || 0, corporative: baza?.corporative || 0,
      rows: baza?.fills || [], jurnal: (window.GV && typeof GV.jurnal === 'function') ? GV.jurnal() : [], analize: baza?.analizeToate || [], plans: planuriShadow(), gov: (window.GV && typeof GV.cfg === 'function') ? GV.cfg() : null, cont: contValoare(baza?.moneda),
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
    const dt = ev.target.closest('[data-jrr-det]'), ts = ev.target.closest('[data-jrr-tilt-salveaza]'); // I-761
    if (dt) { st.detector = st.detector === dt.dataset.jrrDet ? null : dt.dataset.jrrDet; desen(); return; }
    if (ts) { salveazaTilt(ts.dataset.jrrTiltSalveaza); return; }
    if (ev.target.closest('[data-jrr-mae]')) { maeCalculeaza(); return; } // I-762
    const zs = ev.target.closest('[data-jrr-zi-salveaza]'), ra = ev.target.closest('[data-jrr-rat-adauga]'), rs = ev.target.closest('[data-jrr-rat-sterge]'); // I-763
    if (zs) { salveazaZi(zs.dataset.jrrZiSalveaza); return; }
    if (ra) { adaugaRatata(); return; }
    if (rs) { stergeRatata(rs.dataset.jrrRatSterge); return; }
    if (p) { st.perioada = Number(p.dataset.jrrPer); try { localStorage.setItem(K_ST, JSON.stringify({ perioada: st.perioada })); } catch (_) { /* doar preferință */ } desen(); barele(); return; }
    if (t) { st.ticker = t.dataset.jrrTk; desen(); host.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (et) { puneEticheta(et.dataset.jrrId, et.dataset.jrrEt); desen(); host.querySelector(`[data-jrr-et="${et.dataset.jrrEt}"][data-jrr-id="${CSS.escape(et.dataset.jrrId)}"]`)?.focus(); return; }
    if (ed) { const id = ed.dataset.jrrEtEd || null; st.editez = st.editez === id ? null : id; if (st.editez && !st.toateRandurile && !filtrate().slice(-15).some((x) => x.id === st.editez)) st.toateRandurile = true; desen(); if (st.editez) host.querySelector('[data-jrr-et][data-jrr-id="' + CSS.escape(st.editez) + '"]')?.focus(); return; }
    if (ev.target.closest('#jrrToate')) { st.toateRandurile = !st.toateRandurile; desen(); return; }
    if (ev.target.closest('#jrrCsv')) {
      const blob = new Blob(['﻿' + J.csv(deAfisat(filtrate()), baza?.moneda || '')], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
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
    const an = analizeToate(report);
    baza = { ...c, rows: J.stopuriR(c.rows, { analize: an.filter((o) => o.sellIds && o.sellIds.length), teze: teze(report.scope), deschisa: c.deschisa, istoricStop }), fills: report.rows, analizeToate: an };
    if (ML && report.rows.length) ML.salveazaLuna(ML.dinExecutii(report.rows, { moneda: c.moneda })); // I-692: rezultatul lunii, pentru Astăzi și Planuri
    stare = report.state === 'partial' ? 'Istoricul importat e parțial: o parte din execuții lipsesc sau au fost respinse.' : report.state === 'error' ? (report.reason || '') : '';
    if (report.state === 'missing') stare = report.reason || '';
    if (!curs) stare += (stare ? ' ' : '') + 'Cursul BNR nu e încă publicat de robot: mărimea pozițiilor apare după prima rulare.';
    desen(); barele(); ratateBare(); // I-763: ce a făcut prețul după tranzacțiile ratate
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
  window.addEventListener('storage', (e) => { if (e.key !== (ML?.K_SET || 'tt_journal_settings_v1') && e.key !== ML?.K_LUNA && e.key !== 'tt_governor_jurnal_v1' && e.key !== 'tt_trade_plans_v1') return; bannerGovernor(); if (!activ()) deDesenat = true; else if (ocupat()) amanat = true; else desen(); });
  window.JournalReportUI = { reincarca: cere, activeaza };
})();
