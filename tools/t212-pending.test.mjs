// 20.10.2026 (I-723): stopul la broker verificat — releul expune ordinele în așteptare (doar citire), aplicația le ține local și spune pe fiecare
// poziție „stop la broker DA / NU / necitit”; Astăzi: „stop doar pe hârtie”; Planuri: eticheta în căldura portofoliului.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { pendingOrder } from '../lib/trading212-model.mjs';
import { handle, ROUTES } from './trading212-worker.mjs';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const NOW = Date.parse('2026-10-20T12:00:00Z');
function ctx(files, store = new Map()) {
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
  const c = { console, Date: Clock, Intl, JSON, Math, localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } };
  c.window = c; vm.createContext(c);
  for (const f of files) vm.runInContext(readFileSync(f, 'utf8'), c);
  return c;
}
const t212 = (o = {}) => ({ id: 77, ticker: 'MU_US_EQ', type: 'STOP', quantity: -5.5, stopPrice: 800.5, limitPrice: null, status: 'NEW', timeValidity: 'GOOD_TILL_CANCEL', creationTime: '2026-10-19T14:00:00Z', ...o });

test('pendingOrder: forma releului — vânzarea cu cantitate negativă devine side SELL cu cantitate pozitivă; instrument.ticker acceptat; forma rea ⇒ schema', () => {
  const o = pendingOrder(t212());
  assert.deepEqual(o, { id: '77', ticker: 'MU_US_EQ', type: 'STOP', side: 'SELL', quantity: 5.5, stopPrice: 800.5, limitPrice: null, status: 'NEW', timeValidity: 'GOOD_TILL_CANCEL', createdAt: '2026-10-19T14:00:00Z', currency: null });
  assert.equal(pendingOrder({ instrument: { ticker: 'AAPL_US_EQ', currency: 'USD' }, quantity: 2, type: 'LIMIT', limitPrice: 100 }).side, 'BUY');
  assert.equal(pendingOrder({ ticker: 'X', side: 'sell', quantity: 3 }).side, 'SELL');
  assert.throws(() => pendingOrder(null), /schema/); assert.throws(() => pendingOrder([1]), /schema/);
});

test('releul: GET /api/trading212/orders-pending citește /api/v0/equity/orders, mapează ordinele și nu acceptă cursor sau POST', async () => {
  const headers = { Origin: 'https://mferent80-source.github.io', Authorization: 'Basic ' + btoa('k:s'), 'X-T212-Environment': 'live' }, calls = [];
  const upstream = async (url) => { calls.push(url); return new Response(JSON.stringify([t212(), t212({ id: 78, ticker: 'AAPL_US_EQ', type: 'LIMIT', quantity: 2, stopPrice: null, limitPrice: 150 })]), { status: 200, headers: { 'Content-Type': 'application/json' } }); };
  const r = await handle(new Request('https://relay.workers.dev/api/trading212/orders-pending', { headers }), { T212_AUTH_MODE: 'session' }, upstream), b = await r.json();
  assert.equal(r.status, 200); assert.equal(ROUTES['orders-pending'], '/api/v0/equity/orders'); assert.equal(calls[0], 'https://live.trading212.com/api/v0/equity/orders');
  assert.equal(b.source, 'Trading 212'); assert.equal(b.data.length, 2); assert.equal(b.data[0].side, 'SELL'); assert.equal(b.data[0].quantity, 5.5); assert.equal(b.data[1].side, 'BUY');
  const cu = await handle(new Request('https://relay.workers.dev/api/trading212/orders-pending?cursor=x', { headers }), { T212_AUTH_MODE: 'session' }, upstream); assert.equal(cu.status, 400);
  const post = await handle(new Request('https://relay.workers.dev/api/trading212/orders-pending', { method: 'POST', headers }), { T212_AUTH_MODE: 'session' }, upstream); assert.equal(post.status, 405);
  const rau = await handle(new Request('https://relay.workers.dev/api/trading212/orders-pending', { headers }), { T212_AUTH_MODE: 'session' }, async () => new Response('{"x":1}', { status: 200 })); assert.equal((await rau.json()).error, 'broker_schema_mismatch');
});

test('T212Pending: salvare / citire pe cont, ordinele STOP de vânzare pe ticker, starea pe poziții (da / nu / necitit, Radarul contează ca da)', () => {
  const c = ctx(['lib/t212-pending.js']), P = c.T212Pending, S = c.localStorage, poz = [{ ticker: 'MU_US_EQ' }, { ticker: 'AAPL_US_EQ' }, { ticker: 'NVDA_US_EQ' }];
  const J = (x) => JSON.parse(JSON.stringify(x)); // obiectele vin din alt context vm: comparație pe conținut
  assert.deepEqual(J(P.stare({ scope: 'live:abc', positions: poz, storage: S }).pozitii.get('MU_US_EQ')), { stare: 'necitit', ordin: null }, 'nimic citit încă');
  const items = [pendingOrder(t212()), pendingOrder(t212({ id: 79, stopPrice: 790 })), pendingOrder(t212({ id: 80, ticker: 'AAPL_US_EQ', type: 'LIMIT', quantity: 2, stopPrice: null, limitPrice: 150 })), pendingOrder(t212({ id: 81, ticker: 'NVDA_US_EQ', type: 'STOP', quantity: 1, stopPrice: 100 }))];
  P.save(S, 'live:abc', 'live', items, new Date(NOW - 60000).toISOString());
  const m = P.ordineStop(items); assert.equal(m.get('MU_US_EQ').stopPrice, 790, 'stopul cel mai mic'); assert.equal(m.has('AAPL_US_EQ'), false, 'limita de cumpărare nu e stop'); assert.equal(m.has('NVDA_US_EQ'), false, 'STOP de cumpărare nu acoperă poziția');
  const st = P.stare({ scope: 'live:abc', positions: poz, storage: S, externe: new Set(['NVDA_US_EQ']) });
  assert.equal(st.citit, true); assert.equal(st.pozitii.get('MU_US_EQ').stare, 'da'); assert.equal(st.pozitii.get('AAPL_US_EQ').stare, 'nu'); assert.deepEqual(J(st.pozitii.get('NVDA_US_EQ')), { stare: 'da', sursa: 'radar', ordin: null });
  assert.deepEqual(J(P.peHartie(st, new Set(['MU_US_EQ', 'AAPL_US_EQ']))), ['AAPL_US_EQ']); assert.equal(P.peHartie(P.stare({ scope: 'alt', positions: poz, storage: S }), new Set(['AAPL_US_EQ'])), null, 'necitit ⇒ null, nu listă goală');
  const vechi = P.stare({ scope: 'live:abc', positions: poz, storage: S, now: NOW + 7 * 3600000 }); assert.equal(vechi.citit, false); assert.equal(vechi.pozitii.get('MU_US_EQ').stare, 'necitit');
  assert.match(P.text(st.pozitii.get('MU_US_EQ'), 'USD'), /^DA · 790 USD × 5\.5/); assert.match(P.text(st.pozitii.get('AAPL_US_EQ')), /^NU/); assert.match(P.text(null), /necitit/);
  assert.throws(() => P.save(S, 'live:abc', 'live', [{ nu: 1 }], new Date(NOW).toISOString()), /formă neașteptată/);
  assert.equal(P.KEY, 'tt_trading212_orders_pending_v1');
});

test('Astăzi: stop documentat fără ordin la broker ⇒ „doar pe hârtie” (grav 4, sever); ordin la broker fără notă ⇒ „notează-l” (grav 4); ordine necitite ⇒ ca înainte', () => {
  const c = ctx(['lib/today-attention.js']), TA = c.TodayAttention, poz = [{ ticker: 'MU_US_EQ', value: 1000 }, { ticker: 'AAPL_US_EQ', value: 1000 }];
  const ob = { citit: true, pozitii: new Map([['MU_US_EQ', { stare: 'nu', ordin: null }], ['AAPL_US_EQ', { stare: 'da', sursa: 'broker', ordin: { stopPrice: 150.25, quantity: 2 } }]]) };
  const a = TA.alerte({ positions: poz, stops: new Set(['MU_US_EQ']), ordineBroker: ob });
  assert.ok(a.some((x) => x.ticker === 'MU_US_EQ' && x.grav === 4 && x.sever && /doar pe hârtie/.test(x.text)));
  assert.ok(a.some((x) => x.ticker === 'AAPL_US_EQ' && x.grav === 4 && /ordin STOP la 150,25/.test(x.text) && /notează-l/.test(x.text)));
  const b = TA.alerte({ positions: poz, stops: new Set(['MU_US_EQ']), ordineBroker: null });
  assert.equal(b.some((x) => /doar pe hârtie/.test(x.text)), false, 'necitit ⇒ nu se spune „pe hârtie”'); assert.ok(b.some((x) => x.ticker === 'AAPL_US_EQ' && x.grav === 5 && /fără stop pus/.test(x.text)));
  const d = TA.alerte({ positions: poz, stops: new Set(['MU_US_EQ', 'AAPL_US_EQ']), ordineBroker: { citit: true, pozitii: new Map([['MU_US_EQ', { stare: 'da' }], ['AAPL_US_EQ', { stare: 'da' }]]) } });
  assert.equal(d.some((x) => /stop/i.test(x.text)), false, 'ambele cu ordin ⇒ nicio alertă de stop');
});

test('Planuri: căldura portofoliului poartă eticheta „stop doar pe hârtie” și nu blochează; desk cere peHartie din T212Pending', () => {
  const c = ctx(['lib/caldura-portofoliu.js']), broker = { rows: [{ ticker: 'MU_US_EQ', stopRisk: 50, stop: 790 }, { ticker: 'AAPL_US_EQ', stopRisk: 30, stop: 140 }] };
  const h = c.TTCaldura.riscDeschis({ broker, rate: 1, plans: [], contUsd: 10000, plafonPct: 4, peHartie: ['AAPL_US_EQ'] });
  assert.equal(h.ok, true); assert.match(h.text, /stop doar pe hârtie \(fără ordin la broker\): AAPL/); assert.deepEqual(h.peHartie, ['AAPL_US_EQ']);
  assert.doesNotMatch(c.TTCaldura.riscDeschis({ broker, rate: 1, plans: [], contUsd: 10000, peHartie: null }).text, /pe hârtie/);
  const html = readFileSync('desk/index.html', 'utf8');
  assert.match(html, /function stopuriPeHartie\(g\)/); assert.match(html, /plafonPct:g&&g\.cfg\?g\.cfg\.maxHeatPct:null,peHartie:stopuriPeHartie\(g\)\}\)/); assert.match(html, /lib\/t212-pending\.js\?v=/);
  for (const f of ['today/index.html', 'broker/index.html']) assert.match(readFileSync(f, 'utf8'), /lib\/t212-pending\.js\?v=/, f);
  assert.match(readFileSync('today/view.js', 'utf8'), /ordineBroker:\(\(\)=>\{try\{const P=g\.T212Pending/);
  assert.match(readFileSync('broker/broker.js', 'utf8'), /api\('orders-pending'\)/); assert.match(readFileSync('lib/trading212-portfolio.js', 'utf8'), /pair\('Stop la broker'/);
});
