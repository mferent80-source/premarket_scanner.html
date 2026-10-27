// 27.10.2026 — I-751 (audit C 🟡 5): curba de capital și DD în MONEDA CONTULUI. Înainte, snapshot-ul zilnic intra în curbă în USD la
// cursul BCE al zilei ⇒ pe un cont în EUR, DD rolling măsura și cursul: EUR −3 % = DD 3 % fals (30 % din pragul HALTED de 10 %),
// EUR +3 % masca o scădere reală. Acum: curba se calculează în moneda contului, USD doar la afișare (un singur curs, cel de azi);
// datele vechi (doar USD) se migrează O DATĂ, cu copie.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const ACUM = Date.parse('2026-10-27T15:00:00Z'), ZI = 86400000;
const zi = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(t));
function lume(seed = {}, fisiere = ['lib/account.js', 'lib/equity.js']) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [ACUM])); } static now() { return ACUM; } }
  const c = { console, JSON, Math, Number, Intl, Date: Clock, localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
  c.window = c; vm.createContext(c);
  for (const f of fisiere) vm.runInContext(readFileSync(f, 'utf8'), c);
  return { c, store };
}
const t1 = ACUM - 10 * ZI, t2 = ACUM - 5 * ZI, t3 = ACUM - 2 * ZI;
const auto = (local, cur, rate, ts) => ({ equity: Math.round(local * rate * 100) / 100, ts, day: zi(ts), note: 'Trading 212 automat · ' + local + ' ' + cur + ' × ' + rate.toFixed(4) + ' (BCE ' + zi(ts) + ')', cur, local, rate });
const legacy = (s) => { const { cur, local, rate, ...rest } = s; return rest; };
const aproape = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('EUR −3 % față de USD, contul neschimbat în EUR: DD rolling 0, nu 3 % (pe datele vechi doar-USD era 3 %)', () => {
  const s = [auto(10000, 'EUR', 1.1, t1), auto(10000, 'EUR', 1.067, t2)];
  const vechi = lume({ tt_equity_snapshots_v1: s.map(legacy) });
  assert.ok(aproape(vechi.c.EQ.drawdownStats().currentDdPct, 3, 0.01), 'martorul doar-USD: ' + vechi.c.EQ.drawdownStats().currentDdPct);
  const w = lume({ tt_equity_snapshots_v1: s });
  const c = w.c.EQ.curve();
  assert.equal(c.cur, 'EUR');
  assert.ok(aproape(w.c.EQ.drawdownStats().currentDdPct, 0), 'DD în moneda contului = ' + w.c.EQ.drawdownStats().currentDdPct);
  assert.ok(aproape(c.currentLocal, 10000));
  assert.ok(aproape(c.current, 10670), 'USD doar la afișare, la ultimul curs cunoscut: ' + c.current);
});

test('EUR +3 % nu mai maschează o scădere reală de 3 % în EUR', () => {
  const w = lume({ tt_equity_snapshots_v1: [auto(10000, 'EUR', 1.1, t1), auto(9700, 'EUR', 11000 / 9700, t2)] });
  assert.ok(aproape(w.c.EQ.drawdownStats().currentDdPct, 3, 1e-6), 'DD = ' + w.c.EQ.drawdownStats().currentDdPct);
  const vechi = lume({ tt_equity_snapshots_v1: [auto(10000, 'EUR', 1.1, t1), auto(9700, 'EUR', 11000 / 9700, t2)].map(legacy) });
  assert.ok(vechi.c.EQ.drawdownStats().currentDdPct < 0.01, 'martorul doar-USD nu vedea nimic');
});

test('afișajul în USD folosește UN singur curs (cel verificat azi), iar procentele rămân cele din moneda contului', () => {
  const w = lume({ tt_equity_snapshots_v1: [auto(10000, 'EUR', 1.1, t1), auto(9500, 'EUR', 1.05, t2)] });
  w.c.ACCT.saveBrokerFx('EUR', 1.2, '2026-10-26');
  const c = w.c.EQ.curve();
  assert.ok(aproape(c.displayRate, 1.2));
  assert.ok(aproape(c.current, 9500 * 1.2) && aproape(c.start, 10000 * 1.2), c.start + ' / ' + c.current);
  assert.ok(aproape(w.c.EQ.drawdownStats().currentDdPct, 5));
  assert.deepEqual(Array.from(c.points, (p) => p.local), [10000, 9500]);
});

test('execuțiile manuale (în USD) intră în curbă la cursul ultimului snapshot de dinaintea lor', () => {
  const w = lume({ tt_equity_snapshots_v1: [auto(10000, 'EUR', 1.1, t1)],
    tt_journal_v1: [{ id: 'j1', sym: 'AAPL', dir: 'long', entry: 10, exit: 9, size: 110, fees: 0, status: 'closed', closeTs: t1 + 3600000 }] });
  const c = w.c.EQ.curve();
  assert.ok(aproape(c.currentLocal, 9900), 'pierderea de 110 USD = 100 EUR: ' + c.currentLocal);
  assert.ok(aproape(w.c.EQ.drawdownStats().currentDdPct, 1));
});

test('o retragere Trading 212 importată la cursul de azi nu mai face DD din curs: suma intră în moneda contului', () => {
  const seed = { tt_equity_snapshots_v1: [auto(10000, 'EUR', 1.1, t1), auto(9000, 'EUR', 1.0, t3)],
    tt_trading212_cash_v1: { 'live:1': { environment: 'live', transactions: { items: [{ id: 'w1', type: 'WITHDRAW', amount: -1000, currency: 'EUR', date: new Date(t2).toISOString() }], complete: true } } } };
  const vechi = lume({ ...seed, tt_equity_snapshots_v1: seed.tt_equity_snapshots_v1.map(legacy) });
  vechi.c.ACCT.saveBrokerFx('EUR', 1.0, '2026-10-26'); vechi.c.EQ.importBrokerFlows();
  assert.ok(aproape(vechi.c.EQ.drawdownStats().currentDdPct, 10, 0.01), 'martorul doar-USD: HALTED fals la 10 %: ' + vechi.c.EQ.drawdownStats().currentDdPct);
  const w = lume(seed);
  w.c.ACCT.saveBrokerFx('EUR', 1.0, '2026-10-26');
  assert.equal(w.c.EQ.importBrokerFlows().added, 1);
  const ev = JSON.parse(w.store.get('tt_equity_events_v1'))[0];
  assert.equal(ev.cur, 'EUR'); assert.equal(ev.amountLocal, 1000); assert.equal(ev.amountUsd, 1000);
  assert.ok(aproape(w.c.EQ.drawdownStats().currentDdPct, 0), 'DD = ' + w.c.EQ.drawdownStats().currentDdPct);
});

test('un snapshot pus de mână (în USD) intră la cursul celui mai apropiat snapshot automat; contul în USD rămâne exact ca înainte', () => {
  const w = lume({ tt_equity_snapshots_v1: [auto(10000, 'EUR', 1.1, t1), { equity: 10450, ts: t2, day: zi(t2), note: 'Trade212' }] });
  assert.ok(aproape(w.c.EQ.curve().currentLocal, 9500), w.c.EQ.curve().currentLocal);
  const usd = lume({ tt_equity_snapshots_v1: [auto(10000, 'USD', 1, t1), { equity: 9500, ts: t2, day: zi(t2), note: 'Trade212' }] });
  const c = usd.c.EQ.curve();
  assert.equal(c.cur, 'USD'); assert.equal(c.current, 9500); assert.ok(aproape(usd.c.EQ.drawdownStats().currentDdPct, 5));
});

test('drift-ul compară la același curs: doar cursul s-a mișcat ⇒ drift 0, nu alarmă', () => {
  const w = lume({ tt_equity_snapshots_v1: [auto(10000, 'EUR', 1.1, t1), auto(10000, 'EUR', 1.067, t2)] });
  w.c.ACCT.saveBrokerFx('EUR', 1.2, '2026-10-26');
  const d = w.c.EQ.drift();
  assert.ok(aproape(d.driftPct, 0), 'drift ' + d.driftPct); assert.equal(d.warn, false);
  assert.ok(aproape(d.snapshot.equity, 12000), 'snapshot-ul arătat la același curs ca simulatul');
  assert.equal(d.snapshot.equityLaCitire, 10670, 'suma în USD de la citire rămâne scrisă');
});

test('migrarea curbei vechi (doar USD) se face O DATĂ, cu copie: notele automate dau moneda, suma și cursul', () => {
  const snaps = [auto(10000, 'EUR', 1.1, t1), auto(10000, 'EUR', 1.067, t2)].map(legacy);
  const evs = [{ id: 't212:live:1:w1', brokerId: 't212:live:1:w1', source: 't212', kind: 'withdraw', amountUsd: 1100, ts: t1 + ZI, day: zi(t1 + ZI), note: 'Trading 212 · 1000 EUR × 1.1000' },
    { id: 'cap_1', kind: 'deposit', amountUsd: 500, ts: t1 + 2 * ZI, day: zi(t1 + 2 * ZI), note: 'manual' }];
  const w = lume({ tt_equity_snapshots_v1: snaps, tt_equity_events_v1: evs });
  const brut = { s: w.store.get('tt_equity_snapshots_v1'), e: w.store.get('tt_equity_events_v1') };
  assert.equal(typeof w.c.EQ.migreazaMoneda, 'function');
  const r = w.c.EQ.migreazaMoneda();
  assert.equal(r.status, 'migrat'); assert.equal(r.cur, 'EUR'); assert.equal(r.snapshots, 2); assert.equal(r.events, 1);
  assert.equal(w.store.get('tt_equity_snapshots_v1_copie_usd'), brut.s, 'copia = datele vechi, octet cu octet');
  assert.equal(w.store.get('tt_equity_events_v1_copie_usd'), brut.e);
  const s = JSON.parse(w.store.get('tt_equity_snapshots_v1'));
  assert.deepEqual(s.map((x) => [x.cur, x.local, x.rate, x.equity]), [['EUR', 10000, 1.1, 11000], ['EUR', 10000, 1.067, 10670]], 'suma în USD de la citire rămâne');
  const e = JSON.parse(w.store.get('tt_equity_events_v1'));
  assert.deepEqual([e[0].cur, e[0].amountLocal, e[1].cur], ['EUR', 1000, undefined], 'cea pusă de mână rămâne în USD');
  assert.equal(w.c.EQ.curve().cur, 'EUR', 'după migrare curba e în EUR');
  assert.ok(aproape(w.c.EQ.drawdownStats().currentDdPct, 0), 'DD după migrare = ' + w.c.EQ.drawdownStats().currentDdPct);
  // a doua rulare nu rescrie nimic, nici copia
  w.store.set('tt_equity_snapshots_v1', JSON.stringify(s.concat([auto(9000, 'EUR', 1.0, t3)])));
  assert.equal(w.c.EQ.migreazaMoneda().status, 'deja');
  assert.equal(w.store.get('tt_equity_snapshots_v1_copie_usd'), brut.s, 'copia nu se suprascrie');
  assert.ok(JSON.parse(w.store.get('tt_equity_moneda_v1')).la > 0);
  // fără nimic de migrat (cont nou): se notează, fără copie
  const gol = lume({}); assert.equal(gol.c.EQ.migreazaMoneda().status, 'nimic'); assert.equal(gol.store.has('tt_equity_snapshots_v1_copie_usd'), false);
});

test('snapshot-ul automat din Trading 212 scrie moneda, suma în moneda contului și cursul (pe lângă USD)', async () => {
  const w = lume({ tt_trading212_portfolio_v1: { a1: { environment: 'live', active: true, fetchedAt: new Date(ACUM - 3600000).toISOString(), summary: { totalValue: 1550, currency: 'EUR' }, positions: [] } } },
    ['lib/trading212-snapshot.js', 'lib/account.js', 'lib/equity.js', 'lib/capital-auto.js']);
  const r = await w.c.CapitalAuto.run({ EQ: w.c.EQ, ACCT: w.c.ACCT, T212Snapshot: w.c.T212Snapshot,
    Finance: { loadRates: async () => ({}), conversion: () => ({ rate: 1.08, date: '2026-10-26' }) } });
  assert.equal(r.status, 'saved');
  const s = JSON.parse(w.store.get('tt_equity_snapshots_v1'))[0];
  assert.deepEqual([s.equity, s.cur, s.local, s.rate, s.rateDate], [1674, 'EUR', 1550, 1.08, '2026-10-26']);
});
