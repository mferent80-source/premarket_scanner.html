// 18.10.2026 (el: „mai departe?” → „poți face”): Mișcări de capital se completează singur din Trading 212 — un snapshot automat pe zi
// din valoarea contului (summary.totalValue), convertit în USD la cursul BCE verificat (registrul de capital e în USD).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const ACUM = Date.parse('2026-10-19T15:00:00Z');
function lume({ portofoliu = null, snapshots = [], fx = { rate: 1.08, date: '2026-10-17' }, fxEroare = null } = {}) {
  const store = new Map(), adaugate = [], sync = [];
  if (portofoliu) store.set('tt_trading212_portfolio_v1', JSON.stringify(portofoliu));
  const c = { console, JSON, Date: class extends Date { constructor(...a) { super(...(a.length ? a : [ACUM])); } static now() { return ACUM; } }, Intl, Math, Number,
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) } };
  c.window = c; vm.createContext(c);
  vm.runInContext(readFileSync('lib/trading212-snapshot.js', 'utf8'), c); vm.runInContext(readFileSync('lib/capital-auto.js', 'utf8'), c);
  const deps = { EQ: { snapshots: () => snapshots, addSnapshot: (eq, note, opts) => { const r = { equity: eq, note, ts: opts.ts, day: new Date(opts.ts).toISOString().slice(0, 10) }; adaugate.push(r); return r; } },
    ACCT: { syncAll: (v, why) => sync.push([v, why]) }, T212Snapshot: c.T212Snapshot,
    Finance: { loadRates: async () => { if (fxEroare) throw Error(fxEroare); return { t: 1 }; }, conversion: (tab, from, to) => (from === to ? { rate: 1, date: null } : { rate: fx.rate, date: fx.date }) } };
  return { run: () => c.CapitalAuto.run(deps), adaugate, sync };
}
const port = (o = {}) => ({ a1: { environment: 'live', active: true, fetchedAt: new Date(ACUM - 3600000).toISOString(), summary: { totalValue: 1550, currency: 'EUR' }, positions: [], ...o } });

test('a fresh Trading 212 value becomes one USD snapshot a day at the verified ECB rate, and sets the account', async () => {
  const w = lume({ portofoliu: port() }); const r = await w.run();
  assert.equal(r.status, 'saved'); assert.equal(w.adaugate.length, 1); assert.equal(w.adaugate[0].equity, 1674); assert.match(w.adaugate[0].note, /Trading 212 automat · 1550 EUR × 1\.0800 \(BCE 2026-10-17\)/);
  assert.deepEqual(w.sync, [[1674, 'snapshot']]);
  const usd = lume({ portofoliu: port({ summary: { totalValue: 2000, currency: 'USD' } }) }); await usd.run(); assert.equal(usd.adaugate[0].equity, 2000);
});
test('no second automatic snapshot the same day, and a manual snapshot that day wins', async () => {
  const azi = new Date(ACUM - 3600000).toISOString().slice(0, 10);
  assert.equal((await lume({ portofoliu: port(), snapshots: [{ day: azi, note: 'Trading 212 automat · 1500 EUR', equity: 1600 }] }).run()).status, 'today');
  assert.equal((await lume({ portofoliu: port(), snapshots: [{ day: azi, note: 'Trade212', equity: 1700 }] }).run()).status, 'today');
});
test('nothing is saved without a connected account, from an old read (> 24 h) or without a verified rate', async () => {
  assert.equal((await lume().run()).status, 'none');
  assert.equal((await lume({ portofoliu: port({ fetchedAt: new Date(ACUM - 26 * 3600000).toISOString() }) }).run()).status, 'stale');
  assert.equal((await lume({ portofoliu: port({ summary: { totalValue: 0, currency: 'EUR' } }) }).run()).status, 'none');
  const f = lume({ portofoliu: port(), fxEroare: 'Cursul trebuie verificat din nou.' }); const r = await f.run();
  assert.equal(r.status, 'fx'); assert.match(r.detail, /Cursul/); assert.equal(f.adaugate.length, 0); assert.equal(f.sync.length, 0);
});

// Portofoliu · risc: tabelul de jos citește jurnalul manual; gol, spunea „Nicio poziție OPEN. Adaugă în Execuții” chiar cu poziții reale
// în Trading 212. Acum trimite la pozițiile reale (numărul + riscul total la stop din panoul T212 de deasupra).
function pf(t212) {
  const nodes = {}, node = (id) => nodes[id] || (nodes[id] = { id, style: {}, innerHTML: '', textContent: '', value: '', querySelectorAll: () => [], addEventListener() {} });
  const c = { console, JSON, Date, Math, Number, localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: node, querySelectorAll: () => [] }, T212Capital: { read: () => t212 }, GV: { cfg: () => ({}) } };
  c.window = c; vm.createContext(c); vm.runInContext(readFileSync('lib/portfolio-risk.js', 'utf8'), c); c.PF.onTabActivate(); return node('jrPfTblWrap').innerHTML;
}
// 27.10.2026 (audit C 🔵 17): Portofoliu · risc nu mai citește sursele retrase (md_danger_daily — Macro retras pe 12.10, fără gardă de prospețime ⇒ „Danger 70 → sizing 0,375x” vechi); bara de risc se scalează pe pragul căldurii din Governor, nu pe 4 % fix
test('Portfolio risk: no retired macro sources; the risk bar is scaled to the Governor heat threshold', () => {
  const src = readFileSync('lib/portfolio-risk.js', 'utf8');
  assert.equal(/md_danger_daily/.test(src), false, 'sursa retrasă nu se mai citește'); assert.equal(/dangerMult/.test(src), false);
  assert.match(src, /maxHeatPct/, 'pragul căldurii vine din GV.cfg()'); assert.equal(/pct \/ 4 \* 100/.test(src), false, 'fără 4 % fix');
});
test('Portfolio risk: with no manual open entries but real Trading 212 positions, the empty table points to the real positions and their stop risk', () => {
  const h = pf({ positions: 4, totalStopRisk: 182.5, currency: 'EUR', stopCoverage: 3 });
  assert.match(h, /4 poziții reale în Trading 212/); assert.match(h, /182,5 EUR/); assert.match(h, /3 \/ 4 cu stop/); assert.doesNotMatch(h, /Adaugă în tab/);
  assert.match(pf(null), /Nicio poziție OPEN în jurnalul manual/);
});
