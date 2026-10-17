// 17.10.2026 — „Bilanțul tău” (I-682 / I-686 / I-688) și „Ce necesită atenție” pe poziții (I-683), corelațiile (I-687).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const load = (files) => { const c = { Intl, Date, Math, JSON, Map, Set, URL, String, Number, Array, Object }; c.window = c; vm.createContext(c); for (const f of files) vm.runInContext(readFileSync(f, 'utf8'), c); return c; };
const c = load(['lib/journal-review.js', 'lib/today-attention.js', 'lib/market-verdict.js']), J = c.JournalReview, TA = c.TodayAttention, MV = c.MarketVerdict;
const fill = (id, ticker, side, date, extra = {}) => ({ id, ticker, side, date, quantity: 1, price: 100, ...extra });
const data = { accounts: { cont: { environment: 'live', items: [
  fill(1, 'AAPL_US_EQ', 'BUY', '2026-03-02T15:00:00Z'), fill(2, 'AAPL_US_EQ', 'SELL', '2026-03-20T15:00:00Z', { realized: 50, currency: 'USD' }),
  fill(3, 'NVDA_US_EQ', 'BUY', '2026-10-13T15:00:00Z'), fill(4, 'NVDA_US_EQ', 'SELL', '2026-10-15T15:00:00Z', { realized: -20, currency: 'USD' }),
  fill(5, 'TSLA_US_EQ', 'BUY', '2026-10-14T15:00:00Z'), fill(6, 'MSFT_US_EQ', 'SELL', '2025-06-10T15:00:00Z', { realized: 30, currency: 'USD' }), { id: 7, ticker: 'X', side: 'BUY' }] } } };
const bare = (n, f, start = Date.UTC(2025, 0, 1)) => Array.from({ length: n }, (_, i) => ({ t: start + i * 86400000, c: f(i) }));

test('execuțiile: toate cele valide, crescător; tickerele Trading 212 devin simboluri', () => {
  const tx = J.tranzactii(data, 'cont'); assert.equal(tx.length, 6); assert.equal(tx[0].symbol, 'MSFT'); assert.equal(J.sym('SAP_DE_EQ'), 'SAP');
  assert.equal(JSON.stringify(J.ani(tx)), '[2026,2025]');
});
test('I-688: săptămâna — de luni 00:00 (ora României), stopurile puse acum, intrările în zile Prudent / Defensiv din istoricul robotului', () => {
  const tx = J.tranzactii(data, 'cont'), now = Date.parse('2026-10-17T10:00:00Z');
  const s = J.saptamana(tx, { now, stops: new Set(['NVDA_US_EQ']), istoric: [{ asOf: '2026-10-13', label: 'defensiv' }, { asOf: '2026-10-14', label: 'neutru' }] });
  assert.equal(s.cumparari, 2); assert.equal(s.vanzari, 1); assert.equal(s.total, -20); assert.equal(s.moneda, 'USD'); assert.equal(s.cuStop, 1); assert.equal(s.inZileRele, 1);
});
test('I-682: verdictul din ziua intrării — notat de robot, altfel parțial (doar barele de până atunci)', () => {
  const tx = J.tranzactii(data, 'cont'), serii = { SPY: bare(700, (i) => 100 + i * 0.1), QQQ: bare(700, (i) => 100 + i * 0.1), '^VIX': bare(700, () => 14) };
  const v = J.verdictTranzactii(tx, [{ asOf: '2026-10-13', label: 'defensiv' }], serii);
  assert.equal(v.rows.length, 2); assert.equal(v.redus.n, 1); assert.equal(v.redus.total, -20); assert.equal(v.normal.n, 1); assert.equal(v.dinRobot, 1); // MSFT n-are cumpărare înainte de vânzare ⇒ nu intră
  assert.equal(v.rows.find((r) => r.ticker === 'AAPL_US_EQ').label, 'favorabil'); assert.equal(v.rows.find((r) => r.ticker === 'AAPL_US_EQ').sursa, 'partial');
  // fără privit în viitor: o prăbușire DUPĂ intrare nu schimbă verdictul zilei intrării
  const viitor = { ...serii, '^VIX': bare(700, (i) => (i > 430 ? 45 : 14)) }; assert.equal(J.partial('2026-03-02', viitor).label, 'favorabil');
});
test('I-686: raportul fiscal — vânzările anului în lei la cursul BNR din ziua vânzării (sau ultima zi publicată), câștig / pierdere separat, CSV', () => {
  const tx = J.tranzactii(data, 'cont'), curs = { '2026-03-19': { USD: 4.5 }, '2026-10-15': { USD: 4.7 } };
  const f = J.fiscal(tx, { an: 2026, curs }); assert.equal(f.rows.length, 2); assert.equal(f.castig, 50 * 4.5); assert.ok(Math.abs(f.pierdere + 20 * 4.7) < 1e-9); assert.equal(f.lipsa, 0);
  const csv = J.csv(f); assert.match(csv, /^Data;Ticker;/); assert.match(csv, /Net;;;;;;/);
  assert.equal(J.fiscal(tx, { an: 2026, curs: null }).lipsa, 2); // fără curs: nimic inventat
});
test('I-683: alertele pe poziții — în ordinea gravității; fără niciun stop = un singur rând', () => {
  const positions = [{ ticker: 'AAPL_US_EQ', value: 3000, unrealized: -600, weight: 30 }, { ticker: 'NVDA_US_EQ', value: 1000, unrealized: 50, weight: 10 }];
  const a = TA.alerte({ positions, stops: new Set(['NVDA_US_EQ']), earnings: [{ symbol: 'NVDA', date: '2026-10-19' }], now: Date.parse('2026-10-17T10:00:00Z') });
  assert.match(a[0].text, /AAPL: fără stop|NVDA raportează/); assert.ok(a.some((x) => /AAPL: −16,7% de la intrare/.test(x.text))); assert.ok(a.some((x) => /AAPL e 30% din cont/.test(x.text)));
  const toate = TA.alerte({ positions, stops: new Set() }); assert.equal(toate.filter((x) => /stop/.test(x.text)).length, 1); assert.match(toate[0].text, /Niciuna dintre cele 2 poziții/);
  assert.equal(TA.alerte({ positions, stops: null }).filter((x) => /stop/.test(x.text)).length, 0); // stopurile necitite: nu spun „fără stop”
});
test('I-687: pozițiile care se mișcă împreună formează un grup, cu ponderea însumată', () => {
  const r = (k) => bare(130, (i) => 100 * (1 + 0.03 * Math.sin(i / 2 + k)));
  const g = MV.corelatii({ A: r(0), B: r(0.05), C: bare(130, (i) => 100 * (1 + 0.03 * Math.cos(i * 1.7))) }, [{ s: 'A', value: 300 }, { s: 'B', value: 200 }, { s: 'C', value: 500 }], 1000);
  assert.equal(g.length, 1); assert.equal(JSON.stringify(g[0].simboluri), JSON.stringify(['A', 'B'])); assert.equal(g[0].pondere, 50);
});
