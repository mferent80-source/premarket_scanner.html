/* Experimental independent EOD research rules. No Candidate Engine verdict is consumed.
   Thresholds are hypotheses, not a validated edge or a trade recommendation. */
(function (g) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
    if (!g.ExchangeCalendar) require('./exchange-calendar.js');
    if (!g.DailySeries) require('./daily-series.js');
  }
  const VERSION = 'experimental-1.0.0';
  const RULES = Object.freeze({
    minimumBars: 220,
    priceByCurrency: Object.freeze({ USD: 5, EUR: 5, GBP: 4, GBX: 400, CHF: 5, DKK: 35 }),
    tradedValueByCurrency: Object.freeze({ USD: 10000000, EUR: 10000000, GBP: 8000000, GBX: 800000000, CHF: 10000000, DKK: 75000000 }),
    emaPeriods: Object.freeze([20, 50, 200]), ema50RiseBars: 5,
    relativeStrengthBars: 20, minimumRelativeStrengthPct: 0,
    breakoutBars: 20, rsiPeriod: 14, rsiMin: 45, rsiMax: 75,
    atrPeriod: 14, atrPctMin: 0.3, atrPctMax: 8,
    maxExtensionAtr: 1.5, maxExtensionPct: 8, pullbackDistanceAtr: 0.75,
    minCloseLocation: 0.6, breakoutVolumeRatio: 1.2, pullbackVolumeRatio: 1,
    volumeBars: 20, maxSingleDayMovePct: 40,
    benchmarks: Object.freeze({ US: 'SPY', EU: 'EXSA.DE' })
  });
  const DEFAULT_UNIVERSE = Object.freeze(['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'JPM', 'XOM', 'ASML.AS', 'SAP.DE', 'SIE.DE', 'AIR.PA']);
  const IDS = Object.freeze(['data', 'history', 'price', 'liquidity', 'trend', 'relative_strength', 'setup', 'volume']);
  const LABELS = Object.freeze({ data: 'Date și identitate verificate', history: 'Istoric zilnic suficient', price: 'Preț minim în moneda nativă', liquidity: 'Lichiditate în moneda nativă', trend: 'Trend EMA20 / 50 / 200', relative_strength: 'Forță relativă pe 20 de sesiuni', setup: 'Breakout sau retragere constructivă', volume: 'Confirmare volum EOD' });
  const EU_CURRENCIES = Object.freeze({ LSE: ['GBP', 'GBX'], XETRA: ['EUR'], PARIS: ['EUR'], AMSTERDAM: ['EUR'], BRUSSELS: ['EUR'], LISBON: ['EUR'], MILAN: ['EUR'], DUBLIN: ['EUR'], MADRID: ['EUR'], SIX: ['CHF'], COPENHAGEN: ['DKK'], VIENNA: ['EUR'] });
  const finite = Number.isFinite;
  const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
  const last = xs => xs[xs.length - 1];
  const symbolOf = x => typeof x === 'string' && /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(x.trim().toUpperCase()) ? x.trim().toUpperCase() : null;
  function uniqueSymbols(xs) { return Array.from(new Set((Array.isArray(xs) ? xs : []).map(symbolOf).filter(Boolean))); }
  function regionOf(meta) {
    const id = g.ExchangeCalendar?.resolve(meta);
    if (id === 'US') return 'US';
    return Object.hasOwn(EU_CURRENCIES, id || '') ? 'EU' : null;
  }
  function ema(xs, n) {
    if (xs.length < n) return null;
    let e = mean(xs.slice(0, n));
    for (let i = n; i < xs.length; i++) e += 2 / (n + 1) * (xs[i] - e);
    return e;
  }
  function rsi(xs, n) {
    if (xs.length <= n) return null;
    let gains = 0, losses = 0;
    for (let i = 1; i <= n; i++) { const d = xs[i] - xs[i - 1]; gains += Math.max(d, 0); losses += Math.max(-d, 0); }
    gains /= n; losses /= n;
    for (let i = n + 1; i < xs.length; i++) { const d = xs[i] - xs[i - 1]; gains = (gains * (n - 1) + Math.max(d, 0)) / n; losses = (losses * (n - 1) + Math.max(-d, 0)) / n; }
    return losses === 0 ? gains === 0 ? 50 : 100 : 100 - 100 / (1 + gains / losses);
  }
  function atr(bars, n) {
    if (bars.length <= n) return null;
    const tr = bars.slice(1).map((b, i) => Math.max(b.h - b.l, Math.abs(b.h - bars[i].c), Math.abs(b.l - bars[i].c)));
    let a = mean(tr.slice(0, n));
    for (let i = n; i < tr.length; i++) a = (a * (n - 1) + tr[i]) / n;
    return a;
  }
  function rule(id) {
    return ({
      data: 'Identitate, interval 1d, bursă / monedă compatibile și ultima sesiune încheiată; fără ruptură zilnică > ' + RULES.maxSingleDayMovePct + '%.',
      history: 'Minimum ' + RULES.minimumBars + ' bare EOD, fără goluri în porțiunea acoperită de calendar; ultimele 21 de sesiuni consecutive.',
      price: 'Pragul publicat pentru moneda nativă; fără conversie FX.',
      liquidity: 'Media închidere × volum pe ultimele ' + RULES.volumeBars + ' sesiuni ≥ pragul monedei; volume pozitive verificate.',
      trend: 'EMA20 > EMA50 > EMA200 și EMA50 în creștere față de acum ' + RULES.ema50RiseBars + ' sesiuni.',
      relative_strength: 'Randament preț pe ' + RULES.relativeStrengthBars + ' sesiuni ≥ benchmark regional; exact aceleași date EOD.',
      setup: 'Breakout peste maximele anterioare 20z sau retragere lângă EMA20; RSI ' + RULES.rsiMin + '–' + RULES.rsiMax + ', ATR ' + RULES.atrPctMin + '–' + RULES.atrPctMax + '%; extensie ≤ ' + RULES.maxExtensionAtr + ' ATR și ≤ ' + RULES.maxExtensionPct + '%.',
      volume: 'Volumul ultimei sesiuni / media celor ' + RULES.volumeBars + ' precedente ≥ ' + RULES.breakoutVolumeRatio + ' la breakout sau ≥ ' + RULES.pullbackVolumeRatio + ' la retragere.'
    })[id];
  }
  function empty(symbol, now) {
    return { symbol: symbol || String(symbol ?? ''), currency: null, sourceDate: null, sourceTimezone: null, sourceCloseMinutes: null, ts: finite(now) ? now : null, price: null, verdict: 'unverifiable', passed: 0, total: IDS.length,
      checks: IDS.map(id => ({ id, label: LABELS[id], status: 'unknown', value: null, rule: rule(id), reason: 'Date insuficiente pentru evaluare.' })), reason: 'Date insuficiente pentru evaluare.', metrics: {} };
  }
  function check(result, id, status, value, reason) {
    const item = result.checks.find(x => x.id === id);
    Object.assign(item, { status, value: typeof value === 'number' && !finite(value) ? null : value ?? null, reason });
  }
  function finish(result) {
    for (const [key, value] of Object.entries(result.metrics)) if (typeof value === 'number' && !finite(value)) result.metrics[key] = null;
    result.passed = result.checks.filter(x => x.status === 'pass').length;
    const unknown = result.checks.filter(x => x.status === 'unknown');
    const failed = result.checks.filter(x => x.status === 'fail');
    result.verdict = unknown.length ? 'unverifiable' : failed.length ? 'rules_not_met' : 'research_match';
    result.reason = unknown.length ? unknown[0].reason : failed.length ? failed.map(x => x.reason).join(' ') : 'Toate regulile experimentale sunt îndeplinite; rezultat pentru cercetare, fără avantaj statistic validat.';
    return result;
  }
  function verifiedSource(input, symbol, now, benchmark = false) {
    if (!g.DailySeries?.read || !g.ExchangeCalendar?.resolve) throw Error('Validarea sesiunilor zilnice nu este disponibilă.');
    if (!Array.isArray(input) || !input.meta || input.meta.interval !== '1d') throw Error('Intervalul zilnic și identitatea sursei nu sunt verificate.');
    if (!symbol || input.meta.symbol?.toUpperCase() !== symbol) throw Error('Simbolul furnizat de sursă nu corespunde simbolului cerut.');
    const region = regionOf(input.meta);
    if (!region) throw Error('Piața / calendarul acestui simbol nu este suportat de scannerul independent.');
    const source = g.DailySeries.read(input, symbol, now);
    const allowed = source.calendarId === 'US' ? ['USD'] : EU_CURRENCIES[source.calendarId];
    if (!allowed?.includes(source.currency) || !Object.hasOwn(RULES.priceByCurrency, source.currency)) throw Error('Moneda sursei este necunoscută sau incompatibilă cu bursa verificată.');
    if (source.bars.some(b => ![b.t, b.o, b.h, b.l, b.c].every(finite) || b.h < b.l || b.h < Math.max(b.o, b.c) || b.l > Math.min(b.o, b.c) || b.c <= 0)) throw Error('Istoricul conține bare numerice incoerente.');
    if (source.bars.some(b => [0, 6].includes(new Date(g.DailySeries.date(b.t, source.timezone) + 'T12:00:00Z').getUTCDay()))) throw Error('Istoricul cash conține o dată de weekend; sesiunea istorică nu poate fi verificată.');
    // Both equity and benchmark use the same provider OHLC close basis, never mix adjustedClose.
    const recent = benchmark ? source.bars.slice(-RULES.relativeStrengthBars - 1) : source.bars;
    if (recent.some((b, i) => i && Math.abs((b.c / recent[i - 1].c - 1) * 100) > RULES.maxSingleDayMovePct)) throw Error('Ruptură zilnică > ' + RULES.maxSingleDayMovePct + '%: ajustările corporate / seria nu pot fi verificate pentru aceste reguli.');
    return { ...source, region };
  }
  function evaluate({ symbol, bars, benchmarkBars, now = Date.now() } = {}) {
    const normalized = symbolOf(symbol);
    const result = empty(normalized || symbol, now);
    if (!finite(now) || now <= 0) { check(result, 'data', 'unknown', null, 'Momentul evaluării este invalid.'); return finish(result); }
    let source;
    try { source = verifiedSource(bars, normalized, now); }
    catch (e) { check(result, 'data', 'unknown', null, e.message || 'Datele nu pot fi verificate.'); return finish(result); }
    const daily = source.bars, current = last(daily), closes = daily.map(b => b.c);
    Object.assign(result, { symbol: normalized, currency: source.currency, sourceDate: source.asOf, sourceTimezone: source.timezone, sourceCloseMinutes: source.closeMinutes, price: current.c, dataQuality: source.dataQuality });
    Object.assign(result.metrics, { region: source.region, benchmarkSymbol: RULES.benchmarks[source.region], bars: daily.length, priceBasis: 'OHLC provider pentru ambele serii; randament de preț, fără total return sau conversie FX' });
    check(result, 'data', 'pass', source.asOf, 'Simbolul, moneda, bursa și ultima sesiune EOD sunt verificate.');
    const recentDays = daily.slice(-RULES.relativeStrengthBars - 1).map(b => g.DailySeries.date(b.t, source.timezone));
    const knownHistoryDays = daily.map(b => g.DailySeries.date(b.t, source.timezone)).filter(day => g.ExchangeCalendar.session(source.calendarId, day).state !== 'unknown');
    const historyOk = daily.length >= RULES.minimumBars && g.ExchangeCalendar.contiguous(recentDays, source.calendarId) && g.ExchangeCalendar.contiguous(knownHistoryDays, source.calendarId);
    check(result, 'history', historyOk ? 'pass' : 'unknown', daily.length, historyOk ? daily.length + ' sesiuni EOD; fără goluri în calendarul acoperit și în fereastra recentă.' : 'Istoric insuficient sau sesiuni lipsă în fereastra evaluată; indicatorii nu sunt verificabili.');
    const minimumPrice = RULES.priceByCurrency[source.currency];
    result.metrics.minimumPrice = minimumPrice;
    check(result, 'price', current.c >= minimumPrice ? 'pass' : 'fail', current.c, current.c >= minimumPrice ? 'Preț ≥ ' + minimumPrice + ' ' + source.currency + '.' : 'Preț sub pragul de ' + minimumPrice + ' ' + source.currency + '.');
    const lastVolumes = daily.slice(-RULES.volumeBars - 1);
    const volumesOk = lastVolumes.length === RULES.volumeBars + 1 && lastVolumes.every(b => finite(b.v) && b.v > 0);
    const tradedValue = volumesOk ? mean(lastVolumes.slice(1).map(b => b.c * b.v)) : null;
    const liquidityKnown = finite(tradedValue) && tradedValue > 0;
    result.metrics.averageTradedValue20 = liquidityKnown ? tradedValue : null;
    result.metrics.minimumTradedValue = RULES.tradedValueByCurrency[source.currency];
    check(result, 'liquidity', !liquidityKnown ? 'unknown' : tradedValue >= result.metrics.minimumTradedValue ? 'pass' : 'fail', liquidityKnown ? tradedValue : null,
      !liquidityKnown ? 'Volum lipsă, nul sau invalid; lichiditatea nu poate fi verificată.' : tradedValue >= result.metrics.minimumTradedValue ? 'Lichiditate peste pragul nativ ' + result.metrics.minimumTradedValue + ' ' + source.currency + '.' : 'Lichiditate sub pragul nativ ' + result.metrics.minimumTradedValue + ' ' + source.currency + '.');
    if (historyOk) {
      const ema20 = ema(closes, 20), ema50 = ema(closes, 50), ema200 = ema(closes, 200), ema50Previous = ema(closes.slice(0, -RULES.ema50RiseBars), 50);
      const rsi14 = rsi(closes, RULES.rsiPeriod), atr14 = atr(daily, RULES.atrPeriod);
      const atrPct = finite(atr14) && atr14 > 0 ? atr14 / current.c * 100 : null;
      const extensionAtr = finite(atr14) && atr14 > 0 ? (current.c - ema20) / atr14 : null;
      const extensionPct = (current.c / ema20 - 1) * 100;
      const indicatorsOk = [ema20, ema50, ema200, ema50Previous, rsi14, atr14, atrPct, extensionAtr, extensionPct].every(finite) && atr14 > 0;
      Object.assign(result.metrics, { ema20, ema50, ema200, ema50Previous, rsi14, atr14, atrPct, extensionAtr, extensionPct });
      const trendOk = ema20 > ema50 && ema50 > ema200 && ema50 > ema50Previous;
      check(result, 'trend', !indicatorsOk ? 'unknown' : trendOk ? 'pass' : 'fail', indicatorsOk ? ema50 - ema50Previous : null, !indicatorsOk ? 'EMA / RSI / ATR nu sunt finite sau ATR este nul.' : trendOk ? 'EMA20 > EMA50 > EMA200; EMA50 crește.' : 'Alinierea EMA sau creșterea EMA50 lipsește.');
      const high20 = Math.max(...daily.slice(-RULES.breakoutBars - 1, -1).map(b => b.h));
      const closeLocation = current.h > current.l ? (current.c - current.l) / (current.h - current.l) : null;
      const breakout = current.c > high20;
      const pullback = finite(atr14) && atr14 > 0 && current.c >= ema20 && Math.abs(current.c - ema20) <= RULES.pullbackDistanceAtr * atr14 && current.l <= ema20 + 0.5 * atr14 && current.c >= daily[daily.length - 2].c;
      const pattern = breakout ? 'breakout20' : pullback ? 'pullback_ema20' : null;
      const setupOk = indicatorsOk && finite(closeLocation) && closeLocation >= RULES.minCloseLocation && rsi14 >= RULES.rsiMin && rsi14 <= RULES.rsiMax && atrPct >= RULES.atrPctMin && atrPct <= RULES.atrPctMax && extensionAtr >= 0 && extensionAtr <= RULES.maxExtensionAtr && extensionPct <= RULES.maxExtensionPct && !!pattern;
      Object.assign(result.metrics, { high20, closeLocation, pattern });
      check(result, 'setup', !indicatorsOk || !finite(closeLocation) ? 'unknown' : setupOk ? 'pass' : 'fail', pattern,
        !indicatorsOk || !finite(closeLocation) ? 'Indicatori sau interval zilnic insuficienți pentru evaluarea structurii.' : setupOk ? (breakout ? 'Breakout peste maximele anterioare 20z.' : 'Retragere constructivă lângă EMA20.') + ' RSI, ATR, închiderea și extensia respectă limitele.' : 'Structura, RSI, volatilitatea, poziția închiderii sau extensia nu respectă toate limitele.');
      const computedAverageVolume = volumesOk ? mean(lastVolumes.slice(0, -1).map(b => b.v)) : null;
      const averageVolume = finite(computedAverageVolume) && computedAverageVolume > 0 ? computedAverageVolume : null;
      const volumeRatio = averageVolume > 0 ? current.v / averageVolume : null;
      const requiredVolumeRatio = pattern === 'breakout20' ? RULES.breakoutVolumeRatio : pattern === 'pullback_ema20' ? RULES.pullbackVolumeRatio : null;
      Object.assign(result.metrics, { averageVolume20: averageVolume, volumeRatio, requiredVolumeRatio });
      check(result, 'volume', !finite(volumeRatio) ? 'unknown' : requiredVolumeRatio !== null && volumeRatio >= requiredVolumeRatio ? 'pass' : 'fail', volumeRatio,
        !finite(volumeRatio) ? 'Volumul EOD / media precedentă nu pot fi verificate.' : requiredVolumeRatio === null ? 'Nicio structură constructivă pentru confirmare prin volum.' : volumeRatio >= requiredVolumeRatio ? 'Volumul EOD confirmă pragul de ' + requiredVolumeRatio + '× pentru această structură.' : 'Volumul EOD este sub pragul de ' + requiredVolumeRatio + '× pentru această structură.');
    }
    try {
      const benchmarkSymbol = RULES.benchmarks[source.region];
      const benchmark = verifiedSource(benchmarkBars, benchmarkSymbol, now, true);
      const benchmarkDates = new Map(benchmark.bars.map(b => [g.DailySeries.date(b.t, benchmark.timezone), b.c]));
      const sample = daily.slice(-RULES.relativeStrengthBars - 1);
      if (sample.length !== RULES.relativeStrengthBars + 1 || benchmark.asOf !== source.asOf || recentDays.some(day => !benchmarkDates.has(day)) || !g.ExchangeCalendar.contiguous(recentDays, source.calendarId)) throw Error('Benchmarkul și simbolul nu au aceleași 21 de date EOD recente; forța relativă nu poate fi verificată.');
      const stockReturn20 = (last(sample).c / sample[0].c - 1) * 100;
      const benchmarkReturn20 = (benchmarkDates.get(last(recentDays)) / benchmarkDates.get(recentDays[0]) - 1) * 100;
      const relativeStrength20 = stockReturn20 - benchmarkReturn20;
      if (![stockReturn20, benchmarkReturn20, relativeStrength20].every(finite)) throw Error('Randamentele nu sunt finite.');
      Object.assign(result.metrics, { stockReturn20, benchmarkReturn20, relativeStrength20, benchmarkCurrency: benchmark.currency, benchmarkSourceDate: benchmark.asOf });
      check(result, 'relative_strength', relativeStrength20 >= RULES.minimumRelativeStrengthPct ? 'pass' : 'fail', relativeStrength20,
        relativeStrength20 >= RULES.minimumRelativeStrengthPct ? 'Randamentul de preț depășește sau egalează ' + benchmarkSymbol + ' pe aceleași date EOD.' : 'Randamentul de preț este sub ' + benchmarkSymbol + ' pe aceleași date EOD.');
    } catch (e) { check(result, 'relative_strength', 'unknown', null, e.message || 'Benchmark indisponibil.'); }
    return finish(result);
  }
  function universeInfo(storage) {
    try {
      const cache = JSON.parse(storage?.getItem('ce_results_v2') || 'null');
      const key = JSON.parse(cache?.universeKey || 'null');
      if (Array.isArray(key) && key.length === 2 && Array.isArray(key[1])) return { symbols: uniqueSymbols(key[1]), source: 'premarket_universe' };
    } catch (_) {}
    try { const watch = JSON.parse(storage?.getItem('wl_stocks') || 'null'); if (Array.isArray(watch) && uniqueSymbols(watch).length) return { symbols: uniqueSymbols(watch), source: 'watchlist' }; } catch (_) {}
    return { symbols: DEFAULT_UNIVERSE.slice(), source: 'explicit_default' };
  }
  function getUniverse({ storage } = {}) {
    if (!storage) { try { storage = g.localStorage; } catch (_) {} }
    return universeInfo(storage).symbols;
  }
  function abortError() { const e = Error('Scanarea independentă a fost anulată.'); e.name = 'AbortError'; return e; }
  function checkAbort(signal) { if (signal?.aborted) throw abortError(); }
  function abortable(promise, signal) {
    if (!signal) return promise;
    checkAbort(signal);
    return new Promise((resolve, reject) => {
      const abort = () => { cleanup(); reject(abortError()); };
      const cleanup = () => signal.removeEventListener('abort', abort);
      signal.addEventListener('abort', abort, { once: true });
      Promise.resolve(promise).then(value => { cleanup(); if (signal.aborted) reject(abortError()); else resolve(value); }, error => { cleanup(); reject(error); });
    });
  }
  async function scan({ symbols, onProgress, signal } = {}) {
    checkAbort(signal);
    if (!g.D?.fetchStock || !g.DailySeries?.read || !g.ExchangeCalendar) throw Error('Sursa de date sau validarea EOD lipsește.');
    let storage;
    try { storage = g.localStorage; } catch (_) {}
    const selected = symbols === undefined ? universeInfo(storage) : { symbols: uniqueSymbols(symbols), source: 'explicit' };
    const universe = selected.symbols;
    const benchmarkRequests = new Map();
    function benchmark(symbol) {
      if (!benchmarkRequests.has(symbol)) benchmarkRequests.set(symbol, (async () => {
        try { return { bars: await abortable(g.D.fetchStock(symbol, { range: '2y', interval: '1d', ttl: 1800, signal }), signal) }; }
        catch (e) { if (e.name === 'AbortError' || signal?.aborted) throw abortError(); return { bars: null, reason: e.message || 'Benchmark indisponibil.' }; }
      })());
      return benchmarkRequests.get(symbol);
    }
    const report = { version: VERSION, provider: 'Yahoo Finance via D.fetchStock / DailySeries', completedAt: null, items: [], failures: [], universe: universe.slice(), universeSource: selected.source, verifiedCount: 0 };
    for (const symbol of universe) {
      checkAbort(signal);
      let item;
      try {
        const bars = await abortable(g.D.fetchStock(symbol, { range: '2y', interval: '1d', ttl: 1800, signal }), signal);
        checkAbort(signal);
        const region = regionOf(bars?.meta);
        const bm = region ? await benchmark(RULES.benchmarks[region]) : { bars: null };
        checkAbort(signal);
        item = evaluate({ symbol, bars, benchmarkBars: bm.bars, now: Date.now() });
        if (bm.reason) { const relative = item.checks.find(x => x.id === 'relative_strength'); if (relative.status === 'unknown') { relative.reason = 'Benchmark indisponibil: ' + bm.reason; finish(item); } }
      } catch (e) {
        if (e.name === 'AbortError' || signal?.aborted) throw abortError();
        item = empty(symbol, Date.now()); check(item, 'data', 'unknown', null, e.message || 'Sursa nu a răspuns.'); finish(item);
      }
      checkAbort(signal);
      report.items.push(item);
      if (item.verdict === 'unverifiable') report.failures.push({ symbol: item.symbol, reason: item.reason });
      else report.verifiedCount++;
      if (typeof onProgress === 'function') { try { onProgress({ done: report.items.length, total: universe.length, item, symbol, phase: 'evaluating' }); } catch (_) {} }
    }
    checkAbort(signal);
    report.completedAt = Date.now();
    return report;
  }
  const api = { VERSION, RULES, DEFAULT_UNIVERSE, getUniverse, evaluate, scan };
  g.IndependentScanner = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
