// 27.10.2026 (I-750, audit B 🟡 [2]) — „versiune validată” a combinației Neural + Boosting doar după un TEST DE MĂRIME: permutare pe semne (exactă,
// 2^n configurații) pe diferențele de log-loss pe rând (reper simplu − candidat), unilateral, p < 0,05. Regula din memorie: test statistic nou ⇒
// simulare de mărime sub H0 ÎNAINTE de folosire (aici, în test). Altfel candidatul rămâne „candidat” și nu devine versiune activă.
import test from 'node:test';
import assert from 'node:assert/strict';
import { core, dates, e, fixture, plain } from './holdings-learning-fixtures.mjs';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const c = core(), L = c.HoldingsLearning, now = Date.parse('2026-10-05T18:00:00Z');
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const normal = (rnd) => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
const predict = (state, item) => L.predict(state, item, { neural: [.01, .01, .98], boosting: [.01, .01, .98], source: { symbol: e.symbol, currency: e.currency, kind: e.kind, asOf: '2026-10-02', t: Date.parse('2026-10-02T13:30:00Z'), fingerprint: 'same-history' }, now });
/** Probabilități de 0,70 pe clasa prezisă pe TOATE cele 40 de perechi (i = poziția în `dates` / 6; datele sar peste weekend, deci nu Δt / 6 zile):
 *  calibrarea (i < 20) greșește la i % 4 = 0 ca fixtura de bază ⇒ temperatura aleasă rămâne 1; în test primele `gresite` rânduri sunt greșite.
 *  Cu 8 greșite din 20: log-loss 0,973 față de reperul 1,103 (poarta descriptivă trece), dar permutarea dă p ≈ 0,25 (zgomot). */
function blanda(gresite, incredere = .7, cc = c) {
  const item = fixture(cc);
  for (const r of item.ledger.entries) {
    const i = dates.indexOf(r.source.t) / 6, actual = i % 3, gresit = i < 20 ? i % 4 === 0 : i - 20 < gresite, predicted = gresit ? (actual + 1) % 3 : actual;
    r.estimate.classIndex = predicted; r.estimate.probabilities = [0, 1, 2].map((k) => (k === predicted ? incredere : (1 - incredere) / 2));
  }
  return item;
}

test('testul de permutare pe semne: exact pe n ≤ 22, p = 1 când toate diferențele sunt ≤ 0, p mic când candidatul e sistematic mai bun, nedefinit pe date lipsă', () => {
  const t = L.testPermutare([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]); // 10 diferențe pozitive: doar configurația observată dă suma ≥ 10 ⇒ p = 1/1024
  assert.equal(t.metoda, 'permutare-semne-exacta'); assert.equal(t.n, 10); assert.equal(t.configuratii, 1024); assert.ok(Math.abs(t.p - 1 / 1024) < 1e-12); assert.equal(t.validat, true); assert.equal(t.alpha, .05);
  assert.equal(L.testPermutare([-1, -2, -0.5]).p, 1, 'candidatul mai slab ⇒ p = 1');
  assert.equal(L.testPermutare([0, 0, 0]).p, 1, 'fără diferență ⇒ p = 1');
  const mixt = L.testPermutare([.5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, -.5, -.5, -.5, -.5, -.5, -.5, -.5, -.5, -.5]); // 11 pozitive, 9 negative (n = 20)
  assert.equal(mixt.n, 20); assert.equal(mixt.configuratii, 1048576); assert.ok(mixt.p > .2 && mixt.p < .5, 'p = ' + mixt.p); assert.equal(mixt.validat, false);
  assert.equal(L.testPermutare([]), null); assert.equal(L.testPermutare([1, NaN]), null); assert.equal(L.testPermutare(null), null);
  assert.deepEqual(plain(L.testPermutare([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])), plain(t), 'determinist');
});

test('mărimea sub H0 (simulare înainte de folosire): diferențe simetrice ⇒ rata respingerilor false ≈ 5 % la n = 12 (2000 lumi) și la n = 20 (300 lumi)', () => {
  const rnd = mulberry32(20261027);
  let r12 = 0; for (let k = 0; k < 2000; k++) { const d = Array.from({ length: 12 }, () => normal(rnd)); if (L.testPermutare(d).validat) r12++; }
  const rata12 = r12 / 2000; assert.ok(rata12 >= .03 && rata12 <= .07, 'n = 12: ' + rata12);
  let r20 = 0; for (let k = 0; k < 300; k++) { const d = Array.from({ length: 20 }, () => normal(rnd)); if (L.testPermutare(d).validat) r20++; }
  const rata20 = r20 / 300; assert.ok(rata20 >= .015 && rata20 <= .095, 'n = 20: ' + rata20);
  let putere = 0; for (let k = 0; k < 200; k++) { const d = Array.from({ length: 20 }, () => normal(rnd) + .8); if (L.testPermutare(d).validat) putere++; }
  assert.ok(putere / 200 > .8, 'cu o deplasare de 0,8 σ la n = 20 testul respinge de obicei (putere ' + putere / 200 + ')');
});

// Diferențele de log-loss NU sunt simetrice (o greșeală încrezătoare costă mult) ⇒ simulare pe DRUMUL REAL: 20 rânduri de calibrare aleg ponderea și
// temperatura (L.evaluate), reperul = frecvențele din calibrare, poarta descriptivă + permutarea pe cele 20 de test. Celula cea mai rea găsită (scratchpad,
// 27.10: încredere brută 0,999, acuratețe 0,61, chiar pe limita H0) ⇒ 6,6 % validări false din 716 lumi; poarta singură 46,9 %. Aici 400 de lumi.
test('mărimea pe drumul real, în celula cea mai rea (încredere brută 0,999, pe limita H0): poarta singură validează fals des, poarta + permutarea rar', () => {
  const C = c.HoldingsCalibration, rnd = mulberry32(11), r = .999, q = .61, loss = (p, k) => -Math.log(Math.max(1e-12, p[k]));
  const rand = (t0) => { const X = Math.floor(rnd() * 3), actual = rnd() < q ? X : (X + 1 + Math.floor(rnd() * 2)) % 3, v = (cc) => [0, 1, 2].map((j) => (j === X ? cc : (1 - cc) / 2)), z = 1 - r, rn = Math.min(1 - 1e-6, r + (rnd() - .5) * z), rb = Math.min(1 - 1e-6, r + (rnd() - .5) * z); return { neural: v(rn), boosting: v(rb), actualClass: actual, t: t0, end: t0 + 1 }; };
  let h0 = 0, poarta = 0, fals = 0;
  for (let k = 0; k < 400; k++) {
    const rows = Array.from({ length: 40 }, (_, i) => rand(i * 10)), ev = L.evaluate(rows.slice(0, 20), rows.slice(20)); if (!ev) continue;
    const { neuralWeight: w, temperature: T, prior } = ev.parameters, ce = C.combine([r, (1 - r) / 2, (1 - r) / 2], [r, (1 - r) / 2, (1 - r) / 2], w, T)[0];
    const adevarCandidat = -q * Math.log(ce) - (1 - q) * Math.log((1 - ce) / 2), adevarReper = -prior.reduce((s, v) => s + Math.log(v) / 3, 0);
    if (adevarCandidat < adevarReper) continue; // candidatul ales e de fapt mai bun ⇒ nu e lume H0
    h0++; if (ev.eligible) poarta++;
    if (ev.eligible && L.testPermutare(rows.slice(20).map((x) => loss(prior, x.actualClass) - loss(C.combine(x.neural, x.boosting, w, T), x.actualClass))).validat) fals++;
  }
  assert.ok(h0 >= 150, 'lumi H0: ' + h0);
  assert.ok(poarta / h0 > .3, 'poarta descriptivă singură: ' + (poarta / h0));
  assert.ok(fals / h0 <= .1, 'poartă + permutare: ' + (fals / h0) + ' (celula cea mai rea; în restul grilei ≤ 5 %)');
});

test('peste 22 de diferențe testul trece pe Monte Carlo determinist (mulberry32, 20 000 extrageri), cu aceeași decizie pe aceleași date', () => {
  const d = Array.from({ length: 30 }, (_, i) => (i % 3 === 0 ? -.4 : .5)), a = L.testPermutare(d), b = L.testPermutare(d.slice());
  assert.equal(a.metoda, 'permutare-semne-monte-carlo'); assert.equal(a.configuratii, 20001); assert.equal(a.p, b.p); assert.equal(a.validat, true);
  const zero = L.testPermutare(Array.from({ length: 30 }, (_, i) => (i % 2 ? .3 : -.3))); assert.equal(zero.validat, false); assert.ok(zero.p > .3);
});

test('candidatul care trece pragul descriptiv dar NU testul de mărime rămâne candidat: nu devine versiune activă, iar motivul spune p', () => {
  const item = blanda(8), out = L.update(null, item, now), cand = out.state.reviews[0].candidate, rows = L.sample(item, now), t = L.testMarime(cand, rows);
  assert.equal(cand.eligible, true, 'cazul testat: trece pragul descriptiv (log-loss ' + cand.scores.candidate.loss + ' față de reperul ' + cand.scores.prior.loss + ')');
  assert.equal(cand.parameters.temperature, 1, 'calibrarea cu aceeași încredere nu turtește probabilitățile');
  assert.equal(t.validat, false, 'p = ' + t.p); assert.equal(t.n, 20); assert.ok(t.p > .2 && t.p < .3, 'p = ' + t.p);
  assert.equal(out.state.champion, null, 'fără versiune activă'); assert.equal(out.state.reviews[0].promoted, false);
  assert.match(out.reason, /testul de mărime/); assert.match(out.reason, /p = 0,\d/); assert.equal(out.progress.phase, 'rejected');
  assert.equal(predict(out.state, item).eligible, false);
  const tot = blanda(4), outTot = L.update(null, tot, now); // aceeași încredere, 4 greșite din 20 ⇒ p ≈ 0,005: testul confirmă
  assert.ok(outTot.state.champion, 'cu 16 / 20 corecte versiunea devine activă'); assert.equal(L.testMarime(outTot.state.champion, L.sample(tot, now)).validat, true);
});

test('o versiune activă veche (promovată doar pe pragul descriptiv) e „candidată”: probabilitățile rămân vizibile, dar nu e eligibilă și titlul o spune', () => {
  const item = blanda(8), out = L.update(null, item, now), cand = out.state.reviews[0].candidate;
  assert.equal(cand.eligible, true, 'cazul testat: trece pragul descriptiv (log-loss cu ≥ 0,02, Brier cu ≥ 0,01 sub reper)');
  const state = plain(out.state); state.champion = plain(cand); state.reviews[0].promoted = true; // ca o versiune salvată înainte de I-750
  const p = predict(state, item);
  assert.equal(p.eligible, false); assert.equal(p.checkpoint, cand.id, 'versiunea rămâne numită'); assert.equal(p.evidence.phase, 'candidate');
  assert.match(p.reason, /candidată/i); assert.match(p.reason, /permutare/); assert.match(p.reason, /p = 0,\d+/);
  assert.ok(p.evidence.sizeTest && p.evidence.sizeTest.validat === false && p.evidence.sizeTest.n === 20);
  const pr = L.update(state, item, now).progress; assert.equal(pr.phase, 'candidate'); assert.match(pr.title, /candidată/i);
});

test('candidatul care trece ȘI testul de mărime devine versiune validată (ca înainte), iar dovezile poartă testul', () => {
  const item = fixture(c), out = L.update(null, item, now), t = L.testMarime(out.state.champion, L.sample(item, now));
  assert.ok(out.state.champion); assert.equal(t.validat, true, 'p = ' + t.p); assert.equal(out.progress.phase, 'validated');
  const p = predict(out.state, item); assert.equal(p.eligible, true); assert.equal(p.evidence.phase, 'validated'); assert.equal(p.evidence.sizeTest.validat, true); assert.equal(p.evidence.sizeTest.metoda, 'permutare-semne-exacta');
  assert.equal(L.testMarime(out.state.champion, L.sample(item, now)), t, 'memorat pe id-ul versiunii');
});

// Afișajul: o versiune „candidată” (pragul descriptiv trecut, testul de mărime nu) nu e numită „validată” sau „activă” nicăieri în Portofoliu.
function panou(out) {
  const ui = core(['lib/holdings-auto-learning.js']); ui.document = { hidden: false, addEventListener() {}, querySelectorAll: () => [] }; ui.setInterval = () => 1;
  ui.HoldingsForecastUI = { autoStorage: () => ({ getItem: () => null }), learning: () => out };
  vm.runInContext(readFileSync('holdings/learning.js', 'utf8'), ui); const p = { ticker: e.ticker };
  ui.HoldingsAutoLearningUI.setContext({ scope: e.scope, demo: true, positions: [p], symbol: () => e.symbol, model: () => ({ currency: e.currency }) });
  return ui.HoldingsAutoLearningUI.markup(p, 0);
}
test('afișaj: candidatul respins de testul de mărime și versiunea veche „candidată” spun testul și p-ul, fără „versiune activă” / „validată”', () => {
  const item = blanda(8), respins = L.update(null, item, now), html = panou(respins);
  assert.match(html, /a trecut pragul descriptiv, dar nu testul de mărime/); assert.match(html, /p = 0,\d/);
  assert.match(html, /testul de mărime: permutare pe semne/, 'regula de activare e scrisă în „cum se activează”');
  const state = plain(respins.state); state.champion = plain(respins.state.reviews[0].candidate); state.reviews[0].promoted = true;
  const veche = L.update(state, item, now), h2 = panou(veche);
  assert.equal(veche.progress.phase, 'candidate'); assert.match(h2, /Versiune candidată/); assert.doesNotMatch(h2, /Versiune activă:/); assert.match(h2, /nu o confirmă/);
  const src = readFileSync('holdings/roster.js', 'utf8'), i = src.indexOf('function probabilityText('), j = src.indexOf('\nfunction ', i + 1), fmt = (v, u) => v.toFixed(1) + u;
  const probabilityText = new Function('fmt', src.slice(i, j) + ';return probabilityText;')(fmt);
  const text = probabilityText({ probability: { probabilities: [.2, .3, .5], eligible: false, checkpoint: 'ensemble-x', evidence: { phase: 'candidate', test: { n: 20 } } } });
  assert.match(text, /Candidată · testul de mărime nu confirmă/); assert.doesNotMatch(text, /Validată/);
  assert.match(probabilityText({ probability: { probabilities: [.2, .3, .5], eligible: false, checkpoint: 'ensemble-x', evidence: { phase: 'abstaining', test: { n: 20 } } } }), /Validată · abținere/);
});
