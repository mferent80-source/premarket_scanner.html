import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../app/sw.js', import.meta.url)), 'utf8');
const scope = 'https://example.test/premarket_scanner.html/app/';

function worker({ offline = true } = {}) {
  const handlers = {}, calls = { fetch: [], cacheMatch: [], cachePut: [] };
  const cached = new Response('CACHED TRADING SCREEN');
  const context = {
    URL, Response,
    self: {
      location: { origin: new URL(scope).origin },
      registration: { scope },
      addEventListener: (name, handler) => { handlers[name] = handler; },
    },
    fetch: async (request, options) => {
      calls.fetch.push({ url: request.url, options });
      if (offline) throw new Error('offline');
      return new Response('CURRENT NETWORK SCREEN');
    },
    caches: {
      open: async () => ({ put: async request => { calls.cachePut.push(request.url); } }),
      match: async request => { calls.cacheMatch.push(request.url); return cached.clone(); },
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'app/sw.js' });
  async function serve(path, { method = 'GET', mode = 'navigate' } = {}) {
    let pending;
    const waits = [];
    handlers.fetch({
      request: { url: new URL(path, scope).href, method, mode },
      respondWith: promise => { pending = promise; },
      waitUntil: promise => { waits.push(promise); },
    });
    const response = pending ? await pending : null;
    await Promise.all(waits);
    return response;
  }
  return { serve, calls };
}

for (const path of [
  './', './index.html',
  './?module=desk%2F',
  './?module=journal%2F%23exec',
  './?v=26.10.10.1213&module=desk%2F',
  './?module=app%2Fsync%2F',
  './index.html?module=desk%2F&v=26.10.10.1213',
]) {
  test('offline shell navigation shows the retry screen: ' + path, async () => {
    const { serve, calls } = worker();
    const response = await serve(path);
    assert.ok(response, 'the service worker must intercept this app navigation');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Content-Type'), /text\/html/);
    const body = await response.text();
    assert.match(body, /Ești offline/);
    assert.match(body, /Reîncearcă/);
    assert.doesNotMatch(body, /CACHED TRADING SCREEN/);
    assert.equal(calls.cacheMatch.length, 0, 'offline navigation must not return a cached trading screen');
  });
}

test('online module navigation still serves and caches its network response', async () => {
  const { serve, calls } = worker({ offline: false });
  const path = './?module=desk%2F&v=26.10.10.1213';
  assert.equal(await (await serve(path)).text(), 'CURRENT NETWORK SCREEN');
  assert.equal(calls.fetch[0].options.cache, 'no-cache');
  assert.deepEqual(calls.cachePut, [new URL(path, scope).href]);
});

test('offline assets retain exact version and query matching', async () => {
  const { serve, calls } = worker();
  assert.equal(await (await serve('./install.js?v=phone-20261003', { mode: 'same-origin' })).text(), 'CACHED TRADING SCREEN');
  for (const path of ['./install.js', './install.js?v=other', './install.js?v=phone-20261003&check=1', './manifest.webmanifest?check=1']) {
    assert.equal(await serve(path, { mode: 'same-origin' }), null, path);
  }
  assert.equal(calls.cacheMatch.length, 1, 'unmatched asset versions must not receive a cached copy');
});

for (const [path, options] of [
  ['./?module=desk%2F', { mode: 'same-origin' }],
  ['./unknown.html?module=desk%2F', {}],
  ['../desk/?module=desk%2F', {}],
  ['https://foreign.test/premarket_scanner.html/app/?module=desk%2F', {}],
  ['./?module=desk%2F', { method: 'POST' }],
  ['./install.js?v=phone-20261003', { method: 'POST', mode: 'same-origin' }],
]) {
  test('unrelated or non-GET request stays outside the shell handler: ' + path + ' ' + JSON.stringify(options), async () => {
    const { serve, calls } = worker();
    assert.equal(await serve(path, options), null);
    assert.equal(calls.fetch.length, 0);
    assert.equal(calls.cacheMatch.length, 0);
  });
}
