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
      var pc = Number.isFinite(m.previousClose) ? m.previousClose
        : (Number.isFinite(m.chartPreviousClose) ? m.chartPreviousClose : null);
      // changePercent oficial e folosit DOAR dacă se lipește de close-ul de ieri.
      // Altfel e stale (sesiunea trecută: FISV −4% de luni lângă prețul de marți)
      // și Δ azi iese cu semnul greșit.
      if (Number.isFinite(m.regularMarketChangePercent) && Number.isFinite(last)
          && Math.abs(m.regularMarketChangePercent) > 1e-9) {
        var implied = last / (1 + m.regularMarketChangePercent / 100);
        if (pc != null && pc > 0 && Math.abs(implied - pc) / pc > 0.003) {
          prev = pc;
        } else {
          prev = implied;
        }
      } else {
        prev = pc;
      }
      src = 'yahoo-rth';
    } else if (ses === 'after') {
      prev = m.chartPreviousClose != null ? m.chartPreviousClose
        : (m.previousClose != null ? m.previousClose : m.regularMarketPrice);
    } else {
      // closed: close-ul oficial RTH, nu ultima bară AH. Noaptea INTC arăta 91.92 (AH)
      // vs 92.13 (close) → Δ diferit de Yahoo și de botul Telegram.
      if (Number.isFinite(m.regularMarketPrice)) last = m.regularMarketPrice;
      prev = m.chartPreviousClose != null ? m.chartPreviousClose
        : (m.previousClose != null ? m.previousClose : m.regularMarketPrice);
    }
    if (prev == null || !Number.isFinite(prev) || prev <= 0) prev = last;
    // ts = momentul REAL al cotației (ms). Consumatorul trebuie să poată afla din ce zi
    // de bursă e Δ-ul: cu piața US închisă, `range=1d` întoarce legitim sesiunea
    // PRECEDENTĂ, iar fără marcajul ăsta pagina o afișa drept „Δ azi".
    var ts = Number.isFinite(m.regularMarketTime) ? m.regularMarketTime * 1000 : null;
    return { last: last, prev: prev, src: src, ts: ts };
  }

  // Sesiune US (ET, DST-aware). Același ceas ca pagina /alerts/ — botul și pagina
  // trebuie să aleagă aceeași ramură din yahooQuote, altfel Δ overnight diverge.
  function usSessionEt(now) {
    var p = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', weekday: 'short',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date(now || Date.now()));
    var wd = '';
    var hour = 0;
    var minute = 0;
    for (var i = 0; i < p.length; i++) {
      if (p[i].type === 'weekday') wd = p[i].value;
      else if (p[i].type === 'hour') hour = parseInt(p[i].value, 10) || 0;
      else if (p[i].type === 'minute') minute = parseInt(p[i].value, 10) || 0;
    }
    if (hour === 24) hour = 0;
    var mins = hour * 60 + minute;
    if (wd === 'Sat' || wd === 'Sun') return 'closed';
    if (mins >= 570 && mins < 960) return 'rth';
    if (mins >= 240 && mins < 570) return 'pre';
    if (mins >= 960 && mins < 1200) return 'after';
    return 'closed';
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
    // Dacă meta n-are regularMarketTime, cade pe ultima bară primită — tot un moment real.
    if (q.ts == null && res.timestamp && res.timestamp.length) {
      var lt = res.timestamp[res.timestamp.length - 1];
      if (Number.isFinite(lt)) q.ts = lt * 1000;
    }
    if (opts.publish !== false) publish(symbol, q);
    return q;
  }

  var api = {
    yahooQuote: yahooQuote, busOk: busOk, lastBarFromCloses: lastBarFromCloses,
    usSessionEt: usSessionEt,
    summarizeBus: summarizeBus, publish: publish, fetchDay: fetchDay
  };
  g.PriceDay = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
