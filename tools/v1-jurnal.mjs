// 18.10.2026 — Robotul probei Reguli V1 (GitHub Actions, zilnic după închiderea SUA). Protocolul: docs/v1-proba-protocol.md.
// Rulează exact motorul din aplicație (lib/independent-scanner.js) pe universul înghețat, notează ziua în
// scanner-verdicts/generated/v1-jurnal.json și scrie evaluarea în scanner-verdicts/generated/v1-proba.json. Fără chei.
import vm from 'node:vm';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { PROTOCOL, inregistrare, adauga, evalueaza } from '../lib/v1-proba.mjs';

const DIR = 'scanner-verdicts/generated', JURNAL = DIR + '/v1-jurnal.json', PROBA = DIR + '/v1-proba.json';
const z = (ms) => new Promise((r) => setTimeout(r, ms));
const serii = {}; // simbol → [{ d, c }] din aceleași bare pe care le-a văzut motorul

function dataLocala(t, zone) { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(t)).map((x) => [x.type, x.value])); return p.year + '-' + p.month + '-' + p.day; }
// Aceeași formă ca D.fetchStock din lib/data.js (bare valide + meta), direct de la Yahoo.
export async function fetchStock(symbol, opts = {}) {
  const range = opts.range || '2y', interval = opts.interval || '1d';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&events=div%2Csplits&includeAdjustedClose=true`;
  let j, ultima;
  for (let incercare = 0; incercare < 4 && !j; incercare++) {
    try { const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (trading-tools v1-proba)' }, signal: AbortSignal.timeout(20000) }); if (r.status === 429 || r.status >= 500) throw Error('Yahoo ' + r.status); j = await r.json(); }
    catch (e) { ultima = e; await z(1500 * (incercare + 1)); }
  }
  const res = j?.chart?.result?.[0]; if (!res) throw Error('Yahoo: simbol indisponibil — ' + symbol + (ultima ? ' (' + ultima.message + ')' : ''));
  const ts = res.timestamp || [], q = res.indicators?.quote?.[0] || {}, out = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i], v = q.volume?.[i];
    if (Number.isFinite(ts[i]) && [o, h, l, c].every((x) => x != null && isFinite(x) && x > 0) && h >= l && h >= Math.max(o, c) - 1e-9 && l <= Math.min(o, c) + 1e-9) out.push({ t: ts[i] * 1000, o, h, l, c, v: v != null && isFinite(v) ? v : 0 });
  }
  if (!out.length) throw Error('Yahoo: serie goală pentru ' + symbol);
  const m = res.meta || {};
  Object.defineProperty(out, 'meta', { value: Object.freeze({ symbol: m.symbol || null, currency: m.currency || null, exchange: m.exchangeName || null, timezone: m.exchangeTimezoneName || null, regularEnd: Number.isFinite(m.currentTradingPeriod?.regular?.end) ? m.currentTradingPeriod.regular.end * 1000 : null, provider: 'Yahoo Finance', interval, readAt: Date.now() }) });
  if (interval === '1d' && m.exchangeTimezoneName) serii[symbol] = out.map((b) => ({ d: dataLocala(b.t, m.exchangeTimezoneName), c: b.c }));
  return out;
}
function motor() {
  const c = { console, Intl, Date, Math, JSON, Map, Set, URL, Promise, Error, Number, String, Array, Object, AbortController, setTimeout, clearTimeout };
  c.window = c; vm.createContext(c);
  for (const f of ['lib/exchange-calendar.js', 'lib/daily-series.js', 'lib/independent-scanner.js']) vm.runInContext(readFileSync(f, 'utf8'), c);
  c.D = { fetchStock: (s, o) => fetchStock(s, o) };
  return c;
}
async function main() {
  const c = motor(), V = c.IndependentScanner.VERSION;
  const report = await c.IndependentScanner.scan({ symbols: [...PROTOCOL.univers], concurrency: 3 });
  const rec = inregistrare(report);
  if (!rec.zi) throw Error('Nicio acțiune verificată azi (' + report.failures.length + ' eșecuri) — jurnalul rămâne neschimbat.');
  mkdirSync(DIR, { recursive: true });
  const vechi = existsSync(JURNAL) ? JSON.parse(readFileSync(JURNAL, 'utf8')) : { zile: [] };
  const jurnal = adauga(vechi, rec);
  // reperele folosite în zilele vechi (EXSA.DE / ^STOXX / IVV…) trebuie să aibă bare și azi
  const lipsa = [...new Set(jurnal.zile.flatMap((zi) => zi.r.map((x) => x[4]).filter(Boolean)))].filter((s) => !serii[s]);
  for (const s of lipsa.concat(serii.SPY ? [] : ['SPY'])) { try { await fetchStock(s, { range: '2y', interval: '1d' }); } catch (e) { console.log('reper ' + s + ': ' + e.message); } }
  const sesiuni = (serii.SPY || []).map((x) => x.d);
  const orizonturi = PROTOCOL.orizonturi.map((k) => evalueaza(jurnal, serii, { k, versiune: V, sesiuni }));
  const zileVersiune = jurnal.zile.filter((zi) => zi.v === V);
  writeFileSync(JURNAL, JSON.stringify(jurnal));
  writeFileSync(PROBA, JSON.stringify({ protocol: PROTOCOL.id, scrisLa: PROTOCOL.scrisLa, versiune: V, inceput: zileVersiune[0]?.zi || null, zile: zileVersiune.length, ultimaZi: rec.zi, ultimaRulare: rec.la,
    azi: { verificate: report.verifiedCount, total: report.items.length, indeplinesc: rec.r.filter((x) => x[1] === 'm').length, sus: rec.r.filter((x) => x[1] !== 'u' && x[2] >= PROTOCOL.pragSus).length },
    orizonturi }, null, 1));
  console.log(`V1 ${V} · ziua ${rec.zi} · ${report.verifiedCount}/${report.items.length} verificate · ${zileVersiune.length} zile în probă`);
  for (const o of orizonturi) console.log(`  k=${o.k}: ${o.perioade}/${o.necesare} perioade · ${o.verdict}`);
}
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/v1-jurnal.mjs')) main().catch((e) => { console.error(e.message); process.exit(1); });
