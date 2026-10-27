// 27.10.2026 — revizia independentă a lotului F (🔴1, 🟡10): robotul V1 aducea prețurile doar pe 2 ani (scannerul cere '2y', reperele și
// SPY tot '2y') ⇒ după ~2 ani perioadele vechi ieșeau din fereastră: la 20 de sesiuni judecata nu putea veni niciodată, la 5 se reface pe o
// fereastră alunecătoare. Acum, ca la Top Long (19.10), toate simbolurile zilelor probei + SPY se reiau pe un interval care acoperă prima zi
// a probei + orizontul (2y → 5y → 10y), iar seriile de evaluare se taie la ultima sesiune încheiată (rularea de 10:15 UTC vede bursele UE
// deschise: bara de azi e intraday și nu intră).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planReluare } from './v1-jurnal.mjs';
import { intervalPentru, simboluriDeReluat, taieLaZi } from '../lib/proba-contract.mjs';

const jurnal = { zile: [
  { zi: '2026-10-16', v: 'experimental-1.0.0', r: [['OLD', 'n', 6, '2026-10-16', 'SPY']] },
  { zi: '2026-10-28', v: 'v1-x', r: [['AAPL', 'n', 6, '2026-10-28', 'SPY'], ['SAP.DE', 'm', 8, '2026-10-28', '^STOXX'], ['X', 'u', 0, null, null]] },
  { zi: '2026-10-29', v: 'v1-x', r: [['AAPL', 'n', 7, '2026-10-29', 'IVV']] }] };

test('intervalul acoperă prima zi a probei + orizontul (aceeași regulă ca Top Long, mutată în contractul comun)', () => {
  assert.equal(intervalPentru('2026-10-28', '2026-11-05'), '2y');
  assert.equal(intervalPentru('2026-10-28', '2028-06-01'), '2y');
  assert.equal(intervalPentru('2026-10-28', '2029-01-15'), '5y', 'după ~2 ani 2y nu mai acoperă prima zi');
  assert.equal(intervalPentru('2026-10-28', '2032-01-15'), '10y');
});
test('se reiau acțiunile și reperele zilelor versiunii de acum (nu ale probei vechi) + SPY, fără dubluri', () => {
  assert.deepEqual(simboluriDeReluat(jurnal, 'v1-x').sort(), ['AAPL', 'IVV', 'SAP.DE', 'SPY', '^STOXX'].sort(), 'rândul neverificabil (u) nu intră în probă');
  assert.ok(simboluriDeReluat(jurnal).includes('OLD'), 'fără versiune: toate zilele (forma Top Long din 19.10)');
});
test('planul reluării: cât 2y ajung, doar ce lipsește (scannerul a adus deja 2 ani); după 2 ani, TOATE simbolurile pe intervalul lung', () => {
  const p = planReluare({ jurnal, V: 'v1-x', azi: '2026-11-05', serii: { AAPL: [], 'SAP.DE': [] } });
  assert.equal(p.range, '2y'); assert.deepEqual(p.simboluri.sort(), ['IVV', 'SPY', '^STOXX'].sort());
  const lung = planReluare({ jurnal, V: 'v1-x', azi: '2029-03-01', serii: { AAPL: [], 'SAP.DE': [], SPY: [], IVV: [], '^STOXX': [] } });
  assert.equal(lung.range, '5y'); assert.equal(lung.simboluri.length, 5, 'pe 5 ani se reia tot, chiar dacă există seria de 2 ani');
  assert.equal(planReluare({ jurnal: { zile: [] }, V: 'v1-x', azi: '2026-11-05', serii: {} }).range, '2y', 'fără zile ale versiunii: ziua de azi');
});
test('seriile de evaluare se taie la ultima sesiune încheiată (ziua notată); restul rămâne neatins', () => {
  const s = { A: [{ d: '2026-10-28', c: 1 }, { d: '2026-10-29', c: 2 }], B: [{ d: '2026-10-28', c: 3 }] };
  const t = taieLaZi(s, '2026-10-28');
  assert.deepEqual(t.A, [{ d: '2026-10-28', c: 1 }]); assert.deepEqual(t.B, s.B); assert.equal(s.A.length, 2, 'originalul nu se schimbă');
  assert.deepEqual(taieLaZi(s, null), s, 'fără zi: nimic tăiat');
});
test('robotul V1 folosește planul reluării și seriile tăiate (nu mai evaluează pe barele brute de 2 ani)', () => {
  const src = readFileSync('tools/v1-jurnal.mjs', 'utf8'), main = src.slice(src.indexOf('async function main'));
  assert.match(main, /planReluare\(/); assert.match(main, /taieLaZi\(serii, rec\.zi\)/);
  assert.doesNotMatch(main, /range: '2y', interval: '1d'/, 'reperele nu mai sunt aduse fix pe 2 ani');
  const pm = readFileSync('tools/premarket-jurnal.mjs', 'utf8'), mainPm = pm.slice(pm.indexOf('async function main'));
  assert.match(mainPm, /taieLaZi\(serii, rec\.zi\)/, 'Top Long: aceeași tăietură (rularea de dimineață)');
});
