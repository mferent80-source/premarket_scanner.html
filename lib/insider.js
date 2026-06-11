// ═══════════════════════════════════════════════════════════════════
// insider.js — SURSA UNICĂ DE ADEVĂR pentru tranzacțiile insider (Form 4 / Finnhub)
//
// Regula de clasificare a divergat istoric în 5 pagini (earnings-hub, smart-trade-long,
// pump-radar, watchlist-monitor, market-events) și a fost realiniată separat în fiecare
// la auditurile din 2026-06. De acum trăiește AICI o singură dată:
//   • P       = buy real (decizie de cumpărare cu bani)
//   • A       = award/grant (acțiuni GRATIS la vesting) → EXCLUS complet (nu e semnal)
//   • S/D/F/G = sell-like (S vânzare, D dispoziție, F tax-withholding, G gift)
//   • fără cod (Finnhub free îl omite frecvent) → fallback pe semnul `change`
//
// Folosire: <script src="../lib/insider.js"></script> apoi
//   INS.classify(t)                 → 'buy' | 'sell' | null (t = o tranzacție Finnhub)
//   await INS.fetchTx('AAPL', {days:60})  → array tranzacții (sau null la eșec/fără cheie)
//   INS.analyze(txs)                → agregat standard {buys, sells, buyPeople, netShares, verdict, cluster, top}
// Paginile își păstrează agregarea/verdictele proprii unde diferă legitim — dar
// clasificarea per-tranzacție vine de aici.
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';

  function classify(t){
    const code = ((t && t.transactionCode) || '').toUpperCase();
    const chg = Number(t && t.change) || 0;
    if (code === 'A') return null;                                            // grant — exclus
    if (code === 'P') return 'buy';
    if (code === 'S' || code === 'D' || code === 'F' || code === 'G') return 'sell';
    if (chg > 0) return 'buy';
    if (chg < 0) return 'sell';
    return null;
  }

  // Fetch direct la Finnhub (are CORS deschis — nu trebuie proxy).
  // opts: { days:60, to:'YYYY-MM-DD', key, timeout:9000 }
  async function fetchTx(symbol, opts){
    opts = opts || {};
    let key = opts.key;
    if (!key){ try { key = localStorage.getItem('finnhub_api_key') || ''; } catch (e) { key = ''; } }
    if (!key) return null;
    const days = opts.days || 60;
    const to = opts.to || new Date().toISOString().slice(0, 10);
    const fromD = new Date(to + 'T00:00:00Z');
    fromD.setUTCDate(fromD.getUTCDate() - days);
    const from = fromD.toISOString().slice(0, 10);
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), opts.timeout || 9000);
    try {
      const r = await fetch(`https://finnhub.io/api/v1/stock/insider-transactions?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${encodeURIComponent(key)}`, { signal: ctrl.signal });
      if (!r.ok) return null;
      const j = await r.json();
      return Array.isArray(j && j.data) ? j.data : (Array.isArray(j) ? j : []);
    } catch (e) { return null; }
    finally { clearTimeout(tm); }
  }

  // Agregat standard peste o listă de tranzacții (pentru consumatori noi / ledger).
  // Cluster = ≥2 persoane DISTINCTE care au cumpărat (semnalul smart-money clasic).
  function analyze(rows, opts){
    opts = opts || {};
    if (!Array.isArray(rows)) return null;
    let buys = 0, sells = 0, netShares = 0;
    const buyPeople = new Set(), sellPeople = new Set(), top = [];
    rows.forEach(t => {
      const kind = classify(t);
      if (!kind) return;
      const chg = Number(t.change) || 0;
      const person = ((t.name || '')).trim().toLowerCase();
      if (kind === 'buy'){ buys++; if (person) buyPeople.add(person); netShares += Math.abs(chg); }
      else { sells++; if (person) sellPeople.add(person); netShares -= Math.abs(chg); }
      if (top.length < (opts.topN || 8)){
        top.push({ name: t.name || '?', code: ((t.transactionCode || '')).toUpperCase(), date: t.transactionDate || t.filingDate || '', change: chg, price: Number(t.transactionPrice) || null, buy: kind === 'buy' });
      }
    });
    let verdict = 'neut';
    if (buyPeople.size >= 2 && netShares > 0) verdict = 'bull';
    else if (sells >= 2 && netShares < 0 && sells >= buys) verdict = 'bear';
    return { buys, sells, buyPeople: buyPeople.size, sellPeople: sellPeople.size, netShares, verdict, cluster: buyPeople.size >= 2, top, n: rows.length };
  }

  global.INS = { classify, fetchTx, analyze };
})(typeof window !== 'undefined' ? window : globalThis);
