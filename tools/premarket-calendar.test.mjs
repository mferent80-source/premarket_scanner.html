// 19.10.2026 — I-720: calendarul de raportări în robotul probei Top Long — capacitatea există, dar e OPRITĂ pentru proba de acum
// (premarket-proba-1 judecă fără calendar, cum scrie protocolul din 18.10); se pornește doar la o repornire planificată a probei.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROTOCOL, versiune } from '../lib/premarket-proba.mjs';
import { motor, calendarPentruProba } from './premarket-jurnal.mjs';

const raspuns = (corp, ok = true, status = 200) => ({ ok, status, json: async () => corp });

// 27.10.2026: proba a repornit ca premarket-proba-2 (regula de judecată, I-741) cu comutatorul TOT oprit — motivul e în protocol.
test('the calendar is OFF for the running probe (premarket-proba-2, like premarket-proba-1): no request goes out, even with the key present', async () => {
  assert.equal(PROTOCOL.id, 'premarket-proba-2'); assert.equal(PROTOCOL.calendar, false); assert.equal(PROTOCOL.precedent.id, 'premarket-proba-1');
  let cereri = 0; const c = await calendarPentruProba(PROTOCOL, { FINNHUB_API_KEY: 'cheie' }, async () => { cereri++; return raspuns({ earningsCalendar: [] }); });
  assert.equal(c.folosit, false); assert.match(c.motiv, /premarket-proba-2/); assert.equal(cereri, 0);
});

test('switched on (a future probe), it reads Finnhub with the Actions key and keeps the same tickers as the page guard', async () => {
  const urls = [], on = { ...PROTOCOL, id: 'premarket-proba-3', calendar: true };
  const c = await calendarPentruProba(on, { FINNHUB_API_KEY: 'k/1' }, async (u) => { urls.push(u); return raspuns({ earningsCalendar: [
    { symbol: 'AAPL', date: '2026-10-30', hour: 'amc' }, { symbol: 'BRK.B', date: '2026-11-01' }, { symbol: '0700.HK', date: '2026-10-25' }, { symbol: 'MSFT' }] }); }, '2026-10-19');
  assert.equal(c.folosit, true); assert.equal(urls.length, 1);
  assert.match(urls[0], /^https:\/\/finnhub\.io\/api\/v1\/calendar\/earnings\?from=2026-10-19&to=2026-11-02&token=k%2F1$/);
  assert.deepEqual(c.items.map((x) => x.symbol), ['AAPL', 'BRK-B']);
});

test('switched on but without the key or with a broken answer, the robot stops (no day judged with mixed rules)', async () => {
  const on = { ...PROTOCOL, calendar: true };
  await assert.rejects(calendarPentruProba(on, {}, async () => raspuns({})), /FINNHUB_API_KEY/);
  await assert.rejects(calendarPentruProba(on, { FINNHUB_API_KEY: 'secret123' }, async () => raspuns({ error: 'x' })), (e) => /calendar/.test(e.message) && !/secret123/.test(e.message));
  await assert.rejects(calendarPentruProba(on, { FINNHUB_API_KEY: 'secret123' }, async () => raspuns(null, false, 429)), (e) => /429/.test(e.message) && !/secret123/.test(e.message));
});

test('the engine uses the calendar only when given; by default it stays “unverified” for every stock, as the protocol says', async () => {
  const fara = motor(async () => { throw Error('fără rețea'); });
  assert.equal(fara.EARN, undefined);
  await fara.hooks.scan(); assert.equal(fara.hooks.earningsInfo('AAPL').unverified, true);
  const azi = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
  const cu = motor(async () => { throw Error('fără rețea'); }, { calendar: { folosit: true, items: [{ symbol: 'AAPL', date: azi }] } });
  await cu.hooks.scan();
  assert.equal(cu.hooks.earningsInfo('AAPL').inFereastra, true); assert.equal(cu.hooks.earningsInfo('MSFT').text, 'fără earnings în 14z');
  assert.equal(versiune(cu.hooks), versiune(fara.hooks), 'aceleași reguli de clasament (calendarul e o intrare, nu o regulă)');
});

test('the robot asks for the calendar through the switch, the workflow passes the key, the protocol says when it turns on', () => {
  const src = readFileSync('tools/premarket-jurnal.mjs', 'utf8');
  assert.match(src, /calendarPentruProba\(PROTOCOL/); assert.match(src, /motor\(fetchCuBare, \{ calendar/);
  const y = readFileSync('.github/workflows/v1-proba.yml', 'utf8');
  assert.match(y, /FINNHUB_API_KEY: \$\{\{ secrets\.FINNHUB_API_KEY \}\}/);
  const doc = readFileSync('docs/premarket-proba-protocol.md', 'utf8');
  assert.match(doc, /## La următoarea repornire/); assert.match(doc, /PROTOCOL\.calendar/); assert.match(doc, /fără calendarul de raportări \(cheia Finnhub nu e în robot\)/);
  assert.match(doc, /## Protocolul v2[\s\S]*Comutatorul calendarului rămâne OPRIT/, 'v2 spune de ce repornirea din 27.10 nu pornește calendarul');
});
