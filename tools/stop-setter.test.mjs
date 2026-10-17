// 17.10.2026 — stopul la fiecare poziție: variantele (−5% / 2 × ATR între 3% și 8%), salvarea în Portofoliu, avertizarea severă, stopul LA INTRARE în Raport.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const c = { Intl, Date, Math, JSON, Map, Set, URL, String, Number, Array, Object, WeakMap, Float64Array }; c.window = c; c.localStorage = mem(); vm.createContext(c);
for (const f of ['lib/holdings-notes.js', 'lib/stop-setter.js', 'lib/today-attention.js', 'lib/execution-review.js', 'lib/journal-report.js']) vm.runInContext(readFileSync(f, 'utf8'), c);
const S = c.StopSetter, TA = c.TodayAttention, J = c.JournalReport, DAY = 86400000;

test('ATR(14) în procente din ultima închidere', () => {
  const bars = Array.from({ length: 20 }, (_, i) => ({ h: 102, l: 98, c: 100 })); assert.ok(Math.abs(S.atrPct(bars) - 4) < 1e-9); assert.equal(S.atrPct(bars.slice(0, 10)), null);
});
test('variantele: −5% implicit; după agitație = 2 × ATR, între 3% și 8%; semn când prețul e deja sub stop', () => {
  let p = S.propuneri({ intrare: 100, acum: 102, atr: 1.2 }); assert.equal(p[0].id, 'fix'); assert.equal(p[0].implicit, true); assert.ok(Math.abs(p[0].stop - 95) < 1e-9);
  assert.equal(p[1].pct, 3); assert.equal(p[1].limitat, 'min');
  p = S.propuneri({ intrare: 100, acum: 102, atr: 2.5 }); assert.equal(p[1].pct, 5); assert.equal(p[1].limitat, null);
  p = S.propuneri({ intrare: 100, acum: 90, atr: 6 }); assert.equal(p[1].pct, 8); assert.equal(p[1].limitat, 'max'); assert.equal(p[0].subPret, true, 'acum 90 < stop 95');
  assert.equal(S.propuneri({ intrare: 100, atr: null }).length, 1, 'fără bare: doar −5%');
});
test('salvarea în Portofoliu: stopul apare în teze (cheia scope|ticker, cu istoric și oră) și alerta „fără stop” dispare', () => {
  const s = mem(), poz = { ticker: 'AAPL_US_EQ', quantity: 2, averagePrice: 200, currentPrice: 210, instrumentCurrency: 'USD' };
  assert.equal(S.salveaza({ scope: 'live1', poz, stop: 190, tinta: 230, storage: s }), null);
  const t = JSON.parse(s.getItem('tt_holdings_theses_v1'))['live1|AAPL_US_EQ']; assert.equal(t.stop, 190); assert.equal(t.targetPrice, 230); assert.equal(t.history.length, 1);
  assert.ok(TA.stopuri('live1', s).has('AAPL_US_EQ'));
  assert.match(S.salveaza({ scope: 'live1', poz, stop: 250, tinta: 240, storage: s }), /Ținta trebuie să fie peste stop/);
  assert.match(S.salveaza({ scope: 'live1', poz: { ...poz, instrumentCurrency: null }, stop: 190, storage: s }), /Moneda/);
  assert.equal(S.faraStop({ positions: [poz, { ...poz, ticker: 'NVDA_US_EQ' }] }, TA.stopuri('live1', s)).length, 1);
});
test('avertizarea severă: poziția fără stop e cel mai grav semnal, prima, marcată „sever”', () => {
  const a = TA.alerte({ positions: [{ ticker: 'AAPL_US_EQ', value: 3000, unrealized: -600, weight: 30 }, { ticker: 'NVDA_US_EQ', value: 1000, unrealized: 50, weight: 10 }], stops: new Set(['NVDA_US_EQ']) });
  assert.equal(a[0].sever, true); assert.equal(a[0].grav, 5); assert.match(a[0].text, /⛔ AAPL: fără stop pus/);
  const toate = TA.alerte({ positions: [{ ticker: 'A_US_EQ', value: 1 }, { ticker: 'B_US_EQ', value: 1 }], stops: new Set() }); assert.equal(toate[0].sever, true); assert.match(toate[0].text, /Niciuna dintre cele 2 poziții/);
});
test('Raportul: stopul pus în primele 24 h după intrare = stopul LA INTRARE (R, planul, regula −1 R); cel pus mai târziu nu', () => {
  const s = mem(), poz = { ticker: 'X_US_EQ', quantity: 1, averagePrice: 100, currentPrice: 100, instrumentCurrency: 'USD' };
  const t0 = Date.parse('2026-10-01T15:00:00Z');
  const th = { 'p|X_US_EQ': { stop: 90, history: [{ at: new Date(t0 + 2 * 3600000).toISOString(), stop: 95, targetPrice: 110 }, { at: new Date(t0 + 3 * DAY).toISOString(), stop: 90 }] }, 'p|Y_US_EQ': { stop: 90, history: [{ at: new Date(t0 + 3 * DAY).toISOString(), stop: 90 }] } };
  const ist = S.istoric(th, 'p'); assert.equal(ist.X_US_EQ.length, 2);
  const rows = [{ id: 'a', ticker: 'X_US_EQ', intrare: t0, iesire: t0 + 5 * DAY, entry: 100, exit: 105, pct: 5 }, { id: 'b', ticker: 'Y_US_EQ', intrare: t0, iesire: t0 + 5 * DAY, entry: 100, exit: 105, pct: 5 }];
  const r = J.stopuriR(rows, { istoricStop: ist, deschisa: {} });
  assert.equal(r[0].stopSursa, 'la-intrare'); assert.equal(r[0].stop, 95); assert.equal(r[0].tinta, 110); assert.equal(r[0].R, 1);
  assert.equal(r[1].R, null, 'stopul pus la 3 zile după intrare nu e stop la intrare');
  assert.equal(J.planVsExecutie(r).manual.length, 1);
  void s; void poz;
});
test('alarma pe Discord: lista tickerelor CU stop pleacă la worker (cheia de citire), doar la schimbare; fără cheie nu pleacă nimic', async () => {
  const s = mem(), trimise = []; const f = async (u, o) => { trimise.push({ u, o }); return { ok: true, status: 200 }; };
  s.setItem('tt_holdings_theses_v1', JSON.stringify({ 'live1|AAPL_US_EQ': { stop: 190 }, 'live1|TSLA_US_EQ': { stop: '' }, 'alt|NVDA_US_EQ': { stop: 100 } }));
  assert.equal((await S.trimiteLista({ storage: s, fetchImpl: f })).stare, 'fara-cheie'); assert.equal(trimise.length, 0);
  s.setItem('radar_cheie', 'c'.repeat(32));
  const r = await S.trimiteLista({ storage: s, fetchImpl: f }); assert.equal(r.stare, 'trimis'); assert.match(trimise[0].u, /paznic-radar\.mferent80\.workers\.dev\/stopuri$/);
  assert.equal(trimise[0].o.headers.authorization, 'Bearer ' + 'c'.repeat(32)); assert.deepEqual(JSON.parse(trimise[0].o.body).cuStop, ['AAPL_US_EQ', 'NVDA_US_EQ']);
  assert.equal((await S.trimiteLista({ storage: s, fetchImpl: f })).stare, 'neschimbat'); assert.equal(trimise.length, 1);
  assert.equal((await S.trimiteLista({ storage: s, fetchImpl: f, fortat: true })).stare, 'trimis');
  assert.equal((await S.trimiteLista({ storage: s, fetchImpl: async () => ({ ok: false, status: 401 }), fortat: true })).stare, 'cheie-gresita');
});
