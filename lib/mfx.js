/* lib/mfx.js — motorul MENTFX (EVC) portat din Pine `Mentfx Deck v1.1`.
 *
 * Aceleasi patru lentile, aceleasi praguri: structura rupta de CORP (context),
 * EMA 5/10/20 de pe TF-ul de validare (chart x6), Triple M (entry), volum.
 * Contextul de pe TF-ul mare are drept de VETO pe starea STRONG.
 *
 * Diferenta fata de Pine, declarata: TF-ul de validare se obtine agregand
 * barele primite (6 la 1), aliniat la ULTIMA bara, nu la ora de calendar.
 * Pe serii cu goluri (weekend, halt) gruparea nu coincide bara-cu-bara cu
 * TradingView. Directia si stack-ul EMA raman aceleasi; granitele pot diferi
 * cu o bara.
 *
 * Namespace: MFX.  Barele asteptate: [{o,h,l,c,v,t}] cronologic (formatul D.*).
 */
(function (global) {
  'use strict';

  var PRESETS = {
    Crypto:   { structLen: 5, entryWin: 3, volMult: 1.3, thrStrong: 75, thrEarly: 50, longOnly: false },
    Nasdaq:   { structLen: 6, entryWin: 3, volMult: 1.5, thrStrong: 80, thrEarly: 55, longOnly: true  },
    Intraday: { structLen: 4, entryWin: 2, volMult: 1.2, thrStrong: 70, thrEarly: 45, longOnly: false }
  };

  var DEFAULTS = {
    preset: 'Crypto',
    breakMode: 'close',   // 'close' | 'body' | 'wick'
    mmBody: 'body',       // 'body' (corp intreg) | 'close'
    emaLens: [5, 10, 20],
    evcMult: 6,
    volLen: 20, volLook: 50, volDollar: false,
    useHtfStruct: true,   // veto de context
    htfClosed: true       // ignora bara HTF in formare
  };

  function cfg(opts) {
    opts = opts || {};
    var p = PRESETS[opts.preset || DEFAULTS.preset] || PRESETS.Crypto;
    var o = {};
    Object.keys(DEFAULTS).forEach(function (k) { o[k] = opts[k] !== undefined ? opts[k] : DEFAULTS[k]; });
    Object.keys(p).forEach(function (k) { o[k] = opts[k] !== undefined ? opts[k] : p[k]; });
    // pe Custom userul poate inversa pragurile -> starea EARLY ar deveni inaccesibila
    o.thrEarly = Math.min(o.thrEarly, o.thrStrong);
    return o;
  }

  /* Agregare N:1, aliniata la ULTIMA bara (grupele incomplete cad de la inceput). */
  function aggregate(bars, n) {
    if (!Array.isArray(bars) || n < 2) return (bars || []).slice();
    var out = [], start = bars.length % n;
    for (var i = start; i + n <= bars.length; i += n) {
      var hi = -Infinity, lo = Infinity, vol = 0;
      for (var k = i; k < i + n; k++) {
        if (bars[k].h > hi) hi = bars[k].h;
        if (bars[k].l < lo) lo = bars[k].l;
        vol += (bars[k].v || 0);
      }
      out.push({ o: bars[i].o, h: hi, l: lo, c: bars[i + n - 1].c, v: vol, t: bars[i].t });
    }
    return out;
  }

  function ema(vals, len) {
    if (!vals.length || len < 1) return [];
    var k = 2 / (len + 1), out = new Array(vals.length), acc = 0;
    for (var i = 0; i < vals.length; i++) {
      if (i < len) { acc += vals[i]; out[i] = i === len - 1 ? acc / len : null; }
      else out[i] = vals[i] * k + out[i - 1] * (1 - k);
    }
    return out;
  }

  function probe(b, mode, up) {
    if (mode === 'wick') return up ? b.h : b.l;
    if (mode === 'body') return up ? Math.max(b.o, b.c) : Math.min(b.o, b.c);
    return b.c;
  }

  /* Structura: pivoti confirmati la +len bare, ruptura contabilizata pe CORP.
     Latch-ul se schimba doar cand directia se inverseaza (continuarea nu e BOS). */
  function structure(bars, len, mode) {
    var hi = null, lo = null, dir = 0, dirIdx = null;
    for (var i = 0; i < bars.length; i++) {
      var c = i - len;                       // centrul ferestrei, confirmat abia acum
      if (c >= len) {
        var isPH = true, isPL = true;
        for (var k = c - len; k <= c + len; k++) {
          if (k === c) continue;
          if (bars[k].h >= bars[c].h) isPH = false;
          if (bars[k].l <= bars[c].l) isPL = false;
          if (!isPH && !isPL) break;
        }
        if (isPH) hi = bars[c].h;
        if (isPL) lo = bars[c].l;
      }
      var up = probe(bars[i], mode, true), dn = probe(bars[i], mode, false);
      if (hi !== null && up > hi && dir !== 1) { dir = 1; dirIdx = i; }
      if (lo !== null && dn < lo && dir !== -1) { dir = -1; dirIdx = i; }
    }
    return { dir: dir, hi: hi, lo: lo, age: dirIdx === null ? 0 : bars.length - 1 - dirIdx };
  }

  /* Triple M: acumulare = minim sub bara precedenta cu corpul ramas DEASUPRA lui low[1];
     distributie = simetric. Intoarce varsta ultimului semnal, in bare. */
  function tripleM(bars, mmBody) {
    var accAge = null, disAge = null, last = bars.length - 1;
    for (var i = 1; i < bars.length; i++) {
      var b = bars[i], p = bars[i - 1];
      var bLo = mmBody === 'body' ? Math.min(b.o, b.c) : b.c;
      var bHi = mmBody === 'body' ? Math.max(b.o, b.c) : b.c;
      if (b.l < p.l && bLo > p.l) accAge = last - i;
      if (b.h > p.h && bHi < p.h) disAge = last - i;
    }
    return { accAge: accAge, disAge: disAge };
  }

  function evaluate(bars, opts) {
    var o = cfg(opts);
    var need = Math.max(o.structLen * 2 + 2, o.volLen, o.volLook) + o.emaLens[2] * o.evcMult + 10;
    if (!Array.isArray(bars) || bars.length < need)
      return { ok: false, reason: 'istoric insuficient (' + (bars ? bars.length : 0) + '/' + need + ' bare)' };

    var last = bars[bars.length - 1];

    // CONTEXT: structura pe TF-ul de intrare
    var st = structure(bars, o.structLen, o.breakMode);

    // VALIDARE: EMA + structura de pe TF-ul agregat x6
    var htf = aggregate(bars, o.evcMult);
    if (o.htfClosed && htf.length > 1) htf = htf.slice(0, -1);   // fara bara HTF in formare
    if (htf.length < o.emaLens[2] + o.structLen * 2 + 2)
      return { ok: false, reason: 'istoric HTF insuficient' };
    var hc = htf.map(function (b) { return b.c; });
    var eF = ema(hc, o.emaLens[0]), eM = ema(hc, o.emaLens[1]), eS = ema(hc, o.emaLens[2]);
    var f = eF[eF.length - 1], m = eM[eM.length - 1], s = eS[eS.length - 1];
    var emaReady = f != null && m != null && s != null;
    var stackUp = emaReady && f > m && m > s, stackDn = emaReady && f < m && m < s;
    var emaDir = stackUp ? 1 : stackDn ? -1 : 0;
    var htfSt = o.useHtfStruct ? structure(htf, o.structLen, o.breakMode) : { dir: 0 };

    // ENTRY: Triple M
    var mm = tripleM(bars, o.mmBody);
    var accFresh = mm.accAge !== null && mm.accAge <= o.entryWin;
    var disFresh = mm.disAge !== null && mm.disAge <= o.entryWin;

    // VOLUM
    var vSeries = bars.map(function (b) { return o.volDollar ? (b.v || 0) * b.c : (b.v || 0); });
    var volMissing = !vSeries[vSeries.length - 1];
    var volAvg = 0;
    for (var i = vSeries.length - o.volLen; i < vSeries.length; i++) volAvg += vSeries[i];
    volAvg /= o.volLen;
    var volNow = vSeries[vSeries.length - 1];
    var volRatio = (volMissing || !(volAvg > 0)) ? null : volNow / volAvg;
    var volMax = Math.max.apply(null, vSeries.slice(-o.volLook));
    var volOk = volRatio !== null && volRatio >= o.volMult;

    // SCOR EVC
    var dirCand = st.dir !== 0 ? st.dir : emaDir;
    var scCtx = dirCand === 0 ? 0 : st.dir === dirCand ? 100 : st.dir === 0 ? 40 : 0;

    var scVal = 0;
    if (dirCand === 1) {
      var pOk = emaReady && last.c > s;
      scVal = (stackUp && pOk) ? 100 : stackUp ? 70 : (emaReady && f > s) ? 55 : pOk ? 35 : 0;
    } else if (dirCand === -1) {
      var pOkS = emaReady && last.c < s;
      scVal = (stackDn && pOkS) ? 100 : stackDn ? 70 : (emaReady && f < s) ? 55 : pOkS ? 35 : 0;
    }

    var scEnt = 0;
    if (dirCand === 1 && accFresh) scEnt = 100 * (1 - mm.accAge / (o.entryWin + 1));
    else if (dirCand === -1 && disFresh) scEnt = 100 * (1 - mm.disAge / (o.entryWin + 1));

    var scVol = (volMissing || volRatio === null) ? 50 : Math.min(100, volRatio / o.volMult * 70);

    var score = dirCand === 0 ? 0 : 0.30 * scCtx + 0.30 * scVal + 0.25 * scEnt + 0.15 * scVol;

    // STARE
    var htfConflict = htfSt.dir !== 0 && dirCand !== 0 && htfSt.dir !== dirCand;
    var gateL = dirCand === 1 && st.dir === 1 && emaDir === 1 && accFresh && !htfConflict;
    var gateS = dirCand === -1 && st.dir === -1 && emaDir === -1 && disFresh && !htfConflict;

    var state = 0;
    if (dirCand === 1) state = (score >= o.thrStrong && gateL) ? 2 : score >= o.thrEarly ? 1 : 0;
    else if (dirCand === -1) state = (score >= o.thrStrong && gateS) ? -2 : score >= o.thrEarly ? -1 : 0;

    var shortIsExit = o.longOnly;
    var stateTxt = state === 2 ? 'STRONG LONG' : state === 1 ? 'EARLY LONG'
      : state === -2 ? (shortIsExit ? 'IESIRE' : 'STRONG SHORT')
      : state === -1 ? (shortIsExit ? 'SLABESTE' : 'EARLY SHORT') : 'NEUTRAL';

    // CE LIPSESTE
    var lipsa = [];
    if (dirCand === 0) lipsa.push('fara directie');
    else {
      if (htfConflict) lipsa.push('VETO structura HTF');
      if (st.dir !== dirCand) lipsa.push('structura');
      if ((dirCand === 1 && emaDir !== 1) || (dirCand === -1 && emaDir !== -1)) lipsa.push('stack EMA');
      if ((dirCand === 1 && !accFresh) || (dirCand === -1 && !disFresh)) lipsa.push('Triple M');
      if (!volOk && !volMissing) lipsa.push('volum');
    }

    return {
      ok: true, state: state, stateTxt: stateTxt, score: score, dir: dirCand,
      comp: { ctx: scCtx, val: scVal, ent: scEnt, vol: scVol },
      ctxDir: st.dir, ctxAge: st.age, htfDir: htfSt.dir, htfConflict: htfConflict,
      emaDir: emaDir, ema: { f: f, m: m, s: s },
      levels: { hi: st.hi, lo: st.lo },
      entryAge: dirCand === 1 ? mm.accAge : dirCand === -1 ? mm.disAge : null,
      volRatio: volRatio, volMissing: volMissing,
      volOfMax: volMax > 0 && !volMissing ? volNow / volMax * 100 : null,
      lipsa: lipsa, price: last.c, t: last.t,
      htfBars: htf.length, longOnly: o.longOnly, cfg: o
    };
  }

  global.MFX = {
    PRESETS: PRESETS, DEFAULTS: DEFAULTS,
    aggregate: aggregate, ema: ema, structure: structure, tripleM: tripleM,
    evaluate: evaluate
  };
})(typeof window !== 'undefined' ? window : globalThis);
