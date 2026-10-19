// 19.10.2026 (I-713): un singur aparat citește Trading 212; celălalt primește datele prin sincronizare și preia singur
// citirea când aparatul ales tace (ultima citire sincronizată mai veche de 15 minute).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = (p) => fileURLToPath(new URL('../' + p, import.meta.url));
const read = (p) => readFileSync(path(p), 'utf8');
function load() {
  assert.ok(existsSync(path('lib/t212-reader.js')), 'lib/t212-reader.js există');
  const ctx = { Date, JSON, Number, Math, Object }; ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(read('lib/t212-reader.js'), ctx); return ctx.TTT212Reader;
}
function store(init = {}) { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m }; }
const NOW = Date.parse('2026-10-19T12:00:00Z'), MIN = 60000;
const base = { now: NOW, wokeAt: NOW - 10 * MIN, visible: false };

test('I-713: setarea e pe aparat, implicit DA; NU se ține minte', () => {
  const R = load(), s = store();
  assert.equal(R.setting(s), true, 'implicit aparatul citește (comportamentul de până acum)');
  R.setSetting(s, false); assert.equal(R.setting(s), false);
  R.setSetting(s, true); assert.equal(R.setting(s), true);
  assert.equal(R.KEY, 'tt_t212_reader_v1');
});

test('I-713: ultima citire = cel mai nou fetchedAt al contului live; citirea proprie se ține separat', () => {
  const R = load();
  const s = store({ tt_trading212_portfolio_v1: JSON.stringify({ a: { environment: 'live', fetchedAt: new Date(NOW - 20 * MIN).toISOString() }, b: { environment: 'live', fetchedAt: new Date(NOW - 3 * MIN).toISOString() }, d: { environment: 'demo', fetchedAt: new Date(NOW).toISOString() } }) });
  assert.equal(R.latest(s, 'live'), NOW - 3 * MIN);
  assert.equal(R.own(s, 'live'), 0);
  R.markOwn(s, 'live', NOW - 3 * MIN); assert.equal(R.own(s, 'live'), NOW - 3 * MIN);
  assert.equal(R.latest(store(), 'live'), 0);
});

test('I-713: aparatul ales citește mereu; celălalt nu cere T212 cât vin citiri proaspete prin sincronizare', () => {
  const R = load();
  assert.equal(R.decide({ ...base, reader: true, latestAt: NOW - MIN, ownAt: 0 }).read, true);
  const d = R.decide({ ...base, reader: false, latestAt: NOW - 5 * MIN, ownAt: 0 });
  assert.equal(d.read, false); assert.equal(d.reason, 'celalalt'); assert.equal(d.otherAt, NOW - 5 * MIN);
});

test('I-713: aparatul ales e închis — după 15 minute fără citire sincronizată, celălalt preia singur', () => {
  const R = load();
  assert.equal(R.TAKEOVER_MS, 15 * MIN);
  assert.equal(R.decide({ ...base, reader: false, latestAt: NOW - 14 * MIN, ownAt: 0 }).read, false, 'sub 15 min: așteaptă');
  const d = R.decide({ ...base, reader: false, latestAt: NOW - 16 * MIN, ownAt: 0 });
  assert.equal(d.read, true); assert.equal(d.reason, 'preluare');
  assert.equal(R.decide({ ...base, reader: false, latestAt: 0, ownAt: 0 }).read, true, 'nicio citire nicăieri: citește');
  // după preluare, citirea lui e cea mai nouă ⇒ continuă la ritmul obișnuit
  assert.equal(R.decide({ ...base, reader: false, latestAt: NOW - MIN, ownAt: NOW - MIN }).read, true);
  // aparatul ales revine și scrie o citire mai nouă ⇒ celălalt se oprește
  assert.equal(R.decide({ ...base, reader: false, latestAt: NOW - 30000, ownAt: NOW - MIN }).read, false);
});

test('I-713: la pornire/revenire preluarea așteaptă 90 s sincronizarea; pagina contului deschisă pe ecran citește oricum', () => {
  const R = load();
  const d = R.decide({ ...base, wokeAt: NOW - 30000, reader: false, latestAt: NOW - 40 * MIN, ownAt: 0 });
  assert.equal(d.read, false); assert.equal(d.reason, 'astept-sincronizarea');
  assert.equal(R.decide({ ...base, visible: true, reader: false, latestAt: NOW - MIN, ownAt: 0 }).read, true, 'pe ecran: citește');
  assert.equal(R.decide({ ...base, reader: false, latestAt: NOW + 2 * 3600e3, ownAt: 0 }).read, true, 'o citire „din viitor” (ceas greșit) nu blochează preluarea');
});

test('I-713: textul vechimii pentru Setări și pagina contului', () => {
  const R = load();
  assert.match(R.describe({ ...base, reader: false, latestAt: NOW - 5 * MIN, ownAt: 0 }), /celălalt aparat.*acum 5 min/);
  assert.match(R.describe({ ...base, reader: true, latestAt: NOW - 2 * MIN, ownAt: NOW - 2 * MIN }), /acest aparat.*acum 2 min/);
  assert.match(R.describe({ ...base, reader: false, latestAt: 0, ownAt: 0 }), /nicio citire/i);
});

test('I-713: brokerul ascuns cere T212 doar când regula o permite; citirea proprie se marchează', () => {
  const js = read('broker/broker.js'), html = read('broker/index.html');
  assert.match(html, /lib\/shell-visibility\.js\?v=26\.10\.19\.2000/); assert.match(html, /lib\/t212-reader\.js\?v=26\.10\.19\.2000/);
  assert.match(js, /setInterval\(\(\)=>\{if\(token&&\$\('autoSync'\)\.checked&&!busy&&!journalRunning&&navigator\.onLine!==false&&document\.visibilityState!=='hidden'&&readAllowed\(\)\)sync\(\);\},60000\);/);
  assert.match(js, /importJournalPage\(\);\},12000\)/); assert.match(js, /&&readAllowed\(\)\)importJournalPage\(\);\},12000\)/);
  assert.match(js, /&&readAllowed\(\)\)importCashPage\(\);\},15000\)/);
  assert.match(js, /TTT212Reader\.markOwn\(localStorage,brokerEnvironment,lastFetched\)/);
  assert.match(js, /startConnection\(saved,false,\{read:readAllowed\(\)\}\)/, 'reconectarea la pornire nu citește pe aparatul care nu e ales');
});

// conectorul REAL (broker/broker.js) cu aparatul „Nu”: proba de comportament, nu doar de text
async function brokerOn({ reader, otherMinutesAgo }) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  let t = NOW; const Clock = class extends Date { static now() { return t; } };
  const elements = new Map(), calls = [], intervals = [];
  const el = (id) => { if (!elements.has(id)) elements.set(id, { value: '', hidden: false, disabled: false, textContent: '', innerHTML: '', handlers: {}, querySelectorAll: () => [], setAttribute(k, v) { this[k] = v; }, replaceChildren() { this.innerHTML = ''; }, addEventListener(n, f) { this.handlers[n] = f; } }); return elements.get(id); };
  const kinds = ['orders', 'dividends', 'transactions'].map((kind) => Object.assign(el('kind-' + kind), { dataset: { kind } }));
  const document = { visibilityState: 'visible', getElementById: el, querySelectorAll: (s) => (s === '[data-kind]' ? kinds : []) };
  const saved = new Map(), storage = { getItem: (k) => (saved.has(k) ? saved.get(k) : null), setItem: (k, v) => saved.set(k, String(v)) };
  saved.set('tt_trading212_portfolio_v1', JSON.stringify({ x: { environment: 'live', fetchedAt: new Date(NOW - otherMinutesAgo * MIN).toISOString(), positions: [] } }));
  const vault = { read: async () => ({ key: 'saved-key', secret: 'saved-secret', environment: 'live' }), save: async () => {}, clear: async () => {} };
  const window = { crypto: (await import('node:crypto')).webcrypto, T212Vault: vault, addEventListener() {} }; window.parent = window;
  // pagina ascunsă în aplicație: TTShell spune „nu e pe ecran”
  window.TTShell = { visible: () => false, onChange: () => () => {} };
  const ctx = vm.createContext({ window, Intl, Date: Clock, localStorage: storage });
  for (const f of ['lib/daily-series.js', 'lib/holding-evolution.js', 'lib/trading212-performance.js', 'lib/trading212-portfolio.js', 'lib/trading212-daily.js', 'lib/holdings-pulse.js', 'lib/position-history.js', 'lib/holding-handoff.js', 'lib/trading212-snapshot.js', 'lib/t212-reader.js']) vm.runInContext(read(f), ctx);
  if (!reader) window.TTT212Reader.setSetting(storage, false);
  window.ViewRefresh = { patchList: (host, items, key, markup) => { host.innerHTML = items.map(markup).join(''); } };
  const fetch = async (u) => {
    if (String(u).includes('trading212-config')) return { json: async () => ({ enabled: true, endpoint: 'https://owned-private.workers.dev', directCredentials: true }) };
    calls.push(String(u)); const name = new URL(u).pathname.split('/').at(-1);
    return { ok: true, json: async () => ({ source: 'Trading 212', environment: 'live', fetchedAt: new Date(t).toISOString(), data: name === 'summary' ? { currency: 'EUR', available: 5 } : name === 'positions' ? [] : { items: [], nextCursor: null } }) };
  };
  await new AsyncFunction('document', 'window', 'fetch', 'setInterval', 'btoa', 'AbortController', 'crypto', 'setTimeout', 'clearTimeout', 'Date', 'navigator', 'location', 'localStorage', 'sessionStorage', read('broker/broker.js'))(
    document, window, fetch, (fn, ms) => intervals.push({ fn, ms }), btoa, AbortController, window.crypto, setTimeout, clearTimeout, Clock, { onLine: true }, { search: '' }, storage, storage);
  el('autoSync').checked = true;
  return { el, calls, intervals, storage, window, advance: (ms) => { t += ms; }, tick: async (ms) => { for (const i of intervals.filter((x) => x.ms === ms)) await i.fn(); await new Promise((r) => setTimeout(r, 20)); } };
}

test('I-713: pe aparatul „Nu”, cu o citire sincronizată proaspătă, conectorul ascuns nu cere nimic la Trading 212 — nici la pornire, nici la 60/12/15 s', async () => {
  const b = await brokerOn({ reader: false, otherMinutesAgo: 2 });
  assert.equal(b.calls.length, 0, 'reconectarea la pornire nu citește');
  assert.match(b.el('status').textContent, /celălalt aparat/);
  for (const ms of [60000, 12000, 15000]) await b.tick(ms);
  assert.equal(b.calls.length, 0, 'nicio cerere T212 la 60/12/15 s');
});

test('I-713: aparatul ales s-a închis — după 15 minute fără citire nouă, conectorul de pe „Nu” preia singur citirea', async () => {
  const b = await brokerOn({ reader: false, otherMinutesAgo: 2 });
  b.advance(16 * MIN); await b.tick(60000);
  assert.ok(b.calls.some((u) => /\/summary$/.test(u)) && b.calls.some((u) => /\/positions$/.test(u)), 'preluarea citește soldul și pozițiile');
  assert.ok(b.window.TTT212Reader.own(b.storage, 'live') > 0, 'citirea proprie e marcată ⇒ continuă la ritmul obișnuit până revine celălalt');
});

test('I-713: aparatul ales (implicit) citește ca înainte', async () => {
  const b = await brokerOn({ reader: true, otherMinutesAgo: 2 });
  assert.ok(b.calls.length >= 2, 'reconectarea la pornire citește contul');
});

test('I-713: Setări are bifa „Acest aparat citește Trading 212”, cu explicație și vechimea citirii', () => {
  const html = read('app/settings/index.html');
  assert.match(html, /id="t212Reader"/); assert.match(html, /Acest aparat citește Trading 212/); assert.match(html, /15 minute/);
  assert.match(html, /lib\/t212-reader\.js\?v=26\.10\.19\.2000/);
  // workspace.js leagă bifa de setare
  const elements = {}, s = store({ tt_trading212_portfolio_v1: JSON.stringify({ a: { environment: 'live', fetchedAt: new Date(Date.now() - 4 * MIN).toISOString() } }) });
  const el = (id) => (id in elements ? elements[id] : (elements[id] = { id, checked: false, textContent: '', dataset: {}, addEventListener(n, f) { this['on' + n] = f; }, setAttribute() {}, querySelectorAll: () => [] }));
  const ctx = { document: { getElementById: el, querySelectorAll: () => [], addEventListener() {}, hidden: false, documentElement: { dataset: {} } }, localStorage: s, navigator: { onLine: true }, Date, JSON, Number, Math, Object, setInterval: () => 0,
    addEventListener() {}, location: { origin: 'x' }, fetch: undefined, TTAppRoutes: { all: [], canonical: (x) => x } };
  ctx.window = ctx; ctx.parent = ctx; vm.createContext(ctx);
  vm.runInContext(read('lib/t212-reader.js'), ctx);
  ['themeStatus', 'settingsAccount', 'toolSearch', 'toolGrid'].forEach((id) => { elements[id] = null; });
  vm.runInContext(read('app/workspace.js'), ctx);
  assert.equal(elements.t212Reader.checked, true, 'implicit bifat');
  assert.match(elements.t212ReaderState.textContent, /acum 4 min/);
  elements.t212Reader.checked = false; elements.t212Reader.onchange();
  assert.equal(ctx.TTT212Reader.setting(s), false, 'debifarea se salvează pe aparat');
  assert.match(elements.t212ReaderState.textContent, /celălalt aparat/);
});
