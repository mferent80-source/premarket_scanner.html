// 28.10.2026 (I-779) — testul de mărime pentru „avantajul” Neural / Boosting: permutare pe semne pe diferențele de log-loss (reper − model) pe orizonturile
// fără suprapunere. Nu e o poartă (pragul descriptiv de 0,02 rămâne), e afișat lângă el. Mărimea sub H0 și puterea pe demo, simulate înainte (scratchpad
// 28.10, 30 lumi de mers aleator + 4 serii demo, bibliotecile reale): vezi comentariul din testul de mai jos.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

for (const f of ['lib/holdings-bars.js', 'lib/holdings-neural.js', 'lib/holdings-neural-evaluation.js', 'lib/holdings-boosting.js', 'lib/holdings-model-comparison.js']) vm.runInThisContext(readFileSync(f, 'utf8'), { filename: f });
const N = globalThis.HoldingsNeural, E = globalThis.HoldingsNeuralEvaluation, M = globalThis.HoldingsModelComparison, NOW = Date.UTC(2026, 9, 27, 20);
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

test('testPermutare: exact la n ≤ 22, Monte Carlo determinist peste; p crește când diferențele se apropie de zero; sub 5 diferențe sau valori nefinite ⇒ null', () => {
  const tare = N.testPermutare([.3, .2, .25, .4, .1, .35, .22, .18, .3, .27, .15, .33]);
  assert.equal(tare.metoda, 'permutare-semne-exacta'); assert.equal(tare.n, 12); assert.ok(tare.p < .001, 'toate pozitive ⇒ p = 1/4096'); assert.equal(tare.semnificativ, true);
  const slab = N.testPermutare([.3, -.2, .25, -.4, .1, -.35, .22, -.18, .3, -.27, .15, -.33]); assert.ok(slab.p > .3 && !slab.semnificativ);
  const mc = N.testPermutare(Array.from({ length: 36 }, (_, i) => .1 + .01 * (i % 5))); assert.equal(mc.metoda, 'permutare-semne-monte-carlo'); assert.ok(mc.p < .001);
  assert.deepEqual(N.testPermutare(Array.from({ length: 36 }, (_, i) => .1 + .01 * (i % 5))), mc, 'determinist: aceleași date ⇒ același p');
  assert.equal(N.testPermutare([.1, .2, .3]), null); assert.equal(N.testPermutare([.1, .2, .3, NaN, .5, .6]), null); assert.equal(N.testPermutare(null), null);
});

test('mărimea sub H0 a funcției (simulare înainte de folosire): diferențe simetrice în jurul lui 0 ⇒ respingeri false ≈ 5 % la n = 12 (2000 lumi exacte) și la n = 36 (300 lumi Monte Carlo)', () => {
  const r = mulberry32(2810);
  let false12 = 0; for (let i = 0; i < 2000; i++) if (N.testPermutare(Array.from({ length: 12 }, () => gauss(r) * .1)).semnificativ) false12++;
  assert.ok(false12 / 2000 > .03 && false12 / 2000 < .07, 'n = 12: ' + false12 / 2000);
  let false36 = 0; for (let i = 0; i < 300; i++) if (N.testPermutare(Array.from({ length: 36 }, () => gauss(r) * .1)).semnificativ) false36++;
  assert.ok(false36 / 300 > .02 && false36 / 300 < .09, 'n = 36: ' + false36 / 300);
});

test('marimeAvantaj: d_i = log-loss reper − log-loss model pe rând; un model mereu mai bun dă p mic, unul identic cu reperul dă p = 1', () => {
  const blocks = Array.from({ length: 12 }, (_, i) => ({ x: [i], y: i % 3 }));
  const model = (x) => { const p = [.2, .2, .2]; p[x[0] % 3] = .6; return p; }, reper = () => [1 / 3, 1 / 3, 1 / 3];
  const t = N.marimeAvantaj(blocks, model, reper, 'constant'); assert.equal(t.reper, 'constant'); assert.ok(t.p < .001); assert.ok(t.statistic > 0);
  const egal = N.marimeAvantaj(blocks, reper, reper, 'constant'); assert.equal(egal.p, 1);
  assert.equal(N.marimeAvantaj(blocks.slice(0, 3), model, reper, 'constant'), null);
});

test('raportul Neural și Boosting poartă testul pe orizonturile fără suprapunere, față de reperul mai bun (Neural) / frecvențele claselor (Boosting); rezultatele rămân valide; pe mers aleator p nu e sub 0,05 sistematic, pe demo e sub 0,001', () => {
  // simulat înainte (28.10, scratchpad experiment-marime.mjs, bibliotecile reale): H0 — 30 lumi de mers aleator, 36 orizonturi separate fiecare: Neural p < 0,05 în 0 din 30 (p median 0,69), Boosting în 0 din 30 (p median 0,56) — sub H0 modelele sunt de regulă MAI SLABE decât reperul, deci testul unilateral e conservator; demo — 4/4 cu p < 0,001 la ambele. Aici doar o gardă rapidă.
  const r = mulberry32(777), zile = []; for (let d = new Date(NOW); zile.length < 1100; d.setUTCDate(d.getUTCDate() - 1)) if (d.getUTCDay() > 0 && d.getUTCDay() < 6) zile.unshift(d.getTime());
  let price = 100; const bars = zile.map((t) => { const o = price * (1 + gauss(r) * .004); price = Math.max(1, price * Math.exp(gauss(r) * .018)); const c = price; return { t, o, h: Math.max(o, c) * (1 + Math.abs(gauss(r)) * .007), l: Math.min(o, c) * (1 - Math.abs(gauss(r)) * .007), c, v: Math.round(1e6 * Math.exp(gauss(r) * .3)) }; });
  for (const [nume, serie] of [['H0', bars], ['demo', N.demoBars(2, NOW)]]) {
    const data = N.dataset(serie, NOW), res = E.evaluate(data.rows, data.latest); res.comparison = M.evaluate(data.rows, data.latest, res);
    const t = res.report.sizeTest, b = res.comparison.boosting.report.sizeTest;
    assert.ok(t && b, nume + ': testul există în ambele rapoarte'); assert.equal(t.n, res.report.nonOverlap.test.n); assert.equal(b.n, t.n); assert.ok(['linear', 'constant'].includes(t.reper)); assert.equal(b.reper, 'constant');
    assert.ok(N.valid(res) && M.valid(res), nume + ': rapoartele rămân valide cu câmpul nou');
    if (nume === 'demo') { assert.ok(t.p < .001 && b.p < .001, 'demo: ' + t.p + ' / ' + b.p); assert.equal(t.semnificativ, true); }
  }
  assert.match(readFileSync('holdings/neural.js', 'utf8'), /marimeText\(result\.report\.sizeTest\)/, 'afișat în detaliile modelului');
  assert.match(readFileSync('holdings/neural.js', 'utf8'), /Testul nu schimbă starea modelului; pragul descriptiv de 0,02 rămâne poarta/);
});
