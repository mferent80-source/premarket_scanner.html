// Rezervele de transport + „bursa e închisă" ≠ „nu mai primim date".
//
// 25.08.2026, probat din browser real (CDP) pe origin-ul suitei, cu marcaj anti-cache:
//   custom     OK 155ms  · cotație de 0 min
//   corssh     OK 287ms  · cotație de 0 min
//   corsproxy  OK 110ms  · cotație de 0 min   (redevenit bun după fix-ul anti-cache)
//   codetabs   BLOCAT după 19,4 SECUNDE       ← ardea poll-ul de 30s
//   corslol / allorigins / cors.eu.org / thingproxy / yacdn / whateverorigin — moarte
//   corsfix    403
// Deci lanțul implicit trebuie să înceapă cu cele trei dovedite, iar un proxy care
// ATÂRNĂ nu are voie să fie reîncercat la fiecare simbol dintr-un scan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadData({ responder }) {
  const store = new Map();
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

function proxyIds() {
  const src = readFileSync(join(ROOT, 'lib/data.js'), 'utf8');
  const block = src.slice(src.indexOf('const PROXIES = ['), src.indexOf('const HEALTH_KEY'));
  return [...block.matchAll(/id:\s*'([a-z0-9]+)'/g)].map(m => m[1]);
}

test('lanțul implicit începe cu rezervele dovedite bune, nu cu una care atârnă', () => {
  const ids = proxyIds();
  const bune = ['corssh', 'corsproxy'];
  for (const b of bune) assert.ok(ids.includes(b), `${b} trebuie să fie în lanț (probat bun)`);
  const iCodetabs = ids.indexOf('codetabs');
  if (iCodetabs >= 0) {
    for (const b of bune) {
      assert.ok(ids.indexOf(b) < iCodetabs,
        `${b} (probat bun) trebuie să fie ÎNAINTEA lui codetabs, care a atârnat 19s`);
    }
  }
});

test('un proxy care atârnă intră în cooldown de la PRIMUL eșec, nu de la al doilea', async () => {
  const lovituri = [];
  const D = loadData({
    responder: u => {
      lovituri.push(String(u));
      if (String(u).includes('codetabs')) throw Object.assign(new Error('hang'), { name: 'AbortError' });
      return okRes({ chart: { result: [{}] } });
    },
  });
  // scor: îl forțăm pe codetabs în față ca să fie lovit primul
  await D.fetchJSON(YAHOO, { ttl: 0, cacheKey: 'k1', validate: d => d && d.chart });
  const dupaPrimul = lovituri.filter(u => u.includes('codetabs')).length;
  await D.fetchJSON(YAHOO, { ttl: 0, cacheKey: 'k2', validate: d => d && d.chart });
  const dupaAlDoilea = lovituri.filter(u => u.includes('codetabs')).length;
  assert.equal(dupaAlDoilea, dupaPrimul,
    'după un timeout, proxy-ul nu mai are voie să fie reîncercat imediat (cooldown)');
});

test('proxy-ul cu scor prost primește un timeout scurt — nu arde 8s pe fiecare simbol', () => {
  const src = readFileSync(join(ROOT, 'lib/data.js'), 'utf8');
  assert.match(src, /TIMEOUT_SCOR_PROST|timeoutScurt/,
    'trebuie să existe un timeout redus pentru proxy-urile cu scor negativ');
});

// ── „bursa e închisă" ≠ „datele s-au oprit" ────────────────────────────────
test('yahooQuote spune dacă bursa era deschisă la momentul cotației', () => {
  const PD = require('../lib/price-day.js');
  const acum = Math.floor(Date.now() / 1000);
  const deschis = PD.yahooQuote({
    regularMarketPrice: 100, previousClose: 99, currency: 'EUR',
    regularMarketTime: acum,
    currentTradingPeriod: { regular: { start: acum - 3600, end: acum + 3600 } },
  }, 100, 'rth', true);
  assert.equal(deschis.mktOpen, true, 'în fereastra de tranzacționare → deschis');

  const inchis = PD.yahooQuote({
    regularMarketPrice: 100, previousClose: 99, currency: 'EUR',
    regularMarketTime: acum - 7200,
    currentTradingPeriod: { regular: { start: acum - 36000, end: acum - 7200 } },
  }, 100, 'rth', true);
  assert.equal(inchis.mktOpen, false, 'după ora de închidere → închis');
});

test('fără fereastra de tranzacționare, nu inventăm un verdict', () => {
  const PD = require('../lib/price-day.js');
  const q = PD.yahooQuote({ regularMarketPrice: 100, previousClose: 99 }, 100, 'rth', true);
  assert.equal(q.mktOpen, null, 'meta fără currentTradingPeriod → nu se poate ști');
});

test('pagina /alerts/ arată „închis" pe bursa închisă, nu doar o vechime care crește', () => {
  const html = readFileSync(join(ROOT, 'alerts/index.html'), 'utf8');
  assert.match(html, /_lastMktOpen/, 'pagina trebuie să rețină dacă bursa simbolului e deschisă');
  assert.match(html, /ÎNCHIS|închis/, 'chip-ul trebuie să poată spune că bursa e închisă');
});
