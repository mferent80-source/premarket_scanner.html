// I-698 (19.10.2026, 🔴 verificat): URL-urile Finnhub cu `&token=` treceau prin lanțul de proxy-uri din lib/data.js —
// tt-proxy (răspundea „host not allowed: finnhub.io”), apoi corsproxy.io, codetabs, cors.lol ⇒ cheia lui ajungea la terți.
// Acum: gazda finnhub.io și orice URL cu cheie în query (token / apikey / api_key / access_key / key) ⇒ DOAR calea directă.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function loadData(responder) {
  const store = new Map(), cerute = [];
  const ctx = {
    console, setTimeout, clearTimeout, URL, Promise, JSON, Date, Math, isFinite, parseInt,
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), key: (i) => [...store.keys()][i], get length() { return store.size; } },
    fetch: async (url) => { cerute.push(String(url)); return responder(String(url)); },
  };
  ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(readFileSync(join(ROOT, 'lib/data.js'), 'utf8'), ctx, { filename: 'data.js' });
  return { D: ctx.D, cerute };
}
const ok = (body) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => body });
const err = (status) => ({ ok: false, status, headers: { get: () => null }, json: async () => null });
const SECRET = 'SECRETUL-LUI-123';
const CHEI = [
  'https://finnhub.io/api/v1/calendar/earnings?from=2026-10-19&to=2026-11-02&token=' + SECRET,
  'https://finnhub.io/api/v1/quote?symbol=AAPL&token=' + SECRET,
  'https://api.twelvedata.com/time_series?symbol=AAPL&interval=1day&apikey=' + SECRET,
  'https://example.com/v1/x?symbol=A&api_key=' + SECRET,
  'https://example.com/v1/x?access_key=' + SECRET + '&symbol=A',
  'https://example.com/v1/x?symbol=A&apiKey=' + SECRET,
];

for (const url of CHEI) {
  test('toate căile picate: niciun proxy nu primește URL-ul cu cheie — ' + new URL(url).host + ' ' + [...new URL(url).searchParams.keys()].join(','), async () => {
    const { D, cerute } = loadData(async () => err(503));
    const j = await D.fetchJSON(url, { ttl: 0, timeout: 300 });
    assert.equal(j, null);
    assert.ok(cerute.length >= 1, 'calea directă a fost încercată');
    for (const u of cerute) assert.ok(u.startsWith(url.slice(0, url.indexOf('?'))), 'cerere către terț: ' + u.slice(0, 80));
    assert.ok(cerute.every((u) => !/workers\.dev|corsproxy|codetabs|cors\.lol/.test(u)), cerute.join('\n'));
  });
}

test('Finnhub direct merge ⇒ răspunsul vine, cu o singură cerere, fără proxy', async () => {
  const { D, cerute } = loadData(async (u) => (u.startsWith('https://finnhub.io/') ? ok({ earningsCalendar: [] }) : err(500)));
  const j = await D.fetchJSON(CHEI[0], { ttl: 0, timeout: 300 });
  assert.equal(Array.isArray(j.earningsCalendar), true);
  assert.equal(cerute.length, 1); assert.equal(cerute[0], CHEI[0]);
});

test('Finnhub fără cheie în URL (gazda singură) tot direct', async () => {
  const { D, cerute } = loadData(async () => err(502));
  await D.fetchJSON('https://finnhub.io/api/v1/stock/symbol?exchange=US', { ttl: 0, timeout: 300 });
  assert.ok(cerute.length >= 1 && cerute.every((u) => u.startsWith('https://finnhub.io/')), cerute.join('\n'));
});

test('motivul eșecului rămâne pentru ecran și nu conține cheia', async () => {
  const { D } = loadData(async () => err(429));
  await D.fetchJSON(CHEI[0], { ttl: 0, timeout: 300 });
  const f = D.lastFail('finnhub.io');
  assert.ok(f && f.tries.length >= 1, 'eșecul e notat');
  assert.ok(f.tries.every((t) => /^direct:/.test(t)), f.tries.join(','));
  assert.doesNotMatch(JSON.stringify(f) + D.lastFailText(), new RegExp(SECRET));
});

test('Yahoo (fără cheie) merge în continuare prin lanțul de proxy-uri (neschimbat)', async () => {
  const { D, cerute } = loadData(async (u) => (u.includes('workers.dev') ? ok({ chart: { result: [{}] } }) : err(500)));
  const j = await D.fetchJSON('https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=1m', { ttl: 0, timeout: 300 });
  assert.ok(j && j.chart);
  assert.ok(cerute[0].includes('workers.dev'), 'primul e workerul propriu: ' + cerute[0]);
});
