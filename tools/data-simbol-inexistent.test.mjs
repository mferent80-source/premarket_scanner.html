// 16.10.2026: WBA (Walgreens, scos de pe bursă) în universul Premarket Scanner. Proxy-ul propriu întorcea
// corect 404 „No data found, symbol may be delisted”, dar lanțul încerca apoi corsproxy (401), cors.lol (CORS)
// și direct (CORS) — patru erori roșii în consolă la fiecare scanare — și nota proxy-ul propriu ca defect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function loadData(responder) {
  const store = new Map();
  const ctx = {
    console, setTimeout, clearTimeout, URL, Promise, JSON, Date, Math, isFinite, parseInt,
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), key: i => [...store.keys()][i], get length() { return store.size; } },
    fetch: async (url) => responder(String(url)),
  };
  ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(readFileSync(join(ROOT, 'lib/data.js'), 'utf8'), ctx, { filename: 'data.js' });
  return ctx.D;
}
const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart/WBA?range=1y&interval=1d';
const res = (status, body) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body });
const DELISTED = { chart: { result: null, error: { code: 'Not Found', description: 'No data found, symbol may be delisted' } } };

test('simbol inexistent la Yahoo (404 prin proxy-ul propriu) ⇒ fără rezervele publice, motivul rămâne', async () => {
  const calls = [];
  const D = loadData(async url => { calls.push(url); return url.includes('tt-proxy') ? res(404, DELISTED) : res(500, null); });
  const j = await D.fetchJSON(YAHOO, { ttl: 0, timeout: 500, validate: d => d && d.chart && d.chart.result });
  assert.equal(j, null);
  assert.equal(calls.length, 1, 'a mai încercat: ' + calls.slice(1).map(u => u.slice(0, 40)).join(' | '));
  assert.match(D.lastFail('query1.finance.yahoo.com').tries.join(' '), /simbol-inexistent/);
});

test('simbol inexistent nu coboară scorul proxy-ului propriu', async () => {
  const D = loadData(async url => url.includes('tt-proxy') ? res(404, DELISTED) : res(500, null));
  for (let i = 0; i < 6; i++) await D.fetchJSON(YAHOO, { ttl: 0, timeout: 500 });
  assert.equal(D.orderedProxies('query1.finance.yahoo.com')[0].id, 'custom');
  const h = JSON.stringify(D._health());
  assert.ok(!/"custom[^"]*":\s*-/.test(h), 'scor negativ: ' + h.slice(0, 200));
});

test('404 fără răspunsul Yahoo „Not Found” (proxy rupt) ⇒ lanțul continuă ca înainte', async () => {
  const calls = [];
  const D = loadData(async url => { calls.push(url); return url.includes('tt-proxy') ? res(404, null) : res(200, { chart: { result: [{}] } }); });
  const j = await D.fetchJSON(YAHOO, { ttl: 0, timeout: 500, validate: d => d && d.chart && d.chart.result });
  assert.ok(j && j.chart);
  assert.ok(calls.length >= 2);
});
