// 19.10.2026 — revizia lotului: depunerile/retragerile Trading 212 importate (I-712) se puteau număra de două ori:
// importul recunoștea una pusă de mână doar în aceeași zi și ±1 % (dar suma în USD e la cursul de AZI), iar adăugarea de mână
// nu se uita deloc la cele importate ⇒ DD real de 12 % afișat 0 % (Governor lăsa tranzacțiile) sau DD fals de 16 %.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function lume(cash) {
  const store = new Map([['tt_trading212_cash_v1', JSON.stringify(cash)]]);
  const c = {console, JSON, Date, Math, Number, Intl, localStorage: {getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k)}};
  c.window = c; c.globalThis = c; vm.createContext(c);
  vm.runInContext(readFileSync(new URL('../lib/equity.js', import.meta.url), 'utf8'), c);
  return {c, store, ev: () => JSON.parse(store.get('tt_equity_events_v1') || '[]')};
}
const zi = 86400000, acum = Date.now();
const cash = (x) => ({live1: {environment: 'live', transactions: {items: [x]}}});
const retragere = {id: 'w1', type: 'WITHDRAW', amount: -1000, currency: 'EUR', date: new Date(acum - 2 * zi).toISOString()};

test('pusă de mână DUPĂ import (aceeași operație) ⇒ nu se adaugă a doua oară; omul află de ce', () => {
  const w = lume(cash(retragere));
  assert.equal(w.c.EQ.importBrokerFlows({fx: () => 1.16}).added, 1);
  const r = w.c.EQ.addCapitalEvent('withdraw', 1160, 'retragere');
  assert.ok(r && r.duplicateOf, 'trebuia recunoscută ca dublură a celei importate');
  assert.equal(w.ev().length, 1);
  assert.ok(w.c.EQ.addCapitalEvent('withdraw', 1160, 'chiar vreau', {force: true}), 'cu confirmare se poate adăuga');
});
test('pusă de mână ÎNAINTE de import, cu altă zi (±3) și curs diferit (±3 %) ⇒ importul o recunoaște', () => {
  const w = lume(cash(retragere));
  // o pune de mână cu o zi mai târziu, la cursul de atunci (1,13 față de 1,16 azi ⇒ −2,6 %)
  w.store.set('tt_equity_events_v1', JSON.stringify([{id: 'cap_x', kind: 'withdraw', amountUsd: 1130, ts: acum - zi, day: new Date(acum - zi).toISOString().slice(0, 10), note: ''}]));
  const r = w.c.EQ.importBrokerFlows({fx: () => 1.16});
  assert.equal(r.added, 0); assert.equal(r.matched, 1); assert.equal(w.ev().length, 1);
});
test('operații diferite rămân diferite (alt sens, altă sumă, la peste 3 zile)', () => {
  const w = lume(cash(retragere));
  w.store.set('tt_equity_events_v1', JSON.stringify([
    {id: 'a', kind: 'deposit', amountUsd: 1160, ts: acum - 2 * zi, day: new Date(acum - 2 * zi).toISOString().slice(0, 10)},
    {id: 'b', kind: 'withdraw', amountUsd: 600, ts: acum - 2 * zi, day: new Date(acum - 2 * zi).toISOString().slice(0, 10)},
    {id: 'c', kind: 'withdraw', amountUsd: 1160, ts: acum - 9 * zi, day: new Date(acum - 9 * zi).toISOString().slice(0, 10)}]));
  assert.equal(w.c.EQ.importBrokerFlows({fx: () => 1.16}).added, 1);
});
