// 27.10.2026 (I-761): fila Raport — panoul „Tiparele tale de comportament” calculat pe tranzacțiile perioadei, butonul unui tipar filtrează
// tot raportul la tranzacțiile lui (și „Arată toate” îl scoate), notele Tiltmeter ale zilei se salvează în setările sincronizate ale Jurnalului.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const NOW = Date.now(), H = 3600000, M = 60000;
const iso = (t) => new Date(t).toISOString();
// două tranzacții: o pierdere, apoi o cumpărare la 10 minute (răzbunare), închisă tot pe pierdere
const T = NOW - 3 * 86400000;
const fills = [
  { id: 'b1', orderId: 'o1', ticker: 'AAPL_US_EQ', side: 'BUY', type: 'TRADE', date: iso(T), quantity: 10, price: 100, priceCurrency: 'USD', currency: 'EUR', amount: -900 },
  { id: 's1', orderId: 'o2', ticker: 'AAPL_US_EQ', side: 'SELL', type: 'TRADE', date: iso(T + H), quantity: 10, price: 95, priceCurrency: 'USD', currency: 'EUR', amount: 860, realized: -45 },
  { id: 'b2', orderId: 'o3', ticker: 'MSFT_US_EQ', side: 'BUY', type: 'TRADE', date: iso(T + H + 10 * M), quantity: 5, price: 200, priceCurrency: 'USD', currency: 'EUR', amount: -900 },
  { id: 's2', orderId: 'o4', ticker: 'MSFT_US_EQ', side: 'SELL', type: 'TRADE', date: iso(T + 3 * H), quantity: 5, price: 190, priceCurrency: 'USD', currency: 'EUR', amount: 855, realized: -40 }];

function pagina() {
  const scrieri = [], handlers = {}; let setari = {};
  const selecturi = { somn: { dataset: { jrrTilt: 'somn' }, value: '' }, concentrare: { dataset: { jrrTilt: 'concentrare' }, value: '' }, stres: { dataset: { jrrTilt: 'stres' }, value: '' } };
  const host = { id: 'jrrRaport', innerHTML: '', hidden: false, addEventListener: (t, f) => { handlers[t] = f; }, querySelector: () => null, querySelectorAll: (s) => (s === '[data-jrr-tilt]' ? Object.values(selecturi) : []), scrollIntoView() {}, contains: () => false };
  const c = { console, JSON, Math, Date, Intl, Promise, Set, Map, Number, String, Array, Object, CSS: { escape: (s) => s },
    localStorage: { getItem: () => null, setItem() {} },
    document: { getElementById: (id) => (id === 'jrrRaport' ? host : null), createElement: () => ({ style: {}, hidden: true }), body: { appendChild() {} }, addEventListener() {}, hidden: false, activeElement: null },
    addEventListener() {}, innerWidth: 1200, innerHeight: 800,
    MonthlyLimit: { limita: () => null, text: () => null, stare: () => ({}), setari: () => setari, scrie: (p) => { scrieri.push(p); setari = { ...setari, ...p }; return true; }, reimprospateaza: async () => null, salveazaLuna() {}, dinExecutii: () => ({}) },
    T212Performance: { read: () => ({ rows: fills, currency: 'EUR', state: 'ok', scope: 'active' }) } };
  c.window = c; vm.createContext(c);
  for (const f of ['lib/execution-review.js', 'lib/journal-report.js', 'lib/journal-comportament.js', 'journal/report.js']) vm.runInContext(readFileSync(f, 'utf8'), c);
  const click = (attr, val) => handlers.click({ target: { closest: (sel) => (sel === '[' + attr + ']' ? { dataset: { [attr.replace(/^data-/, '').replace(/-(\w)/g, (_, x) => x.toUpperCase())]: val } } : null), id: '' } });
  return { host, c, click, scrieri, selecturi, setari: () => setari };
}
const asteapta = () => new Promise((r) => setTimeout(r, 20));

test('panoul de tipare apare în Raport, iar butonul unui tipar filtrează raportul la tranzacțiile lui', async () => {
  const p = pagina(); await asteapta();
  assert.match(p.host.innerHTML, /Tiparele tale de comportament/);
  assert.match(p.host.innerHTML, /2 tranzacții închise/);
  p.click('data-jrr-det', 'revenge');
  assert.match(p.host.innerHTML, /1 tranzacții închise/, 'filtrat la tranzacția de răzbunare');
  assert.match(p.host.innerHTML, /Filtru activ: Răzbunare după pierdere/);
  assert.match(p.host.innerHTML, /data-jrr-det="revenge"[^>]*aria-pressed="true"/);
  p.click('data-jrr-det', 'revenge');
  assert.match(p.host.innerHTML, /2 tranzacții închise/, 'a doua apăsare arată tot');
});

test('notele Tiltmeter ale zilei se salvează în setările sincronizate; o notă lipsă nu se salvează', async () => {
  const p = pagina(); await asteapta();
  const azi = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  p.selecturi.somn.value = '2'; p.selecturi.concentrare.value = ''; p.selecturi.stres.value = '4';
  p.click('data-jrr-tilt-salveaza', azi);
  assert.equal(p.scrieri.length, 0, 'concentrarea lipsă ⇒ nimic scris');
  assert.match(p.host.innerHTML, /de la 1 la 5/);
  p.selecturi.concentrare.value = '3';
  p.click('data-jrr-tilt-salveaza', azi);
  assert.deepEqual(JSON.parse(JSON.stringify(p.setari().tilt[azi])), { somn: 2, concentrare: 3, stres: 4 });
});

test('Jurnalul încarcă modulul tiparelor înaintea filei Raport', () => {
  const html = readFileSync('journal/index.html', 'utf8'), m = html.indexOf('lib/journal-comportament.js'), r = html.indexOf('src="report.js');
  assert.ok(m > 0 && m < r);
});
