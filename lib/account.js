// ═══════════════════════════════════════════════════════════════════
// account.js — sursă unică mărime cont (ACCT.*) — I-087 / I-145
// get() = cont CURENT pentru risc/Governor/Portfolio %
// getBaseline() = primul snapshot (curbă equity) — NU pentru sizing
// Prioritate get(): tt_account_size_v1 > ultim snapshot > GV cfg > prim snapshot > default
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';
  const KEY = 'tt_account_size_v1';
  const PF_KEY = 'tt_pf_account';
  const GV_KEY = 'tt_governor_cfg_v1';
  const SNAP_KEY = 'tt_equity_snapshots_v1';
  const MIGRATE_FLAG = 'tt_acct_migrate_v572';

  function _num(v){ const n = parseFloat(v); return isFinite(n) && n > 0 ? n : null; }

  function snapshots(){
    try {
      const a = JSON.parse(localStorage.getItem(SNAP_KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }

  function firstSnapshotEquity(){
    const a = snapshots();
    if (!a.length) return null;
    const s = a.slice().sort((x, y) => x.ts - y.ts)[0];
    return s && _num(s.equity);
  }

  function lastSnapshotEquity(){
    const a = snapshots();
    if (!a.length) return null;
    const s = a.slice().sort((x, y) => y.ts - x.ts)[0];
    return s && _num(s.equity);
  }

  function get(){
    try {
      const v = _num(localStorage.getItem(KEY));
      if (v != null) return { value: v, source: 'account' };
    } catch (e) {}
    const last = lastSnapshotEquity();
    if (last != null) return { value: last, source: 'snapshot-last' };
    try {
      const c = JSON.parse(localStorage.getItem(GV_KEY) || 'null');
      const v = c && _num(c.accountSize);
      if (v != null) return { value: v, source: 'governor' };
    } catch (e) {}
    const first = firstSnapshotEquity();
    if (first != null) return { value: first, source: 'snapshot-first' };
    return { value: 10000, source: 'default' };
  }

  function getBaseline(){
    const a = snapshots();
    if (a.length) {
      const s = a.slice().sort((x, y) => x.ts - y.ts)[0];
      if (s && _num(s.equity)) {
        return { value: s.equity, source: 'snapshot', day: s.day || null, ts: s.ts };
      }
    }
    const g = get();
    return { value: g.value, source: g.source, day: null, ts: null };
  }

  function set(value, note){
    const v = _num(value);
    if (v == null) return null;
    try { localStorage.setItem(KEY, String(v)); } catch (e) { return null; }
    syncAll(v, note || 'account');
    return { value: v, source: 'account' };
  }

  function syncAll(value, reason){
    const v = _num(value);
    if (v == null) return false;
    try { localStorage.setItem(KEY, String(v)); } catch (e) {}
    try { localStorage.setItem(PF_KEY, String(v)); } catch (e) {}
    try {
      const c = JSON.parse(localStorage.getItem(GV_KEY) || 'null') || {};
      c.accountSize = v;
      localStorage.setItem(GV_KEY, JSON.stringify(c));
    } catch (e) {}
    try {
      localStorage.setItem('tt_account_sync_ts', String(Date.now()));
      if (reason) localStorage.setItem('tt_account_sync_note', String(reason));
    } catch (e) {}
    if (global.CD && typeof CD.notifyChange === 'function') CD.notifyChange();
    return true;
  }

  function adjustForCapitalEvent(kind, amountUsd){
    const amt = _num(amountUsd);
    if (!amt) return false;
    const cur = get().value;
    const next = kind === 'withdraw' ? cur - amt : cur + amt;
    if (!(next > 0)) return false;
    return syncAll(next, kind === 'withdraw' ? 'capital-withdraw' : 'capital-deposit');
  }

  function divergences(){
    const canon = get().value;
    const out = [];
    try {
      const pf = _num(localStorage.getItem(PF_KEY));
      if (pf != null && Math.abs(pf - canon) / canon > 0.01) {
        out.push({ where: 'portfolio', value: pf, delta: pf - canon });
      }
    } catch (e) {}
    try {
      const c = JSON.parse(localStorage.getItem(GV_KEY) || 'null');
      const gv = c && _num(c.accountSize);
      if (gv != null && Math.abs(gv - canon) / canon > 0.01) {
        out.push({ where: 'governor', value: gv, delta: gv - canon });
      }
    } catch (e) {}
    const last = lastSnapshotEquity();
    if (last != null && Math.abs(last - canon) / canon > 0.02) {
      out.push({ where: 'snapshot-last', value: last, delta: last - canon });
    }
    return out;
  }

  function migrate(){
    try {
      if (localStorage.getItem(MIGRATE_FLAG) !== '1') {
        const keyVal = _num(localStorage.getItem(KEY));
        if (keyVal == null) {
          const last = lastSnapshotEquity();
          if (last != null) syncAll(last, 'migrate-v572-last-snap');
          else {
            const first = firstSnapshotEquity();
            if (first != null) syncAll(first, 'migrate-v572-first-snap');
          }
        }
        localStorage.setItem(MIGRATE_FLAG, '1');
      }
    } catch (e) {}
    const g = get();
    if (g.source !== 'default') syncAll(g.value, 'migrate');
    return g;
  }

  global.ACCT = {
    get, getBaseline, set, syncAll, adjustForCapitalEvent,
    divergences, migrate, firstSnapshotEquity, lastSnapshotEquity,
    KEY, PF_KEY
  };
})(typeof window !== 'undefined' ? window : globalThis);