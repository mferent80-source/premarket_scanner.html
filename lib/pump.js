// pump.js — ce se misca brusc ACUM, o singura regula pentru toata suita (22.09.2026).
//
// De ce exista: hub-ul trebuia sa arate sugestiile din Pump Radar fara sa deschizi
// pagina. Copiata, regula ar fi devenit al doilea adevar - doua ecrane care spun
// lucruri usor diferite despre acelasi simbol, si nimeni nu stie care minte.
//
// Regula (`sugestie`) e EXACT cea din pump-radar, cu aceleasi praguri, citite din
// aceeasi cheie de configurare (`pump_radar_cfg`) - deci daca el schimba pragul
// acolo, se schimba si in hub.
//
// Ce NU aduce: insider (modul separat), nota AI, backtest. Hub-ul nu are nevoie de
// ele ca sa spuna „uita-te la asta"; pagina intreaga ramane pentru cand vrei de ce.
//
//   PUMP.scan()   -> { lista: [{symbol, price, m5, chgDay, volRatio, rsi, heat, alerts, act}], lipsa }
//   PUMP.sugestie(r [, insiderVerdict]) -> 'buy' | 'watch' | 'wait' | 'avoid' | 'skip'
(function (global) {
  'use strict';

  // Aceeasi lista ca in pump-radar. ATENTIE la limita lui `spark`:
  //
  // Comentariul din pump-radar spune „24 <= 25 -> incape intr-UN singur request".
  // Nu mai e adevarat: probat azi, Yahoo raspunde `400 Bad Request - Number of
  // symbols needs to be less than or equal to 20`. Praguri masurate: 20 -> 200,
  // 24 -> 400. Asa ca rupem in bucati de cate 20.
  //
  // (In pump-radar asta nu se vedea, fiindca `fetchSparkChunk` - functia batch - NU
  //  e chemata de nicaieri: pagina cere cate un simbol pe rand, 24 de cereri cu
  //  pauza de 200 ms intre ele. De asta scanul lui dureaza.)
  var UNIVERSE = [
    'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AMD','AVGO','NFLX','PLTR','SMCI','COIN','MSTR',
    'HOOD','SOFI','RIVN','MARA','RIOT','ARM','UBER','SHOP','NET','CRWD'
  ];

  var IMPLICIT = { thrMove: 1.5, thrVol: 3, thrPrice: 3 };

  /** Pragurile lui, din aceeasi cheie pe care o scrie pagina Pump Radar. */
  function praguri() {
    try {
      var c = JSON.parse(localStorage.getItem('pump_radar_cfg') || 'null');
      if (!c) return IMPLICIT;
      return {
        thrMove: c.thrMove != null ? +c.thrMove : IMPLICIT.thrMove,
        thrVol: c.thrVol != null ? +c.thrVol : IMPLICIT.thrVol,
        thrPrice: c.thrPrice != null ? +c.thrPrice : IMPLICIT.thrPrice
      };
    } catch (e) { return IMPLICIT; }
  }

  function medie(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; }

  function rsi(closes, period) {
    period = period || 14;
    if (!closes || closes.length < period + 1) return null;
    var g = 0, p = 0, i;
    for (i = closes.length - period; i < closes.length; i++) {
      var d = closes[i] - closes[i - 1];
      if (d >= 0) g += d; else p -= d;
    }
    g /= period; p /= period;
    if (p === 0) return 100;
    var rs = g / p;
    return 100 - (100 / (1 + rs));
  }

  function heat(m5, volRatio, mom) {
    var moveScore = Math.min(Math.abs(m5) / 5, 1) * 55;
    var volScore = volRatio != null ? Math.min(Math.max(volRatio - 1, 0) / 5, 1) * 35 : 0;
    return Math.round(Math.min(moveScore + volScore + (mom ? 10 : 0), 100));
  }

  /** Regula de sugestie - copiata cuvant cu cuvant din pump-radar, ca sa nu apara
      diferente tacute intre cele doua ecrane. `iv` = verdictul insider, cand exista. */
  function sugestie(r, iv) {
    var a = r.alerts || [];
    iv = iv || 'na';
    var rs = r.rsi;
    var hasPump = a.indexOf('up') !== -1;
    var hasDump = a.indexOf('down') !== -1;
    var hasVol = a.indexOf('vol') !== -1;
    var chgUp = (r.chgDay || 0) > 0;

    if (hasDump && (iv === 'bear' || hasVol)) return 'avoid';
    if (hasDump && rs != null && rs < 25) return 'avoid';
    if (hasPump && rs != null && rs >= 80) return 'wait';
    if (hasPump && hasVol && (iv === 'bull' || (chgUp && (rs == null || rs < 70)))) return 'buy';
    if (hasPump && (chgUp || iv === 'bull') && (rs == null || rs < 75)) return 'watch';
    if (r.momDir === 'up' && chgUp) return 'watch';
    if (hasDump) return 'wait';
    if (a.length === 0 && (r.heat || 0) < 30) return 'skip';
    return 'wait';
  }

  function parseSpark(d) {
    var arr = d && d.spark && Array.isArray(d.spark.result) ? d.spark.result : null;
    if (!arr) return null;
    var map = {};
    arr.forEach(function (r) {
      var sym = r && r.symbol;
      var resp = r && r.response && r.response[0];
      if (!sym || !resp) return;
      var meta = resp.meta || {};
      var tsRaw = resp.timestamp || [];
      var q = (resp.indicators && resp.indicators.quote && resp.indicators.quote[0]) || {};
      var closeRaw = q.close || [];
      var closes = [], tss = [], i;
      for (i = 0; i < closeRaw.length; i++) {
        if (closeRaw[i] == null) continue;
        closes.push(closeRaw[i]); tss.push(tsRaw[i] || 0);
      }
      if (closes.length < 4) return;
      var livePrice = closes[closes.length - 1];
      var lastTs = tss[tss.length - 1];
      // bara IN FORMARE se scoate: altfel „miscarea ultimei bare" masoara o bara
      // care inca se schimba, si sare de la o reimprospatare la alta
      if (lastTs && (Date.now() / 1000 - lastTs) < 300) closes.pop();
      if (closes.length < 4) return;
      map[sym] = {
        symbol: sym, price: livePrice, closes: closes,
        prevClose: meta.chartPreviousClose != null ? meta.chartPreviousClose
          : (meta.previousClose != null ? meta.previousClose : null)
      };
    });
    return map;
  }

  var MAX_SIMBOLURI = 20;   // limita lui Yahoo, masurata

  function scan() {
    var p = praguri();
    var bucati = [], i;
    for (i = 0; i < UNIVERSE.length; i += MAX_SIMBOLURI) {
      bucati.push(UNIVERSE.slice(i, i + MAX_SIMBOLURI));
    }
    return Promise.all(bucati.map(function (b, idx) {
      var url = 'https://query1.finance.yahoo.com/v7/finance/spark?symbols='
        + b.join(',') + '&range=1d&interval=5m';
      return D.fetchJSON(url, { ttl: 120, cacheKey: 'pump:scan:' + idx })
        .then(parseSpark)
        .catch(function () { return null; });
    })).then(function (parti) {
      var map = {};
      parti.forEach(function (x) { if (x) Object.keys(x).forEach(function (k) { map[k] = x[k]; }); });
      if (!Object.keys(map).length) {
        return { lista: [], lipsa: [{ ce: 'Pump Radar', dece: 'nicio bucată n-a răspuns' }] };
      }
      var out = [];
      Object.keys(map).forEach(function (sym) {
        var x = map[sym];
        var n = x.closes.length;
        var last = x.closes[n - 1], prev = x.closes[n - 2];
        var m5 = prev ? ((last - prev) / prev) * 100 : 0;
        var chgDay = x.prevClose ? ((x.price - x.prevClose) / x.prevClose) * 100 : 0;
        var r = rsi(x.closes);
        // fara volum in `spark`, raportul de volum ramane necunoscut: NU-l punem 1,
        // fiindca 1 ar insemna „volum normal", adica o afirmatie pe care n-o putem face
        var volRatio = null;
        var mom = null;
        var alerts = [];
        if (x.price >= p.thrPrice) {
          if (m5 >= p.thrMove) alerts.push('up');
          if (m5 <= -p.thrMove) alerts.push('down');
        }
        var rec = {
          symbol: sym, price: x.price, m5: m5, chgDay: chgDay, rsi: r,
          volRatio: volRatio, momDir: mom, alerts: alerts,
          // barele raman atasate: randul care se desface face backtest pe ele, fara
          // sa mai ceara o data aceleasi date
          closes: x.closes,
          heat: heat(m5, volRatio, mom)
        };
        rec.act = sugestie(rec);
        out.push(rec);
      });
      out.sort(function (a, b) { return b.heat - a.heat; });
      // Daca o bucata a picat, o spunem: altfel „3 simboluri se misca" ar putea
      // insemna si „din 24", si „din 4 cate au venit".
      var lipsa = [];
      if (Object.keys(map).length < UNIVERSE.length) {
        lipsa.push({ ce: 'Pump Radar: ' + (UNIVERSE.length - Object.keys(map).length) + ' simboluri n-au venit' });
      }
      return { lista: out, lipsa: lipsa };
    }).catch(function (e) {
      return { lista: [], lipsa: [{ ce: 'Pump Radar', dece: (e && e.message) || 'nu a răspuns' }] };
    });
  }

  global.PUMP = {
    UNIVERSE: UNIVERSE, praguri: praguri, scan: scan, sugestie: sugestie,
    rsi: rsi, heat: heat
  };
})(typeof window !== 'undefined' ? window : globalThis);
