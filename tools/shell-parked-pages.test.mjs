// 19.10.2026 (I-702): paginile parcate în aplicație (Alerte, Cont & sincronizare) nu mai lucrează pe firul principal și nu mai cer rețea.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (p) => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf8');
const ALERTS = read('alerts/index.html');

function syncPage(file, cloudExtra) {
  let t = Date.parse('2026-10-19T12:00:00Z'); const Clock = class extends Date { static now() { return t; } };
  const nodes = new Map(), listeners = new Map(), intervals = [], counts = { monitor: 0, push: 0 };
  const parent = { TTCloud: { state: () => ({ connected: true, ready: true, email: 'el@example.test', monitor: { protocol: 'tt-account-monitor-v1' }, push: { protocol: 'tt-web-push-v1', available: true } }), monitor: async () => { counts.monitor++; return { monitor: { enabled: false } }; }, push: async () => { counts.push++; return { devices: [], publicKey: 'AQ' }; }, ...cloudExtra } };
  const node = (id) => { if (!nodes.has(id)) nodes.set(id, { id, textContent: '', innerHTML: '', disabled: false }); return nodes.get(id); };
  const c = { parent, location: { href: 'https://example.test/app/sync/', origin: 'https://example.test' }, Date: Clock, document: { hidden: false, getElementById: node, addEventListener: (n, f) => listeners.set('doc:' + n, f) },
    addEventListener: (n, f) => listeners.set(n, f), setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; }, setTimeout, clearTimeout, isSecureContext: false, navigator: {}, URL, btoa, atob, TextEncoder, Uint8Array };
  c.window = c; vm.createContext(c); vm.runInContext(read(file), c);
  const flush = () => new Promise((r) => setTimeout(r, 10));
  const say = (data) => listeners.get('message')({ source: parent, origin: c.location.origin, data });
  return { counts, intervals, say, flush, advance: (ms) => { t += ms; }, tick: () => intervals.filter((x) => x.ms === 60000).forEach((x) => x.fn()) };
}

for (const [file, kind] of [['app/sync/monitor.js', 'monitor'], ['app/sync/push.js', 'push']]) {
  test('I-702: ' + file + ' — parcată în aplicație nu mai cere ' + kind + ' la 60 s; la revenire cere o dată', async () => {
    const p = syncPage(file);
    await p.flush();
    assert.equal(p.counts[kind], 1, 'la deschidere cere o dată');
    p.say({ ttShellVisible: false });
    p.advance(2 * 60000); p.tick(); await p.flush();
    p.say({ ttCloudState: {} }); await p.flush();
    assert.equal(p.counts[kind], 1, 'parcată: nici ceasul de 60 s, nici starea cloud nu mai pornesc cereri');
    p.say({ ttShellVisible: true }); await p.flush();
    assert.equal(p.counts[kind], 2, 'la revenire: o cerere');
  });
}

test('I-702: Alerte leagă TTShell; ceasul de 1 s, GitHub și istoricul la 2 min se opresc cât pagina e parcată', () => {
  const main = ALERTS.indexOf('var _shellHidden');
  const lib = ALERTS.indexOf('../lib/shell-visibility.js?v=');
  assert.ok(lib > 0 && lib < main, 'shell-visibility.js e încărcat înaintea scriptului paginii');
  assert.match(ALERTS, /function ttEvery\(fn, ms\) \{ return \(typeof TTShell !== 'undefined' && TTShell\.every\) \? TTShell\.every\(fn, ms\) : setInterval\(fn, ms\); \}/);
  assert.match(ALERTS, /ttEvery\(function \(\) \{ try \{ paintPollHeartbeat\(\); \} catch \(e\) \{\} \}, 1000\);/);
  assert.match(ALERTS, /ttEvery\(\(\) => \{ if \(!document\.hidden\) pullFromGitHub\(true\); \}, 120000\);/);
  assert.match(ALERTS, /ttEvery\(\(\) => \{ if \(!document\.hidden\) loadServerHist\(\); \}, 120000\);/);
  assert.doesNotMatch(ALERTS, /setInterval\(function \(\) \{ try \{ paintPollHeartbeat/);
});

function botiLive({ fetch, TTShell, timers }) {
  const a = ALERTS.indexOf('async function radAduBotiLive'), z = ALERTS.indexOf('setInterval(radAduBotiLive');
  const fakeTimeout = (fn, ms) => { timers.push(ms); setImmediate(fn); return timers.length; };
  const run = new Function('document', 'RadarPoza', 'fetch', 'radRandeaza', 'TTShell', 'setTimeout', 'clearTimeout', 'var _radUltima = { poza: arguments[7] }; var _radBotiLiveMap = {}, _radBotiFara = {};\n' + ALERTS.slice(a, z) + '\nreturn { radAduBotiLive, harta: () => _radBotiLiveMap, fara: () => _radBotiFara };');
  return run({ hidden: false }, {}, fetch, () => {}, TTShell, fakeTimeout, () => {}, { boti: [{ s: 'LIGHTER', m: 'LIT' }] });
}

test('I-702: prețul live al boților (Binance la 10 s) nu se mai cere cât Alerte e parcată', async () => {
  let n = 0;
  const f = botiLive({ fetch: async () => { n++; return { ok: true, json: async () => [[0, '1', '0', '0', '1.1']] }; }, TTShell: { visible: () => false }, timers: [] });
  await f.radAduBotiLive();
  assert.equal(n, 0);
});

test('I-702: o eroare trecătoare la Binance se reîncearcă și NU scoate moneda din urmărire 30 de minute', async () => {
  let n = 0;
  const f = botiLive({ fetch: async () => { n++; if (n === 1) return { ok: false, status: 503 }; return { ok: true, json: async () => [[0, '4.44', '0', '0', '4.41']] }; }, TTShell: { visible: () => true }, timers: [] });
  await f.radAduBotiLive();
  assert.equal(n, 2, 'a doua încercare vine imediat');
  assert.equal(f.harta().LIGHTER.pret, 4.41);
  let m = 0;
  const g = botiLive({ fetch: async () => { m++; throw new TypeError('Failed to fetch'); }, TTShell: { visible: () => true }, timers: [] });
  await g.radAduBotiLive();
  assert.equal(m, 2, 'două încercări');
  await g.radAduBotiLive();
  assert.equal(m, 2, 'pauză scurtă după două eșecuri (nu la fiecare 10 s)');
  const pauza = g.fara().LIT;
  assert.ok(Date.now() - pauza >= 28 * 60000, 'eroarea trecătoare amână cel mult ~2 minute, nu 30');
});

test('I-702: cererea Binance are termen (6 s) — o cerere agățată nu ține pagina', async () => {
  const timers = []; let n = 0;
  const f = botiLive({ fetch: (u, o) => { n++; return new Promise((_, rej) => { o && o.signal && o.signal.addEventListener('abort', () => rej(new Error('abort'))); }); }, TTShell: { visible: () => true }, timers });
  // fără termen (codul vechi) cererea atârnă la nesfârșit: proba se oprește singură după 2 s și pică
  let guard; const blocked = new Promise((_, rej) => { guard = setTimeout(() => rej(new Error('cererea Binance a rămas agățată (fără termen)')), 2000); });
  try { await Promise.race([f.radAduBotiLive(), blocked]); } finally { clearTimeout(guard); }
  assert.ok(timers.includes(6000), 'termen de 6 s pe cerere');
  assert.equal(n, 2, 'o reîncercare după termen');
});
