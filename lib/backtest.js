// ═══════════════════════════════════════════════════════════════════
// backtest.js — Validare GENERICĂ de semnal pentru scannere (BT.*)
// Răspunde la întrebarea pe care scannerele n-o pun: „semnalul ăsta chiar
// precede mișcări, sau e zgomot?" — exact ca markov-lab pentru lanțul discret.
//
// Filozofie: orice regulă de alertă (pump, vol-spike, breakout, score>X) e o
// funcție booleană/direcțională pe bare. O testăm out-of-the-box pe istoric:
// la fiecare semnal, măsurăm randamentul forward și-l comparăm cu baseline.
//
// Folosire: <script src="../lib/backtest.js"></script>
//   const res = BT.signal(ohlc, (bars,i)=> bars[i].c/bars[i-1].c-1 > 0.03, {horizon:6});
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';

  // signal — testează un semnal pe o serie OHLC.
  //   ohlc: [{o,h,l,c,v}], signalFn(bars, i) → number (+1 long, -1 short, 0/false none)
  //   opts: { horizon:5 (bare înainte), maxBars?, side?: 'long'|'both' }
  // Returnează { n, avgPct, hitPct, t, totPct, baselineAvgPct, edgePct, medianPct,
  //              avgMFE, avgMAE, horizon }
  function signal(ohlc, signalFn, opts){
    opts = opts || {};
    const H = opts.horizon || 5;
    const N = ohlc.length;
    const rets = [], mfe = [], mae = [];
    let baseSum = 0, baseN = 0;
    for (let i = 1; i < N - H; i++){
      // baseline = randamentul forward necondiționat (orice bară) — bara de comparație
      const fwdAll = ohlc[i + H].c / ohlc[i].c - 1;
      baseSum += fwdAll; baseN++;

      let s = signalFn(ohlc, i);
      if (s === true) s = 1; else if (s === false || s == null) s = 0;
      if (!s) continue;
      const entry = ohlc[i].c;
      const r = s * (ohlc[i + H].c / entry - 1);
      rets.push(r);
      // MFE/MAE = mișcarea favorabilă/adversă maximă în orizont (pe direcția semnalului)
      let hi = -Infinity, lo = Infinity;
      for (let k = 1; k <= H; k++){ const rr = s * (ohlc[i + k].c / entry - 1); if (rr > hi) hi = rr; if (rr < lo) lo = rr; }
      mfe.push(hi); mae.push(lo);
    }
    return _agg(rets, mfe, mae, baseN ? baseSum / baseN : 0, H);
  }

  // horizonSweep — același semnal, mai multe orizonturi → vezi unde (dacă) e edge.
  //   Returnează [{horizon, n, avgPct, t, edgePct, hitPct}, ...]
  function horizonSweep(ohlc, signalFn, horizons){
    horizons = horizons || [1, 3, 5, 10, 20];
    return horizons.map(H => { const r = signal(ohlc, signalFn, { horizon: H }); return { horizon: H, n: r.n, avgPct: r.avgPct, t: r.t, edgePct: r.edgePct, hitPct: r.hitPct }; });
  }

  function _agg(rets, mfe, mae, baseline, H){
    const n = rets.length;
    if (!n) return { n: 0, avgPct: 0, hitPct: 0, t: 0, totPct: 0, baselineAvgPct: baseline * 100, edgePct: 0, medianPct: 0, avgMFE: 0, avgMAE: 0, horizon: H };
    const mean = rets.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    const sorted = rets.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(n / 2)];
    return {
      n,
      avgPct: mean * 100,
      hitPct: rets.filter(x => x > 0).length / n * 100,
      t: sd > 0 ? mean / (sd / Math.sqrt(n)) : 0,          // t-statistic naiv; |t|>2 ≈ semnificativ
      totPct: rets.reduce((a, b) => a + b, 0) * 100,
      baselineAvgPct: baseline * 100,
      edgePct: (mean - baseline) * 100,                     // cât bate semnalul peste „orice bară"
      medianPct: median * 100,
      avgMFE: mfe.reduce((a, b) => a + b, 0) / n * 100,
      avgMAE: mae.reduce((a, b) => a + b, 0) / n * 100,
      horizon: H
    };
  }

  // verdict — interpretare onestă a unui rezultat de backtest (text + clasă).
  function verdict(res){
    if (!res || res.n < 20) return { cls: 'warn', text: `Prea puține semnale (${res ? res.n : 0}) pentru o concluzie. Crește istoricul sau relaxează pragul.` };
    const sig = Math.abs(res.t) >= 2;
    if (res.edgePct > 0 && sig) return { cls: 'good', text: `✅ Edge real: +${res.edgePct.toFixed(2)}% peste baseline, t=${res.t.toFixed(2)} (semnificativ), hit ${res.hitPct.toFixed(0)}% pe ${res.n} semnale.` };
    if (res.edgePct > 0)        return { cls: 'warn', text: `🟡 Edge pozitiv (+${res.edgePct.toFixed(2)}%) dar NESEMNIFICATIV (t=${res.t.toFixed(2)}, ai nevoie de |t|>2). Promițător, nedovedit.` };
    return { cls: 'bad', text: `❌ Fără edge: ${res.edgePct.toFixed(2)}% vs baseline, t=${res.t.toFixed(2)}. Semnalul nu precede mișcări mai bune decât hazardul.` };
  }

  global.BT = { signal, horizonSweep, verdict };
})(typeof window !== 'undefined' ? window : globalThis);
