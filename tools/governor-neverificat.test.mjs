// I-612 (14.10.2026): Governor „TRADE” cu jurnalul gol și fără Trading 212 era confort fals — nu verificase nimic. Acum verdictul e
// „NEVERIFICAT” (cu motivul), iar scannerul ține candidații VIZIBILI, dar fără plan (BLOCKED), ca la HALTED.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function governor({ jurnal = [], broker = null, acct = null } = {}) {
  const store = new Map([['tt_journal_v1', JSON.stringify(jurnal)]]);
  const ctx = { console, Date, Intl, JSON, Math, Number, localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } };
  if (broker) ctx.T212Capital = { read: () => broker };
  if (acct) ctx.ACCT = acct;
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(readFileSync('lib/governor.js', 'utf8'), ctx);
  return ctx.GV;
}

test('jurnal gol + fara Trading 212 => NEVERIFICAT, cu motivul; canTrade false; eticheta nu e TRADE', () => {
  const GV = governor(); const s = GV.status();
  assert.equal(s.verdict, 'NEVERIFICAT'); assert.match(s.reasons.join(' '), /[Jj]urnalul manual e gol/); assert.match(s.reasons.join(' '), /Trading 212/);
  assert.equal(GV.canTrade(), false); assert.equal(GV.labelOf('NEVERIFICAT').text, 'NEVERIFICAT');
});

// 27.10.2026 (audit C 🟡): capitalul „de pornire” (ACCT.known() = false) nu e un capital știut ⇒ CAUTION cu motivul, nu TRADE tăcut pe 10.000
test('capital de pornire (ACCT.known false) => CAUTION cu motivul; capital scris de om => TRADE', () => {
  const rand = [{ id: 'a1', sym: 'AAPL', dir: 'long', entry: 100, exit: 105, size: 1, openTs: Date.now() - 86400000 * 3, closeTs: Date.now() - 86400000 * 2, status: 'closed' }];
  const nec = governor({ jurnal: rand, acct: { get: () => ({ value: 10000 }), known: () => false } }).status();
  assert.equal(nec.verdict, 'CAUTION'); assert.match(nec.reasons.join(' '), /Capital necunoscut.*10\.000/);
  const stiut = governor({ jurnal: rand, acct: { get: () => ({ value: 12670 }), known: () => true } }).status();
  assert.equal(stiut.verdict, 'TRADE'); assert.doesNotMatch(stiut.reasons.join(' '), /Capital necunoscut/);
  const vechi = governor({ jurnal: rand, acct: { get: () => ({ value: 12670 }) } }).status(); // ACCT fără known(): ca înainte
  assert.equal(vechi.verdict, 'TRADE');
});

test('cu un rand in jurnal => TRADE ca inainte; cu Trading 212 conectat si jurnal gol => verdictul brokerului', () => {
  const now = Date.now();
  const GV1 = governor({ jurnal: [{ id: 'a1', sym: 'AAPL', dir: 'long', entry: 100, exit: 105, size: 1, openTs: now - 86400000 * 3, closeTs: now - 86400000 * 2, status: 'closed' }] });
  assert.equal(GV1.status().verdict, 'TRADE');
  const GV2 = governor({ broker: { verdict: 'TRADE', reasons: [], state: 'ready', currency: 'USD', positions: 0, budgetLeft: 100, weekBudgetLeft: 300, totalStopRisk: 0, stopBudgetLeft: 100 } });
  assert.equal(GV2.status().verdict, 'TRADE');
  const GV3 = governor({ broker: { verdict: 'CAUTION', reasons: ['Buget consumat 80 %'], state: 'ready', currency: 'USD', positions: 1, budgetLeft: 20, weekBudgetLeft: 300, totalStopRisk: 0, stopBudgetLeft: 20 } });
  assert.equal(GV3.status().verdict, 'CAUTION');
});

test('scannerul: Governor NEVERIFICAT => candidatul ramane vizibil (eligible), fara plan (BLOCKED), cu motivul', async () => {
  const now = Date.parse('2026-10-14T09:00:00Z');
  const stamps = []; for (let t = Date.parse('2026-10-13T14:00:00Z'); stamps.length < 240; t -= 86400000) if (![0, 6].includes(new Date(t).getUTCDay())) stamps.unshift(t);
  let c = 100; const bars = stamps.map((t, i) => { c += i % 3 === 1 ? -.32 : .25; return { t, o: c - .1, h: c + .8, l: c - .8, c, v: i === 239 ? 1800000 : 1000000 }; });
  bars.meta = { symbol: 'TEST', currency: 'USD', timezone: 'America/New_York', regularEnd: Date.parse('2026-10-14T20:00:00Z') };
  const nodes = {}, store = new Map();
  const node = (id) => nodes[id] || (nodes[id] = { value: '', checked: false, innerHTML: '', textContent: '', disabled: false, hidden: false, dataset: {}, style: {}, title: '', className: '', classList: { toggle() {}, add() {}, remove() {} }, scrollIntoView() {} });
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const ctx = { Date: Clock, Intl, console, URLSearchParams, location: { search: '', origin: 'https://example.test' }, document: { getElementById: node, querySelectorAll: () => [], addEventListener() {}, hidden: false },
    localStorage: { getItem: (k) => store.get(k) || null, setItem(k, v) { store.set(k, v); } }, setTimeout: () => 0, clearTimeout() {}, addEventListener() {}, fetch: async () => { throw Error('nu'); },
    D: { fetchStock: async () => bars }, MEB: { computeEarlyBird: () => ({ isConfirmed: false, signals: {} }) }, WL: { get: () => ['TEST'] },
    GV: { status: () => ({ verdict: 'NEVERIFICAT', reasons: ['Jurnalul manual e gol și Trading 212 nu e conectat — limitele nu pot fi verificate'] }) },
    TTDecisionPanel: { set() {} }, EL: { sectorOf: () => 'Technology', loadSectorMap: () => ({}) }, matchMedia: () => ({ matches: false }), EARN: { calendar: async () => ({ ok: true, items: [] }) } };
  ctx.window = ctx; ctx.parent = ctx; vm.createContext(ctx);
  for (const f of ['lib/indicators.js', 'lib/daily-series.js', 'lib/decision-verdict.js', 'lib/candidate-plan-handoff.js']) vm.runInContext(readFileSync(f, 'utf8'), ctx);
  const source = readFileSync('candidate-engine/engine.js', 'utf8');
  vm.runInContext(source.slice(0, source.lastIndexOf('  validateDeps(); bind();')) + 'bind();window.hooks={state,scan};})();', ctx);
  node('universe').value = 'watchlist';
  await ctx.hooks.scan();
  const x = ctx.hooks.state.analyses.find((a) => a.mode === 'momentum');
  assert.ok(x, 'candidatul există'); assert.equal(x.eligible, true); assert.equal(x.actionable, false); assert.equal(x.state, 'BLOCKED'); assert.match(x.reason, /Jurnalul manual e gol/);
  assert.equal(ctx.hooks.state.momentum.length, 1, 'rămâne în clasament, pentru analiză');
  assert.equal(node('setupBtn').disabled, true);
});
