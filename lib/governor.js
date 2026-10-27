// ═══════════════════════════════════════════════════════════════════
// governor.js — Risk Governor: kill switch zilnic, buget pierdere, max trades (GV.*)
// Citește jurnalul manual și controlul Invest, separat pe monedă; frână disciplinară, fără ordine către broker.
// Folosire: <script src="../lib/governor.js"></script>  GV.status(); GV.cfg();
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';
  const CFG_KEY = 'tt_governor_cfg_v1';
  const STATE_KEY = 'tt_governor_state_v1';
  const ALERT_KEY = 'tt_governor_alert_day';
  // 20.10.2026 (I-726): jurnalul append-only al verdictelor (ziua NY, verdict, motive, limita lunară) — scris la fiecare schimbare, pe aparat;
  // Raportul din Jurnal îl citește ca să știe ce verdict era când ai cumpărat. (I-728): jurnalul schimbărilor de limite (cine / când / de la → la).
  const JURNAL_KEY = 'tt_governor_jurnal_v1', LIMITE_KEY = 'tt_governor_limite_jurnal_v1', JURNAL_MAX = 2000, LIMITE_MAX = 500;
  // 27.10.2026 (lotul 2, contractele cu lotul E): kill switch-ul „Oprește tot” (I-757) și reconcilierea zilnică aplicație ↔ broker (I-759)
  const OPRIRE_KEY = 'tt_governor_oprire_v1', RECONCILIERE_KEY = 'tt_reconciliere_v1';

  const DEFAULTS = {
    accountSize: 10000,
    maxLossPctDay: 2,
    maxTradesDay: 5,
    maxOpenPositions: 4,
    cooldownAfterLosses: 3,
    slippageEstPct: 0.05,
    tgOnHalt: true,
    tgOnRiskHalt: true,
    maxDdPctRolling: 10,
    ddRollingOn: true,
    maxLossPctWeek: 3,
    maxInstrumentPct: 20,
    maxTotalStopPct: 5,
    // 19.10.2026 (I-719): căldura portofoliului — riscul deschis până la stopuri (reale + Shadow + planul nou) ≤ % din cont; prag prudent, nu optim
    maxHeatPct: 4
  };

  function etDay(ts){
    if (ts != null && (!Number.isFinite(ts) || ts <= 0)) return null;
    if (global.CT && typeof CT.ziNY === 'function') { try { return CT.ziNY(ts); } catch(e){ return null; } } // 27.10 (I-751): ceasul unic
    if (global.CT && typeof CT.etDay === 'function') { try { return CT.etDay(ts); } catch(e){ return null; } }
    try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(ts ? new Date(ts) : new Date()); }
    catch(e){ return new Date(ts || Date.now()).toISOString().slice(0,10); }
  }

  /* 27.10.2026 (I-760): override guvernat. Valorile STRICTE stau în tt_governor_cfg_v1; o limită RELAXATĂ din formular nu intră imediat (exact în
     seara proastă), ci peste 24 h, cu motiv obligatoriu și expirare (1–90 de zile) — stă în tt_governor_override_v1 și se suprapune doar în fereastra ei.
     Strângerea intră imediat și anulează relaxarea de pe aceeași cheie. Direcția „relaxare”: true = valoarea mai MARE relaxează; slippageEstPct invers;
     ddRollingOn oprit = relaxare; alertele Telegram sunt neutre. */
  const OVERRIDE_KEY = 'tt_governor_override_v1', OVERRIDE_MAX = 100, OVERRIDE_INTRA_MS = 24 * 3600000;
  const RELAXARE_CRESTE = { maxLossPctDay: true, maxLossPctWeek: true, maxDdPctRolling: true, maxTradesDay: true, maxOpenPositions: true, cooldownAfterLosses: true, maxInstrumentPct: true, maxTotalStopPct: true, maxHeatPct: true, slippageEstPct: false };
  function relaxeaza(k, de, la){ if (k === 'ddRollingOn') return de === true && la === false; if (!(k in RELAXARE_CRESTE)) return false; return RELAXARE_CRESTE[k] ? la > de : la < de; }
  function stareOverride(o, now){ if (o.anulatLa) return 'anulat'; if (now < o.intraLa) return 'programat'; if (now < o.expiraLa) return 'activ'; return 'expirat'; }
  function overrides(){ const now = Date.now(); return citesteLista(OVERRIDE_KEY).filter(o => o && o.cheia in DEFAULTS && Number.isFinite(o.intraLa) && Number.isFinite(o.expiraLa)).map(o => ({ ...o, stare: stareOverride(o, now) })); }
  function anuleazaOverride(id, motiv){
    const list = citesteLista(OVERRIDE_KEY), o = list.find(x => x && x.id === id);
    if (!o || o.anulatLa) return false;
    o.anulatLa = Date.now(); o.anulatMotiv = String(motiv || 'anulată din formular').slice(0, 200);
    try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(list)); } catch(e){ return false; }
    memo = null; return true;
  }
  let ultimaEroare = null;
  function cfgStrict(){
    let raw = {}, issues = [];
    try {
      raw = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('shape');
    } catch(e){ raw = {}; issues.push('configurație ilizibilă'); }
    const out = Object.assign({}, DEFAULTS, raw);
    delete out.overrides; delete out.capitalNecunoscut; delete out.configIssues;
    if (global.ACCT && typeof ACCT.get === 'function') {
      try { out.accountSize = ACCT.get().value; } catch(e){ issues.push('capital neverificat'); }
      // 27.10.2026 (audit): capitalul „de pornire” (10.000, nescris de om) nu e un capital știut ⇒ bugetele manuale se spun ca neverificate (CAUTION), nu se tac
      try { out.capitalNecunoscut = typeof ACCT.known === 'function' ? !ACCT.known() : false; } catch(e){ out.capitalNecunoscut = true; }
    }
    issues.push(...cfgIssues(out));
    for (const key of cfgIssues(out)) out[key] = DEFAULTS[key];
    return { ...out, configIssues: issues };
  }
  function cfg(){
    const out = cfgStrict(), ov = overrides().filter(o => o.stare === 'activ' || o.stare === 'programat');
    for (const o of ov) if (o.stare === 'activ') { const next = { ...out, [o.cheia]: o.la }; if (!cfgIssues(next).includes(o.cheia)) out[o.cheia] = o.la; }
    out.overrides = ov;
    return out;
  }
  function cfgIssues(c){
    const issues = [];
    for (const k of ['accountSize','maxLossPctDay','maxLossPctWeek','maxDdPctRolling','maxTradesDay','maxOpenPositions','cooldownAfterLosses','slippageEstPct','maxInstrumentPct','maxTotalStopPct','maxHeatPct']) {
      const v=c[k], count=['maxTradesDay','maxOpenPositions','cooldownAfterLosses'].includes(k);
      if (!Number.isFinite(v) || (k==='slippageEstPct'?v<0:v<=0) || v>Number.MAX_SAFE_INTEGER || (count&&!Number.isInteger(v)) || (/Pct/.test(k)&&v>100)) issues.push(k);
    }
    for (const k of ['ddRollingOn','tgOnHalt','tgOnRiskHalt']) if (typeof c[k]!=='boolean') issues.push(k);
    return issues;
  }
  function aparat(){
    const ua = String(global.navigator?.userAgent || '');
    return /Android|iPhone|iPad|Mobile/i.test(ua) ? 'telefon' : /Windows/i.test(ua) ? 'PC' : ua ? 'alt aparat' : 'test';
  }
  function citesteLista(key){ try { const a = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(a) ? a : []; } catch(e){ return []; } }
  function noteazaLimite(before, after){
    const schimbari = [];
    for (const k of Object.keys(DEFAULTS)) if (k !== 'accountSize' && before[k] !== after[k]) schimbari.push({ ts: Date.now(), aparat: aparat(), cheia: k, de: before[k], la: after[k] });
    if (!schimbari.length) return;
    try { localStorage.setItem(LIMITE_KEY, JSON.stringify(citesteLista(LIMITE_KEY).concat(schimbari).slice(-LIMITE_MAX))); } catch(e){}
  }
  function limiteJurnal(){ return citesteLista(LIMITE_KEY); }
  function saveCfg(patch, opts){
    ultimaEroare = null; patch = patch || {}; opts = opts || {};
    const strictBefore = cfgStrict(), efectiv = cfg(), strict = Object.assign({}, strictBefore);
    delete strict.configIssues; delete strict.capitalNecunoscut; delete strict.overrides;
    const motiv = String(opts.motiv == null ? '' : opts.motiv).trim(), zile = Number(opts.expiraZile), amanate = [], stranse = [], coborate = [];
    const activa = (k) => overrides().find(o => o.cheia === k && o.stare === 'activ') || null;
    for (const k of Object.keys(patch)) {
      if (!(k in DEFAULTS)) continue;
      const v = patch[k];
      if (k === 'accountSize') { strict.accountSize = v; continue; }
      if (v === efectiv[k]) continue; // nimic nou față de ce e în vigoare (și valoarea relaxată la vedere în formular)
      /* 27.10.2026 (revizia lotului 2): relaxarea se judecă față de limita STRICTĂ, nu față de cea în vigoare. O valoare mai strânsă decât relaxarea
         activă, dar tot peste limita strictă, coboară relaxarea activă (imediat, aceeași expirare) — nu devine limită permanentă. */
      if (relaxeaza(k, strictBefore[k], v) && !relaxeaza(k, efectiv[k], v) && activa(k)) { if (cfgIssues({ ...strict, [k]: v }).includes(k)) { ultimaEroare = 'Valoare invalidă pentru ' + k + '.'; return null; } coborate.push({ cheia: k, de: efectiv[k], la: v }); continue; }
      if (relaxeaza(k, efectiv[k], v) || relaxeaza(k, strictBefore[k], v)) {
        if (cfgIssues({ ...strict, [k]: v }).includes(k)) { ultimaEroare = 'Valoare invalidă pentru ' + k + '.'; return null; }
        if (!motiv) { ultimaEroare = 'Relaxarea limitei ' + k + ' (' + efectiv[k] + ' → ' + v + ') cere un motiv scris și o expirare în zile; intră abia peste 24 de ore (I-760).'; return null; }
        if (!(Number.isInteger(zile) && zile >= 1 && zile <= 90)) { ultimaEroare = 'Expirarea relaxării trebuie să fie între 1 și 90 de zile.'; return null; }
        amanate.push({ cheia: k, de: efectiv[k], la: v });
      } else { strict[k] = v; stranse.push(k); }
    }
    const probleme = cfgIssues(strict);
    if (probleme.length) { ultimaEroare = 'Limite invalide: ' + probleme.join(', ') + '.'; return null; }
    try { localStorage.setItem(CFG_KEY, JSON.stringify(strict)); } catch(e){ ultimaEroare = 'Salvarea nu a reușit.'; return null; }
    noteazaLimite(strictBefore, strict);
    const now = Date.now(), list = citesteLista(OVERRIDE_KEY);
    const noi = amanate.map(a => ({ id: 'ov_' + now + '_' + Math.random().toString(36).slice(2, 7), ...a, motiv: motiv.slice(0, 500), cerutLa: now, intraLa: now + OVERRIDE_INTRA_MS, expiraLa: now + OVERRIDE_INTRA_MS + zile * 86400000, aparat: aparat(), anulatLa: null }));
    for (const o of list) if (o && !o.anulatLa && now < o.expiraLa && (stranse.includes(o.cheia) || noi.some(n => n.cheia === o.cheia))) { o.anulatLa = now; o.anulatMotiv = stranse.includes(o.cheia) ? 'strângere din formular' : 'înlocuită de o relaxare nouă'; }
    for (const c of coborate) { const o = list.find(x => x && !x.anulatLa && x.cheia === c.cheia && x.intraLa <= now && now < x.expiraLa); if (o) { o.la = c.la; o.coboratLa = now; } }
    if (coborate.length) { try { localStorage.setItem(LIMITE_KEY, JSON.stringify(citesteLista(LIMITE_KEY).concat(coborate.map(c => ({ ts: now, aparat: aparat(), cheia: c.cheia, de: c.de, la: c.la, stare: 'relaxare coborâtă (temporară, aceeași expirare)' }))).slice(-LIMITE_MAX))); } catch(e){} }
    if (stranse.length || noi.length || coborate.length) { try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(list.concat(noi).slice(-OVERRIDE_MAX))); } catch(e){} }
    if (noi.length) { try { localStorage.setItem(LIMITE_KEY, JSON.stringify(citesteLista(LIMITE_KEY).concat(noi.map(n => ({ ts: now, aparat: n.aparat, cheia: n.cheia, de: n.de, la: n.la, stare: 'programata', intraLa: n.intraLa, expiraLa: n.expiraLa, motiv: n.motiv }))).slice(-LIMITE_MAX))); } catch(e){} }
    if (patch.accountSize != null && global.ACCT && typeof ACCT.syncAll === 'function')
      ACCT.syncAll(patch.accountSize, 'governor');
    memo = null;
    return { ...strict, amanate: noi };
  }

  function journalEntries(){
    if (global.JR && typeof JR.all === 'function') return JR.all();
    try { const a = JSON.parse(localStorage.getItem('tt_journal_v1') || '[]'); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }

  function pnlOf(e){
    if (global.JR && typeof JR.pnl === 'function') return JR.pnl(e);
    if (!e || ![e.entry,e.exit,e.size].every(v=>Number.isFinite(v)&&v>0) || (e.fees!=null&&(!Number.isFinite(e.fees)||e.fees<0)) || (e.quoteCurrency&&e.quoteCurrency!=='USD') || /\.[A-Z]{2,}$/.test(e.sym||'')) return null;
    const raw = (e.dir === 'short' ? (e.entry - e.exit) : (e.exit - e.entry)) * e.size;
    const net = raw - (e.fees || 0); return Number.isFinite(net) ? net : null;
  }

  function isToday(e){
    if (!e) return false;
    const day = etDay();
    if (e.openTs && etDay(e.openTs) === day) return true;
    if (e.closeTs && etDay(e.closeTs) === day) return true;
    return false;
  }

  function todayEntries(){
    return journalEntries().filter(isToday);
  }

  function todayTradeCount(){
    const day = etDay();
    const ids = new Set();
    journalEntries().forEach(e => {
      if (!e) return;
      if (e.openTs && etDay(e.openTs) === day) ids.add(e.id);
    });
    return ids.size;
  }

  function openCount(){
    return journalEntries().filter(e => e && (e.status === 'open' || e.exit == null)).length;
  }

  function weekStartDay(){
    const et = etDay();
    const d = new Date(et + 'T12:00:00Z');
    const dow = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() - (dow - 1));
    return d.toISOString().slice(0, 10);
  }

  function weekPnl(){
    const start = weekStartDay();
    return journalEntries()
      .filter(e => e && e.exit != null && Number.isFinite(e.closeTs) && e.closeTs <= Date.now() && etDay(e.closeTs) >= start)
      .reduce((s, e) => { const p = pnlOf(e); return s + (p != null ? p : 0); }, 0);
  }

  // 19.10.2026 (perf, audit Decision App): verificarea rula de 17–30 ori în 20 s (panoul de verdict la 10 s, renderAll de mai multe
  // ori, plus scrierea STATE_KEY la fiecare apel ⇒ eveniment `storage` în celelalte pagini ⇒ alt apel acolo ⇒ ping-pong). Acum:
  // același rezultat cât intrările sunt aceleași (cheile citite, modulele, registrul de execuții, fereastra de 30 s pentru pragurile
  // de timp), iar STATE_KEY se scrie doar când verdictul / cifrele se schimbă. Pragurile și regulile nu se schimbă.
  const INPUT_KEYS = [CFG_KEY, 'tt_account_size_v1', 'tt_account_default_v1', 'tt_equity_snapshots_v1', 'tt_equity_events_v1',
    'tt_trading212_portfolio_v1', 'tt_holdings_theses_v1', 'tt_trading212_cash_v1', 'tt_trading212_account_history_v1',
    'tt_trading212_fills_v1', 'tt_capital_broker_fx_v1', 'tt_journal_settings_v1', 'tt_journal_luna_t212_v1', OPRIRE_KEY, RECONCILIERE_KEY, OVERRIDE_KEY];
  let memo = null, fillsRev = 0, fillsSub = false, lastWritten = null;
  if (typeof global.addEventListener === 'function') global.addEventListener('storage', e => { if (!e || e.key == null || e.key === 'tt_trading212_fills_v1') fillsRev++; });
  function inputs(){
    if (!fillsSub && global.T212FillsStore && typeof T212FillsStore.subscribe === 'function') {
      try { T212FillsStore.subscribe(() => { fillsRev++; }); fillsSub = true; } catch(e){}
    }
    const raw = INPUT_KEYS.map(k => { try { return localStorage.getItem(k); } catch(e){ return null; } });
    let journal = ''; try { journal = JSON.stringify(journalEntries()); } catch(e){ journal = String(Math.random()); }
    return [Math.floor(Date.now() / 30000), fillsRev, journal, global.JR, global.EQ, global.ACCT, global.T212Capital, global.T212Performance, global.T212FillsStore, global.CT].concat(raw);
  }
  const sameInputs = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);
  const copy = o => { try { return typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)); } catch(e){ return o; } };
  function status(){
    const key = inputs();
    if (memo && sameInputs(memo.key, key)) return copy(memo.out);
    const out = computeStatus();
    memo = { key, out };
    return out;
  }

  // 20.10.2026 (I-721): limita lunară de pierdere (I-692, „Setările jurnalului”) intră în verdict: depășită ⇒ HALTED pentru planuri noi; ≥ 75 %,
  // necitită sau mai veche de 3 zile ⇒ CAUTION. Rezultatul lunii e cel scris pe acest aparat de pagina contului / Jurnal (tt_journal_luna_t212_v1);
  // în paginile fără lib/monthly-limit.js se citește aceeași formă direct din stocare (tools/governor-limita-lunara.test.mjs le ține la fel).
  function monthlyState(){
    if (global.MonthlyLimit && typeof MonthlyLimit.stare === 'function') { try { return MonthlyLimit.stare(); } catch(e){ return { stare: 'neverificat', limita: null }; } }
    const rd = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch(e){ return null; } };
    const set = rd('tt_journal_settings_v1'), lim = Number(set && typeof set === 'object' ? set.limitaLuna : NaN);
    if (!(lim > 0)) return { stare: 'nesetat', limita: null };
    const now = Date.now(), luna = etDay(now).slice(0, 7), l = rd('tt_journal_luna_t212_v1'); /* 27.10 (I-751): luna pe ceasul New York, ca ziua și săptămâna */
    if (!l || typeof l !== 'object' || l.luna !== luna || !Number.isFinite(l.rez)) return { stare: 'neverificat', limita: lim, luna };
    const folosit = l.rez < 0 ? (-l.rez / lim) * 100 : 0;
    return { ...l, limita: lim, folosit, vechi: now - l.la > 3 * 86400000, stare: folosit >= 100 ? 'depasit' : folosit >= 75 ? 'aproape' : 'ok' };
  }
  const F1 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), MON = { RON: 'lei', EUR: '€', USD: '$', GBP: '£' };
  const bani = (v, m) => (v < 0 ? '−' : '') + F1.format(Math.abs(v)) + ' ' + (MON[m] || m || '');
  function textLuna(st){
    const luna = st.luna ? new Date(Date.parse(st.luna + '-15T12:00:00Z')).toLocaleDateString('ro-RO', { month: 'long', timeZone: 'UTC' }) : 'luna aceasta';
    const urm = st.luna ? new Date(Date.UTC(+st.luna.slice(0, 4), +st.luna.slice(5, 7), 1)).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', timeZone: 'UTC' }) : 'luna viitoare';
    if (st.stare === 'depasit') return `Limita lunară depășită: ${bani(st.rez, st.moneda)} în ${luna}, limita ${bani(st.limita, st.moneda)} — fără intrări noi până pe ${urm} (regula ta, scrisă dinainte)`;
    if (st.stare === 'aproape') return `Limita lunară: ${F1.format(st.folosit)} % consumat (${bani(st.rez, st.moneda)} din ${bani(st.limita, st.moneda)} în ${luna})`;
    if (st.stare === 'neverificat') return `Limita lunară e pusă (${F1.format(st.limita)}), dar rezultatul lunii nu e citit din execuții pe acest aparat — sincronizează contul sau deschide Jurnal → Raport`;
    return `Limita lunară: rezultatul lunii e din ${new Date(st.la).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' })} (mai vechi de 3 zile) — sincronizează contul`;
  }
  function jurnal(){ return citesteLista(JURNAL_KEY); }
  /* 27.10.2026 — kill switch (contract E → C): { activ, la, motiv, aparat, ordineAnulate:[{id,ticker,stopPrice}], rearmatLa, rearmatMotiv }.
     Cât `activ` e true Governor e HALTED cu motivul; re-armarea se face DOAR de aici (formularul Governor), cu motiv obligatoriu, și lasă istoria scrisă. */
  function citesteObiect(key){ try { const o = JSON.parse(localStorage.getItem(key) || 'null'); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch(e){ return null; } }
  function oprire(){ return citesteObiect(OPRIRE_KEY); }
  function rearmeaza(motiv){
    const m = String(motiv == null ? '' : motiv).trim(), o = oprire();
    if (!m || !o || o.activ !== true) return false;
    try { localStorage.setItem(OPRIRE_KEY, JSON.stringify({ ...o, activ: false, rearmatLa: new Date(Date.now()).toISOString(), rearmatMotiv: m.slice(0, 500), rearmatAparat: aparat() })); } catch(e){ return false; }
    memo = null;
    return true;
  }
  const REARMAT_NOTA_MS = 24 * 3600000, zi = (iso) => { const t = typeof iso === 'number' ? iso : Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'dată necunoscută'; };
  function textOprire(o){
    const n = Array.isArray(o.ordineAnulate) ? o.ordineAnulate.length : 0;
    return `Oprire de urgență („Oprește tot”) activă din ${zi(o.la)} pe ${o.aparat || 'aparat necunoscut'}: ${o.motiv || 'fără motiv scris'} — ${n} ordine anulate; fără intrări noi până la re-armare din formularul Governor, cu motiv`;
  }
  /* reconcilierea zilnică (contract E → C): { la, scope, ok, diferente:[{tip, ticker, app, broker, text}] } ⇒ ok=false ⇒ CAUTION cu lista */
  function reconciliere(){ return citesteObiect(RECONCILIERE_KEY); }
  function textReconciliere(r){
    const d = Array.isArray(r.diferente) ? r.diferente : [], n = d.length;
    return `Reconciliere: ${n} ${n === 1 ? 'diferență' : 'diferențe'} față de Trading 212 (${zi(r.la)}): ${d.map(x => String(x && x.text || '').trim()).filter(Boolean).slice(0, 6).join('; ') || 'fără detalii'}`;
  }
  let lastJurnal = null;
  // revizia 20.10: semnătura compară FORMA motivelor (cifrele înlocuite cu #) — sumele la valoarea de piață se schimbă la fiecare citire a contului și umpleau jurnalul cu dubluri
  const forma = r => String(r).replace(/[−-]?\d[\d.,]*/g, '#');
  function noteazaVerdict(out){
    const motive = out.reasons.slice(0, 4).map(forma), sig = out.verdict + '|' + JSON.stringify(motive) + '|' + (out.monthly && out.monthly.stare || '');
    if (sig === lastJurnal) return;
    const list = citesteLista(JURNAL_KEY), last = list[list.length - 1];
    lastJurnal = sig;
    if (last && last.verdict === out.verdict && JSON.stringify((last.reasons || []).map(forma)) === JSON.stringify(motive) && (last.luna || '') === (out.monthly && out.monthly.stare || '')) return;
    list.push({ ts: Date.now(), day: out.day, verdict: out.verdict, reasons: out.reasons.slice(0, 4), luna: out.monthly ? out.monthly.stare : null });
    try { localStorage.setItem(JURNAL_KEY, JSON.stringify(list.slice(-JURNAL_MAX))); } catch(e){}
  }

  function computeStatus(){
    const c = cfg();
    const day = etDay();
    const entries = journalEntries();
    const invalid = entries.filter(e => !e || !e.id || (global.JR?.validateEntry ? !JR.validateEntry(e).ok : ![e.entry,e.size].every(v=>Number.isFinite(v)&&v>0)) || (e.exit != null && (!Number.isFinite(e.closeTs)||e.closeTs<=0)));
    const duplicateIds = entries.filter(e=>e&&e.id).length - new Set(entries.filter(e=>e&&e.id).map(e=>String(e.id))).size;
    let unreadable=false; try { const a=JSON.parse(localStorage.getItem('tt_journal_v1')||'[]');unreadable=!Array.isArray(a); } catch(e){unreadable=true;}
    const closedToday = entries.filter(e => e && e.exit != null && Number.isFinite(e.closeTs) && e.closeTs <= Date.now() && etDay(e.closeTs) === day);
    const todayPnl = closedToday.reduce((s, e) => { const p = pnlOf(e); return s + (p != null ? p : 0); }, 0);
    const todayTrades = todayTradeCount();
    const maxLossUsd = c.accountSize * (c.maxLossPctDay / 100);
    const maxLossWeekUsd = c.accountSize * ((c.maxLossPctWeek || 3) / 100);
    const wkPnl = weekPnl();
    const weekBudgetUsedPct = maxLossWeekUsd > 0 ? Math.max(0, (-wkPnl / maxLossWeekUsd) * 100) : 0;
    const budgetUsedPct = maxLossUsd > 0 ? Math.max(0, (-todayPnl / maxLossUsd) * 100) : 0;
    const budgetLeftUsd = Math.max(0, maxLossUsd + todayPnl);

    // Streak de pierderi = cooldown pe FEREASTRA RECENTĂ (48h), nu peste tot
    // istoricul: altfel 3 pierderi eșalonate pe zile țineau HALT-ul activ la
    // nesfârșit (până la un câștig), contrazicând „kill switch zilnic".
    let consecutiveLosses = 0;
    const CONSEC_WINDOW_MS = 48 * 3600000;
    const nowMs = Date.now();
    const sorted = journalEntries()
      .filter(e => e && e.exit != null && Number.isFinite(e.closeTs) && e.closeTs <= nowMs)
      .sort((a, b) => (b.closeTs || 0) - (a.closeTs || 0));
    for (const e of sorted){
      if (nowMs - (e.closeTs || 0) > CONSEC_WINDOW_MS) break; // în afara ferestrei → cooldown expirat
      const p = pnlOf(e);
      if (p == null) continue;
      if (p < 0) consecutiveLosses++;
      else break;
    }

    const reasons = [];
    let verdict = 'TRADE';
    const recent = entries.filter(e => e && (e.exit == null || !e.closeTs || Date.now() - e.closeTs <= 7 * 86400000));
    const fxMissing = global.JR && JR.valuationIssues ? JR.valuationIssues(recent).length : recent.filter(e=>e.exit!=null&&pnlOf(e)==null).length;
    if (c.configIssues.length || invalid.length || duplicateIds || unreadable) {
      verdict='HALTED';
      if(c.configIssues.length)reasons.push('Limite Governor invalide: '+c.configIssues.join(', '));
      if(invalid.length||duplicateIds||unreadable)reasons.push('Jurnal neverificat: '+invalid.length+' rânduri invalide, '+duplicateIds+' ID-uri duplicate'+(unreadable?', stocare ilizibilă':''));
    }
    if (c.capitalNecunoscut) { // 27.10.2026 (audit): bugetele zilnice / săptămânale manuale sunt calculate pe valoarea de pornire, nu pe contul lui
      if (verdict === 'TRADE') verdict = 'CAUTION';
      reasons.push('Capital necunoscut: bugetele manuale sunt pe valoarea de pornire ('+Number(c.accountSize).toLocaleString('ro-RO')+' $) — scrie capitalul în Risc & capital sau conectează Trading 212');
    }

    if (todayPnl <= -maxLossUsd){
      verdict = 'HALTED';
      reasons.push(`Pierdere zilnică ${bani(todayPnl, 'USD')} ≥ buget ${bani(-maxLossUsd, 'USD')} (−${c.maxLossPctDay}%)`); /* 27.10 (audit 🟡 10): o singură zecimală */
    } else if (budgetUsedPct >= 75){
      if (verdict === 'TRADE') verdict = 'CAUTION';
      reasons.push(`Buget zilnic consumat ${budgetUsedPct.toFixed(0)}%`);
    }
    if (wkPnl <= -maxLossWeekUsd){
      verdict = 'HALTED';
      reasons.push(`Pierdere săptămână ${bani(wkPnl, 'USD')} ≥ buget ${bani(-maxLossWeekUsd, 'USD')} (−${c.maxLossPctWeek || 3}%)`);
    } else if (weekBudgetUsedPct >= 75){
      if (verdict === 'TRADE') verdict = 'CAUTION';
      reasons.push(`Buget săptămână consumat ${weekBudgetUsedPct.toFixed(0)}%`);
    }
    // 20.10.2026 (I-733): aceeași condiție era scrisă de două ori (CAUTION nu apărea niciodată înaintea HALTED); acum CAUTION la penultimul trade permis
    if (todayTrades >= c.maxTradesDay){
      verdict = 'HALTED'; reasons.push(`Trade-uri azi: ${todayTrades}/${c.maxTradesDay} — max trade-uri/zi atins`);
    } else if (c.maxTradesDay > 1 && todayTrades >= c.maxTradesDay - 1){
      if (verdict === 'TRADE') verdict = 'CAUTION';
      reasons.push(`Trade-uri azi: ${todayTrades}/${c.maxTradesDay} — ultimul permis`);
    }
    const open = openCount();
    if (open >= c.maxOpenPositions){
      verdict = 'HALTED';
      reasons.push(`Poziții deschise: ${open}/${c.maxOpenPositions} — max atins`);
    }
    if (consecutiveLosses >= c.cooldownAfterLosses){
      verdict = 'HALTED';
      reasons.push(`${consecutiveLosses} pierderi consecutive — cooldown activ`);
    }

    let rollingDdPct = null;
    if (c.ddRollingOn && global.EQ && typeof EQ.drawdownStats === 'function'){
      try { rollingDdPct = EQ.drawdownStats().currentDdPct; } catch(e){ verdict='HALTED';reasons.push('Drawdown rolling nu poate fi verificat'); }
      if (rollingDdPct != null && !Number.isFinite(rollingDdPct)) { verdict='HALTED';reasons.push('Drawdown rolling invalid'); }
      if (rollingDdPct >= c.maxDdPctRolling){
        verdict = 'HALTED';
        reasons.push(`DD rolling ${rollingDdPct.toFixed(1)}% ≥ prag ${c.maxDdPctRolling}%`);
      } else if (rollingDdPct >= c.maxDdPctRolling * 0.75){
        if (verdict === 'TRADE') verdict = 'CAUTION';
        reasons.push(`DD rolling ${rollingDdPct.toFixed(1)}% — aproape de prag`);
      }
    }

    if (fxMissing) { verdict = 'HALTED'; reasons.push(fxMissing + ' execuții cu monedă/FX incomplete — bugetul USD nu poate fi verificat'); }
    const broker = global.T212Capital?.read(c) || null;
    if (broker) {
      if (broker.verdict==='HALTED') verdict='HALTED';
      else if (broker.verdict==='CAUTION'&&verdict==='TRADE') verdict='CAUTION';
      reasons.push(...broker.reasons.map(r=>'Invest: '+r));
      // I-722 (20.10.2026): notele contului (ex. MTM neverificat) se văd, dar nu schimbă verdictul
      if (Array.isArray(broker.notes)) reasons.push(...broker.notes.map(r=>'Invest · notă: '+r));
    }
    // I-721 (20.10.2026): limita lunară leagă — depășită ⇒ HALTED; ≥ 75 % / necitită / veche ⇒ CAUTION (nesetată sau ok ⇒ nimic)
    const monthly = monthlyState();
    if (monthly.stare === 'depasit') { verdict = 'HALTED'; reasons.push(textLuna(monthly)); }
    else if (monthly.stare === 'aproape' || monthly.stare === 'neverificat' || (monthly.stare === 'ok' && monthly.vechi)) { if (verdict === 'TRADE') verdict = 'CAUTION'; reasons.push(textLuna(monthly)); }
    // 27.10.2026: kill switch-ul (lotul E scrie, Governor citește) ⇒ HALTED cât e activ; re-armarea de azi rămâne notă 24 h
    const opr = oprire();
    if (opr && opr.activ === true) { verdict = 'HALTED'; reasons.push(textOprire(opr)); }
    else if (opr && opr.activ === false && Number.isFinite(Date.parse(opr.rearmatLa)) && Date.now() - Date.parse(opr.rearmatLa) <= REARMAT_NOTA_MS) reasons.push(`Oprirea de urgență din ${zi(opr.la)} a fost re-armată la ${zi(opr.rearmatLa)}: ${opr.rearmatMotiv || ''}`);
    // 27.10.2026 (I-760): relaxările de limite programate / active se spun în motive (verdictul nu se schimbă — limita în vigoare e deja aplicată mai sus)
    for (const o of c.overrides || []) reasons.push(o.stare === 'activ' ? `Limită relaxată activă: ${o.cheia} ${o.de} → ${o.la} până la ${zi(o.expiraLa)} (${o.motiv})` : `Limită relaxată programată: ${o.cheia} ${o.de} → ${o.la}, intră la ${zi(o.intraLa)}, expiră la ${zi(o.expiraLa)} (${o.motiv})`);
    // 27.10.2026: reconcilierea aplicație ↔ broker; pe calea brokerului o aduce T212Capital („Invest: Reconciliere…”), aici doar când brokerul nu e citit pe aparat
    const rec = broker ? null : reconciliere();
    if (rec && rec.ok === false) { if (verdict === 'TRADE') verdict = 'CAUTION'; reasons.push(textReconciliere(rec)); }
    // I-612 (14.10.2026): jurnal gol + fara Trading 212 => nimic de verificat; „TRADE" ar fi confort fals.
    if (!entries.length && !broker && verdict === 'TRADE') { verdict = 'NEVERIFICAT'; reasons.push('Jurnalul manual e gol și Trading 212 nu e conectat — limitele nu pot fi verificate'); }
    let brokerFx = null;
    if (broker?.state==='ready' && [broker.budgetLeft,broker.weekBudgetLeft,broker.totalStopRisk,broker.stopBudgetLeft].every(Number.isFinite)) {
      if (broker.currency==='USD') brokerFx = 1;
      else { try { brokerFx = global.ACCT && typeof ACCT.fxToUsd === 'function' ? ACCT.fxToUsd(broker.currency) : null; } catch(e){ brokerFx = null; }
        if (!brokerFx) reasons.push('Invest: bugetul în ' + broker.currency + ' nu are curs BCE verificat — „Buget rămas” vine doar din jurnalul manual'); }
    }
    const out = {
      broker, source:broker?'Jurnal manual USD + Trading 212 Invest':'Jurnal manual USD', manualOpenCount:open,
      fxMissing,
      invalidEntries: invalid.length, duplicateIds, unreadable,
      verdict,
      reasons,
      todayPnl,
      todayTrades,
      tradesRemaining: Math.max(0, c.maxTradesDay - todayTrades),
      todayLossPct: c.accountSize > 0 ? (-todayPnl / c.accountSize * 100) : 0,
      maxLossUsd,
      budgetUsedPct,
      // 19.10.2026 (I-700 e): pentru un cont în altă monedă bugetul rămas venea doar din capitalul local (pe PC 12.670 vs 5.393 real);
      // acum aceeași regulă ca în Planuri: minimul cu bugetele brokerului, convertite la cursul BCE verificat de capital-auto.
      budgetLeftUsd:brokerFx?Math.min(budgetLeftUsd,Math.max(0,broker.budgetLeft-broker.totalStopRisk)*brokerFx,Math.max(0,broker.weekBudgetLeft-broker.totalStopRisk)*brokerFx,broker.stopBudgetLeft*brokerFx):budgetLeftUsd,
      budgetSource: brokerFx ? (broker.currency==='USD' ? 'minimul cu Trading 212' : 'minimul cu Trading 212 (' + broker.currency + ' → USD)') : 'jurnal manual',
      weekPnl: wkPnl,
      maxLossWeekUsd,
      weekBudgetUsedPct,
      openCount: broker?.positions??open,
      consecutiveLosses,
      rollingDdPct,
      monthly,
      oprire: opr,
      cfg: c,
      day,
      updatedAt: Date.now()
    };
    try {
      const { updatedAt, ...rest } = out, sig = JSON.stringify(rest);
      if (sig !== lastWritten) { localStorage.setItem(STATE_KEY, JSON.stringify(out)); lastWritten = sig; }
    } catch(e){}
    try { noteazaVerdict(out); } catch(e){}
    return out;
  }

  async function maybeNotifyHalted(s){
    s = s || status();
    if (s.verdict !== 'HALTED' || !s.cfg.tgOnHalt || !global.TG) return false;
    try {
      if (localStorage.getItem(ALERT_KEY) === s.day) return false;
      const ok = await TG.send(
        `🛑 <b>Governor HALTED</b>\nPnL azi: <b>${bani(s.todayPnl, 'USD')}</b>\n${s.reasons.slice(0, 3).join('\n')}`,
        { force: false }
      );
      if (ok) localStorage.setItem(ALERT_KEY, s.day);
      return ok;
    } catch(e){ return false; }
  }

  function canTrade(){
    return ['TRADE','CAUTION'].includes(status().verdict);
  }

  function labelOf(v){
    if (v === 'HALTED') return { text: 'HALTED', cls: 'halted' };
    if (v === 'CAUTION') return { text: 'CAUTION', cls: 'caution' };
    if (v === 'NEVERIFICAT') return { text: 'NEVERIFICAT', cls: 'caution' };
    return { text: 'TRADE', cls: 'trade' };
  }

  global.GV = {
    cfg, saveCfg, status, canTrade, etDay, labelOf, maybeNotifyHalted,
    todayEntries, todayTradeCount, pnlOf, monthlyState, jurnal, limiteJurnal, oprire, rearmeaza, reconciliere, textReconciliere,
    cfgStrict, overrides, anuleazaOverride, relaxeaza, get ultimaEroare(){ return ultimaEroare; },
    CFG_KEY, STATE_KEY, JURNAL_KEY, LIMITE_KEY, OPRIRE_KEY, RECONCILIERE_KEY, OVERRIDE_KEY, DEFAULTS
  };
})(typeof window !== 'undefined' ? window : globalThis);
