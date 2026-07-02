// ═══════════════════════════════════════════════════════════════════
// journal.js — Jurnal de EXECUȚII reale, partajat (JR.*)
// Sursa de adevăr despre banii reali: fills închise cu fees, sursa semnalului,
// tag-uri de greșeli și regimul zilei — NU planuri (alea stau în trade_plans_v1)
// și NU semnale (alea stau în lib/ledger.js).
//
// Schema tt_journal_v1: [{ id, sym, dir:'long'|'short', entry, exit, size,
//   fees (USD total, manual — Trade212 e „zero comision" dar are spread/FX),
//   slAtEntry (pt R-multiple; null = R necalculabil), openTs, closeTs,
//   source ('stl'|'nasdaq'|'macro'|'watchlist'|'events'|'pump'|'manual'|'tracker'),
//   tags: ['fomo','chase','early-exit','late-exit','no-plan','revenge','good-exec',...],
//   regime (label md_risk_regime la momentul închiderii, '?' dacă lipsea),
//   notes, srcId (id-ul din trade_plans_v1 la import — anti-duplicat) }]
//
// Folosire: <script src="../lib/journal.js"></script>
//   JR.add({...}); JR.all(); JR.stats(JR.all()); JR.statsBy(JR.all(), 'source')
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';
  const KEY = 'tt_journal_v1';

  function all(){
    try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }
  function save(arr){
    try { localStorage.setItem(KEY, JSON.stringify(arr)); return true; } catch(e){ return false; }
  }
  function _regimeNow(){
    try { const r = JSON.parse(localStorage.getItem('md_risk_regime') || 'null'); return (r && r.label) ? String(r.label).trim() : '?'; }
    catch(e){ return '?'; }
  }
  function _num(v){ const n = parseFloat(v); return isFinite(n) ? n : null; }

  // add — validează minimul (sym, entry, size); exit GOL = execuție ÎN CURS (status 'open').
  // Regimul se capturează la ADĂUGARE (= la intrare pt cele în curs) — exact ce vrem să știm.
  function add(e){
    const sym = String(e.sym || '').trim().toUpperCase();
    const entry = _num(e.entry), exit = _num(e.exit), size = _num(e.size);
    if (!sym || entry == null || size == null || entry <= 0 || size <= 0) return null;
    const isOpen = exit == null;
    const rec = {
      id: 'j_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      sym, dir: e.dir === 'short' ? 'short' : 'long',
      entry, exit, size,
      status: isOpen ? 'open' : 'closed',
      fees: _num(e.fees) || 0,
      slAtEntry: _num(e.slAtEntry),
      openTs: e.openTs || (isOpen ? Date.now() : null),
      closeTs: isOpen ? null : (e.closeTs || Date.now()),
      source: e.source || 'manual',
      tags: Array.isArray(e.tags) ? e.tags.filter(Boolean) : [],
      regime: e.regime || _regimeNow(),
      notes: String(e.notes || ''),
      srcId: e.srcId || null
    };
    const arr = all();
    arr.unshift(rec);
    return save(arr) ? rec : null;
  }
  // isOpen — și pe intrări vechi fără câmpul status (exit lipsă = deschisă)
  function isOpen(e){ return !!e && (e.status === 'open' || e.exit == null); }
  // close — completează exit-ul unei execuții în curs (fees/tags se pot edita după)
  function close(id, exitPrice, closeTs){
    const exit = _num(exitPrice);
    if (exit == null || exit <= 0) return false;
    return update(id, { exit, status: 'closed', closeTs: closeTs || Date.now() });
  }
  function update(id, patch){
    const arr = all();
    const i = arr.findIndex(x => x && x.id === id);
    if (i < 0) return false;
    arr[i] = Object.assign({}, arr[i], patch, { id });
    return save(arr);
  }
  function remove(id){
    const arr = all().filter(x => x && x.id !== id);
    return save(arr);
  }

  // PnL NET per execuție: direcțional, minus fees. Semnal ≠ execuție — astea-s fill-uri reale.
  // null pentru execuțiile ÎN CURS (fără exit) — PnL-ul lor „live" e treaba Portfolio-ului, nu a jurnalului.
  function pnl(e){
    if (e.exit == null) return null;
    const raw = (e.dir === 'short' ? (e.entry - e.exit) : (e.exit - e.entry)) * e.size;
    return raw - (e.fees || 0);
  }
  // R-multiple: pnl / riscul inițial (|entry − slAtEntry| × size).
  // null dacă SL la intrare lipsește SAU execuția e în curs (null/r0 ar da 0 în JS — capcană!).
  function rMult(e){
    if (e.slAtEntry == null || e.exit == null) return null;
    const r0 = Math.abs(e.entry - e.slAtEntry) * e.size;
    return r0 > 0 ? pnl(e) / r0 : null;
  }

  // stats — agregat ONEST pe un set de execuții:
  //   n, wins, winPct, pnlNet, pf (profit factor), avgWin, avgLoss,
  //   expectancyR (DOAR pe execuțiile cu R calculabil; nR = câte au R), small (n<10 = zgomot)
  function stats(entries){
    entries = (entries || []).filter(e => e && e.exit != null); // statistica = DOAR închise
    const n = entries.length;
    if (!n) return { n: 0 };
    let wins = 0, gw = 0, gl = 0, tot = 0;
    const rs = [];
    entries.forEach(e => {
      const p = pnl(e);
      tot += p;
      if (p > 0){ wins++; gw += p; } else { gl += -p; }
      const r = rMult(e);
      if (r != null) rs.push(r);
    });
    const losses = n - wins;
    return {
      n, wins, losses,
      winPct: wins / n * 100,
      pnlNet: tot,
      pf: gl > 0 ? gw / gl : (gw > 0 ? Infinity : 0),
      avgWin: wins ? gw / wins : 0,
      avgLoss: losses ? gl / losses : 0,
      expectancyR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
      nR: rs.length,
      small: n < 10  // sub 10 = eșantion insuficient, zgomot (trader.md)
    };
  }
  // statsBy — segmentat pe un câmp ('source' | 'regime') sau pe tag ('__tags')
  function statsBy(entries, field){
    const groups = {};
    entries.forEach(e => {
      const keys = field === '__tags' ? (e.tags && e.tags.length ? e.tags : ['(fără tag)']) : [e[field] || '?'];
      keys.forEach(k => { (groups[k] = groups[k] || []).push(e); });
    });
    const out = {};
    Object.keys(groups).forEach(k => { out[k] = stats(groups[k]); });
    return out;
  }

  // importFromTracker — aduce execuțiile ÎNCHISE (win/loss cu exit) din trade_plans_v1.
  // Read-only pe tracker; anti-duplicat pe srcId. fees=0 la import (trackerul nu le are) — marcat.
  function importFromTracker(){
    let plans = [];
    try { plans = JSON.parse(localStorage.getItem('trade_plans_v1') || '[]') || []; } catch(e){}
    const have = new Set(all().map(x => x.srcId).filter(Boolean));
    let added = 0, skipped = 0;
    plans.forEach(p => {
      if (!p || p.status === 'open') return;
      if (have.has(p.id)) { skipped++; return; }
      const exit = _num(p.exit);
      if (exit == null){ skipped++; return; } // închis fără preț de ieșire → nu putem jurnaliza onest
      const rec = add({
        sym: p.ticker, dir: p.dir === 'short' ? 'short' : 'long',
        entry: p.entry, exit, size: p.size, fees: 0,
        slAtEntry: p.sl, openTs: p.opened || null, closeTs: p.closed || Date.now(),
        source: 'tracker', tags: [], notes: (p.notes || '') + ' [import tracker, fees=0 — completează]',
        srcId: p.id
      });
      if (rec) added++;
    });
    return { added, skipped };
  }

  global.JR = { all, save, add, update, remove, isOpen, close, pnl, rMult, stats, statsBy, importFromTracker, KEY };
})(typeof window !== 'undefined' ? window : globalThis);
