// ═══════════════════════════════════════════════════════════════════
// account.js — sursă unică mărime cont (ACCT.*) — I-087
// Prioritate: primul snapshot equity > tt_account_size_v1 > GV cfg > 10000
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';
  const KEY = 'tt_account_size_v1';
  const PF_KEY = 'tt_pf_account';
  const GV_KEY = 'tt_governor_cfg_v1';
  const SNAP_KEY = 'tt_equity_snapshots_v1';

  function _num(v){ const n = parseFloat(v); return isFinite(n) && n > 0 ? n : null; }

  function firstSnapshotEquity(){
    try {
      const a = JSON.parse(localStorage.getItem(SNAP_KEY) || '[]');
      if (!Array.isArray(a) || !a.length) return null;
      const s = a.slice().sort((x, y) => x.ts - y.ts)[0];
      return s && _num(s.equity);
    } catch(e){ return null; }
  }

  function get(){
    const snap = firstSnapshotEquity();
    if (snap != null) return { value: snap, source: 'snapshot' };
    try {
      const v = _num(localStorage.getItem(KEY));
      if (v != null) return { value: v, source: 'account' };
    } catch(e){}
    try {
      const c = JSON.parse(localStorage.getItem(GV_KEY) || 'null');
      const v = c && _num(c.accountSize);
      if (v != null) return { value: v, source: 'governor' };
    } catch(e){}
    return { value: 10000, source: 'default' };
  }

  function set(value, note){
    const v = _num(value);
    if (v == null) return null;
    try { localStorage.setItem(KEY, String(v)); } catch(e){ return null; }
    syncAll(v, note || 'account');
    return { value: v, source: 'account' };
  }

  function syncAll(value, reason){
    const v = _num(value);
    if (v == null) return false;
    try { localStorage.setItem(KEY, String(v)); } catch(e){}
    try { localStorage.setItem(PF_KEY, String(v)); } catch(e){}
    try {
      const c = JSON.parse(localStorage.getItem(GV_KEY) || 'null') || {};
      c.accountSize = v;
      localStorage.setItem(GV_KEY, JSON.stringify(c));
    } catch(e){}
    try {
      localStorage.setItem('tt_account_sync_ts', String(Date.now()));
      if (reason) localStorage.setItem('tt_account_sync_note', String(reason));
    } catch(e){}
    return true;
  }

  function divergences(){
    const canon = get().value;
    const out = [];
    try {
      const pf = _num(localStorage.getItem(PF_KEY));
      if (pf != null && Math.abs(pf - canon) / canon > 0.01) out.push({ where: 'portfolio', value: pf, delta: pf - canon });
    } catch(e){}
    try {
      const c = JSON.parse(localStorage.getItem(GV_KEY) || 'null');
      const gv = c && _num(c.accountSize);
      if (gv != null && Math.abs(gv - canon) / canon > 0.01) out.push({ where: 'governor', value: gv, delta: gv - canon });
    } catch(e){}
    return out;
  }

  function migrate(){
    const g = get();
    if (g.source !== 'default') syncAll(g.value, 'migrate');
    return g;
  }

  global.ACCT = { get, set, syncAll, divergences, migrate, KEY, PF_KEY };
})(typeof window !== 'undefined' ? window : globalThis);