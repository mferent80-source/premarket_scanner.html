// Audit 14.10.2026 (🔴): garda de earnings bloca doar intrarea din ziua raportării, dar planul Desk-ului (stop 1,25 ATR, țintă 2R)
// se ține zile sau săptămâni ⇒ un candidat cu raportarea în 5 zile era „actionable” și planul traversa raportarea cu un stop pe care
// un gap îl sare. Acum: raportare în fereastra de 14 zile ⇒ candidatul rămâne vizibil, dar NU e actionable (WATCH) și spune de ce.
// Zilele se numără pe calendarul New York, nu pe ceasul local (la 23:30 ora României e încă azi la New York).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const now = Date.parse('2026-10-14T09:00:00Z');
function bars(symbol) {
  const stamps = []; for (let t = Date.parse('2026-10-13T14:00:00Z'); stamps.length < 240; t -= 86400000) if (![0, 6].includes(new Date(t).getUTCDay())) stamps.unshift(t);
  // urcare cu respirație (două zile +0,25, una −0,32): RSI ~ 61, trend aliniat, lipit de EMA21 ⇒ scor peste 68 când Governor e TRADE
  let c = 100; const out = stamps.map((t, i) => { c += i % 3 === 1 ? -.32 : .25; return { t, o: c - .1, h: c + .8, l: c - .8, c, v: i === 239 ? 1800000 : 1000000 }; });
  out.meta = { symbol, currency: 'USD', timezone: 'America/New_York', regularEnd: Date.parse('2026-10-14T20:00:00Z') }; return out;
}
function setup({ items = [], ok = true } = {}) {
  const nodes = {}, store = new Map(), reports = [], apeluri = [];
  const node = (id) => nodes[id] || (nodes[id] = { value: '', checked: false, innerHTML: '', textContent: '', disabled: false, hidden: false, dataset: {}, style: {}, title: '', className: '', classList: { toggle() {}, add() {}, remove() {} }, scrollIntoView() {} });
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const ctx = {
    Date: Clock, Intl, console, URLSearchParams, location: { search: '', origin: 'https://example.test' },
    document: { getElementById: node, querySelectorAll: () => [], addEventListener() {}, hidden: false },
    localStorage: { getItem: (k) => store.get(k) || null, setItem(k, v) { store.set(k, v); } }, setTimeout: () => 0, clearTimeout() {}, addEventListener() {},
    fetch: async () => { throw Error('fără robot în test'); },
    D: { fetchStock: async (sym) => bars(sym) }, MEB: { computeEarlyBird: () => ({ isConfirmed: false, signals: {} }) }, WL: { get: () => ['TEST'] },
    GV: { status: () => ({ verdict: 'TRADE', reasons: [] }) }, TTDecisionPanel: { set: (r) => reports.push(r) }, EL: { sectorOf: () => 'Technology', loadSectorMap: () => ({}) }, matchMedia: () => ({ matches: false }),
    EARN: { calendar: async (o) => { apeluri.push(o); return ok ? { ok: true, items, motiv: '' } : { ok: false, items: [], motiv: 'fără cheie' }; } },
  };
  ctx.window = ctx; ctx.parent = ctx; vm.createContext(ctx);
  for (const f of ['lib/indicators.js', 'lib/daily-series.js', 'lib/decision-verdict.js', 'lib/candidate-plan-handoff.js']) vm.runInContext(readFileSync(f, 'utf8'), ctx);
  const source = readFileSync('candidate-engine/engine.js', 'utf8');
  vm.runInContext(source.slice(0, source.lastIndexOf('  validateDeps(); bind();')) + 'bind();window.hooks={state,scan,render,currentItems};})();', ctx);
  node('universe').value = 'watchlist';
  return { ctx, node, store, reports, apeluri, hooks: ctx.hooks };
}
const ziNY = (plus) => { const d = new Date(now + plus * 86400000); return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); };

test('fara raportare in 14 zile: candidatul ramane actionable (garda nu schimba altceva) si calendarul e cerut cu TOATE raportarile', async () => {
  const f = setup({ items: [] }); await f.hooks.scan();
  const x = f.hooks.state.analyses.find((a) => a.mode === 'momentum');
  assert.ok(x && x.actionable === true, 'TEST (serie în urcare, RVOL 1,8) e actionable fără raportare');
  assert.match(x.reason, /fără earnings în 14z/);
  assert.equal(f.apeluri.length, 1); assert.equal(f.apeluri[0].zile, 14); assert.equal(f.apeluri[0].toate, true);
});

test('raportare in 5 zile: vizibil, dar NU actionable, stare WATCH, motivul spune ca planul ar traversa raportarea', async () => {
  const f = setup({ items: [{ symbol: 'TEST', date: ziNY(5), hour: 'amc', epsEstimate: 1 }] }); await f.hooks.scan();
  const x = f.hooks.state.analyses.find((a) => a.mode === 'momentum');
  assert.ok(x); assert.equal(x.eligible, true); assert.equal(x.actionable, false); assert.equal(x.state, 'WATCH');
  assert.match(x.reason, /earnings în 5z/); assert.match(x.reason, /traversa raportarea/);
  assert.equal(f.ctx.CandidatePlanHandoff.read(x).ok, false, 'Desk-ul nu primește plan pentru el');
});

test('I-618: candidatii momentum/reversal poarta faptele (EOD, trend, RS, RVOL, earnings) si randul le arata ca cipuri', async () => {
  const f = setup({ items: [{ symbol: 'TEST', date: ziNY(5), hour: 'amc', epsEstimate: 1 }] }); await f.hooks.scan();
  const x = f.hooks.state.analyses.find((a) => a.mode === 'momentum');
  assert.equal(x.fapte.map((p) => p.k).slice(0, 5).join(','), 'EOD,trend,RS,RVOL,earnings');
  assert.equal(x.fapte.find((p) => p.k === 'earnings').rol, 'block'); assert.match(x.fapte.find((p) => p.k === 'earnings').v, /5z/);
  assert.equal(x.fapte.find((p) => p.k === 'trend').rol, 'support');
  f.hooks.render(); assert.match(f.node('rows').innerHTML, /ce-chip/);
});

test('raportare maine / azi: blocat (BLOCKED), ca inainte', async () => {
  const f = setup({ items: [{ symbol: 'TEST', date: ziNY(1), hour: 'bmo', epsEstimate: 1 }] }); await f.hooks.scan();
  const x = f.hooks.state.analyses.find((a) => a.mode === 'momentum');
  assert.equal(x.actionable, false); assert.equal(x.state, 'BLOCKED'); assert.match(x.reason, /earnings în 1z/);
});

test('fara cheie Finnhub: candidatul spune „earnings neverificat” si NU e actionable (nu se cumpara pe o garda oarba)', async () => {
  const f = setup({ ok: false }); await f.hooks.scan();
  const x = f.hooks.state.analyses.find((a) => a.mode === 'momentum');
  assert.ok(x); assert.equal(x.actionable, false); assert.equal(x.state, 'WATCH'); assert.match(x.reason, /earnings neverificat/);
});
