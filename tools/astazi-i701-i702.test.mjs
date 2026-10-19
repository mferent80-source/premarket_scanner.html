// 19.10.2026 — Astăzi (today/view.js):
//  I-701: rezultatele pozițiilor și seria pentru expunere se recitesc la o zi nouă de bursă și când se schimbă lista de poziții
//         (înainte: o singură dată pe viața paginii); poziția fără dată de rezultate e spusă explicit în verdict.
//  I-702: parcată în aplicație (TTShell ascuns) pagina nu mai citește / redesenează; verdictul și măsurătorile de coloane se refac doar la schimbare.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const NOW = Date.parse('2026-10-15T12:00:00Z'), DAY = 86400000;
const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
const poz = (t, value) => ({ ticker: t + '_US_EQ', quantity: 1, value, currency: 'EUR', unrealized: 0 });
const account = (positions) => ({ state: 'ready', scope: 'live-A', currency: 'EUR', total: 42000, available: 1000, invested: 41000, unrealized: 0, realized: 0, at: NOW, fresh: true, positions, points: [], newsSymbols: [], issues: [] });
const spy = { symbol: 'SPY', label: 'SPY', unit: 'USD', price: 500, changePct: 0.5, state: 'ready', asOf: '2026-10-14', source: 'Yahoo', points: [{ at: NOW - DAY, value: 498 }, { at: NOW, value: 500 }], indicators: {} };
const piata = () => ({ items: [spy], breadth: { state: 'error', points: [], reason: 'x' } });

function setup({ positions = [poz('MU', 5000), poz('AVGO', 3000)], earnings = (s) => ({ symbol: s, earnings: s === 'MU' ? { date: '2026-10-20' } : null }), shell = false } = {}) {
  const nodes = new Map(), listeners = new Map(), timers = new Map(), calls = { account: 0, market: 0, news: 0, compute: 0, events: [], expunere: 0, rects: 0, interval: [] };
  let timer = 0, current = account(positions), zi = '2026-10-14';
  const on = (k, fn) => { if (!listeners.has(k)) listeners.set(k, []); listeners.get(k).push(fn); }, fire = (k, e) => (listeners.get(k) || []).forEach((f) => f(e));
  const grid = { classList: { add() {}, remove() {} } };
  const element = (id) => { if (!nodes.has(id)) { const n = { id, textContent: '', innerHTML: '', className: '', hidden: false, dataset: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, fn) { on(id + ':' + t, fn); } };
    if (id === 'colStanga' || id === 'colDreapta') Object.assign(n, { parentNode: grid, appendChild() {}, getBoundingClientRect: () => { calls.rects++; return { bottom: 100 }; } });
    if (id === 'newsFeed') Object.assign(n, { children: [], querySelectorAll: () => [] });
    if (id === 'activityPanel' || id === 'activitySlot') n.parentNode = grid;
    nodes.set(id, n); } return nodes.get(id); };
  const doc = { hidden: false, getElementById: element, querySelectorAll: () => [], addEventListener: (t, fn) => on('document:' + t, fn), documentElement: { dataset: { theme: 'dark' } } };
  const parent = { postMessage() {} };
  const model = { account() { calls.account++; return structuredClone(current); }, market() { calls.market++; return Promise.resolve(piata()); }, news() { calls.news++; return Promise.resolve({ state: 'ready', items: [] }); }, activity() { return Promise.resolve({ state: 'ready', items: [] }); } };
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
  const MV = { symbolOf: (p) => /^([A-Z]+)_US_EQ$/.exec(p?.ticker || '')?.[1] || null, raportBreadth: async () => ({ r: 1 }), robotFile: async () => null, extraData: async () => null, regimDin: () => null,
    expunere: async () => { calls.expunere++; return { beta: 1, serii: null, grupuri: null }; }, compute: (x) => { calls.compute++; calls.last = x; return { x }; }, render: (v) => '<p>verdict ' + (v.x.earnings || []).map((e) => e.symbol).join(',') + '|' + (v.x.earningsNecunoscute || []).map((e) => e.symbol).join(',') + '</p>' };
  const c = { document: doc, Date: Clock, Intl, URL, URLSearchParams, Map, Set, Number, Promise, JSON, Math, Array, Object, String,
    location: { origin: 'https://example.test', href: 'https://example.test/project/today/?app=x', search: '?app=x' }, localStorage: { getItem: () => null, setItem() {} },
    addEventListener: (t, fn) => on('window:' + t, fn), setTimeout: (fn, ms) => { timers.set(++timer, { fn, ms }); return timer; }, clearTimeout: (id) => timers.delete(id), setInterval: (fn, ms) => { calls.interval.push({ fn, ms }); return calls.interval.length; }, clearInterval() {},
    TodayDashboardModel: { create: () => model }, ExchangeCalendar: { date: () => '2026-10-15', session: () => ({ state: 'open', open: 570, close: 960 }) },
    DailySeries: { expected: () => zi }, MarketVerdict: MV, HoldingsEvents: { fetchEvents: async (s) => { calls.events.push(s); return earnings(s); } }, FH_KEY: { get: () => '' } };
  c.window = c; c.parent = parent; vm.createContext(c);
  if (shell) vm.runInContext(readFileSync('lib/shell-visibility.js', 'utf8'), c);
  vm.runInContext(readFileSync('today/view.js', 'utf8'), c);
  const runTimers = (ms) => { for (const [id, t] of [...timers]) if (t.ms === ms) { timers.delete(id); t.fn(); } };
  const minut = async () => { for (const i of calls.interval.filter((x) => x.ms === 60000)) i.fn(); runTimers(150); await flush(); };
  return { c, calls, element, runTimers, minut, setZi: (z) => { zi = z; }, setPositions: (p) => { current = account(p); }, message: (data) => fire('window:message', { origin: c.location.origin, source: parent, data }), storage: (key) => fire('window:storage', { key }) };
}

test('I-701: rezultatele pozițiilor se recitesc la o zi NOUĂ de bursă (înainte: o dată pe viața paginii)', async () => {
  const s = setup(); await flush();
  assert.deepEqual([...s.calls.events].sort(), ['AVGO', 'MU']);
  await s.minut(); assert.equal(s.calls.events.length, 2, 'aceeași zi, aceleași poziții ⇒ fără recitire');
  s.setZi('2026-10-15'); await s.minut();
  assert.equal(s.calls.events.length, 4, 'zi nouă de bursă ⇒ recitire');
});

test('I-701: rezultatele și expunerea se recitesc când se schimbă lista de poziții', async () => {
  const s = setup(); await flush();
  const exp = s.calls.expunere; assert.ok(exp >= 1);
  s.setPositions([poz('MU', 5000), poz('AVGO', 3000), poz('NVDA', 2000)]); await s.minut();
  assert.ok(s.calls.events.includes('NVDA'), 'poziția nouă își primește data rezultatelor');
  assert.ok(s.calls.expunere > exp, 'expunerea se recalculează pe lista nouă');
  const n = s.calls.events.length; await s.minut(); assert.equal(s.calls.events.length, n);
});

test('I-701: poziția fără dată de rezultate ajunge în verdict ca „necunoscută”, nu dispare', async () => {
  const s = setup(); await flush();
  assert.deepEqual(s.calls.last.earnings.map((e) => e.symbol), ['MU']);
  assert.deepEqual(s.calls.last.earningsNecunoscute.map((e) => e.symbol), ['AVGO']);
  assert.match(s.calls.last.earningsNecunoscute[0].motiv, /Finnhub|dată/);
});

test('I-701: MarketVerdict.compute spune explicit „dată rezultate necunoscută” pe poziție', () => {
  const c = { URL, Intl, Date }; vm.createContext(c); vm.runInContext(readFileSync('lib/market-verdict.js', 'utf8'), c);
  const v = c.MarketVerdict.compute({ market: { items: [], breadth: { state: 'loading' } }, positions: [{ ticker: 'MU_US_EQ' }, { ticker: 'AVGO_US_EQ' }], earnings: [], earningsNecunoscute: [{ symbol: 'AVGO', motiv: 'fără cheie Finnhub' }], now: NOW });
  const t = v.pentruTine.join(' ');
  assert.match(t, /[Dd]ată rezultate necunoscută[^.]*AVGO/); assert.match(t, /fără cheie Finnhub/);
  assert.doesNotMatch(t, /Niciuna dintre pozițiile tale nu raportează/, 'nu se pretinde că nimeni nu raportează când o dată lipsește');
  const toate = c.MarketVerdict.compute({ market: { items: [], breadth: { state: 'loading' } }, positions: [{ ticker: 'MU_US_EQ' }], earnings: [], now: NOW });
  assert.match(toate.pentruTine.join(' '), /Niciuna dintre pozițiile tale nu raportează/);
});

test('I-702: la o reîmprospătare fără date noi verdictul nu se recalculează și coloanele nu se re-măsoară', async () => {
  const s = setup(); await flush(); await s.minut();
  const compute = s.calls.compute, rects = s.calls.rects;
  assert.ok(compute >= 1 && rects >= 1, 'primul desen calculează și măsoară');
  await s.minut(); await s.minut();
  assert.equal(s.calls.compute, compute, 'aceleași intrări ⇒ fără verdict refăcut');
  assert.equal(s.calls.rects, rects, 'conținut neschimbat ⇒ fără măsurători de coloane');
  assert.equal(s.calls.account, 4, 'datele se citesc totuși la fiecare minut');
});

test('I-702: parcată în aplicație (TTShell ascuns) Astăzi nu mai citește la minut / la sincronizare; la revenire citește o dată', async () => {
  const s = setup({ shell: true }); await flush();
  const n = s.calls.account; s.message({ ttShellVisible: false });
  await s.minut(); s.storage('tt_trading212_portfolio_v1'); s.runTimers(150); await flush();
  assert.equal(s.calls.account, n, 'ascunsă: nicio citire');
  s.message({ ttShellVisible: true }); s.runTimers(150); await flush();
  assert.equal(s.calls.account, n + 1, 'la revenire: o citire');
});

test('I-702: today/index.html încarcă lib/shell-visibility.js înaintea scripturilor paginii', () => {
  const html = readFileSync('today/index.html', 'utf8'), i = html.indexOf('../lib/shell-visibility.js?v=');
  assert.ok(i > 0); assert.ok(i < html.indexOf('src="view.js'));
});
