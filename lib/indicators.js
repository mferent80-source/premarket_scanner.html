// ═══════════════════════════════════════════════════════════════════
// indicators.js — Indicatori tehnici comuni pentru crypto + nasdaq scanner
// Implementare standard (Wilder smoothing) extrasă din crypto-scanner v3.5.3.
// Folosire: <script src="../lib/indicators.js"></script> apoi TI.calcRSI(closes, 14) etc.
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';

  // RSI(14) — Wilder smoothing (formula corectă, nu SMA)
  function calcRSI(closes, period){
    period = period || 14;
    if(!closes || closes.length < period + 1) return 50;
    let avgG = 0, avgL = 0;
    for(let i = 1; i <= period; i++){
      const d = closes[i] - closes[i-1];
      if(d > 0) avgG += d; else avgL -= d;
    }
    avgG /= period; avgL /= period;
    for(let i = period + 1; i < closes.length; i++){
      const d = closes[i] - closes[i-1];
      avgG = (avgG * (period - 1) + (d > 0 ? d : 0)) / period;
      avgL = (avgL * (period - 1) + (d < 0 ? -d : 0)) / period;
    }
    if(avgL === 0) return 100;
    const rs = avgG / avgL;
    return 100 - (100 / (1 + rs));
  }

  // EMA — seed cu SMA pe primele N perioade, factor k = 2/(N+1)
  function calcEMA(values, period){
    if(!values || values.length < period) return null;
    const k = 2 / (period + 1);
    let e = values.slice(0, period).reduce((a,b) => a+b, 0) / period;
    const out = [e];
    for(let i = period; i < values.length; i++){
      e = values[i] * k + e * (1 - k);
      out.push(e);
    }
    return out;
  }

  // SMA — medie aritmetică simplă pe ultimele N
  function calcSMA(values, period){
    if(!values || values.length < period) return null;
    const slice = values.slice(-period);
    return slice.reduce((a,b) => a+b, 0) / period;
  }

  // ATR — Wilder smoothing pe True Range = max(H-L, |H-Cprev|, |L-Cprev|)
  function calcATR(highs, lows, closes, period){
    period = period || 14;
    if(highs.length < period + 1) return 0;
    const trs = [];
    for(let i = 1; i < highs.length; i++){
      const h = highs[i], l = lows[i], pc = closes[i-1];
      trs.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)));
    }
    // Seed: SMA pe primele N TR
    let atr = trs.slice(0, period).reduce((a,b) => a+b, 0) / period;
    // Wilder: ATR_i = (ATR_{i-1} * (N-1) + TR_i) / N
    for(let i = period; i < trs.length; i++){
      atr = (atr * (period - 1) + trs[i]) / period;
    }
    return atr;
  }

  // MACD(12, 26, 9) standard
  function calcMACD(closes, fast, slow, signal){
    fast = fast || 12; slow = slow || 26; signal = signal || 9;
    if(closes.length < slow + signal) return null;
    const fastE = calcEMA(closes, fast);
    const slowE = calcEMA(closes, slow);
    const offset = slow - fast;
    const macdLine = fastE.slice(offset).map((v, i) => v - slowE[i]);
    const signalLine = calcEMA(macdLine, signal);
    if(!signalLine) return null;
    const sigOffset = macdLine.length - signalLine.length;
    const last = macdLine.length - 1;
    const macd = macdLine[last];
    const sig = signalLine[signalLine.length - 1];
    const prevMacd = macdLine[last - 1];
    const prevSig = signalLine[signalLine.length - 2];
    return {
      macd, signal: sig, hist: macd - sig,
      bullCross: prevMacd <= prevSig && macd > sig,
      bearCross: prevMacd >= prevSig && macd < sig
    };
  }

  // Bollinger Bands (20, 2σ) — population std
  function calcBB(closes, period, mult){
    period = period || 20; mult = mult || 2;
    if(closes.length < period) return null;
    const slice = closes.slice(-period);
    const sma = slice.reduce((a,b) => a+b, 0) / period;
    const variance = slice.reduce((s, v) => s + (v - sma) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    const upper = sma + mult * sd;
    const lower = sma - mult * sd;
    const last = closes[closes.length - 1];
    return {
      upper, sma, lower,
      pctB: (last - lower) / (upper - lower),
      bandwidth: (upper - lower) / sma * 100
    };
  }

  // ADX(14) — Wilder smoothing pe TR, +DM, -DM, DX
  function calcADX(highs, lows, closes, period){
    period = period || 14;
    if(highs.length < period * 2) return 0;
    const trs = [], plusDM = [], minusDM = [];
    for(let i = 1; i < highs.length; i++){
      const upMove = highs[i] - highs[i-1];
      const downMove = lows[i-1] - lows[i];
      plusDM.push((upMove > downMove && upMove > 0) ? upMove : 0);
      minusDM.push((downMove > upMove && downMove > 0) ? downMove : 0);
      const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1]));
      trs.push(tr);
    }
    // Wilder smoothing
    const smooth = (arr) => {
      let s = arr.slice(0, period).reduce((a,b) => a+b, 0);
      const out = [s];
      for(let i = period; i < arr.length; i++){
        s = s - (s / period) + arr[i];
        out.push(s);
      }
      return out;
    };
    const trS = smooth(trs);
    const plusDMS = smooth(plusDM);
    const minusDMS = smooth(minusDM);
    const dx = [];
    for(let i = 0; i < trS.length; i++){
      const plusDI = (plusDMS[i] / trS[i]) * 100;
      const minusDI = (minusDMS[i] / trS[i]) * 100;
      const sum = plusDI + minusDI;
      dx.push(sum > 0 ? Math.abs(plusDI - minusDI) / sum * 100 : 0);
    }
    if(dx.length < period) return 0;
    let adx = dx.slice(0, period).reduce((a,b) => a+b, 0) / period;
    for(let i = period; i < dx.length; i++){
      adx = (adx * (period - 1) + dx[i]) / period;
    }
    return adx;
  }

  // VWAP cu σ-bands (volume-weighted)
  function calcVWAP(highs, lows, closes, volumes){
    if(!highs.length) return null;
    let totalVP = 0, totalV = 0;
    const tps = [];
    for(let i = 0; i < highs.length; i++){
      const tp = (highs[i] + lows[i] + closes[i]) / 3;
      tps.push({tp, v: volumes[i]});
      totalVP += tp * volumes[i];
      totalV += volumes[i];
    }
    if(totalV === 0) return null;
    const vwap = totalVP / totalV;
    let weightedVar = 0;
    tps.forEach(p => { weightedVar += p.v * (p.tp - vwap) ** 2; });
    const sigma = Math.sqrt(weightedVar / totalV);
    return { vwap, sigma, upper1: vwap + sigma, lower1: vwap - sigma, upper2: vwap + 2*sigma, lower2: vwap - 2*sigma };
  }

  // Detect divergență RSI cu swing-points (P=2 fereastră, MIN_SEP=5 bare)
  function detectRSIDivergence(closes, period){
    period = period || 14;
    if(closes.length < period + 30) return null;
    const len = closes.length;
    const LOOKBACK = 40;
    const startI = Math.max(period + 1, len - LOOKBACK);
    const series = [];
    for(let i = startI; i < len; i++){
      const r = calcRSI(closes.slice(0, i+1), period);
      if(typeof r === 'number' && !isNaN(r)){
        series.push({ idx: i, price: closes[i], rsi: r });
      }
    }
    if(series.length < 12) return null;
    const P = 2;
    const swingLows = [], swingHighs = [];
    for(let i = P; i < series.length - P; i++){
      const c = series[i];
      let isLow = true, isHigh = true;
      for(let j = -P; j <= P; j++){
        if(j === 0) continue;
        if(series[i+j].price < c.price) isLow = false;
        if(series[i+j].price > c.price) isHigh = false;
      }
      if(isLow) swingLows.push(c);
      if(isHigh) swingHighs.push(c);
    }
    const MIN_SEP = 5;
    let bullish = false;
    if(swingLows.length >= 2){
      const a = swingLows[swingLows.length-2], b = swingLows[swingLows.length-1];
      if(b.idx - a.idx >= MIN_SEP && b.price < a.price && b.rsi > a.rsi) bullish = true;
    }
    let bearish = false;
    if(swingHighs.length >= 2){
      const a = swingHighs[swingHighs.length-2], b = swingHighs[swingHighs.length-1];
      if(b.idx - a.idx >= MIN_SEP && b.price > a.price && b.rsi < a.rsi) bearish = true;
    }
    if(!bullish && !bearish) return null;
    return { bullish, bearish };
  }

  // Export pe global namespace TI (Technical Indicators)
  global.TI = {
    calcRSI, calcEMA, calcSMA, calcATR, calcMACD, calcBB, calcADX, calcVWAP,
    detectRSIDivergence
  };
})(typeof window !== 'undefined' ? window : globalThis);
