// 16.10.2026 — date reale pentru clasificator în Node (proba indicatorilor I-640, robotul de noapte I-638).
// Motorul e ACELAȘI fișier ca în browser (lib/holdings-classifier.js), încărcat în vm; seria Yahoo e transformată
// după regula din lib/data.js fetchStock (bare OHLC valide, volum lipsă = 0, metadate) și citită cu DailySeries.read.
import vm from 'node:vm';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

/** inlocuiri: { 'lib/holdings-classifier.js': 'tools/motoare/<versiune>/holdings-classifier.js' } — motorul al doilea (I-674). */
export function motor(radacina = '.', extra = [], inlocuiri = {}) {
  const c = { console, Intl, Date, Math, JSON };
  c.window = c; vm.createContext(c);
  for (const f of ['lib/exchange-calendar.js', 'lib/daily-series.js', 'lib/holdings-bars.js', 'lib/holdings-neural.js', 'lib/holdings-neural-evaluation.js', 'lib/holdings-classifier.js', ...extra])
    vm.runInContext(readFileSync(radacina + '/' + (inlocuiri[f] || f), 'utf8'), c, { filename: inlocuiri[f] || f });
  return c;
}

/** Răspunsul Yahoo /v8/finance/chart → tablou de bare cu `meta`, ca D.fetchStock. */
export function serie(j, symbol, interval = '1d') {
  const res = j && j.chart && j.chart.result && j.chart.result[0];
  if (!res) throw new Error('Yahoo: simbol invalid sau indisponibil — ' + symbol);
  const ts = res.timestamp || [], q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {}, out = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open && q.open[i], h = q.high && q.high[i], l = q.low && q.low[i], c = q.close && q.close[i], v = q.volume && q.volume[i];
    if (Number.isFinite(ts[i]) && [o, h, l, c].every((x) => x != null && isFinite(x) && x > 0) && h >= l && h >= Math.max(o, c) - 1e-9 && l <= Math.min(o, c) + 1e-9)
      out.push({ o, h, l, c, v: v != null && isFinite(v) && v >= 0 ? v : 0, t: ts[i] * 1000 });
  }
  if (!out.length) throw new Error('Yahoo: serie goală pentru ' + symbol);
  const m = res.meta || {};
  Object.defineProperty(out, 'meta', { value: Object.freeze({
    symbol: m.symbol || null, currency: m.currency || null, exchange: m.exchangeName || null, timezone: m.exchangeTimezoneName || null,
    regularEnd: Number.isFinite(m.currentTradingPeriod?.regular?.end) ? m.currentTradingPeriod.regular.end * 1000 : null,
    provider: 'Yahoo Finance', interval, readAt: Date.now(), retrievedAt: null, quoteAt: Number.isFinite(m.regularMarketTime) ? m.regularMarketTime * 1000 : null,
    delayMinutes: Number.isFinite(m.exchangeDataDelayedBy) && m.exchangeDataDelayedBy >= 0 ? m.exchangeDataDelayedBy : null, inputBars: ts.length, validBars: out.length,
    priceBasis: 'OHLC provider, separat de închiderea ajustată.' }) });
  return out;
}

const pauza = (ms) => new Promise((r) => setTimeout(r, ms));
/** 5 ani zilnic direct de la Yahoo (în Node nu există CORS), cu reîncercări la 429 și la erori de rețea. */
export async function adu(symbol, { range = '5y', fetchImpl = fetch } = {}) {
  let ultima;
  for (let inc = 0; inc < 4; inc++) {
    try {
      const r = await fetchImpl('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) + '?range=' + range + '&interval=1d&events=div%2Csplits&includeAdjustedClose=true', { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
      if (r.status === 429) { await pauza(3000 * (inc + 1)); continue; }
      if (!r.ok) throw new Error('Yahoo ' + r.status);
      return serie(await r.json(), symbol);
    } catch (e) { ultima = e; await pauza(1500); }
  }
  throw ultima || new Error('Yahoo indisponibil');
}

/** I-675: martorul — închiderile zilnice de la Nasdaq (a doua sursă, doar pentru comparație). Întoarce { 'AAAA-LL-ZZ': close }. */
export async function aduNasdaq(symbol, de, { fetchImpl = fetch } = {}) {
  const r = await fetchImpl('https://api.nasdaq.com/api/quote/' + encodeURIComponent(symbol) + '/historical?assetclass=stocks&fromdate=' + de + '&limit=30', { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('Nasdaq ' + r.status);
  const rows = (await r.json())?.data?.tradesTable?.rows; if (!Array.isArray(rows)) throw new Error('Nasdaq: fără date pentru ' + symbol);
  const out = {}; for (const x of rows) { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(x.date || ''), c = Number(String(x.close || '').replace(/[$,]/g, '')); if (m && c > 0) out[m[3] + '-' + m[1] + '-' + m[2]] = c; }
  return out;
}

/** Seria unui simbol, cu cache opțional pe disc ({bars, meta}) — pentru probe repetate fără a cere de mai multe ori aceleași date. */
export async function aduCache(symbol, dir) {
  const f = dir && dir + '/' + symbol.replace(/[^A-Za-z0-9.-]/g, '_') + '.json';
  if (f && existsSync(f)) { const j = JSON.parse(readFileSync(f, 'utf8')), out = j.bars; Object.defineProperty(out, 'meta', { value: Object.freeze(j.meta) }); return out; }
  const out = await adu(symbol); if (f) { mkdirSync(dir, { recursive: true }); writeFileSync(f, JSON.stringify({ bars: out, meta: out.meta })); } return out;
}

/** Universul scannerului: lista US_CORE din candidate-engine/engine.js (aceeași pe care o scanează Planuri). */
export function universScanner(radacina = '.') {
  const s = readFileSync(radacina + '/candidate-engine/engine.js', 'utf8'), m = s.match(/US_CORE\s*=\s*\[([\s\S]*?)\]/);
  if (!m) throw new Error('US_CORE lipsește din candidate-engine/engine.js');
  return [...m[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((x) => x[1] || x[2]);
}

/** I-651: contextul pieței pe zile, doar din închiderile SPY de până în ziua respectivă: [față de media 200 %, randament 20 z %, volatilitate 20 z %]. */
export function contextSpy(spy, dateOf) {
  const m = new Map(); if (!Array.isArray(spy)) return m;
  for (let i = 200; i < spy.length; i++) {
    let s = 0; for (let k = i - 199; k <= i; k++) s += spy[k].c;
    const r = []; for (let k = i - 19; k <= i; k++) r.push(Math.log(spy[k].c / spy[k - 1].c));
    const mu = r.reduce((a, b) => a + b, 0) / r.length, sd = Math.sqrt(r.reduce((a, b) => a + (b - mu) ** 2, 0) / (r.length - 1));
    m.set(dateOf(spy[i].t), [(spy[i].c / (s / 200) - 1) * 100, (spy[i].c / spy[i - 20].c - 1) * 100, sd * 100]);
  }
  return m;
}

/** Clasificarea unui simbol: seria → DailySeries → dataset → evaluate; `mascheaza` = indicii de indicatori puși pe 0 (ablație). */
export function clasifica(c, bars, { now = Date.now(), mascheaza = [], spec = {} } = {}) {
  const C = c.HoldingsClassifier, ascuns = new Set(mascheaza), m = (x) => (ascuns.size ? x.map((v, j) => (ascuns.has(j) ? 0 : v)) : x), prep = c.HoldingsBars.prepare(bars);
  bars = prep.bars;
  const d = C.dataset(bars, now, spec), data = { rows: d.rows.map((r) => ({ ...r, x: m(r.x) })), latest: m(d.latest), spec: d.spec }, last = bars.at(-1);
  const r = C.evaluate(data, { t: last.t, close: last.c, x: data.latest });
  if (!C.valid(r)) throw new Error('Raport neverificabil');
  r.historyCut = prep.cut;
  return r;
}
