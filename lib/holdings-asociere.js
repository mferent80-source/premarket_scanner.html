/* 28.10.2026 (I-771 … I-774) — „Salvează asocierea și analizează” nu făcea nimic VIZIBIL pentru TE (cumpărată pe 27.10): butonul mergea, dar
   câmpul venea precompletat („TE” tastat peste „FREY” dădea FREYTE), mesajul pleca în bara de stare de sus (în afara ecranului pe telefon),
   analiza apărea pe altă filă, asocierea stătea îngropată (card → Risc → Planul meu → pliu închis), iar analiza automată sărea TĂCUT poziția
   fără simbol. Aici, PUR (fără DOM, fără rețea): starea asocierii, propunerea după ISIN din căutarea Yahoo (doar ARĂTATĂ, cu identitatea la
   vedere; se aplică numai la o atingere), caseta de pe „Poziție & direcție” și textele de lângă buton. Nu atinge nicio amprentă a probelor. */
(function (g) {
  'use strict';
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var SIMBOL = /^[A-Z0-9][A-Z0-9.^=-]{0,24}$/, TIPURI = ['EQUITY', 'ETF'];
  /** Starea asocierii unei poziții: `lipsa` (fără simbol de piață: tickerul brokerului nu e în forma cunoscută și nu există asociere), `refuzat`
   *  (simbol asociat, dar ultima analiză a dat eroare pe exact acel simbol), altfel `ok`. `result` = intrarea din cache-ul analizei. */
  function stare(o) {
    var s = o && typeof o.symbol === 'string' && o.symbol ? o.symbol : null, r = o && o.result ? o.result : null;
    if (!s) return { cod: 'lipsa', simbol: null, text: 'Tickerul brokerului nu are un simbol de piață cunoscut; analiza automată nu pornește până nu îl asociezi.' };
    if (r && r.error && r.symbol === s && !(r.model && r.model.price > 0)) return { cod: 'refuzat', simbol: s, text: String(r.error) };
    return { cod: 'ok', simbol: s, text: '' };
  }
  /** Propunerea din căutarea Yahoo după ISIN (`v1/finance/search?q=<ISIN>`): prima cotație de acțiune / ETF cu simbol valid; null când nu există.
   *  Doar identitatea: simbol, nume, bursă; moneda vine din `cuMeta` (din seria de prețuri), nu din căutare (căutarea n-o dă). */
  function propunere(json, isin) {
    var q = json && Array.isArray(json.quotes) ? json.quotes : [];
    for (var i = 0; i < q.length; i++) {
      var x = q[i]; if (!x || typeof x.symbol !== 'string' || !SIMBOL.test(x.symbol) || x.isYahooFinance === false) continue;
      if (TIPURI.indexOf(String(x.quoteType || '').toUpperCase()) < 0) continue;
      return { symbol: x.symbol, nume: String(x.longname || x.shortname || x.symbol), bursa: String(x.exchDisp || x.exchange || 'bursă necunoscută'), moneda: null, isin: isin || null };
    }
    return null;
  }
  /** Completează propunerea cu moneda și bursa din seria de prețuri (D.fetchStock(...).meta); fără meta rămâne cum era. */
  function cuMeta(prop, bare) {
    var m = bare && bare.meta ? bare.meta : null; if (!prop || !m) return prop;
    return Object.assign({}, prop, { moneda: typeof m.currency === 'string' ? m.currency : prop.moneda, bursa: typeof m.exchange === 'string' && m.exchange ? m.exchange : prop.bursa });
  }
  /** Textul de lângă buton, pe stadii. */
  function mesaj(stadiu, info) {
    info = info || {};
    if (stadiu === 'salvat') return 'Salvat · analizez ' + (info.simbol || '') + '…';
    if (stadiu === 'gata') return 'Gata' + (info.asOf ? ' · analiză EOD din ' + info.asOf : '') + ' — vezi „Poziție & direcție”.';
    if (stadiu === 'eroare') return 'Eroare: ' + (info.text || 'analiza nu a dat un rezultat');
    if (stadiu === 'invalid') return 'Simbol de piață invalid: litere, cifre, punct, cratimă (ex. TE, ASML.AS).';
    if (stadiu === 'ocupat') return 'Analiza rulează deja; reîncearcă în câteva secunde.';
    return '';
  }
  /** Caseta de pe „Poziție & direcție” pentru o poziție fără simbol sau cu simbolul refuzat de Yahoo. `cautare` = { stare: 'in-curs' | 'gata' | 'nimic' | null, prop }. */
  function caseta(o) {
    var st = o.stare, isin = o.isin || null, c = o.cautare || null, prop = c && c.stare === 'gata' ? c.prop : null;
    var titlu = st.cod === 'lipsa' ? 'Simbol de piață lipsă' : 'Simbolul de piață e refuzat de Yahoo';
    var expl = st.cod === 'lipsa' ? 'Tickerul brokerului <b>' + esc(o.ticker) + '</b> nu are o formă cunoscută. Fără simbolul Yahoo exact nu există analiză EOD — poziția rămâne „simbol lipsă”, la vedere, nu analizată tăcut.'
      : 'Pentru <b>' + esc(st.simbol) + '</b> Yahoo a răspuns: „' + esc(st.text) + '”. Simbolul s-a schimbat (fuziune, redenumire) sau listarea e alta. Scrie simbolul exact de acum.';
    var p = '';
    if (prop) p = '<p class="asociere-propunere">Propunere după ISIN ' + esc(isin) + ': <b>' + esc(prop.symbol) + '</b> · ' + esc(prop.nume) + ' · ' + esc(prop.bursa) + ' · ' + esc(prop.moneda || 'monedă neverificată') + ' <button type="button" data-map-propune="' + esc(o.i) + '" data-simbol="' + esc(prop.symbol) + '">Folosește ' + esc(prop.symbol) + '</button></p><p class="meta">Doar o propunere: verifică numele și bursa înainte. Nu schimba listarea doar pentru că numele seamănă.</p>';
    else if (c && c.stare === 'in-curs') p = '<p class="meta">Caut pe Yahoo după ISIN ' + esc(isin) + '…</p>';
    else if (c && c.stare === 'nimic') p = '<p class="meta">Nicio propunere găsită pe Yahoo după ISIN ' + esc(isin) + (c.motiv ? ' (' + esc(c.motiv) + ')' : '') + '. Scrie simbolul de mână.</p>';
    else if (!isin) p = '<p class="meta">Brokerul n-a dat ISIN-ul, deci nu pot căuta o propunere. Scrie simbolul de mână.</p>';
    var hint = st.simbol ? 'acum: ' + st.simbol + ' · scrie simbolul nou' : 'Ex.: TE';
    return '<section class="asociere-caseta" data-asociere="summary" aria-label="Asocierea simbolului de piață"><h4>' + titlu + '</h4><p>' + expl + '</p>' + p
      + '<label>Simbol Yahoo<input data-symbol="' + esc(o.i) + '" value="" placeholder="' + esc(hint) + '" maxlength="25" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>'
      + '<button type="button" data-map="' + esc(o.i) + '">Salvează asocierea și analizează</button><p class="asociere-status" data-map-status="' + esc(o.i) + '" role="status" aria-live="polite">' + esc(o.status || '') + '</p></section>';
  }
  g.HoldingsAsociere = { SIMBOL: SIMBOL, stare: stare, propunere: propunere, cuMeta: cuMeta, mesaj: mesaj, caseta: caseta };
})(typeof window !== 'undefined' ? window : globalThis);
