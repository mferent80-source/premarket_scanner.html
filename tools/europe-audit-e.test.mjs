// 27.10.2026 (audit E B6 / B7 / B8): Europa — o monedă în plus în răspunsul BCE nu mai oprește calculatorul de risc (lipsa uneia
// necesare îl oprește în continuare), pragul de rulaj fără piață (SEK) iese, textele spun cadența reală și sursa sărbătorilor.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const now = Date.parse('2026-10-06T20:00:00Z');
function setup() {
  const c = { console, Intl, Date, Map, Set, Math, Number, Array, Object, Error }; c.window = c; vm.createContext(c);
  for (const f of ['lib/daily-series.js', 'europe-stocks/salt-list.js', 'europe-stocks/universe.js', 'europe-stocks/decision.js', 'europe-stocks/model.js', 'europe-stocks/finance.js']) vm.runInContext(readFileSync(f, 'utf8'), c, { filename: f });
  return c;
}
const rates = () => ['USD', 'GBP', 'CHF', 'DKK', 'RON'].map((quote, i) => ({ base: 'EUR', quote, date: '2026-10-06', rate: [1.1269, .8488, .9359, 7.4747, 5.351][i] }));
test('B8: un curs în plus (altă monedă) e ignorat; lipsa unei monede necesare, dublura sau data amestecată opresc în continuare', () => {
  const c = setup();
  const t = c.EuropeFinance.parseRates([...rates(), { base: 'EUR', quote: 'JPY', date: '2026-10-06', rate: 162.1 }], now);
  assert.equal(t.rates.RON, 5.351); assert.equal(t.rates.JPY, undefined);
  assert.throws(() => c.EuropeFinance.parseRates(rates().slice(1), now), /incomplete/);
  assert.throws(() => c.EuropeFinance.parseRates([...rates(), { base: 'EUR', quote: 'JPY', date: '2026-10-05', rate: 162.1 }], now));
  assert.throws(() => c.EuropeFinance.parseRates([...rates(), rates()[0]], now));
});
test('B7: pragurile de rulaj există doar pentru monedele pieței din listă (fără SEK fără piață)', () => {
  const c = setup(), monede = new Set(c.EuropeUniverse.stocks.map((s) => c.EuropeUniverse.describe(s.symbol || s).currency).filter(Boolean));
  for (const m of Object.keys(c.EuropeModel.liquidity)) assert.ok(monede.has(m), m + ' fără nicio acțiune în listă');
  for (const m of monede) assert.ok(Number.isFinite(c.EuropeModel.liquidity[m]), m + ' fără prag de rulaj');
});
test('B6: textele spun cadența reală (EOD, o dată pe sesiune) și sursa sărbătorilor (calendarul bursier)', () => {
  const html = readFileSync('europe-stocks/index.html', 'utf8'), eng = readFileSync('europe-stocks/engine.js', 'utf8');
  assert.doesNotMatch(html, /Actualizare automată la 5 minute/); assert.match(html, /o dată pe sesiune/);
  assert.doesNotMatch(eng, /Calendarul sărbătorilor nu este confirmat/); assert.match(eng, /calendarul bursier/);
});
