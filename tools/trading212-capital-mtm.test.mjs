// 20.10.2026 (I-722): bugetele de pierdere la VALOAREA DE PIAȚĂ — o zi cu pozițiile deschise în pierdere consumă bugetul chiar fără vânzări;
// reperul = ultima observație zilnică de dinaintea zilei NY de azi / de dinaintea lunii, fluxurile (depuneri / retrageri) scoase; fără reper ⇒ notă, nu zero.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const NOW = Date.parse('2026-10-08T15:00:00Z'), at = new Date(NOW).toISOString(); // joi; ziua NY 2026-10-08, săptămâna de luni 2026-10-05
function setup(seed = {}) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
  const c = { Date: Clock, Intl, console, localStorage: { getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, v) } }; c.window = c; vm.createContext(c);
  for (const f of ['lib/trading212-snapshot.js', 'lib/trading212-performance.js', 'lib/trading212-capital.js', 'lib/governor.js']) vm.runInContext(readFileSync(f, 'utf8'), c);
  return { R: c.T212Capital, c };
}
const obs = (iso, total) => ({ at: iso, total, currency: 'EUR' });
const tx = (items, fetchedAt = at) => ({ environment: 'live', transactions: { items, complete: true, fetchedAt, nextCursor: null, error: null } });
function input(total, extra = {}) {
  return { scope: 'active', snapshot: { environment: 'live', fetchedAt: at, summary: { currency: 'EUR', totalValue: total, available: total - 1000, reserved: 0, invested: 1000 }, positions: [{ ticker: 'TEST_US_EQ', quantity: 10, currentPrice: 100, instrumentCurrency: 'EUR', currency: 'EUR', value: 1000 }] },
    notes: { TEST_US_EQ: { stop: 95, stopCurrency: 'EUR' } }, history: { scope: 'active', currency: 'EUR', rows: [], complete: true, stale: false, state: 'ready' }, now: NOW,
    daily: [obs('2026-10-02T20:30:00Z', 10000), obs('2026-10-06T20:30:00Z', 10100), obs('2026-10-07T20:30:00Z', 10000)], cash: tx([]), ...extra };
}

test('pozițiile deschise pierd 2,5 % fără nicio vânzare ⇒ bugetul zilnic la valoarea de piață e epuizat ⇒ HALTED, cu reperul de ieri în motiv', () => {
  const { R } = setup(), r = R.build(input(9750));
  assert.equal(r.mtm.state, 'ready'); assert.equal(r.mtm.day, -250); assert.equal(r.mtm.fromDay, '2026-10-07T20:30:00Z'); assert.equal(r.todayPnl, 0);
  assert.equal(r.mtmBudgetLeft, 0); assert.equal(r.budgetLeft, 0); assert.equal(r.verdict, 'HALTED'); assert.match(r.reasons.join(' '), /epuizat la valoarea de piață.*07\.10/);
  assert.equal(r.mtm.week, -250); assert.equal(r.mtm.fromWeek, '2026-10-02T20:30:00Z');
});
test('bugetul rămas = minimul dintre realizat și MTM; depunerea de azi nu e câștig, retragerea nu e pierdere', () => {
  const { R } = setup();
  const dep = R.build(input(10400, { cash: tx([{ id: 'd1', type: 'DEPOSIT', amount: 500, currency: 'EUR', date: '2026-10-08T09:00:00Z' }]) }));
  assert.equal(dep.mtm.day, -100); assert.equal(dep.mtm.flowsDay, 500); assert.equal(dep.budgetLeft, 108, 'buget 2 % din 10.400 = 208 − 100 MTM (realizat 0 ⇒ 208)');
  assert.equal(dep.mtm.week, -100, 'față de vineri 10.000, cu depunerea scoasă'); assert.equal(dep.verdict, 'TRADE');
  const ret = R.build(input(9700, { cash: tx([{ id: 'w1', type: 'WITHDRAW', amount: 300, currency: 'EUR', date: '2026-10-08T09:00:00Z' }]) }));
  assert.equal(ret.mtm.day, 0); assert.equal(ret.budgetLeft, 194, '2 % din 9.700, neatins de MTM');
  const aproape = R.build(input(9840)); assert.equal(aproape.mtm.day, -160); assert.equal(aproape.verdict, 'CAUTION'); assert.match(aproape.reasons.join(' '), /75% din bugetul zilnic e consumat la valoarea de piață/);
  const dobanda = R.build(input(10050, { cash: tx([{ id: 'i1', type: 'INTEREST_ON_FREE_CASH', amount: 50, currency: 'EUR', date: '2026-10-08T09:00:00Z' }]) })); assert.equal(dobanda.mtm.day, 50, 'dobânda rămâne rezultat, nu flux extern');
});
test('fără observație de ieri, fără fluxuri citite după reper sau cu o operație neclasificată ⇒ „neverificat” ca notă, bugetul rămâne pe vânzări, verdictul neschimbat', () => {
  const { R } = setup();
  const fara = R.build(input(9750, { daily: [obs('2026-10-08T13:00:00Z', 9900)] })); assert.equal(fara.mtm.state, 'missing'); assert.match(fara.mtm.reason, /observația de ieri/); assert.equal(fara.budgetLeft, 195, '2 % din 9.750, doar pe vânzări'); assert.equal(fara.verdict, 'TRADE'); assert.match(fara.notes.join(' '), /nu se poate verifica/);
  const vechi = R.build(input(9750, { cash: tx([], '2026-10-07T10:00:00Z') })); assert.equal(vechi.mtm.state, 'missing'); assert.match(vechi.mtm.reason, /nu sunt citite după reper/); assert.equal(vechi.verdict, 'TRADE');
  const transfer = R.build(input(9750, { cash: tx([{ id: 't1', type: 'TRANSFER', amount: 100, currency: 'EUR', date: '2026-10-08T09:00:00Z' }]) })); assert.equal(transfer.mtm.state, 'missing'); assert.match(transfer.mtm.reason, /neclasificată/);
  const altaMoneda = R.build(input(9750, { daily: [obs('2026-10-07T20:30:00Z', 11000), { at: '2026-10-07T21:00:00Z', total: 100, currency: 'USD' }] })); assert.equal(altaMoneda.mtm.day, -1250, 'observația în altă monedă nu e reper');
  const faraSapt = R.build(input(9900, { daily: [obs('2026-10-07T20:30:00Z', 10000)] })); assert.equal(faraSapt.mtm.day, -100); assert.equal(faraSapt.mtm.week, null); assert.match(faraSapt.notes.join(' '), /săptămânii la valoarea de piață/);
});
test('read() dă reperele și fluxurile din stocare; Governor arată notele contului fără să schimbe verdictul și folosește bugetul MTM', () => {
  const x = input(9800), seed = { tt_trading212_portfolio_v1: { active: { ...x.snapshot, active: true } }, tt_trading212_fills_v1: { accounts: { active: { environment: 'live', items: [], complete: true, fetchedAt: at } } }, tt_holdings_theses_v1: { 'active|TEST_US_EQ': x.notes.TEST_US_EQ },
    tt_trading212_account_history_v1: { active: x.daily }, tt_trading212_cash_v1: { active: tx([]) } };
  const b = setup(seed), r = b.R.read();
  assert.equal(r.mtm.day, -200); assert.equal(r.budgetLeft, 0); assert.equal(r.verdict, 'HALTED');
  const s = b.c.GV.status(); assert.equal(s.verdict, 'HALTED'); assert.match(s.reasons.join(' '), /Invest: Bugetul de pierdere zilnic este epuizat la valoarea de piață/);
  const seed2 = { ...seed, tt_trading212_account_history_v1: { active: [obs('2026-10-08T13:00:00Z', 9900)] } }, b2 = setup(seed2), s2 = b2.c.GV.status();
  assert.equal(s2.verdict, 'TRADE'); assert.match(s2.reasons.join(' '), /Invest · notă: Pierderea la valoarea de piață nu se poate verifica/);
});
