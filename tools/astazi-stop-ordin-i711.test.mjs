// 19.10.2026 (I-711) — „Pune stopul acum” de pe Astăzi: „Alt stop” invalid nu mai salvează tăcut −5 %, confirmarea arată valoarea
// salvată, fereastra ordinului scrie moneda contului (nu „lei” mereu), iar trimiterea ordinului are timeout fără retrimitere.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const MU = { ticker: 'MU_US_EQ', quantity: 5, averagePrice: 900, currentPrice: 876, instrumentCurrency: 'USD', currency: 'EUR', value: 3800 };
const AVGO = { ticker: 'AVGO_US_EQ', quantity: 2, averagePrice: 300, currentPrice: 310, instrumentCurrency: 'USD', currency: 'EUR', value: 560 };

function pagina({ positions = [MU, AVGO], summary = { currency: 'EUR' } } = {}) {
  const store = new Map(), host = { innerHTML: '', hidden: false, querySelectorAll: () => [], querySelector: () => null, contains: () => false, addEventListener(t, fn) { if (t === 'click') this.click = fn; } };
  const c = { Intl, Date, Math, JSON, Map, Set, Number, String, Array, Object, Promise, console,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    document: { getElementById: (id) => (id === 'stopPanel' ? host : null), activeElement: null, hidden: false },
    CSS: { escape: (s) => s }, Event: class { constructor(t) { this.type = t; } }, dispatchEvent() {}, addEventListener() {},
    setInterval: () => 1, setTimeout: () => 1, fetch: async () => { throw Error('fără rețea în test'); },
    T212Snapshot: { read: () => ['live-A', { positions, summary }] } };
  c.window = c; vm.createContext(c);
  for (const f of ['lib/holdings-notes.js', 'lib/stop-setter.js', 'today/stop.js']) vm.runInContext(readFileSync(f, 'utf8'), c, { filename: f });
  const apasa = (poz, alt, { badInput = false, varianta = (poz.averagePrice * 0.95).toFixed(4) } = {}) => {
    const input = { value: alt, validity: { badInput } }, buton = { dataset: { stopVar: 'fix', stopPret: varianta } };
    const art = { dataset: { stopTicker: poz.ticker }, querySelector: (s) => (s === '[data-stop-alt]' ? input : s === '[data-stop-tinta]' ? { value: '' } : s.startsWith('[data-stop-var') ? buton : null), querySelectorAll: () => [] };
    host.click({ target: { closest: (s) => (s === '[data-stop-ticker]' ? art : s === '[data-stop-save]' ? {} : null) } });
  };
  const teze = () => JSON.parse(store.get('tt_holdings_theses_v1') || '{}');
  return { c, host, apasa, teze };
}

test('I-711: „Alt stop” scris greșit NU salvează varianta −5 % pe tăcute: eroare, nimic salvat', () => {
  const p = pagina();
  p.apasa(MU, '', { badInput: true }); // „abc” într-un câmp numeric: browserul dă value='' și validity.badInput
  assert.deepEqual(p.teze(), {}, 'nimic salvat la text nevalid');
  assert.match(p.host.innerHTML, /Alt stop/); assert.match(p.host.innerHTML, /nimic salvat/i);
  for (const rau of ['-5', '0', 'abc']) { p.apasa(MU, rau); assert.deepEqual(p.teze(), {}, 'nimic salvat pentru ' + rau); }
});

test('I-711: câmpul gol folosește varianta aleasă, iar confirmarea arată valoarea SALVATĂ', () => {
  const p = pagina();
  p.apasa(MU, '850');
  assert.equal(p.teze()['live-A|MU_US_EQ'].stop, 850);
  assert.match(p.host.innerHTML, /MU e salvat în Portofoliu[^<]*850,00 USD/);
  p.apasa(AVGO, '');
  assert.equal(p.teze()['live-A|AVGO_US_EQ'].stop, 285);
});

test('I-711: helperul StopSetter.stopDinFormular — valoare scrisă validă, gol ⇒ varianta, orice altceva ⇒ eroare', () => {
  const { c } = pagina(), S = c.StopSetter;
  assert.deepEqual({ ...S.stopDinFormular('832.2', false, 800) }, { stop: 832.2 });
  assert.deepEqual({ ...S.stopDinFormular('  ', false, 800) }, { stop: 800 });
  for (const [v, bad] of [['', true], ['-1', false], ['0', false], ['x', false]]) assert.match(S.stopDinFormular(v, bad, 800).eroare, /Alt stop/);
  assert.match(S.stopDinFormular('', false, NaN).eroare, /Alege o variantă/);
});

function relee(relay, vault = { key: 'k', secret: 's', environment: 'live' }) {
  const calls = [];
  const c = { Intl, Date, Math, JSON, Map, Set, URL, String, Number, Array, Object, Promise, btoa, AbortController, setTimeout, clearTimeout, location: { href: 'https://mferent80-source.github.io/premarket_scanner.html/today/' } };
  c.window = c; c.T212Vault = { read: async () => vault };
  c.fetch = async (url, opts = {}) => { calls.push({ url: String(url), opts }); if (String(url).endsWith('trading212-config.json')) return new Response(JSON.stringify({ enabled: true, endpoint: 'https://premarket-scanner-html.mferent80.workers.dev', directCredentials: true })); return relay(url, opts); };
  vm.createContext(c); vm.runInContext(readFileSync('lib/t212-orders.js', 'utf8'), c);
  return { O: c.T212Orders, calls };
}

test('I-711: fereastra de confirmare scrie pierderea în moneda CONTULUI (EUR), nu „lei”', () => {
  const { O } = relee(async () => new Response('{}'));
  const r = O.rezumat(MU, 832.2, 876, 'EUR'), html = O.confirmareHtml(r, 'USD', (s) => String(s), false);
  assert.equal(r.monedaCont, 'EUR'); assert.match(html, /≈ <b>[^<]+ EUR<\/b>/); assert.doesNotMatch(html, /lei/);
  const fara = O.rezumat({ ...MU, currency: undefined }, 832.2, 876), h2 = O.confirmareHtml(fara, 'USD', (s) => String(s), false);
  assert.doesNotMatch(h2, /lei/, 'fără moneda contului nu se inventează „lei”');
  assert.equal(O.rezumat({ ...MU, currency: 'RON' }, 832.2, 876).monedaCont, 'RON', 'moneda din poziție când nu vine alta');
});

test('I-711: trimiterea ordinului are timeout — „nu știm dacă a ajuns”, o singură cerere, fără retrimitere', async () => {
  const { O, calls } = relee((url, opts) => new Promise((_, reject) => opts.signal?.addEventListener('abort', () => reject(Object.assign(Error('aborted'), { name: 'AbortError' })))));
  const r = await Promise.race([O.pune({ ticker: 'MU_US_EQ', quantity: 5, stopPrice: 832.2 }, { timeoutMs: 40 }), new Promise((res) => setTimeout(() => res('agățat'), 1500))]);
  assert.notEqual(r, 'agățat', 'trimiterea nu mai stă agățată la nesfârșit');
  assert.equal(r.ok, false); assert.equal(r.error, 'timeout');
  assert.match(r.mesaj, /nu știm dacă/i); assert.match(r.mesaj, /verifică în (aplicația )?Trading 212/i); assert.doesNotMatch(r.mesaj, /NU a fost trimis/);
  assert.equal(calls.filter((x) => x.opts.method === 'POST').length, 1, 'fără retrimitere automată');
  assert.equal(O.TIMEOUT_MS, 25000);
});
