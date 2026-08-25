// Gardă pentru „proxy-ul care servește vechituri cu 200 OK".
//
// 25.08.2026, 17:13–18:50: pagina /alerts/ a arătat o oră și jumătate prețurile de la
// 17:13, cu chip RTH și pill LIVE, fără NICIUN avertisment. Toate ipotezele obișnuite
// au picat pe rând: transportul mergea (workerul răspundea în 0,25 s), codul de pe
// Pages era identic cu cel local, service worker-ul era cel nou, iar pagina deschisă
// direct într-un profil curat mergea perfect.
//
// Cauza: scorul workerului propriu căzuse sub −3 în localStorage, deci lanțul cădea pe
// `corsproxy.io` — care întorcea 200 OK cu un răspuns Yahoo VALID dar ÎNGHEȚAT de 33 de
// minute (aceeași `regularMarketTime` la apeluri făcute la minute distanță). Validarea
// verifica FORMA răspunsului (`d && d.chart`), nu PROSPEȚIMEA lui, deci îl accepta ca
// succes: `_lastOkTs` = acum, zero eșecuri raportate, ecranul zicea LIVE.
//
// Probat pe viu prin CDP: același proxy, cu un parametru unic pe URL, a întors imediat
// cotația de acum 0 min. Deci cache-ul era pe URL — iar leacul e să nu-i mai dăm de
// două ori același URL pentru o cotație live.
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
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(ROOT, 'lib/data.js'), 'utf8'), ctx, { filename: 'data.js' });
  return ctx.D;
}

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart/AVGO?interval=1m&range=1d';
const okRes = body => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => body });

test('cotația live cere URL cu marcaj anti-cache — proxy-ul nu mai poate servi din cache', async () => {
  const cerute = [];
  const D = loadData({ responder: u => { cerute.push(u); return okRes({ chart: { result: [{}] } }); } });
  await D.fetchJSON(YAHOO, { ttl: 0, bust: 20, cacheKey: 'x:AVGO', validate: d => d && d.chart });
  assert.equal(cerute.length, 1, 'un singur proxy a fost lovit');
  const tinta = decodeURIComponent(cerute[0]);
  assert.match(tinta, /[?&]_t=\d+/, 'URL-ul către Yahoo trebuie să poarte marcajul _t');
  const t = Number(tinta.match(/[?&]_t=(\d+)/)[1]);
  const acum = Math.floor(Date.now() / 20000);
  assert.ok(Math.abs(t - acum) <= 1, `_t=${t} trebuie să fie fereastra de 20s curentă (${acum})`);
});

test('marcajul e stabil în aceeași fereastră — nu spargem cache-ul propriu la fiecare apel', async () => {
  const cerute = [];
  const D = loadData({ responder: u => { cerute.push(String(u)); return okRes({ chart: { result: [{}] } }); } });
  await D.fetchJSON(YAHOO, { ttl: 0, bust: 20, cacheKey: 'a', validate: d => d && d.chart });
  await D.fetchJSON(YAHOO, { ttl: 0, bust: 20, cacheKey: 'b', validate: d => d && d.chart });
  const t = cerute.map(u => decodeURIComponent(u).match(/[?&]_t=(\d+)/)[1]);
  assert.equal(t[0], t[1], 'două cereri în aceeași fereastră de 20s folosesc același marcaj');
});

test('fără bust, URL-ul rămâne neatins (restul suitei nu se schimbă)', async () => {
  const cerute = [];
  const D = loadData({ responder: u => { cerute.push(String(u)); return okRes({ chart: { result: [{}] } }); } });
  await D.fetchJSON(YAHOO, { ttl: 0, cacheKey: 'z', validate: d => d && d.chart });
  assert.doesNotMatch(decodeURIComponent(cerute[0]), /[?&]_t=/, 'fără bust nu adăugăm nimic');
});

test('un răspuns cu cotația mai VECHE decât cea deja știută nu are voie să treacă drept bună', () => {
  const PD = require('../lib/price-day.js');
  assert.equal(typeof PD.quoteWentBackwards, 'function', 'price-day expune garda de regresie');
  const acum = Date.now();
  // cotația nouă e cu 30 min în urma celei cunoscute → cache de proxy, nu preț nou
  assert.equal(PD.quoteWentBackwards(acum - 30 * 60000, acum), true);
  // aceeași cotație (bursă ilichidă, nicio tranzacție nouă) → legitim, se acceptă
  assert.equal(PD.quoteWentBackwards(acum, acum), false);
  // cotație mai nouă → normal
  assert.equal(PD.quoteWentBackwards(acum, acum - 60000), false);
  // fără istoric → nu blocăm primul preț
  assert.equal(PD.quoteWentBackwards(acum - 30 * 60000, null), false);
});

test('fetchDay cere marcajul anti-cache (regresie: sa nu-l scoata nimeni)', async () => {
  const PD2 = require('../lib/price-day.js');
  let primite = null;
  await PD2.fetchDay('AVGO', {
    publish: false,
    fetchJSON: async (u, o) => { primite = o; return { chart: { result: [{ meta: { regularMarketPrice: 1 } }] } }; }
  });
  assert.ok(primite, 'fetchDay chiar a cerut date');
  assert.ok(Number(primite.bust) > 0, 'fetchDay trebuie sa ceara bust pentru cotatia live');
});

test('pagina /alerts/ apără prețul afișat de o cotație care sare înapoi', () => {
  const html = readFileSync(join(ROOT, 'alerts/index.html'), 'utf8');
  assert.match(html, /quoteWentBackwards/, 'poll-ul trebuie să folosească garda de regresie');
});
