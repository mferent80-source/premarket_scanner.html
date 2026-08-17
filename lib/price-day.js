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

  function busOk(src) {
    var s = String(src || '');
    return s === 'alerts' || s === 'yahoo' || s === 'yahoo-rth' || s === 'price-day';
  }

  function lastBarFromCloses(closes) {
    if (!closes || !closes.length) return null;
    for (var i = closes.length - 1; i >= 0; i--) {
      if (closes[i] != null && Number.isFinite(closes[i])) return closes[i];
    }
    return null;
  }

  function summarizeBus(quotes) {
    var bySrc = {};
    var poison = [];
    var n = 0;
    Object.keys(quotes || {}).forEach(function (k) {
      var q = quotes[k];
      if (!q) return;
      n++;
      var src = String(q.src || '?');
      bySrc[src] = (bySrc[src] || 0) + 1;
      if (!busOk(src) && typeof q.chgPct === 'number' && Number.isFinite(q.chgPct)) {
        poison.push(k + ':' + src);
      }
    });
    return { n: n, bySrc: bySrc, poison: poison, poisonN: poison.length };
  }

  function publish(sym, q) {
    if (!g.QB || !g.QB.set || !q || !Number.isFinite(q.last)) return false;
    var chg;
    if (Number.isFinite(q.prev) && q.prev > 0) chg = (q.last - q.prev) / q.prev * 100;
    return g.QB.set(sym, { price: q.last, chgPct: chg, src: q.src || 'price-day' });
  }

  async function fetchDay(symbol, opts) {
    opts = opts || {};
    var fetchJSON = opts.fetchJSON || (g.D && g.D.fetchJSON);
    if (!fetchJSON) return null;
    var ses = opts.session || 'rth';
    var isEU = !!opts.isEU;
    var url = 'https://query1.finance.yahoo.com/v8/finance/chart/'
      + encodeURIComponent(symbol) + '?interval=1m&range=1d&includePrePost=true';
    var j = await fetchJSON(url, {
      ttl: opts.ttl != null ? opts.ttl : 15,
      timeout: opts.timeout != null ? opts.timeout : 6000,
      swr: false,
      cacheKey: 'pd:y1m:' + String(symbol).toUpperCase(),
      validate: function (d) { return d && d.chart; }
    });
    var res = j && j.chart && j.chart.result && j.chart.result[0];
    if (!res) return null;
    var m = res.meta || {};
    var last = lastBarFromCloses(res.indicators && res.indicators.quote && res.indicators.quote[0]
      && res.indicators.quote[0].close);
    if (last == null) {
      if (ses === 'pre') last = m.preMarketPrice;
      else if (ses === 'after') last = m.postMarketPrice;
    }
    if (last == null) last = m.regularMarketPrice;
    if (last == null || !Number.isFinite(last)) return null;
    var q = yahooQuote(m, last, isEU ? 'rth' : ses, isEU);
    if (opts.publish !== false) publish(symbol, q);
    return q;
  }

  var api = {
    yahooQuote: yahooQuote, busOk: busOk, lastBarFromCloses: lastBarFromCloses,
    summarizeBus: summarizeBus, publish: publish, fetchDay: fetchDay
  };
  g.PriceDay = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
