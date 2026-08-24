// Gărzi pentru transportul către Yahoo: rezerve VII și eșec care se explică.
//
// 24.08.2026 seara: pagina /alerts/ arăta „LIVE" în timp ce toate cele 4 acțiuni
// americane erau înghețate de o oră. Crypto curgea normal (Binance are CORS deschis,
// deci trece prin `direct`), Yahoo nu ajungea prin niciun proxy — iar toate rezervele
// muriseră fără ca nimeni să afle: codetabs 503, corsproxy 403, cors.lol 429,
// allorigins timeout. `fetchJSON` întorcea `null` în tăcere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

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
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(ROOT, 'lib/data.js'), 'utf8'), ctx, { filename: 'data.js' });
  return ctx.D;
}

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart/INTC?interval=1m&range=1d';
const okRes = body => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => body });
const errRes = status => ({ ok: false, status, headers: { get: () => null }, json: async () => null });

test('lista de proxy conține cel puțin o rezervă în afara workerului propriu', () => {
  const src = readFileSync(join(ROOT, 'lib/data.js'), 'utf8');
  const block = src.slice(src.indexOf('const PROXIES = ['), src.indexOf('const HEALTH_KEY'));
  const ids = [...block.matchAll(/id:\s*'([a-z0-9]+)'/g)].map(m => m[1]);
  const rezerve = ids.filter(id => id !== 'custom' && id !== 'direct');
  assert.ok(rezerve.length >= 3,
    `doar ${rezerve.length} rezerve (${ids.join(', ')}) — când cade workerul propriu, stocks US rămân fără nicio cale către Yahoo`);
});

test('toate proxy-urile pică → motivul FIECĂRUIA rămâne disponibil pentru ecran', async () => {
  const D = loadData({ responder: async url => {
    if (url.includes('cors.sh')) return errRes(403);
    if (url.includes('codetabs')) return errRes(503);
    if (url.includes('cors.lol')) return errRes(429);
    if (url.includes('corsproxy')) return errRes(403);
    return errRes(429);   // workerul propriu
  }});

  const j = await D.fetchJSON(YAHOO, { ttl: 0, timeout: 500, validate: d => d && d.chart });
  assert.equal(j, null, 'fără niciun proxy viu, rezultatul e null — asta e corect');

  const f = D.lastFail('query1.finance.yahoo.com');
  assert.ok(f, 'eșecul total trebuie înregistrat, altfel „fără preț" rămâne fără cauză');
  assert.ok(f.tries.length >= 4, `prea puține încercări notate: ${JSON.stringify(f.tries)}`);
  assert.ok(f.tries.some(t => t.endsWith(':429')), 'codul HTTP trebuie păstrat — 429 ≠ 403 ≠ timeout');
  assert.ok(f.tries.some(t => t.endsWith(':503')));

  const txt = D.lastFailText();
  assert.match(txt, /yahoo\.com/, 'rezumatul trebuie să numească gazda picată');
  assert.match(txt, /429/, 'rezumatul trebuie să poarte codurile, nu doar numele proxy-urilor');
});

test('un proxy viu mai jos în listă salvează cererea când primul pică', async () => {
  let folosit = '';
  const D = loadData({ responder: async url => {
    if (url.includes('workers.dev')) return errRes(429);      // workerul propriu, căzut
    folosit = url;
    return okRes({ chart: { result: [{ meta: { regularMarketPrice: 87.37 } }] } });
  }});

  const j = await D.fetchJSON(YAHOO, { ttl: 0, timeout: 500, validate: d => d && d.chart });
  assert.ok(j && j.chart, 'cu o rezervă vie, prețul trebuie să vină totuși');
  assert.ok(folosit && !folosit.includes('workers.dev'), 'trebuia folosită rezerva, nu proxy-ul căzut');
  assert.equal(D.lastFail('query1.finance.yahoo.com'), null, 'succesul nu trebuie să lase în urmă un eșec fantomă');
});

test('rezumatul eșecului expiră — nu arăta o cauză veche de ore ca fiind de acum', async () => {
  const D = loadData({ responder: async () => errRes(500) });
  await D.fetchJSON(YAHOO, { ttl: 0, timeout: 500, validate: d => d && d.chart });

  assert.notEqual(D.lastFailText(), '', 'proaspăt → se arată');
  await new Promise(r => setTimeout(r, 12));
  assert.equal(D.lastFailText(10), '', 'mai vechi decât fereastra cerută → nu se mai arată');
});
