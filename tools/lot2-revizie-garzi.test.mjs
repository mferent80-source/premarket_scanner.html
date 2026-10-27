// 27.10.2026 — abaterile serioase (🟡) din revizia independentă a lotului 2 (A–E), fiecare cu cazul reprodus:
//  b „Oprește tot” anulează ordinele și când stocarea aparatului e plină (oprirea se spune nescrisă, nu se renunță la anulare)
//  c anularea în masă: un ordin care nu mai era în așteptare (404) nu e numărat „anulat”; după anulare ordinele se recitesc, iar ce a rămas e spus
//  d oprirea scrie singură incidentul în registru (I-757 + I-760)
//  g o copie veche a ordinelor (peste 6 h) nu mai blochează repunerea stopului pe aparatul care nu citește brokerul
//  h override-ul: o relaxare se judecă față de limita STRICTĂ; coborârea unei relaxări active modifică relaxarea (temporar), nu limita permanentă
//  j reconcilierea se sincronizează între aparate și intră în fișa zilei
//  l releul Alertelor primește lista News de azi (~175 KB) cu loc de creștere (sub 1 MB, limita API-ului GitHub)
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { handle } from './trading212-worker.mjs';
import { KEYS, validateValue, mergeRecord } from '../lib/cloud-sync-model.mjs';
import { fisaZilei } from '../lib/cloud-monitor.mjs';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const NOW = Date.parse('2026-10-27T15:30:00Z'), CONFIG = { enabled: true, endpoint: 'https://premarket-scanner-html.mferent80.workers.dev', directCredentials: true };
function oprireCtx({ relay, plina = false, incidente = true } = {}) {
  const store = new Map(), events = [];
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
  const c = { console, Intl, JSON, Math, Date: Clock, URL, String, Number, Array, Object, Map, Set, btoa, AbortController, setTimeout, clearTimeout, CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i && i.detail; } },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { if (plina) throw Object.assign(Error('QuotaExceededError'), { name: 'QuotaExceededError' }); store.set(k, String(v)); }, removeItem: (k) => store.delete(k) },
    navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0)' }, location: { href: 'https://mferent80-source.github.io/premarket_scanner.html/broker/' } };
  c.window = c; c.dispatchEvent = (e) => { events.push(e); return true; }; c.addEventListener = () => {};
  c.T212Vault = { read: async () => ({ key: 'k', secret: 's', environment: 'live' }), readOrdine: async () => null };
  c.fetch = async (url, opts = {}) => { if (String(url).endsWith('trading212-config.json')) return new Response(JSON.stringify(CONFIG)); return relay(url, opts); };
  vm.createContext(c);
  if (incidente) vm.runInContext(readFileSync('lib/journal-incidente.js', 'utf8'), c);
  vm.runInContext(readFileSync('lib/trading212-oprire.js', 'utf8'), c);
  return { O: c.TTOprire, store, events };
}
const raspuns = (data) => async () => new Response(JSON.stringify({ source: 'Trading 212', environment: 'live', cancelledAt: new Date(NOW).toISOString(), data }));

test('b: cu stocarea plină „Oprește tot” anulează totuși ordinele și spune că oprirea NU s-a putut scrie pe aparat', async () => {
  let cerut = 0; const { O } = oprireCtx({ plina: true, relay: async (u, o) => { cerut++; return raspuns({ anulate: [{ id: '1', ticker: 'MU_US_EQ', stopPrice: 90 }], esuate: [], total: 1, complet: true, confirmat: true })(u, o); } });
  const r = await O.opreste({ motiv: 'ordin greșit' });
  assert.equal(cerut, 1, 'anularea a plecat'); assert.match(r.mesaj, /nu s-a putut scrie pe acest aparat/i); assert.match(r.mesaj, /1 ordine anulate/);
});

test('d: oprirea scrie incidentul în registru (gravitate mare, deschis), cu ordinele anulate în descriere', async () => {
  const { O, store } = oprireCtx({ relay: raspuns({ anulate: [{ id: '1', ticker: 'MU_US_EQ', stopPrice: 90 }], esuate: [], total: 1, complet: true, confirmat: true }) });
  await O.opreste({ motiv: 'cheie posibil scursă' });
  const inc = JSON.parse(store.get('tt_journal_incidente_v1') || '[]');
  assert.equal(inc.length, 1); assert.equal(inc[0].gravitate, 'mare'); assert.equal(inc[0].stare, 'deschis');
  assert.match(inc[0].titlu, /Oprește tot/); assert.match(inc[0].ce, /cheie posibil scursă/); assert.match(inc[0].ce, /MU/);
  assert.match(readFileSync('broker/index.html', 'utf8'), /lib\/journal-incidente\.js\?v=/, 'pagina contului încarcă registrul');
});

const ORIGIN = 'https://mferent80-source.github.io', ALL = '/api/trading212/orders/cancel-all';
const req = () => new Request('https://relay.workers.dev' + ALL, { method: 'POST', headers: { Origin: ORIGIN, Authorization: 'Basic ' + btoa('k:s'), 'X-T212-Environment': 'live', 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'OPRESC-TOT' }) });
function brokerSim({ orders, cancel, recitire }) {
  let lista = orders.slice(), get = 0;
  const upstream = async (url, o = {}) => {
    if (o.method === 'DELETE') { const id = url.split('/').pop(), r = cancel(id); if (r.status === 200) lista = lista.filter((x) => String(x.id) !== id); return r; }
    if (url.endsWith('/api/v0/equity/orders')) { get++; if (get > 1 && recitire) return recitire(lista); return new Response(JSON.stringify(lista), { status: 200 }); }
    throw Error('neașteptat ' + url);
  };
  return upstream;
}
const ord = (id, ticker) => ({ id, ticker, type: 'STOP', quantity: -1, stopPrice: 10, status: 'NEW' });

test('c: 404 la anulare ⇒ „nu mai era în așteptare” (posibil executat), nu „anulat”; recitirea confirmă lista goală', async () => {
  const up = brokerSim({ orders: [ord(1, 'A_US_EQ'), ord(2, 'B_US_EQ')], cancel: (id) => (id === '2' ? new Response('{}', { status: 404 }) : new Response(null, { status: 200 })), recitire: () => new Response('[]', { status: 200 }) });
  const out = (await (await handle(req(), { T212_AUTH_MODE: 'session' }, up)).json()).data;
  assert.deepEqual(out.anulate.map((o) => o.id), ['1']); assert.deepEqual(out.disparute.map((o) => o.id), ['2']); assert.equal(out.confirmat, true); assert.equal(out.complet, true);
});

test('c: un ordin „anulat” care e încă în așteptare la recitire intră la eșuate; recitirea picată ⇒ neconfirmat, nu complet', async () => {
  const lent = brokerSim({ orders: [ord(1, 'A_US_EQ')], cancel: () => new Response(null, { status: 200 }), recitire: () => new Response(JSON.stringify([ord(1, 'A_US_EQ')]), { status: 200 }) });
  const o1 = (await (await handle(req(), { T212_AUTH_MODE: 'session' }, lent)).json()).data;
  assert.equal(o1.complet, false); assert.deepEqual(o1.esuate.map((o) => [o.id, o.error]), [['1', 'inca_in_asteptare']]); assert.equal(o1.anulate.length, 0);
  const cazut = brokerSim({ orders: [ord(1, 'A_US_EQ')], cancel: () => new Response(null, { status: 200 }), recitire: () => new Response('{}', { status: 500 }) });
  const o2 = (await (await handle(req(), { T212_AUTH_MODE: 'session' }, cazut)).json()).data;
  assert.equal(o2.confirmat, false); assert.equal(o2.complet, false);
});

test('g: copia ordinelor mai veche de 6 h nu blochează repunerea stopului (necitit ⇒ releul verifică la broker); cea proaspătă da', () => {
  const store = new Map(), S = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  const c = { Date, JSON, Math, Number, String, Array, Object, Map, Set }; c.window = c; vm.createContext(c); vm.runInContext(readFileSync('lib/t212-pending.js', 'utf8'), c);
  const P = c.T212Pending, items = [{ id: '1', ticker: 'MU_US_EQ', type: 'STOP', side: 'SELL', quantity: 5, stopPrice: 90, limitPrice: null }];
  P.save(S, 'live:x', 'live', items, new Date(NOW - 7 * 3600000).toISOString());
  assert.equal(P.proaspete(P.read(S, 'live:x'), NOW), null, 'copie veche ⇒ necunoscut');
  P.save(S, 'live:x', 'live', items, new Date(NOW - 3600000).toISOString());
  assert.equal(P.proaspete(P.read(S, 'live:x'), NOW).length, 1);
  P.save(S, 'live:x', 'live', items, new Date(NOW - 7 * 3600000).toISOString(), { modificatLa: new Date(NOW - 60000).toISOString() });
  assert.equal(P.proaspete(P.read(S, 'live:x'), NOW).length, 1, 'o schimbare locală recentă ține copia proaspătă');
  assert.match(readFileSync('today/stop.js', 'utf8'), /function ordinePending[\s\S]{0,250}P\.proaspete\(a\)/, 'Astăzi folosește doar copia proaspătă');
});

function gov() {
  const store = new Map([['tt_journal_v1', JSON.stringify([{ id: 'a1', sym: 'AAPL', dir: 'long', entry: 100, exit: 105, size: 1, openTs: NOW - 3 * 864e5, closeTs: NOW - 2 * 864e5, status: 'closed' }])], ['tt_account_size_v1', '12670']]), clock = { t: NOW };
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [clock.t])); } static now() { return clock.t; } }
  const c = { console, Date: Clock, Intl, JSON, Math, Number, navigator: { userAgent: 'x' }, localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
  c.window = c; vm.createContext(c); vm.runInContext(readFileSync('lib/governor.js', 'utf8'), c);
  return { GV: c.GV, clock, store };
}

test('h: o relaxare activă coborâtă (3 → 2,5, strict 2) rămâne relaxare temporară cu aceeași expirare — nu devine limită permanentă', () => {
  const { GV, clock } = gov();
  assert.ok(GV.saveCfg({ maxLossPctDay: 3 }, { motiv: 'revizuire lunară', expiraZile: 7 }));
  clock.t = NOW + 25 * 3600000; assert.equal(GV.cfg().maxLossPctDay, 3, 'relaxarea a intrat');
  assert.ok(GV.saveCfg({ maxLossPctDay: 2.5 }), 'coborârea relaxării intră imediat, fără motiv');
  assert.equal(GV.cfg().maxLossPctDay, 2.5);
  assert.equal(GV.cfgStrict().maxLossPctDay, 2, 'limita permanentă rămâne 2');
  clock.t = NOW + 25 * 3600000 + 8 * 864e5; assert.equal(GV.cfg().maxLossPctDay, 2, 'după expirare revine la 2, nu rămâne 2,5');
});

test('h: peste o relaxare activă, o valoare încă mai largă cere motiv și 24 h (judecată față de limita strictă)', () => {
  const { GV, clock } = gov();
  assert.ok(GV.saveCfg({ maxLossPctDay: 3 }, { motiv: 'revizuire', expiraZile: 7 })); clock.t = NOW + 25 * 3600000;
  assert.equal(GV.saveCfg({ maxLossPctDay: 4 }), null); assert.match(GV.ultimaEroare || '', /motiv/i);
  assert.ok(GV.saveCfg({ maxLossPctDay: 1.5 }), 'strângerea sub limita strictă intră imediat');
  assert.equal(GV.cfgStrict().maxLossPctDay, 1.5); assert.equal(GV.cfg().maxLossPctDay, 1.5, 'și anulează relaxarea');
});

test('j: reconcilierea e cheie sincronizată (cea mai nouă câștigă) și intră în fișa zilei', () => {
  assert.ok(KEYS.includes('tt_reconciliere_v1'));
  const a = { la: '2026-10-27T14:00:00.000Z', scope: 'live:x', ok: true, diferente: [] }, b = { la: '2026-10-27T15:00:00.000Z', scope: 'live:x', ok: false, diferente: [{ tip: 'pozitie', ticker: 'MU_US_EQ', app: 5, broker: 4, text: 'MU: 5 în aplicație, 4 la broker' }] };
  validateValue('tt_reconciliere_v1', b); assert.throws(() => validateValue('tt_reconciliere_v1', { la: 'x' }), /invalid_value/);
  assert.equal(mergeRecord('tt_reconciliere_v1', undefined, a, b).value, b); assert.equal(mergeRecord('tt_reconciliere_v1', undefined, b, a).value, b);
  const f = fisaZilei({ scope: 'live:x', summary: { currency: 'EUR', totalValue: 10000 }, positions: [], ordine: [], reconciliere: b, now: NOW });
  assert.match(f.text, /Reconcilierea cu brokerul: 1 diferență/); assert.match(f.text, /MU: 5 în aplicație, 4 la broker/);
  assert.match(fisaZilei({ scope: 'live:x', summary: { currency: 'EUR', totalValue: 10000 }, positions: [], ordine: [], reconciliere: a, now: NOW }).text, /Reconcilierea cu brokerul: fără diferențe/);
  assert.match(f.text, /neverificat de om/, 'eticheta pe fișa trimisă automat');
  const s = readFileSync('app/cloud-sync.js', 'utf8'); for (const k of ['tt_journal_incidente_v1', 'tt_governor_override_v1', 'tt_reconciliere_v1']) assert.match(/const GATED_KEYS=\[([^\]]*)\]/.exec(s)[1], new RegExp("'" + k + "'"), 'GATED_KEYS: ' + k);
});

test('l: releul Alertelor primește News de ~400 KB (sub 1 MB, limita API-ului GitHub pentru conținut)', () => {
  const m = /const MAX_CORP = (\d+)/.exec(readFileSync('tools/cf-worker-deck-relay.js', 'utf8'));
  assert.ok(m && Number(m[1]) >= 600 * 1024 && Number(m[1]) < 1024 * 1024, String(m && m[1]));
});
