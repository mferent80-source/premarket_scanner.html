// 27.10.2026 — revizia independentă a lotului F (🟡8): regula verdictului pieței era `REGULA = 'v2.1'` scrisă de mână; o schimbare în
// lib/market-verdict.js / lib/macro-regime.js nota mai departe sub v2.1. Acum regula are amprentă din CONȚINUT (SHA pe închiderea lui
// `compute` + `regimDin` din market-verdict.js și pe tot macro-regime.js, CRLF = LF). O linie nouă contează la proba v2.1 doar dacă amprenta
// de azi e în lista recunoscută ca v2.1 (tabel care doar crește în docs/verdict-piata-protocol.md, fiecare rând cu motivul „fără efect asupra
// etichetei”); altfel linia poartă amprenta ca regulă și rămâne în afara probei.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { amprentaRegulii, AMPRENTE_V21, regulaPentru, linieZi, deRegula, REGULA } from './verdict-piata-robot.mjs';

const citeste = (f) => readFileSync(f, 'utf8');
test('amprenta regulii de azi e una recunoscută ca v2.1 și e scrisă în tabelul din protocol', () => {
  const a = amprentaRegulii(); assert.match(a, /^rv-[0-9a-f]{12}$/);
  assert.ok(AMPRENTE_V21.includes(a), 'lib/market-verdict.js sau lib/macro-regime.js s-au schimbat: dacă eticheta NU se schimbă, adaugă un rând „fără efect” (cu motivul) în tabelul din docs/verdict-piata-protocol.md și în AMPRENTE_V21; dacă se schimbă, e regula v2.2 (probă nouă). Azi: ' + a);
  const doc = citeste('docs/verdict-piata-protocol.md'); for (const x of AMPRENTE_V21) assert.ok(doc.includes('`' + x + '`'), 'tabelul din protocol nu are ' + x);
  assert.equal(regulaPentru(a), REGULA);
});
test('o schimbare de prag în compute ⇒ altă amprentă ⇒ linia nouă nu mai contează la v2.1; textul paginii (render) nu e regulă', () => {
  const mv = citeste('lib/market-verdict.js'), a = amprentaRegulii('.', citeste);
  assert.ok(mv.includes("{ min: -2, id: 'prudent'"), 'pragul Prudent e unde îl caută testul');
  const alt = amprentaRegulii('.', (f) => (f.endsWith('market-verdict.js') ? mv.replace("{ min: -2, id: 'prudent'", "{ min: -1, id: 'prudent'") : citeste(f)));
  assert.notEqual(alt, a, 'pragul Prudent schimbat ⇒ altă amprentă');
  assert.ok(citeste('lib/macro-regime.js').includes('function fgDin('));
  const macro = amprentaRegulii('.', (f) => (f.endsWith('macro-regime.js') ? citeste(f).replace('function fgDin(', 'function fgDin(/* schimbat */') : citeste(f)));
  const render = amprentaRegulii('.', (f) => (f.endsWith('market-verdict.js') ? mv.replace(/function render\(/, 'function render(/* text */') : citeste(f)));
  assert.equal(render, a, 'render (afișajul) nu decide eticheta');
  assert.ok(macro !== a, 'macro-regime.js intră întreg');
  const r = regulaPentru(alt); assert.equal(r, alt); assert.equal(deRegula({ regula: r, generat: '2026-11-01T05:00:00Z' }), false, 'linia sub altă regulă nu intră în proba v2.1');
});
test('linia nouă poartă regula și amprenta din conținut', () => {
  const v = { asOf: '2026-10-28', label: { id: 'neutru' }, score: 0, citite: 6, indicatori: [{ id: 'trend', score: 0 }] }, a = amprentaRegulii();
  const l = linieZi(v, '2026-10-29T05:00:00Z', null, regulaPentru(a), a); assert.equal(l.regula, 'v2.1'); assert.equal(l.amprentaRegula, a); assert.equal(deRegula(l), true);
  const src = readFileSync('tools/verdict-piata-robot.mjs', 'utf8'), rul = src.slice(src.indexOf('export async function ruleaza'));
  assert.match(rul, /amprentaRegulii\(radacina\)/); assert.match(rul, /linieZi\(v, generat, regim, regula, rv\)/);
});
