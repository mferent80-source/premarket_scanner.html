import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const NOW = Date.parse('2026-10-14T16:00:00Z');
const ACCOUNT = 'tt_account_size_v1';
const PORTFOLIO = 'tt_pf_account';
const GOVERNOR = 'tt_governor_cfg_v1';
const JOURNAL = 'tt_journal_v1';
const SNAPSHOTS = 'tt_equity_snapshots_v1';
const CAPITAL = 'tt_equity_events_v1';
const sources = ['journal', 'account', 'governor', 'equity'].map(name => ({
  name, source: readFileSync(new URL('../lib/' + name + '.js', import.meta.url), 'utf8')
}));

function fixture(seed = {}, at = NOW) {
  const store = new Map(Object.entries(seed).map(([key, value]) =>
    [key, typeof value === 'string' ? value : JSON.stringify(value)]));
  let now = at, context;
  const failures = [];
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const localStorage = {
    getItem: key => store.has(key) ? store.get(key) : null,
    setItem(key, value) {
      const index = failures.indexOf(key);
      if (index !== -1) {
        failures.splice(index, 1);
        throw new Error('Injected storage failure: ' + key);
      }
      store.set(key, String(value));
    },
    removeItem: key => store.delete(key)
  };
  function reload() {
    context = vm.createContext({Date: Clock, Intl, localStorage});
    for (const {name, source} of sources) vm.runInContext(source, context, {filename: 'lib/' + name + '.js'});
    return context;
  }
  reload();
  return {
    store,
    get ctx() { return context; },
    advance(ms = 1) { now += ms; return now; },
    setTime(ts) { now = ts; },
    reload,
    failOnce(key) { failures.push(key); },
    read(key) { return JSON.parse(store.get(key) || '[]'); },
    write(key, value) { store.set(key, JSON.stringify(value)); },
    appendTrade(row) { this.write(JOURNAL, this.read(JOURNAL).concat(row)); }
  };
}

function closedTrade(id, closeTs, pnl = 100) {
  return {id, sym: 'TEST', dir: 'long', entry: 100, exit: 100 + pnl / 10,
    size: 10, fees: 0, source: 'manual', closeTs};
}
function legacyCapital(id, ts, kind = 'deposit', amountUsd = 1000) {
  return {id, ts, day: new Date(ts).toISOString().slice(0, 10), kind, amountUsd};
}
function legacySnapshot(equity, ts) {
  return {equity, ts, day: new Date(ts).toISOString().slice(0, 10), note: 'broker total'};
}
function initialize(f, value = 10000) {
  assert.ok(f.ctx.ACCT.set(value));
  f.advance();
}
function assertAccount(f, value) {
  assert.equal(f.ctx.ACCT.get().value, value, 'canonical account');
  assert.equal(Number(f.store.get(PORTFOLIO)), value, 'Portfolio account');
  assert.equal(f.ctx.GV.cfg().accountSize, value, 'Governor account');
}
function captureCurrentSnapshot(f, equity) {
  const snapshot = f.ctx.EQ.addSnapshot(equity, 'current broker total');
  assert.ok(snapshot);
  // Journal's snapshot action also updates the current sizing account.
  assert.equal(f.ctx.ACCT.syncAll(snapshot.equity, 'snapshot'), true);
  return snapshot;
}

for (const [kind, expected] of [['deposit', 11000], ['withdraw', 9000]]) {
  test(kind + ' affects the current account and curve once, then deletion restores both', () => {
    const f = fixture();
    initialize(f);
    const event = f.ctx.EQ.addCapitalEvent(kind, 1000, 'correction');
    assert.ok(event);
    assertAccount(f, expected);
    assert.equal(f.ctx.EQ.curve().current, expected);
    assert.equal(f.ctx.EQ.removeCapitalEvent(event.ts), true);
    assertAccount(f, 10000);
    assert.equal(f.ctx.EQ.curve().current, 10000);
    assert.deepEqual(f.read(CAPITAL), []);
    assert.equal(f.ctx.EQ.removeCapitalEvent(event.ts), true);
    assertAccount(f, 10000);
  });
}

test('deleting multiple tracked events in either order preserves the remaining adjustments', () => {
  for (const order of [[0, 1], [1, 0]]) {
    const f = fixture();
    initialize(f);
    const deposit = f.ctx.EQ.addCapitalEvent('deposit', 1000);
    f.advance();
    const withdrawal = f.ctx.EQ.addCapitalEvent('withdraw', 300);
    const events = [deposit, withdrawal];
    assertAccount(f, 10700);
    assert.equal(f.ctx.EQ.removeCapitalEvent(events[order[0]].ts), true);
    const remaining = order[0] === 0 ? 9700 : 11000;
    assertAccount(f, remaining);
    assert.equal(f.ctx.EQ.curve().current, remaining);
    assert.equal(f.ctx.EQ.removeCapitalEvent(events[order[1]].ts), true);
    assertAccount(f, 10000);
    assert.equal(f.ctx.EQ.curve().current, 10000);
  }
});

test('events superseded by a changed manual account total do not reverse that total', () => {
  const f = fixture();
  initialize(f);
  const oldDeposit = f.ctx.EQ.addCapitalEvent('deposit', 1000);
  f.advance();
  assert.ok(f.ctx.ACCT.set(15000));
  f.advance();
  const newDeposit = f.ctx.EQ.addCapitalEvent('deposit', 200);
  assert.equal(f.ctx.EQ.removeCapitalEvent(oldDeposit.ts), true);
  assertAccount(f, 15200);
  assert.equal(f.ctx.EQ.curve().current, 15200);
  assert.equal(f.ctx.EQ.removeCapitalEvent(newDeposit.ts), true);
  assertAccount(f, 15000);
});

test('a settings save with unchanged accountSize preserves reversible capital adjustments', () => {
  const f = fixture();
  initialize(f);
  const deposit = f.ctx.EQ.addCapitalEvent('deposit', 1000);
  f.advance();
  assert.ok(f.ctx.GV.saveCfg({accountSize: 11000, maxTradesDay: 6}));
  assert.equal(f.ctx.GV.cfg().maxTradesDay, 6);
  assert.equal(f.ctx.EQ.removeCapitalEvent(deposit.ts), true);
  assertAccount(f, 10000);
  assert.equal(f.ctx.EQ.curve().current, 10000);
  assert.equal(f.ctx.GV.cfg().maxTradesDay, 6);
});

test('a current snapshot supersedes earlier adjustments while later capital remains reversible', () => {
  const f = fixture();
  initialize(f);
  const oldDeposit = f.ctx.EQ.addCapitalEvent('deposit', 1000);
  f.advance();
  captureCurrentSnapshot(f, 13000);
  f.advance();
  const newDeposit = f.ctx.EQ.addCapitalEvent('deposit', 200);
  assert.equal(f.ctx.EQ.removeCapitalEvent(oldDeposit.ts), true);
  assertAccount(f, 13200);
  assert.equal(f.ctx.EQ.curve().current, 13200);
  assert.equal(f.ctx.EQ.removeCapitalEvent(newDeposit.ts), true);
  assertAccount(f, 13000);
  assert.equal(f.ctx.EQ.curve().current, 13000);
});

test('a snapshot at an unchanged total still supersedes earlier capital adjustments', () => {
  const f = fixture();
  initialize(f);
  const deposit = f.ctx.EQ.addCapitalEvent('deposit', 1000);
  f.advance();
  captureCurrentSnapshot(f, 11000);
  assert.equal(f.ctx.EQ.removeCapitalEvent(deposit.ts), true);
  assertAccount(f, 11000);
  assert.equal(f.ctx.EQ.curve().current, 11000);
});

test('page reload and migration preserve the account anchor and reversible events', () => {
  const f = fixture();
  initialize(f);
  const deposit = f.ctx.EQ.addCapitalEvent('deposit', 1000);
  f.advance(1000);
  f.reload();
  f.ctx.ACCT.migrate();
  assertAccount(f, 11000);
  assert.equal(f.ctx.EQ.curve().current, 11000);
  assert.equal(f.ctx.EQ.removeCapitalEvent(deposit.ts), true);
  assertAccount(f, 10000);
  assert.equal(f.ctx.EQ.curve().current, 10000);
});

test('invalid and full or excessive withdrawals neither persist nor change the account', () => {
  const f = fixture();
  initialize(f);
  for (const amount of [0, -1, 'invalid', Infinity, 10000, 10001]) {
    assert.equal(f.ctx.EQ.addCapitalEvent('withdraw', amount), null);
    assertAccount(f, 10000);
    assert.deepEqual(f.read(CAPITAL), []);
    assert.equal(f.ctx.EQ.curve().current, 10000);
  }
});

test('an event storage failure leaves the account and existing event history intact', () => {
  const f = fixture();
  initialize(f);
  const existing = f.ctx.EQ.addCapitalEvent('deposit', 100);
  f.advance();
  const history = f.store.get(CAPITAL);
  f.failOnce(CAPITAL);
  assert.equal(f.ctx.EQ.addCapitalEvent('deposit', 1000), null);
  assert.equal(f.store.get(CAPITAL), history);
  assertAccount(f, 10100);
  assert.equal(f.ctx.EQ.removeCapitalEvent(existing.ts), true);
  assertAccount(f, 10000);
});

test('a failed account write rolls back event creation and all account copies', () => {
  for (const key of [GOVERNOR, ACCOUNT, PORTFOLIO]) {
    const f = fixture();
    initialize(f);
    const previous = [GOVERNOR, ACCOUNT, PORTFOLIO].map(k => f.store.get(k));
    f.failOnce(key);
    assert.equal(f.ctx.EQ.addCapitalEvent('deposit', 1000), null, key);
    assert.deepEqual(f.read(CAPITAL), []);
    assert.deepEqual([GOVERNOR, ACCOUNT, PORTFOLIO].map(k => f.store.get(k)), previous);
    assertAccount(f, 10000);
    assert.equal(f.ctx.EQ.curve().current, 10000);
  }
});

test('failed deletion writes preserve the event and its account adjustment', () => {
  for (const key of [CAPITAL, ACCOUNT, PORTFOLIO]) {
    const f = fixture();
    initialize(f);
    const deposit = f.ctx.EQ.addCapitalEvent('deposit', 1000);
    const history = f.store.get(CAPITAL);
    f.failOnce(key);
    assert.equal(f.ctx.EQ.removeCapitalEvent(deposit.ts), false, key);
    assert.equal(f.store.get(CAPITAL), history);
    assertAccount(f, 11000);
    assert.equal(f.ctx.EQ.curve().current, 11000);
    assert.equal(f.ctx.EQ.removeCapitalEvent(deposit.ts), true);
    assertAccount(f, 10000);
  }
});

test('deletion that would make the account nonpositive leaves both events intact', () => {
  const f = fixture();
  initialize(f, 1000);
  const deposit = f.ctx.EQ.addCapitalEvent('deposit', 1000);
  f.advance();
  assert.ok(f.ctx.EQ.addCapitalEvent('withdraw', 1500));
  const history = f.store.get(CAPITAL);
  assert.equal(f.ctx.EQ.removeCapitalEvent(deposit.ts), false);
  assert.equal(f.store.get(CAPITAL), history);
  assertAccount(f, 500);
  assert.equal(f.ctx.EQ.curve().current, 500);
});

test('an imported first snapshot excludes earlier, simultaneous and undated history without deleting it', () => {
  const start = NOW - 1000;
  const trades = [closedTrade('before', start - 1, 2000), closedTrade('at', start, 1000),
    closedTrade('after', start + 1, 100), closedTrade('undated', undefined, 500),
    closedTrade('invalid-time', null, 500)];
  const capital = [legacyCapital('old-cap', start - 1), legacyCapital('same-cap', start),
    legacyCapital('new-cap', start + 2, 'deposit', 500)];
  const f = fixture({[ACCOUNT]: '10600', [JOURNAL]: trades, [CAPITAL]: capital,
    [SNAPSHOTS]: [legacySnapshot(10000, start)]});
  const journalBefore = f.store.get(JOURNAL), capitalBefore = f.store.get(CAPITAL);
  const curve = f.ctx.EQ.curve();
  assert.equal(curve.start, 10000);
  assert.equal(curve.current, 10600);
  assert.deepEqual(Array.from(curve.points, p => p.kind), ['snapshot', 'trade', 'deposit']);
  assert.equal(f.ctx.EQ.realizedTotal(), 4100, 'historical journal statistics remain available');
  assert.equal(f.store.get(JOURNAL), journalBefore);
  assert.equal(f.store.get(CAPITAL), capitalBefore);
});

test('a dated historical opening snapshot replays only the later trades and cash flows', () => {
  const opening = NOW - 1000;
  const f = fixture({[ACCOUNT]: '12000',
    [JOURNAL]: [closedTrade('before-opening', opening - 1, 500), closedTrade('after-opening', opening + 100, 100)],
    [CAPITAL]: [legacyCapital('before-opening', opening - 1),
      legacyCapital('deposit', opening + 200), legacyCapital('withdrawal', opening + 300, 'withdraw', 200)]});
  const rec = f.ctx.EQ.addSnapshot(10000, 'opening total from broker report', {ts: opening});
  assert.ok(rec);
  assert.equal(rec.ts, opening);
  assert.equal(f.ctx.EQ.curve().start, 10000);
  assert.equal(f.ctx.EQ.curve().current, 10900);
  assert.equal(f.ctx.ACCT.get().value, 12000, 'historical opening total does not replace current sizing');
  f.reload();
  assert.equal(f.ctx.EQ.curve().current, 10900);
});

test('future or invalid historical snapshot dates do not alter saved snapshots', () => {
  const f = fixture();
  initialize(f);
  for (const ts of [NOW + 1000, 0, -1, NaN, '2026-10-01']) {
    assert.equal(f.ctx.EQ.addSnapshot(10000, 'invalid date', {ts}), null);
    assert.deepEqual(f.read(SNAPSHOTS), []);
  }
});

test('later observed snapshots reset the curve before subsequent trades and cash flows', () => {
  const start = NOW - 1000;
  const f = fixture({[ACCOUNT]: '11650',
    [SNAPSHOTS]: [legacySnapshot(10000, start), legacySnapshot(12000, start + 300)],
    [JOURNAL]: [closedTrade('before-second', start + 100, 200), closedTrade('after-second', start + 400, -150)],
    [CAPITAL]: [legacyCapital('before-second', start + 200), legacyCapital('after-second', start + 500, 'withdraw', 200)]});
  assert.deepEqual(Array.from(f.ctx.EQ.curve().points, p => p.equity),
    [10000, 10200, 11200, 12000, 11850, 11650]);
  assert.equal(f.ctx.EQ.curve().current, 11650);
});

test('a first snapshot separates trades and capital recorded before and after capture in the same millisecond', () => {
  const f = fixture();
  initialize(f);
  const at = NOW + 1;
  f.appendTrade(closedTrade('before-capture', at, 100));
  assert.ok(f.ctx.EQ.addCapitalEvent('deposit', 50));
  captureCurrentSnapshot(f, 10150);
  f.appendTrade(closedTrade('after-capture', at, 25));
  assert.ok(f.ctx.EQ.addCapitalEvent('deposit', 10));
  const curve = f.ctx.EQ.curve();
  assert.equal(curve.current, 10185);
  assert.deepEqual(Array.from(curve.points, p => p.equity), [10150, 10175, 10185]);
  assert.equal(curve.points.filter(p => p.tradeId === 'before-capture').length, 0);
});

test('a later snapshot includes earlier same-millisecond records and replays records captured afterward', () => {
  const f = fixture();
  initialize(f);
  captureCurrentSnapshot(f, 10000);
  const at = f.advance(100);
  f.appendTrade(closedTrade('before-later-snapshot', at, 100));
  assert.ok(f.ctx.EQ.addCapitalEvent('deposit', 50));
  captureCurrentSnapshot(f, 10150);
  f.appendTrade(closedTrade('after-later-snapshot', at, 25));
  assert.ok(f.ctx.EQ.addCapitalEvent('deposit', 10));
  const curve = f.ctx.EQ.curve();
  assert.equal(curve.current, 10185);
  assert.deepEqual(Array.from(curve.points, p => p.equity), [10000, 10100, 10150, 10150, 10175, 10185]);
});

for (const [kind, secondTotal] of [['deposit', 11000], ['withdraw', 9000]]) {
  test('same-millisecond snapshots bracket a ' + kind + ' before a later trade profit', () => {
    const f = fixture();
    initialize(f);
    captureCurrentSnapshot(f, 10000);
    const event = f.ctx.EQ.addCapitalEvent(kind, 1000);
    const second = captureCurrentSnapshot(f, secondTotal);
    f.appendTrade(closedTrade('after-second-capture', second.ts, 100));
    assert.equal(event.ts, second.ts);
    assert.equal(f.ctx.EQ.curve().current, secondTotal + 100);
    assert.deepEqual(Array.from(f.ctx.EQ.curve().points, p => p.kind),
      ['snapshot', kind, 'snapshot', 'trade']);
    f.reload();
    assert.equal(f.ctx.EQ.curve().current, secondTotal + 100);
  });
}

test('same-millisecond capital records are deleted together and all their adjustments are reversed', () => {
  const f = fixture();
  initialize(f);
  const deposit = f.ctx.EQ.addCapitalEvent('deposit', 1000);
  const withdrawal = f.ctx.EQ.addCapitalEvent('withdraw', 300);
  assert.equal(deposit.ts, withdrawal.ts);
  assert.notEqual(deposit.id, withdrawal.id);
  assertAccount(f, 10700);
  assert.equal(f.ctx.EQ.removeCapitalEvent(deposit.ts), true);
  assertAccount(f, 10000);
  assert.deepEqual(f.read(CAPITAL), []);
});

test('a dated current account anchor excludes existing history but includes later realized PnL', () => {
  const f = fixture({[ACCOUNT]: '11000',
    [JOURNAL]: [closedTrade('historical', NOW - 1, 1000)],
    [CAPITAL]: [legacyCapital('historical', NOW - 1)]});
  const journalBefore = f.store.get(JOURNAL), capitalBefore = f.store.get(CAPITAL);
  assert.equal(f.ctx.EQ.curve().current, 11000);
  const at = f.advance(100);
  f.appendTrade(closedTrade('future', at, 100));
  assert.equal(f.ctx.EQ.curve().current, 11100);
  assert.equal(f.ctx.ACCT.get().value, 11000, 'realized simulation remains separate from sizing');
  f.reload();
  f.ctx.ACCT.migrate();
  assert.equal(f.ctx.EQ.curve().current, 11100);
  assert.equal(f.store.get(CAPITAL), capitalBefore);
  assert.equal(f.read(JOURNAL)[0].id, JSON.parse(journalBefore)[0].id);
});

test('migration anchors the default account before its first later execution closes', () => {
  const f = fixture();
  f.ctx.ACCT.migrate();
  const at = f.advance(100);
  f.appendTrade(closedTrade('first-execution', at, 100));
  assert.equal(f.ctx.EQ.curve().start, 10000);
  assert.equal(f.ctx.EQ.curve().current, 10100);
  f.reload();
  f.ctx.ACCT.migrate();
  assert.equal(f.ctx.EQ.curve().current, 10100);
});

test('current account capture distinguishes existing and future records with the same timestamp', () => {
  const f = fixture({[JOURNAL]: [closedTrade('before-account', NOW, 100)],
    [CAPITAL]: [legacyCapital('before-account', NOW)]});
  assert.ok(f.ctx.ACCT.set(10000));
  f.appendTrade(closedTrade('after-account', NOW, 25));
  assert.ok(f.ctx.EQ.addCapitalEvent('deposit', 10));
  assert.equal(f.ctx.EQ.curve().current, 10035);
  assertAccount(f, 10010);
});

test('legacy capital deletion does not guess whether an earlier manual reset absorbed it', () => {
  const first = NOW - 1000, second = NOW - 500;
  const events = [legacyCapital('legacy-first', first), legacyCapital('legacy-second', second, 'deposit', 500)];
  const f = fixture({[ACCOUNT]: '11500', [CAPITAL]: events,
    tt_account_sync_ts: String(second), tt_account_sync_note: 'capital-deposit'});
  f.ctx.ACCT.migrate();
  assert.equal(f.ctx.EQ.curve().current, 11500);
  assert.equal(f.ctx.EQ.removeCapitalEvent(first), true);
  assertAccount(f, 11500);
  assert.deepEqual(f.read(CAPITAL), [events[1]]);
  assert.equal(f.ctx.EQ.curve().current, 11500);
});
