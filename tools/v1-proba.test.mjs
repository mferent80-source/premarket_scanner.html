// 18.10.2026 — Proba în timp a Reguli V1 (docs/v1-proba-protocol.md). Mărimea testului e verificată pe prețuri ALEATORII înainte de
// orice verdict (lecția 17.10: Newey-West dădea 9–12% „dovezi” false la 5%); puterea, pe un avantaj plantat.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROTOCOL, inregistrare, adauga, excese, pSemne, starturi, evalueaza } from '../lib/v1-proba.mjs';

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function zile(n) { const out = []; let d = Date.parse('2026-01-05T12:00:00Z'); while (out.length < n) { const x = new Date(d); if (x.getUTCDay() % 6) out.push(x.toISOString().slice(0, 10)); d += 86400000; } return out; }
const V = 'experimental-1.0.0';
/** Lume sintetică: 40 de acțiuni, reperul SPY; în fiecare zi fiecare acțiune primește la întâmplare 3–8 verificări trecute.
    avantaj = randament în plus pe sesiune pentru grupul SUS, în sesiunile de după ziua notată. */
function lume(seed, { sesiuni = 8 * 5 + 6, k = 5, avantaj = 0, nAct = 40 } = {}) {
  const rnd = mulberry32(seed), d = zile(sesiuni), gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const spy = [{ d: d[0], c: 100 }]; for (let i = 1; i < sesiuni; i++) spy.push({ d: d[i], c: spy[i - 1].c * (1 + 0.01 * gauss()) });
  const serii = { SPY: spy }, jurnal = { zile: [] }, simboluri = Array.from({ length: nAct }, (_, i) => 'S' + i);
  const trecute = d.map(() => simboluri.map(() => 3 + Math.floor(rnd() * 6)));
  for (const [j, s] of simboluri.entries()) { const a = [{ d: d[0], c: 50 }]; for (let i = 1; i < sesiuni; i++) { const start = Math.floor((i - 1) / k) * k, bonus = trecute[start][j] >= PROTOCOL.pragSus ? avantaj : 0; a.push({ d: d[i], c: a[i - 1].c * (1 + (spy[i].c / spy[i - 1].c - 1) + 0.02 * gauss() + bonus) }); } serii[s] = a; }
  for (let i = 0; i < sesiuni; i++) jurnal.zile.push({ zi: d[i], v: V, la: d[i] + 'T22:00:00Z', r: simboluri.map((s, j) => [s, trecute[i][j] === 8 ? 'm' : 'n', trecute[i][j], d[i], 'SPY']) });
  return { jurnal, serii, sesiuni: d };
}

test('the day record keeps verdict, checks passed, EOD date and benchmark; the same day is replaced, never duplicated', () => {
  const rep = { version: V, items: [{ symbol: 'AAPL', verdict: 'rules_not_met', passed: 6, sourceDate: '2026-10-16', metrics: { benchmarkSymbol: 'SPY' } }, { symbol: 'SAP.DE', verdict: 'research_match', passed: 8, sourceDate: '2026-10-16', metrics: { benchmarkSymbol: '^STOXX' } }, { symbol: 'X', verdict: 'unverifiable', passed: 0, sourceDate: null, metrics: {} }] };
  const r = inregistrare(rep, Date.parse('2026-10-16T22:00:00Z'));
  assert.equal(r.zi, '2026-10-16'); assert.deepEqual(r.r[1], ['SAP.DE', 'm', 8, '2026-10-16', '^STOXX']); assert.equal(r.r[2][1], 'u');
  let j = adauga({ zile: [] }, r); j = adauga(j, { ...r, la: 'altă rulare' }); assert.equal(j.zile.length, 1); assert.equal(j.zile[0].la, 'altă rulare');
  j = adauga(j, { ...r, v: 'experimental-2.0.0' }); assert.equal(j.zile.length, 2, 'altă versiune = altă probă');
  assert.equal(inregistrare({ version: V, items: [{ symbol: 'X', verdict: 'unverifiable' }] }).zi, null);
});
test('excess return uses the stock’s own k sessions and the benchmark on the same dates (last price ≤ date for another calendar)', () => {
  const serii = { A: [{ d: '2026-01-05', c: 100 }, { d: '2026-01-06', c: 101 }, { d: '2026-01-07', c: 110 }], B: [{ d: '2026-01-05', c: 50 }, { d: '2026-01-06', c: 51 }] };
  const jurnal = { zile: [{ zi: '2026-01-05', v: V, r: [['A', 'n', 6, '2026-01-05', 'B'], ['A', 'u', 0, '2026-01-05', 'B']] }, { zi: '2026-01-06', v: 'alta', r: [['A', 'n', 6, '2026-01-06', 'B']] }] };
  const e = excese(jurnal, serii, 2, V); assert.equal(e.length, 1); assert.ok(Math.abs(e[0].ex - (0.10 - 0.02)) < 1e-12);
  assert.equal(excese(jurnal, serii, 3, V).length, 0, 'fără k sesiuni după ziua notată nu se calculează nimic');
});
test('only non-overlapping periods count, and the exact sign test matches the binomial', () => {
  const s = zile(30); assert.deepEqual(starturi([s[0], s[1], s[4], s[5], s[10]], s, 5), [s[0], s[5], s[10]]);
  assert.equal(pSemne(8, 8), 1 / 256); assert.equal(pSemne(7, 8), 9 / 256); assert.equal(pSemne(0, 8), 1); assert.equal(pSemne(0, 0), 1);
});
test('no verdict before 8 periods: one logged day is “wait”', () => {
  const w = lume(1, { sesiuni: 6 }), o = evalueaza(w.jurnal, w.serii, { k: 5, versiune: V, sesiuni: w.sesiuni });
  assert.equal(o.verdict, 'astept'); assert.equal(o.necesare, 8); assert.ok(o.perioade < 8);
});
test('SIZE: on random prices with no edge, “V1 helps” appears in at most 5% of worlds', () => {
  let fals = 0, cu8 = 0; const N = 600;
  for (let s = 1; s <= N; s++) { const w = lume(1000 + s), o = evalueaza(w.jurnal, w.serii, { k: 5, versiune: V, sesiuni: w.sesiuni }); if (o.perioade >= 8) cu8++; if (o.verdict === 'ajuta') fals++; }
  assert.ok(cu8 > N * 0.9, 'lumea sintetică produce 8 perioade: ' + cu8); assert.ok(fals / N <= 0.05, 'dovezi false: ' + (100 * fals / N).toFixed(1) + '%');
});
test('POWER: a real edge for the ≥6/8 group is found most of the time', () => {
  let gasit = 0; const N = 200;
  for (let s = 1; s <= N; s++) { const w = lume(5000 + s, { avantaj: 0.004 }), o = evalueaza(w.jurnal, w.serii, { k: 5, versiune: V, sesiuni: w.sesiuni }); if (o.verdict === 'ajuta') gasit++; }
  assert.ok(gasit / N >= 0.7, 'găsit în ' + (100 * gasit / N).toFixed(0) + '% din lumi');
});
test('a negative edge never becomes “helps”; it ends as “no advantage seen”', () => {
  const w = lume(77, { avantaj: -0.004 }), o = evalueaza(w.jurnal, w.serii, { k: 5, versiune: V, sesiuni: w.sesiuni });
  assert.equal(o.verdict, 'fara-avantaj'); assert.ok(o.medieDif < 0);
});
test('the frozen universe is the 85-symbol Core list of the original scanner', async () => {
  const { readFileSync } = await import('node:fs'), src = readFileSync('candidate-engine/engine.js', 'utf8');
  const lista = (n) => [...src.match(new RegExp('var ' + n + ' = \\[([\\s\\S]*?)\\];'))[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...PROTOCOL.univers], [...lista('US_CORE'), ...lista('EU_CORE')]); assert.equal(PROTOCOL.univers.length, 85);
});
