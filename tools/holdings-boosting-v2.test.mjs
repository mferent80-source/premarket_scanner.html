// 28.10.2026 (I-777) — „Rezolvă și fă să apară verdict” (Marius). Auditul din aceeași zi: Gradient Boosting v1 (rată 0,08, maximum 80 de runde) se oprea
// la plafon în TOATE ferestrele, încă neantrenat, și nu trecea testul pe trei ferestre nici pe seria demo deterministă (0/4), deci verdictul final nu
// putea da niciodată o direcție („Neconcludent · dovezi insuficiente”). Aici: v2 are loc să învețe, găsește avantajul repetat pe demo, rămâne mut pe mers
// aleator, iar rapoartele v1 rămân istoric (registru, raport public), fără să intre în alegerea ponderilor combinației.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

for (const f of ['lib/holdings-bars.js', 'lib/holdings-neural.js', 'lib/holdings-neural-evaluation.js', 'lib/holdings-boosting.js', 'lib/holdings-model-comparison.js', 'lib/holdings-forecast.js', 'lib/holdings-calibration.js']) vm.runInThisContext(readFileSync(f, 'utf8'), { filename: f });
const N = globalThis.HoldingsNeural, E = globalThis.HoldingsNeuralEvaluation, B = globalThis.HoldingsBoosting, M = globalThis.HoldingsModelComparison, F = globalThis.HoldingsForecast, C = globalThis.HoldingsCalibration;
const NOW = Date.UTC(2026, 9, 27, 20);
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
function mersAleator(seed, n = 1100, sigma = .018) {
  const r = mulberry32(seed), t = []; for (let d = new Date(NOW); t.length < n; d.setUTCDate(d.getUTCDate() - 1)) if (d.getUTCDay() > 0 && d.getUTCDay() < 6) t.unshift(d.getTime());
  let price = 100; const bars = [];
  for (let i = 0; i < n; i++) { const o = price * (1 + gauss(r) * sigma * .25); price = Math.max(1, price * Math.exp(gauss(r) * sigma)); const c = price; bars.push({ t: t[i], o, h: Math.max(o, c) * (1 + Math.abs(gauss(r)) * sigma * .4), l: Math.min(o, c) * (1 - Math.abs(gauss(r)) * sigma * .4), c, v: Math.round(1e6 * Math.exp(gauss(r) * .3)) }); }
  return bars;
}
function antreneaza(bars) { const data = N.dataset(bars, NOW), r = E.evaluate(data.rows, data.latest); r.comparison = M.evaluate(data.rows, data.latest, r); return r; }

test('v2: versiunea și configurația — mai multe runde decât plafonul v1 (80), dar sub limita validatorului temporal (240), în pași de 5; depth/minLeaf neschimbate', () => {
  assert.equal(B.VERSION, 'holdings-gbt-v2');
  assert.ok(B.CONFIG.maxRounds > 80 && B.CONFIG.maxRounds <= 240 && B.CONFIG.maxRounds % 5 === 0, 'maxRounds: ' + B.CONFIG.maxRounds);
  assert.ok(B.CONFIG.rate >= .08 && B.CONFIG.rate <= .5); assert.equal(B.CONFIG.depth, 2); assert.equal(B.CONFIG.minLeaf, 20);
});

test('aceeași versiune peste tot: verdict, registru (cu v1 ca istoric), istoricul modelelor, sinteză, analiză, pagină, worker, pagina de validare', () => {
  const citeste = (f) => readFileSync(f, 'utf8');
  assert.equal(F.VERSIONS.boosting, 'holdings-gbt-v2'); assert.deepEqual(F.LEDGER.boosting, 'holdings-gbt-v2');
  assert.match(citeste('lib/holdings-forecast.js'), /boosting:\['holdings-gbt-v1'\]/, 'estimările v1 rămân valide în registru, ca istoric');
  for (const f of ['lib/holdings-verdict.js', 'lib/holdings-model-history.js', 'lib/holdings-model-summary.js', 'lib/holdings-model-analysis.js']) { assert.match(citeste(f), /holdings-gbt-v2/, f); assert.doesNotMatch(citeste(f), /holdings-gbt-v1/, f + ' nu mai cere v1'); }
  assert.match(citeste('holdings/index.html'), /holdings-boosting\.js\?v=holdings-gbt-v2/); assert.match(citeste('holdings/neural-worker.js'), /holdings-boosting\.js\?v=holdings-gbt-v2/);
  assert.match(citeste('holdings/neural.js'), /neural-worker\.js\?v='\+N\.VERSION\+'-boost-comparison-v2'/, 'worker-ul schimbat primește alt `?v=`');
  assert.match(citeste('tools/holdings-neural-validation.html'), /holdings-boosting\.js\?v=holdings-gbt-v2/);
});

test('registru: o estimare Boosting v1 rămâne validă (istoric), dar calibrarea nu amestecă v1 cu v2 la alegerea ponderilor (perechea iese ca „legacy”)', () => {
  const e = { scope: 's', ticker: 'T', symbol: 'TE', currency: 'USD', kind: 'market' }, t0 = Date.UTC(2026, 9, 1, 20), zi = (k) => { const d = new Date(t0 + k * 7 * 86400000); return d.toISOString().slice(0, 10); };
  const intrare = (model, k, version = F.LEDGER[model]) => { const src = { t: t0 + k * 7 * 86400000, asOf: zi(k), timezone: 'UTC', closeMinutes: 1200, close: 100, atrPct: 2 }, path = [1, 2, 3, 4, 5].map((i) => ({ t: src.t + i * 86400000, c: 100 + i })); return { version: F.VERSION, id: model + '|' + src.asOf, symbol: 'TE', currency: 'USD', kind: 'market', model, modelVersion: version, horizon: 5, capturedAt: src.t + 3600000, trainedAt: src.t + 60000, state: 'ok', source: src, estimate: { classIndex: 2, baselineClass: 1, probabilities: [.2, .3, .5] }, outcome: { t: path[4].t, asOf: new Date(path[4].t).toISOString().slice(0, 10), close: 105, path, checkedAt: path[4].t + 3600000, retrievedAt: path[4].t + 1800000 }, verification: { state: 'resolved', checkedAt: path[4].t + 3600000, sessions: 5, reason: 'ok' } }; };
  const now = t0 + 60 * 86400000;
  assert.equal(F.validEntry(intrare('boosting', 0, 'holdings-gbt-v1'), e, now), true, 'v1 rămâne în registru');
  assert.equal(F.validEntry(intrare('boosting', 0, 'holdings-gbt-v0'), e, now), false, 'o versiune necunoscută nu');
  const ledger = { ok: true, entries: [intrare('neural', 0), intrare('boosting', 0, 'holdings-gbt-v1'), intrare('neural', 1), intrare('boosting', 1)] };
  let rows = []; const rap = C.build({ identity: e, ledger }, { scope: 's', kind: 'market', now, onRows: (r) => { rows = r; } });
  assert.equal(rap.paired, 1, 'doar perechea v2 intră'); assert.equal(rap.excluded.legacy, 1, 'perechea cu Boosting v1 iese ca legacy'); assert.equal(rows.length, 1); assert.equal(rows[0].asOf, zi(1));
});

test('raportul public din 4.10.2026 (Boosting v1, maximum 80 de runde) rămâne verificabil ca istoric; un raport v2 e verificat cu plafonul v2', () => {
  const report = JSON.parse(readFileSync('docs/neural-validation-latest.json', 'utf8'));
  assert.equal(report.boostingVersion, 'holdings-gbt-v1');
  for (const entry of report.results) { assert.ok(M.validPublic(entry), entry.symbol); const altered = JSON.parse(JSON.stringify(entry)); altered.comparison.boosting.rounds = 85; assert.equal(M.validPublic(altered), false, 'v1 nu poate pretinde mai mult de 80 de runde'); }
});

test('H0 (mers aleator, fără semnal): Boosting v2 nu spune „avantaj” și nu e consecvent pe trei ferestre; verdictul comparației nu e niciodată „research” (3 lumi, ca gardă rapidă — simularea mare e în backlog I-777)', () => {
  for (const seed of [11, 12, 13]) {
    const r = antreneaza(mersAleator(seed)), b = r.comparison.boosting;
    assert.equal(r.comparison.status, 'evaluated'); assert.equal(b.version, 'holdings-gbt-v2');
    assert.equal(b.advantage, false, 'seed ' + seed); assert.equal(b.walk.consistent, false, 'seed ' + seed);
    assert.ok(['no-edge', 'disagreement', 'blocked'].includes(M.verdict(r).state), 'pe zgomot verdictul comparației nu e niciodată „research”: ' + M.verdict(r).state);
    assert.ok(B.valid(b) && M.valid(r), 'rezultatul rămâne verificabil');
  }
});

test('semnal determinist (bare demo): Boosting v2 găsește avantajul repetat în toate cele trei ferestre pe cel puțin 3 din 4 serii, iar comparația ajunge la „research” acolo unde și Neural e consecvent', () => {
  let consecvent = 0, research = 0, neuralConsecvent = 0;
  for (const seed of [1, 2, 3, 4]) {
    const r = antreneaza(N.demoBars(seed, NOW)), b = r.comparison.boosting;
    assert.ok(B.valid(b) && M.valid(r)); if (b.walk.consistent) consecvent++; if (r.walk.consistent) neuralConsecvent++;
    const v = M.verdict(r); if (v.state === 'research') research++;
    if (r.walk.consistent && b.walk.consistent && r.classIndex === b.classIndex && r.maxZ <= 6) assert.equal(v.state, 'research', 'acordul celor două modele dă „research”, seed ' + seed);
  }
  assert.ok(consecvent >= 3, 'Boosting consecvent pe ' + consecvent + '/4 serii demo'); assert.ok(neuralConsecvent >= 3, 'Neural consecvent pe ' + neuralConsecvent + '/4');
  assert.ok(research >= 2, 'comparația ajunge la „research” pe ' + research + '/4 serii demo (înainte: 0/4)');
});
