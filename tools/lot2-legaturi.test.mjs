// 27.10.2026 — legăturile dintre loturile 2 (lăsate coordonatorului de lotul C pentru lotul A):
//  (1) registrul de incidente (tt_journal_incidente_v1) și relaxările programate ale limitelor (tt_governor_override_v1) se sincronizează între aparate,
//      cu unire pe id (un incident nou pe telefon nu șterge unul nou pe PC), și intră în copia locală a registrelor scrise de om;
//  (2) fișa zilei de pe server are rândul incidentelor, identic cu JournalIncidente.randFisa din Jurnal (o singură definiție, copiată cu test de echivalență).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { KEYS, validateValue, mergeRecord } from '../lib/cloud-sync-model.mjs';
import { incidenteRand, fisaZilei } from '../lib/cloud-monitor.mjs';

const ctx = () => { const c = { Date, JSON, Math, Number, String, Array, Object, Intl }; c.window = c; vm.createContext(c); vm.runInContext(readFileSync('lib/journal-incidente.js', 'utf8'), c); return c.JournalIncidente; };
const inc = (id, la, extra = {}) => ({ id, la, titlu: 'Robotul V1 a picat', gravitate: 'mare', ce: 'Ziua nu s-a notat în jurnal.', impact: '', cauza: '', masura: '', legatura: '', stare: 'deschis', notatLa: Date.parse(la), inchisLa: null, aparat: 'PC', actualizatLa: Date.parse(la), ...extra });
const ov = (id, extra = {}) => ({ id, cheia: 'maxLossPctDay', de: 2, la: 2.5, motiv: 'revizuire lunară', cerutLa: 1, intraLa: 86400001, expiraLa: 86400001 + 7 * 86400000, aparat: 'PC', anulatLa: null, ...extra });

test('cheile noi sunt sincronizate și validate (forma rea e refuzată)', () => {
  for (const k of ['tt_journal_incidente_v1', 'tt_governor_override_v1']) assert.ok(KEYS.includes(k), k);
  validateValue('tt_journal_incidente_v1', [inc('inc_1', '2026-10-27T10:00:00.000Z')]);
  validateValue('tt_governor_override_v1', [ov('ov_1')]);
  assert.throws(() => validateValue('tt_journal_incidente_v1', [{ titlu: 'fără id' }]), /invalid_value/);
  assert.throws(() => validateValue('tt_journal_incidente_v1', { nu: 'listă' }), /invalid_value/);
  assert.throws(() => validateValue('tt_governor_override_v1', [{ id: 'ov_x', cheia: 'maxLossPctDay' }]), /invalid_value/, 'fără ferestrele intraLa / expiraLa');
});

test('unire pe id: incidentele și relaxările noi de pe ambele aparate rămân toate', () => {
  const baza = [inc('inc_1', '2026-10-27T10:00:00.000Z')];
  const pc = [...baza, inc('inc_pc', '2026-10-27T11:00:00.000Z')], tel = [...baza, inc('inc_tel', '2026-10-27T12:00:00.000Z')];
  const m = mergeRecord('tt_journal_incidente_v1', baza, pc, tel);
  assert.equal(m.conflicts.length, 0); assert.deepEqual(m.value.map((x) => x.id).sort(), ['inc_1', 'inc_pc', 'inc_tel']);
  const inchis = mergeRecord('tt_journal_incidente_v1', baza, [inc('inc_1', '2026-10-27T10:00:00.000Z', { stare: 'inchis', masura: 'Rulare de rezervă dimineața.' })], baza);
  assert.equal(inchis.value[0].stare, 'inchis', 'închiderea făcută pe un singur aparat trece');
  const o = mergeRecord('tt_governor_override_v1', [], [ov('ov_pc')], [ov('ov_tel')]);
  assert.equal(o.conflicts.length, 0); assert.deepEqual(o.value.map((x) => x.id).sort(), ['ov_pc', 'ov_tel']);
});

test('copia locală dinaintea unei schimbări venite din cont ține și registrul de incidente și relaxările programate', () => {
  const s = readFileSync('app/cloud-sync.js', 'utf8'), h = /const HUMAN_KEYS=\[([^\]]*)\]/.exec(s);
  assert.ok(h, 'HUMAN_KEYS lipsește'); for (const k of ['tt_journal_incidente_v1', 'tt_governor_override_v1']) assert.ok(h[1].includes("'" + k + "'"), k);
});

test('rândul incidentelor din fișa zilei = JournalIncidente.randFisa din Jurnal, caz cu caz', () => {
  const J = ctx();
  const liste = [[], [inc('a', '2026-10-27T14:00:00.000Z')], [inc('a', '2026-10-20T14:00:00.000Z')], [inc('a', '2026-10-20T14:00:00.000Z', { stare: 'inchis', masura: 'gata acum' })],
    [inc('a', '2026-10-27T14:00:00.000Z'), inc('b', '2026-10-27T15:00:00.000Z', { titlu: 'Al doilea' }), inc('c', '2026-10-10T15:00:00.000Z', { stare: 'inchis', masura: 'reparat' })],
    [inc('a', '2026-10-28T02:00:00.000Z')] /* 22:00 NY, ziua 27 */, [inc('a', '2026-10-27T03:00:00.000Z')] /* 23:00 NY, ziua 26 */];
  for (const l of liste) for (const zi of ['2026-10-27', '2026-10-26']) assert.equal(incidenteRand(l, zi), J.randFisa(JSON.parse(JSON.stringify(l)), zi), JSON.stringify([l.map((x) => x.id + x.la + x.stare), zi]));
});

test('fișa zilei pune rândul incidentelor la final; fără registru citit nu se inventează nimic', () => {
  const baza = { scope: 'live:x', summary: { currency: 'EUR', totalValue: 10000 }, positions: [], ordine: [], now: Date.parse('2026-10-27T21:00:00Z') };
  const cu = fisaZilei({ ...baza, incidente: [inc('a', '2026-10-27T14:00:00.000Z')] });
  assert.match(cu.text, /Incidente: 1 nou azi \(Robotul V1 a picat\) · 1 deschis/); assert.equal(cu.incidente, 'Incidente: 1 nou azi (Robotul V1 a picat) · 1 deschis, cel mai vechi din 27.10.');
  const fara = fisaZilei(baza); assert.doesNotMatch(fara.text, /Incidente/); assert.equal(fara.incidente, null);
});
