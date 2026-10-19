// 19.10.2026 — I-699 (Shadow): evaluarea cerea `range:'max', interval:'1d'` ⇒ Yahoo întoarce bare de 3 LUNI (AAPL: 169 de bare,
// dataGranularity 3mo) ⇒ practic nimic nu se evalua, iar pagina recerea totul la fiecare deschidere. Testele de aici folosesc FORMA
// REALĂ a răspunsului Yahoo, trecută prin lib/data.js (nu bare false date direct evaluatorului).
// Plus: direcția verdictului vine din zile (testul semnelor pe zile), corecția Holm pe mai multe filtre, „neprobat” e neutru pe pagină.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const NOW = Date.parse('2026-10-19T15:00:00Z');
class Clock extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }

/** Yahoo emulat: `range=max` ⇒ bare trimestriale (cum răspunde Yahoo de fapt), altfel bare zilnice din zilele lucrătoare. */
function yahoo(url) {
  const u = new URL(decodeURIComponent(url.split('?url=')[1] || url)), range = u.searchParams.get('range');
  const t = [];
  if (range === 'max') { for (let y = 1990; y <= 2026; y++) for (const m of [0, 3, 6, 9]) { const x = Date.UTC(y, m, 1, 13, 30); if (x < NOW) t.push(x); } }
  else { const ani = { '1y': 1, '2y': 2, '5y': 5, '10y': 10 }[range] || 1; for (let x = NOW - ani * 365 * 86400000; x < NOW - 86400000; x += 86400000) { const d = new Date(x); if (d.getUTCDay() % 6) t.push(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 13, 30)); } }
  const c = t.map((_, i) => 100 + i * 0.01);
  return { chart: { result: [{ meta: { symbol: 'AAPL', currency: 'USD', exchangeTimezoneName: 'America/New_York', dataGranularity: range === 'max' ? '3mo' : '1d', currentTradingPeriod: { regular: { end: NOW / 1000 } } },
    timestamp: t.map((x) => x / 1000), indicators: { quote: [{ open: c, high: c.map((x) => x + 1), low: c.map((x) => x - 1), close: c, volume: c.map(() => 1e6) }] } }], error: null } };
}
function lume(rows = []) {
  const store = new Map([['tt_shadow_book_v1', JSON.stringify(rows)]]), cereri = [];
  const ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), key: (i) => [...store.keys()][i], get length() { return store.size; } };
  const c = { console, setTimeout: (f) => f(), clearTimeout() {}, URL, Promise, JSON, Date: Clock, Math, Intl, isFinite, parseInt, AbortController: class { constructor() { this.signal = {}; } abort() {} }, localStorage: ls,
    fetch: async (url) => { cereri.push(String(url)); const body = yahoo(String(url)); return { ok: true, status: 200, headers: { get: () => null }, json: async () => body }; } };
  c.window = c; c.globalThis = c; vm.createContext(c);
  for (const f of ['lib/data.js', 'lib/shadow.js']) vm.runInContext(readFileSync(f, 'utf8'), c, { filename: f });
  return { SH: c.SH, D: c.D, cereri, store };
}
const yahooRange = (u) => new URL(decodeURIComponent(u.split('?url=')[1] || u)).searchParams.get('range');

test('I-699: un semnal de acum 40 de zile se evaluează pe bare ZILNICE (1y), nu pe barele trimestriale ale `range=max`', async () => {
  const { SH, D, cereri } = lume();
  const e = SH.log({ sym: 'AAPL', price: 100, sl: 90, ts: NOW - 40 * 86400000, horizon: 5, blockedBy: 'gate' });
  const r = await SH.evaluateOne(e.id, (s, o) => D.fetchStock(s, o));
  assert.ok(r, 'evaluarea trebuie să se încheie pe bare zilnice');
  assert.equal(r.exitReason, 'horizon-close'); assert.equal(r.evaluatedSessions, 5);
  assert.ok(cereri.length >= 1 && cereri.every((u) => ['1y', '2y'].includes(yahooRange(u))), 'intervalul cerut: ' + cereri.map(yahooRange).join(','));
  assert.equal(SH.evaluated(SH.all()[0]), true);
});
test('I-699: intervalul crește cu vechimea semnalului (2y pentru un semnal de 500 de zile)', async () => {
  const { SH, D, cereri } = lume();
  const e = SH.log({ sym: 'AAPL', price: 100, ts: NOW - 500 * 86400000, horizon: 20, blockedBy: 'gate' });
  assert.ok(await SH.evaluateOne(e.id, (s, o) => D.fetchStock(s, o)));
  assert.deepEqual([...new Set(cereri.map(yahooRange))], ['2y']);
});
test('I-699: un semnal care n-a ajuns la orizont nu cere nimic de la Yahoo (pagina nu mai recere totul la fiecare deschidere)', async () => {
  const { SH, D, cereri } = lume();
  SH.log({ sym: 'AAPL', price: 100, ts: NOW - 2 * 86400000, horizon: 5, blockedBy: 'gate' });
  assert.equal(SH.due(SH.all()[0], NOW), false);
  assert.equal(await SH.evaluateAll((s, o) => D.fetchStock(s, o)), 0);
  assert.equal(cereri.length, 0, 'cereri făcute: ' + cereri.length);
});
test('I-699: bare care nu sunt zilnice (trimestriale) sunt refuzate, nu evaluate', async () => {
  const { SH, D } = lume();
  const e = SH.log({ sym: 'AAPL', price: 100, ts: Date.UTC(2025, 3, 2, 15), horizon: 2, blockedBy: 'gate' });
  assert.equal(await SH.evaluateOne(e.id, () => D.fetchStock('AAPL', { range: 'max', interval: '1d', ttl: 0 })), null);
});

// Verdictul: direcția din zile, p din testul semnelor pe zile.
const rand = (filtru, zi, pct) => ({ id: filtru + zi + Math.random(), day: zi, sym: 'S', blockedBy: filtru, price: 100, evalPct: pct, evalMethod: 'daily-stop-v2' });
const zile = (n) => Array.from({ length: n }, (_, i) => '2026-09-' + String(i + 1).padStart(2, '0'));
test('I-699: direcția verdictului vine din zilele pozitive, nu din media trasă de câteva zile extreme', () => {
  // 16 zile în care semnalele blocate au scăzut puțin, 4 zile cu salturi mari: media e pozitivă, dar 16 din 20 de zile filtrul a ferit de pierderi
  const rows = zile(20).map((d, i) => rand('RVOL', d, i < 16 ? -0.5 : 20));
  const e = lume(rows).SH.filterEdge()[0];
  assert.ok(e.avgPct > 0); assert.ok(e.pDays <= 0.05);
  assert.match(e.verdict, /filtru util \(probat pe zile/); assert.equal(e.tone, 'useful');
});
test('I-699: corecția Holm — două filtre cu p ≈ 0,04 fiecare nu sunt „probate” împreună', () => {
  const rows = ['A', 'B'].flatMap((f) => zile(20).map((d, i) => rand(f, d, i < 15 ? -1 : 1)));
  const solo = lume(rows.filter((r) => r.blockedBy === 'A')).SH.filterEdge()[0];
  assert.match(solo.verdict, /probat pe zile/); assert.ok(solo.pDays <= 0.05, 'singur trece');
  const doua = lume(rows).SH.filterEdge();
  for (const e of doua) { assert.doesNotMatch(e.verdict, /\(probat/, e.filter + ': ' + e.verdict); assert.match(e.verdict, /Holm/); assert.equal(e.tone, 'neutral'); }
});
test('I-699: pe pagină doar „util” e verde și doar „costisitor” e roșu; „neprobat” și „eșantion insuficient” sunt neutre', () => {
  const html = readFileSync('shadow-book/index.html', 'utf8'), script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('SH.filterEdge'));
  const nodes = {}, node = (id) => nodes[id] || (nodes[id] = { id, innerHTML: '', textContent: '', hidden: false, disabled: false, onclick: null, value: '' });
  const rows = [...zile(3).map((d) => rand('neprobat', d, -1)), ...Array.from({ length: 12 }, (_, i) => rand('mic', '2026-09-0' + (1 + (i % 3)), 1))];
  const { SH } = lume(rows);
  const c = { SH, document: { getElementById: node, hidden: false }, window: {}, setTimeout() {}, alert() {}, console };
  c.window = c; vm.createContext(c); vm.runInContext(script, c);
  const tbl = nodes.edgeTbl.innerHTML;
  assert.match(tbl, /class="neutral">eșantion insuficient/); assert.doesNotMatch(tbl, /class="costly"/);
});
