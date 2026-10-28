/* 28.10.2026 (I-776) — scripturi încărcate la cerere. O etichetă `<script type="text/x-la-cerere" data-grup="…" src="…">` e pentru browser un bloc
   de date: nu se descarcă, nu se execută, dar rămâne în pagină cu `src` și `?v=` (ordinea și versiunile se văd și se testează ca înainte).
   `ScripturiLaCerere.incarca(grup)`: descarcă TOATE fișierele grupului în paralel (prin fetch, deci prin același service worker și același cache
   `?v=`), și abia când toate au sosit le execută în ORDINEA din pagină, ca scripturi inline cu `//# sourceURL=` (numele real rămâne în consolă).
   Tot sau nimic: un fișier lipsă (offline la prima deschidere) ⇒ nimic nu se execută, promisiunea e respinsă cu numele fișierului și grupul se
   poate reîncerca; altfel modelele ar rămâne pe jumătate (verdictul fără HMM, de pildă). Execuția cedează firul la fiecare ~12 ms, ca pagina să
   răspundă la atingeri și în timpul încărcării. Promisiunea e memorată pe grup. Fără dependențe; folosit întâi de Portofoliu (modelele AI). */
(function (g) {
  'use strict';
  var TIP = 'text/x-la-cerere', BUGET_MS = 12, promisiuni = {};
  function etichete(grup) { return Array.prototype.slice.call(document.querySelectorAll('script[type="' + TIP + '"][data-grup="' + grup + '"]')); }
  function descarca(src) {
    return fetch(src).then(function (r) {
      if (!r.ok) throw new Error('Scriptul nu s-a încărcat: ' + src + ' (HTTP ' + r.status + ')');
      return r.text();
    }, function (e) { throw new Error('Scriptul nu s-a încărcat: ' + src + (e && e.message ? ' (' + e.message + ')' : '')); });
  }
  function executa(src, text) {
    var s = document.createElement('script');
    s.setAttribute('data-la-cerere', src);
    s.text = text + '\n//# sourceURL=' + new URL(src, document.baseURI).href;
    (document.head || document.body).appendChild(s);
  }
  var acum = function () { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); };
  function executaInOrdine(surse, texte) {
    return new Promise(function (rezolva) {
      var i = 0;
      (function pas() {
        var t0 = acum();
        while (i < surse.length) { executa(surse[i], texte[i]); i++; if (acum() - t0 > BUGET_MS) break; }
        if (i < surse.length) setTimeout(pas, 0); else rezolva(surse);
      })();
    });
  }
  function incarca(grup) {
    if (promisiuni[grup]) return promisiuni[grup];
    var surse = etichete(grup).map(function (t) { return t.getAttribute('src'); });
    promisiuni[grup] = Promise.all(surse.map(descarca))
      .then(function (texte) { return executaInOrdine(surse, texte); })
      .catch(function (e) { delete promisiuni[grup]; throw e; });
    return promisiuni[grup];
  }
  /** `pornit(grup)`: încărcarea grupului a fost cerută și nu a eșuat (nu înseamnă neapărat că s-a și terminat). */
  function pornit(grup) { return !!promisiuni[grup]; }
  g.ScripturiLaCerere = { TIP: TIP, etichete: etichete, incarca: incarca, pornit: pornit };
})(typeof window !== 'undefined' ? window : globalThis);
