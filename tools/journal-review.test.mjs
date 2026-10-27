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
  assert.equal(J.verdictTranzactii(tx, [{ asOf: '2026-10-13', label: 'defensiv' }], serii).dinRobot, 0, 'verdictul notat în seara zilei intrării NU se vede la 11:00');
  const v = J.verdictTranzactii(tx, [{ asOf: '2026-10-12', label: 'defensiv' }], serii);
  assert.equal(v.rows.length, 2); assert.equal(v.redus.n, 1); assert.equal(v.redus.total, -20); assert.equal(v.normal.n, 1); assert.equal(v.dinRobot, 1); // MSFT n-are cumpărare înainte de vânzare ⇒ nu intră
  assert.equal(v.rows.find((r) => r.ticker === 'AAPL_US_EQ').label, 'favorabil'); assert.equal(v.rows.find((r) => r.ticker === 'AAPL_US_EQ').sursa, 'partial');
  // fără privit în viitor: o prăbușire DUPĂ intrare nu schimbă verdictul zilei intrării
  const viitor = { ...serii, '^VIX': bare(700, (i) => (i > 430 ? 45 : 14)) }; assert.equal(J.partial('2026-03-02', viitor).label, 'favorabil');
});
// 27.10.2026 (audit C 🔵 16): vânzarea se leagă de DESCHIDEREA poziției (prima cumpărare după ce cantitatea era 0), ca Raportul (FIFO), nu de ultima adăugire
test('🔵 16: la scalare, verdictul „din ziua intrării” e al deschiderii poziției, nu al ultimei adăugiri', () => {
  const d2 = { accounts: { cont: { environment: 'live', items: [
    fill(1, 'NVDA_US_EQ', 'BUY', '2026-10-13T15:00:00Z'), fill(2, 'NVDA_US_EQ', 'BUY', '2026-10-14T15:00:00Z'), fill(3, 'NVDA_US_EQ', 'SELL', '2026-10-15T15:00:00Z', { quantity: 2, realized: -20, currency: 'USD' }),
    fill(4, 'NVDA_US_EQ', 'BUY', '2026-10-16T15:00:00Z'), fill(5, 'NVDA_US_EQ', 'SELL', '2026-10-19T15:00:00Z', { realized: 5, currency: 'USD' })] } } };
  const tx = J.tranzactii(d2, 'cont'), istoric = [{ asOf: '2026-10-12', label: 'defensiv' }, { asOf: '2026-10-13', label: 'favorabil' }, { asOf: '2026-10-15', label: 'prudent' }];
  const v = J.verdictTranzactii(tx, istoric, null);
  assert.equal(v.rows.length, 2);
  assert.equal(v.rows[0].intrare, Date.parse('2026-10-13T15:00:00Z'), 'deschiderea poziției, nu adăugirea din 14.10'); assert.equal(v.rows[0].label, 'defensiv');
  assert.equal(v.rows[1].intrare, Date.parse('2026-10-16T15:00:00Z'), 'după închiderea completă, poziția nouă are propria deschidere'); assert.equal(v.rows[1].label, 'prudent');
});

test('I-686: raportul fiscal — la cursul MEDIU ANUAL BNR (venituri din străinătate), cu cursul zilei alături; câștig / pierdere separat, CSV', () => {
  const tx = J.tranzactii(data, 'cont'), curs = { '2026-03-19': { USD: 4.5 }, '2026-10-15': { USD: 4.7 } };
  const f = J.fiscal(tx, { an: 2026, curs }); assert.equal(f.rows.length, 2); assert.ok(Math.abs(f.castig - 50 * 4.6) < 1e-9); assert.ok(Math.abs(f.pierdere + 20 * 4.6) < 1e-9); assert.equal(f.lipsa, 0);
  assert.equal(f.zi.castig, 50 * 4.5); assert.ok(Math.abs(f.zi.pierdere + 20 * 4.7) < 1e-9); assert.equal(f.provizoriu, true, 'două zile din an = provizoriu');
  const csv = J.csv(f); assert.match(csv, /^Data;Ticker;.*Curs mediu anual BNR/); assert.match(csv, /Net;;;;;;/); assert.match(csv, /provizoriu/);
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
test('🔵 15: „Intrări cu stop pus (acum)” folosește definiția unică StopSetter.stopValabil când pozițiile sunt citite (stopul vechi, de dinaintea poziției, nu se numără)', () => {
  const s = load(['lib/journal-review.js', 'lib/stop-setter.js']);
  const teze = { 'cont|NVDA_US_EQ': { stop: 90, history: [{ at: '2026-09-01T10:00:00Z', stop: 90 }] }, 'cont|TSLA_US_EQ': { stop: 200, history: [{ at: '2026-10-14T16:00:00Z', stop: 200 }] } };
  const storage = { getItem: (k) => (k === 'tt_holdings_theses_v1' ? JSON.stringify(teze) : null) };
  const pozitii = [{ ticker: 'NVDA_US_EQ', openedAt: '2026-10-13T15:00:00Z' }, { ticker: 'TSLA_US_EQ', openedAt: '2026-10-14T15:00:00Z' }];
  const acum = s.JournalReview.stopuri('cont', storage, { pozitii });
  assert.deepEqual([...acum].sort(), ['TSLA_US_EQ'], 'stopul NVDA e din septembrie, pus înaintea poziției de acum');
  assert.deepEqual([...s.JournalReview.stopuri('cont', storage)].sort(), ['NVDA_US_EQ', 'TSLA_US_EQ'], 'fără poziții citite: orice stop din teze, ca înainte');
});
