// 01.11.2026 — cele cinci reparații de bani: amprenta e în trading212-oprire.test.mjs;
// aici rămân re-armarea, fereastra NY, căldura la fill lipit de stop și poarta fără stop.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function load(files, extra = {}) {
  const c = { console, Date, Intl, Math, JSON, Number, localStorage: { getItem: () => null, setItem() {} }, ...extra };
  c.window = c;
  vm.createContext(c);
  for (const f of [].concat(files)) vm.runInContext(readFileSync(f, 'utf8'), c);
  return c;
}

test('calendarul Finnhub după miezul nopții UTC cere ziua New York, nu ziua UTC', async () => {
  const when = Date.parse('2026-11-02T00:30:00Z');
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [when])); } static now() { return when; } }
  let url = '';
  const c = load('lib/earnings.js', {
    Date: Clock,
    localStorage: { getItem: () => 'tok', setItem() {} },
    D: { fetchJSON: async (u) => { url = String(u); return { earningsCalendar: [] }; } }
  });
  assert.equal(c.EARN.ziNY(when), '2026-11-01');
  assert.equal(c.EARN.acoperaZiua('2026-11-02', new Date(when)), false);
  assert.equal(c.EARN.acoperaZiua('2026-11-01', new Date(when)), true);
  assert.equal(c.EARN.acoperaZiua(undefined, new Date(when)), true);
  const r = await c.EARN.calendar({ zile: 14 });
  assert.equal(r.ok, true); assert.equal(r.from, '2026-11-01'); assert.equal(r.to, '2026-11-15'); assert.equal(r.acoperaAzi, true);
  assert.match(url, /from=2026-11-01/); assert.doesNotMatch(url, /from=2026-11-02/);
});

test('simbol US lipsă dintr-o fereastră care a sărit ziua New York e blocat; fără from rămâne liber', () => {
  const I = load('lib/idee-proprie.js').TTIdeeProprie;
  const now = Date.parse('2026-11-02T00:30:00Z');
  const sarit = I.earnings({ ok: true, from: '2026-11-02', items: [{ symbol: 'AAPL', date: '2026-11-02' }] }, 'MSFT', now);
  assert.equal(sarit.blocat, true); assert.match(sarit.text, /sărit ziua New York/);
  const liber = I.earnings({ ok: true, items: [{ symbol: 'AAPL', date: '2026-11-02' }] }, 'MSFT', now);
  assert.equal(liber.blocat, false); assert.match(liber.text, /fără raportări/);
  const motor = readFileSync('candidate-engine/engine.js', 'utf8');
  assert.match(motor, /earningsFerestaSarita/);
  assert.match(motor, /fereastra a sărit ziua/);
  assert.match(motor, /acoperaZiua\(cal\.from\)/);
});

test('fill lipit de stop păstrează riscul salvat în expunere și în căldură; fill-ul din testul vechi rămâne 49', () => {
  const c = load(['lib/trade-plans.js', 'lib/caldura-portofoliu.js']);
  const T = c.TradePlans, K = c.TTCaldura;
  const cand = { symbol: 'MSFT', mode: 'momentum', currency: 'USD', actionable: true, entryLow: 200, entryHigh: 200, stop: 194, target: 212, ts: Date.now(), sourceDate: '2026-11-01', sourceTimezone: 'America/New_York', score: 80 };
  const p = T.create(cand, 10000, 0.5, { id: 'm' });
  assert.equal(p.shares, 8); assert.equal(p.risk, 48);
  const lipit = T.transition(p, 'trigger', { fillEntry: 194.01, allowed: true });
  assert.ok(lipit); assert.equal(T.riscDeclansat(lipit), 48); assert.equal(T.exposure([lipit]).risk, 48);
  assert.equal(K.riscDeschis({ contUsd: 100000, plafonPct: 4, plans: [lipit] }).planuriUsd, T.exposure([lipit]).risk);
  const x = { symbol: 'FICTIV', mode: 'momentum', currency: 'USD', actionable: true, entryLow: 100, entryHigh: 102, stop: 95, target: 116, ts: Date.now(), sourceDate: '2026-10-02', sourceTimezone: 'America/New_York', score: 80 };
  const vechi = T.transition(T.create(x, 10000, 0.5, { id: 'a' }), 'trigger', { fillEntry: 102, allowed: true });
  assert.equal(T.exposure([vechi]).risk, 49);
  const inchis = T.transition(T.transition(T.create({ ...x, ts: Date.now() }, 10000, 0.5, { id: 'b' }), 'trigger', { fillEntry: 101, allowed: true }), 'close', { exit: 110, fees: 2 });
  assert.equal(inchis.pnl, 61); assert.equal(inchis.rResult, 61 / 42);
  const desk = readFileSync('desk/index.html', 'utf8');
  assert.equal(desk.includes('entryLow:p.stop'), false);
  assert.equal(desk.includes('entryLow:p.entryLow'), true);
});

test('poarta blochează fără confirmare când există un deschis fără stop; stopul de partea greșită nu intră ca zero', () => {
  const store = new Map();
  const ctx = { console, Date, Intl, Math, JSON, Number, localStorage: { getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, v) } };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['journal', 'equity', 'governor', 'capital-desk']) vm.runInContext(readFileSync('lib/' + f + '.js', 'utf8'), ctx);
  assert.ok(ctx.JR.add({ sym: 'AAPL', entry: 100, size: 10, exit: null }));
  const gol = ctx.CD.canAddRisk(40);
  assert.equal(gol.blocheaza, true); assert.equal(gol.halt, true); assert.equal(gol.ok, false);
  assert.match(gol.reasons.join(' '), /fără stop/);
  const curat = { console, Date, Intl, Math, JSON, Number, localStorage: { getItem: (k) => store.get('b:' + k) || null, setItem: (k, v) => store.set('b:' + k, v) } };
  curat.window = curat; vm.createContext(curat);
  for (const f of ['journal', 'equity', 'governor', 'capital-desk']) vm.runInContext(readFileSync('lib/' + f + '.js', 'utf8'), curat);
  assert.ok(curat.JR.add({ sym: 'AAPL', entry: 100, size: 10, exit: null, slAtEntry: 95 }));
  assert.equal(curat.CD.canAddRisk(40).blocheaza, false);
  store.set('tt_journal_v1', JSON.stringify([{ id: 'j1', sym: 'AAPL', dir: 'long', entry: 100, exit: null, size: 10, status: 'open', slAtEntry: 105, fees: 0 }]));
  const pf = ctx.CD.portfolioStatic();
  assert.equal(pf.noSl, 1); assert.equal(pf.totRisk, 0); assert.equal(Number.isNaN(pf.totRisk), false);
  assert.equal(ctx.CD.canAddRisk(10).blocheaza, true);
  const jurnal = readFileSync('journal/index.html', 'utf8');
  assert.match(jurnal, /gate\.blocheaza/);
  assert.match(jurnal, /Poziție deschisă fără stop/);
  assert.match(jurnal, /Re-armarea e blocată/);
  assert.equal(jurnal.includes('entryN * sizeN * 0.01'), false);
});
