// 27.10.2026 (I-761): detectoarele de comportament, deterministe, pe ordinele Trading 212 + planuri: răzbunare (intrare la < 30 min după o
// ieșire pe pierdere), mărime crescută după 2 pierderi (> 1,25 × mediana ultimelor 5 cumpărări), pierdere peste stop (R < −1,25 față de stopul
// planului), „din frig” (prima cumpărare a zilei New York). Fiecare: n, R mediu (față de restul), trendul pe 4 săptămâni, filtrul Raportului.
// Tiltmeter: 3 note pe zi (somn, concentrare, stres, 1–5) legate de R-ul zilei. Pragurile sunt convenții (docs/politica-adaugiri-C.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const c = { console, JSON, Math, Number, Intl, Date, Map, Set }; c.window = c; vm.createContext(c);
vm.runInContext(readFileSync('lib/journal-comportament.js', 'utf8'), c);
const K = c.JournalComportament, H = 3600000, M = 60000, D = 24 * H;
const T0 = Date.parse('2026-10-19T14:00:00Z'), NOW = Date.parse('2026-10-27T18:00:00Z'); // luni 10:00 New York
const buy = (id, t, amount, ticker = 'AAPL_US_EQ') => ({ id, orderId: 'o-' + id, ticker, side: 'BUY', type: 'TRADE', date: new Date(t).toISOString(), quantity: 1, price: 100, amount: -amount, currency: 'EUR' });
const rows = [buy('a1', T0, 1000), buy('b1', T0 + 2 * H + 10 * M, 1000), buy('c1', T0 + 5 * H, 2000), buy('d1', T0 + D + 5 * M, 1000, 'MSFT_US_EQ')];
const tr = [
  { id: 'sa', ticker: 'AAPL_US_EQ', buyIds: ['a1'], intrare: T0, iesire: T0 + 2 * H, rez: -50, R: -1, stopSursa: 'analiza' },
  { id: 'sb', ticker: 'AAPL_US_EQ', buyIds: ['b1'], intrare: T0 + 2 * H + 10 * M, iesire: T0 + 4 * H, rez: -60, R: -1.5, stopSursa: 'analiza' },
  { id: 'sc', ticker: 'AAPL_US_EQ', buyIds: ['c1'], intrare: T0 + 5 * H, iesire: T0 + 6 * H, rez: 100, R: 1, stopSursa: 'la-intrare' },
  { id: 'sd', ticker: 'MSFT_US_EQ', buyIds: ['d1'], intrare: T0 + D + 5 * M, iesire: T0 + D + 3 * H, rez: 20, R: 0.4, stopSursa: 'portofoliu' }];

test('răzbunarea: cumpărarea la 10 min după ieșirea pe pierdere; nu și cea la 60 de min', () => {
  const d = K.detectoare(tr, rows, { now: NOW });
  assert.equal(d.revenge.n, 1); assert.deepEqual(Array.from(d.revenge.ids), ['sb']); assert.equal(d.revenge.R, -1.5);
});
test('mărimea crescută după 2 pierderi la rând: 2.000 € față de mediana 1.000 € a cumpărărilor de dinainte', () => {
  const d = K.detectoare(tr, rows, { now: NOW });
  assert.equal(d.marire.n, 1); assert.deepEqual(Array.from(d.marire.ids), ['sc']); assert.equal(d.marire.R, 1);
  const egal = rows.map((r) => (r.id === 'c1' ? { ...r, amount: -1200 } : r));
  assert.equal(K.detectoare(tr, egal, { now: NOW }).marire.n, 0, '1,2 × mediana nu trece pragul de 1,25');
});
test('pierderea peste stop: doar față de stopul PLANULUI (analiza / la intrare), R < −1,25', () => {
  const d = K.detectoare(tr, rows, { now: NOW });
  assert.equal(d.pesteStop.n, 1); assert.deepEqual(Array.from(d.pesteStop.ids), ['sb']);
  const port = tr.map((x) => (x.id === 'sb' ? { ...x, stopSursa: 'portofoliu' } : x));
  assert.equal(K.detectoare(port, rows, { now: NOW }).pesteStop.n, 0, 'stopul pus acum în Portofoliu nu e stopul planului');
});
test('„din frig”: prima cumpărare a fiecărei zile New York; R mediu față de restul', () => {
  const d = K.detectoare(tr, rows, { now: NOW });
  assert.equal(d.frig.n, 2); assert.deepEqual(Array.from(d.frig.ids).sort(), ['sa', 'sd']);
  assert.ok(Math.abs(d.frig.R - (-0.3)) < 1e-9); assert.ok(Math.abs(d.frig.restR - (-0.25)) < 1e-9, 'restul: (−1,5 + 1) / 2');
});
test('trendul pe 4 săptămâni: numărul pe fiecare săptămână New York, de la cea mai veche la cea de acum', () => {
  const d = K.detectoare(tr, rows, { now: NOW });
  assert.deepEqual(Array.from(d.frig.trend, (w) => w.n), [0, 0, 2, 0]);
  assert.deepEqual(Array.from(d.frig.trend, (w) => w.de), ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
});
test('Tiltmeter: notele zilei (somn, concentrare, stres) lângă R-ul zilei; jos (1–2) față de sus (4–5)', () => {
  const note = { '2026-10-19': { somn: 2, concentrare: 3, stres: 4 }, '2026-10-20': { somn: 5, concentrare: 4, stres: 1 }, '2026-10-21': { somn: 3, concentrare: 3, stres: 3 } };
  const t = K.tilt(tr, note, { now: NOW });
  const z19 = t.zile.find((z) => z.zi === '2026-10-19'), z21 = t.zile.find((z) => z.zi === '2026-10-21');
  assert.equal(z19.R, -1.5); assert.equal(z19.n, 3); assert.equal(z21.n, 0, 'zi notată fără tranzacții');
  assert.deepEqual([t.pe.somn.jos.n, t.pe.somn.jos.R, t.pe.somn.sus.n, t.pe.somn.sus.R], [1, -1.5, 1, 0.4]);
  assert.deepEqual([t.pe.stres.sus.n, t.pe.stres.sus.R], [1, -1.5]);
  assert.equal(K.valideazaNota({ somn: 6, concentrare: 3, stres: 3 }).ok, false); assert.equal(K.valideazaNota({ somn: 3, concentrare: 3, stres: 3 }).ok, true);
});
test('panoul: fiecare detector cu regula, n, R cu o zecimală, trendul și butonul de filtru; sub 10 cazuri „prea puține”', () => {
  const html = K.html(K.detectoare(tr, rows, { now: NOW }), K.tilt(tr, {}, { now: NOW }), { activ: 'revenge', azi: '2026-10-27' });
  for (const t of ['Răzbunare după pierdere', 'Mărime crescută după 2 pierderi', 'Pierdere peste stop', 'Din frig']) assert.ok(html.includes(t), t);
  assert.match(html, /data-jrr-det="revenge"[^>]*aria-pressed="true"/);
  assert.match(html, /−1,5 R/); assert.match(html, /prea puține/);
  assert.match(html, /data-jrr-tilt="somn"/); assert.match(html, /convenții/);
  assert.doesNotMatch(html, /−1,50/, 'o singură zecimală');
});

test('poza de probă: o medie care se rotunjește la zero nu are semn („0,0 R”, nu „−0,0 R”); o notă fără zile spune „fără zile”', () => {
  const d = K.detectoare(tr.map((x) => ({ ...x, R: x.id === 'sa' ? -0.03 : x.R })), rows, { now: NOW });
  const html = K.html({ ...d, lista: [{ ...d.frig, R: -0.03, restR: 0.02 }] }, K.tilt(tr, { '2026-10-19': { somn: 2, concentrare: 3, stres: 4 } }, { now: NOW }), {});
  assert.doesNotMatch(html, /−0,0/); assert.match(html, /0,0 R/);
  assert.match(html, /Concentrare: slabă \(1–2\) — fără zile/); assert.doesNotMatch(html, /— —/);
});

test('poza de probă: „0,0 R” nu e colorat ca pierdere; butonul unui tipar fără cazuri e dezactivat', () => {
  const d = K.detectoare(tr, rows, { now: NOW });
  const html = K.html({ ...d, lista: [{ ...d.frig, R: -0.03 }, { ...d.revenge, n: 0, ids: [] }] }, K.tilt(tr, {}, { now: NOW }), {});
  assert.doesNotMatch(html, /class="neg">0,0 R/); assert.match(html, /data-jrr-det="revenge" aria-pressed="false" disabled/);
});
