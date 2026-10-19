// 19.10.2026 — I-712: depunerile și retragerile din Trading 212 (tt_trading212_cash_v1) intră singure în Mișcări de capital, ca
// evenimente în USD; una pusă deja de mână (același sens, aceeași zi, suma ±1 %) nu se dublează. Curba și DD rămân doar pe rezultat:
// înainte, 12.670 → 5.393 după retrageri apărea ca DD 57,4 %.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const ACUM = Date.parse('2026-10-19T15:00:00Z'), ZI = 86400000;
const zi = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(t));
function lume(seed = {}) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [ACUM])); } static now() { return ACUM; } }
  const c = { console, JSON, Math, Number, Intl, Date: Clock, localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
  c.window = c; vm.createContext(c);
  for (const f of ['lib/account.js', 'lib/equity.js']) vm.runInContext(readFileSync(f, 'utf8'), c);
  return { c, store, events: () => JSON.parse(store.get('tt_equity_events_v1') || '[]') };
}
const cash = (items, env = 'live') => ({ 'live:1': { environment: env, transactions: { items, complete: true, fetchedAt: new Date(ACUM).toISOString() } } });
const iulie = Date.parse('2026-07-10T15:00:00Z');

test('retragerile din Trading 212 devin evenimente de capital în USD, iar DD-ul rămâne doar pe rezultat (nu 57,4 %)', () => {
  const w = lume({
    tt_equity_snapshots_v1: [{ equity: 12670, ts: iulie, day: zi(iulie), note: 'Trade212' }, { equity: 5393, ts: ACUM - 3600000, day: zi(ACUM - 3600000), note: 'Trading 212 automat' }],
    tt_trading212_cash_v1: cash([
      { id: 'w1', type: 'WITHDRAW', amount: -4000, currency: 'EUR', date: '2026-08-05T10:00:00Z' },
      { id: 'w2', type: 'WITHDRAW', amount: -2000, currency: 'EUR', date: '2026-09-15T10:00:00Z' },
      { id: 'd1', type: 'DIVIDEND', amount: 3, currency: 'EUR', date: '2026-09-16T10:00:00Z' }])
  });
  assert.ok(w.c.EQ.drawdownStats().currentDdPct > 57, 'starea de dinainte: retragerea arată ca pierdere');
  w.c.ACCT.saveBrokerFx('EUR', 1.1, '2026-10-17');
  assert.equal(typeof w.c.EQ.importBrokerFlows, 'function', 'importul lipsește');
  const r = w.c.EQ.importBrokerFlows();
  assert.equal(r.added, 2);
  const ev = w.events();
  assert.deepEqual(ev.map((e) => [e.kind, e.amountUsd, e.source]), [['withdraw', 4400, 't212'], ['withdraw', 2200, 't212']]);
  // 12.670 − 6.600 = 6.070 la ultima retragere; 5.393 acum ⇒ DD ≈ 11,2 % (rezultatul), nu 57,4 %
  const dd = w.c.EQ.drawdownStats().currentDdPct;
  assert.ok(Math.abs(dd - (1 - 5393 / 6070) * 100) < 0.05, 'DD = ' + dd);
  // a doua rulare nu dublează
  assert.equal(w.c.EQ.importBrokerFlows().added, 0); assert.equal(w.events().length, 2);
});

test('una pusă deja de mână (același sens, aceeași zi, ±1 %) nu se dublează; fără curs verificat se așteaptă', () => {
  const t = Date.parse('2026-09-15T10:00:00Z');
  const w = lume({ tt_equity_events_v1: [{ id: 'cap_m', kind: 'withdraw', amountUsd: 2190, ts: t + 3600000, day: zi(t + 3600000), note: 'manual' }],
    tt_trading212_cash_v1: cash([{ id: 'w2', type: 'WITHDRAW', amount: -2000, currency: 'EUR', date: new Date(t).toISOString() },
      { id: 'dep', type: 'DEPOSIT', amount: 500, currency: 'EUR', date: '2026-09-20T10:00:00Z' }]) });
  let r = w.c.EQ.importBrokerFlows();
  assert.equal(r.added, 0); assert.equal(r.noFx, 2, 'fără curs: nimic inventat');
  w.c.ACCT.saveBrokerFx('EUR', 1.1, '2026-10-17');
  r = w.c.EQ.importBrokerFlows();
  assert.equal(r.matched, 1); assert.equal(r.added, 1);
  assert.deepEqual(w.events().map((e) => [e.kind, e.amountUsd, e.source || 'manual']), [['withdraw', 2190, 'manual'], ['deposit', 550, 't212']]);
  // contul demo nu intră
  const demo = lume({ tt_trading212_cash_v1: cash([{ id: 'x', type: 'DEPOSIT', amount: 9, currency: 'USD', date: '2026-09-20T10:00:00Z' }], 'demo') });
  assert.equal(demo.c.EQ.importBrokerFlows().added, 0);
});

test('importul nu schimbă capitalul local, iar o operație ștearsă de mână nu se mai importă', () => {
  const w = lume({ tt_account_size_v1: '5393', tt_trading212_cash_v1: cash([{ id: 'w1', type: 'WITHDRAW', amount: -100, currency: 'USD', date: '2026-10-10T10:00:00Z' }]) });
  assert.equal(w.c.EQ.importBrokerFlows().added, 1);
  assert.equal(w.c.ACCT.get().value, 5393, 'capitalul îl dă Trading 212, nu se scade a doua oară');
  const e = w.events()[0];
  assert.equal(w.c.EQ.removeCapitalEvent(e.ts), true);
  assert.equal(w.c.EQ.importBrokerFlows().added, 0); assert.equal(w.events().length, 0);
});

test('o depunere pusă de mână nu mai ridică vârful: DD-ul existent rămâne același procent', () => {
  const w = lume();
  assert.ok(w.c.ACCT.set(10000));
  w.store.set('tt_journal_v1', JSON.stringify([{ id: 't1', sym: 'TEST', dir: 'long', entry: 100, exit: 90, size: 100, fees: 0, source: 'manual', closeTs: ACUM }]));
  assert.ok(Math.abs(w.c.EQ.drawdownStats().currentDdPct - 10) < 1e-9);
  // aceeași clipă cu baza contului: tranzacția și depunerea au venit după ea (nu sunt în „cutoff”)
  w.c.EQ.addCapitalEvent('deposit', 9000, 'transfer');
  assert.ok(Math.abs(w.c.EQ.drawdownStats().currentDdPct - 10) < 1e-6, 'DD ' + w.c.EQ.drawdownStats().currentDdPct);
});
