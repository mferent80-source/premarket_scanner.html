/* 28.10.2026 (I-776) — „se încarcă foarte greu paginile în app” (Marius, pe telefon). Portofoliul executa la fiecare deschidere ≈630 KB de modele AI
   (55 de scripturi: neural, boosting, kNN, HMM, GARCH, cuantile, izolare, prognoze, învățare, verdict, performanță…) ÎNAINTE să deseneze lista.
   Acum scripturile acelea stau în pagină ca `type="text/x-la-cerere" data-grup="modele"` (vezi lib/scripturi-la-cerere.js) și se încarcă:
     · după primul cadru desenat (requestAnimationFrame + setTimeout 0), ca învățarea automată, fereastra de notare și coloana de probabilități din
       listă să rămână exact ca înainte — doar pornesc după ce lista e pe ecran;
     · pe loc, la o atingere pe grupul „Analiză” / fila „Modele AI”, pe „Calculează verdict AI” sau pe fila „Rapoarte”.
   Pagina (holdings.js, layout.js, roster.js) cheamă înainte de încărcare doar HoldingsNeuralUI (card, setContext, bind, refresh, inspect, busy) și
   HoldingsVerdictUI (open, busy, refresh) ⇒ locțiitori aici; neural.js și verdict.js reale le înlocuiesc la încărcare, iar ultimul context dat
   locțiitorului ajunge la modelele reale, apoi pagina se redesenează o dată. Nu atinge nicio amprentă a probelor. */
(function (g) {
  'use strict';
  var GRUP = 'modele', ctx = null, programat = false, promisiune = null, incarcat = false, eroare = null, tickerDeDeschis = null;
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function continut() {
    return eroare ? '<p class="meta" data-modele-stare>Modelele AI nu s-au încărcat: ' + esc(eroare) + ' <button type="button" data-modele-reincearca>Reîncearcă</button></p>'
      : '<p class="meta" data-modele-stare>Modelele AI se încarcă…</p>';
  }
  function gazda(i) { return '<div data-neural-host="' + esc(i) + '">' + continut() + '</div>'; }
  function redeseneazaGazdele() { if (g.HoldingsNeuralUI !== locN) return; var h = document.querySelectorAll('[data-neural-host]'); for (var k = 0; k < h.length; k++) h[k].innerHTML = continut(); }
  function incarca() {
    if (promisiune) return promisiune;
    if (!g.ScripturiLaCerere) return Promise.reject(new Error('ScripturiLaCerere lipsește din pagină'));
    eroare = null;
    promisiune = g.ScripturiLaCerere.incarca(GRUP).then(function () {
      incarcat = true;
      var N = g.HoldingsNeuralUI, V = g.HoldingsVerdictUI;
      if (N === locN) throw new Error('neural.js nu a definit HoldingsNeuralUI');
      if (ctx) { N.setContext(ctx); N.bind(); }
      if (tickerDeDeschis && V && V !== locV) V.open(tickerDeDeschis);
      tickerDeDeschis = null;
      if (ctx && typeof ctx.refresh === 'function') ctx.refresh();
    }).catch(function (e) { promisiune = null; eroare = e && e.message ? e.message : String(e); redeseneazaGazdele(); throw e; });
    return promisiune;
  }
  var tacut = function () {};
  function programeaza() {
    if (programat) return; programat = true;
    var porneste = function () { incarca().catch(tacut); };
    if (typeof g.requestAnimationFrame === 'function') g.requestAnimationFrame(function () { setTimeout(porneste, 0); }); else setTimeout(porneste, 0);
  }
  var locN = {
    setContext: function (c) { ctx = c; programeaza(); },
    card: function (p, i) { return gazda(i); },
    bind: tacut, refresh: tacut, cancel: tacut, cancelManaged: tacut,
    restore: function () { return Promise.resolve(); },
    inspect: function () { return { usable: false, record: null, assessment: { state: 'loading', message: 'Modelele AI se încarcă.' } }; },
    busy: function () { return false; },
    run: function (p, o) { return incarca().then(function () { return g.HoldingsNeuralUI.run(p, o); }); },
    exportReport: function (r) { return incarca().then(function () { return g.HoldingsNeuralUI.exportReport(r); }); }
  };
  var locV = {
    setContext: tacut, close: tacut, refresh: tacut,
    open: function (ticker) { tickerDeDeschis = ticker; incarca().catch(tacut); },
    busy: function () { return false; }
  };
  /* Registrul prospectiv (lib/holdings-forecast.js, -storage, -monitor, lib/decision-validation.js; ≈47 KB) NU e în grup: panoul de decizie din
     „Poziție & direcție” (lib/decision-panel.js + lib/decision-verdict.js, în <head>) îl citește la prima desenare (`peekCandidate`, `activeScope`),
     iar bibliotecile acelea își prind dependențele la încărcare — proba în browser a prins asta când decision-validation.js fusese pus în grup. */
  if (!g.HoldingsNeuralUI) g.HoldingsNeuralUI = locN;
  if (!g.HoldingsVerdictUI) g.HoldingsVerdictUI = locV;
  var SELECTOR = '[data-holding-tab="neural"],[data-holding-group="analysis"],[data-verdict-open],[data-workspace-tab="reports"],[data-modele-reincearca]';
  document.addEventListener('click', function (e) {
    var t = e && e.target && typeof e.target.closest === 'function' ? e.target.closest(SELECTOR) : null;
    if (!t) return;
    if (t.hasAttribute('data-modele-reincearca')) { eroare = null; redeseneazaGazdele(); }
    if (t.hasAttribute('data-verdict-open') && g.HoldingsVerdictUI === locV) { locV.open(t.getAttribute('data-verdict-open')); return; }
    incarca().catch(tacut);
  }, true);
  g.HoldingsModeleLaCerere = { GRUP: GRUP, incarca: incarca, incarcat: function () { return incarcat; }, eroare: function () { return eroare; } };
})(typeof window !== 'undefined' ? window : globalThis);
