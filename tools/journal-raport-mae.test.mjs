// 27.10.2026 (I-762): fila Raport — butonul „la cerere” citește barele intraday o dată pe simbol și interval, calculează MAE / MFE pentru
// tranzacțiile eligibile și le ține în cache-ul local; la al doilea desen nu se mai cere nimic.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const NOW = Date.now(), H = 3600000, M = 60000, T = NOW - 2 * 86400000 - ((NOW / M) % 1) * M;
const iso = (t) => new Date(t).toISOString();
const fills = [
  { id: 'b1', orderId: 'o1', ticker: 'AAPL_US_EQ', side: 'BUY', type: 'TRADE', date: iso(T), quantity: 10, price: 100, priceCurrency: 'USD', currency: 'EUR', amount: -900 },
  { id: 's1', orderId: 'o2', ticker: 'AAPL_US_EQ', side: 'SELL', type: 'TRADE', date: iso(T + H), quantity: 10, price: 103, priceCurrency: 'USD', currency: 'EUR', amount: 930, realized: 27 }];
const bare = Array.from({ length: 70 }, (_, i) => ({ t: T - 5 * M + i * M, o: 100, h: i === 30 ? 107 : 101, l: i === 20 ? 98 : 99.5, c: 100.5, v: 1 }));

function pagina() {
  const store = new Map(), handlers = {}, cereri = [];
  const host = { id: 'jrrRaport', innerHTML: '', hidden: false, addEventListener: (t, f) => { handlers[t] = f; }, querySelector: () => null, querySelectorAll: () => [], scrollIntoView() {}, contains: () => false };
  const c = { console, JSON, Math, Date, Intl, Promise, Set, Map, Number, String, Array, Object, CSS: { escape: (s) => s },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    document: { getElementById: (id) => (id === 'jrrRaport' ? host : null), createElement: () => ({ style: {}, hidden: true }), body: { appendChild() {} }, addEventListener() {}, hidden: false, activeElement: null },
    addEventListener() {}, innerWidth: 1200, innerHeight: 800,
    D: { fetchStock: async (s, o) => { cereri.push([s, o.interval, o.range]); if (o.interval === '1d') return []; return bare; } },
    MonthlyLimit: { limita: () => null, text: () => null, stare: () => ({}), setari: () => ({}), scrie: () => true, reimprospateaza: async () => null, salveazaLuna() {}, dinExecutii: () => ({}) },
    T212Performance: { read: () => ({ rows: fills, currency: 'EUR', state: 'ok', scope: 'active' }) } };
  c.window = c; vm.createContext(c);
  for (const f of ['lib/execution-review.js', 'lib/journal-report.js', 'lib/journal-mae.js', 'journal/report.js']) vm.runInContext(readFileSync(f, 'utf8'), c);
  const click = (attr) => handlers.click({ target: { closest: (sel) => (sel === '[' + attr + ']' ? { dataset: {} } : null), id: '' } });
  return { host, click, cereri, store };
}
const asteapta = () => new Promise((r) => setTimeout(r, 30));

test('butonul calculează MAE / MFE din barele de 1 minut, o cerere pe simbol, rezultatul rămâne în cache', async () => {
  const p = pagina(); await asteapta();
  assert.match(p.host.innerHTML, /din barele de 1 \/ 5 minute/);
  assert.match(p.host.innerHTML, /1 tranzacții de calculat/);
  p.click('data-jrr-mae'); await asteapta();
  const intraday = p.cereri.filter((x) => x[1] !== '1d');
  assert.deepEqual(intraday, [['AAPL', '1m', '7d']]);
  const cache = JSON.parse(p.store.get('tt_journal_mae_v1'));
  assert.ok(Math.abs(cache.s1.mfe - 7) < 1e-9, 'MFE ' + cache.s1.mfe); assert.ok(Math.abs(cache.s1.mae - -2) < 1e-9, 'MAE ' + cache.s1.mae);
  assert.match(p.host.innerHTML, /\+7,0%/); assert.match(p.host.innerHTML, /Nimic nou de calculat/);
  p.click('data-jrr-mae'); await asteapta();
  assert.equal(p.cereri.filter((x) => x[1] !== '1d').length, 1, 'din cache: nicio cerere nouă');
});

test('Jurnalul încarcă modulul MAE înaintea filei Raport', () => {
  const html = readFileSync('journal/index.html', 'utf8'), m = html.indexOf('lib/journal-mae.js'), r = html.indexOf('src="report.js');
  assert.ok(m > 0 && m < r);
});
