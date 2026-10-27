// 27.10.2026 (I-763): fila Raport — heatmap-ul zi × oră desenat din tranzacții, etichetele zilei salvate în setările sincronizate,
// o tranzacție ratată notată și „ce a făcut prețul după” citit din barele zilnice.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const NOW = Date.now(), H = 3600000, D = 86400000, iso = (t) => new Date(t).toISOString();
const T = NOW - 10 * D;
const fills = [
  { id: 'b1', orderId: 'o1', ticker: 'AAPL_US_EQ', side: 'BUY', type: 'TRADE', date: iso(T), quantity: 10, price: 100, priceCurrency: 'USD', currency: 'EUR', amount: -900 },
  { id: 's1', orderId: 'o2', ticker: 'AAPL_US_EQ', side: 'SELL', type: 'TRADE', date: iso(T + 2 * H), quantity: 10, price: 103, priceCurrency: 'USD', currency: 'EUR', amount: 930, realized: 27 }];
const zileBare = Array.from({ length: 12 }, (_, i) => ({ t: NOW - (11 - i) * D, o: 50, h: 51 + i, l: 49, c: 50 + i, v: 1 }));

function pagina() {
  const handlers = {}, cereri = []; let setari = {};
  const campuri = { zi: [{ dataset: { jrrZi: 'regim' }, value: '' }, { dataset: { jrrZi: 'stare' }, value: '' }, { dataset: { jrrZi: 'emotie' }, value: '' }],
    rat: [{ dataset: { jrrRat: 'simbol' }, value: '' }, { dataset: { jrrRat: 'zi' }, value: '' }, { dataset: { jrrRat: 'pret' }, value: '' }, { dataset: { jrrRat: 'motiv' }, value: '' }] };
  const host = { id: 'jrrRaport', innerHTML: '', hidden: false, addEventListener: (t, f) => { handlers[t] = f; }, querySelector: () => null, scrollIntoView() {}, contains: () => false,
    querySelectorAll: (s) => (s === '[data-jrr-zi]' ? campuri.zi : s === '[data-jrr-rat]' ? campuri.rat : []) };
  const c = { console, JSON, Math, Date, Intl, Promise, Set, Map, Number, String, Array, Object, CSS: { escape: (s) => s },
    localStorage: { getItem: () => null, setItem() {} },
    document: { getElementById: (id) => (id === 'jrrRaport' ? host : null), createElement: () => ({ style: {}, hidden: true }), body: { appendChild() {} }, addEventListener() {}, hidden: false, activeElement: null },
    addEventListener() {}, innerWidth: 1200, innerHeight: 800,
    D: { fetchStock: async (s, o) => { cereri.push([s, o.interval]); return s === 'NVDA' ? zileBare : []; } },
    MonthlyLimit: { limita: () => null, text: () => null, stare: () => ({}), setari: () => setari, scrie: (p) => { setari = { ...setari, ...p }; return true; }, reimprospateaza: async () => null, salveazaLuna() {}, dinExecutii: () => ({}) },
    T212Performance: { read: () => ({ rows: fills, currency: 'EUR', state: 'ok', scope: 'active' }) } };
  c.window = c; vm.createContext(c);
  for (const f of ['lib/execution-review.js', 'lib/journal-report.js', 'lib/journal-zile.js', 'journal/report.js']) vm.runInContext(readFileSync(f, 'utf8'), c);
  const click = (attr, val = '1') => handlers.click({ target: { closest: (sel) => (sel === '[' + attr + ']' ? { dataset: { [attr.replace(/^data-/, '').replace(/-(\w)/g, (_, x) => x.toUpperCase())]: val } } : null), id: '' } });
  return { host, click, campuri, cereri, setari: () => setari };
}
const asteapta = () => new Promise((r) => setTimeout(r, 30));
const aziNY = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

test('heatmap-ul zi × oră și panoul zilei apar în Raport', async () => {
  const p = pagina(); await asteapta();
  assert.match(p.host.innerHTML, /Când pierzi și când câștigi: ziua × ora intrării/);
  assert.match(p.host.innerHTML, /class="jrr-hm"/);
  assert.match(p.host.innerHTML, /Ziua ta: etichetele zilei și tranzacțiile ratate/);
});

test('etichetele zilei se salvează în setări; fără nicio etichetă, nimic', async () => {
  const p = pagina(); await asteapta();
  p.click('data-jrr-zi-salveaza', aziNY());
  assert.equal(p.setari().zile, undefined); assert.match(p.host.innerHTML, /Alege măcar o etichetă/);
  p.campuri.zi[0].value = 'lateral'; p.campuri.zi[2].value = 'FOMO';
  p.click('data-jrr-zi-salveaza', aziNY());
  assert.deepEqual(JSON.parse(JSON.stringify(p.setari().zile[aziNY()])), { regim: 'lateral', emotie: 'FOMO' });
});

test('o tranzacție ratată se notează și primește ce a făcut prețul după, din barele zilnice', async () => {
  const p = pagina(); await asteapta();
  const zi = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(NOW - 8 * D));
  Object.assign(p.campuri.rat[0], { value: 'nvda' }); Object.assign(p.campuri.rat[1], { value: zi }); Object.assign(p.campuri.rat[3], { value: 'Governor HALTED' });
  p.click('data-jrr-rat-adauga'); await asteapta();
  assert.equal(p.setari().ratate.length, 1); assert.equal(p.setari().ratate[0].simbol, 'NVDA');
  assert.ok(p.cereri.some((x) => x[0] === 'NVDA' && x[1] === '1d'));
  assert.match(p.host.innerHTML, /5 sesiuni/);
  p.click('data-jrr-rat-sterge', p.setari().ratate[0].id);
  assert.equal(p.setari().ratate.length, 0);
});

test('Jurnalul încarcă modulul zilelor înaintea filei Raport', () => {
  const html = readFileSync('journal/index.html', 'utf8'), m = html.indexOf('lib/journal-zile.js'), r = html.indexOf('src="report.js');
  assert.ok(m > 0 && m < r);
});
