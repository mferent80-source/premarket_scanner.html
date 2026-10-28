// 28.10.2026 (I-775) — „se încarcă foarte greu paginile în app” (Marius, pe telefon). Măsurat: Portofoliul cere 122 de fișiere (~1,3 MB), Jurnalul 70,
// Planurile 62; a doua deschidere a unei pagini pornea tot ~220 de cereri (revalidări 304 pentru fișiere cu `?v=`, care nu se schimbă niciodată),
// iar la fiecare publicare `activate` ștergea cache-ul întreg ⇒ totul se re-descărca (azi: 4 publicări). Aici, pe sw-app.js REAL într-un vm:
//  1. fișier cu `?v=` găsit exact ⇒ din cache, FĂRĂ revalidare; fără `?v=` ⇒ stale-while-revalidate ca înainte;
//  2. la instalarea unei versiuni noi a suitei, fișierele cu `?v=` din cache-ul vechi se copiază (ultima versiune pe fiecare cale);
//  3. HTML-ul unui modul cerut de carcasă cu `v=<versiunea aplicației>` ⇒ copia exactă din cache pe loc, revalidare în fundal; fără `v` ⇒ rețea.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ORIGIN = 'https://mferent80-source.github.io', BAZA = ORIGIN + '/premarket_scanner.html';
// ca în Cache API: un șir relativ („./nav.js”, din precache) se rezolvă față de scope-ul SW-ului
const abs = (req) => new URL(typeof req === 'string' ? req : req.url, BAZA + '/').href;
class FakeCache {
  constructor() { this.map = new Map(); }
  async put(req, res) { this.map.set(abs(req), res); }
  async add(req) { this.map.set(abs(req), { body: 'DIN-RETEA', status: 200, type: 'basic' }); }
  async keys() { return [...this.map.keys()].map((url) => ({ url })); }
  async match(req, opts) {
    const url = abs(req), hit = this.map.get(url);
    if (hit) return hit;
    if (opts && opts.ignoreSearch) { const bare = url.split('?')[0]; for (const [k, v] of this.map) if (k.split('?')[0] === bare) return v; }
    return undefined;
  }
}
const raspuns = (body) => ({ body, status: 200, type: 'basic', clone() { return { ...this }; }, headers: { get: () => null } });
function context({ cacheuri, netBody = 'NOU', netFails = false, incet = false }) {
  const calls = { fetch: [] };
  const ctx = {
    console: { warn() {}, log() {} }, setTimeout, clearTimeout, URL, Promise, Map,
    Request: class { constructor(u, o = {}) { this.url = String(u); this.method = o.method || 'GET'; this.cache = o.cache || 'default'; this.mode = o.mode || 'cors'; this.headers = { get: (k) => (o.headers && o.headers[k]) || null }; } },
    Response: class { constructor(body, init = {}) { this.body = body; this.status = init.status == null ? 200 : init.status; this.statusText = init.statusText || ''; this.type = init.type || 'basic'; this.headers = { get: () => null }; } clone() { return new ctx.Response(this.body, { status: this.status, type: this.type }); } },
    caches: { open: async (n) => (cacheuri[n] = cacheuri[n] || new FakeCache()), match: async (r, o) => { for (const c of Object.values(cacheuri)) { const h = await c.match(r, o); if (h) return h; } return undefined; }, keys: async () => Object.keys(cacheuri), delete: async (n) => delete cacheuri[n] },
    fetch: (req) => { calls.fetch.push(typeof req === 'string' ? req : req.url); if (netFails) return Promise.reject(new Error('offline')); const r = new ctx.Response(netBody, { type: 'basic' }); return incet ? new Promise((res) => setTimeout(() => res(r), 60)) : Promise.resolve(r); },
    self: { location: { origin: ORIGIN, href: BAZA + '/sw-app.js' }, addEventListener: (ev, fn) => { ctx.self['on_' + ev] = fn; }, skipWaiting() {}, clients: { claim() {} }, registration: { scope: BAZA + '/' } },
  };
  ctx.self.self = ctx.self; vm.createContext(ctx);
  vm.runInContext(readFileSync('sw-app.js', 'utf8'), ctx, { filename: 'sw-app.js' });
  const versiune = /CACHE_VERSION = '([^']+)'/.exec(readFileSync('sw-app.js', 'utf8'))[1];
  return { ctx, calls, numeCache: 'trading-tools-' + versiune };
}
async function serve(ctx, url, options = {}) {
  let served; const waits = []; const req = new ctx.Request(url, options);
  await ctx.self.on_fetch({ request: req, respondWith: (p) => { served = p; }, waitUntil: (p) => waits.push(p) });
  const res = await (served || ctx.fetch(req)); await Promise.allSettled(waits); return res;
}

test('1. fișier cu `?v=` găsit exact ⇒ din cache, fără nicio cerere; fără `?v=` ⇒ din cache + revalidare în fundal', async () => {
  const cacheuri = {}, { ctx, calls, numeCache } = context({ cacheuri });
  const c = await ctx.caches.open(numeCache);
  await c.put(BAZA + '/holdings/holdings.js?v=26.10.28.1116', raspuns('EXACT')); await c.put(BAZA + '/nav.js', raspuns('NAV'));
  assert.equal((await serve(ctx, BAZA + '/holdings/holdings.js?v=26.10.28.1116')).body, 'EXACT'); assert.equal(calls.fetch.length, 0, 'niciun drum la rețea pentru versiunea găsită');
  assert.equal((await serve(ctx, BAZA + '/nav.js')).body, 'NAV'); assert.equal(calls.fetch.length, 1, 'fără `?v=`: revalidarea pornește');
  assert.equal((await serve(ctx, BAZA + '/holdings/holdings.js?v=26.10.28.2000')).body, 'NOU', 'altă versiune ⇒ rețea');
});

test('2. instalarea unei suite noi copiază fișierele cu `?v=` din cache-ul vechi (ultima versiune pe cale) și precache-ul; doar ce lipsește vine de pe rețea', async () => {
  const cacheuri = {}, { ctx, calls, numeCache } = context({ cacheuri });
  const vechi = await ctx.caches.open('trading-tools-tt-v900-2026-10-01');
  await vechi.put(BAZA + '/lib/data.js?v=26.10.19.1845', raspuns('DATA-VECHI')); await vechi.put(BAZA + '/lib/data.js?v=26.10.27.2240', raspuns('DATA-NOU'));
  await vechi.put(BAZA + '/holdings/holdings.js?v=26.10.28.1116', raspuns('HOLD')); await vechi.put(BAZA + '/nav.js', raspuns('NAV-PRECACHE'));
  let gata; await ctx.self.on_install({ waitUntil: (p) => { gata = p; } }); await gata;
  const nou = cacheuri[numeCache]; assert.ok(nou, 'cache-ul nou există');
  assert.equal(nou.map.get(BAZA + '/lib/data.js?v=26.10.27.2240').body, 'DATA-NOU', 'ultima versiune a căii e copiată');
  assert.ok(!nou.map.has(BAZA + '/lib/data.js?v=26.10.19.1845'), 'versiunea mai veche a aceleiași căi nu se mai cară');
  assert.equal(nou.map.get(BAZA + '/holdings/holdings.js?v=26.10.28.1116').body, 'HOLD');
  assert.equal(nou.map.get(BAZA + '/nav.js').body, 'NAV-PRECACHE', 'precache-ul se copiază ca înainte (fără rețea)');
  assert.ok(calls.fetch.every((u) => !/holdings\.js\?v=|data\.js\?v=/.test(u)), 'fișierele copiate nu se cer de pe rețea');
  const dinRetea = [...nou.map.values()].filter((r) => r.body === 'DIN-RETEA').length;   // FakeCache.add = „adus de pe rețea”
  assert.ok(dinRetea > 0 && dinRetea < 200, 'restul precache-ului (ce lipsea) vine de pe rețea: ' + dinRetea);
});

test('3. HTML-ul modulului cu `v=<versiunea aplicației>`: copia exactă din cache pe loc + revalidare în fundal; `v` nou sau fără `v` ⇒ rețea', async () => {
  const cacheuri = {}, { ctx, calls, numeCache } = context({ cacheuri, incet: true });
  const c = await ctx.caches.open(numeCache), html = (q) => BAZA + '/holdings/?app=decision-mobile-v2&v=' + q;
  await c.put(html('26.10.28.1116'), raspuns('HTML-1116'));
  const navigate = { mode: 'navigate', headers: { accept: 'text/html' } };
  // răspunsul vine înainte ca rețeaua (lentă, 60 ms) să termine: `respondWith` primește copia din cache, revalidarea rămâne în `waitUntil`
  let servit = null; const waits = []; const req = new ctx.Request(html('26.10.28.1116'), navigate);
  await ctx.self.on_fetch({ request: req, respondWith: (p) => { servit = p; }, waitUntil: (p) => waits.push(p) });
  const t0 = Date.now(), r = await servit;
  assert.equal(r.body, 'HTML-1116', 'copia exactă a versiunii, pe loc'); assert.ok(Date.now() - t0 < 50, 'nu așteaptă rețeaua'); assert.equal(waits.length, 1, 'revalidarea merge în fundal (waitUntil)');
  await Promise.allSettled(waits); assert.equal(calls.fetch.length, 1);
  assert.equal((await serve(ctx, html('26.10.28.2000'), navigate)).body, 'NOU', 'altă versiune a aplicației ⇒ rețea');
  assert.ok(c.map.has(html('26.10.28.2000')), 'copia versiunii noi intră în cache sub cheia cu `v`');
  await c.put(BAZA + '/holdings/', raspuns('HTML-FARA-V'));
  assert.equal((await serve(ctx, BAZA + '/holdings/', navigate)).body, 'NOU', 'fără `v` (deschis direct): network-first, ca înainte');
  assert.equal((await serve(ctx, BAZA + '/holdings/?v=825', navigate)).body, 'NOU', '`v` care nu e versiunea aplicației ⇒ tot network-first');
});
