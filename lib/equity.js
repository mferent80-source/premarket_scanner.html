// ═══════════════════════════════════════════════════════════════════
// equity.js — Equity curve + drawdown din execuții journal + snapshot-uri cont (EQ.*)
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';
  const SNAP_KEY = 'tt_equity_snapshots_v1';

  function snapshots(){
    try { const a = JSON.parse(localStorage.getItem(SNAP_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }
  function saveSnapshots(arr){
    try { localStorage.setItem(SNAP_KEY, JSON.stringify(arr)); return true; } catch(e){ return false; }
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

  function _day(ts){
    try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(ts ? new Date(ts) : new Date()); }
    catch(e){ return new Date(ts || Date.now()).toISOString().slice(0,10); }
  }
  function _weekKey(ts){
    const d = new Date(ts || Date.now());
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = x.getDay() || 7;
    x.setDate(x.getDate() + 4 - day);
    const y = x.getFullYear();
    const w = Math.floor((x - new Date(y, 0, 1)) / 604800000) + 1;
    return y + '-W' + String(w).padStart(2, '0');
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

  function baseline(){
    const fs = firstSnapshot();
    if (fs) {
      return { value: fs.equity, source: 'snapshot', day: fs.day, note: fs.note || '', ts: fs.ts };
    }
    const acct = cfgAccount();
    return { value: acct, source: 'governor', day: null, note: '', ts: null };
  }

  function journalOpen(){
    const isO = e => !!e && (e.status === 'open' || e.exit == null);
    return journalAll().filter(isO);
  }

  function openDeployed(){
    const rows = journalOpen().map(e => {
      const notional = (parseFloat(e.entry) || 0) * (parseFloat(e.size) || 0);
      return { id: e.id, sym: e.sym, dir: e.dir, entry: e.entry, size: e.size, notional, sl: e.slAtEntry };
    }).filter(r => r.notional > 0);
    return { total: rows.reduce((s, r) => s + r.notional, 0), count: rows.length, rows };
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
    const points = [];
    let eq = start;
    let peak = start;
    if (base.source === 'snapshot' && fs) {
      points.push({ ts: fs.ts, day: fs.day, equity: eq, pnlStep: 0, kind: 'snapshot', note: fs.note || 'baseline', peak, ddPct: 0, baseline: true });
    }
    trades.forEach(e => {
      const p = pnlOf(e);
      eq += p;
      if (eq > peak) peak = eq;
      const ddPct = peak > 0 ? (peak - eq) / peak * 100 : 0;
      points.push({
        ts: e.closeTs || Date.now(), day: _day(e.closeTs), equity: eq, pnlStep: p,
        tradeId: e.id, sym: e.sym, source: e.source, kind: 'trade', peak, ddPct
      });
    });
    snaps.forEach(s => {
      if (fs && s.ts === fs.ts && base.source === 'snapshot') return;
      if (!points.some(p => p.kind === 'snapshot' && p.ts === s.ts)){
        if (s.equity > peak) peak = s.equity;
        points.push({ ts: s.ts, day: s.day, equity: s.equity, pnlStep: 0, kind: 'snapshot', note: s.note, peak, ddPct: peak > 0 ? (peak - s.equity) / peak * 100 : 0 });
      }
    });
    points.sort((a, b) => a.ts - b.ts);
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
      try {
        const d0 = new Date(ddStart + 'T12:00:00');
        const d1 = new Date(lastDay + 'T12:00:00');
        daysInDd = Math.max(0, Math.round((d1 - d0) / 86400000));
      } catch(e){ daysInDd = 0; }
    }
    return { maxDdPct, currentDdPct: curDdPct, peak: curPeak, current, daysInDd, n: points.length };
  }

  function drift(){
    const sim = drawdownStats().current;
    const snap = lastSnapshot();
    if (!snap) return { simulated: sim, snapshot: null, driftUsd: null, driftPct: null, warn: false };
    const driftUsd = sim - snap.equity;
    const driftPct = snap.equity > 0 ? (driftUsd / snap.equity) * 100 : null;
    return {
      simulated: sim,
      snapshot: snap,
      driftUsd,
      driftPct,
      warn: driftPct != null && Math.abs(driftPct) >= 2
    };
  }

  function weeklyPnl(weeks){
    weeks = weeks || 8;
    const g = {};
    journalClosed().forEach(e => {
      const k = _weekKey(e.closeTs);
      g[k] = (g[k] || 0) + (pnlOf(e) || 0);
    });
    const keys = Object.keys(g).sort().slice(-weeks);
    return keys.map(k => ({ week: k, pnl: g[k] }));
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

  global.EQ = {
    curve, drawdownStats, rDistribution, streaks, statsBySource,
    snapshots, addSnapshot, removeSnapshot, firstSnapshot, lastSnapshot,
    baseline, openDeployed, journalOpen, realizedTotal, unrealizedOf, drift, weeklyPnl,
    pnlOf, cfgAccount, SNAP_KEY
  };
})(typeof window !== 'undefined' ? window : globalThis);