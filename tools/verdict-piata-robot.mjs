#!/usr/bin/env node
// I-676 / I-677 / I-681 (17.10.2026) — robotul de noapte al Verdictului pieței (pagina Astăzi).
// Rulează ACEEAȘI bibliotecă ca pagina (lib/market-verdict.js + lib/macro-regime.js) pe date publice și scrie:
//   candidate-engine/generated/verdict-piata.json          verdictul zilei, istoricul scurt, marile companii, proba
//   candidate-engine/generated/verdict-piata-istoric.jsonl  o linie pe sesiune (prima notare rămâne; fișierul doar crește)
// Proba (I-677, reguli în docs/verdict-piata-protocol.md): zilele „Prudent / Defensiv” au căderi mai mari ale SPY în următoarele
// 5 sesiuni decât zilele „Neutru / Favorabil”? Verdict abia după numărul minim de zile separate; până atunci „în probă”.
//   node tools/verdict-piata-robot.mjs           scrie fișierele
//   node tools/verdict-piata-robot.mjs --uscat   doar afișează
import vm from 'node:vm';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { adu } from './clasificator-date.mjs';
import { tcdf } from './clasificator-jurnal.mjs';

export const FISIER = 'candidate-engine/generated/verdict-piata.json', ISTORIC = 'candidate-engine/generated/verdict-piata-istoric.jsonl', VERSIUNE = 'verdict-piata-v1';
export const PROBA = Object.freeze({ orizont: 5, minimPeGrup: 20, alfa: 0.05, protocol: '2026-10-17' });
const fin = Number.isFinite;

export function motorVerdict(radacina = '.') {
  const c = { console, Intl, Date, Math, JSON, URL }; c.window = c; vm.createContext(c);
  for (const f of ['lib/exchange-calendar.js', 'lib/daily-series.js', 'lib/macro-context.js', 'lib/macro-regime.js', 'lib/market-verdict.js']) vm.runInContext(readFileSync(radacina + '/' + f, 'utf8'), c, { filename: f });
  return c;
}
/** Elementul de piață în forma paginii (lib/today-dashboard.js marketItem): doar sesiuni încheiate, media de 50. */
export function item(c, symbol, raw, now) {
  try {
    const s = c.DailySeries.read(raw, symbol, now), bars = s.bars, closes = bars.map((b) => b.c), last = closes.at(-1), prev = closes.at(-2);
    const sma50 = closes.length >= 50 ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 : null;
    return { symbol, state: 'ready', price: last, changePct: (last / prev - 1) * 100, asOf: s.asOf, points: bars.slice(-300).map((b) => ({ at: b.t, value: b.c })), indicators: { sma50 } };
  } catch (e) { return { symbol, state: /DATE STALE/.test(e?.message || '') ? 'stale' : 'error', reason: e?.message }; }
}
/** Lățimea pieței și raportul motorului, din fișierul publicat de robotul Market Breadth. */
export function breadthDin(j) {
  const s = j?.sources?.sp500; if (!s || s.fetchStatus !== 'OK') return { breadth: { state: 'error', points: [] }, raport: null };
  const p = (x) => (fin(x) ? x * 100 : null), pts = (s.history || []).map((h) => ({ at: Date.parse(h.date + 'T20:00:00Z'), value: p(h.above50) })).filter((x) => fin(x.at) && fin(x.value)).slice(-90);
  return { breadth: { state: 'ready', asOf: s.asOf, above50: p(s.latest?.above50), above200: p(s.latest?.above200), points: pts, stance: j?.full?.engine?.master?.stance || null }, raport: { sectors: j?.sources?.uptrend?.sectors || null, scorecard: j?.full?.engine?.master?.scorecard || null } };
}
/** I-681: rezultatele celor mai mari companii (calendarul Nasdaq pe zilele lucrătoare din următoarele 7 zile), primele 15 după capitalizare. */
export function mariDin(zile, n = 15) {
  const rows = [];
  for (const [date, list] of zile) for (const r of list || []) { const cap = Number(String(r.marketCap || '').replace(/[$,]/g, '')); if (r.symbol && fin(cap) && cap > 0) rows.push({ symbol: String(r.symbol).slice(0, 12), date, cap, cand: r.time === 'time-pre-market' ? 'înainte de deschidere' : r.time === 'time-after-hours' ? 'după închidere' : null }); }
  return rows.sort((a, b) => b.cap - a.cap).slice(0, n).sort((a, b) => (a.date < b.date ? -1 : 1));
}
/** Linia de istoric a zilei (scorurile pe indicatori, pentru „ce s-a mutat” și pentru probă). */
export function linieZi(v, generat, regim) {
  return { asOf: v.asOf, generat, label: v.label.id, score: v.score, citite: v.citite, indicatori: Object.fromEntries(v.indicatori.map((x) => [x.id, x.score])), regim: regim?.treapta?.cod || null };
}
export function adaugaLinie(linii, l) { return !l.asOf || l.label === 'necunoscut' || linii.some((x) => x.asOf === l.asOf) ? null : l; }
/** I-677: căderea maximă și randamentul SPY în următoarele `h` sesiuni, pe zile separate; Welch unilateral pe căderi. */
export function proba(linii, spyBars, dateOf, cal, { orizont = PROBA.orizont, minim = PROBA.minimPeGrup, alfa = PROBA.alfa } = {}) {
  const idx = new Map(spyBars.map((b, i) => [dateOf(b.t), i])), c = spyBars.map((b) => b.c), rows = [];
  for (const l of linii) {
    if (cal && Number.isFinite(Date.parse(l.generat)) && cal.beforeNextOpen({ timezone: 'America/New_York', closeMinutes: 960, asOf: l.asOf }, Date.parse(l.generat)) === false) continue; // notată după deschidere: nu contează
    const i = idx.get(l.asOf); if (i === undefined || i + orizont >= c.length) continue;
    let dd = 0; for (let k = 1; k <= orizont; k++) dd = Math.min(dd, c[i + k] / c[i] - 1);
    rows.push({ asOf: l.asOf, i, grup: l.label === 'prudent' || l.label === 'defensiv' ? 'redus' : 'normal', dd: dd * 100, r: (c[i + orizont] / c[i] - 1) * 100 });
  }
  rows.sort((a, b) => a.i - b.i); const sep = []; let ultim = -Infinity; for (const r of rows) if (r.i >= ultim + orizont) { sep.push(r); ultim = r.i; }
  const g = (k) => sep.filter((r) => r.grup === k), A = g('redus'), B = g('normal'), m = (xs, f) => (xs.length ? xs.reduce((s, x) => s + f(x), 0) / xs.length : null);
  const v = (xs, f) => { const mu = m(xs, f); return xs.length > 1 ? xs.reduce((s, x) => s + (f(x) - mu) ** 2, 0) / (xs.length - 1) : null; };
  let p = null;
  if (A.length > 1 && B.length > 1) { const va = v(A, (x) => x.dd), vb = v(B, (x) => x.dd), se = Math.sqrt(va / A.length + vb / B.length), t = se > 0 ? (m(A, (x) => x.dd) - m(B, (x) => x.dd)) / se : 0, df = se > 0 ? (va / A.length + vb / B.length) ** 2 / ((va / A.length) ** 2 / (A.length - 1) + (vb / B.length) ** 2 / (B.length - 1)) : 1; p = tcdf(t, Math.max(1, df)); } // H1: căderile din zilele „redus” sunt mai mari (mai negative)
  const gata = A.length >= minim && B.length >= minim, verdict = !gata ? 'in-proba' : p !== null && p < alfa && m(A, (x) => x.dd) < m(B, (x) => x.dd) ? 'ajuta' : 'nu-ajuta';
  const n = (x) => (x === null ? '—' : x.toLocaleString('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const mesaj = verdict === 'in-proba' ? `Regula verdictului e în probă pe zile noi: ${A.length} zile „Prudent / Defensiv” și ${B.length} „Neutru / Favorabil” din câte ${minim} necesare.` : verdict === 'ajuta' ? `Regula verdictului ajută pe zile noi: după zilele „Prudent / Defensiv” S&P a căzut în medie ${n(m(A, (x) => x.dd))}% în 5 sesiuni, față de ${n(m(B, (x) => x.dd))}%.` : 'Pe zile noi, regula verdictului nu a separat căderile S&P cu pragul scris dinainte: tratează-l ca descriere, nu ca avertizare.';
  return { verdict, mesaj, zile: sep.length, redus: { n: A.length, cadere: m(A, (x) => x.dd), randament: m(A, (x) => x.r) }, normal: { n: B.length, cadere: m(B, (x) => x.dd), randament: m(B, (x) => x.r) }, p, prag: PROBA };
}
export function citesteIstoric(text) { return String(text || '').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); }

export async function ruleaza({ radacina = '.', now = Date.now(), sursa = adu, fetchImpl = fetch, log = () => {}, istoric = [] } = {}) {
  const c = motorVerdict(radacina), MV = c.MarketVerdict, dateOf = (t) => c.DailySeries.date(t, 'America/New_York');
  const raw = {}; for (const s of ['SPY', 'QQQ', '^VIX', '^TNX', ...MV.EXTRA]) { try { raw[s] = await sursa(s); } catch (e) { log(`${s} ✗ ${e?.message}`); } }
  const items = ['SPY', 'QQQ', '^VIX', '^TNX'].map((s) => (raw[s] ? item(c, s, raw[s], now) : { symbol: s, state: 'error' }));
  const { breadth, raport } = breadthDin(existsSync(radacina + '/market-breadth/data/latest.json') ? JSON.parse(readFileSync(radacina + '/market-breadth/data/latest.json', 'utf8')) : null);
  let fg = null; try { fg = c.MacroRegime.fgDin(await (await fetchImpl('https://api.alternative.me/fng/?limit=1', { signal: AbortSignal.timeout(15000) })).json()); } catch (e) { log('Fear & Greed ✗ ' + e?.message); }
  const extra = { serii: Object.fromEntries(MV.EXTRA.filter((s) => raw[s]).map((s) => [s, raw[s].map((b) => ({ t: b.t, c: b.c }))])), fg, la: now, erori: MV.EXTRA.filter((s) => !raw[s]) };
  const market = { items, breadth }, regim = MV.regimDin(market, extra);
  const zile = []; for (let k = 0, d = new Date(now); k < 10 && zile.length < 6; k++, d = new Date(d.getTime() + 86400000)) { const iso = d.toISOString().slice(0, 10), w = d.getUTCDay(); if (w === 0 || w === 6) continue; try { const r = await fetchImpl('https://api.nasdaq.com/api/calendar/earnings?date=' + iso, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' }, signal: AbortSignal.timeout(15000) }); zile.push([iso, r.ok ? (await r.json())?.data?.rows || [] : []]); } catch (e) { log(`Nasdaq ${iso} ✗ ${e?.message}`); } }
  const rezultateMari = mariDin(zile);
  let events = []; try { events = c.MCTX.hardcodedEvents(); } catch (e) { log('calendar ✗ ' + e?.message); }
  const v = MV.compute({ market, raport, regime: regim, extra, events, robot: { rezultateMari, istoric }, now }), generat = new Date(now).toISOString();
  const linie = adaugaLinie(istoric, linieZi(v, generat, regim)), toate = linie ? istoric.concat(linie) : istoric;
  const spy = raw.SPY ? (() => { try { return c.DailySeries.read(raw.SPY, 'SPY', now).bars; } catch { return []; } })() : [];
  const pr = proba(toate, spy, dateOf, c.ExchangeCalendar);
  const j = { version: VERSIUNE, generat, asOf: v.asOf, label: v.label.id, score: v.score, citite: v.citite, fraza: v.fraza, rezumat: v.rezumat,
    indicatori: v.indicatori.map((x) => ({ id: x.id, name: x.name, value: x.value, score: x.score })), regim, rezultateMari, futures: v.futures, istoric: toate.slice(-60), proba: pr, surseLipsa: extra.erori };
  return { j, linie };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const vechi = existsSync(FISIER) ? (() => { try { return JSON.parse(readFileSync(FISIER, 'utf8')); } catch { return null; } })() : null;
  const istoric = existsSync(ISTORIC) ? citesteIstoric(readFileSync(ISTORIC, 'utf8')) : [];
  const { j, linie } = await ruleaza({ log: console.log, istoric });
  console.log(`Verdict ${j.asOf}: ${j.label} (scor ${j.score}, ${j.citite} din 6) · regim macro ${j.regim?.treapta?.cod || '—'} · mari ${j.rezultateMari.length} · istoric ${j.istoric.length} · ${j.proba.mesaj}`);
  if (j.citite < 3) { console.error('Prea puține surse citite; fișierul vechi rămâne.'); process.exit(1); }
  if (!process.argv.includes('--uscat')) { writeFileSync(FISIER, JSON.stringify(j) + '\n'); if (linie) appendFileSync(ISTORIC, JSON.stringify(linie) + '\n'); }
  // Discord: doar la schimbarea etichetei față de sesiunea precedentă notată
  if (process.env.DISCORD_WEBHOOK && !process.argv.includes('--uscat') && vechi?.label && vechi.asOf !== j.asOf && vechi.label !== j.label) {
    const T = { favorabil: 'Favorabil', neutru: 'Neutru', prudent: 'Prudent', defensiv: 'Defensiv' };
    try { const r = await fetch(process.env.DISCORD_WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: `**Verdictul pieței** · ${T[vechi.label] || vechi.label} → **${T[j.label] || j.label}** (după sesiunea ${j.asOf})\n${j.fraza}\nContext, nu semnal; detaliile pe Astăzi.` }), signal: AbortSignal.timeout(20000) }); console.log('Discord: ' + r.status); } catch (e) { console.log('Discord: ' + e.message); }
  }
}
