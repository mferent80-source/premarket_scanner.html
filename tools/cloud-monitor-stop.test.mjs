// 27.10.2026 (lotul A, I-749 + auditul A [6]): monitorul de pe server folosește O SINGURĂ definiție a stopului — copiile din lib/cloud-monitor.mjs
// (stopLa / stopValabil din lib/stop-setter.js, ordineStop din lib/t212-pending.js) dau exact aceleași răspunsuri pe aceleași cazuri; fișa zilei citește
// ordinele brokerului prin releu o dată pe zi după închidere și spune „N poziții fără ORDIN la broker”; ordinele necitite se spun, nu trec tăcut;
// zilele fără bursă la New York (sărbători) nu primesc fișă, iar în zilele scurte fișa vine după închiderea de la 13:00.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { stopLa, stopValabil, ordineStop, fisaZilei, dupaInchidere, monitorRules, monitorScope, US_INCHIS, US_SCURT } from '../lib/cloud-monitor.mjs';
import { handleCloud, runScheduled } from './cloud-sync-worker.mjs';

function ctx(files) { const c = { Date, JSON, Math, Number, String, Array, Object, Intl, Set, Map }; c.window = c; vm.createContext(c); for (const f of files) vm.runInContext(readFileSync(f, 'utf8'), c, { filename: f }); return c; }
const browser = ctx(['lib/stop-setter.js', 'lib/t212-pending.js', 'lib/exchange-calendar.js']);
const tezaVanduta = { stop: 90, stopCurrency: 'USD', updatedAt: '2026-01-10T10:00:00Z', history: [{ at: '2026-01-10T10:00:00Z', stop: 90, stopCurrency: 'USD' }] };
const tezaNoua = { stop: 90, stopCurrency: 'USD', updatedAt: '2026-10-15T10:00:00Z', history: [{ at: '2026-10-15T10:00:00Z', stop: 90, stopCurrency: 'USD' }] };

test('stopLa / stopValabil din monitor = StopSetter, caz cu caz (o singură definiție a stopului)', () => {
  let n = 0;
  for (const opened of [undefined, null, 'nu-e-data', '2026-01-01T00:00:00Z', '2026-10-14T15:00:00Z', '2026-10-15T10:30:00Z', '2026-10-15T11:30:00Z'])
    for (const t of [null, undefined, {}, { stop: 0 }, { stop: '90' }, { stop: -1 }, { stop: 90, updatedAt: '2026-10-15T10:00:00Z' }, { stop: 90, updatedAt: 'x' }, tezaVanduta, tezaNoua,
      { ...tezaNoua, history: [...tezaVanduta.history, { at: '2026-10-15T10:00:00Z', stop: 90 }] }, { ...tezaNoua, history: [...tezaVanduta.history, { at: '2026-10-15T10:00:00Z', stop: 91 }] },
      { stop: 90, history: [{ at: 'x', stop: 90 }] }, { stop: 90, history: [{ at: '2026-10-15T10:00:00Z', stop: 0 }, { at: '2026-10-16T10:00:00Z', stop: 90 }] }, { stop: 90, history: 'stricat' }]) {
      const p = { ticker: 'X', openedAt: opened };
      assert.equal(stopValabil(t, p), browser.StopSetter.stopValabil(t, p), 'stopValabil ' + JSON.stringify([t, p]));
      assert.equal(stopLa(t), browser.StopSetter.stopLa(t), 'stopLa ' + JSON.stringify(t)); n++;
    }
  assert.ok(n > 90);
});

test('ordineStop din monitor = T212Pending.ordineStop (ordinele STOP de vânzare, cel mai mic stop pe ticker)', () => {
  const cazuri = [[], null, [null, {}, { ticker: 'A', type: 'LIMIT', side: 'SELL', stopPrice: 5 }],
    [{ id: '1', ticker: 'A', type: 'STOP', side: 'SELL', quantity: -4, stopPrice: 90 }, { id: '2', ticker: 'A', type: 'STOP_LIMIT', side: null, quantity: 4, stopPrice: 85 }, { id: '3', ticker: 'B', type: 'stop', side: 'BUY', quantity: 1, stopPrice: 10 }, { id: '4', ticker: 'C', type: 'STOP', side: 'SELL', quantity: 'x', stopPrice: 0 }, { ticker: 'D', type: 'STOP', side: 'SELL', quantity: 2, stopPrice: 7 }]];
  for (const items of cazuri) assert.deepEqual([...ordineStop(items)], JSON.parse(JSON.stringify([...browser.T212Pending.ordineStop(items)])), JSON.stringify(items));
});

test('calendarul SUA al monitorului = ExchangeCalendar.markets.US (sărbători + zile scurte), ca fișa să nu plece în zilele fără bursă', () => {
  const US = browser.ExchangeCalendar.markets.US;
  assert.deepEqual([...US_INCHIS].sort(), [...US.closed].sort());
  assert.deepEqual(JSON.parse(JSON.stringify(US_SCURT)), JSON.parse(JSON.stringify(US.early)));
  assert.equal(dupaInchidere(Date.parse('2026-11-26T21:10:00Z')), false, 'Ziua Recunoștinței 2026: bursa închisă');
  assert.equal(dupaInchidere(Date.parse('2026-12-25T21:10:00Z')), false, 'Crăciun');
  assert.equal(dupaInchidere(Date.parse('2026-11-27T18:10:00Z')), true, 'ziua scurtă: 13:10 NY e după închiderea de la 13:00');
  assert.equal(dupaInchidere(Date.parse('2026-11-27T17:30:00Z')), false, '12:30 NY, încă deschis');
  assert.equal(dupaInchidere(Date.parse('2026-10-20T20:10:00Z')), true, 'marți obișnuită, 16:10 NY');
});

const scope = 'live:abc', summary = { currency: 'EUR', totalValue: 10000 }, NOW = Date.parse('2026-10-20T20:10:00Z');
const positions = [{ ticker: 'MU_US_EQ', quantity: 10, currentPrice: 100, instrumentCurrency: 'USD', currency: 'EUR', value: 900 }, { ticker: 'AAPL_US_EQ', quantity: 5, currentPrice: 200, instrumentCurrency: 'USD', currency: 'EUR', value: 900 }, { ticker: 'NVDA_US_EQ', quantity: 20, currentPrice: 50, instrumentCurrency: 'USD', currency: 'EUR', value: 900 }];
const notes = { [scope + '|MU_US_EQ']: { stop: 90, stopCurrency: 'USD' }, [scope + '|AAPL_US_EQ']: { stop: 180, stopCurrency: 'USD' } };

test('fișa cu ordinele brokerului citite: „N poziții fără ORDIN la broker”, stopul doar pe hârtie și ordinul parțial numite; căldura până la stopul care execută', () => {
  const ordine = [{ id: '1', ticker: 'MU_US_EQ', type: 'STOP', side: 'SELL', quantity: 10, stopPrice: 92 }, { id: '2', ticker: 'NVDA_US_EQ', type: 'STOP', side: 'SELL', quantity: 5, stopPrice: 45 }];
  const f = fisaZilei({ scope, summary, positions, notes, ordine, now: NOW });
  assert.equal(f.ordineCitite, true);
  assert.deepEqual(f.faraOrdin, ['AAPL_US_EQ', 'NVDA_US_EQ']); assert.deepEqual(f.peHartie, ['AAPL_US_EQ']); assert.deepEqual(f.partial, ['NVDA_US_EQ']);
  assert.match(f.text, /2 poziții fără ORDIN de stop la broker: AAPL, NVDA/); assert.match(f.text, /stop doar pe hârtie: AAPL/); assert.match(f.text, /ordin doar pentru o parte: NVDA/);
  assert.deepEqual(f.faraStop, ['NVDA_US_EQ'], 'NVDA: fără stop documentat și ordinul acoperă doar o parte ⇒ fără stop întreg');
  assert.equal(f.caldura, null);
  // cu stop documentat și pe NVDA: MU la ordinul de 92 (cel care execută), AAPL și NVDA la stopul documentat
  const g = fisaZilei({ scope, summary, positions, notes: { ...notes, [scope + '|NVDA_US_EQ']: { stop: 45, stopCurrency: 'USD' } }, ordine, now: NOW });
  assert.ok(Math.abs(g.caldura - ((100 - 92) * 10 + (200 - 180) * 5 + (50 - 45) * 20) * 0.9) < 1e-9, String(g.caldura));
  const toate = fisaZilei({ scope, summary, positions: positions.slice(0, 1), notes, ordine, now: NOW });
  assert.deepEqual(toate.faraOrdin, []); assert.match(toate.text, /toate pozițiile au ORDIN de stop la broker/);
});

test('fișa cu ordinele NECITITE: se spune motivul, iar stopurile sunt „documentate, neverificate la broker” (nu trec drept ordine)', () => {
  const f = fisaZilei({ scope, summary, positions, notes, ordine: null, ordineEroare: 'broker_permission_missing', now: NOW });
  assert.equal(f.ordineCitite, false); assert.equal(f.faraOrdin, null);
  assert.match(f.text, /ordinele brokerului NECITITE \(broker_permission_missing\)/); assert.match(f.text, /documentate, neverificate la broker/);
  assert.match(f.text, /fără stop documentat: NVDA/);
});

test('fișa și alertele monitorului nu mai iau stopul rămas în teza unei poziții VÂNDUTE (definiția cu openedAt)', () => {
  const p = [{ ...positions[0], openedAt: '2026-10-14T15:00:00Z' }];
  const f = fisaZilei({ scope, summary, positions: p, notes: { [scope + '|MU_US_EQ']: tezaVanduta }, now: NOW });
  assert.deepEqual(f.faraStop, ['MU_US_EQ']);
  const r = monitorRules({ scope, summary, positions: [{ ...p[0], currentPrice: 80 }], notes: { [scope + '|MU_US_EQ']: tezaVanduta }, now: NOW });
  assert.ok(!r.alerts.some((a) => a.type === 'stop'), 'fără alertă pe un stop care nu mai e al poziției');
  assert.ok(r.alerts.some((a) => a.type === 'coverage' && a.ticker === 'MU_US_EQ')); assert.equal(r.coverage.stops, 0);
  const bun = monitorRules({ scope, summary, positions: [{ ...p[0], currentPrice: 80 }], notes: { [scope + '|MU_US_EQ']: tezaNoua }, now: NOW });
  assert.ok(bun.alerts.some((a) => a.type === 'stop'));
});

// integrarea: monitorul programat, cu releul Trading 212 simulat; ora fixată la 16:10 New York (marți)
const FIX = Date.parse('2026-10-27T20:10:00Z'), RealDate = Date;
class FixDate extends RealDate { constructor(...a) { super(...(a.length ? a : [FixDate.t])); } static now() { return FixDate.t; } }
FixDate.t = FIX;
const credentials = { environment: 'live', key: 'fixture-key', secret: 'fixture-secret' }, ORIGIN = 'https://mferent80-source.github.io';
function setup(ordersResponse) {
  const sql = new DatabaseSync(':memory:'); sql.exec(readFileSync('tools/cloud-sync-schema.sql', 'utf8'));
  const token = Buffer.alloc(32, 1).toString('base64url');
  const db = { prepare(query) { const s = sql.prepare(query); const bound = (args) => ({ first: async () => s.get(...args) || null, all: async () => ({ results: s.all(...args) }), run: async () => ({ meta: { changes: Number(s.run(...args).changes) } }) }); return { ...bound([]), bind: (...args) => bound(args) }; } };
  const env = { CLOUD_DB: db, GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com', CLOUD_ENCRYPTION_KEY: Buffer.alloc(32, 91).toString('base64url') };
  sql.prepare('INSERT INTO cloud_sessions VALUES(?,?,?,?)').run(createHash('sha256').update(token).digest('base64url'), '111', 'fixture-111@example.test', Math.floor(FIX / 1000) + 3600);
  const calls = [];
  const upstream = async (url, options) => {
    calls.push({ url, method: options.method });
    if (url.endsWith('/equity/orders')) return ordersResponse();
    return new Response(JSON.stringify(url.includes('/summary') ? { currency: 'EUR', totalValue: 1000, cash: { availableToTrade: 900, reservedForOrders: 0 }, investments: { currentValue: 100, totalCost: 105, unrealizedProfitLoss: -5 } }
      : [{ instrument: { ticker: 'TEST_US_EQ', currency: 'USD' }, quantity: 2, averagePricePaid: 105, currentPrice: 99, walletImpact: { currency: 'EUR', currentValue: 180, unrealizedProfitLoss: -5 } }, { instrument: { ticker: 'MU_US_EQ', currency: 'USD' }, quantity: 1, averagePricePaid: 100, currentPrice: 110, walletImpact: { currency: 'EUR', currentValue: 99, unrealizedProfitLoss: 9 } }]), { headers: { 'Content-Type': 'application/json' } });
  };
  const api = async (path, method = 'GET', data) => { const r = await handleCloud(new Request('https://worker/api/cloud/' + path, { method, headers: { Origin: ORIGIN, Authorization: 'Bearer ' + token, ...(data ? { 'Content-Type': 'application/json' } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) }), env, upstream); return { status: r.status, body: await r.json() }; };
  return { sql, env, api, upstream, calls };
}
async function seed(s) {
  const sc = await monitorScope(credentials);
  await s.api('record', 'PUT', { key: 'cloud_credentials', value: credentials, revision: 0 });
  await s.api('record', 'PUT', { key: 'tt_holdings_theses_v1', value: { [sc + '|TEST_US_EQ']: { stop: 95, stopCurrency: 'USD' }, [sc + '|MU_US_EQ']: { stop: 100, stopCurrency: 'USD' } }, revision: 0 });
  assert.equal((await s.api('monitor', 'PUT', { enabled: true })).status, 200);
}
async function cuOraFixa(fn) { globalThis.Date = FixDate; try { return await fn(); } finally { globalThis.Date = RealDate; } }

test('monitorul citește ordinele brokerului prin releu O DATĂ pe zi, la fișă; fișa spune pozițiile fără ORDIN la broker', async () => {
  const s = setup(() => new Response(JSON.stringify([{ id: 7, ticker: 'TEST_US_EQ', type: 'STOP', quantity: -2, stopPrice: 95, status: 'NEW' }]), { headers: { 'Content-Type': 'application/json' } }));
  await cuOraFixa(async () => {
    await seed(s);
    await runScheduled(s.env, s.upstream, FIX);
    const m = (await s.api('monitor')).body.monitor, fisa = m.events.find((e) => e.type === 'fisa');
    assert.ok(fisa, 'fișa zilei e în inbox'); assert.equal(m.fisaZi, '2026-10-27');
    assert.equal(s.calls.filter((c) => c.url.endsWith('/equity/orders')).length, 1, 'ordinele se citesc o dată, la fișă');
    assert.ok(s.calls.every((c) => c.method === 'GET'), 'doar citire');
    assert.match(fisa.text, /1 poziție fără ORDIN de stop la broker: MU/); assert.match(fisa.text, /stop doar pe hârtie: MU/);
    FixDate.t = FIX + 6 * 60000;
    await runScheduled(s.env, s.upstream, FixDate.t);
    assert.equal(s.calls.filter((c) => c.url.endsWith('/equity/orders')).length, 1, 'a doua rulare din aceeași zi nu mai cere ordinele');
  }).finally(() => { FixDate.t = FIX; s.sql.close(); });
});

test('ordinele care nu se pot citi (permisiune lipsă) nu opresc fișa: motivul e scris, stopurile rămân „neverificate la broker”', async () => {
  const s = setup(() => new Response('{}', { status: 403 }));
  await cuOraFixa(async () => {
    await seed(s);
    await runScheduled(s.env, s.upstream, FIX);
    const m = (await s.api('monitor')).body.monitor, fisa = m.events.find((e) => e.type === 'fisa');
    assert.equal(m.lastError, null, 'monitorul în sine a mers'); assert.ok(fisa);
    assert.match(fisa.text, /ordinele brokerului NECITITE \(broker_permission_missing\)/);
    assert.ok(!JSON.stringify(m).includes('fixture-secret'));
  }).finally(() => s.sql.close());
});
