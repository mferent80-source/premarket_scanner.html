// 27.10.2026 (I-757): kill switch-ul din pagina contului — „Oprește tot” anulează ordinele în așteptare prin releu, scrie tt_governor_oprire_v1
// (contractul cu lotul C: Governor ⇒ HALTED cât e activ; re-armarea o face Governor cu motiv) și emite evenimentul `tt-oprire` (Astăzi reîmprospătează).
// Închis la eroare: dacă releul nu răspunde, oprirea rămâne scrisă (activ:true, zero ordine anulate) și textul spune să anulezi din aplicația Trading 212.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const NOW = Date.parse('2026-10-27T15:30:00Z'), CONFIG = { enabled: true, endpoint: 'https://premarket-scanner-html.mferent80.workers.dev', directCredentials: true };
function setup({ ordine = { key: 'ko', secret: 'so', environment: 'live' }, conexiune = { key: 'k', secret: 's', environment: 'live' }, relay, config = CONFIG, ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } = {}) {
  const store = new Map(), calls = [], events = [];
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
  const c = { console, Intl, JSON, Math, Date: Clock, URL, String, Number, Array, Object, Map, Set, btoa, AbortController, setTimeout, clearTimeout, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }, navigator: { userAgent: ua }, location: { href: 'https://mferent80-source.github.io/premarket_scanner.html/broker/' } };
  c.window = c; c.dispatchEvent = (e) => { events.push(e); return true; }; c.addEventListener = () => {};
  c.T212Vault = { read: async () => conexiune, readOrdine: async () => ordine };
  c.fetch = async (url, opts = {}) => { calls.push({ url: String(url), opts }); if (String(url).endsWith('trading212-config.json')) return new Response(JSON.stringify(config)); return relay(url, opts); };
  vm.createContext(c); vm.runInContext(readFileSync('lib/trading212-oprire.js', 'utf8'), c);
  return { c, O: c.TTOprire, store, calls, events, J: (k) => JSON.parse(store.get(k)) };
}
const ok = (data) => async () => new Response(JSON.stringify({ source: 'Trading 212', environment: 'live', cancelledAt: new Date(NOW).toISOString(), data }));

test('contractul: cheia, evenimentul și confirmarea sunt cele din plan', () => {
  const { O } = setup();
  assert.equal(O.KEY, 'tt_governor_oprire_v1'); assert.equal(O.EVENT, 'tt-oprire'); assert.equal(O.CONFIRM, 'OPRESC-TOT');
});
test('„Oprește tot”: anulează toate ordinele prin releu cu cheia CU ordine, scrie starea de oprire și emite tt-oprire cu starea în detail', async () => {
  const { O, calls, events, J } = setup({ relay: ok({ anulate: [{ id: '77', ticker: 'MU_US_EQ', stopPrice: 800.5, side: 'SELL', quantity: 5.5 }, { id: '78', ticker: 'AAPL_US_EQ', stopPrice: null, side: 'BUY', quantity: 2 }], esuate: [], total: 2, complet: true }) });
  const r = await O.opreste({ motiv: 'ordin greșit pe MU' });
  assert.equal(r.ok, true); assert.equal(r.stare.activ, true);
  const post = calls.filter((x) => x.opts.method === 'POST'); assert.equal(post.length, 1);
  assert.equal(post[0].url, CONFIG.endpoint + '/api/trading212/orders/cancel-all');
  assert.equal(post[0].opts.headers.Authorization, 'Basic ' + btoa('ko:so'), 'cheia cu ordine, nu cea de citire'); assert.equal(post[0].opts.headers['X-T212-Environment'], 'live');
  assert.deepEqual(JSON.parse(post[0].opts.body), { confirm: 'OPRESC-TOT' }); assert.ok(!post[0].url.includes('ko'), 'nimic din cheie în URL');
  const s = J('tt_governor_oprire_v1');
  assert.deepEqual(s, { activ: true, la: new Date(NOW).toISOString(), motiv: 'ordin greșit pe MU', aparat: 'PC', ordineAnulate: [{ id: '77', ticker: 'MU_US_EQ', stopPrice: 800.5 }, { id: '78', ticker: 'AAPL_US_EQ', stopPrice: null }], rearmatLa: null, rearmatMotiv: null, esuate: [], complet: true, eroare: null });
  assert.equal(events.length, 1); assert.equal(events[0].type, 'tt-oprire'); assert.deepEqual(events[0].detail, s);
  assert.match(O.text(s), /OPRIT/); assert.match(O.text(s), /2 ordine anulate/); assert.match(O.text(s), /ordin greșit pe MU/);
});
test('fără cheie cu ordine pe aparat, cade pe conexiunea salvată (o singură cheie, ca azi); fără nicio conexiune oprirea rămâne scrisă, dar fără anulări', async () => {
  const una = setup({ ordine: null, relay: ok({ anulate: [], esuate: [], total: 0, complet: true }) });
  await una.O.opreste({ motiv: 'test' }); assert.equal(una.calls.filter((x) => x.opts.method === 'POST')[0].opts.headers.Authorization, 'Basic ' + btoa('k:s'));
  const fara = setup({ ordine: null, conexiune: null, relay: async () => { throw Error('nu trebuie apelat'); } });
  const r = await fara.O.opreste({ motiv: 'test' });
  assert.equal(r.ok, false); assert.match(r.mesaj, /Trading 212/); assert.equal(fara.calls.filter((x) => x.opts.method === 'POST').length, 0);
  const s = fara.J('tt_governor_oprire_v1'); assert.equal(s.activ, true); assert.deepEqual(s.ordineAnulate, []); assert.match(s.eroare, /conexiune/i);
  assert.equal(fara.events.length, 1, 'evenimentul pleacă oricum: Governor și Astăzi trebuie să știe că e oprit');
});
test('releul care nu răspunde sau refuză: oprirea e scrisă (activ:true), anulările lipsesc, iar textul spune să anulezi manual în Trading 212', async () => {
  const jos = setup({ relay: async () => { throw Error('offline'); } });
  const r = await jos.O.opreste({ motiv: 'conexiune pierdută' });
  assert.equal(r.ok, false); assert.match(r.mesaj, /anulează.*(manual|din aplicația Trading 212)/i);
  const s = jos.J('tt_governor_oprire_v1'); assert.equal(s.activ, true); assert.deepEqual(s.ordineAnulate, []); assert.equal(s.complet, false); assert.match(s.eroare, /offline|rețea|Trading 212/i);
  assert.match(jos.O.text(s), /OPRIT/); assert.match(jos.O.text(s), /nu s-au putut anula|neconfirmat/i);
  const perm = setup({ relay: async () => new Response(JSON.stringify({ error: 'broker_permission_missing' }), { status: 502 }) });
  const p = await perm.O.opreste({ motiv: 'x' }); assert.equal(p.ok, false); assert.match(p.mesaj, /Orders: Execute/);
  const partial = setup({ relay: ok({ anulate: [{ id: '77', ticker: 'MU_US_EQ', stopPrice: 800.5 }], esuate: [{ id: '78', ticker: 'AAPL_US_EQ', stopPrice: null, error: 'broker_unavailable' }], total: 2, complet: false }) });
  const q = await partial.O.opreste({ motiv: 'x' }); assert.equal(q.ok, false); assert.equal(partial.J('tt_governor_oprire_v1').ordineAnulate.length, 1); assert.match(q.mesaj, /AAPL/);
});
test('anuleazaOrdin trimite DELETE pe ordinul cerut, cu cheia cu ordine; id-ul care nu e numeric nu pleacă', async () => {
  const { O, calls } = setup({ relay: ok({ id: '77' }) });
  const r = await O.anuleazaOrdin('77'); assert.equal(r.ok, true); assert.equal(r.data.id, '77');
  const del = calls.filter((x) => x.opts.method === 'DELETE'); assert.equal(del.length, 1); assert.equal(del[0].url, CONFIG.endpoint + '/api/trading212/orders/77');
  const bad = await O.anuleazaOrdin('abc'); assert.equal(bad.ok, false); assert.equal(calls.filter((x) => x.opts.method === 'DELETE').length, 1);
  const gone = setup({ relay: async () => new Response(JSON.stringify({ error: 'order_not_found' }), { status: 409 }) });
  assert.match((await gone.O.anuleazaOrdin('77')).mesaj, /nu mai există/);
});
test('citeste: cheia lipsă, stricată sau cu activ:false înseamnă „nu e oprit”; motivul e tăiat la 200 de caractere; textul fără oprire e scurt', () => {
  const { O, store } = setup();
  assert.equal(O.citeste(), null); store.set('tt_governor_oprire_v1', '{nu e json'); assert.equal(O.citeste(), null);
  store.set('tt_governor_oprire_v1', JSON.stringify({ activ: false, la: new Date(NOW).toISOString(), motiv: 'x', aparat: 'PC', ordineAnulate: [], rearmatLa: new Date(NOW).toISOString(), rearmatMotiv: 'probă' }));
  const s = O.citeste(); assert.equal(s.activ, false); assert.match(O.text(s), /re-armat/i); assert.doesNotMatch(O.text(s), /^OPRIT/);
  assert.equal(O.text(null), 'Nu e oprit.');
  assert.equal(O.stare({ motiv: 'a'.repeat(300), aparat: 'PC', la: new Date(NOW).toISOString() }).motiv.length, 200);
});
