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
  // 19.10.2026 (I-700): chei LOCALE (nesincronizate). SET_KEY = când a fost pus capitalul de-adevăratelea (migrate() la fiecare deschidere
  // nu contează); BROKER_FX_KEY = cursul BCE verificat de capital-auto (USD pentru 1 unitate din moneda contului Trading 212).
  const SET_KEY = 'tt_account_set_v1';
  const BROKER_FX_KEY = 'tt_capital_broker_fx_v1';
  const PORTFOLIO_KEY = 'tt_trading212_portfolio_v1';
  const HOUR = 3600000, DAY = 24 * HOUR;

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
    const keys = [GV_KEY, KEY, PF_KEY, 'tt_account_sync_ts', 'tt_account_sync_note', SET_KEY];
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
      // 19.10.2026 (I-700): vechimea capitalului. Depunerea/retragerea schimbă suma, dar nu o verifică ⇒ păstrează ora; migrate nu o atinge.
      const why = String(reason || '');
      if (/^capital-/.test(why)) {
        const prev = setStamp();
        if (prev) localStorage.setItem(SET_KEY, JSON.stringify({ ...prev, value: v }));
      } else if (!/^migrate/.test(why)) localStorage.setItem(SET_KEY, JSON.stringify({ ts: Date.now(), reason: why || 'account', value: v }));
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

  // 19.10.2026 (I-700): ref = capitalul folosit (poate veni din Trading 212); fără ref, capitalul local, ca înainte
  function divergences(ref){
    const canon = _num(ref) || get().value;
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

  // ── 19.10.2026 (I-700): capitalul FOLOSIT la dimensionare, cu sursa și vechimea la vedere ─────────────────────────────────
  // Pe PC capitalul local (12.670, din iulie) dimensiona Drafturile de 2,35× peste contul real (5.393 în Trading 212).
  function setStamp(){
    try { const s = JSON.parse(localStorage.getItem(SET_KEY) || 'null'); return s && Number.isFinite(s.ts) && s.ts > 0 && _num(s.value) ? s : null; }
    catch (e) { return null; }
  }
  function saveBrokerFx(currency, rate, date){
    if (!/^[A-Z]{3}$/.test(String(currency || '')) || !_num(rate)) return false;
    try { localStorage.setItem(BROKER_FX_KEY, JSON.stringify({ currency, rate: +rate, date: date || null, checkedAt: Date.now() })); return true; }
    catch (e) { return false; }
  }
  /** USD pentru 1 unitate din `currency`, din cursul BCE verificat de capital-auto (cel mult 5 zile, ca valabilitatea BCE); altfel null. */
  function fxToUsd(currency, now){
    if (currency === 'USD') return 1;
    now = Number.isFinite(now) ? now : Date.now();
    try {
      const x = JSON.parse(localStorage.getItem(BROKER_FX_KEY) || 'null');
      return x && x.currency === currency && _num(x.rate) && Number.isFinite(x.checkedAt) && x.checkedAt <= now + 60000 && now - x.checkedAt <= 5 * DAY ? x.rate : null;
    } catch (e) { return null; }
  }
  /** Ultima citire Trading 212 (cont live), în USD când cursul e cunoscut. */
  function brokerCapital(now){
    let a = null;
    try {
      const T = global.T212Snapshot;
      if (T && typeof T.read === 'function') a = (T.read('live') || [])[1] || null;
      else {
        const d = JSON.parse(localStorage.getItem(PORTFOLIO_KEY) || '{}');
        const xs = d && typeof d === 'object' && !Array.isArray(d) ? Object.values(d).filter(x => x && x.environment === 'live') : [];
        xs.sort((x, y) => Number(y.active === true) - Number(x.active === true) || (Date.parse(y.fetchedAt) || 0) - (Date.parse(x.fetchedAt) || 0));
        a = xs[0] || null;
      }
    } catch (e) { a = null; }
    const total = Number(a && a.summary && a.summary.totalValue), currency = String((a && a.summary && a.summary.currency) || ''), at = Date.parse(a && a.fetchedAt);
    if (!(total > 0) || !/^[A-Z]{3}$/.test(currency) || !Number.isFinite(at) || at > now + 60000) return null;
    const rate = fxToUsd(currency, now);
    return { total, currency, at, rate, value: rate ? Math.round(total * rate * 100) / 100 : null };
  }
  const _fmt = (v) => { try { return new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(v); } catch (e) { return String(Math.round(v)); } };
  function _age(h){
    if (h == null) return 'vechime necunoscută';
    if (h < 1) return 'acum ' + Math.max(1, Math.round(h * 60)) + ' min';
    if (h < 48) return 'acum ' + Math.round(h) + ' h';
    return 'acum ' + Math.round(h / 24) + ' zile';
  }
  const SOURCE_LABEL = { broker: 'Trading 212', snapshot: 'snapshot', manual: 'setat de mână', governor: 'limitele Governor', default: 'necunoscut' };
  /** CONTRACT (folosit și în Planuri): { value, source, at, ageHours, synced, diverges, text } (+ stale, broker).
      source: 'broker' (citire Trading 212 < 24 h) | 'snapshot' | 'manual' | 'governor' | 'default' (fără capital cunoscut, value null). */
  function capitalInfo(opts){
    const now = opts && Number.isFinite(opts.now) ? opts.now : Date.now();
    let synced = null;
    try { synced = _num(localStorage.getItem(PF_KEY)); } catch (e) {}
    const b = brokerCapital(now);
    let value = null, source = 'default', at = null;
    if (b && b.value != null && now - b.at <= DAY) { value = b.value; source = 'broker'; at = b.at; }
    else if (known()) {
      const g = get(), stamp = setStamp(), same = (x) => _num(x) && Math.abs(x - g.value) / g.value <= 0.005;
      const snaps = snapshots().filter(s => s && _num(s.equity) && Number.isFinite(s.ts)).sort((x, y) => y.ts - x.ts);
      value = g.value;
      if (g.source === 'snapshot-last' || g.source === 'snapshot-first') {
        const s = g.source === 'snapshot-last' ? snaps[0] : snaps[snaps.length - 1];
        source = 'snapshot'; at = s ? s.ts : null;
      } else if (stamp && same(stamp.value)) {
        source = stamp.reason === 'snapshot' ? 'snapshot' : 'manual'; at = stamp.ts;
      } else if (snaps[0] && same(snaps[0].equity)) {
        source = 'snapshot'; at = snaps[0].ts;
      } else source = g.source === 'governor' ? 'governor' : 'manual';
    }
    const ageHours = at != null ? Math.max(0, (now - at) / HOUR) : null;
    const d = value != null ? divergences(value).find(x => x.where === 'portfolio') : null;
    const diverges = value != null ? !!d : synced != null;
    // peste 7 zile (sau vechime necunoscută) fără o citire Trading 212 proaspătă: capitalul nu e verificat ⇒ fără GO
    const stale = source !== 'broker' && (value == null || ageHours == null || ageHours > 7 * 24);
    let text = value != null
      ? 'Capital folosit: ' + _fmt(value) + ' $ · ' + SOURCE_LABEL[source] + ' · ' + _age(ageHours)
      : 'Capital folosit: necunoscut — conectează Trading 212 sau pune un snapshot';
    if (diverges && synced != null) text += ' · pe celălalt aparat ' + _fmt(synced) + ' $';
    return { value, source, at, ageHours, synced, diverges, text, stale,
      broker: b ? { value: b.value, total: b.total, currency: b.currency, at: b.at, fresh: now - b.at <= DAY, fx: b.rate } : null };
  }

  global.ACCT = { known, capitalInfo, fxToUsd, saveBrokerFx, setStamp,
    get, getBaseline, getBasis, ensureBasis, set, syncAll, adjustForCapitalEvent, reverseCapitalEvents,
    divergences, migrate, firstSnapshotEquity, lastSnapshotEquity,
    KEY, PF_KEY
  };
})(typeof window !== 'undefined' ? window : globalThis);
