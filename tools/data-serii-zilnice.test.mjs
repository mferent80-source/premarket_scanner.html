// I-704 (19.10.2026): un singur cache de serii zilnice în IndexedDB în locul cheilor `ttd:` din localStorage.
// Pe PC-ul lui, localStorage-ul originii era 4,86 din ~5,2 mil. caractere; 595 chei `ttd:` = 1,6 mil. Reguli V1 cere `2y`,
// Premarket `1y` ⇒ chei diferite ⇒ 85/85 cereri din nou după o rulare V1. Acum o descărcare `2y` servește și `1y` (tăiată).
// Fără IndexedDB (mod privat, browser vechi) ⇒ aceleași chei `ttd:yh:…:1d` din localStorage de dinainte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idbFals } from './idb-fals.mjs';
import { loadData } from './data-serii-fixturi.mjs';

const yh = (cerute) => cerute.filter((u) => /finance\.yahoo\.com/.test(decodeURIComponent(u)));
const ttdYh = (store) => [...store.keys()].filter((k) => /^ttd:yh:/.test(k));

test('IndexedDB: o descărcare 2y servește și cererea 1y (fără a doua cerere), tăiată la ultimul an', async () => {
  const idb = idbFals(), { D, cerute, store } = loadData({ idb });
  const b2 = await D.fetchStock('AAPL', { range: '2y', interval: '1d', ttl: 1800 });
  assert.equal(yh(cerute).length, 1);
  const b1 = await D.fetchStock('AAPL', { range: '1y', interval: '1d', ttl: 1800 });
  assert.equal(yh(cerute).length, 1, 'cererea 1y a venit din cache-ul 2y');
  const an = new Date(); an.setUTCFullYear(an.getUTCFullYear() - 1);
  assert.ok(b1.length < b2.length && b1.length > 240, b1.length + ' / ' + b2.length);
  assert.ok(b1[0].t >= an.getTime() && b1[0].t - an.getTime() < 4 * 86400000, 'prima bară e la ~un an în urmă: ' + new Date(b1[0].t).toISOString());
  assert.deepEqual({ ...b1.at(-1) }, { ...b2.at(-1) }, 'ultima bară e aceeași');
  assert.equal(b1.meta.symbol, 'AAPL'); assert.equal(b1.meta.timezone, 'America/New_York');
  assert.equal(b1.meta.corporateEvents.length, 1, 'evenimentele din afara anului rămân afară');
  assert.ok(Number.isFinite(b1.meta.retrievedAt), 'momentul citirii din cache e păstrat');
  assert.deepEqual(ttdYh(store), [], 'nicio cheie ttd:yh: în localStorage');
});

test('IndexedDB: după reîncărcarea paginii seria vine din IndexedDB, nu din rețea', async () => {
  const idb = idbFals(), store = new Map();
  const p1 = loadData({ idb, store }); await p1.D.fetchStock('MSFT', { range: '2y', interval: '1d', ttl: 1800 });
  await new Promise((r) => setTimeout(r, 20));   // scrierea în IndexedDB e asincronă
  const p2 = loadData({ idb, store });
  const b = await p2.D.fetchStock('MSFT', { range: '1y', interval: '1d', ttl: 1800 });
  assert.equal(yh(p2.cerute).length, 0, 'zero cereri după F5');
  assert.ok(b.length > 240);
});

test('IndexedDB: cheile vechi ttd:yh:…:1d se curăță la prima deschidere; celelalte chei rămân', async () => {
  const store = new Map([['ttd:yh:MSFT:2y:1d', '{"t":1,"v":{}}'], ['ttd:yh:MSFT:1y:1d', '{"t":1,"v":{}}'], ['ttd:yh:MSFT:1y:5m', '{"t":1,"v":{}}'], ['ttd:pd:y1m:AVGO', 'x'], ['radar_poza', 'y']]);
  const { D } = loadData({ idb: idbFals(), store });
  await D.fetchStock('AAPL', { range: '1y', interval: '1d', ttl: 1800 });
  assert.deepEqual([...store.keys()].filter((k) => k !== 'ttd_proxy_health').sort(), ['radar_poza', 'ttd:pd:y1m:AVGO', 'ttd:yh:MSFT:1y:5m']);
});

test('fără IndexedDB: localStorage ca înainte (aceleași chei ttd:yh:…:1d), dar 2y servește și 1y', async () => {
  const { D, cerute, store } = loadData();
  await D.fetchStock('AAPL', { range: '2y', interval: '1d', ttl: 1800 });
  await D.fetchStock('AAPL', { range: '1y', interval: '1d', ttl: 1800 });
  assert.equal(yh(cerute).length, 1);
  assert.deepEqual(ttdYh(store), ['ttd:yh:AAPL:2y:1d']);
});

test('IndexedDB care pică la deschidere (mod privat) ⇒ localStorage, fără eroare', async () => {
  const { D, cerute, store } = loadData({ idb: idbFals({ picaLaDeschidere: true }) });
  const b = await D.fetchStock('AAPL', { range: '1y', interval: '1d', ttl: 1800 });
  assert.ok(b.length > 200); assert.equal(yh(cerute).length, 1);
  assert.deepEqual(ttdYh(store), ['ttd:yh:AAPL:1y:1d']);
});

test('IndexedDB care atârnă ⇒ după cel mult ~2 s merge pe localStorage', async () => {
  const { D, store } = loadData({ idb: idbFals({ atarnaLaDeschidere: true }) });
  const t0 = Date.now();
  const b = await D.fetchStock('AAPL', { range: '1y', interval: '1d', ttl: 1800 });
  assert.ok(b.length > 200); assert.ok(Date.now() - t0 < 3500, (Date.now() - t0) + ' ms');
  assert.deepEqual(ttdYh(store), ['ttd:yh:AAPL:1y:1d']);
});

test('ttl 0: mereu din rețea, nimic scris (ca înainte)', async () => {
  const idb = idbFals(), { D, cerute, store } = loadData({ idb });
  await D.fetchStock('AAPL', { range: '5y', interval: '1d', ttl: 0 });
  await D.fetchStock('AAPL', { range: '5y', interval: '1d', ttl: 0 });
  assert.equal(yh(cerute).length, 2);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(idb.jurnal.put, 0); assert.deepEqual(ttdYh(store), []);
});

test('o serie mai SCURTĂ nu servește una mai lungă; `max` / `ytd` doar pe cheia lor', async () => {
  const { D, cerute } = loadData({ idb: idbFals() });
  await D.fetchStock('AAPL', { range: '1y', interval: '1d', ttl: 1800 });
  await D.fetchStock('AAPL', { range: '2y', interval: '1d', ttl: 1800 });
  await D.fetchStock('AAPL', { range: 'max', interval: '1d', ttl: 1800 });
  assert.equal(yh(cerute).length, 3);
  await D.fetchStock('AAPL', { range: '6mo', interval: '1d', ttl: 1800 });
  assert.equal(yh(cerute).length, 3, '6mo vine din 1y/2y');
});

test('TTL-ul cererii se respectă și pe seria mai lungă', async () => {
  const { D, cerute } = loadData({ idb: idbFals() });
  await D.fetchStock('AAPL', { range: '2y', interval: '1d', ttl: 1800 });
  await new Promise((r) => setTimeout(r, 1100));
  await D.fetchStock('AAPL', { range: '1y', interval: '1d', ttl: 1 });
  assert.equal(yh(cerute).length, 2, 'seria de acum >1 s nu e bună pentru ttl 1 s');
});

test('intraday (5m) rămâne pe calea de dinainte (ttd: în localStorage)', async () => {
  const { D, store } = loadData({ idb: idbFals() });
  await D.fetchStock('AAPL', { range: '1d', interval: '5m', ttl: 60 });
  assert.deepEqual(ttdYh(store), ['ttd:yh:AAPL:1d:5m']);
});

test('intrările mai vechi de 3 zile se scot din IndexedDB (curățare amânată după deschidere)', async () => {
  const idb = idbFals(), { D } = loadData({ idb });
  await D.fetchStock('AAPL', { range: '1y', interval: '1d', ttl: 1800 });
  await new Promise((r) => setTimeout(r, 20));
  const dep = [...idb.baza.values()][0].date;
  dep.set('yh:VECHI:2y:1d', { t: Date.now() - 4 * 86400000, v: {} });
  const p2 = loadData({ idb }); await p2.D.fetchStock('NVDA', { range: '1y', interval: '1d', ttl: 1800 });
  await new Promise((r) => setTimeout(r, 3600));
  assert.equal(dep.has('yh:VECHI:2y:1d'), false, 'intrarea veche a plecat');
  assert.equal(dep.has('yh:AAPL:1y:1d'), true, 'cea nouă a rămas');
});

test('D.cacheClear golește și seriile zilnice', async () => {
  const idb = idbFals(), { D, cerute } = loadData({ idb });
  await D.fetchStock('AAPL', { range: '1y', interval: '1d', ttl: 1800 });
  D.cacheClear();
  await new Promise((r) => setTimeout(r, 20));
  await D.fetchStock('AAPL', { range: '1y', interval: '1d', ttl: 1800 });
  assert.equal(yh(cerute).length, 2);
});
