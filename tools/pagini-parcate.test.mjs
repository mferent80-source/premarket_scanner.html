// 19.10.2026 — I-702 (viteză / pagini parcate) pe Long & Reversal, Planuri, Piață și istoricul de 5 ani.
// - Long & Reversal rescana la fiecare deschidere (`setTimeout(scan,400)`) chiar cu rezultate de 2 minute; acum doar peste 30 de minute
//   (aceeași regulă ca scanarea ascunsă a aplicației), iar dacă aplicația scanează chiar atunci în fundal, pagina o așteaptă.
// - Planuri făcea `render()` complet la 30 s și `autoScan.start()` chiar parcată ⇒ TTShell + desen doar la schimbare.
// - Piață parcată lucra la 60 s și la fiecare `storage` ⇒ nimic cât e ascunsă, o recitire la revenire.
// - SPY / simbolul pe 5 ani se cereau fără cache la fiecare deschidere ⇒ o dată pe sesiune de bursă (memorie + IndexedDB).
// - Planuri încărca 49 de scripturi la pornire; clasificatorul (5 fișiere, ~78 KB) se încarcă după primul desen.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { boot, flush, html as deskHtml } from './desk-boot.mjs';

// ── Long & Reversal (candidate-engine/engine.js), fișierul întreg, ca în pagină ──
const NOW = Date.parse('2026-10-09T09:00:00Z');
function bars(symbol) {
  const t = []; for (let x = Date.parse('2026-10-08T14:00:00Z'); t.length < 240; x -= 86400000) if (![0, 6].includes(new Date(x).getUTCDay())) t.unshift(x);
  const out = t.map((x, i) => { const c = 100 + i * 0.1; return { t: x, o: c - 0.1, h: c + 0.8, l: c - 0.8, c, v: 1e6 }; });
  out.meta = { symbol, currency: 'USD', timezone: 'America/New_York', regularEnd: Date.parse('2026-10-09T20:00:00Z') }; return out;
}
function scanner({ saved = null, shellRunning = false } = {}) {
  const nodes = {}, store = new Map(), events = {}, calls = [], timers = [], shell = { running: shellRunning };
  if (saved) store.set('ce_results_v2', JSON.stringify(saved));
  const node = (id) => nodes[id] || (nodes[id] = { value: id === 'universe' ? 'watchlist' : '', checked: false, innerHTML: '', textContent: '', disabled: false, hidden: false, dataset: {}, style: {}, options: [], classList: { toggle() {}, add() {}, remove() {} }, scrollIntoView() {} });
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
  const ctx = { Date: Clock, Intl, console, URLSearchParams, location: { search: '', origin: 'https://example.test' }, document: { getElementById: node, querySelectorAll: () => [], addEventListener() {}, hidden: false },
    localStorage: { getItem: (k) => store.get(k) || null, setItem(k, v) { store.set(k, v); } }, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {}, setInterval() {}, fetch: undefined,
    addEventListener: (n, fn) => (events[n] || (events[n] = [])).push(fn), D: { fetchStock: async (s) => { calls.push(s); return bars(s); } },
    MEB: { computeEarlyBird: () => ({ isConfirmed: true, signals: {} }) }, WL: { get: () => ['TEST'] }, GV: { status: () => ({ verdict: 'TRADE', reasons: [] }) }, TTDecisionPanel: { set() {} }, TTEntryAuto: { observe() {} },
    EL: { sectorOf: () => 'Technology' }, matchMedia: () => ({ matches: false }) };
  ctx.window = ctx; ctx.parent = { ttBackgroundScan: { state: () => ({ running: shell.running }) } }; vm.createContext(ctx);
  for (const f of ['lib/indicators.js', 'lib/daily-series.js', 'lib/decision-verdict.js', 'lib/candidate-plan-handoff.js']) vm.runInContext(readFileSync(f, 'utf8'), ctx);
  vm.runInContext(readFileSync('candidate-engine/engine.js', 'utf8'), ctx);
  const run = async (max = 2000) => { for (const t of timers.splice(0)) if (t.ms <= max) await t.fn(); await flush(); };
  return { ctx, node, store, calls, timers, shell, run, emit: (n, e) => (events[n] || []).forEach((f) => f(e)) };
}
const cache = (updatedAt) => ({ universeKey: JSON.stringify(['watchlist', ['TEST']]), updatedAt, momentum: [], reversal: [], analyses: [], scannedCount: 1, verifiedCount: 1, failures: [], benchmarks: [] });

test('I-702 Long & Reversal: deschisă cu rezultate de 2 minute nu rescanează; peste 30 de minute, da', async () => {
  const p = scanner({ saved: cache(NOW - 2 * 60000) }); await p.run();
  assert.equal(p.calls.length, 0, 'cereri la deschidere: ' + p.calls.length);
  const v = scanner({ saved: cache(NOW - 31 * 60000) }); await v.run();
  assert.ok(v.calls.includes('TEST'), 'copie de 31 de minute ⇒ scanare');
  const g = scanner(); await g.run(); assert.ok(g.calls.includes('TEST'), 'fără copie ⇒ scanare');
});
test('I-702 Long & Reversal: dacă scanarea ascunsă a aplicației rulează, pagina o așteaptă și ia copia ei, nu o ia de la zero', async () => {
  const p = scanner({ saved: cache(NOW - 40 * 60000), shellRunning: true }); await p.run();
  assert.equal(p.calls.length, 0, 'nu pornește a doua scanare');
  assert.match(p.node('nextScan').textContent, /aștept scanarea pornită de aplicație/);
  p.store.set('ce_results_v2', JSON.stringify(cache(NOW))); p.emit('storage', { key: 'ce_results_v2' }); p.shell.running = false; await p.run();
  assert.equal(p.calls.length, 0, 'copia aplicației a sosit ⇒ fără scanare'); assert.equal(p.node('updatedAt').textContent, 'actualizat acum', 'pagina a luat copia aplicației');
  // aplicația se oprește fără copie nouă ⇒ pagina scanează singură
  const q = scanner({ saved: cache(NOW - 40 * 60000), shellRunning: true }); await q.run(); q.shell.running = false; await q.run();
  assert.ok(q.calls.includes('TEST'));
});

// ── Planuri (desk/index.html) ──
test('I-702 Planuri: ceasul de 30 s nu redesenează pagina când nimic nu s-a schimbat; redesenează când prospețimea se schimbă', async () => {
  const b = boot(); await flush();
  const tick = b.intervals.filter((i) => i.ms === 30000).at(-1).fn;   // ultimul: al paginii (modulele încărcate înainte au ceasurile lor)
  b.nodes.signalRows.innerHTML = 'NEATINS'; tick();
  assert.equal(b.nodes.signalRows.innerHTML, 'NEATINS', 'redesenare fără schimbare');
  b.ceas.now += 11 * 60000; tick();
  assert.notEqual(b.nodes.signalRows.innerHTML, 'NEATINS', 'scanarea a trecut din FRESH în AGED ⇒ redesenare');
  assert.equal(b.nodes.scanAge.textContent, '11 min', 'vârsta se actualizează la fiecare pas');
});
test('I-702 Planuri: parcată nu desenează și nu pornește scanarea automată; la revenire, o dată', async () => {
  let porniri = 0;
  const b = boot({ demo: false, seed: { ce_results_v2: { momentum: [], reversal: [], analyses: [], updatedAt: Date.parse('2026-10-08T04:15:00Z') } }, files: ['lib/shell-visibility.js'], extra: { TTDeskAutoScan: { create: () => ({ start: () => { porniri++; return false; } }) } } }); await flush();
  const n0 = porniri, shell = (v) => b.emit('message', { origin: 'https://desk.test', data: { ttShellVisible: v } });
  shell(false); b.ceas.now += 31 * 60000; b.nodes.signalRows.innerHTML = 'NEATINS';
  for (const i of b.intervals.filter((x) => x.ms === 30000 || x.ms === 300000)) i.fn();
  assert.equal(porniri, n0, 'autoScan.start cât e parcată'); assert.equal(b.nodes.signalRows.innerHTML, 'NEATINS');
  shell(true);
  assert.ok(porniri > n0, 'la revenire verifică scanarea'); assert.notEqual(b.nodes.signalRows.innerHTML, 'NEATINS', 'la revenire redesenează (datele s-au învechit)');
});
test('I-702 Planuri: clasificatorul (5 fișiere) nu mai e în capul paginii; se încarcă după primul desen, în ordine, și se leagă la sosire', async () => {
  const lista = ['holdings-neural.js', 'holdings-neural-evaluation.js', 'holdings-bars.js', 'holdings-classifier.js', 'desk-classifier.js'];
  for (const f of lista) assert.doesNotMatch(deskHtml, new RegExp('<script src="\\.\\./lib/' + f.replace(/\./g, '\\.') + '\\?'), f + ' încă e încărcat la pornire');
  let legat = 0, robot = 0;
  const b = boot({ demo: false }); await flush();
  const s = b.appended.filter((e) => e.tag === 'script');
  assert.deepEqual(s.map((e) => e.src.replace(/^\.\.\/lib\//, '').replace(/\?.*$/, '')), lista); assert.ok(s.every((e) => e.async === false));
  b.c.TTDeskClassifier = { onChange: () => { legat++; }, loadRobot: () => { robot++; }, view: (x) => x, setList() {}, ensure() {}, chip: () => '' };
  s.at(-1).onload(); s.at(-1).onload();
  assert.equal(legat, 1); assert.equal(robot, 1, 'robotul de noapte se citește o dată');
});

// ── Piață (scanner-verdicts/view.js) ──
function documentStub() {
  const nodes = new Map(), document = { activeElement: null, hidden: false, addEventListener() {} };
  const node = (id) => { if (!nodes.has(id)) nodes.set(id, { id, value: id === 'universeMode' ? 'shared' : id === 'primaryMode' ? 'all' : id === 'independentFilter' ? 'all' : '', hidden: false, disabled: false, textContent: '', className: '', innerHTML: '', dataset: {}, checked: false, options: [], selectedOptions: [{ textContent: '' }], addEventListener() {}, querySelectorAll: () => [], scrollIntoView() {}, focus() {} }); return nodes.get(id); };
  document.getElementById = node; document.querySelectorAll = () => []; return { node, document };
}
test('I-702 Piață: parcată nu recitește (nici la 60 s, nici la `storage`); la revenire recitește o dată', () => {
  let now = Date.parse('2026-10-14T10:00:00Z');
  const Clock = class extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } };
  const values = new Map(), intervals = [], listeners = {}, dom = documentStub();
  const c = { localStorage: { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) }, console, Intl, Date: Clock, URLSearchParams, AbortController, setInterval: (fn, ms) => intervals.push({ fn, ms }), clearInterval() {}, location: { origin: 'https://example.test', search: '', href: '' }, document: dom.document, addEventListener: (n, f) => (listeners[n] || (listeners[n] = [])).push(f) };
  c.window = c; c.parent = c; vm.createContext(c);
  for (const f of ['lib/exchange-calendar.js', 'lib/daily-series.js', 'lib/independent-scanner.js', 'lib/scanner-results.js', 'lib/shell-visibility.js']) vm.runInContext(readFileSync(f, 'utf8'), c);
  const R = c.ScannerResults, sd = c.DailySeries.expected(now, 'America/New_York', 960);
  values.set(R.PRIMARY_KEY, JSON.stringify({ momentum: [{ symbol: 'AAPL', mode: 'momentum', state: 'ARMED', price: 100, currency: 'USD', sourceDate: sd, sourceTimezone: 'America/New_York', sourceCloseMinutes: 960, ts: now, actionable: true, score: 80, reason: 'x' }], reversal: [], analyses: [], updatedAt: now, universeKey: JSON.stringify(['core', ['AAPL']]), scannedCount: 1, verifiedCount: 1, failures: [] }));
  vm.runInContext(readFileSync('scanner-verdicts/view.js', 'utf8'), c);
  const fresh = () => dom.node('primaryFresh').textContent, inainte = fresh();
  const shell = (v) => (listeners.message || []).forEach((f) => f({ origin: 'https://example.test', source: c.parent, data: { ttShellVisible: v } }));
  shell(false); now += 31 * 60000;
  for (const i of intervals.filter((x) => x.ms === 60000)) i.fn();
  (listeners.storage || []).forEach((f) => f({ key: R.PRIMARY_KEY }));
  assert.equal(fresh(), inainte, 'parcată: nicio recitire');
  shell(true); assert.notEqual(fresh(), inainte, 'la revenire: recitește');
});

// ── istoricul de 5 ani: o dată pe sesiune ──
function cacheLume() {
  let now = Date.parse('2026-10-08T15:00:00Z'); const calls = [];
  const Clock = class extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } };
  const fetchStock = async (s, o) => { calls.push(s + ':' + o.range + ':' + o.ttl); const t = []; for (let x = now - 400 * 86400000; x <= now; x += 86400000) { const d = new Date(x); if (d.getUTCDay() % 6) t.push(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 13, 30)); }
    const b = t.map((x) => ({ t: x, o: 100, h: 101, l: 99, c: 100, v: 1 })); Object.defineProperty(b, 'meta', { value: Object.freeze({ symbol: s, currency: 'USD', timezone: 'America/New_York', regularEnd: Date.UTC(2026, 9, Number(new Date(now).toISOString().slice(8, 10)), 20) }), enumerable: false }); return b; };
  const c = { console, Date: Clock, Intl, Promise, Map, JSON, D: { fetchStock } }; c.window = c; vm.createContext(c);
  for (const f of ['lib/daily-series.js', 'lib/desk-daily-cache.js']) vm.runInContext(readFileSync(f, 'utf8'), c);
  return { C: c.TTDeskDailyCache, DS: c.DailySeries, calls, treci: (ms) => { now += ms; }, set: (iso) => { now = Date.parse(iso); } };
}
test('I-702: istoricul de 5 ani se cere o dată pe sesiune de bursă; bara zilei în curs nu devine „închisă” din cache', async () => {
  const w = cacheLume();
  const a = await w.C.fetchStock('SPY', { range: '5y', interval: '1d' }), b = await w.C.fetchStock('SPY', { range: '5y', interval: '1d' });
  assert.equal(w.calls.length, 1); assert.equal(w.calls[0], 'SPY:5y:0'); assert.equal(b.meta.symbol, 'SPY'); assert.equal(w.DS.read(b, 'SPY').asOf, '2026-10-07');
  w.treci(4 * 3600000); await w.C.fetchStock('SPY', { range: '5y', interval: '1d' }); assert.equal(w.calls.length, 1, 'aceeași sesiune așteptată ⇒ din cache');
  w.set('2026-10-08T20:30:00Z'); const c = await w.C.fetchStock('SPY', { range: '5y', interval: '1d' });
  assert.equal(w.calls.length, 2, 'după închidere: sesiune nouă ⇒ cerere nouă'); assert.equal(w.DS.read(c, 'SPY').asOf, '2026-10-08');
  await w.C.fetchStock('QQQ', { range: '5y', interval: '1d' }); assert.equal(w.calls.length, 3, 'alt simbol ⇒ altă cheie');
});
test('I-702: SPY (randamentul contului), validarea și clasificatorul trec prin cache-ul zilnic', () => {
  for (const f of ['desk/account-performance.js', 'desk/validation.js', 'lib/desk-classifier.js']) {
    const s = readFileSync(f, 'utf8'); assert.match(s, /TTDeskDailyCache\.fetchStock\(/, f);
  }
  assert.ok(deskHtml.indexOf('desk-daily-cache.js?v=26.10.19.2000') > deskHtml.indexOf('lib/data.js?v=') && deskHtml.indexOf('desk-daily-cache.js?v=') < deskHtml.indexOf('account-performance.js?v='));
});
