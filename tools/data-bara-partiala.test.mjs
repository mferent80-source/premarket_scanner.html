// I-698 pct. 4 (19.10.2026): o serie salvată în cache ÎNAINTE de închiderea pieței era servită încă 30 min (ttl) DUPĂ
// închidere ⇒ bara parțială a zilei trecea drept „închiderea zilei” (sesiunea devine „încheiată” la închidere + 15 min),
// iar rezultatul calculat atunci rămânea „valabil” toată noaptea. Acum: un răspuns citit înainte de închiderea sesiunii lui
// (+ 15 min, aceeași toleranță ca ExchangeCalendar.latest) nu se mai ia din cache după închidere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idbFals } from './idb-fals.mjs';
import { loadData, yahoo } from './data-serii-fixturi.mjs';

const MIN = 60000;
const yh = (cerute) => cerute.filter((u) => /finance\.yahoo\.com/.test(decodeURIComponent(u)));
const intrare = (t, endMs) => JSON.stringify({ t, v: yahoo('AAPL', 24, { end: endMs }) });

for (const [nume, t, end, asteptat] of [
  ['citit la 15:50, închis la 16:00, acum 16:10 ⇒ din rețea', Date.now() - 20 * MIN, Date.now() - 10 * MIN, 1],
  ['citit la 16:05 (în toleranța de 15 min), acum 16:10 ⇒ din rețea', Date.now() - 5 * MIN, Date.now() - 10 * MIN, 1],
  ['citit la 16:20, după închidere + 15 ⇒ din cache', Date.now() - 2 * MIN, Date.now() - 22 * MIN, 0],
  ['citit la 11:00, piața încă deschisă (închide peste o oră) ⇒ din cache', Date.now() - 10 * MIN, Date.now() + 60 * MIN, 0],
]) {
  test('localStorage (fetchStock): ' + nume, async () => {
    const store = new Map([['ttd:yh:AAPL:2y:1d', intrare(t, end)]]);
    const { D, cerute } = loadData({ store });
    await D.fetchStock('AAPL', { range: '2y', interval: '1d', ttl: 1800 });
    assert.equal(yh(cerute).length, asteptat);
  });
  test('IndexedDB (fetchStock): ' + nume, async () => {
    const idb = idbFals(); idb.baza.set('serii', { date: new Map([['yh:AAPL:2y:1d', JSON.parse(intrare(t, end))]]), indexuri: { t: 't' } });
    const { D, cerute } = loadData({ idb });
    await D.fetchStock('AAPL', { range: '1y', interval: '1d', ttl: 1800 });
    assert.equal(yh(cerute).length, asteptat);
  });
  test('D.fetchJSON generic (răspuns Yahoo chart în ttd:): ' + nume, async () => {
    const store = new Map([['ttd:hub:SPY', intrare(t, end)]]);
    const { D, cerute } = loadData({ store });
    await D.fetchJSON('https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=5d&interval=1d', { ttl: 1800, cacheKey: 'hub:SPY' });
    assert.equal(yh(cerute).length, asteptat);
  });
}

test('răspunsurile care nu sunt Yahoo chart se servesc din cache ca înainte', async () => {
  const store = new Map([['ttd:fund:BTCUSDT', JSON.stringify({ t: Date.now() - 5 * MIN, v: { lastFundingRate: '0.0001' } })]]);
  const { D, cerute } = loadData({ store });
  const j = await D.fetchJSON('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT', { ttl: 600, cacheKey: 'fund:BTCUSDT' });
  assert.equal(j.lastFundingRate, '0.0001'); assert.equal(cerute.length, 0);
});
