// 19.10.2026 — I-700 (🔴): Drafturile dimensionau pe capitalul LOCAL vechi. Pe PC tt_account_size_v1 = 12.670 (din iulie), contul real
// Trading 212 ≈ 5.393 $ ⇒ pozițiile ieșeau de 2,35× prea mari. Acum ACCT.capitalInfo() spune ce capital se folosește, de unde vine și cât
// de vechi e; Drafturile folosesc Trading 212 când citirea are sub 24 h, iar un capital neverificat de peste 7 zile nu mai dă GO.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const ACUM = Date.parse('2026-10-19T15:00:00Z'), H = 3600000;
const port = (o = {}) => ({ a1: { environment: 'live', active: true, fetchedAt: new Date(ACUM - 3 * H).toISOString(), summary: { totalValue: 4645.52, currency: 'EUR' }, positions: [], ...o } });

function lume(seed = {}, extra = {}) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  let now = ACUM;
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const listeners = {};
  const c = { console, JSON, Math, Number, Intl, Date: Clock, localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); }, ...extra };
  c.window = c; vm.createContext(c);
  for (const f of ['lib/trading212-snapshot.js', 'lib/account.js', 'lib/governor.js']) vm.runInContext(readFileSync(f, 'utf8'), c);
  return { c, store, listeners, tick: (ms) => { now += ms; } };
}

test('capitalInfo: contractul fix — Trading 212 proaspăt, în USD la cursul verificat, cu linia gata de afișat și celălalt aparat', () => {
  const w = lume({ tt_account_size_v1: '12670', tt_pf_account: '12670', tt_trading212_portfolio_v1: port() });
  assert.equal(typeof w.c.ACCT.capitalInfo, 'function', 'ACCT.capitalInfo lipsește');
  let i = w.c.ACCT.capitalInfo();
  assert.equal(i.source, 'manual', 'fără curs verificat valoarea în EUR nu devine dolari'); assert.equal(i.value, 12670);
  assert.ok(w.c.ACCT.saveBrokerFx('EUR', 1.161, '2026-10-17'));
  i = w.c.ACCT.capitalInfo();
  for (const k of ['value', 'source', 'at', 'ageHours', 'synced', 'diverges', 'text']) assert.ok(k in i, 'lipsește ' + k);
  assert.equal(i.source, 'broker'); assert.equal(i.value, 5393.45); assert.equal(i.at, ACUM - 3 * H); assert.equal(i.ageHours, 3);
  assert.equal(i.synced, 12670); assert.equal(i.diverges, true);
  assert.equal(i.text, 'Capital folosit: 5.393 $ · Trading 212 · acum 3 h · pe celălalt aparat 12.670 $');
  // aceeași cifră pe celălalt aparat (diferență sub 1 %) ⇒ fără ultima parte
  w.store.set('tt_pf_account', '5400');
  assert.equal(w.c.ACCT.capitalInfo().text, 'Capital folosit: 5.393 $ · Trading 212 · acum 3 h');
  assert.equal(w.c.ACCT.capitalInfo().diverges, false);
});

test('capitalInfo: o citire Trading 212 mai veche de 24 h nu e folosită; capitalul local are vechimea la vedere', () => {
  const w = lume({ tt_trading212_portfolio_v1: port({ fetchedAt: new Date(ACUM - 30 * H).toISOString() }) });
  w.c.ACCT.saveBrokerFx('EUR', 1.161, '2026-10-17');
  w.c.ACCT.syncAll(5100, 'snapshot'); // snapshot pus azi
  let i = w.c.ACCT.capitalInfo();
  assert.equal(i.source, 'snapshot'); assert.equal(i.value, 5100); assert.equal(i.ageHours, 0); assert.equal(i.stale, false);
  w.tick(9 * 24 * H);
  i = w.c.ACCT.capitalInfo();
  assert.equal(i.ageHours, 9 * 24); assert.match(i.text, /acum 9 zile/); assert.equal(i.stale, true, 'peste 7 zile fără sursă proaspătă');
  // migrate() la fiecare deschidere a Jurnalului NU împrospătează vechimea
  w.c.ACCT.migrate(); assert.equal(w.c.ACCT.capitalInfo().ageHours, 9 * 24);
  // capitalul vechi de pe PC (fără nicio dată) ⇒ vechime necunoscută, neverificat
  const pc = lume({ tt_account_size_v1: '12670', tt_pf_account: '5393.45' });
  const p = pc.c.ACCT.capitalInfo();
  assert.equal(p.value, 12670); assert.equal(p.source, 'manual'); assert.equal(p.ageHours, null); assert.equal(p.stale, true);
  assert.equal(p.text, 'Capital folosit: 12.670 $ · setat de mână · vechime necunoscută · pe celălalt aparat 5.393 $');
  // fără niciun capital: value null, nu 10.000
  const gol = lume(); gol.c.ACCT.migrate(); assert.equal(gol.c.ACCT.capitalInfo().value, null); assert.equal(gol.c.ACCT.capitalInfo().source, 'default');
});

test('capital-auto ține cursul verificat pe aparat chiar când snapshot-ul zilei există deja', async () => {
  const w = lume({ tt_trading212_portfolio_v1: port() });
  vm.runInContext(readFileSync('lib/capital-auto.js', 'utf8'), w.c);
  const azi = new Date(ACUM - 3 * H).toISOString().slice(0, 10);
  const deps = { EQ: { snapshots: () => [{ day: azi, equity: 5300, note: 'Trade212' }], addSnapshot: () => null }, ACCT: w.c.ACCT, T212Snapshot: w.c.T212Snapshot,
    Finance: { loadRates: async () => ({}), conversion: () => ({ rate: 1.161, date: '2026-10-17' }) } };
  const r = await w.c.CapitalAuto.run(deps);
  assert.equal(r.status, 'today');
  assert.equal(w.c.ACCT.fxToUsd('EUR'), 1.161);
  assert.equal(w.c.ACCT.capitalInfo().value, 5393.45);
});

// Drafturi: câmpul „Cont $” și dimensionarea
function drafturi(seed, { atins = false } = {}) {
  const nodes = {};
  const node = (id) => nodes[id] || (nodes[id] = { id, value: '', innerHTML: '', textContent: '', hidden: false, style: {}, dataset: {}, classList: { toggle() {}, add() {}, remove() {} }, addEventListener(t, f) { (this.ev = this.ev || {})[t] = f; }, querySelectorAll: () => [] });
  const w = lume(seed, { document: { getElementById: node, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} }, location: { hash: '#setup' }, fetch: async () => ({ ok: false }),
    DailySeries: { usable: () => true }, setInterval() {}, setTimeout() {} });
  vm.runInContext(readFileSync('lib/setup-builder.js', 'utf8'), w.c);
  w.c.SB.init({ $: node, toast() {} });
  if (atins) { node('setupAccount').value = '8000'; node('setupAccount').ev.input(); }
  const L = { last: 100, atrPct: 2, hi20: 112, lo20: 90, ma50: 95, ma200: 90, distMa50: 5, chgPct: 0.5, sourceVerified: true, currency: 'USD', fetchedAt: ACUM - 60000 };
  w.c.SL = { fetchBriefLevels: async () => L };
  w.c.SB.setVerdict({ label: 'favorabil', score: 2, asOf: '2026-10-16' });
  return { ...w, node, build: async () => { node('setupTicker').value = 'TEST'; node('setupRisk').value = '1'; await w.c.SB.buildSetup(); return { html: node('setupResult').innerHTML, s: w.c.SB.getLastSetup() }; } };
}

test('Drafturi: dimensionarea pe capitalul din Trading 212 (citire < 24 h), nu pe capitalul local vechi; linia e la vedere', async () => {
  const d = drafturi({ tt_account_size_v1: '12670', tt_pf_account: '12670', tt_trading212_portfolio_v1: port(), tt_capital_broker_fx_v1: { currency: 'EUR', rate: 1.161, date: '2026-10-17', checkedAt: ACUM - H } });
  assert.equal(Number(d.node('setupAccount').value), 5393.45, 'câmpul Cont $ a rămas pe 12.670');
  const { html, s } = await d.build();
  assert.equal(s.account, 5393.45);
  assert.equal(s.shares, 17, '1 % din 5.393 $ / 3 $ pe acțiune = 17 acțiuni (pe 12.670 ar fi fost 42)');
  assert.match(html, /Capital folosit: 5\.393 \$ · Trading 212 · acum 3 h · pe celălalt aparat 12\.670 \$/);
  assert.match(d.node('setupCapitalLine').textContent, /Capital folosit: 5\.393 \$ · Trading 212/);
  assert.equal(s.verdict, 'GO', 'capital proaspăt: GO rămâne posibil');
});

test('Drafturi: capital fără sursă proaspătă de peste 7 zile ⇒ fără GO, cu motivul; un Cont $ tastat de el rămâne al lui', async () => {
  const d = drafturi({ tt_account_size_v1: '12670', tt_pf_account: '5393.45' });
  const { html, s } = await d.build();
  assert.equal(s.verdict, 'WAIT'); assert.match(html, /Capital neverificat/); assert.match(s.verdictTip, /vechime necunoscută/);
  const t = drafturi({ tt_account_size_v1: '12670' }, { atins: true });
  const r = await t.build();
  assert.equal(r.s.account, 8000); assert.equal(r.s.verdict, 'GO', 'valoarea tastată acum e verificată de el');
});

test('Drafturi: „Cont $” se reîmprospătează după capitalul automat și la schimbarea cheilor de capital, dacă nu l-ai atins', () => {
  const d = drafturi({ tt_account_size_v1: '12670', tt_trading212_portfolio_v1: port() });
  assert.equal(Number(d.node('setupAccount').value), 12670);
  // capital-auto a verificat cursul ⇒ Trading 212 devine sursa
  d.c.ACCT.saveBrokerFx('EUR', 1.161, '2026-10-17');
  assert.equal(typeof d.c.SB.refreshAccountFromCapital, 'function');
  d.c.SB.refreshAccountFromCapital();
  assert.equal(Number(d.node('setupAccount').value), 5393.45);
  // altă pagină / alt aparat schimbă capitalul ⇒ evenimentul storage reîmprospătează câmpul
  d.store.set('tt_trading212_portfolio_v1', JSON.stringify(port({ summary: { totalValue: 5000, currency: 'EUR' } })));
  for (const f of d.listeners.storage || []) f({ key: 'tt_trading212_portfolio_v1' });
  assert.equal(Number(d.node('setupAccount').value), 5805);
  // după ce l-a tastat, câmpul e al lui
  d.node('setupAccount').value = '7000'; d.node('setupAccount').ev.input();
  d.c.SB.refreshAccountFromCapital();
  assert.equal(d.node('setupAccount').value, '7000');
});

test('Governor: „Buget rămas” pentru un cont în EUR = minimul cu bugetele brokerului, convertite în USD (ca în Planuri)', () => {
  const broker = { verdict: 'TRADE', reasons: [], state: 'ready', currency: 'EUR', positions: 0, budgetLeft: 90, weekBudgetLeft: 140, totalStopRisk: 0, stopBudgetLeft: 230 };
  const w = lume({ tt_account_size_v1: '12670', tt_journal_v1: [] }, {});
  w.c.T212Capital = { read: () => broker };
  const fara = w.c.GV.status();
  assert.equal(Math.round(fara.budgetLeftUsd), 253, 'fără curs: din capitalul local (2 % × 12.670)');
  assert.match(fara.reasons.join(' '), /nu are curs BCE verificat/);
  w.c.ACCT.saveBrokerFx('EUR', 1.161, '2026-10-17');
  const s = w.c.GV.status();
  assert.equal(Math.round(s.budgetLeftUsd * 100) / 100, 104.49, '90 EUR × 1,161');
  assert.equal(s.budgetSource, 'minimul cu Trading 212 (EUR → USD)');
  assert.equal(s.verdict, fara.verdict, 'verdictul nu se schimbă — doar suma');
});
