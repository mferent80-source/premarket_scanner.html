// A DOUA rezervă PROPRIE + `Vary: Origin` pe worker.
//
// După seara de 25.08.2026 (proxy care servea vechituri, apoi rezervele publice găsite
// aproape toate moarte), suita rămăsese practic pe un singur picior: workerul propriu.
// Un al doilea worker e rezerva reală — dar degeaba îl deployezi dacă lanțul n-are unde
// să-l pună. Aici se probează exact asta.
//
// `Vary: Origin`: workerul răspunde cu `Access-Control-Allow-Origin: <origin-ul cererii>`
// ȘI cu `Cache-Control: public, max-age=20`. Fără `Vary: Origin`, un cache intermediar
// poate servi altui origin răspunsul cu ACAO-ul primului → eroare CORS aparent aleatorie,
// exact genul de „merge la mine, nu merge la tine" care ne-a costat o seară.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadData({ responder, store = new Map() }) {
  const ctx = {
    console, setTimeout, clearTimeout, URL, Promise, JSON, Date, Math, isFinite, parseInt,
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
      key: i => [...store.keys()][i],
      get length() { return store.size; },
    },
    fetch: async (url) => responder(String(url)),
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(ROOT, 'lib/data.js'), 'utf8'), ctx, { filename: 'data.js' });
  return ctx.D;
}

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart/AVGO?interval=1m&range=1d';
const okRes = body => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => body });
const errRes = status => ({ ok: false, status, headers: { get: () => null }, json: async () => null });

test('al doilea worker propriu intră în lanț când e setat', async () => {
  const store = new Map([['tt_custom_proxy2', 'https://tt-proxy-2.mferent80.workers.dev']]);
  const lovite = [];
  const D = loadData({
    store,
    responder: u => { lovite.push(String(u)); return okRes({ chart: { result: [{}] } }); },
  });
  await D.fetchJSON(YAHOO, { ttl: 0, cacheKey: 'a', validate: d => d && d.chart });
  const ids = D.proxyIds ? D.proxyIds() : [];
  assert.ok(ids.includes('custom2'), 'lanțul trebuie să conțină al doilea proxy propriu');
});

test('când primul worker propriu pică, al doilea preia ÎNAINTEA celor publice', async () => {
  const store = new Map([['tt_custom_proxy2', 'https://tt-proxy-2.mferent80.workers.dev']]);
  const lovite = [];
  const D = loadData({
    store,
    responder: u => {
      const s = String(u);
      lovite.push(s);
      if (s.includes('tt-proxy.')) return errRes(503);          // primul worker jos
      if (s.includes('tt-proxy-2.')) return okRes({ chart: { result: [{}] } });
      return okRes({ chart: { result: [{ public: true }] } });
    },
  });
  const j = await D.fetchJSON(YAHOO, { ttl: 0, cacheKey: 'b', validate: d => d && d.chart });
  assert.ok(j, 'trebuie să primim date');
  const iAlDoilea = lovite.findIndex(u => u.includes('tt-proxy-2.'));
  assert.ok(iAlDoilea >= 0, 'al doilea worker trebuie încercat');
  const iPublic = lovite.findIndex(u => /cors\.sh|corsproxy|codetabs|cors\.lol/.test(u));
  if (iPublic >= 0) {
    assert.ok(iAlDoilea < iPublic, 'proxy-ul PROPRIU se încearcă înaintea celor publice');
  }
});

test('fără al doilea worker setat, lanțul rămâne exact ca înainte', async () => {
  const lovite = [];
  const D = loadData({ responder: u => { lovite.push(String(u)); return okRes({ chart: { result: [{}] } }); } });
  await D.fetchJSON(YAHOO, { ttl: 0, cacheKey: 'c', validate: d => d && d.chart });
  const ids = D.proxyIds ? D.proxyIds() : [];
  assert.ok(!ids.includes('custom2'), 'nu inventăm un proxy care nu e configurat');
});

test('workerul declară Vary: Origin — altfel un cache poate da ACAO-ul altui origin', () => {
  const src = readFileSync(join(ROOT, 'tools/cf-worker-proxy.js'), 'utf8');
  assert.match(src, /Vary['"\s,]*:?['"\s,]*Origin|set\(['"]Vary['"]/i,
    'raspunsul cache-abil cu ACAO per-origin trebuie sa poarte Vary: Origin');
});

test('pagina /proxy/ există și e legată în navigație — nu o funcție fără buton', () => {
  const pag = readFileSync(join(ROOT, 'proxy/index.html'), 'utf8');
  assert.match(pag, /tt_custom_proxy2/, 'pagina trebuie să poată seta rezerva proprie');
  assert.match(pag, /_t=/, 'proba trebuie să ceară date NOI, cu marcaj anti-cache');
  const nav = readFileSync(join(ROOT, 'nav.js'), 'utf8');
  assert.match(nav, /u:\s*'proxy\/'/, 'pagina trebuie să aibă buton în navigație');
  assert.match(nav, /'proxy\/'/, 'segmentul trebuie cunoscut de shell');
});
