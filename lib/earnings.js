// earnings.js — cine raporteaza si cand, o singura data pentru toata suita (22.09.2026).
//
// Acelasi motiv ca la piata.js si pump.js: hub-ul arata o fereastra cu raportarile
// care vin, iar pagina Earnings arata tot calendarul. Daca fiecare si-ar filtra
// lista cum stie, ar aparea diferente tacute intre ele.
//
// Sursa: Finnhub `/calendar/earnings`. CERE CHEIE. Cand nu e pusa, functia spune
// asta pe fata (`motiv: 'fara cheie'`) - nu intoarce o lista goala, fiindca o listă
// goala inseamna „nu raporteaza nimeni", care e cu totul altceva.
//
//   EARN.calendar({ zile: 14 }) -> { ok, items: [{symbol, date, hour, epsEstimate, ...}], motiv }
(function (global) {
  'use strict';

  var BASE = 'https://finnhub.io/api/v1';

  function cheie() {
    try {
      if (global.FH && FH.get) { var k = FH.get(); if (k) return k; }
      return localStorage.getItem('finnhub_api_key') || localStorage.getItem('fh_key') || '';
    } catch (e) { return ''; }
  }

  function iso(d) { return d.toISOString().slice(0, 10); }

  /** Raportarile din urmatoarele `zile`, doar US.
      Filtrul de ticker e cel din pagina Earnings: 1-5 caractere, litere mari si cifre,
      fara punct - asta taie sufixele non-US (ex. „TICKER.HK") din lista globala. */
  function calendar(opts) {
    opts = opts || {};
    var zile = opts.zile || 14;
    var k = cheie();
    if (!k) return Promise.resolve({ ok: false, motiv: 'fără cheie', items: [] });

    var azi = new Date();
    var pana = new Date(azi.getTime() + zile * 86400000);
    var url = BASE + '/calendar/earnings?from=' + iso(azi) + '&to=' + iso(pana)
      + '&token=' + encodeURIComponent(k);

    // Finnhub are CORS deschis, deci se cheama direct; D.fetchJSON ii da cache si
    // dedup, dar ar trece si prin proxy daca ar fi nevoie.
    return D.fetchJSON(url, { ttl: 1800, cacheKey: 'earn:' + zile }).then(function (d) {
      var arr = (d && Array.isArray(d.earningsCalendar)) ? d.earningsCalendar : [];
      var items = arr.filter(function (e) {
        if (!e || !e.symbol) return false;
        if (!/^[A-Z][A-Z0-9]{0,4}$/.test(e.symbol)) return false;
        return (e.epsEstimate != null) || (e.revenueEstimate != null) || (e.epsActual != null);
      }).sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        // in aceeasi zi, cele de dupa inchidere (amc) conteaza mai mult pentru maine
        return (b.revenueEstimate || 0) - (a.revenueEstimate || 0);
      });
      return { ok: true, items: items, motiv: '' };
    }).catch(function (e) {
      return { ok: false, motiv: (e && e.message) || 'Finnhub nu a răspuns', items: [] };
    });
  }


  /** Raportarile TRECUTE ale unui simbol, cu reactia pretului in ziua respectiva.
   *
   *  De ce asa si nu ca in pagina veche: aceea lua `period` din `/stock/earnings`
   *  (sfarsitul trimestrului) si incerca sa-l potriveasca cu o data de raportare
   *  luata din alta parte, cu tolerante de +/-1 luna pentru companiile cu an fiscal
   *  decalat. Potrivirea gresita dadea o reactie masurata in ziua nepotrivita.
   *
   *  Aici cerem direct calendarul cu fereastra IN TRECUT si `symbol`: acolo `date`
   *  ESTE ziua raportarii, nu una dedusa. Reactia se masoara intre inchiderea de
   *  dinainte si inchiderea de dupa acea zi - iar cand ziua nu se gaseste in istoric
   *  (sarbatoare, simbol listat mai tarziu), randul spune „nu stiu", nu zero.
   */
  function istoric(symbol, opts) {
    opts = opts || {};
    var ani = opts.ani || 2;
    var k = cheie();
    if (!k) return Promise.resolve({ ok: false, motiv: 'fără cheie', items: [] });

    var azi = new Date();
    var de_la = new Date(azi.getTime() - ani * 365 * 86400000);
    var urlCal = BASE + '/calendar/earnings?symbol=' + encodeURIComponent(symbol)
      + '&from=' + iso(de_la) + '&to=' + iso(azi) + '&token=' + encodeURIComponent(k);
    var urlPret = 'https://query1.finance.yahoo.com/v8/finance/chart/'
      + encodeURIComponent(symbol) + '?interval=1d&range=' + ani + 'y';

    return Promise.all([
      D.fetchJSON(urlCal, { ttl: 21600, cacheKey: 'earnH:' + symbol }),
      D.fetchJSON(urlPret, { ttl: 21600, cacheKey: 'earnP:' + symbol }).catch(function () { return null; })
    ]).then(function (r) {
      var cal = r[0], pret = r[1];
      var raportari = (cal && Array.isArray(cal.earningsCalendar)) ? cal.earningsCalendar : [];
      if (!raportari.length) return { ok: true, items: [], motiv: '' };

      // zi (ISO) -> inchidere, si lista ordonata de zile, ca sa gasim ziua urmatoare
      var peZi = {}, zile = [];
      var res = pret && pret.chart && pret.chart.result && pret.chart.result[0];
      if (res && res.timestamp) {
        var q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
        var c = q.close || [];
        for (var i = 0; i < res.timestamp.length; i++) {
          if (c[i] == null) continue;
          var z = new Date(res.timestamp[i] * 1000).toISOString().slice(0, 10);
          peZi[z] = c[i];
          zile.push(z);
        }
      }
      zile.sort();

      function indexZi(z) {
        for (var i = 0; i < zile.length; i++) if (zile[i] >= z) return i;
        return -1;
      }

      var items = raportari.sort(function (a, b) { return a.date < b.date ? 1 : -1; })
        .slice(0, 8).map(function (e) {
          var reactie = null;
          if (zile.length) {
            var i = indexZi(e.date);
            // `amc` = raportare dupa inchidere, deci reactia e a ZILEI URMATOARE;
            // `bmo` = inainte de deschidere, deci chiar a zilei raportarii
            var iDupa = (e.hour === 'amc') ? i + 1 : i;
            var iInainte = iDupa - 1;
            if (i >= 0 && iDupa < zile.length && iInainte >= 0) {
              var a = peZi[zile[iInainte]], b = peZi[zile[iDupa]];
              if (a > 0 && b > 0) reactie = ((b - a) / a) * 100;
            }
          }
          var surpriza = null;
          if (e.epsActual != null && e.epsEstimate != null && e.epsEstimate !== 0) {
            surpriza = ((e.epsActual - e.epsEstimate) / Math.abs(e.epsEstimate)) * 100;
          }
          return {
            date: e.date, hour: e.hour,
            epsActual: e.epsActual, epsEstimate: e.epsEstimate,
            surpriza: surpriza, reactie: reactie
          };
        });

      return { ok: true, items: items, motiv: '' };
    }).catch(function (e) {
      return { ok: false, motiv: (e && e.message) || 'nu a răspuns', items: [] };
    });
  }

  /** „bmo" = inainte de deschidere, „amc" = dupa inchidere. Finnhub le da asa. */
  function cand(e) {
    if (!e) return '';
    if (e.hour === 'bmo') return 'înainte de deschidere';
    if (e.hour === 'amc') return 'după închidere';
    return e.hour || '';
  }

  global.EARN = { calendar: calendar, istoric: istoric, cand: cand, cheie: cheie };
})(typeof window !== 'undefined' ? window : globalThis);
