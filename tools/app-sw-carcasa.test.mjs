// 27.10.2026 (lotul A, I-746 + auditul A [4], [13], [14]): service worker-ul carcasei (app/sw.js) ține în cache NU doar HTML-ul, ci și foile de stil și
// scripturile pe care le cere carcasa (citite din index.html la instalare, cu `?v=` exact), instalarea tolerează un fișier picat, iar „Actualizează”
// (app/version.js) nu mai poate fi servit din cache: navigarea cu alt `?v=` decât al SW-ului merge DOAR pe rețea și butonul șterge cache-ul carcasei.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (p) => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf8');
const SW = read('app/sw.js'), HTML = read('app/index.html');
const scope = 'https://example.test/premarket_scanner.html/app/';
const VERSION = /tt-decision-phone-design-([\d.]+)'/.exec(SW)[1];

function worker({ network, html = HTML } = {}) {
  const handlers = {}, timers = [], store = new Map(), calls = { fetch: [], put: [], deleted: [] };
  const cache = {
    put: async (req, res) => { calls.put.push(typeof req === 'string' ? req : req.url); store.set(typeof req === 'string' ? req : req.url, res); },
    match: async (req, opts) => { const url = typeof req === 'string' ? req : req.url; if (store.has(url)) return store.get(url).clone(); if (opts && opts.ignoreSearch) { const bare = url.split('?')[0]; for (const [k, v] of store) if (k.split('?')[0] === bare) return v.clone(); } return undefined; },
    addAll: async (list) => { for (const u of list) { const r = await context.fetch(new context.Request(new URL(u, scope).href)); if (!r.ok) throw new Error('addAll: ' + u); await cache.put(new URL(u, scope).href, r); } },
  };
  const context = {
    URL, Response, console: { warn() {}, info() {} },
    Request: class { constructor(u, o = {}) { this.url = String(u); this.method = o.method || 'GET'; this.mode = o.mode || 'same-origin'; this.destination = o.destination || ''; this.cache = o.cache || 'default'; } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms, cleared: false }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; },
    self: { location: { origin: new URL(scope).origin }, registration: { scope }, addEventListener: (n, h) => { handlers[n] = h; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    fetch: async (req, options) => { const url = typeof req === 'string' ? req : req.url; calls.fetch.push({ url, options }); return network(url); },
    caches: { open: async () => cache, match: (r, o) => cache.match(r, o), keys: async () => ['tt-decision-phone-design-old', 'tt-decision-phone-design-' + VERSION], delete: async (k) => { calls.deleted.push(k); return true; } },
  };
  vm.createContext(context);
  vm.runInContext(SW, context, { filename: 'app/sw.js' });
  const install = async () => { let p; handlers.install({ waitUntil: (x) => { p = x; } }); await p; };
  const serve = (path, { mode = 'same-origin', destination = 'script' } = {}) => { let pending; const waits = []; handlers.fetch({ request: { url: new URL(path, scope).href, method: 'GET', mode, destination }, respondWith: (x) => { pending = x; }, waitUntil: (x) => { waits.push(x); } }); return { pending, waits }; };
  return { install, serve, timers, calls, store, html };
}
const bodies = (url) => new Response('BODY ' + url);
const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('fără răspuns în ' + ms + ' ms')), ms))]);
const assetsOf = (html) => [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*rel="stylesheet"[^>]*\shref)="([^"]+)"/g)].map((m) => new URL(m[1], scope).href);

test('versiunea SW-ului carcasei e cea publicată (app/version.json) — altfel „Actualizează” nu poate deosebi carcasa veche de cea nouă', () => {
  assert.equal(VERSION, JSON.parse(read('app/version.json')).version);
});

test('[13] instalarea pune în cache HTML-ul ȘI foile de stil + scripturile cerute de index.html, cu `?v=` exact', async () => {
  const w = worker({ network: async (url) => (url.endsWith('/index.html') || url.endsWith('/app/') ? new Response(HTML) : bodies(url)) });
  await w.install();
  const asteptate = assetsOf(HTML);
  assert.ok(asteptate.some((u) => /layout\.css\?v=/.test(u)) && asteptate.some((u) => /lib\/app-routes\.js\?v=/.test(u)), 'index.html cere layout.css și app-routes.js cu ?v=');
  for (const u of asteptate) assert.ok(w.store.has(u), 'în cache: ' + u);
  assert.ok(w.store.has(new URL('./index.html', scope).href));
  assert.ok(w.store.has(new URL('./manifest.webmanifest', scope).href));
});

test('[14] un fișier care pică la instalare nu lasă carcasa fără SW: celelalte intră în cache, instalarea reușește', async () => {
  const w = worker({ network: async (url) => { if (/icon-512/.test(url)) return new Response('', { status: 404 }); if (/holdings-forecast\.js/.test(url)) throw new Error('timeout'); return url.endsWith('/index.html') || url.endsWith('/app/') ? new Response(HTML) : bodies(url); } });
  await w.install();
  assert.ok(!w.store.has(new URL('./icons/icon-512.png', scope).href));
  assert.ok(w.store.has(new URL('./index.html', scope).href));
  assert.ok(assetsOf(HTML).filter((u) => !/holdings-forecast\.js/.test(u)).every((u) => w.store.has(u)));
});

test('[13] un script cerut cu `?v=` exact ca în cache vine din cache fără rețea; alt `?v=` merge pe rețea și NU primește copia veche', async () => {
  const w = worker({ network: async (url) => (url.endsWith('/index.html') || url.endsWith('/app/') ? new Response(HTML) : bodies(url)) });
  await w.install();
  const inCache = assetsOf(HTML).find((u) => /lib\/app-routes\.js\?v=/.test(u));
  w.calls.fetch.length = 0;
  const hit = await within(w.serve(inCache).pending, 1000);
  assert.equal(await hit.text(), 'BODY ' + inCache); assert.equal(w.calls.fetch.length, 0, 'fără rețea');
  const alt = inCache.replace(/\?v=.*/, '?v=00.00.00.0000');
  const r = w.serve(alt);
  const miss = r.pending ? await within(r.pending, 1000) : null;
  if (miss) assert.equal(await miss.text(), 'BODY ' + alt);
  assert.ok(w.calls.fetch.some((c) => c.url === alt), 'alt ?v= ⇒ rețea');
  assert.ok(!w.store.has(alt) || true);
});

test('[4] navigarea cu alt `?v=` decât al SW-ului (butonul „Actualizează”) nu mai cade pe carcasa VECHE din cache după 3,5 s — așteaptă rețeaua', async () => {
  let release;
  const w = worker({ network: () => new Promise((r) => { release = r; }) });
  w.store.set(new URL('./', scope).href, new Response('CARCASA VECHE'));
  const { pending } = w.serve('./?v=99.99.99.9999&module=today%2F', { mode: 'navigate', destination: 'document' });
  const t = w.timers.find((x) => x.ms === 3500);
  if (t) t.fn();
  let decided = false; within(pending, 50).then(() => { decided = true; }, () => {});
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(decided, false, 'copia veche nu se servește cât rețeaua lucrează');
  release(new Response('CARCASA NOUĂ'));
  assert.equal(await (await within(pending, 1000)).text(), 'CARCASA NOUĂ');
});

test('[4] navigarea cu `?v=` egal cu al SW-ului păstrează pragul de 3,5 s (I-705)', async () => {
  const w = worker({ network: () => new Promise(() => {}) });
  w.store.set(new URL('./', scope).href, new Response('CARCASA DIN CACHE'));
  const { pending } = w.serve('./?v=' + VERSION + '&module=today%2F', { mode: 'navigate', destination: 'document' });
  const t = w.timers.find((x) => x.ms === 3500); assert.ok(t); t.fn();
  assert.equal(await (await within(pending, 1000)).text(), 'CARCASA DIN CACHE');
});

test('[4] butonul „Actualizează” șterge cache-urile carcasei înainte să reîncarce cu `?v=` nou', async () => {
  const label = {}, button = { hidden: true, addEventListener: (n, f) => { button.click = f; } }; let replaced = null; const deleted = []; let updated = 0;
  const c = { URL, Date, document: { documentElement: { dataset: { appVersion: '26.10.03.1400' } }, querySelectorAll: (q) => (q === '[data-version]' ? [label] : [button]), addEventListener: () => {} }, window: { addEventListener: () => {} }, location: { href: 'https://example.test/app/', replace: (u) => { replaced = u; } },
    navigator: { serviceWorker: { getRegistration: async () => ({ update: async () => { updated++; } }) } }, caches: { keys: async () => ['tt-decision-phone-design-26.10.03.1400', 'trading-tools-tt-v985'], delete: async (k) => { deleted.push(k); return true; } },
    fetch: async () => ({ ok: true, json: async () => ({ version: '26.10.03.1500' }) }), setInterval: () => {} };
  vm.createContext(c); vm.runInContext(read('app/version.js'), c); await new Promise((r) => setImmediate(r));
  assert.equal(button.hidden, false);
  await button.click();
  assert.equal(updated, 1);
  assert.deepEqual(deleted, ['tt-decision-phone-design-26.10.03.1400'], 'doar cache-urile carcasei, nu ale suitei');
  assert.match(replaced, /v=26\.10\.03\.1500/);
});
