// ═══════════════════════════════════════════════════════════════════
// equity.js — Equity curve + drawdown din execuții journal + snapshot-uri cont (EQ.*)
// Folosire: <script src="../lib/equity.js"></script>  EQ.curve(); EQ.drawdownStats();
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';
  const SNAP_KEY = 'tt_equity_snapshots_v1';

  function snapshots(){
    try { const a = JSON.parse(localStorage.getItem(SNAP_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }
  function addSnapshot(equity, note){
    const eq = parseFloat(equity);
    if (!isFinite(eq) || eq <= 0) return null;
    const rec = { equity: eq, ts: Date.now(), day: _day(), note: String(note || '') };
    const arr = snapshots();
    arr.push(rec);
    try { localStorage.setItem(SNAP_KEY, JSON.stringify(arr)); return rec; } catch(e){ return null; }
  }

  function _day(ts){
    try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(ts ? new Date(ts) : new Date()); }
    catch(e){ return new Date(ts || Date.now()).toISOString().slice(0,10); }
  }

  function journalClosed(){
    if (global.JR && typeof JR.all === 'function'){
      return JR.all().filter(e => e && e.exit != null).sort((a, b) => (a.closeTs || 0) - (b.closeTs || 0));
    }
    try {
      const a = JSON.parse(localStorage.getItem('tt_journal_v1') || '[]');
      return (Array.isArray(a) ? a : []).filter(e => e && e.exit != null).sort((a, b) => (a.closeTs || 0) - (b.closeTs || 0));
    } catch(e){ return []; }
  }

  function pnlOf(e){
    if (global.JR && typeof JR.pnl === 'function') return JR.pnl(e);
    const raw = (e.dir === 'short' ? (e.entry - e.exit) : (e.exit - e.entry)) * e.size;
    return raw - (e.fees || 0);
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

  // curve — puncte { ts, day, equity, pnlStep, tradeId? }
  function curve(){
    const start = cfgAccount();
    const trades = journalClosed();
    const snaps = snapshots().sort((a, b) => a.ts - b.ts);
    const points = [];
    let eq = start;
    if (snaps.length && snaps[0].ts < (trades[0]?.closeTs || Infinity)){
      eq = snaps[0].equity;
      points.push({ ts: snaps[0].ts, day: snaps[0].day, equity: eq, pnlStep: 0, kind: 'snapshot' });
    }
    trades.forEach(e => {
      const p = pnlOf(e);
      eq += p;
      points.push({ ts: e.closeTs || Date.now(), day: _day(e.closeTs), equity: eq, pnlStep: p, tradeId: e.id, sym: e.sym, kind: 'trade' });
    });
    snaps.forEach(s => {
      if (!points.some(p => p.kind === 'snapshot' && p.ts === s.ts))
        points.push({ ts: s.ts, day: s.day, equity: s.equity, pnlStep: 0, kind: 'snapshot', note: s.note });
    });
    points.sort((a, b) => a.ts - b.ts);
    return { start, points, current: points.length ? points[points.length - 1].equity : start };
  }

  function drawdownStats(){
    const { points, current, start } = curve();
    if (!points.length) return { maxDdPct: 0, currentDdPct: 0, peak: start, daysInDd: 0, n: 0 };
    let peak = start, maxDd = 0, maxDdPct = 0;
    let curPeak = start, curDdPct = 0;
    let ddStart = null, daysInDd = 0;
    const lastDay = points[points.length - 1].day;
    points.forEach(p => {
      if (p.equity > peak) peak = p.equity;
      const dd = peak - p.equity;
      const ddPct = peak > 0 ? dd / peak * 100 : 0;
      if (ddPct > maxDdPct){ maxDdPct = ddPct; maxDd = dd; }
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
    return { maxDd, maxDdPct, currentDdPct: curDdPct, peak: curPeak, current, daysInDd, n: points.length };
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
    const median = sorted[Math.floor(sorted.length / 2)];
    return { buckets, n: rs.length, median, avg: rs.reduce((a, b) => a + b, 0) / rs.length };
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

  global.EQ = { curve, drawdownStats, rDistribution, streaks, snapshots, addSnapshot, SNAP_KEY };
})(typeof window !== 'undefined' ? window : globalThis);