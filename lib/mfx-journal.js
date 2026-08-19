/* lib/mfx-journal.js — jurnal OUT-OF-SAMPLE pentru semnalele MFX (MFXJ.*)
 *
 * Semnalul se scrie ACUM, cu pragurile si configuratia care l-au produs, si se
 * evalueaza MAI TARZIU, din bare care la momentul scrierii nu existau. Asta e
 * singura diferenta care conteaza fata de backtestul din laborator: acolo
 * pragurile au fost alese privind aceleasi date pe care apoi le "prezic".
 *
 * Regula pe care o impune modulul: un semnal e evaluabil abia cand au trecut
 * `horizon` bare DUPA bara lui. Pana atunci ramane "se coace" — nu se numara
 * in nicio statistica.
 *
 * localStorage: tt_mfx_journal_v1
 */
(function (global) {
  'use strict';
  var KEY = 'tt_mfx_journal_v1';
  var MAX = 600;

  function all() {
    try { var a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function save(arr) {
    if (arr.length > MAX) arr = arr.slice(-MAX);
    try {
      localStorage.setItem(KEY, JSON.stringify(arr));
      return true;
    } catch (e) {
      // quota plina: taie jumatate din cele mai vechi si reincearca o data,
      // altfel jurnalul ar parea ca scrie si n-ar scrie nimic
      try {
        localStorage.setItem(KEY, JSON.stringify(arr.slice(-Math.floor(arr.length / 2))));
        return true;
      } catch (e2) { return false; }
    }
  }

  /* Amprenta configuratiei care a produs semnalul. Fara ea, statisticile ar
     amesteca semnale facute cu praguri diferite si n-ar mai insemna nimic. */
  function cfgTag(c) {
    if (!c) return '?';
    // gate-ul e ce filtreaza efectiv — fara el in amprenta, jurnalul ar pune
    // in aceeasi galeata semnale produse de reguli diferite
    var gate = c.gateMode === 'nof4' ? (c.gateNeed + 'of4') : 'clasic';
    return [c.preset || '?', 'G' + gate, 'S' + c.thrStrong, 'E' + c.thrEarly,
            c.breakMode || '?', c.useHtfStruct ? 'veto' : 'fara-veto',
            c.aggMode || 'time'].join('/');
  }

  /* log — scrie un semnal. Dedupe pe (simbol, tf, ora barei): acelasi semnal
     nu intra de doua ori, oricat de des ai re-scana. */
  function log(rec) {
    var sym = String(rec.sym || '').trim().toUpperCase();
    var barT = +rec.barT;
    if (!sym || !barT || !(rec.price > 0)) return null;
    var arr = all();
    var dupKey = sym + '|' + rec.tf + '|' + barT;
    for (var i = arr.length - 1; i >= 0; i--) if (arr[i].k === dupKey) return null;
    var e = {
      id: 'mfx_' + barT + '_' + Math.random().toString(36).slice(2, 6),
      k: dupKey,
      sym: sym, tf: String(rec.tf || ''), mkt: String(rec.mkt || ''),
      dir: rec.dir > 0 ? 1 : -1,
      state: rec.state, score: +rec.score,
      price: +rec.price,
      barT: barT,                       // ora barei pe care s-a aprins
      loggedAt: Date.now(),             // cand am scris-o (dovada de out-of-sample)
      horizon: rec.horizon || 5,
      cfg: cfgTag(rec.cfg),
      ctxDir: rec.ctxDir, htfDir: rec.htfDir, volRatio: rec.volRatio,
      fwdPct: null, mfePct: null, maePct: null, evalAt: null
    };
    arr.push(e);
    save(arr);
    return e;
  }

  /* logFromScan — ia rezultatele unei scanari si scrie doar STRONG-urile noi. */
  function logFromScan(rows, meta) {
    var n = 0;
    (rows || []).forEach(function (r) {
      var x = r && r.res;
      if (!x || !x.ok || Math.abs(x.state) !== 2) return;
      if (log({ sym: r.sym, tf: meta.tf, mkt: meta.mkt, dir: x.dir, state: x.state,
                score: x.score, price: x.price, barT: x.t, horizon: meta.horizon,
                cfg: x.cfg, ctxDir: x.ctxDir, htfDir: x.htfDir, volRatio: x.volRatio })) n++;
    });
    return n;
  }

  /* evaluateOne — cauta bara semnalului in seria adusa acum si masoara ce a
     urmat. Daca inca nu sunt `horizon` bare dupa ea, ramane necotat. */
  function evaluateOne(e, bars) {
    if (!Array.isArray(bars) || !bars.length) return 'fara date';
    var idx = -1;
    for (var i = bars.length - 1; i >= 0; i--) {
      if (bars[i].t === e.barT) { idx = i; break; }
      if (bars[i].t < e.barT) break;                  // seria a trecut de el
    }
    if (idx < 0) return 'bara semnalului nu mai e in istoric';
    if (idx + e.horizon >= bars.length) return 'se coace';
    var entry = bars[idx].c, hi = -Infinity, lo = Infinity;
    for (var k = 1; k <= e.horizon; k++) {
      var rr = e.dir * (bars[idx + k].c / entry - 1);
      if (rr > hi) hi = rr;
      if (rr < lo) lo = rr;
    }
    e.fwdPct = e.dir * (bars[idx + e.horizon].c / entry - 1) * 100;
    e.mfePct = hi * 100; e.maePct = lo * 100; e.evalAt = Date.now();
    return 'ok';
  }

  /* evaluateAll — grupeaza pe (simbol, tf) ca sa aduca o singura serie per grup. */
  async function evaluateAll(fetchBars, onProgress) {
    var arr = all();
    var pending = arr.filter(function (e) { return e.fwdPct == null; });
    var groups = {};
    pending.forEach(function (e) { (groups[e.mkt + '|' + e.sym + '|' + e.tf] = groups[e.mkt + '|' + e.sym + '|' + e.tf] || []).push(e); });
    var keys = Object.keys(groups), done = 0, ok = 0, still = 0;
    for (var gi = 0; gi < keys.length; gi++) {
      var parts = keys[gi].split('|');
      var bars = null;
      try { bars = await fetchBars(parts[1], parts[0], parts[2]); }
      catch (err) { bars = null; }
      groups[keys[gi]].forEach(function (e) {
        var r = bars ? evaluateOne(e, bars) : 'fara date';
        if (r === 'ok') ok++; else if (r === 'se coace') still++;
      });
      done++;
      if (onProgress) onProgress(done, keys.length);
      await new Promise(function (r) { setTimeout(r, 120); });
    }
    save(arr);
    return { evaluated: ok, pending: still, groups: keys.length };
  }

  /* stats — pe configuratie, ca sa nu se amestece praguri diferite.
     Sub 10 cazuri nu se trage nicio concluzie (esantion insuficient). */
  function stats() {
    var by = {};
    all().forEach(function (e) {
      if (e.fwdPct == null) return;
      var g = by[e.cfg] = by[e.cfg] || { cfg: e.cfg, n: 0, win: 0, sum: 0, mfe: 0, mae: 0 };
      g.n++; g.sum += e.fwdPct; g.mfe += e.mfePct; g.mae += e.maePct;
      if (e.fwdPct > 0) g.win++;
    });
    return Object.keys(by).map(function (k) {
      var g = by[k];
      return { cfg: g.cfg, n: g.n, hitPct: g.win / g.n * 100, avgPct: g.sum / g.n,
               avgMfe: g.mfe / g.n, avgMae: g.mae / g.n,
               enough: g.n >= 10 };
    }).sort(function (a, b) { return b.n - a.n; });
  }

  function remove(id) { return save(all().filter(function (e) { return e.id !== id; })); }
  function clear() { try { localStorage.removeItem(KEY); return true; } catch (e) { return false; } }

  global.MFXJ = { all: all, log: log, logFromScan: logFromScan, evaluateOne: evaluateOne,
                  evaluateAll: evaluateAll, stats: stats, remove: remove, clear: clear,
                  cfgTag: cfgTag, KEY: KEY };
})(typeof window !== 'undefined' ? window : globalThis);
