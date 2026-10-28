// 28.10.2026 — revizia independentă F2, 🟡5: testele păzeau biblioteca, nu și firele care leagă reparațiile de roboți. Ca mutații, cu toate
// testele trecând: robotul V1 / Top Long nu mai citea fișierul înghețat (`const inghetate = []`), iar SPY-ul bilanțului Trend era fix pe 2 ani.
// Acum noaptea fiecărui robot, după aducerea seriilor, e o funcție pură (jurnalul, ziua notată, seriile și TEXTUL fișierului înghețat ⇒
// fișierul probei și liniile de adăugat), chemată de `main` și testată noapte de noapte; intervalele bilanțului Trend vin dintr-o funcție.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simuleaza } from '../lib/v1-proba.mjs';
import { calendarSUA } from '../lib/proba-contract.mjs';
import { noapte as noapteV1 } from './v1-jurnal.mjs';
import { noapte as noapteTL } from './premarket-jurnal.mjs';
import { intervaleBilant } from './trend-12-1-lib.mjs';

const cal = calendarSUA('.'), k5 = (j) => j.orizonturi.find((o) => o.k === 5);
const taieInceput = (serii, n) => Object.fromEntries(Object.entries(serii).map(([s, a]) => [s, a.slice(n)]));
function lume(seed, cod) {
  const l = simuleaza(seed, { k: 5, perioade: 44, verificate: 40, sus: 10, ...(cod ? { cod } : {}) }), jurnal = l.jurnal, rec = jurnal.zile[jurnal.zile.length - 1];
  return { l, jurnal, rec, V: l.versiune, azi: rec.zi };
}

for (const [nume, fel] of [['V1', null], ['Top Long', 'top']]) {
  test('🟡5 ' + nume + ': noaptea citește fișierul înghețat — cu seriile tăiate la început, judecata și perioadele rămân; fără fișier s-ar pierde', () => {
    const { l, jurnal, rec, V, azi } = lume(fel ? 31 : 21, fel);
    const ctx = fel ? { s: { verified: 40, scanned: 40, benchmarks: ['SPY'] } } : { report: { verifiedCount: 40, items: Array.from({ length: 40 }, () => ({})) } };
    const f = fel ? noapteTL : noapteV1;
    const n1 = f({ jurnal, V, rec, ...ctx, serii: l.serii, cal, azi, inghetatText: '' }), o1 = k5(n1.j);
    assert.ok(o1.judecata && o1.judecata.verdict, 'prima noapte dă judecata'); assert.ok(n1.linii.length > 0 && n1.deScris.some((x) => x.tip === 'judecata'));
    const scurt = taieInceput(l.serii, 120);
    const n2 = f({ jurnal, V, rec, ...ctx, serii: scurt, cal, azi, inghetatText: n1.linii }), o2 = k5(n2.j);
    assert.equal(o2.judecata.verdict, o1.judecata.verdict, 'judecata scrisă rămâne'); assert.equal(o2.perioade, o1.perioade, 'perioadele înghețate rămân');
    assert.equal(n2.deScris.filter((x) => x.tip === 'judecata').length, 0, 'a doua noapte nu mai scrie judecata');
    const fara = f({ jurnal, V, rec, ...ctx, serii: scurt, cal, azi, inghetatText: '' }), o3 = k5(fara.j);
    assert.ok(o3.perioade < o1.perioade, 'controlul: fără fișierul înghețat, seriile tăiate pierd perioade (' + o3.perioade + ' < ' + o1.perioade + ') — deci testul prinde un robot care nu-l citește');
  });
}

test('🟡5 legătura: `main` dă funcției de noapte textul fișierului înghețat (V1 și Top Long), nu o listă goală', () => {
  for (const f of ['tools/v1-jurnal.mjs', 'tools/premarket-jurnal.mjs']) {
    const src = readFileSync(f, 'utf8');
    assert.match(src, /noapte\(\{[^\n]*inghetatText: existsSync\(INGHETAT\) \? readFileSync\(INGHETAT, 'utf8'\) : ''/, f);
    assert.doesNotMatch(src, /const inghetate = existsSync\(INGHETAT\)/, f + ': citirea fișierului e în funcția testată, nu dublată în main');
  }
});

test('🟡5 Trend: intervalele bilanțului vin dintr-o funcție — SPY acoperă prima zi a istoricului, acțiunile prima zi neînghețată', () => {
  const ist = (de, n) => Array.from({ length: n }, (_, i) => ({ d: new Date(Date.parse(de + 'T12:00:00Z') + i * 86400000).toISOString().slice(0, 10) }));
  const istoric = ist('2026-10-15', 40);
  assert.deepEqual(intervaleBilant(istoric, [], '2026-12-01'), { RANGE_SPY: '2y', RANGE: '2y', primaVie: '2026-10-15' });
  assert.equal(intervaleBilant(istoric, [], '2029-06-01').RANGE_SPY, '5y', 'după ~2 ani SPY trece pe 5 ani (altfel bilanțul s-ar opri)');
  assert.equal(intervaleBilant(istoric, [], '2033-06-01').RANGE_SPY, '10y');
  const ing = istoric.slice(0, 30).flatMap((l) => [{ tip: 'zi', h: 20, d: l.d }, { tip: 'zi', h: 60, d: l.d }]);
  assert.equal(intervaleBilant(istoric, ing, '2029-06-01').primaVie, istoric[30].d, 'acțiunile doar de la prima zi neînghețată');
  const b = readFileSync('tools/trend-12-1-bilant.mjs', 'utf8');
  assert.match(b, /intervaleBilant\(istoric, inghetate, azi\)/); assert.doesNotMatch(b, /const RANGE_SPY = intervalPentru/);
});

test('🔵14 intervalul Yahoo nu se mai oprește la 10 ani: peste ~10 ani de probă, „max”', async () => {
  const { intervalPentru } = await import('../lib/proba-contract.mjs');
  assert.equal(intervalPentru('2026-10-15', '2028-06-01'), '2y'); assert.equal(intervalPentru('2026-10-15', '2031-01-01'), '5y');
  assert.equal(intervalPentru('2026-10-15', '2035-01-01'), '10y'); assert.equal(intervalPentru('2026-10-15', '2037-06-01'), 'max');
});
