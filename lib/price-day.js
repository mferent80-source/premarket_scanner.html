// price-day.js — baseline variația zilei din meta Yahoo (RTH / pre / after / EU).
// Folosire: <script src="../lib/price-day.js"></script> apoi PriceDay.yahooQuote(...)
(function (g) {
  'use strict';

  // Meta Yahoo („regularMarketPrice" + „regularMarketTime") e din sesiunea regular ÎN CURS,
  // sau a rămas pe cea precedentă? La open (9:30 ET / 16:30 RO) Yahoo ține minute bune meta
  // pe close-ul de IERI, în timp ce barele 1m de azi curg deja. Fereastra sesiunii curente
  // vine chiar din răspuns (`currentTradingPeriod.regular`), deci nu ghicim cu ceasul local.
  //   true  = meta e din sesiunea curentă · false = DOVEDIT rămasă în urmă
  //   null  = nu se poate ști (meta fără timp/fereastră) → păstrăm comportamentul vechi
  function metaRegularIsCurrent(m) {
    var rmt = (m && Number.isFinite(m.regularMarketTime)) ? m.regularMarketTime : null;
    if (rmt == null) return null;
    var reg = m.currentTradingPeriod && m.currentTradingPeriod.regular;
    if (reg && Number.isFinite(reg.start)) return rmt >= reg.start;
    return null;
  }

  // ── MONEDA ─────────────────────────────────────────────────────────────────
  // Yahoo trimite `meta.currency` de la început; până la v796 nu-l citea nimeni, iar
  // paginile scriau „$" la orice preț. 1QZ.DE (Coinbase pe XETRA) = 161.34 EUR apărea
  // ca „$161.34", cu 13.6% sub prețul real al COIN de pe Nasdaq — „cotele nu sunt reale".
  var CUR_SIGN = { USD: "$", EUR: "€", GBP: "£", GBp: "p", CHF: "CHF", JPY: "¥",
    CAD: "C$", AUD: "A$", SEK: "kr", NOK: "kr", DKK: "kr", PLN: "zł", RON: "lei", HKD: "HK$" };
  function curSymbol(cur) {
    if (!cur) return "$";
    var c = String(cur);
    if (CUR_SIGN[c]) return CUR_SIGN[c];
    var up = c.toUpperCase();
    return CUR_SIGN[up] || up;
  }
  // Moneda dedusă din sufixul bursei — folosită cât timp n-a venit încă meta (primul paint,
  // preț din cache vechi). Fără ea, un simbol european apare o clipă cu „$" la fiecare reload.
  var SUF_CUR = { DE: "EUR", MU: "EUR", F: "EUR", BE: "EUR", DU: "EUR", HM: "EUR", SG: "EUR",
    PA: "EUR", AS: "EUR", BR: "EUR", MI: "EUR", MC: "EUR", LS: "EUR", VI: "EUR", HE: "EUR",
    IR: "EUR", AT: "EUR", L: "GBp", SW: "CHF", ST: "SEK", OL: "NOK", CO: "DKK", WA: "PLN",
    TO: "CAD", V: "CAD", AX: "AUD", T: "JPY", HK: "HKD" };
  function curFromSuffix(symbol) {
    var s = String(symbol || "");
    var i = s.lastIndexOf(".");
    if (i < 0) return "USD";
    var suf = s.slice(i + 1);
    return SUF_CUR[suf] || SUF_CUR[suf.toUpperCase()] || "USD";
  }
  // Vechimea COTAȚIEI, nu a fetch-ului. Pe bursele unde dublura unei acțiuni US se
  // tranzacționează de câteva ori pe zi (MIGA.MU: 5 tranzacții într-o zi întreagă),
  // fetch-ul reușește la fiecare 30s peste un preț vechi de ore — și pagina îl arăta
  // drept live, cu un Δ zi de +0.88% lângă MSTR care făcea +5.43% pe Nasdaq.
  function quoteAgeMs(q, now) {
    if (!q || !Number.isFinite(q.ts)) return null;
    return (Number.isFinite(now) ? now : Date.now()) - q.ts;
  }

  // Cotatia care SARE INAPOI = raspuns din cache-ul unui proxy, nu pret nou.
  // 25.08.2026: `corsproxy.io` servea 200 OK cu o cotatie inghetata de 33 de minute; pagina
  // o lua drept buna si scria LIVE peste ea. Un pret nou nu poate fi mai VECHI decat cel pe
  // care il avem deja pentru acelasi simbol — daca e, il refuzam si lasam randul altui proxy.
  // Toleranta: o bursa ilichida repeta legitim aceeasi cotatie (MIGA.MU: 5 tranzactii pe zi),
  // deci egalitatea E ACCEPTATA; doar un salt inapoi mai mare de `tolMs` e semn de cache.
  function quoteWentBackwards(tsNou, tsStiut, tolMs) {
    var tol = Number.isFinite(tolMs) ? tolMs : 120000;
    if (!Number.isFinite(tsNou) || !Number.isFinite(tsStiut)) return false;
    return tsNou < tsStiut - tol;
  }

  // Bursa simbolului e deschisa ACUM? Fereastra vine chiar din raspuns
  // (`currentTradingPeriod.regular`), deci merge pentru ORICE bursa — nu ghicim orarul
  // XETRA cu ceasul local. 25.08.2026: dupa 18:30 RO (17:30 CET) cotatiile germane nu se
  // mai misca, iar pagina arata doar o vechime care creste — exact ca un fetch mort.
  // „Bursa e inchisa" si „nu mai primim date" trebuie sa arate DIFERIT.
  //   true = deschisa · false = inchisa · null = nu se poate sti (meta fara fereastra)
  // Ora la care se inchide sesiunea regulara a bursei simbolului (ms) — pentru „pana cand".
  function marketCloseMs(m) {
    var reg = m && m.currentTradingPeriod && m.currentTradingPeriod.regular;
    return (reg && Number.isFinite(reg.end)) ? reg.end * 1000 : null;
  }

  function marketIsOpen(m, now) {
    var reg = m && m.currentTradingPeriod && m.currentTradingPeriod.regular;
    if (!reg || !Number.isFinite(reg.start) || !Number.isFinite(reg.end)) return null;
    var t = Math.floor((Number.isFinite(now) ? now : Date.now()) / 1000);
    return t >= reg.start && t < reg.end;
  }

  function yahooQuote(meta, lastBar, ses, isEU, lastBarTs) {
    var m = meta || {};
    var last = lastBar;
    var prev = null;
    var src = 'yahoo';
    var rmtMs = Number.isFinite(m.regularMarketTime) ? m.regularMarketTime * 1000 : null;
    // ts urmărește VALOAREA din `last`: bara live are ora ei, meta o are pe a lui
    // `regularMarketTime`. Amestecul celor două a fost bug-ul: în pre/after `last` era
    // bara de AZI, dar ts-ul raportat era al ultimului tick regular, adică de IERI.
    var ts = Number.isFinite(lastBarTs) ? lastBarTs : null;
    if (isEU) {
      prev = m.chartPreviousClose != null ? m.chartPreviousClose : m.previousClose;
    } else if (ses === 'pre') {
      prev = m.regularMarketPrice != null ? m.regularMarketPrice
        : (m.chartPreviousClose != null ? m.chartPreviousClose : m.previousClose);
    } else if (ses === 'rth') {
      // Meta bate bara 1m (poate fi întârziată) — DAR nu când e dovedit rămasă în sesiunea
      // trecută. Fără garda asta, la 16:30 RO prețul de azi era aruncat și pe ecran reveneau
      // close-ul + Δ-ul de IERI, cu chip „RTH" lângă ele: pagina părea vie, cifrele nu erau.
      if (Number.isFinite(m.regularMarketPrice) && metaRegularIsCurrent(m) !== false) {
        last = m.regularMarketPrice;
        ts = rmtMs;
      }
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
      if (Number.isFinite(m.regularMarketPrice)) { last = m.regularMarketPrice; ts = rmtMs; }
      prev = m.chartPreviousClose != null ? m.chartPreviousClose
        : (m.previousClose != null ? m.previousClose : m.regularMarketPrice);
    }
    if (prev == null || !Number.isFinite(prev) || prev <= 0) prev = last;
    // ts = momentul REAL al cotației (ms) din care vine `last`. Consumatorul trebuie să poată
    // afla din ce zi de bursă e Δ-ul: cu piața US închisă, `range=1d` întoarce legitim
    // sesiunea PRECEDENTĂ, iar fără marcajul ăsta pagina o afișa drept „Δ azi".
    // Fără `lastBarTs` de la apelant (apeluri vechi) cădem pe regularMarketTime, ca înainte.
    if (ts == null) ts = rmtMs;
    // Moneda și bursa merg mai departe cu prețul: un 161.34 fără „EUR" lângă el nu se poate
    // deosebi de 161.34 USD, iar diferența dintre XETRA și Nasdaq e de ~14%.
    var cur = (m.currency ? String(m.currency) : "USD");
    var exch = m.fullExchangeName || m.exchangeName || null;
    return { last: last, prev: prev, src: src, ts: ts, cur: cur, exch: exch, mktOpen: marketIsOpen(m), mktEnd: marketCloseMs(m) };
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

  // Ca lastBarFromCloses, dar spune și DIN CE MOMENT e bara (ms). Fără ora ei, un preț
  // proaspăt de azi nu se poate deosebi de unul rămas din sesiunea trecută.
  function lastBarAt(closes, timestamps) {
    if (!closes || !closes.length) return null;
    for (var i = closes.length - 1; i >= 0; i--) {
      if (closes[i] != null && Number.isFinite(closes[i])) {
        var t = (timestamps && Number.isFinite(timestamps[i])) ? timestamps[i] * 1000 : null;
        return { value: closes[i], ts: t };
      }
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
      bust: opts.bust != null ? opts.bust : 20,   // cotatie live: URL care se schimba, ca sa nu vina din cache-ul unui proxy
      timeout: opts.timeout != null ? opts.timeout : 6000,
      swr: false,
      cacheKey: 'pd:y1m:' + String(symbol).toUpperCase(),
      validate: function (d) { return d && d.chart; }
    });
    var res = j && j.chart && j.chart.result && j.chart.result[0];
    if (!res) return null;
    var m = res.meta || {};
    var bar = lastBarAt(res.indicators && res.indicators.quote && res.indicators.quote[0]
      && res.indicators.quote[0].close, res.timestamp);
    var last = bar ? bar.value : null;
    var barTs = bar ? bar.ts : null;
    if (last == null) {
      // Preț din meta, nu din bară → ora barei nu i se aplică.
      barTs = null;
      if (ses === 'pre') last = m.preMarketPrice;
      else if (ses === 'after') last = m.postMarketPrice;
    }
    if (last == null) last = m.regularMarketPrice;
    if (last == null || !Number.isFinite(last)) return null;
    var q = yahooQuote(m, last, isEU ? 'rth' : ses, isEU, barTs);
    // Dacă nici bara, nici meta n-au dat un moment, cade pe ultimul timestamp primit.
    if (q.ts == null && res.timestamp && res.timestamp.length) {
      var lt = res.timestamp[res.timestamp.length - 1];
      if (Number.isFinite(lt)) q.ts = lt * 1000;
    }
    if (opts.publish !== false) publish(symbol, q);
    return q;
  }

  var api = {
    yahooQuote: yahooQuote, busOk: busOk, lastBarFromCloses: lastBarFromCloses,
    lastBarAt: lastBarAt, metaRegularIsCurrent: metaRegularIsCurrent, marketIsOpen: marketIsOpen, marketCloseMs: marketCloseMs,
    usSessionEt: usSessionEt,
    curSymbol: curSymbol, curFromSuffix: curFromSuffix, quoteAgeMs: quoteAgeMs, quoteWentBackwards: quoteWentBackwards,
    summarizeBus: summarizeBus, publish: publish, fetchDay: fetchDay
  };
  g.PriceDay = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
