// 18.10.2026 — Proba în timp a Premarket Scanner, Top Long (docs/premarket-proba-protocol.md). Mărimea testului e verificată pe prețuri
// ALEATORII înainte de orice verdict (lecția 17.10), puterea pe un avantaj plantat; robotul rulează exact codul paginii.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROTOCOL, versiune, inregistrare, evalueaza } from '../lib/premarket-proba.mjs';
import { motor } from './premarket-jurnal.mjs';

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function zile(n) { const out = []; let d = Date.parse('2026-01-05T12:00:00Z'); while (out.length < n) { const x = new Date(d); if (x.getUTCDay() % 6) out.push(x.toISOString().slice(0, 10)); d += 86400000; } return out; }
const V = 'pm-test';
/** Lume sintetică: 40 de acțiuni, reperul SPY; în fiecare zi 10 acțiuni alese la întâmplare sunt „Top Long”. avantaj = randament în plus pe sesiune pentru ele. */
function lume(seed, { sesiuni = 8 * 5 + 6, k = 5, avantaj = 0, nAct = 40 } = {}) {
  const rnd = mulberry32(seed), d = zile(sesiuni), gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const spy = [{ d: d[0], c: 100 }]; for (let i = 1; i < sesiuni; i++) spy.push({ d: d[i], c: spy[i - 1].c * (1 + 0.01 * gauss()) });
  const serii = { SPY: spy }, jurnal = { zile: [] }, simboluri = Array.from({ length: nAct }, (_, i) => 'S' + i);
  const top = d.map(() => { const a = simboluri.map((s) => [rnd(), s]).sort((x, y) => x[0] - y[0]).slice(0, 10).map((x) => x[1]); return new Set(a); });
  for (const s of simboluri) { const a = [{ d: d[0], c: 50 }]; for (let i = 1; i < sesiuni; i++) { const start = Math.floor((i - 1) / k) * k, bonus = top[start].has(s) ? avantaj : 0; a.push({ d: d[i], c: a[i - 1].c * (1 + (spy[i].c / spy[i - 1].c - 1) + 0.02 * gauss() + bonus) }); } serii[s] = a; }
  for (let i = 0; i < sesiuni; i++) jurnal.zile.push({ zi: d[i], v: V, r: simboluri.map((s) => [s, top[i].has(s) ? 'm' : 'n', 60, d[i], 'SPY', '']) });
  return { jurnal, serii, sesiuni: d };
}

test('the day record marks Top Long, keeps the score, EOD date, benchmark used and the Early Reversal flag; only momentum rows count', () => {
  const st = { momentum: [{ symbol: 'AAPL' }], reversal: [{ symbol: 'SAP.DE' }], analyses: [
    { symbol: 'AAPL', mode: 'momentum', score: 82, sourceDate: '2026-10-16', benchmarkSymbol: 'SPY' },
    { symbol: 'AAPL', mode: 'reversal', score: 10, sourceDate: '2026-10-16' },
    { symbol: 'SAP.DE', mode: 'momentum', score: 40, sourceDate: '2026-10-16', benchmarkSymbol: '^STOXX' },
    { symbol: 'X', mode: 'momentum', score: 50, sourceDate: null }] };
  const r = inregistrare(st, 'pm-abc', Date.parse('2026-10-16T22:00:00Z'));
  assert.equal(r.zi, '2026-10-16'); assert.equal(r.v, 'pm-abc'); assert.equal(r.r.length, 2);
  assert.deepEqual(r.r[0], ['AAPL', 'm', 82, '2026-10-16', 'SPY', '']); assert.deepEqual(r.r[1], ['SAP.DE', 'n', 40, '2026-10-16', '^STOXX', 'r']);
  assert.equal(inregistrare({ analyses: [] }, 'pm-abc').zi, null);
});
test('the version is a fingerprint of the ranking rules: same code ⇒ same version, any rule change ⇒ new version (the test restarts)', () => {
  const f = { momentumScore() { return 'a'; }, analyze() { return 'b'; }, capSectors() { return 'c'; }, benchmarkReturns() { return 'd'; }, rankResults() { return 'e'; } };
  assert.equal(versiune(f), versiune({ ...f })); assert.match(versiune(f), /^pm-[0-9a-f]{12}$/);
  assert.notEqual(versiune({ ...f, momentumScore: () => 1 }), versiune(f));
  assert.throws(() => versiune({ ...f, capSectors: undefined }), /capSectors/);
});
test('SIZE: with no edge, “Top Long helps” appears in at most 5% of random worlds', () => {
  let fals = 0, cu8 = 0; const N = 600;
  for (let s = 1; s <= N; s++) { const w = lume(3000 + s), o = evalueaza(w.jurnal, w.serii, { k: 5, versiune: V, sesiuni: w.sesiuni }); if (o.perioade >= 8) cu8++; if (o.verdict === 'ajuta') fals++; }
  assert.ok(cu8 > N * 0.9, 'lumea sintetică produce 8 perioade: ' + cu8); assert.ok(fals / N <= 0.05, 'dovezi false: ' + (100 * fals / N).toFixed(1) + '%');
});
test('POWER: a real edge for Top Long is found most of the time; a negative edge never becomes “helps”', () => {
  let gasit = 0; const N = 200;
  for (let s = 1; s <= N; s++) { const w = lume(7000 + s, { avantaj: 0.004 }), o = evalueaza(w.jurnal, w.serii, { k: 5, versiune: V, sesiuni: w.sesiuni }); if (o.verdict === 'ajuta') gasit++; }
  assert.ok(gasit / N >= 0.7, 'găsit în ' + (100 * gasit / N).toFixed(0) + '% din lumi');
  const w = lume(99, { avantaj: -0.004 }), o = evalueaza(w.jurnal, w.serii, { k: 5, versiune: V, sesiuni: w.sesiuni });
  assert.equal(o.verdict, 'fara-avantaj'); assert.ok(o.medieDif < 0); assert.equal(o.descriptiv.indeplineste, undefined);
});
test('the robot runs the page’s own engine on the frozen 85-symbol Core universe, with Governor fixed and no schedule', async () => {
  const cereri = [], c = motor(async (s) => { cereri.push(s); throw Error('fără rețea în test'); }), h = c.hooks;
  for (const n of PROTOCOL.functii) assert.equal(typeof h[n], 'function', n);
  assert.match(versiune(h), /^pm-[0-9a-f]{12}$/); assert.equal(c.GV.status().verdict, 'TRADE');
  await h.scan();
  assert.equal(h.state.scanned, 85); assert.equal(h.state.verified, 0); assert.equal(h.state.failures.length, 85);
  for (const s of PROTOCOL.univers) assert.ok(cereri.includes(s), s);
  assert.ok(cereri.includes('SPY') && cereri.includes('^STOXX'), 'reperele SUA și Europa');
});
test('the daily workflow runs the Premarket robot after V1 and saves both files', () => {
  const y = readFileSync('.github/workflows/v1-proba.yml', 'utf8');
  assert.match(y, /node tools\/premarket-jurnal\.mjs/); assert.match(y, /premarket-jurnal\.json/); assert.match(y, /premarket-proba\.json/); assert.match(y, /tools\/premarket-proba\.test\.mjs/);
});
