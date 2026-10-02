// ═══════════════════════════════════════════════════════════════════
// equity.js v5 — Equity curve + drawdown + capital events + drift (EQ.*)
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';
  const SNAP_KEY = 'tt_equity_snapshots_v1';
  const EVENT_KEY = 'tt_equity_events_v1';
  const DRIFT_ALERT_KEY = 'tt_equity_drift_alert_day';
  const DRIFT_FLAG_KEY = 'tt_equity_drift_flag_v1';

  function snapshots(){
    try { const a = JSON.parse(localStorage.getItem(SNAP_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }
  function saveSnapshots(arr){
    try {
      localStorage.setItem(SNAP_KEY, JSON.stringify(arr));
      if (global.CD && typeof CD.notifyChange === 'function') CD.notifyChange();
      return true;
    } catch(e){ return false; }
  }
  function addSnapshot(equity, note){
    const eq = parseFloat(equity);
    if (!isFinite(eq) || eq <= 0) return null;
    const rec = { equity: eq, ts: Date.now(), day: _day(), note: String(note || '') };
    const arr = snapshots();
    arr.push(rec);
    return saveSnapshots(arr) ? rec : null;
  }
  function removeSnapshot(ts){
    const arr = snapshots().filter(s => s.ts !== ts);
    return saveSnapshots(arr);
  }

  function capitalEvents(){
    try { const a = JSON.parse(localStorage.getItem(EVENT_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }
  function saveEvents(arr){
    try {
      localStorage.setItem(EVENT_KEY, JSON.stringify(arr));
      if (global.CD && typeof CD.notifyChange === 'function') CD.notifyChange();
      return true;
    } catch(e){ return false; }
  }
  function addCapitalEvent(kind, amountUsd, note){
    const amt = parseFloat(amountUsd);
    if (!isFinite(amt) || amt <= 0) return null;
    const k = kind === 'withdraw' ? 'withdraw' : 'deposit';
    const rec = { kind: k, amountUsd: amt, ts: Date.now(), day: _day(), note: String(note || '') };
    const arr = capitalEvents();
    arr.push(rec);
    const ok = saveEvents(arr);
    if (ok && global.ACCT && typeof ACCT.adjustForCapitalEvent === 'function') {
      ACCT.adjustForCapitalEvent(k, amt);
    }
    return ok ? rec : null;
  }
  function removeCapitalEvent(ts){
    const arr = capitalEvents().filter(e => e.ts !== ts);
    return saveEvents(arr);
  }

  function _day(ts){
    if (global.CT && typeof CT.etDay === 'function') return CT.etDay(ts);
    try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(ts ? new Date(ts) : new Date()); }
    catch(e){ return new Date(ts || Date.now()).toISOString().slice(0,10); }
  }
  function _weekKey(ts){
    if (global.CT && typeof CT.isoWeekKey === 'function') return CT.isoWeekKey(ts);
    const d = new Date(ts || Date.now());
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = x.getDay() || 7;
    x.setDate(x.getDate() + 4 - day);
    const y = x.getFullYear();
    const w = Math.floor((x - new Date(y, 0, 1)) / 604800000) + 1;
    return y + '-W' + String(w).padStart(2, '0');
  }
  function _etDayDiff(d0, d1){
    try {
      const a = new Date(d0 + 'T12:00:00');
      const b = new Date(d1 + 'T12:00:00');
      return Math.max(0, Math.round((b - a) / 86400000));
    } catch(e){ return null; }
  }

  function journalAll(){
    if (global.JR && typeof JR.all === 'function') return JR.all();
    try {
      const a = JSON.parse(localStorage.getItem('tt_journal_v1') || '[]');
      return Array.isArray(a) ? a : [];
    } catch(e){ return []; }
  }
  function journalClosed(){
    return journalAll().filter(e => e && e.exit != null).sort((a, b) => (a.closeTs || 0) - (b.closeTs || 0));
  }

  function pnlOf(e){
    if (global.JR && typeof JR.pnl === 'function') return JR.pnl(e);
    if (e.exit == null) return null;
    const raw = (e.dir === 'short' ? (e.entry - e.exit) : (e.exit - e.entry)) * e.size;
    return raw - (e.fees || 0);
  }
  function unrealizedOf(e, price){
    if (global.JR && JR.unrealizedPnl) return JR.unrealizedPnl(e, price);
    const px = parseFloat(price);
    if (!(px > 0)) return null;
    const entry = parseFloat(e.entry), size = parseFloat(e.size);
    if (!(entry > 0) || !(size > 0)) return null;
    return (e.dir === 'short' ? (entry - px) : (px - entry)) * size;
  }
  function rOf(e){
    if (global.JR && typeof JR.rMult === 'function') return JR.rMult(e);
    if (e.slAtEntry == null || e.exit == null) return null;
    const r0 = Math.abs(e.entry - e.slAtEntry) * e.size;
    return r0 > 0 ? pnlOf(e) / r0 : null;
  }

  function cfgAccount(){
    if (global.ACCT && typeof ACCT.get === 'function') return ACCT.get().value;
    // sizing cont curent — NU baseline curbă
    if (global.GV && typeof GV.cfg === 'function') return GV.cfg().accountSize || 10000;
    try {
      const c = JSON.parse(localStorage.getItem('tt_governor_cfg_v1') || 'null');
      return (c && c.accountSize) || 10000;
    } catch(e){ return 10000; }
  }

  function firstSnapshot(){
    const s = snapshots().sort((a, b) => a.ts - b.ts);
    return s.length ? s[0] : null;
  }
  function lastSnapshot(){
    const s = snapshots().sort((a, b) => b.ts - a.ts);
    return s.length ? s[0] : null;
  }
  function snapshotAgeDays(){
    const s = lastSnapshot();
    if (!s) return null;
    return _etDayDiff(s.day, _day());
  }

  function baseline(){
    if (global.ACCT && typeof ACCT.getBaseline === 'function') {
      const b = ACCT.getBaseline();
      if (b && b.source === 'snapshot') {
        const fs = firstSnapshot();
        return {
          value: b.value, source: 'snapshot', day: b.day || (fs && fs.day),
          note: (fs && fs.note) || '', ts: b.ts || (fs && fs.ts)
        };
      }
    }
    const fs = firstSnapshot();
    if (fs) {
      return { value: fs.equity, source: 'snapshot', day: fs.day, note: fs.note || '', ts: fs.ts };
    }
    const acct = cfgAccount();
    return { value: acct, source: 'account', day: null, note: '', ts: null };
  }

  function journalOpen(){
    const isO = e => !!e && (e.status === 'open' || e.exit == null);
    return journalAll().filter(isO);
  }

  function openDeployed(){
    const rows = journalOpen().map(e => {
      const notional = global.JR && JR.initialNotionalUsd ? JR.initialNotionalUsd(e) : null;
      return { id: e.id, sym: e.sym, dir: e.dir, entry: e.entry, size: e.size, notional, sl: e.slAtEntry };
    }).filter(r => r.notional > 0);
    return { total: rows.reduce((s, r) => s + r.notional, 0), count: rows.length, missingFx: journalOpen().length - rows.length, rows };
  }

  function realizedTotal(){
    return journalClosed().reduce((s, e) => s + (pnlOf(e) || 0), 0);
  }

  function curve(){
    const base = baseline();
    const start = base.value;
    const fs = firstSnapshot();
    const trades = journalClosed();
    const snaps = snapshots().sort((a, b) => a.ts - b.ts);
    const caps = capitalEvents();
    const raw = [];

    if (base.source === 'snapshot' && fs) {
      raw.push({ ts: fs.ts, day: fs.day, equity: start, pnlStep: 0, kind: 'snapshot', note: fs.note || 'baseline', baseline: true });
    } else {
      raw.push({ ts: Date.now() - 86400000 * 30, day: _day(), equity: start, pnlStep: 0, kind: 'start', note: 'baseline account' });
    }

    trades.forEach(e => {
      const p = pnlOf(e);
      raw.push({
        ts: e.closeTs || Date.now(), day: _day(e.closeTs), pnlStep: p,
        tradeId: e.id, sym: e.sym, source: e.source, kind: 'trade'
      });
    });

    caps.forEach(ev => {
      const step = ev.kind === 'withdraw' ? -ev.amountUsd : ev.amountUsd;
      raw.push({
        ts: ev.ts, day: ev.day, pnlStep: step, kind: ev.kind,
        note: ev.note || '', eventTs: ev.ts
      });
    });

    snaps.forEach(s => {
      if (fs && s.ts === fs.ts && base.source === 'snapshot') return;
      raw.push({ ts: s.ts, day: s.day, equity: s.equity, pnlStep: 0, kind: 'snapshot', note: s.note || '' });
    });

    raw.sort((a, b) => a.ts - b.ts);

    const points = [];
    let eq = start;
    let peak = start;
    raw.forEach(p => {
      if (p.kind === 'snapshot' && p.equity != null && !p.baseline) {
        eq = p.equity;
        if (eq > peak) peak = eq;
        points.push(Object.assign({}, p, { peak, ddPct: peak > 0 ? (peak - eq) / peak * 100 : 0 }));
        return;
      }
      if (p.kind === 'trade' || p.kind === 'deposit' || p.kind === 'withdraw') {
        eq += p.pnlStep || 0;
      }
      if (eq > peak) peak = eq;
      const ddPct = peak > 0 ? (peak - eq) / peak * 100 : 0;
      points.push(Object.assign({}, p, { equity: eq, peak, ddPct }));
    });

    return { start, points, current: points.length ? points[points.length - 1].equity : start, baseline: base };
  }

  function drawdownStats(){
    const { points, current, start } = curve();
    if (!points.length) return { maxDdPct: 0, currentDdPct: 0, peak: start, daysInDd: 0, n: 0, current: start };
    let peak = start, maxDdPct = 0;
    let curPeak = start, curDdPct = 0;
    let ddStart = null, daysInDd = 0;
    const lastDay = points[points.length - 1].day;
    points.forEach(p => {
      if (p.equity > peak) peak = p.equity;
      const ddPct = p.peak > 0 ? (p.peak - p.equity) / p.peak * 100 : (peak > 0 ? (peak - p.equity) / peak * 100 : 0);
      if (ddPct > maxDdPct) maxDdPct = ddPct;
      if (p.equity >= curPeak){ curPeak = p.equity; ddStart = null; }
      else if (!ddStart) ddStart = p.day;
    });
    if (current < curPeak && curPeak > 0) curDdPct = (curPeak - current) / curPeak * 100;
    if (ddStart && ddStart !== lastDay){
      daysInDd = _etDayDiff(ddStart, lastDay) || 0;
    }
    return { maxDdPct, currentDdPct: curDdPct, peak: curPeak, current, daysInDd, n: points.length };
  }

  function drift(){
    const sim = drawdownStats().current;
    const snap = lastSnapshot();
    const ageDays = snapshotAgeDays();
    if (!snap) return { simulated: sim, snapshot: null, driftUsd: null, driftPct: null, warn: false, snapshotAgeDays: null };
    const driftUsd = sim - snap.equity;
    const driftPct = snap.equity > 0 ? (driftUsd / snap.equity) * 100 : null;
    const warn = driftPct != null && Math.abs(driftPct) >= 2;
    const stale = ageDays != null && ageDays > 14;
    return {
      simulated: sim,
      snapshot: snap,
      driftUsd,
      driftPct,
      warn,
      stale,
      snapshotAgeDays: ageDays
    };
  }

  function estimatedEquity(unrealized){
    const dd = drawdownStats();
    return dd.current + (unrealized || 0);
  }

  function cashEstimate(unrealized, mktVal){
    const eq = estimatedEquity(unrealized);
    const exp = mktVal != null ? mktVal : openDeployed().total;
    return { equity: eq, exposure: exp, cash: eq - exp, cashPct: eq > 0 ? (eq - exp) / eq * 100 : null };
  }

  function weeklyPnl(weeks){
    weeks = weeks || 8;
    const g = {};
    const curKey = _weekKey();
    journalClosed().forEach(e => {
      const k = _weekKey(e.closeTs);
      g[k] = (g[k] || 0) + (pnlOf(e) || 0);
    });
    const keys = Object.keys(g).sort().slice(-weeks);
    const rows = keys.map(k => ({ week: k, pnl: g[k] }));
    if (!rows.length || rows[rows.length - 1].week !== curKey) {
      rows.push({ week: curKey, pnl: g[curKey] || 0 });
    }
    return rows.slice(-weeks);
  }

  function statsBySource(){
    const trades = journalClosed();
    const g = {};
    trades.forEach(t => {
      const k = t.source || '?';
      (g[k] = g[k] || []).push(pnlOf(t));
    });
    const out = {};
    Object.keys(g).forEach(k => {
      const arr = g[k];
      out[k] = { n: arr.length, pnl: arr.reduce((a, b) => a + b, 0), small: arr.length < 10 };
    });
    return out;
  }

  function statsByRegime(){
    const closed = journalClosed();
    if (global.JR && typeof JR.statsBy === 'function') return JR.statsBy(closed, 'regime');
    const g = {};
    closed.forEach(e => {
      const k = e.regime || '?';
      (g[k] = g[k] || []).push(e);
    });
    const out = {};
    Object.keys(g).forEach(k => {
      const arr = g[k];
      const pnls = arr.map(pnlOf);
      const rs = arr.map(rOf).filter(r => r != null);
      out[k] = {
        n: arr.length,
        pnl: pnls.reduce((a, b) => a + b, 0),
        expectancyR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
        nR: rs.length,
        small: arr.length < 10
      };
    });
    return out;
  }

  function rDistribution(){
    const rs = journalClosed().map(rOf).filter(r => r != null);
    if (!rs.length) return { buckets: [], n: 0, median: null };
    const buckets = [
      { label: '< −2R', min: -Infinity, max: -2, n: 0 },
      { label: '−2..−1R', min: -2, max: -1, n: 0 },
      { label: '−1..0R', min: -1, max: 0, n: 0 },
      { label: '0..+1R', min: 0, max: 1, n: 0 },
      { label: '+1..+2R', min: 1, max: 2, n: 0 },
      { label: '> +2R', min: 2, max: Infinity, n: 0 }
    ];
    rs.forEach(r => {
      for (const b of buckets){
        if (r >= b.min && r < b.max){ b.n++; break; }
        if (b.max === Infinity && r >= b.min){ b.n++; break; }
      }
    });
    const sorted = rs.slice().sort((a, b) => a - b);
    return { buckets, n: rs.length, median: sorted[Math.floor(sorted.length / 2)], avg: rs.reduce((a, b) => a + b, 0) / rs.length };
  }

  function streaks(){
    const trades = journalClosed();
    let w = 0, l = 0, maxW = 0, maxL = 0;
    trades.forEach(e => {
      const p = pnlOf(e);
      if (p > 0){ w++; l = 0; maxW = Math.max(maxW, w); }
      else if (p < 0){ l++; w = 0; maxL = Math.max(maxL, l); }
      else { w = 0; l = 0; }
    });
    return { currentWin: w, currentLoss: l, maxWin: maxW, maxLoss: maxL };
  }

  function reconcileStatus(){
    const openJr = journalOpen().length;
    const journalFromTracker = journalAll().filter(e => e && e.source === 'tracker').length;
    const base = {
      trackerClosed: journalAll().filter(e => e && e.source === 'tracker' && e.exit != null).length,
      missing: 0, journalFromTracker, openJr,
      openTracker: openJr, capitalEvents: capitalEvents().length, journalOpen: openJr
    };
    if (global.JR && typeof JR.reconcileTracker === 'function') {
      const r = JR.reconcileTracker();
      return Object.assign(base, {
        openOrphan: r.openOrphan, closedMissing: r.closedMissing,
        missing: r.closedMissing, syncOk: r.ok, journalFirst: r.journalFirst
      });
    }
    return base;
  }

  function _csvCell(v){
    let s = String(v == null ? '' : v);
    s = s.replace(/,/g, ';');
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return s;
  }

  function exportCsv(){
    const { points } = curve();
    const hdr = 'day,ts,equity,kind,pnlStep,sym,note';
    const rows = points.map(p => [
      _csvCell(p.day || ''), p.ts || '', (p.equity != null ? p.equity.toFixed(2) : ''),
      _csvCell(p.kind || ''), (p.pnlStep != null ? p.pnlStep.toFixed(2) : ''),
      _csvCell(p.sym || ''), _csvCell(p.note || '')
    ].join(','));
    return hdr + '\n' + rows.join('\n');
  }

  function hubSummary(){
    const dd = drawdownStats();
    const dr = drift();
    return {
      estimated: dd.current,
      ddPct: dd.currentDdPct,
      maxDdPct: dd.maxDdPct,
      driftPct: dr.driftPct,
      driftWarn: dr.warn,
      snapshotAgeDays: dr.snapshotAgeDays,
      hasSnapshot: !!dr.snapshot
    };
  }

  function shadowAttribution(days){
    days = days || 30;
    const since = Date.now() - days * 86400000;
    const out = { filters: {}, journalPnl: 0, shadowEstUsd: null, shadowTotalR: 0, n: 0 };
    journalClosed().forEach(e => {
      if ((e.closeTs || 0) >= since) out.journalPnl += pnlOf(e) || 0;
    });
    if (!global.SH || typeof SH.all !== 'function') return out;
    const shadows = SH.all().filter(s => s && s.ts >= since && SH.evaluated(s) && Number.isFinite(s.evalR));
    out.n = shadows.length;
    shadows.forEach(s => {
      const f = s.blockedBy || '?';
      const est = s.evalR;
      out.filters[f] = (out.filters[f] || 0) + est;
      out.shadowTotalR += est;
    });
    return out;
  }

  function writeDriftFlag(){
    const dr = drift();
    try {
      localStorage.setItem(DRIFT_FLAG_KEY, JSON.stringify({
        warn: dr.warn, stale: dr.stale, driftPct: dr.driftPct,
        snapshotAgeDays: dr.snapshotAgeDays, ts: Date.now()
      }));
    } catch(e){}
    return dr;
  }

  async function maybeNotifyDrift(){
    const dr = drift();
    writeDriftFlag();
    if (!dr.warn || !global.TG) return false;
    const day = _day();
    try {
      if (localStorage.getItem(DRIFT_ALERT_KEY) === day) return false;
      const msg = `⚖️ <b>Equity drift</b>\nSim: <b>$${dr.simulated.toFixed(0)}</b> vs snapshot: <b>$${dr.snapshot.equity.toFixed(0)}</b>\nΔ <b>${dr.driftPct >= 0 ? '+' : ''}${dr.driftPct.toFixed(1)}%</b>${dr.snapshotAgeDays != null ? ' · snapshot ' + dr.snapshotAgeDays + 'z' : ''}`;
      const ok = await TG.send(msg, { force: false });
      if (ok) localStorage.setItem(DRIFT_ALERT_KEY, day);
      return ok;
    } catch(e){ return false; }
  }

  global.EQ = {
    curve, drawdownStats, rDistribution, streaks, statsBySource, statsByRegime,
    snapshots, addSnapshot, removeSnapshot, firstSnapshot, lastSnapshot, snapshotAgeDays,
    capitalEvents, addCapitalEvent, removeCapitalEvent,
    baseline, openDeployed, journalOpen, realizedTotal, unrealizedOf, drift, weeklyPnl,
    pnlOf, cfgAccount, estimatedEquity, cashEstimate, reconcileStatus, exportCsv,
    hubSummary, shadowAttribution, writeDriftFlag, maybeNotifyDrift,
    SNAP_KEY, EVENT_KEY
  };
})(typeof window !== 'undefined' ? window : globalThis);