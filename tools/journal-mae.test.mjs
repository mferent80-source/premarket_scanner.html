// 27.10.2026 (I-762): MAE / MFE și „cea mai bună ieșire” din barele intraday Yahoo (1 minut până la 7 zile, 5 minute până la 60 de zile),
// calculate LA CERERE și ținute în cache local (după 60 de zile Yahoo nu mai are barele — rezultatul rămâne). Doar barele aflate integral între
// intrare și ieșire + prețurile tale (bara intrării are și prețuri de dinainte de cumpărare). Agregate pe etichete.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function lume() {
  const store = new Map(), storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const c = { console, JSON, Math, Number, Intl, Date, Map, Set }; c.window = c; vm.createContext(c);
  vm.runInContext(readFileSync('lib/journal-mae.js', 'utf8'), c);
  return { X: c.JournalMae, storage, store };
}
const NOW = Date.parse('2026-10-27T20:00:00Z'), D = 86400000, M5 = 300000;
const T = Date.parse('2026-10-26T14:00:00Z'); // luni 10:00 New York
const rand = (o = {}) => ({ id: 's1', ticker: 'AAPL_US_EQ', sym: 'AAPL', intrare: T, iesire: T + 60 * 60000, entry: 100, exit: 104, stop: 98, stopSursa: 'analiza', R: 2, rez: 40, etichete: [], ...o });
const bara = (t, o, h, l, c) => ({ t, o, h, l, c, v: 1 });
const bare = [bara(T - M5, 95, 96, 90, 95), bara(T - 60000, 99, 100.5, 97, 100), // bara intrării începe înainte de cumpărare: nu se folosește
  ...Array.from({ length: 11 }, (_, i) => bara(T + (i + 1) * M5 - 60000, 100, i === 5 ? 106 : 102, i === 2 ? 99 : 100, 101)).filter((b) => b.t + M5 <= T + 60 * 60000),
  bara(T + 60 * 60000 + M5, 104, 110, 103, 109)]; // după ieșire: nu se folosește

test('eligibilitatea: 1 minut până la 7 zile, 5 minute până la 60, mai vechi nu; doar acțiunile din SUA, fără vânzări parțiale / split', () => {
  const { X } = lume();
  assert.deepEqual(JSON.parse(JSON.stringify(X.eligibil(rand({ intrare: NOW - 3 * D }), NOW))), { ok: true, interval: '1m', range: '7d', simbol: 'AAPL' });
  assert.equal(X.eligibil(rand({ intrare: NOW - 30 * D }), NOW).interval, '5m');
  const vechi = X.eligibil(rand({ intrare: NOW - 90 * D }), NOW); assert.equal(vechi.ok, false); assert.match(vechi.motiv, /60 de zile/);
  assert.equal(X.eligibil(rand({ ticker: 'SAP_DE_EQ' }), NOW).ok, false);
  assert.equal(X.eligibil(rand({ partial: true }), NOW).ok, false); assert.equal(X.eligibil(rand({ corp: true }), NOW).ok, false);
});

test('calculul: MAE / MFE în % și în R, cea mai bună ieșire și cât a rămas pe masă; barele dinainte de intrare și de după ieșire nu intră', () => {
  const { X } = lume(), r = X.calcul(rand(), bare, '5m');
  assert.equal(r.nepotrivit, undefined);
  assert.ok(Math.abs(r.mae - -1) < 1e-9, 'MAE ' + r.mae); assert.ok(Math.abs(r.maeR - -0.5) < 1e-9);
  assert.ok(Math.abs(r.mfe - 6) < 1e-9, 'MFE ' + r.mfe); assert.ok(Math.abs(r.mfeR - 3) < 1e-9);
  assert.ok(Math.abs(r.bestR - 3) < 1e-9); assert.ok(Math.abs(r.lasatR - 1) < 1e-9, 'cea mai bună 3 R − realizat 2 R');
  assert.equal(r.interval, '5m'); assert.ok(r.bare >= 9);
  const faraStop = X.calcul(rand({ stop: null, R: null }), bare, '5m'); assert.equal(faraStop.maeR, null); assert.ok(Math.abs(faraStop.mfe - 6) < 1e-9);
});

test('prețurile Yahoo care nu se potrivesc (split / altă bursă) ⇒ „nepotrivit”, nu cifre inventate; fără bare în fereastră ⇒ null', () => {
  const { X } = lume();
  assert.equal(X.calcul(rand(), bare.map((b) => ({ ...b, o: b.o / 4, h: b.h / 4, l: b.l / 4, c: b.c / 4 })), '5m').nepotrivit, true);
  assert.equal(X.calcul(rand(), [bara(T - M5, 1, 2, 1, 1)], '5m'), null);
});

test('cache-ul local ține rezultatul pe id-ul vânzării (rămâne și după ce Yahoo nu mai are barele)', () => {
  const w = lume(), r = w.X.calcul(rand(), bare, '5m');
  w.X.scrieCache(w.storage, { s1: { ...r, la: NOW } });
  assert.ok(Math.abs(w.X.citesteCache(w.storage).s1.mfeR - 3) < 1e-9);
  assert.equal(w.store.has('tt_journal_mae_v1'), true);
});

test('agregatele: pe toate tranzacțiile calculate și pe fiecare etichetă', () => {
  const { X } = lume(), r = X.calcul(rand(), bare, '5m');
  const tr = [rand({ etichete: ['early-exit'] }), rand({ id: 's2', etichete: ['early-exit', 'plan'] }), rand({ id: 's3' })];
  const cache = { s1: r, s2: { ...r, maeR: -1, mfeR: 1, bestR: 1, lasatR: 0 } };
  const a = X.agregate(tr, cache);
  assert.equal(a.toate.n, 2); assert.ok(Math.abs(a.toate.maeR - -0.75) < 1e-9); assert.ok(Math.abs(a.toate.lasatR - 0.5) < 1e-9);
  const ee = a.peEticheta.find((x) => x.k === 'early-exit'); assert.equal(ee.n, 2);
  assert.equal(a.peEticheta.find((x) => x.k === 'plan').n, 1);
});

test('panoul: butonul „la cerere” cu numărul de eligibile, cifrele cu o zecimală, avertismentul că cea mai bună ieșire se vede doar după', () => {
  const { X } = lume(), r = X.calcul(rand(), bare, '5m');
  const html = X.html([rand()], { s1: r }, { eligibile: 4, stare: '' });
  assert.match(html, /data-jrr-mae/); assert.match(html, /4 tranzacții/);
  assert.match(html, /\+3,0 R/); assert.match(html, /−0,5 R/); assert.match(html, /se vede doar după/);
  assert.doesNotMatch(html, /3,00/);
});

test('poza de probă: zero după rotunjire fără semn', () => {
  const { X } = lume(), r = X.calcul(rand(), bare, '5m');
  assert.doesNotMatch(X.html([rand()], { s1: { ...r, lasatR: -0.04, maeR: -0.01 } }, { eligibile: 0 }), /−0,0/);
});
