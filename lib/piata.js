// piata.js — cifrele pietei, o SINGURA data pentru toata suita (22.09.2026).
//
// De ce exista: logica de sectoare si de macro fusese scrisa in `cockpit/`, iar hub-ul
// avea nevoie de aceleasi cifre. Copiata, ar fi devenit al doilea adevar: doua pagini
// care spun lucruri usor diferite despre acelasi lucru, si nimeni nu stie care minte.
// Formula RRG e cea din `sector-rotation` (RRG_LB 21, RRG_MOM 5), ca sa nu existe nici
// al treilea.
//
// Foloseste `lib/data.js` (D.fetchJSON), deci trece prin proxy-ul propriu si prin
// cache-ul suitei. Nu deseneaza nimic: intoarce date, iar pagina hotaraste cum arata.
//
//   PIATA.sectoare()  -> [{ sym, nume, grup, chg1s, chg1l, cadran, mv, ... }]
//   PIATA.macro()     -> { VIX: {val, chg, la}, DXY: ..., '10Y': ..., '3M': ... }
//   PIATA.curba(m)    -> puncte de baza intre 10Y si 3M, sau null
//   PIATA.rotatie(s)  -> { spread, ciclice, defensive, amandouaPierd }
(function (global) {
  'use strict';

  var RRG_LB = 21;   // fereastra de trend relativ (~1 luna de tranzactionare)
  var RRG_MOM = 5;   // fereastra de momentum (~1 saptamana)

  var SECTOARE = [
    { sym: 'XLK',  nume: 'Technology',          grup: 'ciclic'   },
    { sym: 'XLY',  nume: 'Consumer Disc.',      grup: 'ciclic'   },
    { sym: 'XLC',  nume: 'Communication Serv.', grup: 'ciclic'   },
    { sym: 'XLF',  nume: 'Financials',          grup: 'ciclic'   },
    { sym: 'XLI',  nume: 'Industrials',         grup: 'ciclic'   },
    { sym: 'XLB',  nume: 'Materials',           grup: 'ciclic'   },
    { sym: 'XLE',  nume: 'Energy',              grup: 'ciclic'   },
    { sym: 'XLRE', nume: 'Real Estate',         grup: 'dobanda'  },
    { sym: 'XLV',  nume: 'Health Care',         grup: 'defensiv' },
    { sym: 'XLP',  nume: 'Consumer Staples',    grup: 'defensiv' },
    { sym: 'XLU',  nume: 'Utilities',           grup: 'defensiv' }
  ];

  // ^TNX si ^IRX sunt in PROCENTE INTREGI (4,963 = 4,963%), nu in zecimi. Impartirea
  // la 10 - care exista in patru locuri in Macro Dashboard pana pe 22.09 - facea din
  // 4,96% un 0,50%, deci si din curba 10Y-3M o cifra de zece ori mai plata.
  var MACRO = [
    { sym: '^VIX',     k: 'VIX' },
    { sym: 'DX-Y.NYB', k: 'DXY' },
    { sym: '^TNX',     k: '10Y' },
    { sym: '^IRX',     k: '3M'  },
    { sym: 'BTC-USD',  k: 'BTC' }
  ];

  function chg(bare, n) {
    if (!bare || bare.length < n + 1) return null;
    var a = bare[bare.length - 1 - n].c, b = bare[bare.length - 1].c;
    return (a > 0) ? (b / a - 1) * 100 : null;
  }

  function cadran(rsRatio, rsMom) {
    if (rsRatio == null || rsMom == null) return null;
    if (rsRatio >= 0 && rsMom >= 0) return { key: 'lead', label: 'LEADING' };
    if (rsRatio >= 0 && rsMom <  0) return { key: 'weak', label: 'WEAKENING' };
    if (rsRatio <  0 && rsMom <  0) return { key: 'lag',  label: 'LAGGING' };
    return                                { key: 'impr', label: 'IMPROVING' };
  }

  function rrg(inchideriSector, inchideriSPY) {
    if (!inchideriSector || !inchideriSPY) return { rsRatio: null, rsMom: null };
    var n = Math.min(inchideriSector.length, inchideriSPY.length);
    if (n < RRG_LB + RRG_MOM + 1) return { rsRatio: null, rsMom: null };
    var sc = inchideriSector.slice(-n), sp = inchideriSPY.slice(-n);
    var rs = new Array(n), i;
    for (i = 0; i < n; i++) rs[i] = sp[i] > 0 ? sc[i] / sp[i] : null;
    function ratioAt(j) {
      if (j < RRG_LB - 1) return null;
      var s = 0, c = 0, k;
      for (k = j - RRG_LB + 1; k <= j; k++) if (rs[k] != null) { s += rs[k]; c++; }
      if (!c || rs[j] == null) return null;
      var sma = s / c;
      return sma > 0 ? (rs[j] / sma - 1) * 100 : null;
    }
    var last = n - 1;
    var rsRatio = ratioAt(last);
    var prev = ratioAt(last - RRG_MOM);
    var rsMom = (rsRatio != null && prev != null) ? rsRatio - prev : null;
    var rrPrev = prev;
    var rpPrev = ratioAt(last - 2 * RRG_MOM);
    var momPrev = (rrPrev != null && rpPrev != null) ? rrPrev - rpPrev : null;
    return { rsRatio: rsRatio, rsMom: rsMom, cadranAnterior: cadran(rrPrev, momPrev) };
  }

  function miscare(dinC, inC) {
    if (!dinC || !inC || dinC.key === inC.key) return { txt: 'stă', cls: '' };
    if (inC.key === 'lead') return { txt: 'intră în LEADING', cls: 'intra' };
    if (inC.key === 'impr') return { txt: 'începe să urce',   cls: 'intra' };
    if (inC.key === 'weak') return { txt: 'slăbește',          cls: 'iese' };
    return { txt: 'cade în LAGGING', cls: 'iese' };
  }

  function bareYahoo(sym, range) {
    return D.fetchStock(sym, { range: range || '6mo', interval: '1d', ttl: 900 });
  }

  /** Cele 11 sectoare, cu forta relativa fata de SPY. Fara SPY nu exista forta
      relativa, deci nu inventam una: campurile raman null si pagina o spune. */
  function sectoare() {
    var lipsa = [];
    return bareYahoo('SPY').catch(function (e) {
      lipsa.push({ ce: 'SPY (reperul)', dece: e && e.message });
      return null;
    }).then(function (spy) {
      var spyCloses = spy ? spy.map(function (b) { return b.c; }) : null;
      return Promise.all(SECTOARE.map(function (s) {
        return bareYahoo(s.sym).then(function (bare) {
          var closes = bare.map(function (b) { return b.c; });
          var r = rrg(closes, spyCloses);
          var c = cadran(r.rsRatio, r.rsMom);
          return {
            sym: s.sym, nume: s.nume, grup: s.grup,
            pret: closes[closes.length - 1],
            chg1s: chg(bare, 5), chg1l: chg(bare, 21),
            rsRatio: r.rsRatio, rsMom: r.rsMom, cadran: c,
            mv: miscare(r.cadranAnterior, c),
            la: bare[bare.length - 1].t
          };
        }).catch(function (e) {
          lipsa.push({ ce: s.sym, dece: e && e.message });
          return { sym: s.sym, nume: s.nume, grup: s.grup, chg1s: null, cadran: null };
        });
      })).then(function (lista) { return { lista: lista, lipsa: lipsa }; });
    });
  }

  /** Cifrele macro din `meta` (pretul CURENT + ora lui), nu din ultima bara:
      verificarea de integritate din data.js arunca barele fara `open`, iar indicii au
      adesea open null pe ziua curenta - asa ajungea pagina sa arate valoarea de vineri
      ca si cum ar fi de azi. */
  function macro() {
    var out = {}, lipsa = [];
    return Promise.all(MACRO.map(function (x) {
      var url = 'https://query1.finance.yahoo.com/v8/finance/chart/'
        + encodeURIComponent(x.sym) + '?range=5d&interval=1d';
      return D.fetchJSON(url, { ttl: 300, cacheKey: 'pi:' + x.sym }).then(function (j) {
        var r = j && j.chart && j.chart.result && j.chart.result[0];
        var m = r && r.meta;
        if (!m || m.regularMarketPrice == null) throw new Error('fara pret');
        var inch = m.chartPreviousClose != null ? m.chartPreviousClose : m.previousClose;
        out[x.k] = {
          val: m.regularMarketPrice,
          chg: (inch > 0) ? (m.regularMarketPrice / inch - 1) * 100 : null,
          la: m.regularMarketTime ? m.regularMarketTime * 1000 : null
        };
      }).catch(function (e) {
        out[x.k] = null;
        lipsa.push({ ce: x.k, dece: e && e.message });
      });
    })).then(function () { return { val: out, lipsa: lipsa }; });
  }

  /** Curba 10Y-3M in puncte de baza. Negativa = inversata = semnal de recesiune. */
  function curba(m) {
    if (!m || !m['10Y'] || !m['3M']) return null;
    return (m['10Y'].val - m['3M'].val) * 100;
  }

  /** Rotatia ciclice vs defensive. Un spread pozitiv pentru ca defensivele pierd MAI
      MULT nu e apetit de risc: banii nu intra nicaieri, doar ies mai repede de undeva.
      De aceea se intoarce si `amandouaPierd`, ca ecranul sa poata spune asta. */
  function rotatie(lista) {
    var s = (lista || []).filter(function (x) { return x.chg1s != null; });
    var cic = s.filter(function (x) { return x.grup === 'ciclic'; });
    var def = s.filter(function (x) { return x.grup === 'defensiv'; });
    if (!cic.length || !def.length) return null;
    var mc = cic.reduce(function (a, x) { return a + x.chg1s; }, 0) / cic.length;
    var md = def.reduce(function (a, x) { return a + x.chg1s; }, 0) / def.length;
    return { spread: mc - md, ciclice: mc, defensive: md, amandouaPierd: mc < 0 && md < 0 };
  }

  global.PIATA = {
    SECTOARE: SECTOARE, MACRO: MACRO, RRG_LB: RRG_LB, RRG_MOM: RRG_MOM,
    sectoare: sectoare, macro: macro, curba: curba, rotatie: rotatie,
    rrg: rrg, cadran: cadran, miscare: miscare, chg: chg
  };
})(typeof window !== 'undefined' ? window : globalThis);
