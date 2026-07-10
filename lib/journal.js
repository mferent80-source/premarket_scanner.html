// ═══════════════════════════════════════════════════════════════════
// journal.js — Jurnal de EXECUȚII reale, partajat (JR.*)
// Sursa de adevăr despre banii reali: fills închise cu fees, sursa semnalului,
// tag-uri de greșeli și regimul zilei. Trade Plans (Hub FAB) = execuții source:'tracker'.
// NU semnale (alea stau în lib/ledger.js). trade_plans_v1 = legacy migrat (v564+).
//
// Schema tt_journal_v1: [{ id, sym, dir:'long'|'short', entry, exit, size,
//   fees (USD total, manual — Trade212 e „zero comision" dar are spread/FX),
//   slAtEntry (pt R-multiple; null = R necalculabil), tpAtEntry (TP plan tracker),
//   openTs, closeTs,
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
  const SETTINGS_KEY = 'tt_journal_settings_v1';
  const SETTINGS_DEFAULTS = {
    ddAlertAll: 0,
    ddAlertStl: 0, ddAlertNasdaq: 0, ddAlertMacro: 0, ddAlertOther: 0,
    ddNotifyBrowser: false,
    weeklyReportEnabled: false, weeklyReportEmail: '',
    lastWeeklyReportTs: 0,
    workspaceV2: true,
    capViewMode: 'lite',
    weeklyRBudget: 5
  };

  function all(){
    try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }
  function save(arr, meta){
    try {
      localStorage.setItem(KEY, JSON.stringify(arr));
      if (global.CD) {
        if (meta && meta.closed && typeof CD.onPostTrade === 'function') CD.onPostTrade(meta.closed);
        else if (typeof CD.notifyChange === 'function') CD.notifyChange();
      }
      return true;
    } catch(e){ return false; }
  }
  function _regimeNow(){
    try { const r = JSON.parse(localStorage.getItem('md_risk_regime') || 'null'); return (r && r.label) ? String(r.label).trim() : '?'; }
    catch(e){ return '?'; }
  }
  function _num(v){ const n = parseFloat(v); return isFinite(n) ? n : null; }

  // add — validează minimul (sym, entry, size); exit GOL = execuție ÎN CURS (status 'open').
  // Regimul se capturează la ADĂUGARE (= la intrare pt cele în curs) — exact ce vrem să știm.
  function add(e, opts){
    opts = opts || {};
    const sym = String(e.sym || '').trim().toUpperCase();
    const entry = _num(e.entry), exit = _num(e.exit), size = _num(e.size);
    if (!sym || entry == null || size == null || entry <= 0 || size <= 0) return null;
    const isOpen = exit == null;
    if (isOpen && !opts.allowDupOpen && findOpen(sym)) return null;
    const rec = {
      id: 'j_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      sym, dir: e.dir === 'short' ? 'short' : 'long',
      entry, exit, size,
      status: isOpen ? 'open' : 'closed',
      fees: _num(e.fees) || 0,
      slAtEntry: _num(e.slAtEntry),
      tpAtEntry: _num(e.tpAtEntry != null ? e.tpAtEntry : e.tp),
      openTs: e.openTs || (isOpen ? Date.now() : null),
      closeTs: isOpen ? null : (e.closeTs || Date.now()),
      source: e.source || 'manual',
      tags: Array.isArray(e.tags) ? e.tags.filter(Boolean) : [],
      regime: e.regime || _regimeNow(),
      notes: String(e.notes || ''),
      srcId: e.srcId || null,
      markPrice: isOpen ? (_num(e.markPrice) || null) : null
    };
    const arr = all();
    arr.unshift(rec);
    if (!save(arr, isOpen ? null : { closed: rec })) return null;
    if (isOpen && global.CD && typeof CD.markRescanNeeded === 'function') CD.markRescanNeeded('open:' + sym);
    return rec;
  }
  // isOpen — și pe intrări vechi fără câmpul status (exit lipsă = deschisă)
  function isOpen(e){ return !!e && (e.status === 'open' || e.exit == null); }
  function findOpen(sym){
    const s = String(sym || '').trim().toUpperCase();
    if (!s) return null;
    return all().find(e => isOpen(e) && String(e.sym).toUpperCase() === s) || null;
  }
  // close — completează exit-ul unei execuții în curs (fees/tags se pot edita după)
  function close(id, exitPrice, closeTs, fees){
    const exit = _num(exitPrice);
    if (exit == null || exit <= 0) return false;
    const patch = { exit, status: 'closed', closeTs: closeTs || Date.now() };
    const f = _num(fees);
    if (f != null) patch.fees = f;
    return update(id, patch);
  }
  function update(id, patch){
    const arr = all();
    const i = arr.findIndex(x => x && x.id === id);
    if (i < 0) return false;
    const prev = arr[i];
    const next = Object.assign({}, prev, patch, { id });
    const becameClosed = prev && prev.status !== 'closed' && next.status === 'closed';
    arr[i] = next;
    return save(arr, becameClosed ? { closed: next } : null);
  }
  function remove(id){
    const arr = all();
    const rm = arr.find(x => x && x.id === id);
    const next = arr.filter(x => x && x.id !== id);
    if (!save(next)) return false;
    if (rm && isOpen(rm) && global.CD && typeof CD.markRescanNeeded === 'function')
      CD.markRescanNeeded('remove:' + rm.sym);
    return true;
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
  function getSettings(){
    try { return Object.assign({}, SETTINGS_DEFAULTS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); }
    catch (e) { return Object.assign({}, SETTINGS_DEFAULTS); }
  }
  function saveSettings(patch){
    const next = Object.assign({}, getSettings(), patch || {});
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); return true; }
    catch (e) { return false; }
  }

  function closedOnly(entries){
    return (entries || []).filter(e => e && (e.status === 'closed' || (e.exit != null && e.status !== 'open')));
  }

  function listClosed(opts){
    opts = opts || {};
    let rows = closedOnly(all());
    if (opts.today) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      rows = rows.filter(e => (e.closeTs || 0) >= start.getTime());
    } else if (opts.days) {
      const cut = Date.now() - opts.days * 86400000;
      rows = rows.filter(e => (e.closeTs || 0) >= cut);
    }
    if (opts.source) rows = rows.filter(e => (e.source || 'manual') === opts.source);
    return rows.sort((a, b) => (b.closeTs || 0) - (a.closeTs || 0));
  }

  // Max drawdown peak-to-trough pe equity curve (execuții închise, cronologic)
  function maxDrawdown(entries){
    const sorted = closedOnly(entries).slice().sort((a, b) => (a.closeTs || 0) - (b.closeTs || 0));
    let eq = 0, peak = 0, maxDD = 0;
    sorted.forEach(e => {
      eq += pnl(e);
      if (eq > peak) peak = eq;
      const dd = peak - eq;
      if (dd > maxDD) maxDD = dd;
    });
    return maxDD;
  }

  function rollingDdAt(entries, endTs, windowDays){
    windowDays = windowDays || 30;
    const windowMs = windowDays * 86400000;
    const subset = closedOnly(entries).filter(e => {
      const ct = e.closeTs || 0;
      return ct <= endTs && ct > endTs - windowMs;
    });
    return maxDrawdown(subset);
  }

  function drawdownByField(entries, field){
    const groups = {};
    closedOnly(entries).forEach(e => {
      const keys = field === '__tags'
        ? (e.tags && e.tags.length ? e.tags : ['(fără tag)'])
        : [e[field] || '?'];
      keys.forEach(k => { (groups[k] = groups[k] || []).push(e); });
    });
    const out = {};
    Object.keys(groups).forEach(k => { out[k] = maxDrawdown(groups[k]); });
    return out;
  }

  function unrealizedPnl(e, mark){
    if (!isOpen(e)) return null;
    mark = _num(mark);
    if (mark == null) return null;
    return (e.dir === 'short' ? (e.entry - mark) : (mark - e.entry)) * e.size;
  }

  function markPriceFor(e, liveMap){
    liveMap = liveMap || {};
    const manual = _num(e.markPrice);
    if (manual != null && manual > 0) return { price: manual, manual: true };
    const sym = String(e.sym || '').toUpperCase();
    if (sym && liveMap[sym] != null) return { price: liveMap[sym], manual: false };
    return null;
  }

  function weeklyReportText(){
    const allE = all();
    const closed = closedOnly(allE);
    const s = stats(closed);
    const openN = allE.filter(isOpen).length;
    const srcDd = drawdownByField(closed, 'source');
    const regDd = drawdownByField(closed, 'regime');
    let text = '📓 Journal & Risk Desk — Raport săptămânal\n' + new Date().toLocaleString('ro-RO') + '\n\n';
    if (s.n) {
      text += 'Execuții închise: ' + s.n + ' · Open: ' + openN + '\n';
      text += 'Win rate: ' + s.winPct.toFixed(1) + '% · PnL net: ' + (s.pnlNet >= 0 ? '+' : '') + '$' + s.pnlNet.toFixed(2) + '\n';
      text += 'Expectancy R: ' + (s.expectancyR != null ? s.expectancyR.toFixed(2) + 'R' : '—') + ' · PF: ' + (s.pf === Infinity ? '∞' : s.pf.toFixed(2)) + '\n\n';
    } else text += 'Încă fără execuții închise · Open: ' + openN + '\n\n';
    text += '── Max DD all-time ──\n';
    text += 'Toate: −$' + maxDrawdown(closed).toFixed(2) + ' · rolling 30z: −$' + rollingDdAt(closed, Date.now(), 30).toFixed(2) + '\n';
    Object.keys(srcDd).sort((a, b) => srcDd[b] - srcDd[a]).slice(0, 8).forEach(k => {
      text += k + ': −$' + srcDd[k].toFixed(2) + ' · 30z −$' + rollingDdAt(closed.filter(e => (e.source || '?') === k), Date.now(), 30).toFixed(2) + '\n';
    });
    text += '\n── DD pe regim ──\n';
    Object.keys(regDd).sort((a, b) => regDd[b] - regDd[a]).slice(0, 6).forEach(k => {
      text += k + ': −$' + regDd[k].toFixed(2) + '\n';
    });
    if (global.GV) {
      const st = GV.status();
      text += '\n── Risk Desk ──\n' + GV.labelOf(st.verdict).text + ' · PnL azi $' + st.todayPnl.toFixed(2);
    }
    return text;
  }

  // statsBy — segmentat pe un câmp ('source' | 'regime') sau pe tag ('__tags').
  // DOAR închisele: un grup format numai din execuții în curs ar produce stats {n:0}
  // fără winPct/pnlNet → TypeError la .toFixed în UI (bug prins de Marius pe v5).
  function statsBy(entries, field){
    entries = (entries || []).filter(e => e && e.exit != null);
    const groups = {};
    entries.forEach(e => {
      const keys = field === '__tags' ? (e.tags && e.tags.length ? e.tags : ['(fără tag)']) : [e[field] || '?'];
      keys.forEach(k => { (groups[k] = groups[k] || []).push(e); });
    });
    const out = {};
    Object.keys(groups).forEach(k => { out[k] = stats(groups[k]); });
    return out;
  }

  function ingestPayload(obj){
    if (!obj || typeof obj !== 'object') return null;
    const sym = String(obj.sym || obj.symbol || obj.ticker || '').trim().toUpperCase();
    const entry = _num(obj.entry != null ? obj.entry : obj.price);
    const exit = _num(obj.exit);
    const size = _num(obj.size != null ? obj.size : obj.qty);
    if (!sym || entry == null || size == null) return null;
    const isClose = exit != null && exit > 0;
    if (isClose){
      const idRef = obj.id || obj.planId || obj.srcId;
      const opens = all().filter(e => isOpen(e) && e.sym === sym)
        .sort((a, b) => (b.openTs || 0) - (a.openTs || 0));
      let target = null;
      if (idRef) {
        target = opens.find(e => e.srcId === idRef || (e.notes && String(e.notes).includes(String(idRef))));
      }
      if (!target) target = opens[0];
      if (target) {
        return close(target.id, exit, obj.closeTs ? (obj.closeTs < 1e12 ? obj.closeTs * 1000 : obj.closeTs) : Date.now()) ? target : null;
      }
    }
    return add({
      sym, entry, exit: isClose ? exit : null, size,
      dir: obj.dir === 'short' || obj.dir === 'SHORT' ? 'short' : 'long',
      fees: _num(obj.fees) || 0,
      slAtEntry: _num(obj.sl != null ? obj.sl : obj.slAtEntry),
      openTs: obj.openTs ? (obj.openTs < 1e12 ? obj.openTs * 1000 : obj.openTs) : Date.now(),
      closeTs: isClose ? (obj.closeTs ? (obj.closeTs < 1e12 ? obj.closeTs * 1000 : obj.closeTs) : Date.now()) : null,
      source: obj.source || obj.src || 'webhook',
      tags: Array.isArray(obj.tags) ? obj.tags : [],
      regime: obj.regime || _regimeNow(),
      notes: String(obj.notes || obj.note || obj.reason || ''),
      srcId: obj.srcId || obj.planId || null
    });
  }

  function ingestText(text){
    const lines = String(text || '').split(/\n+/).filter(Boolean);
    let n = 0;
    lines.forEach(line => {
      try {
        const o = JSON.parse(line.trim());
        if (ingestPayload(o)) n++;
      } catch(e){
        try {
          const o = JSON.parse(line.trim().replace(/^[^[{]*/, ''));
          if (ingestPayload(o)) n++;
        } catch(e2){}
      }
    });
    return n;
  }

  function syncFromGist(gistRawUrl){
    return fetch(gistRawUrl).then(r => r.json()).then(data => {
      const entries = Array.isArray(data) ? data : (data.entries || data.journal || []);
      let n = 0;
      entries.forEach(e => { if (ingestPayload(e)) n++; });
      return n;
    });
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

  function importOpenFromTracker(){
    let plans = [];
    try { plans = JSON.parse(localStorage.getItem('trade_plans_v1') || '[]') || []; } catch(e){}
    const have = new Set(all().filter(isOpen).map(x => x.srcId).filter(Boolean));
    let added = 0, skipped = 0;
    plans.forEach(p => {
      if (!p || p.status !== 'open') return;
      if (have.has(p.id)) { skipped++; return; }
      const rec = syncPlan(p);
      if (rec) added++;
      else skipped++;
    });
    return { added, skipped };
  }

  // syncPlan — menține tt_journal_v1 aliniat cu un plan din trade_plans_v1 (live, nu doar import).
  function _trackerNote(notes){
    const s = String(notes || '').trim();
    return s.includes('[sync tracker]') ? s : (s ? s + ' · ' : '') + '[sync tracker]';
  }
  function syncPlan(p){
    if (!p || !p.id) return null;
    const sym = String(p.ticker || p.sym || '').trim().toUpperCase();
    const entry = _num(p.entry), size = _num(p.size);
    if (!sym || entry == null || size == null || entry <= 0 || size <= 0) return null;
    const dir = p.dir === 'short' ? 'short' : 'long';
    const sl = _num(p.sl);
    const noteTag = _trackerNote(p.notes);
    const existing = all().find(e => e && e.srcId === p.id);

    if (p.status === 'open') {
      const tp = _num(p.tp);
      const patch = {
        sym, dir, entry, size, slAtEntry: sl, tpAtEntry: tp,
        exit: null, status: 'open',
        openTs: p.opened || (existing && existing.openTs) || Date.now(),
        closeTs: null, source: 'tracker', notes: noteTag
      };
      if (existing) {
        update(existing.id, patch);
        return Object.assign({}, existing, patch, { id: existing.id, srcId: p.id });
      }
      return add(Object.assign({}, patch, { fees: 0, tags: [], srcId: p.id }));
    }
    if (p.status === 'win' || p.status === 'loss') {
      const exit = _num(p.exit);
      if (exit == null) return null;
      if (existing) {
        if (isOpen(existing)) {
          update(existing.id, {
            exit, status: 'closed', closeTs: p.closed || Date.now(),
            sym, dir, entry, size, slAtEntry: sl, notes: noteTag,
            fees: _num(p.fees) || existing.fees || 0,
            tags: p.status === 'win' ? ['good-exec'] : []
          });
        }
        return existing;
      }
      return add({
        sym, dir, entry, exit, size, fees: _num(p.fees) || 0, slAtEntry: sl,
        openTs: p.opened || null, closeTs: p.closed || Date.now(),
        source: 'tracker', tags: p.status === 'win' ? ['good-exec'] : [],
        notes: noteTag, srcId: p.id
      });
    }
    return null;
  }
  function unsyncPlan(planId){
    if (!planId) return false;
    const e = all().find(x => x && (x.srcId === planId || x.id === planId));
    return e ? remove(e.id) : false;
  }
  function syncAllOpenFromTracker(){
    let plans = [];
    try { plans = JSON.parse(localStorage.getItem('trade_plans_v1') || '[]') || []; } catch(e){}
    let n = 0;
    plans.forEach(p => { if (p && p.status === 'open' && syncPlan(p)) n++; });
    return n;
  }
  function syncAllFromTracker(){
    let plans = [];
    try { plans = JSON.parse(localStorage.getItem('trade_plans_v1') || '[]') || []; } catch(e){}
    let open = 0, closed = 0, skipped = 0;
    plans.forEach(p => {
      if (!p || !p.id) { skipped++; return; }
      const had = all().find(e => e && e.srcId === p.id);
      const r = syncPlan(p);
      if (!r) { skipped++; return; }
      if (!had) {
        if (p.status === 'open') open++;
        else if (p.status === 'win' || p.status === 'loss') closed++;
      }
    });
    return { open, closed, skipped, total: plans.length };
  }
  function reconcileTracker(){
    const j = all();
    const journalOpen = j.filter(isOpen).length;
    const trackerOpen = j.filter(e => isOpen(e) && e.source === 'tracker').length;
    let openOrphan = 0, closedMissing = 0, legacyPending = 0;
    try {
      const plans = JSON.parse(localStorage.getItem('trade_plans_v1') || '[]') || [];
      legacyPending = plans.filter(Boolean).length;
      if (legacyPending) {
        const haveSrc = new Set(j.map(x => x.srcId).filter(Boolean));
        const openJr = new Set(j.filter(isOpen).map(x => x.srcId).filter(Boolean));
        plans.forEach(p => {
          if (!p) return;
          if (p.status === 'open') {
            if (!openJr.has(p.id)) openOrphan++;
          } else if ((p.status === 'win' || p.status === 'loss') && p.exit != null && !haveSrc.has(p.id)) {
            closedMissing++;
          }
        });
      }
    } catch(e){}
    return {
      openOrphan, closedMissing, trackerOpen, journalOpen, legacyPending,
      ok: openOrphan === 0 && closedMissing === 0 && legacyPending === 0,
      journalFirst: legacyPending === 0
    };
  }

  function prefillFromQuery(){
    try {
      const q = new URLSearchParams(location.search);
      if (!q.has('sym') && !q.has('prefill')) return null;
      if (q.has('prefill')){
        const o = JSON.parse(decodeURIComponent(q.get('prefill')));
        return o;
      }
      return {
        sym: q.get('sym'),
        source: q.get('source') || 'ledger',
        notes: q.get('notes') || '',
        srcId: q.get('srcId') || null
      };
    } catch(e){ return null; }
  }

  global.JR = {
    all, save, add, update, remove, isOpen, findOpen, close, pnl, rMult, stats, statsBy,
    getSettings, saveSettings, maxDrawdown, rollingDdAt, drawdownByField,
    unrealizedPnl, markPriceFor, weeklyReportText, closedOnly, listClosed,
    importFromTracker, importOpenFromTracker, syncPlan, unsyncPlan, syncAllOpenFromTracker, syncAllFromTracker, reconcileTracker,
    ingestPayload, ingestText, syncFromGist, prefillFromQuery,
    KEY, SETTINGS_KEY
  };
})(typeof window !== 'undefined' ? window : globalThis);
