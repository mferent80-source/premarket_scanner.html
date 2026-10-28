/* 28.10.2026 (I-778) — „Modelele pe portofoliu”: răspunsul la „la mine apare vreodată direcție?”. Învățarea automată antrenează zilnic toate cele 7
   modele pentru fiecare deținere, dar starea lor se vedea doar poziție cu poziție, în fila „Modele AI” sau în dialogul Verdict AI. Aici, PUR (fără DOM,
   fără rețea, fără calcul nou): pentru fiecare deținere, din rapoartele deja păstrate — lungimea istoricului (din amprenta OHLCV), starea fiecărui model,
   verdictul care ar ieși acum din rapoartele existente și PRIMUL motiv pentru care nu dă direcție; plus scorul verdictelor deja judecate față de realitate
   (registrul „Predicții vs. realitate”). Nimic de aici nu e un semnal de tranzacționare și nu atinge nicio amprentă a probelor. */
(function (g) {
  'use strict';
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var MODELE = [['neural', 'Neural'], ['boosting', 'Boosting'], ['knn', 'KNN'], ['hmm', 'HMM'], ['isolation', 'Isolation'], ['quantile', 'Cuantile'], ['garch', 'GARCH']];
  var CLASE = ['Declin', 'Mixt', 'Avans'];
  /* starea unui card, pe scurt și în română; `trece` = modelul contribuie la direcție (research / descriptive / ordinary) */
  var SCURT = { research: 'trece', descriptive: 'trece', ordinary: 'trece', 'no-edge': 'fără avantaj', fragile: 'fragil', drift: 'în afara domeniului', disagreement: 'dezacord', uncertain: 'de graniță', anomaly: 'anomalie', limited: 'limitat', weak: 'slab', transition: 'tranziție', blocked: 'blocat', missing: 'lipsă', stale: 'expirat', invalid: 'invalid', unavailable: 'reanalizează', running: 'în curs', error: 'eroare', cancelled: 'oprit' };
  var PRAG_ISTORIC = 1000;
  /** Sesiunile din amprenta istoricului comun (`ohlcv-v1:<n>:…`), sau null. */
  function istoric(amprenta) { var m = /^ohlcv-v1:(\d+):/.exec(String(amprenta == null ? '' : amprenta)); return m ? Number(m[1]) : null; }
  /** „Istoricul comun” așteptat de verdict, reconstruit din raportul Neural păstrat (același pentru toate modelele dacă sunt actuale). */
  function asteptat(record) {
    if (!record || typeof record.sourceFingerprint !== 'string' || !record.symbol) return null;
    return { symbol: record.symbol, currency: record.currency, asOf: record.asOf, kind: record.kind, t: record.sourceTime, close: record.sourceClose, timezone: record.timezone, closeMinutes: record.closeMinutes, fingerprint: record.sourceFingerprint };
  }
  /** Verdictele deja judecate față de realitate, din registrul deținerii (intrările `model: 'verdict'`). Abținerile nu intră în acuratețe. */
  function rezumatRegistru(entries) {
    var F = g.HoldingsForecast, lista = Array.isArray(entries) ? entries : [];
    var inAsteptare = lista.filter(function (r) { return r && r.model === 'verdict' && r.verification && r.verification.state === 'pending'; }).length;
    var a = F ? F.aggregate(lista, 'verdict', 5) : { n: 0, directional: 0, abstentions: 0, accuracy: null };
    var directie = a.directional || 0, corecte = directie && Number.isFinite(a.accuracy) ? Math.round(a.accuracy * directie) : 0;
    return { n: a.n || 0, directie: directie, corecte: corecte, abtineri: a.abstentions || 0, inAsteptare: inAsteptare, suficient: directie >= 20 };
  }
  function textRealitate(r) {
    if (!r || (!r.n && !r.inAsteptare)) return 'Niciun verdict judecat încă față de realitate.';
    var t = r.n ? 'Verdicte judecate: ' + r.directie + ' cu direcție, ' + r.corecte + ' corecte · ' + r.abtineri + ' abțineri' : 'Niciun verdict judecat încă';
    if (r.inAsteptare) t += ' · ' + r.inAsteptare + ' în așteptare (+5 sesiuni)';
    if (r.n && !r.suficient) t += ' · sub pragul de 20 cu direcție: exploratoriu';
    return t + '.';
  }
  /** Rândul unei dețineri: stările celor 7 carduri, verdictul din rapoartele existente și primul blocaj. */
  function rand(o) {
    var v = o.verdict || {}, cards = Array.isArray(v.cards) ? v.cards : [], d = o.diagnostic || {}, stari = {}, actuale = 0;
    MODELE.forEach(function (m) {
      var c = cards.find(function (x) { return x.id === m[0]; }), st = c ? (c.available ? (c.state || 'invalid') : (c.state === 'unavailable' ? 'unavailable' : c.state || 'missing')) : 'missing';
      if (c && c.available) actuale++;
      stari[m[0]] = { cod: st, text: SCURT[st] || st, trece: !!(c && c.available && c.eligible), valoare: c && c.available ? c.value : null };
    });
    var blocaj = null, b = Array.isArray(d.blockers) && d.blockers.length ? d.blockers[0] : null;
    if (v.direction === null || v.direction === undefined) {
      if (b) blocaj = { nume: b.label || b.name || 'Blocaj', detaliu: b.detail || '' };
      else if (actuale < MODELE.length) blocaj = { nume: 'Rapoarte lipsă', detaliu: (MODELE.length - actuale) + ' modele fără raport actual. Învățarea automată le reface la următoarea sesiune EOD sau apasă „Calculează verdict AI”.' };
      else blocaj = { nume: v.title || 'Fără direcție', detaliu: Array.isArray(v.reasons) && v.reasons.length ? v.reasons[0] : '' };
    }
    return { ticker: o.ticker, symbol: o.symbol || null, istoric: Number.isFinite(o.istoric) ? o.istoric : null, istoricScurt: Number.isFinite(o.istoric) && o.istoric < PRAG_ISTORIC, actuale: actuale, total: MODELE.length, stari: stari, verdict: { state: v.state || 'incomplete', title: v.title || 'Fără rapoarte', direction: v.direction == null ? null : v.direction, clasa: v.direction == null ? null : CLASE[v.direction] }, blocaj: blocaj, realitate: o.registru || rezumatRegistru([]) };
  }
  /** Capul tabloului: câte dețineri au toate rapoartele, câte au direcție, care e blocajul cel mai des. */
  function rezumat(rows) {
    var complete = rows.filter(function (r) { return r.actuale === r.total; }).length, directie = rows.filter(function (r) { return r.verdict.direction !== null; }).length, scurte = rows.filter(function (r) { return r.istoricScurt; }).length;
    var motive = {}; rows.forEach(function (r) { if (r.blocaj) motive[r.blocaj.nume] = (motive[r.blocaj.nume] || 0) + 1; });
    var top = Object.keys(motive).sort(function (a, b) { return motive[b] - motive[a]; })[0] || null;
    var judecate = rows.reduce(function (s, r) { return s + r.realitate.n; }, 0), corecte = rows.reduce(function (s, r) { return s + r.realitate.corecte; }, 0), cuDirectie = rows.reduce(function (s, r) { return s + r.realitate.directie; }, 0);
    return { detineri: rows.length, complete: complete, directie: directie, istoricScurt: scurte, blocajTop: top, blocajTopN: top ? motive[top] : 0, judecate: judecate, judecateCuDirectie: cuDirectie, corecte: corecte };
  }
  function markupRand(r) {
    var cap = '<b>' + esc(r.ticker) + '</b>' + (r.symbol && r.symbol !== r.ticker ? ' <span class="meta">' + esc(r.symbol) + '</span>' : '') + (r.istoric !== null ? ' <span class="meta">' + r.istoric.toLocaleString('ro-RO') + ' sesiuni' + (r.istoricScurt ? ' · istoric scurt' : '') + '</span>' : ' <span class="meta">fără raport</span>');
    var eticheta = r.verdict.direction !== null ? '<span class="tag mp-directie">' + esc(r.verdict.clasa) + '</span>' : '<span class="tag">fără direcție</span>';
    var modele = MODELE.map(function (m) { var s = r.stari[m[0]]; return '<span class="mp-model' + (s.trece ? ' mp-trece' : s.cod === 'missing' || s.cod === 'unavailable' ? ' mp-lipsa' : '') + '" title="' + esc(s.valoare || '') + '">' + m[1] + ': ' + esc(s.text) + '</span>'; }).join(' ');
    var motiv = r.blocaj ? '<p class="meta mp-motiv"><b>De ce nu dă direcție:</b> ' + esc(r.blocaj.nume) + (r.blocaj.detaliu ? ' — ' + esc(r.blocaj.detaliu) : '') + '</p>' : '<p class="meta mp-motiv"><b>' + esc(r.verdict.title) + '</b></p>';
    return '<article class="mp-rand" data-mp-ticker="' + esc(r.ticker) + '"><div class="mp-cap">' + cap + eticheta + '</div><p class="mp-modele">' + modele + '</p>' + motiv + '<p class="meta">' + esc(textRealitate(r.realitate)) + '</p></article>';
  }
  /** Tabloul întreg, pentru secțiunea din „Rapoarte & evenimente”. */
  function markup(rows, o) {
    o = o || {}; var s = rezumat(rows);
    var stats = [['Dețineri', s.detineri], ['Cu toate 7 rapoartele', s.complete], ['Cu direcție acum', s.directie], ['Verdicte judecate · corecte', s.judecateCuDirectie ? s.corecte + ' / ' + s.judecateCuDirectie : '—']].map(function (x) { return '<div><small>' + esc(x[0]) + '</small><b>' + esc(x[1]) + '</b></div>'; }).join('');
    var top = s.blocajTop ? '<p class="meta">Blocajul cel mai des: <b>' + esc(s.blocajTop) + '</b> (' + s.blocajTopN + ' din ' + s.detineri + ')' + (s.istoricScurt ? ' · ' + s.istoricScurt + ' cu istoric sub ' + PRAG_ISTORIC.toLocaleString('ro-RO') + ' sesiuni' : '') + '.</p>' : '';
    return '<div class="forecast-monitor-heading"><div><span class="eyebrow">PORTOFOLIU · RAPOARTELE DEJA ANTRENATE</span><h3>Modelele pe portofoliu</h3><p>Starea fiecărui model și motivul exact pentru care verdictul nu dă direcție, din rapoartele păstrate pe acest aparat. Nu pornește calcule noi.</p></div><span class="tag">' + (o.demo ? 'SIMULARE' : 'Local · acest dispozitiv') + '</span></div>'
      + '<div class="forecast-monitor-stats">' + stats + '</div>' + top
      + (rows.length ? '<div class="mp-lista">' + rows.map(markupRand).join('') + '</div>' : '<p class="meta">Nu există dețineri în contextul curent.</p>')
      + '<p class="meta">„Trece” = modelul contribuie la direcție (avantaj repetat sau validare descriptivă). Direcția e experimentală, pe +5 sesiuni, fără probabilitate de profit; știrile, costurile și riscul portofoliului se verifică separat.</p>';
  }
  /** Rândul de pe „Poziție & direcție”: verdictele deținerii deja judecate față de realitate. */
  function markupRealitate(r, o) {
    o = o || {}; if (!r) return '';
    return '<p class="meta mp-realitate" data-mp-realitate>' + (o.demo ? 'SIMULARE · ' : '') + esc(textRealitate(r)) + '</p>';
  }
  g.HoldingsModelePortofoliu = { MODELE: MODELE, PRAG_ISTORIC: PRAG_ISTORIC, istoric: istoric, asteptat: asteptat, rezumatRegistru: rezumatRegistru, textRealitate: textRealitate, rand: rand, rezumat: rezumat, markup: markup, markupRealitate: markupRealitate };
})(typeof window !== 'undefined' ? window : globalThis);
