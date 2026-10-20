// 20.10.2026 — Raportul din Jurnal: (I-726) disciplina din execuțiile reale față de jurnalul verdictelor Governor; (I-729) alunecarea la intrare
// față de planul scris; (I-730) bootstrap pe blocuri: scăderea și seria de pierderi la percentila 95, față de pragurile Governor.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function J() { const c = { console, Date, Intl, Math, JSON, WeakMap, Map, Set, Float64Array }; c.window = c; vm.createContext(c); vm.runInContext(readFileSync('lib/journal-report.js', 'utf8'), c); return c.JournalReport; }
const T0 = Date.parse('2026-10-20T13:00:00Z'), H = 3600000, M = 60000;
const fill = (id, side, t, extra = {}) => ({ id, ticker: 'AAPL_US_EQ', type: 'TRADE', side, date: new Date(t).toISOString(), quantity: 10, price: 100, priceCurrency: 'USD', currency: 'EUR', ...extra });
const jurnal = [{ ts: T0, day: '2026-10-20', verdict: 'TRADE', reasons: [], luna: 'ok' }, { ts: T0 + 3 * H, day: '2026-10-20', verdict: 'HALTED', reasons: ['Limita lunară depășită'], luna: 'depasit' }];
const plans = [{ id: 'p1', symbol: 'AAPL', status: 'PLANNED', createdAt: T0 + H - 20 * M, entry: 100, stop: 95, shares: 10 }];
const analize = [{ id: 'te1', buyIds: ['b3'], sellIds: [], record: { entryHigh: 50, stop: 47, createdAt: T0 + 5 * H - 10 * M } }];

test('I-726: fiecare BUY de după primul verdict notat primește verdictul DE ATUNCI, planul din 30 de minute înainte și încălcările', () => {
  const R = J(), rows = [fill('b0', 'BUY', T0 - H), fill('b1', 'BUY', T0 + H), fill('b2', 'BUY', T0 + 4 * H, { quantity: 20 }), fill('b3', 'BUY', T0 + 5 * H, { ticker: 'MSFT_US_EQ', price: 50.5 }), fill('s1', 'SELL', T0 + 6 * H)];
  const d = R.disciplina(rows, { jurnal, analize, plans, now: T0 + 7 * H });
  assert.equal(d.deLa, T0); assert.equal(d.n, 3, 'cumpărarea de dinaintea jurnalului nu se judecă; vânzările nu intră');
  const [b1, b2, b3] = d.randuri;
  assert.equal(b1.verdict, 'TRADE'); assert.equal(b1.plan.sursa, 'plan'); assert.deepEqual(JSON.parse(JSON.stringify(b1.incalcari)), []);
  assert.equal(b2.verdict, 'HALTED'); assert.equal(b2.luna, 'depasit'); assert.equal(b2.plan, null); assert.deepEqual(JSON.parse(JSON.stringify(b2.incalcari)), ['halted', 'limita', 'fara-plan']);
  assert.equal(b3.plan.sursa, 'analiza'); assert.deepEqual(JSON.parse(JSON.stringify(b3.incalcari)), ['halted', 'limita'], 'analiza salvată = plan scris, chiar cu Governor HALTED');
  assert.deepEqual(JSON.parse(JSON.stringify(d.incalcari)), { halted: 2, limita: 2, faraPlan: 1, pestePlan: 0, total: 2 }); assert.equal(d.cuPlan, 2);
  const peste = R.disciplina([fill('b1', 'BUY', T0 + H, { quantity: 11 })], { jurnal, plans, now: T0 + 7 * H }).randuri[0]; assert.deepEqual(JSON.parse(JSON.stringify(peste.incalcari)), ['peste-plan'], '11 > 10 × 1,05');
  const gol = R.disciplina(rows, { jurnal: [], plans, now: T0 + 7 * H }); assert.equal(gol.deLa, null); assert.equal(gol.n, 0);
  const rez = R.disciplinaRezultat([{ buyIds: ['b2'], rez: -40 }, { buyIds: ['b1'], rez: 30 }, { buyIds: ['b1', 'b3'], rez: 5 }], d);
  assert.equal(rez.cuIncalcari.n, 2); assert.equal(rez.cuIncalcari.medie, -17.5); assert.equal(rez.fara.n, 1); assert.equal(rez.fara.medie, 30);
});

test('I-729: alunecarea = fill față de intrarea planului, în bps și R; media ultimelor 10 față de pragul 0,1 R scris înainte; pe ticker și pe ora NY', () => {
  const R = J(), rows = [fill('b1', 'BUY', T0 + H, { price: 101 }), fill('b3', 'BUY', T0 + 5 * H, { ticker: 'MSFT_US_EQ', price: 50.3 }), fill('bx', 'BUY', T0 + 2 * H, { ticker: 'NVDA_US_EQ' })];
  const a = R.alunecare(rows, { analize, plans, now: T0 + 7 * H });
  assert.equal(a.n, 2); assert.equal(a.faraPlan, 1); assert.equal(a.prag, 0.1); assert.equal(R.PRAG_ALUNECARE_R, 0.1);
  const b1 = a.randuri.find((r) => r.id === 'b1'), b3 = a.randuri.find((r) => r.id === 'b3');
  assert.equal(Math.round(b1.bps), 100); assert.ok(Math.abs(b1.R - 0.2) < 1e-9, '1 $ peste intrare la risc de 5 $ = 0,2 R'); assert.equal(b1.ora, 1, '14:00Z = 10:00 NY ⇒ 9:30–10:30');
  assert.ok(Math.abs(b3.R - 0.1) < 1e-9); assert.equal(b3.sursa, 'analiza');
  assert.equal(a.ultimele10.n, 2); assert.equal(a.ultimele10.alerta, false, 'sub 5 intrări nu se judecă');
  const multe = R.alunecare(Array.from({ length: 6 }, (_, i) => fill('m' + i, 'BUY', T0 + H + i * M, { price: 101 })), { plans, now: T0 + 7 * H });
  assert.equal(multe.ultimele10.n, 6); assert.equal(multe.ultimele10.alerta, true, 'media 0,2 R > prag 0,1 R');
  assert.equal(a.peTicker.length, 2); assert.equal(a.peOra.length, 2, '10:00 și 14:00 NY = două ferestre');
});

test('I-730: bootstrap pe blocuri de 5 — scăderea și seria de pierderi la 95 % există, sunt deterministe și nu schimbă cifrele vechi', () => {
  const R = J(), tr = [12, -8, -9, 15, -7, -6, -5, 20, 9, -4, 11, -3, 7, -10, 6, 14, -2, 8, -9, 5].map((rez, i) => ({ rez, iesire: T0 + i * 86400000 }));
  const a = R.incredere(tr), b = R.incredere(tr);
  assert.equal(a.bloc, 5); assert.ok(a.ddBloc95 >= a.ddBlocMed && a.ddBlocMed >= 0); assert.ok(Number.isInteger(a.serie95) && a.serie95 >= a.serieMed && a.serie95 <= 50);
  assert.ok(a.serie95 >= 2, 'seriile de pierderi din date se păstrează în blocuri');
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), 'aceeași sămânță ⇒ aceleași cifre');
  for (const k of ['n', 'medie', 'lo', 'hi', 'ddMed', 'dd95', 'pNeg', 'viitoare', 'trebuie', 'maiTrebuie']) assert.ok(k in a, k);
  const html = R.coziHtml(a, { gov: { maxDdPctRolling: 10, cooldownAfterLosses: 3 }, cont: 100 }, 'EUR');
  assert.match(html, /Pragul DD de 10,0 %/); assert.match(html, /cooldown/i); assert.match(html, /blocuri de 5/);
  assert.match(R.coziHtml(a, { gov: { maxDdPctRolling: 10, cooldownAfterLosses: 3 }, cont: null }, 'EUR'), /Contul nu e citit/);
});

test('render: secțiunile Disciplina și Alunecarea apar cu datele din model; fără jurnal ⇒ textul de activare', () => {
  const R = J(), now = T0 + 7 * H, tr = [{ id: 's1', ticker: 'AAPL_US_EQ', sym: 'AAPL', iesire: T0 + 6 * H, intrare: T0 + H, zile: 0.2, qty: 10, entry: 101, exit: 105, pct: 3.96, cost: 1000, fees: 1, rez: 38, moneda: 'EUR', buyIds: ['b1'], etichete: [] }];
  const html = R.render({ tr, toate: tr, moneda: 'EUR', perioada: 0, ticker: '', tickere: ['AAPL_US_EQ'], ex: new Map(), spy: null, limita: null, stare: '', rows: [fill('b1', 'BUY', T0 + H, { price: 101 }), fill('s1', 'SELL', T0 + 6 * H, { price: 105, realized: 38 })], jurnal, analize: [], plans, gov: { maxDdPctRolling: 10, cooldownAfterLosses: 3 }, cont: 10000, now });
  assert.match(html, /Disciplina: regulile față de intrările reale/); assert.match(html, /100,0%<\/b><span class="jrr-sub">1 din 1 cumpărări/); assert.match(html, /Nicio încălcare notată/);
  assert.match(html, /Alunecarea la intrare/); assert.match(html, /\+100,0 bps/);
  const fara = R.render({ tr, toate: tr, moneda: 'EUR', perioada: 0, ticker: '', tickere: [], ex: new Map(), rows: [], jurnal: [], analize: [], plans: [], now });
  assert.match(fara, /Registrul verdictelor începe la activarea acestei versiuni/);
});
