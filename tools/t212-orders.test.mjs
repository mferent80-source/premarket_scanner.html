// 18.10.2026 — butonul „Pune ordinul în Trading 212” din fereastra „Pune stopul acum”: rezumatul confirmării, mesajele și trimiterea.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function setup({ vault = { key: 'k', secret: 's', environment: 'live' }, config = { enabled: true, endpoint: 'https://premarket-scanner-html.mferent80.workers.dev', directCredentials: true }, relay } = {}) {
  const calls = [];
  const c = { Intl, Date, Math, JSON, Map, Set, URL, String, Number, Array, Object, btoa, location: { href: 'https://mferent80-source.github.io/premarket_scanner.html/today/' } };
  c.window = c; c.T212Vault = { read: async () => vault };
  c.fetch = async (url, opts = {}) => { calls.push({ url: String(url), opts }); if (String(url).endsWith('trading212-config.json')) return new Response(JSON.stringify(config)); return relay(url, opts); };
  vm.createContext(c);
  for (const f of ['lib/holdings-notes.js', 'lib/stop-setter.js', 'lib/t212-orders.js']) vm.runInContext(readFileSync(f, 'utf8'), c);
  return { c, O: c.T212Orders, S: c.StopSetter, calls };
}
// 19.10.2026 (I-711): contul e în RON (poz.currency) — a doua sumă din confirmare e în moneda contului, nu „lei” presupus
const poz = { ticker: 'MU_US_EQ', quantity: 5.5, currentPrice: 876, averagePrice: 993.06, value: 5362, instrumentCurrency: 'USD', currency: 'RON' };

test('the confirmation summary uses the whole position, the stop and the loss from the current price (in the stock currency and in lei)', () => {
  const { O } = setup(), r = O.rezumat(poz, 832.2, 876);
  assert.equal(r.qty, 5.5); assert.equal(r.simbol, 'MU'); assert.ok(Math.abs(r.pierdere - (876 - 832.2) * 5.5) < 1e-9);
  assert.ok(Math.abs(r.lei - 5362 * (1 - 832.2 / 876)) < 1e-9); assert.equal(r.monedaCont, 'RON'); assert.equal(r.peste, false);
  assert.equal(O.rezumat(poz, 0, 876), null); assert.equal(O.rezumat({ ...poz, quantity: 0 }, 800, 876), null);
  assert.equal(O.rezumat(poz, 900, 876).peste, true);
  const html = O.confirmareHtml(r, 'USD', (s) => String(s), false);
  assert.match(html, /Ordin REAL în Trading 212/); assert.match(html, /5,5 MU/); assert.match(html, /832,20 USD/); assert.match(html, /data-stop-t212-da/); assert.match(html, /gap/);
});
test('the button appears only with a saved connection; without it the panel says how to enable it', async () => {
  const yes = setup(), no = setup({ vault: null });
  const a = await yes.O.disponibil(), b = await no.O.disponibil();
  assert.equal(a.ok, true); assert.equal(b.ok, false); assert.match(b.motiv, /Cont & sincronizare/);
  const snap = { positions: [poz] }, list = yes.S.faraStop(snap, new Set());
  assert.match(yes.S.render(list, { ordine: a }), /data-stop-t212/);
  const off = no.S.render(list, { ordine: b }); assert.doesNotMatch(off, /data-stop-t212"/); assert.match(off, /Ține minte conexiunea/);
  assert.match(yes.S.render(list, { ordine: a, confirm: yes.O.rezumat(poz, 832.2, 876) }), /Da, trimite ordinul/);
  assert.match(yes.S.render(list, { ordine: a, confirm: yes.O.rezumat(poz, 832.2, 876), trimite: true }), /Se trimite…/);
});
test('sending posts once to the relay with the saved key, the confirmation token and the exact quantity and stop', async () => {
  const { O, calls } = setup({ relay: async () => new Response(JSON.stringify({ source: 'Trading 212', environment: 'live', data: { id: 9, status: 'NEW', ticker: 'MU_US_EQ', quantity: 5.5, stopPrice: 832.2, currentPrice: 876 } })) });
  const r = await O.pune({ ticker: 'MU_US_EQ', quantity: 5.5, stopPrice: 832.2 });
  assert.equal(r.ok, true); assert.equal(r.data.stopPrice, 832.2);
  const post = calls.filter((x) => x.opts.method === 'POST'); assert.equal(post.length, 1);
  assert.equal(post[0].url, 'https://premarket-scanner-html.mferent80.workers.dev/api/trading212/stop-order');
  assert.equal(post[0].opts.headers.Authorization, 'Basic ' + btoa('k:s')); assert.equal(post[0].opts.headers['X-T212-Environment'], 'live');
  assert.deepEqual(JSON.parse(post[0].opts.body), { ticker: 'MU_US_EQ', quantity: 5.5, stopPrice: 832.2, confirm: 'PUN-STOPUL' });
});
test('refusals say the order was NOT sent; a lost answer says to check Trading 212 before retrying', async () => {
  const perm = setup({ relay: async () => new Response(JSON.stringify({ error: 'broker_permission_missing' }), { status: 502 }) });
  const a = await perm.O.pune({ ticker: 'MU_US_EQ', quantity: 5.5, stopPrice: 832.2 }); assert.equal(a.ok, false); assert.match(a.mesaj, /Orders: Execute/); assert.match(a.mesaj, /NU a fost trimis/);
  const dup = setup({ relay: async () => new Response(JSON.stringify({ error: 'sell_order_exists', stopPrice: 830 }), { status: 409 }) });
  assert.match((await dup.O.pune({ ticker: 'MU_US_EQ', quantity: 5.5, stopPrice: 832.2 })).mesaj, /deja o vânzare.*830,00/);
  const lost = setup({ relay: async () => { throw Error('offline'); } });
  const l = await lost.O.pune({ ticker: 'MU_US_EQ', quantity: 5.5, stopPrice: 832.2 }); assert.equal(l.ok, false); assert.match(l.mesaj, /ÎNAINTE să încerci din nou/); assert.doesNotMatch(l.mesaj, /NU a fost trimis/);
  const novault = setup({ vault: null, relay: async () => { throw Error('nu trebuie apelat'); } });
  assert.equal((await novault.O.pune({ ticker: 'MU_US_EQ', quantity: 5.5, stopPrice: 832.2 })).error, 'fara-conexiune');
  assert.equal(novault.calls.filter((x) => x.opts.method === 'POST').length, 0);
});
test('a success answer for another ticker is not accepted as a placed stop', async () => {
  const { O } = setup({ relay: async () => new Response(JSON.stringify({ source: 'Trading 212', data: { ticker: 'AVGO_US_EQ', stopPrice: 300 } })) });
  assert.equal((await O.pune({ ticker: 'MU_US_EQ', quantity: 5.5, stopPrice: 832.2 })).ok, false);
});
