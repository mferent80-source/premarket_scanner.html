// 27.10.2026 — I-745 (auditul F): lib/markov.js folosea două generatoare LCG (`*1103515245 + 12345` la perturbarea restartului HMM și
// `*1664525 + 1013904223` la Monte Carlo-ul primei treceri). Regula casei din 06.10.2026: aleator în JS = mulberry32, NICIODATĂ LCG
// (produsul trece de 2^53 și generatorul degenerează). Aici: nu mai există LCG, generatorul nou e uniform și nu se repetă, iar rezultatele
// rămân deterministe (aceeași sămânță ⇒ aceleași cifre între randări).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync('lib/markov.js', 'utf8');
function mk() { const c = { console, Math, Number, Array, Object, JSON, Float64Array, Map, Set }; c.window = c; vm.createContext(c); vm.runInContext(SRC, c, { filename: 'lib/markov.js' }); return c.MK; }

test('no LCG left in lib/markov.js (house rule since 06.10.2026: mulberry32 only)', () => {
  assert.ok(!/1103515245|1664525|1013904223/.test(SRC), 'constantele LCG au rămas în lib/markov.js');
  assert.ok(/0x6D2B79F5/.test(SRC), 'mulberry32 e generatorul');
});
test('the new generator: uniform deciles (±1 pp on 50.000), ≥ 49.900 distinct values of 50.000, same seed ⇒ same series', () => {
  const MK = mk(), r = MK._rng(987654321), n = 50000, dec = new Array(10).fill(0), vazute = new Set();
  for (let i = 0; i < n; i++) { const x = r(); assert.ok(x >= 0 && x < 1); dec[Math.floor(x * 10)]++; vazute.add(x); }
  for (const d of dec) assert.ok(Math.abs(d / n - 0.1) < 0.01, 'decila ' + d / n);
  assert.ok(vazute.size >= 49900, 'valori distincte: ' + vazute.size);
  const a = MK._rng(7), b = MK._rng(7); for (let i = 0; i < 5; i++) assert.equal(a(), b());
});
// 28.10.2026 (revizia F2, 🔵18): testul de decile de mai sus e slab (±1 pp pe 50.000 ≈ 7,5 erori standard). Aici: identic bit cu bit cu
// mulberry32 de referință, hi-pătrat pe 100 de intervale (10⁶ trageri, prag la p = 0,001) și autocorelarea la pasul 1 sub 0,005.
test('🔵18 generatorul e mulberry32 bit cu bit; hi-pătrat pe 100 de intervale și autocorelarea la pasul 1 trec la praguri strânse', () => {
  const ref = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const MK = mk();
  for (const s of [1, 7, 987654321, 2 ** 31 - 1]) { const a = MK._rng(s), b = ref(s); for (let i = 0; i < 10000; i++) assert.equal(a(), b(), 'sămânța ' + s + ', pasul ' + i); }
  const r = MK._rng(20261028), n = 1e6, k = 100, bins = new Array(k).fill(0); let prev = r(), sxy = 0, sx = 0, sxx = 0;
  for (let i = 0; i < n; i++) { const x = r(); bins[Math.floor(x * k)]++; sxy += prev * x; sx += x; sxx += x * x; prev = x; }
  const e = n / k, chi = bins.reduce((acc, o) => acc + (o - e) ** 2 / e, 0);
  assert.ok(chi < 148.2, 'hi-pătrat (99 grade, prag p = 0,001: 148,2): ' + chi.toFixed(1));
  const m = sx / n, rho = (sxy / n - m * m) / (sxx / n - m * m);
  assert.ok(Math.abs(rho) < 0.005, 'autocorelarea la pasul 1: ' + rho.toFixed(5));
});
test('HMM restarts and the first-passage Monte Carlo stay deterministic (same input ⇒ same numbers)', () => {
  const MK = mk(), obs = []; let s = 1; for (let i = 0; i < 400; i++) { s = (s * 16807) % 2147483647; obs.push(((s / 2147483647) - 0.5) * (i % 50 < 25 ? 0.01 : 0.04)); }
  const f1 = MK.fitHMM(obs, 2, { restarts: 3 }), f2 = MK.fitHMM(obs, 2, { restarts: 3 });
  assert.ok(f1 && Number.isFinite(f1.logLik)); assert.equal(f1.logLik, f2.logLik);
  const p1 = MK.firstPassage(f1, 0.02, 0.02, { sims: 2000, seed: 42 }), p2 = MK.firstPassage(f1, 0.02, 0.02, { sims: 2000, seed: 42 });
  assert.deepEqual(JSON.parse(JSON.stringify(p1)), JSON.parse(JSON.stringify(p2)));
});
