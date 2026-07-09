// ═══════════════════════════════════════════════════════════════════
// shadow.js — Shadow Book: semnale blocate / ratate, atribuire filtre (SH.*)
// Schema tt_shadow_book_v1: [{ id, sym, dir, price, sl, blockedBy, reason, src, ts, day,
//   evalPct?, evalR?, evalTs? }]
// Folosire: SH.log({...}); SH.all(); SH.statsByFilter();
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';
  const KEY = 'tt_shadow_book_v1';
  const MAX = 800;

  function etDay(ts){
    try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(ts ? new Date(ts) : new Date()); }
    catch(e){ return new Date(ts || Date.now()).toISOString().slice(0,10); }
  }

  function all(){
    try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }
  function save(arr){
    try { localStorage.setItem(KEY, JSON.stringify(arr)); return true; } catch(e){ return false; }
  }

  function log(e){
    const sym = String(e.sym || '').trim().toUpperCase();
    const price = parseFloat(e.price);
    if (!sym || !(price > 0)) return null;
    const rec = {
      id: 'sh_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      sym,
      dir: e.dir === 'short' ? 'short' : 'long',
      price,
      sl: e.sl != null ? parseFloat(e.sl) : null,
      blockedBy: String(e.blockedBy || 'unknown'),
      reason: String(e.reason || ''),
      src: String(e.src || 'manual'),
      ts: e.ts || Date.now(),
      day: etDay(e.ts),
      evalPct: null,
      evalR: null,
      evalTs: null,
      horizon: e.horizon || 5
    };
    const arr = all();
    arr.unshift(rec);
    while (arr.length > MAX) arr.pop();
    return save(arr) ? rec : null;
  }

  function updateEval(id, evalPct, evalR){
    const arr = all();
    const i = arr.findIndex(x => x && x.id === id);
    if (i < 0) return false;
    arr[i] = Object.assign({}, arr[i], { evalPct, evalR, evalTs: Date.now() });
    return save(arr);
  }

  // ingestLedgerAsTaken — semnale luate din ledger ca grup de comparație
  function ledgerTaken(){
    if (!global.LEDGER) return [];
    return LEDGER.all();
  }

  function simReturn(entry, exit, dir){
    if (!(entry > 0) || !(exit > 0)) return null;
    return dir === 'short' ? (entry - exit) / entry * 100 : (exit - entry) / entry * 100;
  }

  function simR(entry, exit, sl, dir, size){
    size = size || 1;
    if (sl == null || !(sl > 0)) return null;
    const pnl = dir === 'short' ? (entry - exit) * size : (exit - entry) * size;
    const r0 = Math.abs(entry - sl) * size;
    return r0 > 0 ? pnl / r0 : null;
  }

  // statsByFilter — agregat pe blockedBy; evalPct/evalR din evaluare sau estimate
  function statsByFilter(entries){
    entries = entries || all();
    const groups = {};
    entries.forEach(e => {
      const k = e.blockedBy || '?';
      (groups[k] = groups[k] || []).push(e);
    });
    const out = {};
    Object.keys(groups).forEach(k => {
      const g = groups[k];
      const evals = g.filter(x => x.evalPct != null);
      const rs = g.filter(x => x.evalR != null);
      out[k] = {
        n: g.length,
        nEval: evals.length,
        avgPct: evals.length ? evals.reduce((s, x) => s + x.evalPct, 0) / evals.length : null,
        avgR: rs.length ? rs.reduce((s, x) => s + x.evalR, 0) / rs.length : null,
        hitPct: evals.length ? evals.filter(x => x.evalPct > 0).length / evals.length * 100 : null,
        small: g.length < 10
      };
    });
    return out;
  }

  function statsTaken(){
    return { n: ledgerTaken().length, note: 'Semnale luate în ledger — comparație brută, fără SL simulat' };
  }

  // evaluateOne — bare Yahoo, forward close la horizon zile trading
  async function evaluateOne(id, fetchStock){
    const e = all().find(x => x && x.id === id);
    if (!e || !fetchStock) return null;
    try {
      const bars = await fetchStock(e.sym, { range: '3mo', interval: '1d', ttl: 3600 });
      const entryTs = e.ts;
      const after = bars.filter(b => b.t >= entryTs);
      const h = Math.min(e.horizon || 5, after.length);
      if (!h) return null;
      const exitBar = after[h - 1] || after[after.length - 1];
      const evalPct = simReturn(e.price, exitBar.c, e.dir);
      const evalR = simR(e.price, exitBar.c, e.sl, e.dir, 1);
      updateEval(id, evalPct, evalR);
      return { evalPct, evalR };
    } catch(err){ return null; }
  }

  async function evaluateAll(fetchStock, onProgress){
    const pending = all().filter(x => x.evalPct == null);
    let done = 0;
    for (const e of pending){
      await evaluateOne(e.id, fetchStock);
      done++;
      if (onProgress) onProgress(done, pending.length);
      await new Promise(r => setTimeout(r, 120));
    }
    return done;
  }

  function remove(id){
    return save(all().filter(x => x && x.id !== id));
  }

  global.SH = {
    all, log, save, updateEval, statsByFilter, statsTaken, evaluateOne, evaluateAll,
    remove, ledgerTaken, KEY, simReturn, simR
  };
})(typeof window !== 'undefined' ? window : globalThis);