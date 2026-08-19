/* lib/mfx.js — motorul MENTFX (EVC) portat din Pine `Mentfx Deck v1.1`.
 *
 * Aceleasi patru lentile, aceleasi praguri: structura rupta de CORP (context),
 * EMA 5/10/20 de pe TF-ul de validare (chart x6), Triple M (entry), volum.
 * Contextul de pe TF-ul mare are drept de VETO pe starea STRONG.
 *
 * TF-ul de validare se construieste implicit pe GRANITE DE CALENDAR (ancorate
 * UTC, ca TradingView pe cripto), nu pe numarul de bare — asa gruparea nu se
 * muta cand se schimba cate bare ai descarcat, si backtestul devine posibil.
 * Alinierea pe numar de bare ramane disponibila (mode:'count') ca sa se poata
 * masura cat conteaza diferenta. Pe stocks intraday exista mode:'session',
 * care reseteaza contorul la fiecare zi de tranzactionare (ET) — asa face si
 * TradingView, care ancoreaza TF-urile intraday la deschiderea sesiunii.
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
    gateMode: 'classic',  // 'classic' (ctx+EMA+entry) | 'nof4' (oricare N din 4)
    gateNeed: 3,          // cate componente cere 'nof4'
    useHtfStruct: true,   // veto de context
    htfClosed: true,      // ignora bara HTF in formare
    aggMode: 'time',      // 'time' (calendar UTC) | 'session' (reset pe zi ET) | 'count' (N bare)
    tz: 'America/New_York'  // fusul sesiunii, pentru aggMode 'session'
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

  /* Pasul de timp al seriei = MEDIANA diferentelor (media ar fi trasa de weekend/halt). */
  function detectTfMs(bars) {
    if (!bars || bars.length < 3) return 0;
    var d = [], n = Math.min(bars.length - 1, 200), off = bars.length - 1 - n;
    for (var i = off + 1; i < bars.length; i++) {
      var dt = bars[i].t - bars[i - 1].t;
      if (dt > 0) d.push(dt);
    }
    if (!d.length) return 0;
    d.sort(function (a, b) { return a - b; });
    return d[Math.floor(d.length / 2)];
  }

  /* Agregare N:1.
     mode 'time' — grupare pe granite de calendar (ancorate UTC). Grupa initiala
       partiala si cea finala in formare sunt marcate prin `full:false`.
     mode 'count' — N bare consecutive, aliniate la ULTIMA bara.
     Fiecare bara agregata poarta `tEnd` = ora ultimei bare LTF din ea. */
  function aggregate(bars, n, opts) {
    opts = opts || {};
    if (!Array.isArray(bars) || !bars.length || n < 2) return (bars || []).slice();
    var mode = opts.mode || 'time';
    var tfMs = opts.tfMs || detectTfMs(bars);
    var out = [];

    if (mode === 'time' && tfMs > 0) {
      var span = tfMs * n, cur = null, curKey = null, cnt = 0;
      for (var i = 0; i < bars.length; i++) {
        var b = bars[i], key = Math.floor(b.t / span);
        if (key !== curKey) {
          if (cur) { cur.full = cnt === n; out.push(cur); }
          cur = { o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0, t: key * span, tEnd: b.t };
          curKey = key; cnt = 1;
        } else {
          if (b.h > cur.h) cur.h = b.h;
          if (b.l < cur.l) cur.l = b.l;
          cur.c = b.c; cur.v += (b.v || 0); cur.tEnd = b.t; cnt++;
        }
      }
      if (cur) { cur.full = cnt === n; out.push(cur); }
      // grupa initiala partiala nu e o bara HTF reala (istoricul incepe la mijlocul ei)
      if (out.length && out[0].full === false) out.shift();
      return out;
    }

    if (mode === 'session') {
      var fmt = null;
      try { fmt = new Intl.DateTimeFormat('en-CA', { timeZone: opts.tz || 'America/New_York' }); }
      catch (e) { fmt = null; }
      if (fmt) {
        var sc = null, scDay = null, scCnt = 0;
        for (var q = 0; q < bars.length; q++) {
          var bq = bars[q], day = fmt.format(new Date(bq.t));
          if (sc === null || day !== scDay || scCnt >= n) {
            if (sc) { sc.full = scCnt === n; out.push(sc); }
            sc = { o: bq.o, h: bq.h, l: bq.l, c: bq.c, v: bq.v || 0, t: bq.t, tEnd: bq.t };
            scDay = day; scCnt = 1;
          } else {
            if (bq.h > sc.h) sc.h = bq.h;
            if (bq.l < sc.l) sc.l = bq.l;
            sc.c = bq.c; sc.v += (bq.v || 0); sc.tEnd = bq.t; scCnt++;
          }
        }
        if (sc) { sc.full = scCnt === n; out.push(sc); }
        return out;
      }
      // fara Intl nu putem sti ziua de tranzactionare — cadem pe calendar UTC
      return aggregate(bars, n, { mode: 'time', tfMs: tfMs });
    }

    var start = bars.length % n;
    for (var j = start; j + n <= bars.length; j += n) {
      var hi = -Infinity, lo = Infinity, vol = 0;
      for (var k = j; k < j + n; k++) {
        if (bars[k].h > hi) hi = bars[k].h;
        if (bars[k].l < lo) lo = bars[k].l;
        vol += (bars[k].v || 0);
      }
      out.push({ o: bars[j].o, h: hi, l: lo, c: bars[j + n - 1].c, v: vol,
                 t: bars[j].t, tEnd: bars[j + n - 1].t, full: true });
    }
    return out;
  }

  /* EMA — array de aceeasi lungime, null pana la warm-up. */
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
     Latch-ul se schimba doar cand directia se inverseaza (continuarea nu e BOS).
     Intoarce si SERIA de directii — de aici traieste backtestul. */
  function structureSeries(bars, len, mode) {
    var hi = null, lo = null, dir = 0, dirIdx = null;
    var dirs = new Array(bars.length), ages = new Array(bars.length);
    var his = new Array(bars.length), los = new Array(bars.length);
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
      dirs[i] = dir; ages[i] = dirIdx === null ? 0 : i - dirIdx; his[i] = hi; los[i] = lo;
    }
    return { dirs: dirs, ages: ages, his: his, los: los,
             dir: dir, hi: hi, lo: lo, age: dirIdx === null ? 0 : bars.length - 1 - dirIdx };
  }
  function structure(bars, len, mode) { return structureSeries(bars, len, mode); }

  /* Triple M: acumulare = minim sub bara precedenta cu corpul ramas DEASUPRA lui low[1];
     distributie = simetric. Seriile poarta varsta ultimului semnal, in bare. */
  function tripleMSeries(bars, mmBody) {
    var accA = new Array(bars.length), disA = new Array(bars.length);
    var lastAcc = null, lastDis = null;
    for (var i = 0; i < bars.length; i++) {
      if (i > 0) {
        var b = bars[i], p = bars[i - 1];
        var bLo = mmBody === 'body' ? Math.min(b.o, b.c) : b.c;
        var bHi = mmBody === 'body' ? Math.max(b.o, b.c) : b.c;
        if (b.l < p.l && bLo > p.l) lastAcc = i;
        if (b.h > p.h && bHi < p.h) lastDis = i;
      }
      accA[i] = lastAcc === null ? null : i - lastAcc;
      disA[i] = lastDis === null ? null : i - lastDis;
    }
    return { accAges: accA, disAges: disA,
             accAge: accA[accA.length - 1], disAge: disA[disA.length - 1] };
  }
  function tripleM(bars, mmBody) { return tripleMSeries(bars, mmBody); }

  /* Scorul si starea dintr-un set de componente deja calculate. Aceleasi
     ponderi si praguri ca in Pine — un singur loc, folosit si de evaluate si
     de series, ca cele doua sa nu poata diverge. */
  function verdict(c, o) {
    var dirCand = c.ctxDir !== 0 ? c.ctxDir : c.emaDir;
    var scCtx = dirCand === 0 ? 0 : c.ctxDir === dirCand ? 100 : c.ctxDir === 0 ? 40 : 0;

    var scVal = 0, pOk;
    if (dirCand === 1) {
      pOk = c.emaReady && c.price > c.emaS;
      scVal = (c.emaDir === 1 && pOk) ? 100 : c.emaDir === 1 ? 70 : (c.emaReady && c.emaF > c.emaS) ? 55 : pOk ? 35 : 0;
    } else if (dirCand === -1) {
      pOk = c.emaReady && c.price < c.emaS;
      scVal = (c.emaDir === -1 && pOk) ? 100 : c.emaDir === -1 ? 70 : (c.emaReady && c.emaF < c.emaS) ? 55 : pOk ? 35 : 0;
    }

    var accFresh = c.accAge !== null && c.accAge <= o.entryWin;
    var disFresh = c.disAge !== null && c.disAge <= o.entryWin;
    var scEnt = 0;
    if (dirCand === 1 && accFresh) scEnt = 100 * (1 - c.accAge / (o.entryWin + 1));
    else if (dirCand === -1 && disFresh) scEnt = 100 * (1 - c.disAge / (o.entryWin + 1));

    var volOk = c.volRatio !== null && c.volRatio >= o.volMult;
    var scVol = c.volRatio === null ? 50 : Math.min(100, c.volRatio / o.volMult * 70);

    var score = dirCand === 0 ? 0 : 0.30 * scCtx + 0.30 * scVal + 0.25 * scEnt + 0.15 * scVol;

    var htfDir = o.useHtfStruct ? c.htfDir : 0;
    var htfConflict = htfDir !== 0 && dirCand !== 0 && htfDir !== dirCand;

    /* GATE-ul, explicit. Masuratoarea de sweep a aratat ca pragul de scor e
       aproape inert (intre 65 si 80 frecventa abia se misca): cand gate-ul
       trece, scorul iese oricum ~89. Deci lucrul care filtreaza e AICI, si
       trebuie sa fie reglabil — nu ascuns intr-un `&&` fix.
         'classic' = ctx + EMA + entry obligatorii, volumul optional (v1/v2)
         'nof4'    = oricare `gateNeed` din cele 4 componente */
    var bits = {
      ctx: dirCand !== 0 && c.ctxDir === dirCand,
      val: dirCand !== 0 && c.emaDir === dirCand,
      ent: dirCand === 1 ? accFresh : dirCand === -1 ? disFresh : false,
      vol: volOk
    };
    var bitsN = (bits.ctx ? 1 : 0) + (bits.val ? 1 : 0) + (bits.ent ? 1 : 0) + (bits.vol ? 1 : 0);
    var gateOk = dirCand !== 0 && !htfConflict &&
      (o.gateMode === 'nof4' ? bitsN >= o.gateNeed : (bits.ctx && bits.val && bits.ent));

    var state = 0;
    if (dirCand === 1) state = (score >= o.thrStrong && gateOk) ? 2 : score >= o.thrEarly ? 1 : 0;
    else if (dirCand === -1) state = (score >= o.thrStrong && gateOk) ? -2 : score >= o.thrEarly ? -1 : 0;

    var lipsa = [];
    if (dirCand === 0) lipsa.push('fara directie');
    else {
      if (htfConflict) lipsa.push('VETO structura HTF');
      if (c.ctxDir !== dirCand) lipsa.push('structura');
      if ((dirCand === 1 && c.emaDir !== 1) || (dirCand === -1 && c.emaDir !== -1)) lipsa.push('stack EMA');
      if (!accFresh && dirCand === 1) lipsa.push('Triple M');
      if (!disFresh && dirCand === -1) lipsa.push('Triple M');
      if (!volOk && c.volRatio !== null) lipsa.push('volum');
    }

    var stateTxt = state === 2 ? 'STRONG LONG' : state === 1 ? 'EARLY LONG'
      : state === -2 ? (o.longOnly ? 'IESIRE' : 'STRONG SHORT')
      : state === -1 ? (o.longOnly ? 'SLABESTE' : 'EARLY SHORT') : 'NEUTRAL';

    return { dir: dirCand, score: score, state: state, stateTxt: stateTxt,
             comp: { ctx: scCtx, val: scVal, ent: scEnt, vol: scVol },
             bits: bits, bitsN: bitsN, gateOk: gateOk,
             htfConflict: htfConflict, htfDir: htfDir, lipsa: lipsa,
             entryAge: dirCand === 1 ? c.accAge : dirCand === -1 ? c.disAge : null };
  }

  function minBars(o) {
    return Math.max(o.structLen * 2 + 2, o.volLen, o.volLook) + o.emaLens[2] * o.evcMult + 10;
  }

  /* series — starea la FIECARE bara, intr-o singura trecere.
     Fiecare bara LTF citeste ultima bara HTF INCHISA (cu htfClosed), exact ca
     request.security cu lookahead_off: niciun element din viitor. */
  function series(bars, opts) {
    var o = cfg(opts);
    if (!Array.isArray(bars) || bars.length < minBars(o))
      return { ok: false, reason: 'istoric insuficient (' + (bars ? bars.length : 0) + '/' + minBars(o) + ' bare)' };

    var tfMs = detectTfMs(bars);
    var htf = aggregate(bars, o.evcMult, { mode: o.aggMode, tfMs: tfMs, tz: o.tz });
    if (htf.length < o.emaLens[2] + o.structLen * 2 + 2)
      return { ok: false, reason: 'istoric HTF insuficient (' + htf.length + ' bare)' };

    var hc = htf.map(function (b) { return b.c; });
    var eF = ema(hc, o.emaLens[0]), eM = ema(hc, o.emaLens[1]), eS = ema(hc, o.emaLens[2]);
    var hSt = structureSeries(htf, o.structLen, o.breakMode);

    var st = structureSeries(bars, o.structLen, o.breakMode);
    var mm = tripleMSeries(bars, o.mmBody);

    // volum rolling (media pe volLen) + maximul pe volLook
    var vS = new Array(bars.length), sum = 0;
    for (var i = 0; i < bars.length; i++) vS[i] = o.volDollar ? (bars[i].v || 0) * bars[i].c : (bars[i].v || 0);

    var out = new Array(bars.length), hp = -1;
    for (var n = 0; n < bars.length; n++) {
      // avanseaza pointerul HTF cat timp bara HTF urmatoare s-a INCHIS deja
      while (hp + 1 < htf.length && htf[hp + 1].tEnd <= bars[n].t) hp++;
      var hi = o.htfClosed ? hp : Math.min(hp + 1, htf.length - 1);
      // fara istoric HTF suficient nu exista validare — bara ramane neevaluata
      if (hi < o.emaLens[2] - 1) { out[n] = null; continue; }

      sum += vS[n];
      if (n >= o.volLen) sum -= vS[n - o.volLen];
      var avg = n >= o.volLen - 1 ? sum / o.volLen : null;
      var volNow = vS[n];
      var volRatio = (!volNow || !avg || avg <= 0) ? null : volNow / avg;

      var f = eF[hi], m = eM[hi], s = eS[hi];
      var ready = f != null && m != null && s != null;

      var raw = {
        ctxDir: st.dirs[n], price: bars[n].c,
        emaReady: ready, emaF: f, emaM: m, emaS: s,
        emaDir: ready ? (f > m && m > s ? 1 : f < m && m < s ? -1 : 0) : 0,
        htfDir: hSt.dirs[hi],
        accAge: mm.accAges[n], disAge: mm.disAges[n],
        volRatio: volRatio
      };
      var v = verdict(raw, o);
      v.raw = raw;                          // pragurile se pot re-aplica fara recalcul
      v.i = n; v.t = bars[n].t; v.price = bars[n].c;
      v.ctxDir = st.dirs[n]; v.ctxAge = st.ages[n];
      v.emaDir = ready ? (f > m && m > s ? 1 : f < m && m < s ? -1 : 0) : 0;
      v.ema = { f: f, m: m, s: s };
      v.volRatio = volRatio;
      out[n] = v;
    }

    return { ok: true, states: out, htfBars: htf.length, tfMs: tfMs, cfg: o,
             levels: { hi: st.hi, lo: st.lo } };
  }

  /* evaluate — starea pe ULTIMA bara. Acelasi rezultat ca series()[last]. */
  function evaluate(bars, opts) {
    var s = series(bars, opts);
    if (!s.ok) return { ok: false, reason: s.reason };
    var last = null;
    for (var i = s.states.length - 1; i >= 0; i--) { if (s.states[i]) { last = s.states[i]; break; } }
    if (!last) return { ok: false, reason: 'nicio bara evaluabila' };
    var b = bars[bars.length - 1];
    var vMax = 0, volLook = s.cfg.volLook;
    for (var k = Math.max(0, bars.length - volLook); k < bars.length; k++) {
      var vv = s.cfg.volDollar ? (bars[k].v || 0) * bars[k].c : (bars[k].v || 0);
      if (vv > vMax) vMax = vv;
    }
    var vNow = s.cfg.volDollar ? (b.v || 0) * b.c : (b.v || 0);
    return {
      ok: true, state: last.state, stateTxt: last.stateTxt, score: last.score, dir: last.dir,
      comp: last.comp, bits: last.bits, bitsN: last.bitsN, gateOk: last.gateOk,
      ctxDir: last.ctxDir, ctxAge: last.ctxAge,
      htfDir: last.htfDir, htfConflict: last.htfConflict,
      emaDir: last.emaDir, ema: last.ema, levels: s.levels,
      entryAge: last.entryAge, volRatio: last.volRatio, volMissing: !vNow,
      volOfMax: vMax > 0 && vNow ? vNow / vMax * 100 : null,
      lipsa: last.lipsa, price: b.c, t: b.t,
      htfBars: s.htfBars, tfMs: s.tfMs, longOnly: s.cfg.longOnly, cfg: s.cfg
    };
  }

  /* agreement — cat de mult conteaza alinierea agregarii (calendar vs. N bare).
     Ruleaza acelasi motor cu ambele si numara barele pe care VERDICTUL difera. */
  function agreement(bars, opts, modes) {
    modes = modes || ['time', 'count'];
    function withMode(m) {
      var o = {}; Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
      o.aggMode = m; return o;
    }
    var a = series(bars, withMode(modes[0]));
    var b = series(bars, withMode(modes[1]));
    if (!a.ok || !b.ok) return { ok: false, reason: (a.ok ? b : a).reason };
    var n = 0, diffState = 0, diffDir = 0, diffStrong = 0, sumAbs = 0;
    for (var i = 0; i < a.states.length; i++) {
      var x = a.states[i], y = b.states[i];
      if (!x || !y) continue;
      n++;
      if (x.state !== y.state) diffState++;
      if (Math.sign(x.state) !== Math.sign(y.state)) diffDir++;
      if ((Math.abs(x.state) === 2) !== (Math.abs(y.state) === 2)) diffStrong++;
      sumAbs += Math.abs(x.score - y.score);
    }
    return { ok: true, n: n, modes: modes,
             statePct: n ? diffState / n * 100 : 0,
             dirPct: n ? diffDir / n * 100 : 0,
             strongPct: n ? diffStrong / n * 100 : 0,
             avgScoreDelta: n ? sumAbs / n : 0 };
  }

  /* restate — re-aplica DOAR verdictul (praguri/veto/longOnly) peste componentele
     deja calculate. Componentele nu depind de praguri, deci un sweep pe 20 de
     combinatii costa 20 de treceri prin verdict, nu 20 de recalculari de serie. */
  function restate(s, over) {
    if (!s || !s.ok) return s;
    var o = {};
    Object.keys(s.cfg).forEach(function (k) { o[k] = s.cfg[k]; });
    Object.keys(over || {}).forEach(function (k) { o[k] = over[k]; });
    o.thrEarly = Math.min(o.thrEarly, o.thrStrong);
    var out = s.states.map(function (v) {
      if (!v) return null;
      var nv = verdict(v.raw, o);
      nv.raw = v.raw; nv.i = v.i; nv.t = v.t; nv.price = v.price;
      nv.ctxDir = v.ctxDir; nv.ctxAge = v.ctxAge; nv.emaDir = v.emaDir;
      nv.ema = v.ema; nv.volRatio = v.volRatio;
      return nv;
    });
    return { ok: true, states: out, htfBars: s.htfBars, tfMs: s.tfMs, cfg: o, levels: s.levels };
  }

  function _sigFn(states, mode, longOnly) {
    var need = mode === 'strong' ? 2 : 1;
    return function (ohlc, i) {
      var v = states[i];
      if (!v || Math.abs(v.state) < need) return 0;
      var d = v.state > 0 ? 1 : -1;
      return (longOnly && d < 0) ? 0 : d;
    };
  }

  /* thresholdSweep — cat de des se aprinde semnalul si ce edge are, pe mai multe
     praguri. Raspunde la "pragul asta filtreaza ceva sau doar coloreaza?". */
  function thresholdSweep(bars, opts, sweepOpts) {
    if (typeof global.BT === 'undefined' || !global.BT.signal)
      return { ok: false, reason: 'lib/backtest.js nu e incarcat' };
    var s = series(bars, opts);
    if (!s.ok) return { ok: false, reason: s.reason };
    sweepOpts = sweepOpts || {};
    var mode = sweepOpts.mode || 'strong';
    var H = sweepOpts.horizon || 5;
    var grid = sweepOpts.grid || (mode === 'gate'
      ? [{ gateMode: 'nof4', gateNeed: 1 }, { gateMode: 'nof4', gateNeed: 2 },
         { gateMode: 'classic' }, { gateMode: 'nof4', gateNeed: 3 }, { gateMode: 'nof4', gateNeed: 4 }]
      : mode === 'strong'
      ? [65, 70, 75, 80, 85, 90].map(function (x) { return { thrStrong: x }; })
      : [40, 50, 55, 60, 65, 70].map(function (x) { return { thrEarly: x }; }));
    var evald = 0;
    for (var i = 0; i < s.states.length; i++) if (s.states[i]) evald++;
    var sigMode = mode === 'gate' ? 'strong' : mode;
    var rows = grid.map(function (g) {
      var r = restate(s, g);
      var sig = _sigFn(r.states, sigMode, r.cfg.longOnly);
      var fired = 0;
      for (var k = 0; k < r.states.length; k++) if (sig(bars, k)) fired++;
      var bt = global.BT.signal(bars, sig, { horizon: H });
      return { thrStrong: r.cfg.thrStrong, thrEarly: r.cfg.thrEarly,
               gateMode: r.cfg.gateMode, gateNeed: r.cfg.gateNeed,
               label: mode === 'gate'
                 ? (r.cfg.gateMode === 'classic' ? 'clasic (ctx+EMA+entry)' : r.cfg.gateNeed + ' din 4')
                 : String(mode === 'strong' ? r.cfg.thrStrong : r.cfg.thrEarly),
               fired: fired, firedPct: evald ? fired / evald * 100 : 0,
               n: bt.n, edgePct: bt.edgePct, t: bt.t, hitPct: bt.hitPct, avgPct: bt.avgPct };
    });
    return { ok: true, mode: mode, horizon: H, evaluated: evald, rows: rows, cfg: s.cfg };
  }

  /* timeline — CAND s-a aprins semnalul si ce a urmat, eveniment cu eveniment.
     Doar tranzitiile (0 -> directie sau schimbare de directie), nu fiecare bara
     petrecuta in semnal: media din backtest ascunde care semnale au mers.
     `fwdPct` e randamentul brut la `horizon` bare, pe directia semnalului. */
  function timeline(bars, opts, tOpts) {
    var s = series(bars, opts);
    if (!s.ok) return { ok: false, reason: s.reason };
    tOpts = tOpts || {};
    var mode = tOpts.mode || 'strong';
    var H = tOpts.horizon || 5;
    var need = mode === 'strong' ? 2 : 1;
    var longOnly = s.cfg.longOnly;
    var ev = [], prev = 0, open = null;

    for (var i = 0; i < s.states.length; i++) {
      var v = s.states[i];
      var d = 0;
      if (v && Math.abs(v.state) >= need) { d = v.state > 0 ? 1 : -1; if (longOnly && d < 0) d = 0; }
      if (d !== prev) {
        if (open) { open.bars = i - open.i; open = null; }   // semnalul precedent s-a stins
        if (d !== 0) {
          var entry = bars[i].c, hi = -Infinity, lo = Infinity, kmax = Math.min(H, bars.length - 1 - i);
          for (var k = 1; k <= kmax; k++) {
            var rr = d * (bars[i + k].c / entry - 1);
            if (rr > hi) hi = rr;
            if (rr < lo) lo = rr;
          }
          open = {
            i: i, t: bars[i].t, dir: d, state: v.state, stateTxt: v.stateTxt,
            score: v.score, price: entry, bits: v.bits, bitsN: v.bitsN,
            ctxDir: v.ctxDir, htfDir: v.htfDir, emaDir: v.emaDir,
            volRatio: v.volRatio, entryAge: v.entryAge,
            complete: kmax >= H,
            fwdPct: kmax >= 1 ? d * (bars[i + kmax].c / entry - 1) * 100 : null,
            mfePct: kmax >= 1 ? hi * 100 : null,
            maePct: kmax >= 1 ? lo * 100 : null,
            bars: null
          };
          ev.push(open);
        }
      }
      prev = d;
    }
    if (open) open.bars = s.states.length - 1 - open.i;      // inca deschis la ultima bara

    var closed = ev.filter(function (e) { return e.complete && e.fwdPct !== null; });
    var win = closed.filter(function (e) { return e.fwdPct > 0; }).length;
    return { ok: true, events: ev, mode: mode, horizon: H,
             n: ev.length, nClosed: closed.length,
             hitPct: closed.length ? win / closed.length * 100 : null,
             avgPct: closed.length ? closed.reduce(function (a, e) { return a + e.fwdPct; }, 0) / closed.length : null,
             cfg: s.cfg };
  }

  /* backtest — foloseste BT.* din lib/backtest.js (walk-forward + baseline).
     `mode`: 'strong' = doar |state|=2, 'early' = |state|>=1.
     Pe longOnly, semnalele short devin 0 (ies din piata), nu -1. */
  function backtest(bars, opts, btOpts) {
    if (typeof global.BT === 'undefined' || !global.BT.signal)
      return { ok: false, reason: 'lib/backtest.js nu e incarcat' };
    var s = series(bars, opts);
    if (!s.ok) return { ok: false, reason: s.reason };
    btOpts = btOpts || {};
    var mode = btOpts.mode || 'strong';
    var sig = _sigFn(s.states, mode, s.cfg.longOnly);
    var horizons = btOpts.horizons || [1, 3, 5, 10, 20];
    var sweep = global.BT.horizonSweep(bars, sig, horizons);
    var main = global.BT.signal(bars, sig, { horizon: btOpts.horizon || 5 });
    var fired = 0;
    for (var i = 0; i < s.states.length; i++) if (sig(bars, i)) fired++;
    return { ok: true, mode: mode, main: main, sweep: sweep, fired: fired,
             evaluated: s.states.filter(Boolean).length, cfg: s.cfg };
  }

  global.MFX = {
    PRESETS: PRESETS, DEFAULTS: DEFAULTS,
    detectTfMs: detectTfMs, aggregate: aggregate, ema: ema,
    structure: structure, structureSeries: structureSeries,
    tripleM: tripleM, tripleMSeries: tripleMSeries,
    verdict: verdict, series: series, restate: restate, evaluate: evaluate,
    thresholdSweep: thresholdSweep, timeline: timeline,
    agreement: agreement, backtest: backtest
  };
})(typeof window !== 'undefined' ? window : globalThis);
