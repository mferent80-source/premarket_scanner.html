import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const NOW = Date.parse('2026-10-14T15:00:00Z');
function boot(extra = {}) {
  const ctx = { Intl, Date, Map, Set, Number, Object, Error, Promise, AbortController, ...extra };
  vm.createContext(ctx);
  for (const file of ['lib/exchange-calendar.js', 'lib/daily-series.js', 'lib/independent-scanner.js']) vm.runInContext(readFileSync(file, 'utf8'), ctx);
  return ctx;
}
function fixture(ctx, { symbol = 'TEST', currency = 'USD', exchange = 'NMS', timezone = 'America/New_York', mode = 'breakout', volume = 2000000, count = 280 } = {}) {
  const id = ctx.ExchangeCalendar.resolve({ exchange, timezone });
  const days = [];
  for (let d = Date.parse('2025-01-01T12:00:00Z'); d <= Date.parse('2026-10-13T12:00:00Z'); d += 86400000) {
    const day = new Date(d).toISOString().slice(0, 10), wd = new Date(d).getUTCDay();
    if (wd === 0 || wd === 6 || ctx.ExchangeCalendar.session(id, day).state === 'closed') continue;
    days.push(day);
  }
  const dates = days.slice(-count);
  const bars = dates.map((day, i) => {
    const c = mode === 'benchmark' ? 100 + i * 0.01 + Math.sin(i * 1.3) * 0.15 : 100 + i * 0.12 + Math.sin(i * 1.3) * 0.6;
    return { t: Date.parse(day + 'T14:00:00Z'), o: c - 0.1, h: c + 0.3, l: c - 2, c, v: volume };
  });
  if (mode === 'breakout') {
    const b = bars.at(-1), high20 = Math.max(...bars.slice(-21, -1).map(x => x.h));
    b.c = high20 + 0.2; b.o = b.c - 0.5; b.h = b.c + 0.3; b.l = b.c - 2; b.v = volume * 1.3;
  }
  if (mode === 'pullback') {
    // A shallow final retracement with a positive close after a brief consolidation.
    const b = bars.at(-1), previous = bars.at(-2);
    b.c = previous.c + 0.1; b.o = b.c - 0.5; b.h = b.c + 0.3; b.l = b.c - 2;
  }
  const regularEnd = timezone === 'America/New_York' ? '2026-10-14T20:00:00Z' : timezone === 'Europe/London' ? '2026-10-14T15:30:00Z' : '2026-10-14T15:30:00Z';
  bars.meta = { symbol, currency, exchange, timezone, regularEnd: Date.parse(regularEnd), interval: '1d', provider: 'Synthetic test fixture' };
  return bars;
}
function evaluated(ctx, options = {}) {
  return ctx.IndependentScanner.evaluate({ symbol: 'TEST', bars: fixture(ctx, options), benchmarkBars: fixture(ctx, { symbol: 'SPY', mode: 'benchmark' }), now: NOW });
}
const check = (item, id) => item.checks.find(x => x.id === id);
const json = x => JSON.parse(JSON.stringify(x));

test('independent breakout rules pass from numerical data without Candidate Engine or trade recommendation', () => {
  const ctx = boot(), item = evaluated(ctx);
  assert.equal(item.verdict, 'research_match', item.reason);
  assert.equal(item.passed, 8); assert.equal(item.total, 8);
  assert.equal(item.sourceDate, '2026-10-13'); assert.equal(item.currency, 'USD');
  assert.equal(item.metrics.pattern, 'breakout20');
  assert.ok(item.metrics.relativeStrength20 > 0);
  assert.ok(item.metrics.rsi14 >= 45 && item.metrics.rsi14 <= 75);
  assert.ok(item.metrics.extensionAtr <= 1.5);
  assert.match(item.reason, /experimental|statistic validat/);
  for (const forbidden of ['probability', 'buy', 'actionable', 'stop', 'target', 'plan']) assert.equal(Object.hasOwn(item, forbidden), false);
  assert.equal(ctx.CandidateEngine, undefined);
});
test('constructive EMA20 pullback is a separate path with its own EOD volume threshold', () => {
  const ctx = boot(), item = evaluated(ctx, { mode: 'pullback' });
  assert.equal(item.metrics.pattern, 'pullback_ema20', item.reason);
  assert.equal(item.metrics.requiredVolumeRatio, 1);
  assert.equal(item.verdict, 'research_match', item.reason);
});
test('unmet numerical price, liquidity, trend, relative strength and extension gates remain explicit', () => {
  const ctx = boot();
  const illiquid = evaluated(ctx, { volume: 1 });
  assert.equal(illiquid.verdict, 'rules_not_met'); assert.equal(check(illiquid, 'liquidity').status, 'fail');
  const low = fixture(ctx); for (const b of low) for (const key of ['o', 'h', 'l', 'c']) b[key] *= 0.01;
  const lowItem = ctx.IndependentScanner.evaluate({ symbol: 'TEST', bars: low, benchmarkBars: fixture(ctx, { symbol: 'SPY', mode: 'benchmark' }), now: NOW });
  assert.equal(check(lowItem, 'price').status, 'fail'); assert.equal(lowItem.verdict, 'rules_not_met');
  const down = fixture(ctx); down.forEach((b, i) => { b.c = 150 - i * 0.1 + Math.sin(i * 1.3) * 0.3; b.o = b.c; b.h = b.c + 1; b.l = b.c - 1; });
  const downItem = ctx.IndependentScanner.evaluate({ symbol: 'TEST', bars: down, benchmarkBars: fixture(ctx, { symbol: 'SPY', mode: 'benchmark' }), now: NOW });
  assert.equal(check(downItem, 'trend').status, 'fail'); assert.equal(check(downItem, 'relative_strength').status, 'fail');
  const stretched = fixture(ctx); const b = stretched.at(-1); b.c *= 1.15; b.o = b.c; b.h = b.c + 0.3; b.l = b.c - 2;
  const stretchedItem = ctx.IndependentScanner.evaluate({ symbol: 'TEST', bars: stretched, benchmarkBars: fixture(ctx, { symbol: 'SPY', mode: 'benchmark' }), now: NOW });
  assert.equal(stretchedItem.verdict, 'rules_not_met'); assert.equal(check(stretchedItem, 'setup').status, 'fail');
});
test('zero, missing or nonfinite volume never becomes an opportunity or a numeric fallback', () => {
  const ctx = boot();
  for (const v of [0, undefined, null, NaN, Infinity, -1]) {
    const bars = fixture(ctx); bars.at(-1).v = v;
    const item = ctx.IndependentScanner.evaluate({ symbol: 'TEST', bars, benchmarkBars: fixture(ctx, { symbol: 'SPY', mode: 'benchmark' }), now: NOW });
    assert.equal(item.verdict, 'unverifiable'); assert.equal(check(item, 'liquidity').status, 'unknown'); assert.equal(check(item, 'volume').status, 'unknown');
    assert.equal(item.metrics.averageTradedValue20, null); assert.equal(item.metrics.volumeRatio, null);
  }
});
test('missing identity/currency/interval/calendar, mismatched symbol and incompatible native currency fail closed', () => {
  const ctx = boot();
  const variations = [b => delete b.meta, b => b.meta.symbol = 'OTHER', b => delete b.meta.currency, b => b.meta.currency = 'EUR', b => b.meta.interval = '1h', b => b.meta.exchange = 'UNKNOWN', b => b.meta.timezone = null];
  for (const alter of variations) {
    const bars = fixture(ctx); alter(bars);
    const item = ctx.IndependentScanner.evaluate({ symbol: 'TEST', bars, benchmarkBars: fixture(ctx, { symbol: 'SPY', mode: 'benchmark' }), now: NOW });
    assert.equal(item.verdict, 'unverifiable'); assert.equal(check(item, 'data').status, 'unknown'); assert.equal(item.price, null);
  }
});
test('stale, future, incomplete-session and short-history data are handled by closed daily sessions', () => {
  const ctx = boot(), bars = fixture(ctx);
  bars.push({ ...bars.at(-1), t: Date.parse('2026-10-14T14:00:00Z'), c: bars.at(-1).c + 10, h: bars.at(-1).h + 10 });
  const item = ctx.IndependentScanner.evaluate({ symbol: 'TEST', bars, benchmarkBars: fixture(ctx, { symbol: 'SPY', mode: 'benchmark' }), now: NOW });
  assert.equal(item.sourceDate, '2026-10-13'); assert.equal(item.price, bars.at(-2).c); assert.equal(item.verdict, 'research_match');
  const stale = fixture(ctx); stale.pop();
  assert.equal(ctx.IndependentScanner.evaluate({ symbol: 'TEST', bars: stale, now: NOW }).verdict, 'unverifiable');
  const future = fixture(ctx); future.at(-1).t = NOW + 86400000;
  assert.equal(check(ctx.IndependentScanner.evaluate({ symbol: 'TEST', bars: future, now: NOW }), 'data').status, 'unknown');
  const short = evaluated(ctx, { count: 219 });
  assert.equal(short.verdict, 'unverifiable'); assert.equal(check(short, 'history').status, 'unknown');
  const unknownYear = ctx.IndependentScanner.evaluate({ symbol: 'TEST', bars: fixture(ctx), now: Date.parse('2028-10-14T15:00:00Z') });
  assert.equal(unknownYear.verdict, 'unverifiable');
});
test('holes and mismatched EOD dates cannot manufacture relative strength', () => {
  const ctx = boot(), bars = fixture(ctx), benchmarkBars = fixture(ctx, { symbol: 'SPY', mode: 'benchmark' });
  benchmarkBars.splice(benchmarkBars.length - 10, 1);
  const item = ctx.IndependentScanner.evaluate({ symbol: 'TEST', bars, benchmarkBars, now: NOW });
  assert.equal(item.verdict, 'unverifiable'); assert.equal(check(item, 'relative_strength').status, 'unknown'); assert.equal(item.metrics.relativeStrength20, undefined);
  const hole = fixture(ctx); hole.splice(hole.length - 10, 1);
  const gapped = ctx.IndependentScanner.evaluate({ symbol: 'TEST', bars: hole, benchmarkBars: fixture(ctx, { symbol: 'SPY', mode: 'benchmark' }), now: NOW });
  assert.equal(gapped.verdict, 'unverifiable'); assert.equal(check(gapped, 'history').status, 'unknown');
  const oldHole = fixture(ctx); oldHole.splice(oldHole.length - 50, 1);
  const oldGapped = ctx.IndependentScanner.evaluate({ symbol: 'TEST', bars: oldHole, benchmarkBars: fixture(ctx, { symbol: 'SPY', mode: 'benchmark' }), now: NOW });
  assert.equal(oldGapped.verdict, 'unverifiable'); assert.equal(check(oldGapped, 'history').status, 'unknown');
  const missingBenchmark = evaluated(ctx); const no = ctx.IndependentScanner.evaluate({ symbol: 'TEST', bars, now: NOW });
  assert.equal(no.verdict, 'unverifiable'); assert.equal(check(no, 'relative_strength').value, null); assert.ok(missingBenchmark.metrics.relativeStrength20 > 0);
});
test('native European currencies are preserved and benchmark comparisons use price returns on identical dates', () => {
  const ctx = boot();
  const bars = fixture(ctx, { symbol: 'SAP.DE', currency: 'EUR', exchange: 'GER', timezone: 'Europe/Berlin' });
  const benchmarkBars = fixture(ctx, { symbol: 'EXSA.DE', currency: 'EUR', exchange: 'GER', timezone: 'Europe/Berlin', mode: 'benchmark' });
  const item = ctx.IndependentScanner.evaluate({ symbol: 'SAP.DE', bars, benchmarkBars, now: Date.parse('2026-10-14T12:00:00Z') });
  assert.equal(item.verdict, 'research_match', item.reason); assert.equal(item.currency, 'EUR'); assert.equal(item.metrics.benchmarkSymbol, 'EXSA.DE');
  const pence = fixture(ctx, { symbol: 'TEST.L', currency: 'GBp', exchange: 'LSE', timezone: 'Europe/London' });
  for (const b of pence) for (const key of ['o', 'h', 'l', 'c']) b[key] *= 100;
  const gbx = ctx.IndependentScanner.evaluate({ symbol: 'TEST.L', bars: pence, benchmarkBars, now: Date.parse('2026-10-14T12:00:00Z') });
  assert.equal(gbx.currency, 'GBX'); assert.equal(gbx.price, pence.at(-1).c); assert.equal(gbx.metrics.minimumPrice, 400); assert.equal(gbx.metrics.minimumTradedValue, 800000000);
  assert.equal(gbx.verdict, 'research_match', gbx.reason);
  for (const native of [
    { symbol: 'TEST.L', currency: 'GBP', exchange: 'LSE', timezone: 'Europe/London' },
    { symbol: 'TEST.SW', currency: 'CHF', exchange: 'EBS', timezone: 'Europe/Zurich' },
    { symbol: 'TEST.CO', currency: 'DKK', exchange: 'CPH', timezone: 'Europe/Copenhagen' }
  ]) {
    const nativeBars = fixture(ctx, native);
    const nativeItem = ctx.IndependentScanner.evaluate({ symbol: native.symbol, bars: nativeBars, benchmarkBars, now: Date.parse('2026-10-14T12:00:00Z') });
    assert.equal(nativeItem.verdict, 'research_match', nativeItem.reason); assert.equal(nativeItem.currency, native.currency);
    assert.equal(nativeItem.price, nativeBars.at(-1).c);
  }
});
test('raw provider OHLC basis is consistent for symbol and benchmark; suspicious discontinuities are unverifiable', () => {
  const ctx = boot(), bars = fixture(ctx), benchmarkBars = fixture(ctx, { symbol: 'SPY', mode: 'benchmark' });
  bars.forEach(b => b.adjustedClose = b.c * 0.5);
  const plain = ctx.IndependentScanner.evaluate({ symbol: 'TEST', bars: fixture(ctx), benchmarkBars, now: NOW });
  const adjusted = ctx.IndependentScanner.evaluate({ symbol: 'TEST', bars, benchmarkBars, now: NOW });
  assert.equal(adjusted.metrics.relativeStrength20, plain.metrics.relativeStrength20); assert.equal(adjusted.metrics.ema20, plain.metrics.ema20);
  const disrupted = fixture(ctx); disrupted.at(-1).c *= 1.6; disrupted.at(-1).o = disrupted.at(-1).c; disrupted.at(-1).h = disrupted.at(-1).c + 1; disrupted.at(-1).l = disrupted.at(-1).c - 1;
  const suspicious = ctx.IndependentScanner.evaluate({ symbol: 'TEST', bars: disrupted, benchmarkBars, now: NOW });
  assert.equal(suspicious.verdict, 'unverifiable'); assert.match(suspicious.reason, /corporate/);
});
test('zero-range indicator data and invalid numbers cannot leak NaN, infinity or defaults into matches', () => {
  const ctx = boot(), bars = fixture(ctx); bars.forEach(b => { b.o = 100; b.h = 100; b.l = 100; b.c = 100; });
  const item = ctx.IndependentScanner.evaluate({ symbol: 'TEST', bars, benchmarkBars: fixture(ctx, { symbol: 'SPY', mode: 'benchmark' }), now: NOW });
  assert.equal(item.verdict, 'unverifiable'); assert.equal(check(item, 'trend').status, 'unknown'); assert.equal(item.metrics.extensionAtr, null);
  assert.equal(ctx.IndependentScanner.evaluate({ symbol: 'TEST', bars, now: NaN }).verdict, 'unverifiable');
  assert.doesNotMatch(JSON.stringify(item), /NaN|Infinity/);
});
test('discontinuity validation covers every older bar consumed by indicators, not only the minimum window', () => {
  const ctx = boot(), bars = fixture(ctx), benchmarkBars = fixture(ctx, { symbol: 'SPY', mode: 'benchmark' });
  for (let i = 0; i < bars.length - 220; i++) for (const key of ['o', 'h', 'l', 'c']) bars[i][key] *= 0.5;
  const item = ctx.IndependentScanner.evaluate({ symbol: 'TEST', bars, benchmarkBars, now: NOW });
  assert.equal(item.verdict, 'unverifiable'); assert.equal(check(item, 'data').status, 'unknown'); assert.match(item.reason, /corporate/);
});
test('finite extreme input cannot export nonfinite metrics or turn an overflowing volume average into zero', () => {
  const ctx = boot(), bars = fixture(ctx), benchmarkBars = fixture(ctx, { symbol: 'SPY', mode: 'benchmark' });
  for (const b of bars) Object.assign(b, { o: 1e308, h: 1.1e308, l: 0.9e308, c: 1e308, v: 1e308 });
  const item = ctx.IndependentScanner.evaluate({ symbol: 'TEST', bars, benchmarkBars, now: NOW });
  assert.equal(item.verdict, 'unverifiable');
  for (const value of Object.values(item.metrics)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
  for (const gate of item.checks) if (typeof gate.value === 'number') assert.ok(Number.isFinite(gate.value));
  assert.equal(item.metrics.volumeRatio, null); assert.equal(item.metrics.averageVolume20, null);
  assert.equal(check(item, 'volume').status, 'unknown');
});
test('evaluation does not mutate its bars or use another engine score', () => {
  const ctx = boot({ CE: { score: 100, verdict: 'BUY' } }), bars = fixture(ctx), benchmarkBars = fixture(ctx, { symbol: 'SPY', mode: 'benchmark' });
  const before = JSON.stringify(bars), meta = JSON.stringify(bars.meta);
  const item = ctx.IndependentScanner.evaluate({ symbol: 'TEST', bars, benchmarkBars, now: NOW });
  assert.equal(item.verdict, 'research_match'); assert.equal(JSON.stringify(bars), before); assert.equal(JSON.stringify(bars.meta), meta);
});
test('universe uses only universe symbols from CE, then watchlist, then transparent static default', () => {
  const ctx = boot();
  const storage = value => ({ getItem: key => value[key] ?? null });
  assert.deepEqual(json(ctx.IndependentScanner.getUniverse({ storage: storage({ ce_results_v2: JSON.stringify({ universeKey: JSON.stringify(['us', [' aapl ', 'AAPL', 'SAP.DE']]), momentum: [{ symbol: 'INJECTED', score: 100 }] }), wl_stocks: '["OTHER"]' }) })), ['AAPL', 'SAP.DE']);
  assert.deepEqual(json(ctx.IndependentScanner.getUniverse({ storage: storage({ ce_results_v2: '{broken', wl_stocks: '["SAP.DE","SAP.DE","bad<script>"]' }) })), ['SAP.DE']);
  assert.deepEqual(json(ctx.IndependentScanner.getUniverse({ storage: storage({ ce_results_v2: JSON.stringify({ universeKey: JSON.stringify(['watchlist', []]) }), wl_stocks: '["AAPL"]' }) })), []);
  assert.deepEqual(json(ctx.IndependentScanner.getUniverse({ storage: storage({}) })), json(ctx.IndependentScanner.DEFAULT_UNIVERSE));
});
test('scan fetches its own prices and shared benchmarks once, reporting verified and failed data without saving storage', async () => {
  const writes = [], calls = [], progress = [], fixedDate = class extends Date { static now() { return NOW; } };
  const ctx = boot({ Date: fixedDate, localStorage: { getItem: () => null, setItem: (...x) => writes.push(x) } });
  ctx.D = { fetchStock: async (symbol, opts) => {
    calls.push([symbol, opts]);
    if (symbol === 'BAD') throw Error('Provider unavailable');
    return fixture(ctx, { symbol, mode: symbol === 'SPY' ? 'benchmark' : 'breakout' });
  } };
  const report = await ctx.IndependentScanner.scan({ symbols: ['TEST', 'NEXT', 'BAD'], onProgress: x => progress.push(x) });
  assert.deepEqual(calls.map(x => x[0]), ['TEST', 'SPY', 'NEXT', 'BAD']);
  assert.equal(report.verifiedCount, 2); assert.equal(report.items.length, 3); assert.equal(report.failures.length, 1);
  assert.equal(report.completedAt, NOW); assert.equal(report.version, 'experimental-1.0.0');
  assert.deepEqual(progress.map(x => x.done), [1, 2, 3]); assert.equal(writes.length, 0);
  assert.ok(calls.every(x => x[1].interval === '1d' && x[1].range === '2y'));
});
test('benchmark failures remain explicit unknown, and independent scan does not read primary scores', async () => {
  const ctx = boot({ Date: class extends Date { static now() { return NOW; } } });
  ctx.D = { fetchStock: async symbol => { if (symbol === 'SPY' || symbol === 'IVV') throw Error('Benchmark offline'); return fixture(ctx, { symbol }); } };
  const report = await ctx.IndependentScanner.scan({ symbols: ['TEST'] });
  assert.equal(report.verifiedCount, 0); assert.equal(report.failures.length, 1); assert.equal(report.items[0].verdict, 'unverifiable');
  assert.match(check(report.items[0], 'relative_strength').reason, /Benchmark offline/);
});
test('cancellation before scan or while waiting rejects promptly and never starts the next request', async () => {
  const ctx = boot(), calls = [], controller = new AbortController(); controller.abort();
  ctx.D = { fetchStock: symbol => { calls.push(symbol); return new Promise(() => {}); } };
  await assert.rejects(ctx.IndependentScanner.scan({ symbols: ['TEST'], signal: controller.signal }), { name: 'AbortError' }); assert.deepEqual(calls, []);
  const active = new AbortController();
  const scan = ctx.IndependentScanner.scan({ symbols: ['TEST', 'NEXT'], signal: active.signal });
  active.abort();
  await assert.rejects(scan, { name: 'AbortError' }); assert.deepEqual(calls, ['TEST']);
});
test('cancellation from progress does not return or persist a partial report; callback errors cannot erase data', async () => {
  const ctx = boot({ Date: class extends Date { static now() { return NOW; } } }), calls = [], controller = new AbortController();
  ctx.D = { fetchStock: async symbol => { calls.push(symbol); return fixture(ctx, { symbol, mode: symbol === 'SPY' ? 'benchmark' : 'breakout' }); } };
  await assert.rejects(ctx.IndependentScanner.scan({ symbols: ['TEST', 'NEXT'], signal: controller.signal, onProgress: () => controller.abort() }), { name: 'AbortError' });
  assert.deepEqual(calls, ['TEST', 'SPY']);
  const report = await ctx.IndependentScanner.scan({ symbols: ['TEST'], onProgress: () => { throw Error('UI callback'); } });
  assert.equal(report.items.length, 1); assert.equal(report.verifiedCount, 1);
});
test('volume confirmation excludes the current day from its baseline and relative strength uses matching endpoints', () => {
  const ctx = boot(), bars = fixture(ctx), benchmarkBars = fixture(ctx, { symbol: 'SPY', mode: 'benchmark' });
  bars.at(-1).v = 3000000;
  const item = ctx.IndependentScanner.evaluate({ symbol: 'TEST', bars, benchmarkBars, now: NOW });
  assert.equal(item.metrics.averageVolume20, 2000000); assert.equal(item.metrics.volumeRatio, 1.5);
  const expectedStock = (bars.at(-1).c / bars.at(-21).c - 1) * 100;
  const expectedBenchmark = (benchmarkBars.at(-1).c / benchmarkBars.at(-21).c - 1) * 100;
  assert.equal(item.metrics.stockReturn20, expectedStock); assert.equal(item.metrics.benchmarkReturn20, expectedBenchmark);
  assert.equal(item.metrics.relativeStrength20, expectedStock - expectedBenchmark);
  const expectedLiquidity = bars.slice(-20).reduce((sum, b) => sum + b.c * b.v, 0) / 20;
  assert.equal(item.metrics.averageTradedValue20, expectedLiquidity);
});
test('concurrent scans maintain separate reports, universes, callbacks and benchmark state', async () => {
  const ctx = boot({ Date: class extends Date { static now() { return NOW; } } }), calls = [], aProgress = [], bProgress = [];
  ctx.D = { fetchStock: async symbol => { calls.push(symbol); await Promise.resolve(); return fixture(ctx, { symbol, mode: symbol === 'SPY' ? 'benchmark' : 'breakout' }); } };
  const [a, b] = await Promise.all([
    ctx.IndependentScanner.scan({ symbols: ['FIRST', 'NEXT'], onProgress: item => aProgress.push(item.symbol) }),
    ctx.IndependentScanner.scan({ symbols: ['OTHER'], onProgress: item => bProgress.push(item.symbol) })
  ]);
  assert.deepEqual(json(a.universe), ['FIRST', 'NEXT']); assert.deepEqual(json(b.universe), ['OTHER']);
  assert.deepEqual(aProgress, ['FIRST', 'NEXT']); assert.deepEqual(bProgress, ['OTHER']);
  assert.equal(calls.filter(s => s === 'SPY').length, 2); assert.equal(a.verifiedCount, 2); assert.equal(b.verifiedCount, 1);
  assert.notEqual(a.items, b.items); assert.notEqual(a.failures, b.failures);
});
test('CommonJS consumers receive the same independent API and loaded daily validation', () => {
  const require = createRequire(import.meta.url), api = require('../lib/independent-scanner.js');
  assert.equal(api.VERSION, 'experimental-1.0.0'); assert.equal(typeof api.evaluate, 'function'); assert.equal(typeof api.scan, 'function');
});
// 18.10.2026: pagina Piață rulează Reguli V1 cu 5 simboluri deodată — raportul păstrează ordinea universului, iar cererile simultane nu trec de limită.
test('concurrency keeps universe order, caps parallel requests and still reports every symbol', async () => {
  const ctx = boot({ Date: class extends Date { static now() { return NOW; } } });
  let active = 0, peak = 0; const progress = [];
  ctx.D = { fetchStock: async symbol => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, symbol === 'S1' ? 15 : 2)); active--; if (symbol === 'S3') throw Error('Provider unavailable'); return fixture(ctx, { symbol, mode: symbol === 'SPY' ? 'benchmark' : 'breakout' }); } };
  const symbols = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'];
  const report = await ctx.IndependentScanner.scan({ symbols, concurrency: 3, onProgress: x => progress.push(x.done) });
  assert.deepEqual(json(report.items.map(x => x.symbol)), symbols);
  assert.ok(peak <= 3, 'cel mult 3 cereri simultane, au fost ' + peak); assert.ok(peak >= 2, 'cererile chiar rulează în paralel');
  assert.deepEqual(progress, [1, 2, 3, 4, 5, 6, 7]); assert.equal(report.verifiedCount, 6);
  assert.deepEqual(json(report.failures.map(x => x.symbol)), ['S3']);
});
// 18.10.2026: Yahoo a lăsat fără închidere bara de vineri la ETF-urile europene ⇒ reperul UE trece pe indicele ^STOXX (STOXX Europe 600), cu aceleași date EOD.
test('a stale European ETF benchmark falls back to the STOXX index on the same EOD dates; US stays on SPY', async () => {
  const ctx = boot({ Date: class extends Date { static now() { return NOW; } } }), calls = [];
  ctx.D = { fetchStock: async symbol => {
    calls.push(symbol);
    if (symbol === 'EXSA.DE') { const b = fixture(ctx, { symbol, currency: 'EUR', exchange: 'GER', timezone: 'Europe/Berlin', mode: 'benchmark' }); b.pop(); return b; }
    if (symbol === '^STOXX') return fixture(ctx, { symbol, currency: 'EUR', exchange: 'ZRH', timezone: 'Europe/Zurich', mode: 'benchmark' });
    if (symbol === 'SAP.DE') return fixture(ctx, { symbol, currency: 'EUR', exchange: 'GER', timezone: 'Europe/Berlin' });
    return fixture(ctx, { symbol, mode: symbol === 'SPY' ? 'benchmark' : 'breakout' });
  } };
  const report = await ctx.IndependentScanner.scan({ symbols: ['SAP.DE', 'TEST'] });
  const sap = report.items[0];
  assert.equal(sap.metrics.benchmarkSymbol, '^STOXX'); assert.notEqual(check(sap, 'relative_strength').status, 'unknown', check(sap, 'relative_strength').reason);
  assert.equal(report.items[1].metrics.benchmarkSymbol, 'SPY');
  assert.deepEqual(calls, ['SAP.DE', 'EXSA.DE', '^STOXX', 'TEST', 'SPY']);
});
test('an index fallback with a non-European timezone or non-EUR currency is refused', async () => {
  const ctx = boot({ Date: class extends Date { static now() { return NOW; } } });
  ctx.D = { fetchStock: async symbol => {
    if (symbol === 'SAP.DE') return fixture(ctx, { symbol, currency: 'EUR', exchange: 'GER', timezone: 'Europe/Berlin' });
    if (symbol === '^STOXX') return fixture(ctx, { symbol, currency: 'USD', exchange: 'ZRH', timezone: 'Europe/Zurich', mode: 'benchmark' });
    if (symbol === '^STOXX50E') return fixture(ctx, { symbol, currency: 'EUR', exchange: 'NYQ', timezone: 'America/New_York', mode: 'benchmark' });
    throw Error('offline');
  } };
  const report = await ctx.IndependentScanner.scan({ symbols: ['SAP.DE'] });
  assert.equal(report.items[0].verdict, 'unverifiable'); assert.match(check(report.items[0], 'relative_strength').reason, /EUR|european/);
});
