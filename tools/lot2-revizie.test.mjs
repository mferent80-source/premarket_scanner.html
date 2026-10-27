// 27.10.2026 — reparațiile reviziei independente a lotului 2 (A–E), cu cazurile reproduse de revizor:
//  🔴1 „Oprește tot” (tt_governor_oprire_v1): unirea ține cont de bază — starea finală nu mai pierde în fața celei intermediare „în curs”, iar o oprire
//      nouă nu mai pierde în fața unei re-armări mai vechi de pe celălalt aparat (ceasuri decalate); la editări concurente câștigă oprirea (închis la eroare).
//  🔴2 ordinele în așteptare (tt_trading212_orders_pending_v1): o schimbare locală (ordin anulat scos, ordin pus adăugat) poartă `modificatLa`, iar unirea
//      ține cont de bază ⇒ ordinul anulat nu mai reapare din copia veche (și nu mai blochează repunerea stopului).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { mergeRecord, validateValue } from '../lib/cloud-sync-model.mjs';

const la = '2026-10-27T15:00:00.000Z';
const S0 = { activ: true, la, motiv: 'probă', aparat: 'PC', ordineAnulate: [], rearmatLa: null, rearmatMotiv: null, esuate: [], complet: false, eroare: 'în curs' };
const FIN = { ...S0, ordineAnulate: [{ id: '111', ticker: 'AAPL_US_EQ', stopPrice: 180 }], complet: true, eroare: null };
const FIN_ESUAT = { ...S0, ordineAnulate: [{ id: '111', ticker: 'AAPL_US_EQ', stopPrice: 180 }], esuate: [{ id: '222', ticker: 'MSFT_US_EQ', stopPrice: 400, error: 'broker_unavailable' }], eroare: 'unele ordine nu s-au putut anula' };
const K = 'tt_governor_oprire_v1';

test('🔴1 starea finală a opririi bate starea intermediară „în curs” (bază = intermediara urcată în cont)', () => {
  for (const fin of [FIN, FIN_ESUAT]) {
    assert.equal(mergeRecord(K, S0, fin, S0).value, fin, 'pe aparatul care a oprit');
    assert.equal(mergeRecord(K, S0, S0, fin).value, fin, 'pe celălalt aparat');
  }
});

test('🔴1 o oprire nouă cu ceasul în urmă nu pierde în fața unei re-armări mai vechi deja sincronizate', () => {
  const rearmat = { ...FIN, activ: false, rearmatLa: '2026-10-27T16:00:00.000Z', rearmatMotiv: 'probă lunară' }; // telefonul, ceas corect
  const noua = { ...S0, la: '2026-10-27T15:30:00.000Z', motiv: 'ordin greșit', aparat: 'PC', eroare: null, complet: true }; // PC, ceas în urmă cu 1 h
  const r = mergeRecord(K, rearmat, noua, rearmat);
  assert.equal(r.value.activ, true, 'oprirea scrisă după re-armarea văzută rămâne'); assert.equal(r.value.motiv, 'ordin greșit');
  assert.equal(mergeRecord(K, rearmat, rearmat, noua).value.activ, true, 'și pe telefon');
});

test('🔴1 editări concurente: câștigă oprirea activă; două opriri ⇒ cea mai nouă, apoi cea mai completă; două re-armări ⇒ cea mai nouă', () => {
  const baza = { ...FIN, activ: false, rearmatLa: '2026-10-27T10:00:00.000Z', rearmatMotiv: 'x' };
  const rearmaTel = { ...baza, rearmatLa: '2026-10-27T18:00:00.000Z', rearmatMotiv: 'telefon' }, opresteP = { ...FIN, la: '2026-10-27T17:00:00.000Z' };
  assert.equal(mergeRecord(K, baza, opresteP, rearmaTel).value.activ, true);
  assert.equal(mergeRecord(K, baza, rearmaTel, opresteP).value.activ, true);
  const a = { ...FIN, la: '2026-10-27T17:00:00.000Z' }, b = { ...FIN, la: '2026-10-27T17:05:00.000Z', motiv: 'al doilea' };
  assert.equal(mergeRecord(K, baza, a, b).value.motiv, 'al doilea');
  assert.equal(mergeRecord(K, undefined, S0, FIN).value, FIN, 'aceeași oră: finala bate „în curs”');
  const r1 = { ...baza, rearmatLa: '2026-10-27T18:00:00.000Z', rearmatMotiv: 'unu' }, r2 = { ...baza, rearmatLa: '2026-10-27T19:00:00.000Z', rearmatMotiv: 'doi' };
  assert.equal(mergeRecord(K, baza, r1, r2).value.rearmatMotiv, 'doi');
});

const at = '2026-10-27T14:59:00.000Z';
const ord = (id, ticker, stopPrice) => ({ id, ticker, type: 'STOP', side: 'SELL', quantity: 5, stopPrice, limitPrice: null });
const vechi = { 'live:x': { environment: 'live', fetchedAt: at, items: [ord('111', 'AAPL_US_EQ', 180), ord('333', 'NVDA_US_EQ', 120)] } };
const O = 'tt_trading212_orders_pending_v1';

test('🔴2 ordinul anulat scos din copie nu reapare la unire (bază = copia veche)', () => {
  for (const anulat of ['111', '333']) {
    const nou = { 'live:x': { ...vechi['live:x'], items: vechi['live:x'].items.filter((o) => o.id !== anulat), modificatLa: '2026-10-27T15:01:00.000Z' } };
    validateValue(O, nou);
    assert.deepEqual(mergeRecord(O, vechi, nou, vechi).value['live:x'].items.map((o) => o.id), vechi['live:x'].items.map((o) => o.id).filter((x) => x !== anulat), 'aparatul care a anulat');
    assert.deepEqual(mergeRecord(O, vechi, vechi, nou).value['live:x'].items.map((o) => o.id), nou['live:x'].items.map((o) => o.id), 'celălalt aparat');
  }
});

test('🔴2 concurent: o citire a brokerului mai nouă decât schimbarea locală o bate; o schimbare locală mai nouă bate citirea veche', () => {
  const local = { 'live:x': { ...vechi['live:x'], items: [ord('333', 'NVDA_US_EQ', 120)], modificatLa: '2026-10-27T15:01:00.000Z' } };
  const citireNoua = { 'live:x': { environment: 'live', fetchedAt: '2026-10-27T15:10:00.000Z', items: [ord('444', 'MU_US_EQ', 90)] } };
  assert.deepEqual(mergeRecord(O, vechi, local, citireNoua).value['live:x'].items.map((o) => o.id), ['444']);
  const citireVeche = { 'live:x': { environment: 'live', fetchedAt: '2026-10-27T15:00:30.000Z', items: [ord('111', 'AAPL_US_EQ', 180)] } };
  assert.deepEqual(mergeRecord(O, vechi, local, citireVeche).value['live:x'].items.map((o) => o.id), ['333']);
  assert.throws(() => validateValue(O, { 'live:x': { ...vechi['live:x'], modificatLa: 'nu-e-data' } }), /invalid_value/);
});

test('🔴2 copia locală: save cu modificatLa, adauga și pagina contului (scoateAnulate) îl scriu', () => {
  const store = new Map(), S = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  const c = { Date, JSON, Math, Number, String, Array, Object, Map, Set }; c.window = c; vm.createContext(c); vm.runInContext(readFileSync('lib/t212-pending.js', 'utf8'), c);
  const P = c.T212Pending;
  P.save(S, 'live:x', 'live', vechi['live:x'].items, at, { modificatLa: '2026-10-27T15:01:00.000Z' });
  assert.equal(P.read(S, 'live:x').modificatLa, '2026-10-27T15:01:00.000Z'); assert.equal(P.read(S, 'live:x').fetchedAt, at, 'ora citirii brokerului rămâne a citirii');
  P.adauga(S, 'live:x', 'live', { id: 9, ticker: 'MU_US_EQ', quantity: 1, stopPrice: 90 }, '2026-10-27T15:02:00.000Z');
  assert.equal(P.read(S, 'live:x').modificatLa, '2026-10-27T15:02:00.000Z');
  P.save(S, 'live:x', 'live', [], '2026-10-27T15:05:00.000Z'); assert.equal(P.read(S, 'live:x').modificatLa, undefined, 'o citire a brokerului nu poartă modificare locală');
  assert.match(readFileSync('broker/broker.js', 'utf8'), /function scoateAnulate[\s\S]{0,700}modificatLa/, 'scoateAnulate scrie modificatLa');
});
