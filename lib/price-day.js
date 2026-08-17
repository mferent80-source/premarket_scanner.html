// price-day.js — baseline variația zilei din meta Yahoo (RTH / pre / after / EU).
// Folosire: <script src="../lib/price-day.js"></script> apoi PriceDay.yahooQuote(...)
(function (g) {
  'use strict';

  function yahooQuote(meta, lastBar, ses, isEU) {
    var m = meta || {};
    var last = lastBar;
    var prev = null;
    var src = 'yahoo';
    if (isEU) {
      prev = m.chartPreviousClose != null ? m.chartPreviousClose : m.previousClose;
    } else if (ses === 'pre') {
      prev = m.regularMarketPrice != null ? m.regularMarketPrice
        : (m.chartPreviousClose != null ? m.chartPreviousClose : m.previousClose);
    } else if (ses === 'rth') {
      if (Number.isFinite(m.regularMarketPrice)) last = m.regularMarketPrice;
      if (Number.isFinite(m.regularMarketChangePercent) && Number.isFinite(last)
          && Math.abs(m.regularMarketChangePercent) > 1e-9) {
        prev = last / (1 + m.regularMarketChangePercent / 100);
      } else {
        prev = m.chartPreviousClose != null ? m.chartPreviousClose : m.previousClose;
      }
      src = 'yahoo-rth';
    } else {
      prev = m.chartPreviousClose != null ? m.chartPreviousClose
        : (m.previousClose != null ? m.previousClose : m.regularMarketPrice);
    }
    if (prev == null || !Number.isFinite(prev) || prev <= 0) prev = last;
    return { last: last, prev: prev, src: src };
  }

  var api = { yahooQuote: yahooQuote };
  g.PriceDay = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
