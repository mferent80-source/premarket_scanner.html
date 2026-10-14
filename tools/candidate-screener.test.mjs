// I-610 (14.10.2026): universul scannerului nu mai e doar lista de mână (US_CORE, 67 de nume); optiunea „SUA · screener” ia primele
// 200 de actiuni din lista datata a robotului (generated/univers-sua.json), plus lista de urmarit. I-611: volumul conteaza doar pe zi verde.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const now = Date.parse('2026-10-14T09:00:00Z');
function bars(symbol) {
  const stamps = []; for (let t = Date.parse('2026-10-13T14:00:00Z'); stamps.length < 240; t -= 86400000) if (![0, 6].includes(new Date(t).getUTCDay())) stamps.unshift(t);
  let c = 100; const out = stamps.map((t, i) => { c += i % 3 === 1 ? -.32 : .25; return { t, o: c - .1, h: c + .8, l: c - .8, c, v: i === 239 ? 1800000 : 1000000 }; });
  out.meta = { symbol, currency: 'USD', timezone: 'America/New_York', regularEnd: Date.parse('2026-10-14T20:00:00Z') }; return out;
}
function setup({ univers = 'screener', lista = Array.from({ length: 250 }, (_, i) => ({ s: 'U' + i, nume: 'U' + i, sector: 'Technology', cap: 1e10 - i })), screenerOk = true } = {}) {
  const nodes = {}, store = new Map(), cereri = [], fetchuri = [];
  const node = (id) => nodes[id] || (nodes[id] = { value: '', checked: false, innerHTML: '', textContent: '', disabled: false, hidden: false, dataset: {}, style: {}, title: '', className: '', classList: { toggle() {}, add() {}, remove() {} }, scrollIntoView() {} });
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const ctx = { Date: Clock, Intl, console, URLSearchParams, location: { search: '', origin: 'https://example.test' }, document: { getElementById: node, querySelectorAll: () => [], addEventListener() {}, hidden: false },
    localStorage: { getItem: (k) => store.get(k) || null, setItem(k, v) { store.set(k, v); } }, setTimeout: () => 0, clearTimeout() {}, addEventListener() {},
    fetch: async (url) => { fetchuri.push(String(url)); if (/univers-sua/.test(String(url))) return screenerOk ? { ok: true, json: async () => ({ la: '2026-10-14T06:00:00Z', n: lista.length, l: lista }) } : { ok: false, status: 404 }; return { ok: false, status: 404 }; },
    D: { fetchStock: async (sym) => { cereri.push(sym); return bars(sym); } }, MEB: { computeEarlyBird: () => ({ isConfirmed: false, signals: {} }) }, WL: { get: () => ['TEST'] },
    GV: { status: () => ({ verdict: 'TRADE', reasons: [] }) }, TTDecisionPanel: { set() {} }, EL: { sectorOf: () => 'Technology', loadSectorMap: () => ({}) }, matchMedia: () => ({ matches: false }), EARN: { calendar: async () => ({ ok: true, items: [] }) } };
  ctx.window = ctx; ctx.parent = ctx; vm.createContext(ctx);
  for (const f of ['lib/indicators.js', 'lib/daily-series.js', 'lib/decision-verdict.js', 'lib/candidate-plan-handoff.js']) vm.runInContext(readFileSync(f, 'utf8'), ctx);
  const source = readFileSync('candidate-engine/engine.js', 'utf8');
  vm.runInContext(source.slice(0, source.lastIndexOf('  validateDeps(); bind();')) + 'bind();window.hooks={state,scan,universe,momentumScore};})();', ctx);
  node('universe').value = univers;
  return { ctx, node, cereri, fetchuri, hooks: ctx.hooks };
}

test('universul „screener”: primele 200 din lista robotului + lista de urmarit; lista vine din generated/univers-sua.json', async () => {
  const f = setup(); await f.hooks.scan();
  assert.ok(f.fetchuri.some((u) => /^generated\/univers-sua\.json\?x=\d+$/.test(u)));
  const simboluri = f.cereri.filter((s) => s !== 'SPY' && s !== '^STOXX50E');
  assert.equal(simboluri.length, 201); assert.ok(simboluri.includes('U0') && simboluri.includes('U199') && simboluri.includes('TEST')); assert.ok(!simboluri.includes('U200'));
  assert.equal(f.hooks.state.scanned, 201); assert.match(f.node('ctxUniverse').textContent, /201/);
  assert.equal(f.hooks.state.screenerLa, '2026-10-14T06:00:00Z');
});

test('fara fisierul robotului, „screener” cade pe lista de mana si spune asta', async () => {
  const f = setup({ screenerOk: false }); await f.hooks.scan();
  const simboluri = f.cereri.filter((s) => s !== 'SPY' && s !== '^STOXX50E');
  assert.ok(simboluri.length >= 60 && simboluri.length < 100, 'US_CORE + watchlist'); assert.match(f.node('alert').textContent, /screener/i);
});

test('I-611: volumul primeste puncte doar pe zi verde', () => {
  const f = setup();
  const baza = { price: 101, ema21: 100, ema50: 98, ret5: 1, ret20: 3, rs20: 1, rvol: 1.6, rsi: 60, ext21: 1, avgDollarVol: 3e7 };
  const verde = f.hooks.momentumScore({ ...baza, dayChg: 1.5 }, { penalty: 0 }), rosie = f.hooks.momentumScore({ ...baza, dayChg: -1.5 }, { penalty: 0 });
  assert.equal(verde - rosie, 11 + 4, 'ziua verde ia 7 + 4 pentru volum și 4 pentru ziua pozitivă; ziua roșie niciunul');
});
