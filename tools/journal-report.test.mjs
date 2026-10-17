// 17.10.2026 — Jurnal → „Raport” (lib/journal-report.js): tranzacțiile închise, cifrele, R, excursia, ora, limita lunară, desenul.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const c = { Intl, Date, Math, JSON, Map, Set, URL, String, Number, Array, Object }; c.window = c; vm.createContext(c);
for (const f of ['lib/execution-review.js', 'lib/journal-report.js']) vm.runInContext(readFileSync(f, 'utf8'), c);
const J = c.JournalReport;
const f = (id, ticker, side, date, quantity, price, extra = {}) => ({ id, ticker, type: 'TRADE', side, date, quantity, price, priceCurrency: 'USD', currency: 'RON', ...extra });
const tax = (q) => [{ name: 'CURRENCY_CONVERSION_FEE', quantity: q, currency: 'RON' }];
const rows = [
  f('b1', 'AAPL_US_EQ', 'BUY', '2026-03-02T15:00:00Z', 10, 100, { taxes: tax(4) }),
  f('s1', 'AAPL_US_EQ', 'SELL', '2026-03-12T15:00:00Z', 4, 110, { realized: 180, taxes: tax(2) }),   // vânzare parțială
  f('s2', 'AAPL_US_EQ', 'SELL', '2026-03-20T15:00:00Z', 6, 95, { realized: -130 }),
  f('b2', 'NVDA_US_EQ', 'BUY', '2026-04-01T14:00:00Z', 5, 200),
  f('s3', 'NVDA_US_EQ', 'SELL', '2026-04-03T15:00:00Z', 5, 210, { realized: 220 }),
  f('s4', 'SAP_DE_EQ', 'SELL', '2026-04-05T10:00:00Z', 1, 150, { priceCurrency: 'EUR', realized: 40 }),       // fără cumpărare în istoric
  f('s5', 'MSFT_US_EQ', 'SELL', '2026-04-06T15:00:00Z', 1, 300, { currency: 'EUR', realized: 10 }),           // altă monedă a contului
  { id: 'x', ticker: 'MU_US_EQ', type: 'STOCK_SPLIT', side: 'BUY', date: '2026-03-03T15:00:00Z', quantity: 10, price: 1, priceCurrency: 'USD' },
];
const curs = { '2026-03-02': { USD: 4.5, EUR: 5 }, '2026-04-01': { USD: 4.6, EUR: 5 } };

test('tranzacțiile închise: o vânzare = un rând, legată FIFO; costurile proporționale; mărimea în lei la cursul BNR; alte monede și splituri în afară', () => {
  const r = J.calatorii(rows, { curs, moneda: 'RON' });
  assert.equal(r.moneda, 'RON'); assert.equal(r.rows.length, 4); assert.equal(r.alteMonede, 1); assert.equal(r.faraCumparare, 1);
  const s1 = r.rows.find((x) => x.id === 's1'), s2 = r.rows.find((x) => x.id === 's2');
  assert.equal(s1.entry, 100); assert.equal(s1.zile, 10); assert.ok(Math.abs(s1.pct - 10) < 1e-9); assert.ok(Math.abs(s1.cost - 4 * 100 * 4.5) < 1e-9);
  assert.ok(Math.abs(s1.fees - (2 + 4 * 0.4)) < 1e-9, 'costul vânzării + 4/10 din costul cumpărării'); assert.ok(Math.abs(s2.fees - 2.4) < 1e-9);
  const sap = r.rows.find((x) => x.id === 's4'); assert.equal(sap.entry, null); assert.equal(sap.zile, null); assert.equal(sap.rez, 40);
});
test('cifrele: rata, raportul câștig / pierdere, factorul de profit, scăderea de la vârf, seriile', () => {
  const tr = J.calatorii(rows, { curs, moneda: 'RON' }).rows, s = J.stat(tr);
  assert.equal(s.n, 4); assert.equal(s.rata, 75); assert.equal(s.net, 310); assert.ok(Math.abs(s.raport - (440 / 3) / 130) < 1e-9); assert.ok(Math.abs(s.pf - 440 / 130) < 1e-9);
  assert.equal(s.dd, 130); assert.equal(s.sW, 2); assert.equal(s.sL, 1);
});
test('ideea 1 — R: stopul din analiza salvată are prioritate față de Portofoliu; stopul peste intrare nu dă R', () => {
  const tr = J.calatorii(rows, { curs, moneda: 'RON' }).rows;
  const r = J.stopuriR(tr, { analize: [{ sellIds: ['s3'], record: { stop: 190, verdict: { title: 'Cumpără la retragere' } } }], teze: { NVDA_US_EQ: 150, AAPL_US_EQ: 90 } });
  const s3 = r.find((x) => x.id === 's3'), s1 = r.find((x) => x.id === 's1');
  assert.equal(s3.R, 1); assert.equal(s3.stopSursa, 'analiza'); assert.equal(s3.tip, 'Cumpără la retragere');
  assert.equal(s1.R, 1); assert.equal(s1.stopSursa, 'portofoliu'); assert.equal(J.rDin({ entry: 100, exit: 90 }, 120), null);
});
test('ideile 2 și 3 — cel mai jos / sus între intrare și ieșire, prețul la 5 sesiuni după; prețuri nepotrivite (split) = respinse', () => {
  const bars = Array.from({ length: 30 }, (_, i) => { const t = Date.UTC(2026, 2, 2, 20) + i * 86400000; return { t, h: 100 + i, l: 95 + i * 0.5, c: 98 + i }; });
  const e = J.excursie({ entry: 100, exit: 110, intrare: Date.parse('2026-03-02T15:00:00Z'), iesire: Date.parse('2026-03-12T15:00:00Z') }, bars);
  assert.ok(Math.abs(e.mfe - 10) < 1e-9); assert.ok(Math.abs(e.mae - -4.5) < 1e-9, 'cel mai jos din zilele DINTRE (95,5), nu minimul zilei intrării (95)'); assert.ok(Math.abs(e.dupa5 - ((98 + 15) / 110 - 1) * 100) < 1e-9);
  assert.equal(J.excursie({ entry: 1000, exit: 1100, intrare: bars[0].t, iesire: bars[5].t }, bars).nepotrivit, true);
});
test('ideea 6 — ora intrării la New York, și la schimbarea orei', () => {
  assert.equal(J.ORE[J.ora(Date.parse('2026-03-02T14:45:00Z'))], '9:30–10:30');  // iarnă: 09:45 NY
  assert.equal(J.ORE[J.ora(Date.parse('2026-07-01T13:45:00Z'))], '9:30–10:30');  // vară: 09:45 NY
  assert.equal(J.ORE[J.ora(Date.parse('2026-07-01T12:00:00Z'))], 'înainte de deschidere');
  assert.equal(J.ORE[J.ora(Date.parse('2026-07-01T20:30:00Z'))], 'după închidere');
});
test('ideea 5 — limita de pierdere pe lună: nesetată / ok / aproape / depășită', () => {
  const tr = [{ iesire: Date.parse('2026-10-05T12:00:00Z'), rez: -800 }, { iesire: Date.parse('2026-09-05T12:00:00Z'), rez: -5000 }], now = Date.parse('2026-10-17T12:00:00Z');
  assert.equal(J.limitaLuna(tr, null, now).stare, 'nesetat'); assert.equal(J.limitaLuna(tr, 1000, now).stare, 'aproape'); assert.equal(J.limitaLuna(tr, 700, now).stare, 'depasit'); assert.equal(J.limitaLuna(tr, 5000, now).stare, 'ok');
  assert.equal(J.limitaLuna(tr, 1000, now).folosit, 80);
});
test('raportul desenat: toate secțiunile la vedere, fără NaN / undefined, fără <details> pliat; gol = mesaj, nu eroare', () => {
  const tr = J.stopuriR(J.calatorii(rows, { curs, moneda: 'RON' }).rows, { teze: { AAPL_US_EQ: 90 } });
  const html = J.render({ tr, toate: tr, moneda: 'RON', perioada: 0, tickere: ['AAPL_US_EQ'], limita: 1000, now: Date.parse('2026-04-10T12:00:00Z') });
  for (const t of ['Raportul de execuție', 'Rata de câștig', 'Raport câștig / pierdere', 'Factor de profit', 'Ce spun cifrele', 'Limita de pierdere pe lună', 'Rezultatul cumulat', 'Pe luni', 'Distribuția rezultatelor', 'Câștigătoare față de pierzătoare', 'Obiceiuri', 'Rezultatul în R', 'Cât a mers prețul', 'Ziua intrării', 'Ora intrării', 'Mărimea poziției', 'Rezultatul pe tipul intrării', 'Calendarul zilelor', 'Pe ticker', 'Tranzacțiile închise'])
    assert.ok(html.includes(t), 'lipsește: ' + t);
  assert.doesNotMatch(html, /NaN|undefined|Infinity/); assert.doesNotMatch(html, /<details/);
  assert.match(J.render({ tr: [], toate: [], moneda: 'RON', perioada: 365 }), /Nicio vânzare/);
  assert.match(J.csv(tr, 'RON'), /^Ticker;Intrare;Ieșire/);
});

test('revizia 17.10 — split între intrare și ieșire: fără intrare / mișcare / R; vânzare acoperită parțial: fără mărime; stopul din Portofoliu doar pe poziția deschisă acum', () => {
  const r2 = [f('b1', 'X_US_EQ', 'BUY', '2026-01-05T15:00:00Z', 1, 1000), { id: 'sp', ticker: 'X_US_EQ', type: 'STOCK_SPLIT', side: 'BUY', date: '2026-01-10T15:00:00Z', quantity: 9, price: 0, priceCurrency: 'USD' },
    f('s1', 'X_US_EQ', 'SELL', '2026-01-20T15:00:00Z', 10, 110, { realized: 450 }),
    f('b2', 'Y_US_EQ', 'BUY', '2026-02-02T15:00:00Z', 4, 100), f('s2', 'Y_US_EQ', 'SELL', '2026-02-10T15:00:00Z', 10, 110, { realized: 90 }),
    f('b3', 'Z_US_EQ', 'BUY', '2026-01-02T15:00:00Z', 2, 100), f('s3', 'Z_US_EQ', 'SELL', '2026-01-09T15:00:00Z', 2, 110, { realized: 80 }),   // poziție veche, închisă
    f('b4', 'Z_US_EQ', 'BUY', '2026-03-02T15:00:00Z', 4, 100), f('s4', 'Z_US_EQ', 'SELL', '2026-03-09T15:00:00Z', 1, 105, { realized: 20 })];  // poziția de acum, vândută parțial
  const c2 = J.calatorii(r2, { curs, moneda: 'RON' }), x = c2.rows.find((r) => r.id === 's1'), y = c2.rows.find((r) => r.id === 's2');
  assert.equal(x.corp, true); assert.equal(x.entry, null); assert.equal(x.pct, null); assert.equal(x.rez, 450); assert.equal(c2.corporative, 1);
  assert.equal(y.partial, true); assert.equal(y.cost, null); assert.ok(Math.abs(y.pct - 10) < 1e-9); assert.equal(c2.partiale, 2); // Y și X (după split, 1 cumpărată / 10 vândute)
  const rr = J.stopuriR(c2.rows, { teze: { Z_US_EQ: 95 }, deschisa: c2.deschisa });
  assert.equal(rr.find((r) => r.id === 's3').R, null, 'tranzacția veche NU primește stopul de azi'); assert.equal(rr.find((r) => r.id === 's4').R, 1);
});
test('revizia 17.10 — valori aproape de zero nu blochează graficele; scăderea de la prima vânzare are dată; ziua după ora României; ora doar pentru SUA', () => {
  const t0 = Date.parse('2026-10-05T15:00:00Z'), tr = [{ id: 'a', ticker: 'A_US_EQ', sym: 'A', intrare: t0 - 86400000, iesire: t0, zile: 1, rez: 0.1 + 0.2, fees: 0 }, { id: 'b', ticker: 'B_US_EQ', sym: 'B', intrare: t0 - 86400000, iesire: t0 + 1000, zile: 1, rez: -0.3, fees: 0 }];
  const t1 = Date.now(), html = J.render({ tr, toate: tr, moneda: 'RON', perioada: 0, now: t0 + 86400000 }); assert.ok(Date.now() - t1 < 2000, 'desenul se termină repede'); assert.doesNotMatch(html, /NaN|Infinity/);
  const s = J.stat([{ iesire: t0, rez: -70 }, { iesire: t0 + 1, rez: 20 }]); assert.equal(s.ddDe, t0); assert.equal(s.dd, 70);
  const sap = [{ id: 'e', ticker: 'SAP_DE_EQ', sym: 'SAP', intrare: Date.parse('2026-03-02T08:00:00Z'), iesire: t0, zile: 3, rez: 10, fees: 0 }];
  const h2 = J.render({ tr: sap, toate: sap, moneda: 'RON', perioada: 0, now: t0 }); assert.match(h2, /Ziua intrării/); assert.doesNotMatch(h2, /Intrări înainte de deschidere \(ora New York\)\n1 tranzacții/);
});
