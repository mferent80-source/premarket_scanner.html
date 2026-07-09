// ═══════════════════════════════════════════════════════════════════
// postmortem.js — MAE/MFE + context pe execuții journal (PM.*)
// Folosire: PM.analyze(tradeId, bars); PM.suggestions(entries);
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';

  function tradeById(id){
    if (global.JR && typeof JR.all === 'function'){
      return JR.all().find(e => e && e.id === id) || null;
    }
    try {
      const a = JSON.parse(localStorage.getItem('tt_journal_v1') || '[]');
      return (Array.isArray(a) ? a : []).find(e => e && e.id === id) || null;
    } catch(e){ return null; }
  }

  function closedTrades(){
    if (global.JR && typeof JR.all === 'function')
      return JR.all().filter(e => e && e.exit != null);
    try {
      const a = JSON.parse(localStorage.getItem('tt_journal_v1') || '[]');
      return (Array.isArray(a) ? a : []).filter(e => e && e.exit != null);
    } catch(e){ return []; }
  }

  function rUnit(e){
    if (e.slAtEntry == null) return null;
    const r0 = Math.abs(e.entry - e.slAtEntry);
    return r0 > 0 ? r0 : null;
  }

  // analyze — MAE/MFE în R pe bare între openTs..closeTs (sau daily fallback)
  function analyze(trade, bars){
    if (!trade || trade.exit == null || !bars || !bars.length) return null;
    const dir = trade.dir === 'short' ? 'short' : 'long';
    const entry = trade.entry;
    const exit = trade.exit;
    const r0 = rUnit(trade);
    const t0 = trade.openTs || bars[0].t;
    const t1 = trade.closeTs || bars[bars.length - 1].t;
    const slice = bars.filter(b => b.t >= t0 - 86400000 && b.t <= t1 + 86400000);
    if (!slice.length) return null;

    let mfe = 0, mae = 0;
    slice.forEach(b => {
      const fav = dir === 'long' ? Math.max(b.h, b.c) - entry : entry - Math.min(b.l, b.c);
      const adv = dir === 'long' ? entry - Math.min(b.l, b.c) : Math.max(b.h, b.c) - entry;
      if (fav > mfe) mfe = fav;
      if (adv > mae) mae = adv;
    });

    const finalPnl = dir === 'long' ? exit - entry : entry - exit;
    const mfeR = r0 ? mfe / r0 : null;
    const maeR = r0 ? -mae / r0 : null;
    const resultR = global.JR && JR.rMult ? JR.rMult(trade) : (r0 ? finalPnl / r0 : null);

    let timeInProfit = 0;
    slice.forEach(b => {
      const mid = (b.h + b.l) / 2;
      const ok = dir === 'long' ? mid > entry : mid < entry;
      if (ok) timeInProfit++;
    });
    const tipPct = slice.length ? timeInProfit / slice.length * 100 : null;

    const regime = trade.regime || '?';
    let danger = null;
    try {
      const h = JSON.parse(localStorage.getItem('md_danger_daily') || '[]');
      if (Array.isArray(h) && h.length) danger = h[h.length - 1].score;
    } catch(e){}

    return {
      sym: trade.sym,
      dir,
      entry, exit,
      mfe, mae,
      mfeR, maeR,
      resultR,
      timeInProfitPct: tipPct,
      bars: slice.length,
      regime,
      danger,
      source: trade.source,
      tags: trade.tags || [],
      notes: trade.notes || ''
    };
  }

  // suggestions — pe set de trade-uri analizate (min n)
  function suggestions(analyses){
    analyses = (analyses || []).filter(Boolean);
    const withR = analyses.filter(a => a.maeR != null);
    if (withR.length < 3) return [{ type: 'warn', text: 'Eșantion insuficient (n<3) — MAE/MFE pe trade unic nu e statistică (trader.md).' }];
    const outs = [];
    const avgMae = withR.reduce((s, a) => s + Math.abs(a.maeR), 0) / withR.length;
    const winners = withR.filter(a => a.resultR != null && a.resultR > 0);
    if (winners.length >= 3){
      const tight = winners.filter(a => a.maeR < -1).length / winners.length;
      if (tight > 0.6) outs.push({ type: 'sl', text: `${(tight*100).toFixed(0)}% din câștiguri au MAE < −1R — SL posibil prea strâns sau intrare târzie.` });
    }
    const losers = withR.filter(a => a.resultR != null && a.resultR < 0);
    if (losers.length >= 3){
      const late = losers.filter(a => a.mfeR != null && a.mfeR > 0.5).length / losers.length;
      if (late > 0.5) outs.push({ type: 'exit', text: `${(late*100).toFixed(0)}% din pierderi au avut MFE > +0.5R — ieșire prea târzie sau lipsă trailing.` });
    }
    if (avgMae > 1.2) outs.push({ type: 'entry', text: `MAE mediu ${avgMae.toFixed(2)}R — intrări în contra mișcării sau sizing prea mare.` });
    if (!outs.length) outs.push({ type: 'ok', text: 'Niciun pattern MAE/MFE evident pe eșantionul curent — continuă jurnalizarea.' });
    return outs;
  }

  global.PM = { tradeById, closedTrades, analyze, suggestions, rUnit };
})(typeof window !== 'undefined' ? window : globalThis);