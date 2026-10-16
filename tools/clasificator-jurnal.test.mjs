import test from 'node:test';
import assert from 'node:assert/strict';
import { PRAG, regim, ziua, adauga, citeste, verifica, bilant } from './clasificator-jurnal.mjs';

const dateOf = (t) => new Date(t).toISOString().slice(0, 10);
const zi = (i) => Date.UTC(2026, 0, 1) + i * 86400000;
const vot = (k, p) => ({ algos: { vote: { classIndex: k, support: p } }, state: 'no-edge', close: 100, atrPct: 2, ret5: 0, prior: [0.3, 0.4, 0.3] });

test('I-643: prima notare a zilei rămâne înghețată; a doua rulare din aceeași zi nu o rescrie', () => {
  const j = { asOf: '2026-01-10', generat: 'x', motor: 'm', entries: { A: vot(2, [0.1, 0.2, 0.7]) } };
  const t1 = adauga('', ziua(j, 'sus')), j2 = { ...j, entries: { A: vot(0, [0.7, 0.2, 0.1]) } }, t2 = adauga(t1, ziua(j2, 'sus'));
  assert.equal(t1, t2); assert.equal(citeste(t2)[0].voturi.A.k, 2); assert.equal(citeste(t2)[0].regim, 'sus');
});

test('I-643: verificarea după 5 sesiuni: clasa reală (±1 ATR) și banii unei cumpărări, doar pe închideri neschimbate', () => {
  const b = Array.from({ length: 20 }, (_, i) => ({ t: zi(i), o: 100, h: 101, l: 99.5, c: 100 }));
  b[8].c = 103; // +3% în 5 sesiuni, ATR 2% ⇒ +1,5 ATR ⇒ Long
  const L = [{ asOf: dateOf(zi(3)), regim: 'jos', voturi: { A: { k: 2, p: [0.1, 0.2, 0.7], c: 100, a: 2, r5: 0, pr: [0.3, 0.4, 0.3] } } },
    { asOf: dateOf(zi(17)), voturi: { A: { k: 2, p: [0.1, 0.2, 0.7], c: 100, a: 2, r5: 0, pr: [0.3, 0.4, 0.3] } } }, // prea recent
    { asOf: dateOf(zi(4)), voturi: { A: { k: 2, p: [0.1, 0.2, 0.7], c: 99, a: 2, r5: 0, pr: [0.3, 0.4, 0.3] } } }]; // închidere revizuită
  const z = verifica(L, { A: b }, dateOf);
  assert.equal(z.length, 1); assert.equal(z[0].rows[0].y, 2); assert.ok(Math.abs(z[0].rows[0].pnl - (3 - PRAG.cost)) < 1e-9);
});

const zile = (n, bun) => Array.from({ length: n }, (_, i) => ({ asOf: dateOf(zi(i)), regim: i < n / 2 ? 'sus' : 'jos', rows: [0, 1, 2].map((y) => ({ y, p: bun ? [0, 1, 2].map((k) => (k === y ? 0.8 : 0.1)) : [0.3, 0.4, 0.3], pr: [0.3, 0.4, 0.3], mom: [0.1, 0.8, 0.1], k: 2, pnl: 0.5 })) }));
test('I-643: sub 30 de zile separate verdictul e „în probă”, oricât de bune par cifrele', () => {
  const r = bilant([], zile(6 * 20, true)); assert.equal(r.zileSeparate, 20); assert.equal(r.verdict, 'in-proba'); assert.match(r.mesaj, /20 din 30/);
});
test('I-643: „ține” doar când bate AMBELE repere; un vot egal cu frecvențele „nu ține”', () => {
  assert.equal(bilant([], zile(6 * 40, true)).verdict, 'tine');
  assert.equal(bilant([], zile(6 * 40, false)).verdict, 'nu-tine');
});
test('I-647: regimul din SPY față de media de 200 de zile; feliile au verdictul lor', () => {
  const spy = Array.from({ length: 260 }, (_, i) => ({ t: zi(i), c: 100 + i })); assert.equal(regim(spy, dateOf(zi(250)), dateOf), 'sus'); assert.equal(regim(spy, dateOf(zi(100)), dateOf), null);
  const r = bilant([], zile(6 * 80, true)); assert.equal(r.regim.sus.verdict, 'tine'); assert.equal(r.regim.jos.verdict, 'tine');
});
test('I-649: clasamentul — primele 10 după „Long” față de media universului; „ordonează” doar după prag', () => {
  const zi30 = (n, bun) => Array.from({ length: n }, (_, i) => ({ asOf: dateOf(zi(i)), regim: 'sus', rows: Array.from({ length: 25 }, (_, k) => ({ s: 'S' + k, y: 1, p: [0.3, 0.4, 0.3 + k / 100], pr: [0.3, 0.4, 0.3], mom: [0.1, 0.8, 0.1], k: 1, pnl: (bun ? k / 10 : 0) + ((i * 7 + k * 3) % 5) / 10 })) }));
  assert.equal(bilant([], zi30(6 * 20, true)).clasament.verdict, 'in-proba');
  assert.equal(bilant([], zi30(6 * 40, true)).clasament.verdict, 'ordoneaza');
  assert.equal(bilant([], zi30(6 * 40, false)).clasament.verdict, 'nu-ordoneaza');
});
test('I-650: Holm pe două ținte — o țintă care ține o lasă pe cealaltă la α, altfel amândouă la α/2', async () => {
  const { bilantDoua } = await import('./clasificator-jurnal.mjs');
  const r = bilantDoua([], {}, dateOf); assert.equal(r.b5.alfa, 0.025); assert.equal(r.b20.alfa, 0.025); assert.equal(r.b20.verdict, 'in-proba');
});
test('bilanțul lunar: descriptiv, pe luna votului; clasamentele au Holm separat de ținte', async () => {
  const { lunar, bilantDoua } = await import('./clasificator-jurnal.mjs');
  const z = [{ asOf: '2026-10-20', rows: [{ s: 'A', y: 2, p: [0.1, 0.1, 0.8], pr: [0.3, 0.4, 0.3], mom: [0.1, 0.8, 0.1], pnl: 1 }] }, { asOf: '2026-11-03', rows: [{ s: 'A', y: 0, p: [0.8, 0.1, 0.1], pr: [0.3, 0.4, 0.3], mom: [0.1, 0.8, 0.1], pnl: -1 }] }];
  const l = lunar(z); assert.deepEqual(l.map((x) => x.luna), ['2026-10', '2026-11']); assert.ok(l[0].vsFrecvente > 0); assert.equal(l[0].clasament, null);
  const r = bilantDoua([], {}, dateOf); assert.equal(r.b5.clasament.alfa, 0.025); assert.equal(r.b20.clasament.alfa, 0.025);
});
