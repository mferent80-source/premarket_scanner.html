// 28.10.2026 (I-778) — „Modelele pe portofoliu”: din rapoartele deja antrenate zilnic, pentru fiecare deținere — istoricul, starea celor 7 modele,
// verdictul care ar ieși acum și PRIMUL motiv pentru care nu dă direcție; plus verdictele deja judecate față de realitate. Fără calcul nou, fără rețea.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// în același realm (deepEqual peste realm-uri vm pică pe prototipuri)
for (const f of ['lib/holdings-forecast.js', 'lib/holdings-modele-portofoliu.js']) vm.runInThisContext(readFileSync(f, 'utf8'), { filename: f });
const M = globalThis.HoldingsModelePortofoliu, F = globalThis.HoldingsForecast;

test('istoric: sesiunile ies din amprenta OHLCV; altceva ⇒ null', () => {
  assert.equal(M.istoric('ohlcv-v1:1255:9a3f:77c1'), 1255); assert.equal(M.istoric('ohlcv-v1:510:a:b'), 510);
  assert.equal(M.istoric('fixture'), null); assert.equal(M.istoric(null), null); assert.equal(M.istoric(undefined), null);
});

test('asteptat: istoricul comun pentru verdict vine din raportul Neural păstrat (fără raport ⇒ null)', () => {
  const rec = { symbol: 'TE', currency: 'USD', asOf: '2026-10-27', kind: 'market', sourceTime: 1, sourceClose: 10.5, timezone: 'America/New_York', closeMinutes: 960, sourceFingerprint: 'ohlcv-v1:1255:a:b', quantity: 99, apiKey: 'X' };
  assert.deepEqual(M.asteptat(rec), { symbol: 'TE', currency: 'USD', asOf: '2026-10-27', kind: 'market', t: 1, close: 10.5, timezone: 'America/New_York', closeMinutes: 960, fingerprint: 'ohlcv-v1:1255:a:b' });
  assert.equal(M.asteptat(null), null); assert.equal(M.asteptat({ symbol: 'TE' }), null);
});

function intrareVerdict(k, { direction = 2, actual = 2, state = 'resolved' } = {}) {
  const t0 = Date.UTC(2026, 8, 1, 20) + k * 7 * 86400000, asOf = new Date(t0).toISOString().slice(0, 10), path = [1, 2, 3, 4, 5].map((i) => ({ t: t0 + i * 86400000, c: 100 * (1 + (actual === 2 ? .03 : actual === 0 ? -.03 : .001) * i / 5) }));
  const end = path[4];
  return { version: 'holdings-forecast-v1', id: 'verdict|' + asOf, symbol: 'TE', currency: 'USD', kind: 'market', model: 'verdict', modelVersion: 'holdings-verdict-v4', horizon: 5, capturedAt: t0 + 3600000, trainedAt: t0 + 60000, state: 'up',
    source: { t: t0, asOf, timezone: 'America/New_York', closeMinutes: 960, close: 100, atrPct: 2 },
    estimate: { title: 't', verdictState: direction === null ? 'weak' : direction === 2 ? 'up' : direction === 0 ? 'down' : 'mixed', direction, sourceFingerprint: 'f', reasons: ['r'], cards: [] },
    outcome: state === 'resolved' ? { t: end.t, asOf: new Date(end.t).toISOString().slice(0, 10), close: end.c, path, checkedAt: end.t + 3600000, retrievedAt: end.t + 1800000 } : null,
    verification: { state, checkedAt: state === 'resolved' ? end.t + 3600000 : null, sessions: state === 'resolved' ? 5 : 0, reason: 'x' } };
}

test('rezumatRegistru: verdictele cu direcție judecate față de realitate, abținerile separate, cele în așteptare numărate; textul în română, cu avertismentul sub 20', () => {
  const entries = [intrareVerdict(0, { direction: 2, actual: 2 }), intrareVerdict(1, { direction: 2, actual: 0 }), intrareVerdict(2, { direction: null, actual: 1 }), intrareVerdict(3, { state: 'pending' }), { model: 'neural', verification: { state: 'pending' } }];
  const r = M.rezumatRegistru(entries);
  assert.deepEqual(r, { n: 3, directie: 2, corecte: 1, abtineri: 1, inAsteptare: 1, suficient: false });
  assert.equal(M.textRealitate(r), 'Verdicte judecate: 2 cu direcție, 1 corecte · 1 abțineri · 1 în așteptare (+5 sesiuni) · sub pragul de 20 cu direcție: exploratoriu.');
  assert.equal(M.textRealitate(M.rezumatRegistru([])), 'Niciun verdict judecat încă față de realitate.');
  assert.equal(M.textRealitate(M.rezumatRegistru([intrareVerdict(0, { state: 'pending' })])), 'Niciun verdict judecat încă · 1 în așteptare (+5 sesiuni).');
  assert.match(M.markupRealitate(r), /^<p class="meta mp-realitate" data-mp-realitate>Verdicte judecate: 2 cu direcție/); assert.match(M.markupRealitate(r, { demo: true }), /SIMULARE · /);
  assert.equal(M.markupRealitate(null), '');
});

const card = (id, o = {}) => ({ id, available: o.available !== false, state: o.state || 'research', eligible: o.eligible !== false, value: o.value || 'Avans' });
const toate = (o = {}) => ['neural', 'boosting', 'hmm', 'isolation', 'quantile', 'garch', 'knn'].map((id) => card(id, o[id] || {}));

test('rand: stările celor 7 modele pe scurt, „trece” doar pentru cardurile eligibile, direcția și primul blocaj din diagnostic; fără blocaj ⇒ motivul e titlul', () => {
  const r = M.rand({ ticker: 'TE_US_EQ', symbol: 'TE', istoric: 1255, verdict: { state: 'up', title: 'Înclinare ascendentă · experimentală', direction: 2, cards: toate(), reasons: ['ok'] }, diagnostic: { blockers: [] }, registru: M.rezumatRegistru([]) });
  assert.equal(r.actuale, 7); assert.equal(r.verdict.clasa, 'Avans'); assert.equal(r.blocaj, null); assert.equal(r.istoricScurt, false);
  assert.deepEqual(Object.keys(r.stari), ['neural', 'boosting', 'knn', 'hmm', 'isolation', 'quantile', 'garch']); assert.equal(r.stari.knn.text, 'trece'); assert.equal(r.stari.knn.trece, true);
  const b = M.rand({ ticker: 'X', symbol: 'X', istoric: 700, verdict: { state: 'weak', title: 'Neconcludent · dovezi insuficiente', direction: null, cards: toate({ knn: { state: 'no-edge', eligible: false, value: 'Mixt' }, boosting: { available: false, state: 'unavailable' } }), reasons: ['KNN: …'] }, diagnostic: { blockers: [{ ids: ['knn'], code: 'evidence', label: 'Dovezi insuficiente', name: 'KNN', detail: 'KNN nu depășește reperul de momentum.' }] }, registru: M.rezumatRegistru([]) });
  assert.equal(b.actuale, 6); assert.equal(b.istoricScurt, true, 'sub 1000 de sesiuni'); assert.equal(b.stari.knn.text, 'fără avantaj'); assert.equal(b.stari.knn.trece, false); assert.equal(b.stari.boosting.text, 'reanalizează');
  assert.deepEqual(b.blocaj, { nume: 'Dovezi insuficiente', detaliu: 'KNN nu depășește reperul de momentum.' });
  const gol = M.rand({ ticker: 'N', symbol: null, istoric: null, verdict: { state: 'incomplete', title: 'Verdict incomplet', direction: null, cards: toate({ neural: { available: false, state: 'missing' }, boosting: { available: false, state: 'missing' } }), reasons: ['2 modele nu au rezultate actuale verificate.'] }, diagnostic: null, registru: null });
  assert.equal(gol.blocaj.nume, 'Rapoarte lipsă'); assert.match(gol.blocaj.detaliu, /^2 modele fără raport actual/); assert.equal(gol.istoric, null);
});

test('rezumat + markup: capul spune câte dețineri au toate rapoartele, câte au direcție, blocajul cel mai des și scorul judecat; fiecare deținere are rândul ei, escapat', () => {
  const rows = [
    M.rand({ ticker: 'A<', symbol: 'A', istoric: 1255, verdict: { state: 'up', title: 'Înclinare ascendentă · experimentală', direction: 2, cards: toate(), reasons: [] }, diagnostic: { blockers: [] }, registru: M.rezumatRegistru([intrareVerdict(0), intrareVerdict(1, { actual: 0 })]) }),
    M.rand({ ticker: 'B', symbol: 'B', istoric: 800, verdict: { state: 'weak', title: 'Neconcludent', direction: null, cards: toate({ knn: { state: 'uncertain', eligible: false } }), reasons: [] }, diagnostic: { blockers: [{ label: 'Dovezi insuficiente', detail: 'KNN de graniță.' }] }, registru: M.rezumatRegistru([]) }),
    M.rand({ ticker: 'C', symbol: 'C', istoric: 900, verdict: { state: 'weak', title: 'Neconcludent', direction: null, cards: toate({ knn: { state: 'no-edge', eligible: false } }), reasons: [] }, diagnostic: { blockers: [{ label: 'Dovezi insuficiente', detail: 'KNN fără avantaj.' }] }, registru: M.rezumatRegistru([]) }),
  ];
  const s = M.rezumat(rows);
  assert.deepEqual(s, { detineri: 3, complete: 3, directie: 1, istoricScurt: 2, blocajTop: 'Dovezi insuficiente', blocajTopN: 2, judecate: 2, judecateCuDirectie: 2, corecte: 1 });
  const h = M.markup(rows, { demo: false });
  assert.match(h, /Modelele pe portofoliu/); assert.match(h, /Local · acest dispozitiv/); assert.match(h, /<small>Cu direcție acum<\/small><b>1<\/b>/); assert.match(h, /<small>Verdicte judecate · corecte<\/small><b>1 \/ 2<\/b>/);
  assert.match(h, /Blocajul cel mai des: <b>Dovezi insuficiente<\/b> \(2 din 3\) · 2 cu istoric sub 1\.000 sesiuni\./);
  assert.match(h, /<article class="mp-rand" data-mp-ticker="A&lt;">/); assert.match(h, /<span class="tag mp-directie">Avans<\/span>/); assert.match(h, /KNN: de graniță/); assert.match(h, /De ce nu dă direcție:<\/b> Dovezi insuficiente — KNN de graniță\./);
  assert.match(h, /Nu pornește calcule noi/); assert.match(M.markup([], { demo: true }), /SIMULARE/); assert.match(M.markup([]), /Nu există dețineri/);
});

test('pagina: biblioteca pură înaintea holdings.js (rândul de pe „Poziție & direcție”), secțiunea în Rapoarte, glue-ul la cerere după verdict.js; neural.js dă contextul și redesenează; holdings.js cheamă rândul', () => {
  const html = readFileSync('holdings/index.html', 'utf8'), neural = readFileSync('holdings/neural.js', 'utf8'), js = readFileSync('holdings/holdings.js', 'utf8'), glue = readFileSync('holdings/modele-portofoliu.js', 'utf8'), css = readFileSync('holdings/holdings.css', 'utf8');
  const i = (s) => html.indexOf(s);
  assert.ok(i('src="../lib/holdings-modele-portofoliu.js') > 0 && i('src="../lib/holdings-modele-portofoliu.js') < i('src="holdings.js?'), 'biblioteca pură e la deschidere, înaintea paginii');
  assert.ok(!/type="text\/x-la-cerere"[^>]*holdings-modele-portofoliu\.js/.test(html), 'biblioteca pură nu e la cerere');
  assert.match(html, /<script type="text\/x-la-cerere" data-grup="modele" src="modele-portofoliu\.js\?v=/); assert.ok(i('src="verdict.js') < i('src="modele-portofoliu.js'), 'glue-ul după verdict.js');
  assert.match(html, /<section id="modelePortofoliu" class="forecast-monitor" aria-label="Modelele pe portofoliu"><\/section>/); assert.ok(i('id="forecastMonitor"') < i('id="modelePortofoliu"') && i('id="modelePortofoliu"') < i('id="managementReports"'), 'în panoul Rapoarte, lângă monitorizare');
  assert.match(neural, /g\.HoldingsModelePortofoliuUI\?\.setContext\(c\)/); assert.match(neural, /g\.HoldingsModelePortofoliuUI\?\.render\(\)/);
  assert.match(js, /T212Daily\.markup\(daily\)\+realitateMarkup\(p\)\+/); assert.match(js, /function realitateMarkup\(p\)\{try\{/);
  assert.match(glue, /HoldingsVerdict\.build\(\{expected,snapshots,probabilistic,now:Date\.now\(\)\}\)/); assert.match(glue, /if\(!vizibil\(host\)\)return;/, 'nu citește rapoartele când panoul e ascuns'); assert.match(glue, /data-workspace-tab="reports"/);
  assert.match(css, /\.mp-rand\{/);
});
