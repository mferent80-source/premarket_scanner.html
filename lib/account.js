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
  // Stored with Governor config so existing backup/sync includes the anchor.
  const BASIS_FIELD = '_accountBasis';
  // 18.10.2026: migrate() salvează și valoarea de pornire (10.000) ca să fixeze momentul contabil; semnul ăsta spune că ce e salvat e
  // DOAR valoarea de pornire. Orice capital adevărat (setat, Governor, portofoliu, snapshot, depunere) îl șterge.
  const DEFAULT_FLAG = 'tt_account_default_v1';

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
    const b = getBasis();
    if (b) return { ...b, source: 'account', day: null };
    const g = get();
    return { value: g.value, source: g.source, day: null, ts: null };
  }

  function getBasis(){
    try {
      const c = JSON.parse(localStorage.getItem(GV_KEY) || '{}'), b = c && c[BASIS_FIELD];
      return b && typeof b.id === 'string' && Number.isFinite(b.value) && b.value > 0 &&
        Number.isFinite(b.ts) && b.ts > 0 ? b : null;
    } catch(e){ return null; }
  }
  function captureCutoff(ts){
    const read = key => { try { const a = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(a) ? a : []; } catch(e){ return []; } };
    const identity = (e, time) => e.id ? 'id:' + e.id : 'ts:' + time;
    return {
      trades: read('tt_journal_v1').filter(e => e && e.exit != null && e.closeTs === ts).map(e => identity(e, e.closeTs)),
      capital: read('tt_equity_events_v1').filter(e => e && e.ts === ts).map(e => identity(e, e.ts))
    };
  }
  function newBasis(value){
    const ts = Date.now();
    return { id: 'acct_' + ts + '_' + Math.random().toString(36).slice(2, 9), value, ts,
      mode: 'current', cutoff: captureCutoff(ts), capital: {} };
  }
  function ensureBasis(){
    const b = getBasis();
    if (b) return b;
    return syncAll(get().value, 'migrate') ? getBasis() : null;
  }

  function set(value, note){
    const v = _num(value);
    if (v == null) return null;
    if (!syncAll(v, note || 'account')) return null;
    return { value: v, source: 'account' };
  }

  function syncAll(value, reason, opts){
    const v = _num(value);
    if (v == null) return false;
    opts = opts || {};
    const previous = {};
    const keys = [GV_KEY, KEY, PF_KEY, 'tt_account_sync_ts', 'tt_account_sync_note'];
    try {
      keys.forEach(k => { previous[k] = localStorage.getItem(k); });
      const c = JSON.parse(localStorage.getItem(GV_KEY) || 'null') || {};
      c.accountSize = v;
      // Settings forms submit accountSize even when only another limit changed.
      // A fresh snapshot is authoritative even if its total happens to be unchanged.
      const keep = /^capital-|^migrate/.test(String(reason || '')) ||
        (reason !== 'snapshot' && v === get().value);
      c[BASIS_FIELD] = opts.basis || (keep && getBasis()) || newBasis(v);
      // 19.10.2026: PF_KEY e sincronizată între aparate; migrate() (la fiecare deschidere a Jurnalului) rescria peste ea capitalul LOCAL
      // ⇒ telefonul și PC-ul își suprascriau cifra (conflict de sincronizare). Acum migrate() o completează doar când lipsește și doar cu
      // un capital adevărat (nu cu 10.000 de pornire); orice scriere adevărată (snapshot, Portofoliu, Governor, depunere) o actualizează.
      const mirror = !/^migrate/.test(String(reason || '')) ||
        (_num(localStorage.getItem(PF_KEY)) == null && get().source !== 'default' && localStorage.getItem(DEFAULT_FLAG) !== '1');
      localStorage.setItem(GV_KEY, JSON.stringify(c));
      localStorage.setItem(KEY, String(v));
      if (mirror) localStorage.setItem(PF_KEY, String(v));
      localStorage.setItem('tt_account_sync_ts', String(Date.now()));
      if (reason) localStorage.setItem('tt_account_sync_note', String(reason));
      if (!/^migrate/.test(String(reason || ''))) localStorage.removeItem(DEFAULT_FLAG);
    } catch(e){
      keys.forEach(k => { try {
        if (!(k in previous)) return;
        if (previous[k] == null) localStorage.removeItem(k);
        else localStorage.setItem(k, previous[k]);
      } catch(ignored){} });
      return false;
    }
    try { if (global.CD && typeof CD.notifyChange === 'function') CD.notifyChange(); } catch(e){}
    return true;
  }

  function adjustForCapitalEvent(kind, amountUsd, eventId){
    const amt = _num(amountUsd);
    if (!amt) return false;
    const cur = get().value;
    const next = kind === 'withdraw' ? cur - amt : cur + amt;
    if (!(next > 0)) return false;
    const basis = ensureBasis();
    if (!basis) return false;
    const updated = { ...basis, capital: { ...(basis.capital || {}) } };
    if (eventId) updated.capital[eventId] = kind === 'withdraw' ? -amt : amt;
    return syncAll(next, kind === 'withdraw' ? 'capital-withdraw' : 'capital-deposit', { basis: updated });
  }
  function reverseCapitalEvents(ids){
    const basis = getBasis();
    if (!basis) return true; // Legacy history does not prove which totals were adjusted.
    const capital = { ...(basis.capital || {}) };
    let delta = 0, changed = false;
    ids.forEach(id => {
      if (Object.prototype.hasOwnProperty.call(capital, id) && Number.isFinite(capital[id])) {
        delta += capital[id];
        changed = true;
      }
      delete capital[id];
    });
    if (!changed) return true;
    const next = get().value - delta;
    return next > 0 && syncAll(next, 'capital-remove', { basis: { ...basis, capital } });
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
    try { if (g.source === 'default') localStorage.setItem(DEFAULT_FLAG, '1'); } catch (e) {}
    // Establish the opening timestamp before the first new execution, even
    // when the user starts with the default account size.
    syncAll(g.value, 'migrate');
    return g;
  }

  // 18.10.2026 (revizia Jurnalului): 10.000 e doar valoarea de pornire (source 'default'), nu capitalul contului — paginile
  // întreabă known() înainte să afișeze sau să precompleteze o sumă
  function known(){ if (get().source === 'default') return false; try { return localStorage.getItem(DEFAULT_FLAG) !== '1'; } catch (e) { return true; } }

  global.ACCT = { known,
    get, getBaseline, getBasis, ensureBasis, set, syncAll, adjustForCapitalEvent, reverseCapitalEvents,
    divergences, migrate, firstSnapshotEquity, lastSnapshotEquity,
    KEY, PF_KEY
  };
})(typeof window !== 'undefined' ? window : globalThis);
