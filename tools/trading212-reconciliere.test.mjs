// 27.10.2026 (I-759, partea client): după fiecare citire a brokerului, copiile aplicației sunt comparate cu ce spune Trading 212 —
// pozițiile (jurnalul execuțiilor când e complet, altfel copia de dinainte), numerarul (sumarul trebuie să se închidă; numerarul copiei nu se
// schimbă fără execuție sau mișcare de bani cunoscută), ordinele (ce a trimis aplicația trebuie să fie la broker; nicio vânzare fără poziție).
// Rezultatul: tt_reconciliere_v1 = {la, scope, ok, diferente:[{tip, ticker, app, broker, text}]} — lotul C ⇒ CAUTION când ok=false; lotul A ⇒ Health.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const NOW = Date.parse('2026-10-27T20:10:00Z'), ISO = (t) => new Date(t).toISOString();
function ctx() {
  const store = new Map();
  const c = { console, Intl, JSON, Math, Date, Map, Set, Number, String, Array, Object, localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } };
  c.window = c; vm.createContext(c); vm.runInContext(readFileSync('lib/trading212-reconciliere.js', 'utf8'), c);
  return { R: c.TTReconciliere, store };
}
const summary = (o = {}) => ({ currency: 'RON', totalValue: 10000, available: 2000, reserved: 0, invested: 8000, ...o });
const poz = (ticker, quantity, value, o = {}) => ({ ticker, quantity, currency: 'RON', instrumentCurrency: 'USD', value, currentPrice: 100, ...o });
const positions = () => [poz('MU_US_EQ', 5.5, 5000), poz('AAPL_US_EQ', 2, 3000)];
const fill = (ticker, side, quantity, date) => ({ id: ticker + side + quantity + date, ticker, side, quantity, date, type: 'MARKET' });
const fills = (items, complete = true) => ({ items, complete });
const snapshot = (o = {}) => ({ environment: 'live', summary: summary(), positions: positions(), fetchedAt: ISO(NOW - 60000), ...o });
const broker = (o = {}) => ({ summary: summary(), positions: positions(), orders: [], ...o });

test('contractul: forma rezultatului, cheia și „ok” când copiile și brokerul spun același lucru', () => {
  const { R } = ctx();
  const r = R.compara({ scope: 'live:abc', broker: broker(), copii: { snapshot: snapshot(), fills: fills([fill('MU_US_EQ', 'BUY', 5.5, ISO(NOW - 86400000)), fill('AAPL_US_EQ', 'BUY', 3, ISO(NOW - 86400000)), fill('AAPL_US_EQ', 'SELL', 1, ISO(NOW - 3600000))]), ordine: { items: [], fetchedAt: ISO(NOW - 60000) } }, now: NOW });
  assert.equal(R.KEY, 'tt_reconciliere_v1');
  assert.deepEqual(r, { la: ISO(NOW), scope: 'live:abc', ok: true, diferente: [], verificat: { pozitii: 'jurnal', numerar: true, ordine: true } });
});
test('poziții: jurnalul complet al execuțiilor e copia de referință — cantitate diferită, poziție la broker fără execuții sau execuții fără poziție ⇒ diferențe', () => {
  const { R } = ctx();
  const r = R.compara({ scope: 's', broker: broker({ positions: [poz('MU_US_EQ', 5.5, 5000), poz('NVDA_US_EQ', 1, 3000)] }), copii: { snapshot: null, fills: fills([fill('MU_US_EQ', 'BUY', 6, ISO(NOW - 86400000)), fill('AAPL_US_EQ', 'BUY', 2, ISO(NOW - 86400000))]), ordine: null }, now: NOW });
  assert.equal(r.ok, false); assert.equal(r.verificat.pozitii, 'jurnal');
  const p = r.diferente.filter((d) => d.tip === 'pozitie').sort((a, b) => a.ticker.localeCompare(b.ticker));
  assert.deepEqual(p.map((d) => [d.ticker, d.app, d.broker]), [['AAPL_US_EQ', 2, 0], ['MU_US_EQ', 6, 5.5], ['NVDA_US_EQ', 0, 1]]);
  assert.match(p[1].text, /MU.*6(,0)?.*5,5/); assert.match(p[2].text, /nicio execuție|fără execuție/i);
});
test('poziții: cu jurnalul incomplet se compară cu copia de dinainte; fără nicio copie nu se inventează diferențe (verificat: fara)', () => {
  const { R } = ctx();
  const r = R.compara({ scope: 's', broker: broker(), copii: { snapshot: snapshot({ positions: [poz('MU_US_EQ', 5, 4500), poz('AAPL_US_EQ', 2, 3000)] }), fills: fills([fill('MU_US_EQ', 'BUY', 1, ISO(NOW))], false), ordine: null }, now: NOW });
  assert.equal(r.verificat.pozitii, 'copie'); assert.deepEqual(r.diferente.map((d) => [d.tip, d.ticker, d.app, d.broker]), [['pozitie', 'MU_US_EQ', 5, 5.5]]); assert.match(r.diferente[0].text, /copia/i);
  const nimic = R.compara({ scope: 's', broker: broker(), copii: { snapshot: null, fills: null, ordine: null }, now: NOW });
  assert.equal(nimic.ok, true); assert.equal(nimic.verificat.pozitii, 'fara'); assert.equal(nimic.verificat.ordine, false);
});
test('numerar: sumarul brokerului trebuie să se închidă (numerar + rezervat + valoarea pozițiilor ≈ valoarea contului); o poziție fără valoare sare verificarea', () => {
  const { R } = ctx();
  const gaura = R.compara({ scope: 's', broker: broker({ summary: summary({ totalValue: 10900 }) }), copii: { snapshot: null, fills: null, ordine: null }, now: NOW });
  assert.equal(gaura.ok, false); const d = gaura.diferente.find((x) => x.tip === 'numerar'); assert.equal(d.ticker, null); assert.equal(d.app, 10000); assert.equal(d.broker, 10900); assert.match(d.text, /nu se închide/i); assert.match(d.text, /900,0/);
  const mic = R.compara({ scope: 's', broker: broker({ summary: summary({ totalValue: 10030 }) }), copii: { snapshot: null, fills: null, ordine: null }, now: NOW });
  assert.equal(mic.ok, true, 'sub 0,5 % din cont e rotunjire / moment diferit al citirilor, nu diferență');
  const fara = R.compara({ scope: 's', broker: broker({ summary: summary({ totalValue: 10900 }), positions: [poz('MU_US_EQ', 5.5, null), poz('AAPL_US_EQ', 2, 3000)] }), copii: { snapshot: null, fills: null, ordine: null }, now: NOW });
  assert.equal(fara.ok, true); assert.equal(fara.verificat.numerar, false);
});
test('numerar: numerarul copiei s-a schimbat fără execuție sau mișcare de bani cunoscută ⇒ diferență; cu o execuție după copie e explicat', () => {
  const { R } = ctx();
  const copie = snapshot({ summary: summary({ available: 2500, totalValue: 10500 }) });
  const r = R.compara({ scope: 's', broker: broker(), copii: { snapshot: copie, fills: fills([fill('MU_US_EQ', 'BUY', 5.5, ISO(NOW - 86400000)), fill('AAPL_US_EQ', 'BUY', 2, ISO(NOW - 86400000))]), ordine: null, cash: { dividends: { items: [] }, transactions: { items: [{ id: 'd1', date: ISO(NOW - 86400000), amount: 100 }] } } }, now: NOW });
  assert.equal(r.ok, false); const d = r.diferente.find((x) => x.tip === 'numerar'); assert.equal(d.app, 2500); assert.equal(d.broker, 2000); assert.match(d.text, /fără execuție/i);
  const explicat = R.compara({ scope: 's', broker: broker(), copii: { snapshot: copie, fills: fills([fill('MU_US_EQ', 'BUY', 5.5, ISO(NOW - 86400000)), fill('AAPL_US_EQ', 'BUY', 2, ISO(NOW - 30000))]), ordine: null }, now: NOW });
  assert.equal(explicat.diferente.filter((x) => x.tip === 'numerar').length, 0);
  const bani = R.compara({ scope: 's', broker: broker(), copii: { snapshot: copie, fills: fills([fill('MU_US_EQ', 'BUY', 5.5, ISO(NOW - 86400000)), fill('AAPL_US_EQ', 'BUY', 2, ISO(NOW - 86400000))]), ordine: null, cash: { transactions: { items: [{ id: 'w', date: ISO(NOW - 20000), amount: -500 }] } } }, now: NOW });
  assert.equal(bani.diferente.filter((x) => x.tip === 'numerar').length, 0, 'o retragere după copie explică schimbarea');
});
test('ordine: ordinul trimis din aplicație care nu mai e la broker și vânzarea în așteptare fără poziție ⇒ diferențe; ordinele necitite nu se verifică', () => {
  const { R } = ctx();
  const copie = { items: [{ id: '901', ticker: 'MU_US_EQ', type: 'STOP', side: 'SELL', quantity: 5.5, stopPrice: 780, trimisDinApp: true }, { id: '5', ticker: 'AAPL_US_EQ', type: 'STOP', side: 'SELL', quantity: 2, stopPrice: 150 }], fetchedAt: ISO(NOW - 60000) };
  const r = R.compara({ scope: 's', broker: broker({ orders: [{ id: '5', ticker: 'AAPL_US_EQ', type: 'STOP', side: 'SELL', quantity: 2, stopPrice: 150 }, { id: '6', ticker: 'TSLA_US_EQ', type: 'STOP', side: 'SELL', quantity: 1, stopPrice: 200 }] }), copii: { snapshot: null, fills: null, ordine: copie }, now: NOW });
  assert.equal(r.ok, false); const o = r.diferente.filter((d) => d.tip === 'ordin');
  assert.deepEqual(o.map((d) => [d.ticker, d.app, d.broker]), [['MU_US_EQ', 780, null], ['TSLA_US_EQ', null, 200]]);
  assert.match(o[0].text, /trimis din aplicație/i); assert.match(o[1].text, /fără poziție/i);
  const gasit = R.compara({ scope: 's', broker: broker({ orders: [{ id: null, ticker: 'MU_US_EQ', type: 'STOP', side: 'SELL', quantity: 5.5, stopPrice: 780 }] }), copii: { snapshot: null, fills: null, ordine: copie }, now: NOW });
  assert.equal(gasit.diferente.filter((d) => d.tip === 'ordin' && d.ticker === 'MU_US_EQ').length, 0, 'fără id, ordinul se recunoaște după simbol + stop');
  const necitit = R.compara({ scope: 's', broker: broker({ orders: null }), copii: { snapshot: null, fills: null, ordine: copie }, now: NOW });
  assert.equal(necitit.verificat.ordine, false); assert.equal(necitit.ok, true);
});
test('salveaza/citeste și textul pentru pagina contului (o zecimală, diferențele la vedere)', () => {
  const { R, store } = ctx();
  const r = R.compara({ scope: 's', broker: broker({ summary: summary({ totalValue: 10900 }) }), copii: { snapshot: null, fills: null, ordine: null }, now: NOW });
  R.salveaza(store, r); assert.deepEqual(R.citeste(store), r); assert.deepEqual(JSON.parse(store.get('tt_reconciliere_v1')), r);
  const esc = (s) => String(s).replace(/</g, '&lt;');
  assert.match(R.html(r, esc), /1 diferență/); assert.match(R.html(r, esc), /nu se închide/); assert.match(R.html(r, esc), /neverificat|fără copie/i);
  assert.match(R.html(null, esc), /nicio reconciliere/i);
  const bun = R.compara({ scope: 's', broker: broker(), copii: { snapshot: null, fills: null, ordine: null }, now: NOW });
  assert.match(R.html(bun, esc), /fără diferențe/i);
});

// ruleaza = reconcilierea cu stare, cea chemată de pagina contului după fiecare citire: baza (ultima stare reconciliată curat) în
// tt_reconciliere_baza_v1; diferențele care pot veni dintr-o execuție încă necitită stau „de confirmat” până la recitirea jurnalului (sau 15 minute).
function mem() { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; }
const plain = (x) => JSON.parse(JSON.stringify(x));
const jurnal = (items, fetchedAt, complete = false) => ({ items, complete, fetchedAt: fetchedAt == null ? null : ISO(fetchedAt) });
test('ruleaza: prima citire pune baza; o poziție schimbată fără execuție e „de confirmat” până la recitirea jurnalului, apoi devine diferență', () => {
  const { R } = ctx(), s = mem(), scope = 'live:x', t0 = NOW - 600000, t1 = NOW - 300000, t2 = t1 + 60000;
  const r0 = R.ruleaza({ storage: s, scope, broker: { ...broker(), la: ISO(t0) }, fills: jurnal([], t0 - 1000), now: t0 });
  assert.equal(r0.ok, true); assert.equal(r0.verificat.pozitii, 'fara', 'fără bază încă nu se inventează diferențe');
  const b1 = { ...broker({ positions: [poz('MU_US_EQ', 7, 6000), poz('AAPL_US_EQ', 2, 3000)], summary: summary({ totalValue: 11000 }) }), la: ISO(t1) };
  const r1 = R.ruleaza({ storage: s, scope, broker: b1, fills: jurnal([], t1 - 5000), now: t1 });
  assert.equal(r1.ok, true, 'jurnalul e citit ÎNAINTEA brokerului: execuția poate fi încă necitită'); assert.equal(r1.verificat.pozitii, 'copie');
  assert.deepEqual(plain(r1.deConfirmat).map((d) => [d.tip, d.ticker, d.app, d.broker]), [['pozitie', 'MU_US_EQ', 5.5, 7]]);
  assert.deepEqual(plain(R.citeste(s)), plain(r1)); assert.match(R.html(R.citeste(s), String), /de confirmat/i);
  const r2 = R.ruleaza({ storage: s, scope, broker: { ...b1, la: ISO(t2) }, fills: jurnal([], t2 - 2000), now: t2 });
  assert.equal(r2.ok, false, 'jurnalul recitit după citirea care a arătat diferența tot n-o explică'); assert.deepEqual(plain(r2.diferente).map((d) => [d.tip, d.ticker]), [['pozitie', 'MU_US_EQ']]); assert.deepEqual(plain(r2.deConfirmat), []);
});
test('ruleaza: execuția găsită la recitire explică schimbarea, iar baza înaintează doar după o reconciliere curată', () => {
  const { R } = ctx(), s = mem(), scope = 'live:x', t0 = NOW - 600000, t1 = NOW - 300000, t2 = t1 + 60000, t3 = t2 + 60000;
  R.ruleaza({ storage: s, scope, broker: { ...broker(), la: ISO(t0) }, fills: jurnal([], t0 - 1000), now: t0 });
  const b1 = { ...broker({ positions: [poz('MU_US_EQ', 7, 6000), poz('AAPL_US_EQ', 2, 3000)], summary: summary({ totalValue: 11000 }) }), la: ISO(t1) };
  assert.equal(R.ruleaza({ storage: s, scope, broker: b1, fills: jurnal([], t1 - 5000), now: t1 }).deConfirmat.length, 1);
  const cumparare = [fill('MU_US_EQ', 'BUY', 1.5, ISO(t1 - 10000))];
  const r2 = R.ruleaza({ storage: s, scope, broker: { ...b1, la: ISO(t2) }, fills: jurnal(cumparare, t2 - 1000), now: t2 });
  assert.equal(r2.ok, true); assert.deepEqual(plain(r2.diferente), []); assert.deepEqual(plain(r2.deConfirmat), []);
  const baza = JSON.parse(s.getItem('tt_reconciliere_baza_v1'))[scope]; assert.equal(baza.snapshot.fetchedAt, ISO(t2)); assert.deepEqual(baza.snapshot.positions.map((p) => [p.ticker, p.quantity]), [['MU_US_EQ', 7], ['AAPL_US_EQ', 2]]);
  const r3 = R.ruleaza({ storage: s, scope, broker: { ...b1, la: ISO(t3) }, fills: jurnal(cumparare, t3 - 1000), now: t3 });
  assert.equal(r3.ok, true, 'execuția de dinaintea bazei noi nu se mai adună încă o dată');
});
test('ruleaza: fără ora recitirii jurnalului diferența nu stă ascunsă — se confirmă după 15 minute; sumarul care nu se închide e diferență pe loc', () => {
  const { R } = ctx(), s = mem(), scope = 'live:x', t0 = NOW - 3600000, t1 = t0 + 60000;
  R.ruleaza({ storage: s, scope, broker: { ...broker(), la: ISO(t0) }, fills: jurnal([], null), now: t0 });
  const b1 = { ...broker({ positions: [poz('MU_US_EQ', 7, 6000), poz('AAPL_US_EQ', 2, 3000)], summary: summary({ totalValue: 11000 }) }) };
  assert.equal(R.ruleaza({ storage: s, scope, broker: { ...b1, la: ISO(t1) }, fills: jurnal([], null), now: t1 }).ok, true);
  assert.equal(R.ruleaza({ storage: s, scope, broker: { ...b1, la: ISO(t1 + 14 * 60000) }, fills: jurnal([], null), now: t1 + 14 * 60000 }).ok, true);
  const r = R.ruleaza({ storage: s, scope, broker: { ...b1, la: ISO(t1 + 15 * 60000) }, fills: jurnal([], null), now: t1 + 15 * 60000 });
  assert.equal(r.ok, false); assert.equal(r.diferente[0].ticker, 'MU_US_EQ');
  const g = R.ruleaza({ storage: mem(), scope, broker: { ...broker({ summary: summary({ totalValue: 10900 }) }), la: ISO(NOW) }, fills: null, now: NOW });
  assert.equal(g.ok, false); assert.equal(g.diferente[0].tip, 'numerar');
});
test('accepta: cere motiv; după „Am verificat” starea brokerului devine baza, iar în jurnalul complet diferența acceptată (split) rămâne ca ajustare', () => {
  const { R } = ctx(), s = mem(), scope = 'live:x';
  const fl = (t) => jurnal([fill('MU_US_EQ', 'BUY', 0.55, ISO(NOW - 86400000)), fill('AAPL_US_EQ', 'BUY', 2, ISO(NOW - 86400000))], t, true);
  const r = R.ruleaza({ storage: s, scope, broker: { ...broker(), la: ISO(NOW) }, fills: fl(NOW + 1000), now: NOW });
  assert.equal(r.ok, false); assert.equal(r.verificat.pozitii, 'jurnal'); assert.deepEqual(plain(r.diferente).map((d) => [d.ticker, d.app, d.broker]), [['MU_US_EQ', 0.55, 5.5]]);
  assert.equal(R.accepta({ storage: s, scope, motiv: ' ', now: NOW }).ok, false, 'fără motiv nu se acceptă');
  assert.equal(R.accepta({ storage: s, scope: 'demo:y', motiv: 'altceva', now: NOW }).ok, false, 'alt cont');
  const a = R.accepta({ storage: s, scope, motiv: 'split 10:1 la MU, verificat în Trading 212', now: NOW + 1000 });
  assert.equal(a.ok, true); assert.equal(R.citeste(s).ok, true); assert.match(R.html(R.citeste(s), String), /split 10:1/);
  const dupa = R.ruleaza({ storage: s, scope, broker: { ...broker(), la: ISO(NOW + 60000) }, fills: fl(NOW + 61000), now: NOW + 60000 });
  assert.equal(dupa.ok, true); assert.deepEqual(plain(dupa.diferente), []); assert.match(R.html(dupa, String), /split 10:1/, 'acceptarea rămâne la vedere');
});
test('ruleaza: STOP-ul trimis din aplicație rămâne urmărit și după ce citirea rescrie copia ordinelor; anularea din aplicație („Oprește tot”) îl explică', () => {
  const { R } = ctx(), s = mem(), scope = 'live:x';
  const copie = { items: [{ id: '901', ticker: 'MU_US_EQ', type: 'STOP', side: 'SELL', quantity: 5.5, stopPrice: 780, trimisDinApp: true }], fetchedAt: ISO(NOW - 120000) };
  const r1 = R.ruleaza({ storage: s, scope, broker: { ...broker({ orders: [] }), la: ISO(NOW - 60000) }, fills: jurnal([], NOW - 30000), ordineCopie: copie, now: NOW - 60000 });
  assert.equal(r1.ok, false); assert.deepEqual(plain(r1.diferente).map((d) => [d.tip, d.ticker, d.app]), [['ordin', 'MU_US_EQ', 780]]);
  const r2 = R.ruleaza({ storage: s, scope, broker: { ...broker({ orders: [] }), la: ISO(NOW) }, fills: jurnal([], NOW + 1000), ordineCopie: { items: [], fetchedAt: ISO(NOW - 60000) }, now: NOW });
  assert.equal(r2.ok, false, 'copia rescrisă de citirea brokerului nu șterge urmărirea');
  R.anulat({ storage: s, scope, ids: ['901'], now: NOW + 2000 });
  const r3 = R.ruleaza({ storage: s, scope, broker: { ...broker({ orders: [] }), la: ISO(NOW + 60000) }, fills: jurnal([], NOW + 61000), ordineCopie: { items: [], fetchedAt: ISO(NOW) }, now: NOW + 60000 });
  assert.equal(r3.ok, true); assert.deepEqual(JSON.parse(s.getItem('tt_reconciliere_baza_v1'))[scope].ordineApp, []);
});
test('sumarul cu bani în Pies (inPies) se închide; scope gol sau fără storage nu scrie nimic', () => {
  const { R } = ctx();
  const r = R.compara({ scope: 's', broker: broker({ summary: summary({ totalValue: 10300, inPies: 300 }) }), copii: {}, now: NOW });
  assert.equal(r.ok, true);
  const s = mem(); assert.equal(R.ruleaza({ storage: s, scope: '', broker: broker(), now: NOW }), null); assert.equal(s.m.size, 0);
});
