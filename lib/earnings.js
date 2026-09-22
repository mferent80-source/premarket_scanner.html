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

  /** „bmo" = inainte de deschidere, „amc" = dupa inchidere. Finnhub le da asa. */
  function cand(e) {
    if (!e) return '';
    if (e.hour === 'bmo') return 'înainte de deschidere';
    if (e.hour === 'amc') return 'după închidere';
    return e.hour || '';
  }

  global.EARN = { calendar: calendar, cand: cand, cheie: cheie };
})(typeof window !== 'undefined' ? window : globalThis);
