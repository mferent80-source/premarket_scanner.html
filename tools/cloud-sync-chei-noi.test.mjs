// 27.10.2026 (lotul A, I-749 + contractele dintre loturi): cheile NOI din sincronizare —
//  · tt_trading212_orders_pending_v1 (ordinele în așteptare de la broker; pe aparatul pasiv „stop la broker” nu mai e mereu „necitit”): ultima citire câștigă (fetchedAt), forma din lib/t212-pending.js;
//  · tt_governor_oprire_v1 (kill switch-ul, scris de lotul E): cea mai nouă stare (la / rearmatLa) câștigă, fără conflicte;
//  · tt_governor_cfg_v1 (limitele Governor, FĂRĂ accountSize / _accountBasis — capitalul are cheia lui): ultima scriere câștigă;
//  · tt_governor_limite_jurnal_v1 (jurnalul schimbărilor de limite): unire pe ts + aparat + cheia (o salvare scrie mai multe rânduri cu același ts);
//  · tt_t212_cititori_v1 (I-748: cine a citit Trading 212 și când — detectarea a doi cititori): unire pe aparat, cea mai nouă citire.
// Plus: validarea mărimii (1 MB) se aplică DOAR la trimiterea în cont, nu la o scriere pur locală (auditul A [5]).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { KEYS, LAST_WRITE_WINS, mergeRecord, validateValue } from '../lib/cloud-sync-model.mjs';

const ORD = 'tt_trading212_orders_pending_v1', OPR = 'tt_governor_oprire_v1', CFG = 'tt_governor_cfg_v1', LIM = 'tt_governor_limite_jurnal_v1', CIT = 'tt_t212_cititori_v1';
function pending() { const c = { Date, JSON, Number, Math, Object, Array, String }; c.window = c; vm.createContext(c); vm.runInContext(readFileSync('lib/t212-pending.js', 'utf8'), c); return c.T212Pending; }
const ordin = (over = {}) => ({ id: '1', ticker: 'MU_US_EQ', type: 'STOP', side: 'SELL', quantity: 4, stopPrice: 90, limitPrice: null, status: 'NEW', timeValidity: 'GTC', createdAt: '2026-10-27T10:00:00Z', currency: 'USD', ...over });
const cont = (fetchedAt, items = [ordin()]) => ({ environment: 'live', items, fetchedAt });

test('cheile contractelor sunt în KEYS (și le anunță workerul prin supportedKeys)', () => {
  for (const k of [ORD, OPR, CFG, LIM, CIT]) assert.ok(KEYS.includes(k), k);
  assert.ok(LAST_WRITE_WINS.includes(CFG), 'limitele Governor: ultima scriere câștigă');
});

test('ordinele în așteptare: validatorul contului acceptă exact ce acceptă T212Pending.valid pe items (+ fetchedAt, environment, eroare)', () => {
  const P = pending();
  const cazuri = [[], [ordin()], [ordin({ quantity: null, stopPrice: null, limitPrice: null, type: null, side: null })], [ordin({ ticker: '' })], [ordin({ ticker: 'x'.repeat(65) })], [ordin({ quantity: 'patru' })], [ordin({ stopPrice: Infinity })], [ordin({ side: 'HOLD' })], [ordin({ type: 7 })], [null], ['text'], Array.from({ length: 501 }, (_, i) => ordin({ id: String(i) }))];
  for (const items of cazuri) {
    const asteptat = P.valid(items);
    let ok = true; try { validateValue(ORD, { 'live:abc': cont('2026-10-27T10:00:00Z', items) }); } catch { ok = false; }
    assert.equal(ok, asteptat, JSON.stringify(items).slice(0, 120));
  }
  assert.throws(() => validateValue(ORD, { 'live:abc': { environment: 'live', items: [ordin()], fetchedAt: 'ieri' } }), /invalid_value/, 'fetchedAt trebuie să fie o oră');
  assert.throws(() => validateValue(ORD, { '': cont('2026-10-27T10:00:00Z') }), /invalid_value/, 'contul (scope) nu poate fi gol');
  assert.throws(() => validateValue(ORD, [cont('2026-10-27T10:00:00Z')]), /invalid_value/, 'nu listă');
  // citirea picată rămâne scrisă (T212Pending.esuat): fetchedAt null + eroare {la, mesaj}
  assert.equal(validateValue(ORD, { 'live:abc': { environment: 'live', items: [], fetchedAt: null, eroare: { la: '2026-10-27T10:00:00Z', mesaj: 'rate_limited' } } }), true);
  assert.throws(() => validateValue(ORD, { 'live:abc': { environment: 'live', items: [], fetchedAt: null, eroare: { la: 'x', mesaj: 'rate_limited' } } }), /invalid_value/);
  // forma scrisă chiar de T212Pending.save trece
  const s = { getItem: () => null, setItem(k, v) { this.v = v; } };
  P.save(s, 'live:abc', 'live', [ordin()], '2026-10-27T10:00:00Z');
  assert.equal(validateValue(ORD, JSON.parse(s.v)), true);
});

test('ordinele în așteptare: pe fiecare cont cea mai nouă citire câștigă (fetchedAt al brokerului, nu ceasul aparatului); conturile se unesc; fără conflicte', () => {
  const local = { 'live:abc': cont('2026-10-27T10:00:00Z', [ordin({ stopPrice: 90 })]), 'live:zzz': cont('2026-10-27T09:00:00Z') };
  const remote = { 'live:abc': cont('2026-10-27T10:05:00Z', [ordin({ stopPrice: 91 })]), 'demo:q': cont('2026-10-27T08:00:00Z') };
  const m = mergeRecord(ORD, undefined, local, remote, { localAt: Date.parse('2026-10-27T12:00:00Z'), remoteAt: 0 });
  assert.deepEqual(m.conflicts, []);
  assert.equal(m.value['live:abc'].items[0].stopPrice, 91, 'citirea mai nouă (remote) câștigă chiar dacă aparatul local a scris mai târziu');
  assert.equal(m.value['live:zzz'].fetchedAt, '2026-10-27T09:00:00Z'); assert.equal(m.value['demo:q'].fetchedAt, '2026-10-27T08:00:00Z');
  const invers = mergeRecord(ORD, undefined, remote, local);
  assert.deepEqual(invers.value, m.value, 'unirea nu depinde de ordine');
  assert.deepEqual(mergeRecord(ORD, undefined, undefined, remote).value, remote);
  assert.deepEqual(mergeRecord(ORD, undefined, local, undefined).value, local);
  // o citire picată (fetchedAt null, doar eroare) nu bate o citire reușită
  const picata = { 'live:abc': { environment: 'live', items: [], fetchedAt: null, eroare: { la: '2026-10-27T11:00:00Z', mesaj: 'broker_timeout' } } };
  assert.equal(mergeRecord(ORD, undefined, picata, remote).value['live:abc'].items[0].stopPrice, 91);
});

test('kill switch (tt_governor_oprire_v1): forma contractului; cea mai nouă stare (la / rearmatLa) câștigă', () => {
  const activ = { activ: true, la: '2026-10-27T14:00:00Z', motiv: 'serie de pierderi', aparat: 'PC', ordineAnulate: [{ id: '7', ticker: 'MU_US_EQ', stopPrice: 90 }], rearmatLa: null, rearmatMotiv: null };
  const rearmat = { ...activ, activ: false, rearmatLa: '2026-10-27T16:00:00Z', rearmatMotiv: 'revăzut planul' };
  assert.equal(validateValue(OPR, activ), true); assert.equal(validateValue(OPR, rearmat), true);
  assert.throws(() => validateValue(OPR, { ...activ, activ: 'da' }), /invalid_value/);
  assert.throws(() => validateValue(OPR, { ...activ, la: 'azi' }), /invalid_value/);
  assert.throws(() => validateValue(OPR, { ...activ, ordineAnulate: [{ ticker: 7 }] }), /invalid_value/);
  assert.throws(() => validateValue(OPR, { ...activ, motiv: 'x'.repeat(2001) }), /invalid_value/);
  const m = mergeRecord(OPR, activ, activ, rearmat);
  assert.deepEqual(m.conflicts, []); assert.equal(m.value.activ, false, 're-armarea (mai nouă) câștigă');
  const iar = { ...activ, la: '2026-10-27T17:00:00Z', motiv: 'a doua oprire' };
  assert.equal(mergeRecord(OPR, rearmat, iar, rearmat).value.activ, true, 'o oprire nouă bate re-armarea veche');
  assert.equal(mergeRecord(OPR, undefined, undefined, activ).value, activ);
});

test('limitele Governor (tt_governor_cfg_v1): fără accountSize / _accountBasis în cont; ultima scriere câștigă la conflict, editările independente se combină', () => {
  const cfg = { maxLossPctDay: 2, maxTradesDay: 5, maxOpenPositions: 4, cooldownAfterLosses: 3, slippageEstPct: 0.05, tgOnHalt: true, tgOnRiskHalt: true, maxDdPctRolling: 10, ddRollingOn: true, maxLossPctWeek: 3, maxInstrumentPct: 20, maxTotalStopPct: 5, maxHeatPct: 4 };
  assert.equal(validateValue(CFG, cfg), true);
  assert.throws(() => validateValue(CFG, { ...cfg, accountSize: 10000 }), /invalid_value/, 'capitalul nu circulă prin limite');
  assert.throws(() => validateValue(CFG, { ...cfg, _accountBasis: 'manual' }), /invalid_value/);
  assert.throws(() => validateValue(CFG, { ...cfg, maxHeatPct: { x: 1 } }), /invalid_value/);
  assert.throws(() => validateValue(CFG, [cfg]), /invalid_value/);
  const base = cfg, local = { ...cfg, maxHeatPct: 3 }, remote = { ...cfg, maxTradesDay: 4 };
  const m = mergeRecord(CFG, base, local, remote);
  assert.deepEqual(m.conflicts, []); assert.equal(m.value.maxHeatPct, 3); assert.equal(m.value.maxTradesDay, 4);
  const c = mergeRecord(CFG, base, { ...cfg, maxHeatPct: 3 }, { ...cfg, maxHeatPct: 2 }, { localAt: 2000, remoteAt: 1000 });
  assert.deepEqual(c.conflicts, []); assert.equal(c.value.maxHeatPct, 3, 'aceeași limită schimbată pe ambele: cea mai nouă scriere');
  assert.equal(mergeRecord(CFG, base, { ...cfg, maxHeatPct: 3 }, { ...cfg, maxHeatPct: 2 }, { localAt: 1000, remoteAt: 2000 }).value.maxHeatPct, 2);
});

test('jurnalul limitelor (tt_governor_limite_jurnal_v1): rândurile se unesc pe ts + aparat + cheia, ordonate după ts, cel mult 500 (cele mai noi)', () => {
  const r = (ts, aparat, cheia, de = 1, la = 2) => ({ ts, aparat, cheia, de, la });
  assert.equal(validateValue(LIM, [r(1, 'PC', 'maxHeatPct')]), true);
  assert.throws(() => validateValue(LIM, { ts: 1 }), /invalid_value/);
  assert.throws(() => validateValue(LIM, [r('1', 'PC', 'maxHeatPct')]), /invalid_value/);
  assert.throws(() => validateValue(LIM, [r(1, '', 'maxHeatPct')]), /invalid_value/);
  assert.throws(() => validateValue(LIM, Array.from({ length: 501 }, (_, i) => r(i, 'PC', 'k'))), /invalid_value/);
  const local = [r(1, 'PC', 'maxHeatPct'), r(5, 'PC', 'maxTradesDay'), r(5, 'PC', 'maxOpenPositions')];
  const remote = [r(1, 'PC', 'maxHeatPct'), r(3, 'telefon', 'maxLossPctDay')];
  const m = mergeRecord(LIM, undefined, local, remote);
  assert.deepEqual(m.conflicts, []);
  assert.deepEqual(m.value.map((x) => x.ts + ':' + x.aparat + ':' + x.cheia), ['1:PC:maxHeatPct', '3:telefon:maxLossPctDay', '5:PC:maxOpenPositions', '5:PC:maxTradesDay']);
  assert.deepEqual(mergeRecord(LIM, undefined, remote, local).value, m.value, 'unirea nu depinde de ordine');
  const multe = Array.from({ length: 500 }, (_, i) => r(1000 + i, 'PC', 'k'));
  const peste = mergeRecord(LIM, undefined, multe, [r(5, 'telefon', 'k'), r(9999, 'telefon', 'k')]).value;
  assert.equal(peste.length, 500); assert.equal(peste[0].ts, 1001, 'cel mai vechi iese'); assert.equal(peste.at(-1).ts, 9999);
});

test('cititorii Trading 212 (tt_t212_cititori_v1): pe aparat, cea mai nouă citire; forma {aparat: {la, env}}', () => {
  assert.equal(validateValue(CIT, { PC: { la: '2026-10-27T10:00:00Z', env: 'live' } }), true);
  assert.throws(() => validateValue(CIT, { PC: { la: 'acum' } }), /invalid_value/);
  assert.throws(() => validateValue(CIT, { '': { la: '2026-10-27T10:00:00Z' } }), /invalid_value/);
  const m = mergeRecord(CIT, undefined, { PC: { la: '2026-10-27T10:00:00Z', env: 'live' } }, { PC: { la: '2026-10-27T09:00:00Z', env: 'live' }, telefon: { la: '2026-10-27T10:00:30Z', env: 'live' } });
  assert.deepEqual(m.conflicts, []); assert.equal(m.value.PC.la, '2026-10-27T10:00:00Z'); assert.equal(m.value.telefon.la, '2026-10-27T10:00:30Z');
});

test('limita de 1 MB se aplică doar la trimiterea în cont: o scriere pur locală (restaurarea copiei) nu pică pe record_too_large', () => {
  const mare = Array.from({ length: 30000 }, (_, i) => ({ id: 'x' + i, sym: 'AAPL', note: 'o execuție notată destul de lung ca să treacă de un megaoctet' }));
  assert.throws(() => validateValue('tt_journal_v1', mare), /record_too_large/);
  assert.equal(validateValue('tt_journal_v1', mare, { limita: false }), true);
  assert.throws(() => validateValue('tt_journal_v1', { nu: 'listă' }, { limita: false }), /invalid_value/, 'forma se verifică și fără limită');
});
