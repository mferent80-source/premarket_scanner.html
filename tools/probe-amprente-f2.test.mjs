// 28.10.2026 — revizia independentă F2, 🟡3: amprentele nu acopereau tot ce decide rezultatul. Revizorul a schimbat cod care decide și
// amprenta NU s-a schimbat: `DailySeries.read` (taie sesiunile neînchise — garda privirii în viitor), `ziValida` (data EOD a rândului),
// filtrul barelor din robot (h ≥ l …), iar lista funcțiilor evaluatorului V1 era scrisă de mână. Acum:
//  • V1 și Top Long: funcțiile din lib/daily-series.js apelate de reguli intră în versiune (închiderea lor);
//  • evaluatorul V1 = închiderea calculată din sursa lib/v1-proba.mjs (intră singure `ziValida`, `baraValida`), plus funcțiile din
//    lib/proba-contract.mjs pe care le cheamă (numărarea sesiunilor NYSE);
//  • filtrul barelor stă în bibliotecă (`baraValida`), robotul îl cheamă — o schimbare a lui schimbă versiunea ambelor probe;
//  • calendarul bursei (sărbătorile se completează an de an) NU repornește proba: se notează pe zi (`d`) și la V1, ca la Top Long.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { versiune, partiVersiune } from '../lib/premarket-proba.mjs';
import { versiuneV1, FUNCTII_EVALUATOR, amprentaEvaluator, amprentaDependinteV1, baraValida, DEPENDINTE_V1 } from '../lib/v1-proba.mjs';
import { motor } from './premarket-jurnal.mjs';
import { declaratii } from '../lib/proba-contract.mjs';

const h = motor(async () => { throw Error('fără rețea'); }).hooks, citeste = (f) => readFileSync(f, 'utf8');
const cu = (fisier, vechi, nou) => (f) => { const s = citeste(f); if (f !== fisier) return s; assert.ok(s.includes(vechi), fisier + ' nu mai conține ' + vechi); return s.replace(vechi, nou); };
const SCANNER = citeste('lib/independent-scanner.js');
const SERII_MUT = cu('lib/daily-series.js', 'b.t>now+60000', 'b.t>now+6000000');   // o bară din viitor ar trece de gardă

test('🟡3 declarațiile se găsesc și într-un fișier învelit într-o funcție care se autoapelează, scris fără indentare (lib/daily-series.js)', () => {
  const d = declaratii(citeste('lib/daily-series.js'));
  for (const n of ['read', 'date', 'expected', 'usable']) assert.ok(d.includes(n), 'lipsește declarația ' + n);
  assert.ok(!d.includes('meta'), 'variabilele din corpul funcțiilor nu sunt declarații de sus');
  assert.ok(declaratii(citeste('lib/indicators.js')).includes('calcRSI'), 'fișierele indentate cu 2 rămân ca înainte');
});

// 28.10.2026 (revizia F3, 🟡1 — decis înaintea primei zile v2): `lib/daily-series.js` e o bibliotecă comună a aplicației; în versiune, o
// reparație de viteză acolo ar fi repornit proba (și garda din flux ar fi oprit roboții), iar formatorul `partsFmt` (pe un rând cu altă
// declarație) scăpa oricum. Acum seriile zilnice se NOTEAZĂ pe zi (`d`), ca și calendarul: o schimbare se vede, cu ziua ei, fără repornire.
test('🟡1 F3 V1: seriile zilnice nu sunt în versiune, dar orice schimbare a lor se vede în `d`', () => {
  const v = versiuneV1(SCANNER);
  assert.match(v, /^v1-[0-9a-f]{12}$/);
  assert.equal(versiuneV1(SCANNER, SERII_MUT), v, 'lib/daily-series.js schimbat ⇒ aceeași versiune (nu e o regulă V1)');
  assert.notEqual(amprentaDependinteV1(SERII_MUT), amprentaDependinteV1(citeste), '… dar `d` o arată');
  assert.equal(versiuneV1(SCANNER, citeste), v, 'aceeași sursă ⇒ aceeași versiune');
});

test('🟡3 V1: evaluatorul e închiderea din sursă — intră `ziValida` și `baraValida`, nu o listă scrisă de mână', () => {
  for (const n of ['inregistrare', 'adauga', 'evalueaza', 'ingheata', 'ziValida', 'baraValida']) assert.ok(FUNCTII_EVALUATOR.includes(n), 'lipsește: ' + n);
  assert.ok(!FUNCTII_EVALUATOR.includes('PROTOCOL'), 'cifrele puterii din PROTOCOL se recalibrează fără repornire (regulile intră prin REGULI)');
  const e = amprentaEvaluator();
  assert.notEqual(amprentaEvaluator(cu('lib/v1-proba.mjs', "const ziValida = (d) => typeof d === 'string' && ", 'const ziValida = (d) => ')), e, '`ziValida` schimbat ⇒ alt evaluator');
  assert.notEqual(amprentaEvaluator(cu('lib/v1-proba.mjs', 'h >= l && ', '')), e, 'filtrul barelor schimbat ⇒ alt evaluator');
  assert.notEqual(amprentaEvaluator(cu('lib/proba-contract.mjs', 'return { la, data, verdict, unic }; }', 'return { la, data, verdict, unic: false }; }')), e, 'înregistrarea judecății (din contract) schimbată ⇒ alt evaluator');
  assert.equal(amprentaEvaluator(cu('lib/v1-proba.mjs', 'lumi: 2000, samanta: 27102026', 'lumi: 4000, samanta: 27102026')), e, 'cifrele puterii nu decid judecata');
});

test('🟡3 filtrul barelor: în bibliotecă (`baraValida`), robotul îl cheamă; bare rele respinse, bare bune primite', () => {
  assert.equal(baraValida(1e9, 10, 11, 9, 10.5), true);
  assert.equal(baraValida(1e9, 10, 9, 11, 10), false, 'h < l');
  assert.equal(baraValida(1e9, 10, 10.2, 9, 10.5), false, 'închiderea peste maxim');
  assert.equal(baraValida(1e9, 0, 11, 9, 10), false, 'preț 0');
  assert.equal(baraValida(NaN, 10, 11, 9, 10), false, 'fără oră');
  assert.equal(baraValida(1e9, null, 11, 9, 10), false, 'deschiderea lipsă');
  const r = citeste('tools/v1-jurnal.mjs');
  assert.match(r, /baraValida\(ts\[i\], o, h, l, c\)/); assert.doesNotMatch(r, /h >= l/, 'filtrul nu mai e copiat în robot');
});

test('🟡1 F3 Top Long: filtrul barelor (prin evaluatorul V1) e în versiune; seriile zilnice, roboții și contractul se notează în `d`', async () => {
  const { amprentaDependinte, DEPENDINTE } = await import('../lib/premarket-proba.mjs');
  assert.ok(!partiVersiune(h).some((x) => x.startsWith('DailySeries.')), 'seriile zilnice nu mai sunt în versiunea Top Long');
  const v = versiune(h);
  assert.equal(versiune(h, undefined, SERII_MUT), v, 'lib/daily-series.js schimbat ⇒ aceeași versiune');
  assert.notEqual(amprentaDependinte(SERII_MUT, h), amprentaDependinte(citeste, h), '… dar `d` o arată');
  assert.notEqual(versiune(h, undefined, cu('lib/v1-proba.mjs', 'h >= l && ', '')), v, 'filtrul barelor schimbat ⇒ altă versiune Top Long');
  assert.equal(versiune(h, undefined, citeste), v);
  // revizia F3, 🔵7: noaptea robotului (ex. tăietura seriilor la ziua notată) și contractul comun se văd în `d`
  for (const f of ['tools/premarket-jurnal.mjs', 'tools/v1-jurnal.mjs', 'lib/proba-contract.mjs', 'lib/daily-series.js']) assert.ok(DEPENDINTE.includes(f), 'lipsește din d: ' + f);
  assert.notEqual(amprentaDependinte(cu('tools/premarket-jurnal.mjs', 'taieLaZi(sr, rec.zi)', 'sr'), h), amprentaDependinte(citeste, h), 'noaptea Top Long fără tăietură ⇒ `d` se schimbă');
});

test('🟡3 calendarul bursei nu repornește proba V1, dar se notează pe zi (`d`), ca la Top Long', () => {
  const CAL_MUT = cu('lib/exchange-calendar.js', 'for(let n=1;n<=14;n++)', 'for(let n=1;n<=15;n++)');
  assert.equal(versiuneV1(SCANNER, CAL_MUT), versiuneV1(SCANNER), 'sărbătorile se completează an de an — nu e o regulă nouă');
  const d = amprentaDependinteV1(citeste);
  assert.match(d, /^dep-[0-9a-f]{12}$/); assert.notEqual(amprentaDependinteV1(CAL_MUT), d, 'calendarul schimbat se vede în `d`');
  for (const f of ['lib/exchange-calendar.js', 'lib/daily-series.js', 'lib/independent-scanner.js', 'tools/v1-jurnal.mjs']) assert.ok(DEPENDINTE_V1.includes(f), f);
  const r = citeste('tools/v1-jurnal.mjs');
  assert.match(r, /d: amprentaDependinteV1\(/, 'robotul notează `d` pe zi'); assert.match(r, /dependinte: istoricDependinte\(jurnal, V\)/, 'fișierul probei arată schimbările lui `d`');
});

test('🔵15: ρ din textul rezervei cu o singură zecimală (regula casei), nu cu două', async () => {
  const { judeca } = await import('../lib/v1-proba.mjs');
  const p = Array.from({ length: 30 }, (_, i) => ({ dif: 0.01 + i * 0.001 }));
  const j = judeca(p, 30);
  assert.equal(j.verdict, 'ajuta'); assert.ok(j.rezerve, 'perioade cu trend ⇒ persistență mare ⇒ rezervă');
  assert.match(j.rezerve, /ρ = \d,\d\)/); assert.doesNotMatch(j.rezerve, /ρ = \d,\d\d/);
});
