// 19.10.2026 — Portofoliul (holdings/holdings.js, holdings/workbench.js):
//  I-703 (b): analiza EOD se verifică DUPĂ încărcarea din IndexedDB și expiră la o zi nouă de bursă, nu la 30 de minute
//             (înainte: rescanare Yahoo pe fiecare poziție la fiecare deschidere).
//  I-702: parcat în aplicație (TTShell ascuns) Portofoliul nu mai redesenează / scanează / citește știri; istoricul execuțiilor o dată pe desen.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const NOW = Date.parse('2026-10-19T14:00:00Z'), EOD = '2026-10-16';
const flush = async () => { for (let i = 0; i < 40; i++) await new Promise((r) => setImmediate(r)); };
// un obiect „orice”: orice proprietate / apel întoarce tot el (modulele de afișare ale paginii nu contează aici)
function orice() { const f = function () { return p; }; const p = new Proxy(f, { get(_, k) { if (k === Symbol.toPrimitive) return () => ''; if (k === Symbol.iterator) return function* () {}; if (k === 'then') return undefined; if (k === 'length') return 0; return p; }, apply() { return p; }, set() { return true; }, has() { return true; } }); return p; }
const cu = (o) => new Proxy(o, { get: (tg, k) => (k in tg ? tg[k] : orice()) });
const MU = { ticker: 'MU_US_EQ', quantity: 5, currentPrice: 100, averagePrice: 95, instrumentCurrency: 'USD', currency: 'EUR', value: 400 };
const analiza = (asOf, fetchedAt) => ({ 'live-A|MU_US_EQ': { symbol: 'MU', currency: 'USD', benchmark: 'SPY', sectorBenchmark: null, fetchedAt, history: [], model: { asOf, timezone: 'America/New_York', closeMinutes: 960, price: 100, regime: { confirmed: null }, bars: [] } } });

function pagina({ salvat = null, vault = false, shell = false } = {}) {
  const store = new Map(), calls = { fetchStock: 0, events: 0, renders: 0 }, intervals = [], timers = new Map(), listeners = new Map();
  let t = 0, gata, incarcat = false;
  const on = (k, fn) => { if (!listeners.has(k)) listeners.set(k, []); listeners.get(k).push(fn); }, fire = (k, e) => (listeners.get(k) || []).forEach((f) => f(e));
  if (salvat && !vault) store.set('tt_holdings_analysis_v1', JSON.stringify(salvat));
  const el = () => orice();
  const document = new Proxy({ hidden: false, activeElement: null, getElementById: el, querySelector: () => null, querySelectorAll: () => [], addEventListener: (k, fn) => on('document:' + k, fn), body: { dataset: {} } }, { get: (tg, k) => (k in tg ? tg[k] : orice()) });
  const c = { Date: class extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }, JSON, Math, Number, String, Array, Object, Map, Set, Promise, URLSearchParams, Intl, console,
    document, location: { search: '', origin: 'https://example.test', href: 'https://example.test/holdings/' },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    sessionStorage: { getItem: () => null, setItem() {} },
    addEventListener: (k, fn) => on('window:' + k, fn), setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; }, clearInterval() {},
    setTimeout: (fn, ms) => { timers.set(++t, { fn, ms }); return t; }, clearTimeout: (id) => timers.delete(id),
    HoldingHandoff: cu({ resolve: () => ({ ok: true, target: null }), check: () => ({ ok: true }) }),
    T212Snapshot: cu({ read: () => ['live-A', { fetchedAt: new Date(NOW - 60000).toISOString(), summary: { currency: 'EUR', totalValue: 10000 }, positions: [MU] }] }),
    T212Daily: cu({ read: () => null, compare: () => null, markup: () => '' }),
    DailySeries: cu({ expected: () => EOD, date: () => EOD }),
    D: cu({ fetchStock: () => { calls.fetchStock++; return Promise.reject(Error('fără rețea în test')); } }),
    HoldingsEvents: cu({ fetchEvents: async (s) => { calls.events++; return { symbol: s, fetchedAt: NOW, news: [], earnings: null, errors: [] }; }, fresh: () => false, invalidate() {}, validDate: () => false, daysUntil: () => null }),
    HoldingsLayout: Object.assign(orice(), { openHolding: () => true }),
  };
  if (vault) c.TTAnalysisVault = { ready: () => new Promise((r) => { gata = () => { incarcat = true; if (salvat) store.set('tt_holdings_analysis_v1', JSON.stringify(salvat)); r(); }; }), storage: { getItem: (k) => (incarcat ? store.get(k) ?? null : null), setItem: (k, v) => store.set(k, v), flush: async () => {} }, state: () => ({}) };
  c.window = c; c.globalThis = c; c.parent = c; vm.createContext(c);
  vm.runInContext(readFileSync('lib/view-refresh.js', 'utf8'), c); c.ViewRefresh.patchList = () => {}; // cardurile nu se desenează în test
  if (shell) vm.runInContext(readFileSync('lib/shell-visibility.js', 'utf8'), c);
  const src = readFileSync('holdings/holdings.js', 'utf8');
  for (const name of new Set(src.match(/\b[A-Z][A-Za-z0-9]+\b/g))) if (!['TTAnalysisVault', 'TTShell'].includes(name) && !(name in c) && vm.runInContext('typeof ' + name, c) === 'undefined') c[name] = orice();
  const renderNow = c.HoldingsManagement; c.HoldingsManagement = new Proxy(renderNow, { get(tg, k) { if (k === 'render') return () => { calls.renders++; }; return tg[k]; } });
  vm.runInContext(src, c, { filename: 'holdings/holdings.js' });
  const minut = () => intervals.filter((x) => x.ms === 60000).forEach((x) => x.fn());
  const timere = () => { for (const [id, x] of [...timers]) { timers.delete(id); x.fn(); } };
  return { c, calls, minut, timere, gata: () => gata(), storage: (key) => fire('window:storage', { key }), shell: (v) => fire('window:message', { origin: c.location.origin, data: { ttShellVisible: v } }) };
}

test('I-703 (b): analiza EOD salvată acum 2 ore pentru sesiunea curentă NU se rescanează (înainte: expira la 30 de minute)', async () => {
  const p = pagina({ salvat: analiza(EOD, NOW - 2 * 3600000) }); await flush();
  assert.equal(p.calls.fetchStock, 0, 'fără descărcare Yahoo');
  p.minut(); await flush(); assert.equal(p.calls.fetchStock, 0, 'nici la minut');
});

test('I-703 (b): cu analiza în IndexedDB, verificarea se face DUPĂ încărcare — nu se rescanează tot ce era deja salvat', async () => {
  const p = pagina({ salvat: analiza(EOD, NOW - 2 * 3600000), vault: true }); await flush();
  assert.equal(p.calls.fetchStock, 0, 'nimic descărcat înainte de încărcare');
  p.gata(); await flush();
  assert.equal(p.calls.fetchStock, 0, 'după încărcare analiza e la zi ⇒ fără rescanare');
});

test('I-703 (b): la o zi NOUĂ de bursă analiza se refă (gardă: expirarea pe sesiune funcționează)', async () => {
  const p = pagina({ salvat: analiza('2026-10-15', NOW - 2 * 3600000) }); await flush();
  assert.ok(p.calls.fetchStock >= 1);
});

test('I-702: Portofoliul parcat (TTShell ascuns) nu redesenează, nu scanează, nu citește știri; la revenire o dată', async () => {
  const p = pagina({ salvat: analiza(EOD, NOW - 2 * 3600000), shell: true }); await flush(); p.timere(); await flush();
  const r0 = p.calls.renders, e0 = p.calls.events;
  p.shell(false);
  p.minut(); p.storage('tt_trading212_portfolio_v1'); p.storage('tt_trading212_portfolio_v1'); await flush(); p.timere(); await flush();
  assert.equal(p.calls.renders, r0, 'ascuns: niciun desen');
  assert.equal(p.calls.events, e0, 'ascuns: nicio citire de știri');
  p.shell(true); await flush(); p.timere(); await flush();
  assert.ok(p.calls.renders > r0, 'la revenire se desenează');
  assert.ok(p.calls.events > e0, 'la revenire știrile amânate se citesc');
});

test('I-702: reantrenarea automată (holdings/learning.js) nu pornește cât Portofoliul e parcat; la revenire pornește', async () => {
  const saved = new Map(), listeners = {}, p = { ticker: 'TEST_US_EQ', instrumentCurrency: 'USD' }; let loads = 0, shellMsg = null;
  const c = { setInterval: () => 1, document: { hidden: false, addEventListener: (n, fn) => (listeners[n] = fn), querySelectorAll: () => [] }, location: { origin: 'https://example.test' },
    addEventListener: (n, fn) => { if (n === 'message') shellMsg = fn; } };
  vm.createContext(c); for (const f of ['lib/shell-visibility.js', 'lib/holdings-forecast.js', 'lib/holdings-auto-learning.js']) vm.runInContext(readFileSync(f, 'utf8'), c);
  shellMsg({ origin: 'https://example.test', data: { ttShellVisible: false } });
  const ref = { symbol: 'TEST', currency: 'USD', asOf: '2026-10-02', timezone: 'America/New_York', closeMinutes: 960 };
  c.DailySeries = { expected: () => '2026-10-05' };
  c.HoldingsForecastUI = { restore: async () => {}, autoStorage: () => ({ getItem: (k) => saved.get(k), setItem: (k, v) => saved.set(k, v) }), learning: () => null, check: async () => ({}), checkSource() {}, capture() {}, captureVerdict() {}, probabilistic: () => null };
  c.HoldingsVerdict = { IDS: ['neural', 'boosting', 'hmm', 'isolation', 'quantile', 'garch', 'knn'], build: () => ({ available: 7, total: 7 }) };
  for (const n of ['Neural', 'HMM', 'Isolation', 'Quantile', 'Garch', 'KNN']) c['Holdings' + n + 'UI'] = { busy: () => false, refresh() {}, restore: async () => {}, inspect: () => ({}), run: async () => ({ state: 'ready' }), cancelManaged() {} };
  vm.runInContext(readFileSync('holdings/learning.js', 'utf8'), c);
  c.HoldingsAutoLearningUI.setContext({ scope: 'account', demo: false, positions: [p], symbol: () => 'TEST', model: () => null, reference: () => ref, refresh() {}, loadVerdict: async () => { loads++; return { ...ref, asOf: '2026-10-05', close: 100, kind: 'market', fingerprint: 'f' }; } });
  await flush(); await c.HoldingsAutoLearningUI.tick(); await flush();
  assert.equal(loads, 0, 'ascuns: nicio antrenare');
  shellMsg({ origin: 'https://example.test', data: { ttShellVisible: true } }); await flush();
  assert.equal(loads, 1, 'la revenire: antrenarea pornește');
});

test('I-702: holdings/index.html încarcă lib/shell-visibility.js înaintea scripturilor paginii', () => {
  const html = readFileSync('holdings/index.html', 'utf8'), i = html.indexOf('../lib/shell-visibility.js?v=');
  assert.ok(i > 0); assert.ok(i < html.indexOf('src="holdings.js') && i < html.indexOf('src="learning.js') && i < html.indexOf('src="workbench.js'));
});

test('I-702: Workbench citește istoricul execuțiilor o singură dată pe desen (înainte: N+2 citiri)', () => {
  let peeks = 0; const host = orice();
  const c = { JSON, Math, Number, String, Array, Object, Date, Promise, document: { getElementById: () => host, querySelector: () => null, querySelectorAll: () => [] }, localStorage: { getItem: () => null },
    T212FillsStore: { peek: () => { peeks++; return { data: { accounts: { 'live-A': { items: [] } } } }; } }, HoldingsWorkspace: { attention: () => [], calendar: () => [], timeline: () => [] }, PortfolioScenariosUI: { render() {} }, HoldingsAlerts: { reconcile: () => [], load: () => [], save() {} }, HoldingsEvents: {} };
  c.window = c; vm.createContext(c); vm.runInContext(readFileSync('holdings/workbench.js', 'utf8'), c);
  const positions = ['A', 'B', 'C', 'D', 'E'].map((t) => ({ ticker: t + '_US_EQ' }));
  const ctx = { positions, scope: 'live-A', demo: false, snapshot: { fetchedAt: new Date().toISOString(), summary: {} }, model: () => null, note: () => ({}), events: () => null, history: () => [], symbol: () => null };
  c.HoldingsWorkbench.render(ctx); c.HoldingsWorkbench.bind();
  assert.equal(peeks, 1, 'o citire pe desen, nu ' + peeks);
  c.HoldingsWorkbench.render(ctx); assert.equal(peeks, 2, 'desenul următor citește din nou (datele pot fi noi)');
});
