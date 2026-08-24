// Gardă: un asset cerut cu `?v=NNN` nu are voie să vină din cache cu ALTĂ versiune.
//
// Bug-ul din 24.08.2026: `assetSWR` făcea `caches.match(req, {ignoreSearch:true})`,
// deci `?v=` era ignorat complet. Pagina /alerts/ (HTML network-first, deci la zi,
// badge `tt-v796`) primea `lib/price-day.js` de ieri și rula fixul de azi... fără
// codul fixului. Semnul vizibil: RHM.DE, bursă germană, scria `$` în loc de `€`.
// Comentariul din SW spunea „se auto-vindecă la refresh" — pe un PWA lăsat deschis
// pe telefon, refresh-ul acela nu vine niciodată.
//
// Testul încarcă sw-app.js REAL într-un context vm cu Cache API simulat, nu caută
// șiruri în cod: un grep ar trece peste orice rescriere care reintroduce bug-ul.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://mferent80-source.github.io';

// ── Cache API simulat ───────────────────────────────────────────────────────
class FakeCache {
  constructor() { this.map = new Map(); }
  async put(req, res) { this.map.set(typeof req === 'string' ? req : req.url, res); }
  async match(req, opts) {
    const url = typeof req === 'string' ? req : req.url;
    const hit = this.map.get(url);
    if (hit) return hit;
    if (opts && opts.ignoreSearch) {
      const bare = url.split('?')[0];
      for (const [k, v] of this.map) if (k.split('?')[0] === bare) return v;
    }
    return undefined;
  }
}

function makeContext({ cache, netBody, netFails }) {
  const calls = { fetch: [] };
  const ctx = {
    console, setTimeout, clearTimeout, URL, Promise,
    Request: class { constructor(u) { this.url = String(u); this.method = 'GET'; this.headers = { get: () => null }; } },
    Response: class {
      constructor(body, init) {
        this.body = body; init = init || {};
        this.status = init.status == null ? 200 : init.status;
        this.statusText = init.statusText || '';
        this.type = init.type || 'basic';
        this.headers = { get: () => null };
      }
      clone() { const r = new ctx.Response(this.body, { status: this.status, type: this.type }); return r; }
    },
    caches: { open: async () => cache, match: (r, o) => cache.match(r, o), keys: async () => [], delete: async () => true },
    fetch: async (req) => {
      calls.fetch.push(typeof req === 'string' ? req : req.url);
      if (netFails) throw new Error('offline');
      return new ctx.Response(netBody, { type: 'basic' });
    },
    self: {
      location: { origin: ORIGIN, href: ORIGIN + '/sw-app.js' },
      addEventListener: (ev, fn) => { ctx.self['on_' + ev] = fn; },
      skipWaiting: () => {}, clients: { claim: () => {} },
      registration: { scope: ORIGIN + '/' },
    },
  };
  ctx.self.self = ctx.self;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(ROOT, 'sw-app.js'), 'utf8'), ctx, { filename: 'sw-app.js' });
  return { ctx, calls };
}

// Trece o cerere prin handler-ul de fetch al SW-ului și întoarce răspunsul servit.
async function serve(ctx, url) {
  let served;
  const waits = [];
  const req = new ctx.Request(url);
  await ctx.self.on_fetch({
    request: req,
    respondWith: p => { served = p; },
    waitUntil: p => waits.push(p),
  });
  const res = await served;
  await Promise.allSettled(waits);
  return res;
}

const LIB = '/lib/price-day.js';

test('versiune NOUĂ cerută, cache are alta → NU se servește copia veche', async () => {
  const cache = new FakeCache();
  await cache.put(ORIGIN + LIB + '?v=795', { body: 'VECHI', status: 200, type: 'basic', clone() { return this; }, headers: { get: () => null } });
  const { ctx } = makeContext({ cache, netBody: 'NOU' });

  const res = await serve(ctx, ORIGIN + LIB + '?v=796');
  assert.equal(res.body, 'NOU',
    'SW-ul a servit o versiune diferită de cea cerută — exact bug-ul din 24.08 (HTML nou peste lib vechi)');
});

test('cache queryless (din precache) nu poate satisface o cerere versionată', async () => {
  const cache = new FakeCache();
  await cache.put(ORIGIN + LIB, { body: 'PRECACHE-VECHI', status: 200, type: 'basic', clone() { return this; }, headers: { get: () => null } });
  const { ctx } = makeContext({ cache, netBody: 'NOU' });

  const res = await serve(ctx, ORIGIN + LIB + '?v=796');
  assert.equal(res.body, 'NOU', 'copia queryless din precache a fost servită pentru o cerere cu ?v=');
});

test('versiunea CERUTĂ există în cache → servită instant (SWR păstrat)', async () => {
  const cache = new FakeCache();
  await cache.put(ORIGIN + LIB + '?v=796', { body: 'EXACT', status: 200, type: 'basic', clone() { return this; }, headers: { get: () => null } });
  const { ctx, calls } = makeContext({ cache, netBody: 'NOU' });

  const res = await serve(ctx, ORIGIN + LIB + '?v=796');
  assert.equal(res.body, 'EXACT', 'potrivirea exactă pe versiune trebuie servită din cache, fără drum la rețea');
  assert.ok(calls.fetch.length >= 1, 'revalidarea în fundal (SWR) trebuie să pornească oricum');
});

test('offline: rețeaua pică, versiunea cerută lipsește → cade pe orice copie, nu pe 504', async () => {
  const cache = new FakeCache();
  await cache.put(ORIGIN + LIB + '?v=795', { body: 'VECHI', status: 200, type: 'basic', clone() { return this; }, headers: { get: () => null } });
  const { ctx } = makeContext({ cache, netFails: true });

  const res = await serve(ctx, ORIGIN + LIB + '?v=796');
  assert.equal(res.body, 'VECHI', 'offline trebuie să rămână funcțional cu ultima copie disponibilă');
});

test('asset FĂRĂ ?v= păstrează comportamentul queryless (precache-ul îl găsește)', async () => {
  const cache = new FakeCache();
  await cache.put(ORIGIN + '/lib/hub-ui.css', { body: 'CSS', status: 200, type: 'basic', clone() { return this; }, headers: { get: () => null } });
  const { ctx } = makeContext({ cache, netBody: 'CSS-NOU' });

  const res = await serve(ctx, ORIGIN + '/lib/hub-ui.css');
  assert.equal(res.body, 'CSS', 'asset-urile nevesionate trebuie servite din cache ca înainte');
});

test('scrierea în cache păstrează versiunea în cheie', async () => {
  const cache = new FakeCache();
  const { ctx } = makeContext({ cache, netBody: 'NOU' });

  await serve(ctx, ORIGIN + LIB + '?v=796');
  assert.ok(cache.map.has(ORIGIN + LIB + '?v=796'),
    'fără versiune în cheie, următoarea cerere ar rata din nou potrivirea exactă');
});
