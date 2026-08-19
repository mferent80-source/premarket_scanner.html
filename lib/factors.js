/* lib/factors.js — bancul de probă pentru factori, ca modul (FL.*)
 *
 * Nu produce semnale de intrare. Măsoară dacă un factor are edge REAL, prin
 * bateria de teste care a omorât, pe rând, tot ce părea promițător:
 *
 *   1. edge vs BASELINE  — nu media. Într-o piață care urcă, orice semnal are
 *                          medie pozitivă; contează cât bate „orice bară".
 *   2. CONTROALE         — long-mereu / short-mereu. Într-o piață care scade,
 *                          orice factor „short" pare bun. Trebuie bătut controlul.
 *   3. STABILITATE       — edge de acelasi semn în toate treimile de timp. Un
 *                          factor care merge doar într-o perioadă e un regim, nu un factor.
 *   4. ACOPERIRE         — pe câte simboluri e pozitiv. Sub 60% = adunat din accidente.
 *   5. FĂRĂ TOP 3        — dacă edge-ul dispare când scoți 3 simboluri, era al lor.
 *
 * Prag: |t| >= 3 (nu 2). Cu ~15 factori testați simultan, un t≈2 apare din
 * hazard cu ~50% șansă.
 *
 * Bare așteptate: [{o,h,l,c,v,t}] cronologic (formatul D.*).
 */
(function (global) {
  'use strict';

  // ── indicatori ────────────────────────────────────────────────────────────
  function sma(v, n) { var o = [], s = 0;
    for (var i = 0; i < v.length; i++) { s += v[i]; if (i >= n) s -= v[i - n]; o[i] = i >= n - 1 ? s / n : null; }
    return o; }
  function ema(v, n) { var k = 2 / (n + 1), o = [], a = 0;
    for (var i = 0; i < v.length; i++) { if (i < n) { a += v[i]; o[i] = i === n - 1 ? a / n : null; }
      else o[i] = v[i] * k + o[i - 1] * (1 - k); }
    return o; }
  function rsi(c, n) { var o = new Array(c.length).fill(null), g = 0, l = 0;
    for (var i = 1; i < c.length; i++) { var d = c[i] - c[i - 1];
      if (i <= n) { g += Math.max(d, 0); l += Math.max(-d, 0);
        if (i === n) { g /= n; l /= n; o[i] = 100 - 100 / (1 + g / (l || 1e-9)); } }
      else { g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n;
        o[i] = 100 - 100 / (1 + g / (l || 1e-9)); } }
    return o; }
  function atr(b, n) { var tr = b.map(function (x, i) { return i ? Math.max(x.h - x.l,
      Math.abs(x.h - b[i-1].c), Math.abs(x.l - b[i-1].c)) : x.h - x.l; });
    return sma(tr, n); }

  function prep(b) { var c = b.map(function (x) { return x.c; });
    return { b: b, c: c, rsi: rsi(c, 14), e20: ema(c, 20), e50: ema(c, 50), e200: ema(c, 200),
             atr: atr(b, 14), vma: sma(b.map(function (x) { return x.v; }), 20) }; }

  // ── factorii ──────────────────────────────────────────────────────────────
  // fiecare intoarce, per bara: +1 long / -1 short / 0 fara pozitie
  var FACTORS = {
    'ROC 30 pozitiv': { d: 'Prețul e peste cel de acum 30 de bare. Cel mai simplu filtru de trend care există.',
      f: function (o) { return o.b.map(function (x, i) { return i < 30 ? 0 : x.c > o.b[i-30].c ? 1 : -1; }); } },
    'RSI<30 (reversal long)': { d: 'Supravândut. Pariu contrarian pe revenire.',
      f: function (o) { return o.b.map(function (x, i) { return o.rsi[i] != null && o.rsi[i] < 30 ? 1 : 0; }); } },
    'RSI>70 (reversal short)': { d: 'Supracumpărat. Pariu contrarian pe corecție.',
      f: function (o) { return o.b.map(function (x, i) { return o.rsi[i] != null && o.rsi[i] > 70 ? -1 : 0; }); } },
    'preț > EMA200': { d: 'Filtrul clasic de regim: deasupra mediei lungi = bull.',
      f: function (o) { return o.b.map(function (x, i) { return o.e200[i] == null ? 0 : x.c > o.e200[i] ? 1 : -1; }); } },
    'EMA 20>50 (trend)': { d: 'Încrucișare de medii, cea mai folosită definiție de trend.',
      f: function (o) { return o.b.map(function (x, i) { return o.e20[i] == null || o.e50[i] == null ? 0
        : o.e20[i] > o.e50[i] ? 1 : -1; }); } },
    'breakout max 20': { d: 'Închidere peste maximul ultimelor 20 de bare.',
      f: function (o) { return o.b.map(function (x, i) { if (i < 21) return 0;
        var m = -Infinity; for (var k = i - 20; k < i; k++) m = Math.max(m, o.b[k].h);
        return x.c > m ? 1 : 0; }); } },
    'breakdown min 20': { d: 'Închidere sub minimul ultimelor 20 de bare.',
      f: function (o) { return o.b.map(function (x, i) { if (i < 21) return 0;
        var m = Infinity; for (var k = i - 20; k < i; k++) m = Math.min(m, o.b[k].l);
        return x.c < m ? -1 : 0; }); } },
    'squeeze ATR (vol mică)': { d: 'Volatilitate sub 70% din media pe 50 de bare — se așteaptă expansiune.',
      f: function (o) { return o.b.map(function (x, i) { if (i < 60 || o.atr[i] == null) return 0;
        var s = 0, n = 0; for (var k = i - 50; k <= i; k++) if (o.atr[k] != null) { s += o.atr[k]; n++; }
        return n && o.atr[i] < 0.7 * (s / n) ? 1 : 0; }); } },
    'volum > 2x media': { d: 'Participare neobișnuită; direcția o dă corpul barei.',
      f: function (o) { return o.b.map(function (x, i) { return !o.vma[i] ? 0
        : x.v > 2 * o.vma[i] ? (x.c > x.o ? 1 : -1) : 0; }); } },
    'trend + volum': { d: 'EMA 20>50 confirmat de volum peste 1.5x media.',
      f: function (o) { return o.b.map(function (x, i) { if (o.e20[i] == null || o.e50[i] == null || !o.vma[i]) return 0;
        if (x.v < 1.5 * o.vma[i]) return 0; return o.e20[i] > o.e50[i] ? 1 : -1; }); } },
    'CONTROL: long mereu': { ctrl: true, d: 'Cumpără orice, mereu. Reperul pe care orice factor trebuie să-l bată.',
      f: function (o) { return o.b.map(function () { return 1; }); } },
    'CONTROL: short mereu': { ctrl: true, d: 'Vinde orice, mereu. Într-o piață care scade, arată înșelător de bine.',
      f: function (o) { return o.b.map(function () { return -1; }); } }
  };

  // ── statistică ────────────────────────────────────────────────────────────
  function stat(a) { var n = a.length;
    if (!n) return { n: 0, avg: 0, t: 0, hit: 0 };
    var m = 0, i; for (i = 0; i < n; i++) m += a[i]; m /= n;
    var v = 0; for (i = 0; i < n; i++) v += (a[i] - m) * (a[i] - m); v /= n;
    var sd = Math.sqrt(v), w = 0; for (i = 0; i < n; i++) if (a[i] > 0) w++;
    return { n: n, avg: m * 100, t: sd > 0 ? m / (sd / Math.sqrt(n)) : 0, hit: w / n * 100 }; }

  /* ROBUSTETE LA PARAMETRU — al 6-lea test.
     De ce: ROC 30 trecea toate cele 5 teste, dar familia lui spunea altceva —
     ROC 60 si ROC 90 aveau t MAI MARE (7.10 / 6.19) dar cadeau la stabilitate,
     iar vecinii imediati ai lui 30 erau slabi (ROC 20: t=-0.37, ROC 45: t=2.51).
     Un factor real nu poate depinde de o cifra magica. Variem parametrul si
     cerem ca >=80% din variante sa pastreze SEMNUL edge-ului.
     Atentie: semnul poate fi robust si puterea sa vina dintr-o singura valoare —
     asta se raporteaza separat, ca `spike` (varf, nu platou). */
  var PARAMS = {
    'ROC 30 pozitiv': { p: [20, 25, 30, 40, 50], mk: function (n) {
      return function (o) { return o.b.map(function (x, i) { return i < n ? 0 : x.c > o.b[i-n].c ? 1 : -1; }); }; } },
    'RSI<30 (reversal long)': { p: [25, 28, 30, 33, 35], mk: function (n) {
      return function (o) { return o.b.map(function (x, i) { return o.rsi[i] != null && o.rsi[i] < n ? 1 : 0; }); }; } },
    'RSI>70 (reversal short)': { p: [65, 68, 70, 73, 75], mk: function (n) {
      return function (o) { return o.b.map(function (x, i) { return o.rsi[i] != null && o.rsi[i] > n ? -1 : 0; }); }; } },
    'preț > EMA200': { p: [100, 150, 200, 250, 300], mk: function (n) {
      return function (o) { var e = ema(o.c, n);
        return o.b.map(function (x, i) { return e[i] == null ? 0 : x.c > e[i] ? 1 : -1; }); }; } },
    'breakout max 20': { p: [10, 15, 20, 30, 40], mk: function (n) {
      return function (o) { return o.b.map(function (x, i) { if (i < n + 1) return 0;
        var m = -Infinity; for (var k = i - n; k < i; k++) m = Math.max(m, o.b[k].h);
        return x.c > m ? 1 : 0; }); }; } },
    'breakdown min 20': { p: [10, 15, 20, 30, 40], mk: function (n) {
      return function (o) { return o.b.map(function (x, i) { if (i < n + 1) return 0;
        var m = Infinity; for (var k = i - n; k < i; k++) m = Math.min(m, o.b[k].l);
        return x.c < m ? -1 : 0; }); }; } },
    'volum > 2x media': { p: [1.5, 1.8, 2, 2.5, 3], mk: function (n) {
      return function (o) { return o.b.map(function (x, i) { return !o.vma[i] ? 0
        : x.v > n * o.vma[i] ? (x.c > x.o ? 1 : -1) : 0; }); }; } }
  };

  function robustness(P, syms, name, H, WARM, baseEdge, baseAvg) {
    var spec = PARAMS[name];
    if (!spec) return { has: false };
    var out = spec.p.map(function (n) {
      var fn = spec.mk(n), acc = [];
      syms.forEach(function (s) {
        var o = P[s], L = o.b.length, sig = fn(o);
        for (var i = WARM; i < L - H; i++) { var d = sig[i]; if (!d) continue;
          var r = o.b[i + H].c / o.b[i].c - 1; if (isFinite(r)) acc.push(d * r); }
      });
      var st = stat(acc);
      return { p: n, edge: st.avg - baseAvg, t: st.t };
    });
    var sgn = baseEdge > 0 ? 1 : -1;
    var same = out.filter(function (x) { return x.edge * sgn > 0; }).length;
    var ts = out.map(function (x) { return Math.abs(x.t); }).sort(function (a, b) { return b - a; });
    var spike = ts.length >= 3 && ts[0] > 2 * ts[Math.floor(ts.length / 2)];
    return { has: true, vars: out, same: same, tot: out.length, spike: spike,
             ok: same >= Math.ceil(out.length * 0.8) };
  }

  /* regime — ce fel de piata a fost in fereastra masurata.
     eficienta = |miscare neta| / drum parcurs. Masuratoarea asta a explicat, pe
     19.08.2026, de ce un deck de structura+trend nu avea cum sa mearga: pretul se
     agitase ~800% cumulat ca sa ajunga la -11%, eficienta 2.3%. Intr-o piata care
     se agita si revine, factorii de trend n-au ce prinde — deci contextul se
     citeste INAINTE de a judeca verdictele. */
  function regime(data) {
    var rows = [];
    Object.keys(data).forEach(function (s) {
      var b = data[s]; if (!b || b.length < 60) return;
      var bh = (b[b.length - 1].c / b[0].c - 1) * 100, path = 0;
      for (var i = 1; i < b.length; i++) path += Math.abs(b[i].c / b[i - 1].c - 1) * 100;
      if (!(path > 0)) return;
      rows.push({ sym: s, bh: bh, path: path, eff: Math.abs(bh) / path * 100 });
    });
    if (!rows.length) return null;
    var eff = rows.reduce(function (a, x) { return a + x.eff; }, 0) / rows.length;
    var bh = rows.reduce(function (a, x) { return a + x.bh; }, 0) / rows.length;
    return { eff: eff, bh: bh, n: rows.length,
             up: rows.filter(function (x) { return x.bh > 0; }).length,
             lat: rows.filter(function (x) { return x.eff < 3; }).length,
             tip: eff < 3 ? 'LATERAL' : eff < 6 ? 'SLAB DIRECTIONAL' : 'TREND' };
  }

  /* run — trece toate simbolurile prin toți factorii și aplică bateria.
     data: { SYM: bars[] }.  opts: { horizon, warmup, thirds } */
  function run(data, opts) {
    opts = opts || {};
    var H = opts.horizon || 5, WARM = opts.warmup || 210;
    var syms = Object.keys(data).filter(function (s) { return data[s] && data[s].length >= WARM + H + 60; });
    if (syms.length < 5) return { ok: false, reason: 'prea puține simboluri cu istoric (' + syms.length + ')' };

    var P = {}; syms.forEach(function (s) { P[s] = prep(data[s]); });
    var names = Object.keys(FACTORS);
    var acc = {}; names.forEach(function (k) { acc[k] = { all: [], per: {}, th: [[], [], []] }; });
    var base = { all: [], th: [[], [], []] };

    syms.forEach(function (s) {
      var o = P[s], L = o.b.length, span = L - WARM - H;
      if (span < 30) return;
      var sig = {}; names.forEach(function (k) { sig[k] = FACTORS[k].f(o); });
      names.forEach(function (k) { acc[k].per[s] = []; });
      for (var i = WARM; i < L - H; i++) {
        var r = o.b[i + H].c / o.b[i].c - 1;
        if (!isFinite(r)) continue;
        var th = i < WARM + span / 3 ? 0 : i < WARM + 2 * span / 3 ? 1 : 2;
        base.all.push(r); base.th[th].push(r);
        names.forEach(function (k) { var d = sig[k][i]; if (!d) return;
          acc[k].all.push(d * r); acc[k].per[s].push(d * r); acc[k].th[th].push(d * r); });
      }
    });

    var B = stat(base.all), BT = base.th.map(stat);
    var rows = names.map(function (k) {
      var A = stat(acc[k].all), T = acc[k].th.map(stat);
      var edges = T.map(function (t, i) { return t.avg - BT[i].avg; });
      var stabil = edges.every(function (e) { return e > 0; }) || edges.every(function (e) { return e < 0; });
      var ss = Object.keys(acc[k].per).filter(function (s) { return acc[k].per[s].length >= 20; });
      var pos = ss.filter(function (s) { return stat(acc[k].per[s]).avg > 0; }).length;
      var cov = ss.length ? pos / ss.length : 0;
      var sorted = ss.map(function (s) { return { s: s, a: stat(acc[k].per[s]).avg }; })
                     .sort(function (x, y) { return y.a - x.a; });
      var top3 = sorted.slice(0, 3).map(function (x) { return x.s; });
      var wo = []; ss.forEach(function (s) { if (top3.indexOf(s) < 0) wo.push.apply(wo, acc[k].per[s]); });
      var W = stat(wo);
      var ctrl = !!FACTORS[k].ctrl;
      var rob = ctrl ? { has: false } : robustness(P, syms, k, H, WARM, A.avg - B.avg, B.avg);
      var trece = !ctrl && stabil && Math.abs(A.t) >= 3 && cov >= 0.6 && Math.abs(W.t) >= 2
                  && (!rob.has || rob.ok);
      return { k: k, desc: FACTORS[k].d, ctrl: ctrl,
               n: A.n, avg: A.avg, edge: A.avg - B.avg, hit: A.hit, t: A.t,
               edges: edges, tThirds: T.map(function (x) { return x.t; }), stabil: stabil,
               cov: cov, nSyms: ss.length, posSyms: pos, top3: top3,
               woT: W.t, woAvg: W.avg, rob: rob, trece: trece };
    }).sort(function (a, b) { return (b.trece - a.trece) || (Math.abs(b.t) - Math.abs(a.t)); });

    return { ok: true, rows: rows, base: B, baseThirds: BT, syms: syms.length,
             horizon: H, obs: B.n };
  }

  /* live — pe ce simboluri e activ un factor ACUM (ultima bară). */
  function live(data, factorName) {
    var F = FACTORS[factorName]; if (!F) return [];
    var out = [];
    Object.keys(data).forEach(function (s) {
      var b = data[s]; if (!b || b.length < 260) return;
      var sig = F.f(prep(b)), i = b.length - 1;
      if (sig[i]) out.push({ sym: s, dir: sig[i], price: b[i].c, t: b[i].t });
    });
    return out.sort(function (a, b) { return b.dir - a.dir || a.sym.localeCompare(b.sym); });
  }

  global.FL = { FACTORS: FACTORS, run: run, live: live, stat: stat, regime: regime,
                sma: sma, ema: ema, rsi: rsi, atr: atr, prep: prep };
})(typeof window !== 'undefined' ? window : globalThis);
