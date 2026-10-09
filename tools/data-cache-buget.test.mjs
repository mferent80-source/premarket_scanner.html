// v142 / tt-v852 (el, 29.09): stocarea suitei în Edge era PLINĂ (5,1 mil. caractere, ~10 MB) - cache-ul de prețuri `ttd:`
// singur avea 3,1 mil. (115 intrări, toate din ultima zi). El își făcea loc doar când scria EL; restul (poza Radarului,
// alertele, jurnalele) pica în liniște. Acum cache-ul are un BUGET: după scriere (cel mult o dată pe minut) și la quota plină
// scoate intrările cele mai vechi până intră în buget. Cheile care nu încep cu `ttd:` nu se ating niciodată.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function loadData({ quota = Infinity } = {}) {
  const store = new Map();
  const marime = () => [...store].reduce((s, [k, v]) => s + k.length + v.length, 0);
  const ctx = {
    console, setTimeout, clearTimeout, URL, Promise, JSON, Date, Math, isFinite, parseInt,
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { v = String(v); const vechi = store.has(k) ? k.length + store.get(k).length : 0; if (marime() - vechi + k.length + v.length > quota) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } store.set(k, v); },
      removeItem: k => store.delete(k),
      key: i => [...store.keys()][i],
      get length() { return store.size; },
    },
    fetch: async () => { throw new Error('fara retea'); },
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(ROOT, 'lib/data.js'), 'utf8'), ctx, { filename: 'data.js' });
  return { D: ctx.D, store, marime };
}
const K = 100000, bucata = (n) => 'x'.repeat(n);
const puneTtd = (store, n, t0) => { for (let i = 0; i < n; i++) store.set('ttd:vechi' + i, JSON.stringify({ t: t0 + i, v: bucata(K) })); };
const ttdMarime = (store) => [...store].filter(([k]) => k.startsWith('ttd:')).reduce((s, [k, v]) => s + k.length + v.length, 0);

test('invalid and future cache timestamps cannot pass either freshness window',()=>{
  const {D,store}=loadData();
  for(const t of [undefined,null,'bad',String(Date.now()),0,-1,Date.now()+3600000]){
    const raw=JSON.stringify({t,v:{price:123}});store.set('ttd:bad',raw);
    assert.equal(D.cacheGet('bad',1800),null);assert.equal(D.cacheGetStale('bad',3600),null);
    assert.equal(store.get('ttd:bad'),raw,'reading rejects the cache without deleting stored originals');
  }
});
test('valid cached data still respects the fresh and explicit stale limits',()=>{
  const {D,store}=loadData();store.set('ttd:old',JSON.stringify({t:Date.now()-2000000,v:123}));
  assert.equal(D.cacheGet('old',1800),null);assert.equal(D.cacheGetStale('old',3600),123);
  assert.equal(D.cacheGetStale('old',900),null);D.cacheSet('new',456);assert.equal(D.cacheGet('new',1800),456);
});

test('cacheTrim: scoate intrările ttd: cele mai VECHI până intră în buget; alte chei rămân neatinse', () => {
  const { D, store } = loadData();
  puneTtd(store, 30, Date.now() - 3600000); store.set('radar_cheie', 'cheia'); store.set('wl_hist_cache', bucata(K));
  const scoase = D.cacheTrim(1000000);
  assert.ok(scoase >= 20, 'a scos ' + scoase);
  assert.ok(ttdMarime(store) <= 1000000, 'ttd în buget: ' + ttdMarime(store));
  assert.ok(!store.has('ttd:vechi0') && store.has('ttd:vechi29'), 'pleacă cele vechi, rămân cele noi');
  assert.equal(store.get('radar_cheie'), 'cheia'); assert.ok(store.has('wl_hist_cache'), 'cheile care nu sunt cache rămân');
});

test('cacheSet: cache-ul care a trecut de buget se strânge singur (nu mai crește până umple stocarea)', () => {
  const { D, store } = loadData();
  puneTtd(store, 30, Date.now() - 3600000);   // 3 mil. caractere, peste bugetul implicit
  D.cacheSet('nou', { p: 1 });
  assert.ok(ttdMarime(store) <= 2000000, 'după o scriere, ttd e în buget: ' + ttdMarime(store));
  assert.ok(store.has('ttd:nou'), 'intrarea nouă e acolo');
});

test('cacheSet la quota plină: face loc cât să intre și reîncearcă (nu doar 10 intrări)', () => {
  const { D, store } = loadData({ quota: 3200000 });
  store.set('alte_date', bucata(1100000));
  for (let i = 0; i < 40; i++) store.set('ttd:v' + i, JSON.stringify({ t: Date.now() - 3600000 + i, v: bucata(50000) }));   // ~3,1 mil.: plin
  D.cacheSet('mare', bucata(800000));   // cele 10 mai vechi (500 K) nu ajungeau
  assert.ok(store.has('ttd:mare'), 'a intrat după ce și-a făcut loc');
  assert.equal(store.get('alte_date').length, 1100000, 'datele altora neatinse');
});
