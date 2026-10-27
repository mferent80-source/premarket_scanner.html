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
import { mulberry32, gauss, amprentaFunctii, amprentaText, inchidere, declaratii, dupaSesiuni, sesiuniIntre, judecata as judecataDin } from '../lib/proba-contract.mjs';

export const FISIER = 'candidate-engine/generated/verdict-piata.json', ISTORIC = 'candidate-engine/generated/verdict-piata-istoric.jsonl', VERSIUNE = 'verdict-piata-v1';
// 27.10.2026 (revizia independentă F, 🔴4): testul e permutarea pe EPISOADE de etichetă (nu Welch), cu PERMUTARI trageri peste atâtea aranjamente
export const PROBA = Object.freeze({ orizont: 5, minimPeGrup: 20, alfa: 0.05, protocol: '2026-10-17', revizie: '2026-10-27', test: 'permutare-episoade', permutari: 4000, samanta: 17102026 });
/** 27.10.2026 (I-743): versiunea regulii verdictului (docs/setup-filtru-piata.md, 2.1) pe fiecare linie nouă din istoric. Liniile vechi n-o au:
 *  contează ca v2.1 doar dacă au fost notate după revizia din 17.10.2026 (264e74af, 13:06 UTC) — 16.10 a fost notat sub regula dinainte. */
export const REGULA = 'v2.1', REVIZIE = '2026-10-17T13:06:14Z';
export function deRegula(l) { if (l && l.regula !== undefined) return l.regula === REGULA; const t = Date.parse(l?.generat); return Number.isFinite(t) && t >= Date.parse(REVIZIE); }
/** 27.10.2026 (revizia F, 🟡8): amprenta regulii din CONȚINUT — SHA pe ce decide eticheta: închiderea lui `compute` + `regimDin` din
 *  lib/market-verdict.js (fără `render`, `regula()` pentru Drafturi, `robotFile`) și tot lib/macro-regime.js; CRLF = LF. */
export function amprentaRegulii(radacina = '.', citeste = (f) => readFileSync(f, 'utf8')) {
  const mv = citeste(radacina + '/lib/market-verdict.js'), mr = citeste(radacina + '/lib/macro-regime.js');
  return 'rv-' + amprentaText(mv, inchidere(mv, ['compute', 'regimDin']), 'macro\n' + amprentaText(mr, declaratii(mr)));
}
/** Amprentele de conținut recunoscute ca regula v2.1 — tabelul din docs/verdict-piata-protocol.md (§ „Amprentele regulii v2.1”), care doar
 *  crește; fiecare rând nou are motivul „fără efect asupra etichetei”. O amprentă necunoscută = altă regulă: linia o poartă ca `regula`. */
export const AMPRENTE_V21 = Object.freeze(['rv-62c4d5d5f014', 'rv-2d9c18951701', 'rv-3ae2d077258b', 'rv-3e18543febee']);
export function regulaPentru(amprenta) { return AMPRENTE_V21.includes(amprenta) ? REGULA : amprenta; }
export const CURS = 'candidate-engine/generated/curs-bnr.json';
/** I-686: cursul oficial BNR (lei pentru o unitate; multiplicatorul se împarte), din fișierele anuale curs.bnr.ro. Doar EUR / USD / GBP / CHF. */
export function cursDin(xml) {
  const out = {}, cubes = String(xml || '').matchAll(/<Cube date="(\d{4}-\d{2}-\d{2})">([\s\S]*?)<\/Cube>/g);
  for (const [, d, body] of cubes) { const zi = {}; for (const [, attrs, v] of body.matchAll(/<Rate([^>]*)>([\d.]+)<\/Rate>/g)) { const c = /currency="([A-Z]{3})"/.exec(attrs)?.[1], m = Number(/multiplier="(\d+)"/.exec(attrs)?.[1] || 1); if (['EUR', 'USD', 'GBP', 'CHF'].includes(c) && fin(Number(v))) zi[c] = Number(v) / m; } if (Object.keys(zi).length) out[d] = zi; }
  return out;
}
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
export function linieZi(v, generat, regim, regula = REGULA, amprenta = null) {
  return { asOf: v.asOf, generat, regula, ...(amprenta ? { amprentaRegula: amprenta } : {}), label: v.label.id, score: v.score, citite: v.citite, indicatori: Object.fromEntries(v.indicatori.map((x) => [x.id, x.score])), regim: regim?.treapta?.cod || null };
}
export function adaugaLinie(linii, l) { return !l.asOf || l.label === 'necunoscut' || linii.some((x) => x.asOf === l.asOf) ? null : l; }
/** Welch unilateral (H1: căderile din zilele „redus” sunt mai mari, adică mai negative): p sau null sub 2 zile pe grup. */
function welch(A, B) {
  if (A.length < 2 || B.length < 2) return null;
  const m = (xs) => xs.reduce((s, x) => s + x.dd, 0) / xs.length, ma = m(A), mb = m(B), v = (xs, mu) => xs.reduce((s, x) => s + (x.dd - mu) ** 2, 0) / (xs.length - 1), va = v(A, ma), vb = v(B, mb);
  const se = Math.sqrt(va / A.length + vb / B.length), t = se > 0 ? (ma - mb) / se : 0, df = se > 0 ? (va / A.length + vb / B.length) ** 2 / ((va / A.length) ** 2 / (A.length - 1) + (vb / B.length) ** 2 / (B.length - 1)) : 1;
  return tcdf(t, Math.max(1, df));
}
/** 27.10.2026 (revizia F, 🔴4): episoadele = blocurile de zile separate CONSECUTIVE (în timp) cu aceeași etichetă. */
function episoade(rows) { const out = []; for (const r of rows) { const e = out[out.length - 1]; if (e && e.grup === r.grup) { e.s += r.dd; e.q += r.dd * r.dd; e.n++; } else out.push({ grup: r.grup, s: r.dd, q: r.dd * r.dd, n: 1 }); } return out; }
/** Testul de permutare pe EPISOADE de etichetă (revizia F, 🔴4): zilele dintr-un episod au aceeași piață (volatilitatea vine în ciorchini),
 *  deci nu sunt independente — episoadele rămân întregi și se permută doar CARE episoade sunt „redus” (numărul lor fixat). Statistica:
 *  STUDENTIZATĂ (t-ul Welch pe zile: diferența mediilor / eroarea ei) — diferența simplă a mediilor minte până la 6,8 % (episoadele „redus”,
 *  mai rare, sunt mai scurte, deci permutările le dau grupuri mai mari și o distribuție prea îngustă; simularea din protocol); p unilateral =
 *  partea aranjamentelor cu statistica ≤ cea observată. Exact când
 *  aranjamentele sunt cel mult PROBA.permutari; altfel atâtea trageri mulberry32 cu sămânța fixă, p = (1 + #) / (1 + B). null = un singur grup. */
export function permutareEpisoade(rows, { B = PROBA.permutari, samanta = PROBA.samanta } = {}) {
  const ep = episoade(rows), E = ep.length, R = ep.filter((e) => e.grup === 'redus').length;
  if (R < 1 || R >= E) return null;
  const S = ep.map((e) => e.s), Q = ep.map((e) => e.q), N = ep.map((e) => e.n), totS = S.reduce((a, b) => a + b, 0), totQ = Q.reduce((a, b) => a + b, 0), totN = N.reduce((a, b) => a + b, 0);
  const stat = (sR, qR, nR) => { const nN = totN - nR, mR = sR / nR, mN = (totS - sR) / nN, vR = nR > 1 ? Math.max(0, qR - nR * mR * mR) / (nR - 1) : 0, vN = nN > 1 ? Math.max(0, totQ - qR - nN * mN * mN) / (nN - 1) : 0, se = Math.sqrt(vR / nR + vN / nN); return se > 0 ? (mR - mN) / se : mR < mN ? -Infinity : mR > mN ? Infinity : 0; };
  let sR0 = 0, qR0 = 0, nR0 = 0; for (const e of ep) if (e.grup === 'redus') { sR0 += e.s; qR0 += e.q; nR0 += e.n; }
  const obs = stat(sR0, qR0, nR0), tol = Number.isFinite(obs) ? 1e-9 * (1 + Math.abs(obs)) : 0;
  let comb = 1; for (let i = 1; i <= R; i++) { comb = (comb * (E - R + i)) / i; if (comb > B) break; }
  const baza = { statistica: obs, episoade: { redus: R, normal: E - R } };
  if (comb <= B) {   // toate aranjamentele, o singură dată fiecare
    let k = 0, tot = 0; const alege = (de, ramase, sR, qR, nR) => { if (!ramase) { tot++; if (stat(sR, qR, nR) <= obs + tol) k++; return; } for (let i = de; i <= E - ramase; i++) alege(i + 1, ramase - 1, sR + S[i], qR + Q[i], nR + N[i]); };
    alege(0, R, 0, 0, 0); return { ...baza, p: k / tot, exact: true, aranjamente: tot };
  }
  const rnd = mulberry32(samanta), idx = Array.from({ length: E }, (_, i) => i); let k = 0;
  for (let b = 0; b < B; b++) { let sR = 0, qR = 0, nR = 0; for (let i = 0; i < R; i++) { const j = i + Math.floor(rnd() * (E - i)), t = idx[i]; idx[i] = idx[j]; idx[j] = t; sR += S[idx[i]]; qR += Q[idx[i]]; nR += N[idx[i]]; } if (stat(sR, qR, nR) <= obs + tol) k++; }
  return { ...baza, p: (1 + k) / (1 + B), exact: false, aranjamente: B };
}
/** I-677: căderea maximă și randamentul SPY în următoarele `h` sesiuni, pe zile separate; Welch unilateral pe căderi.
 *  27.10.2026 (protocolul, § Schimbări): doar liniile regulii de acum (`deRegula`); verdictul se dă O SINGURĂ dată, pe eșantionul fix
 *  al zilelor separate până când ambele grupuri ajung prima dată la `minim` — rejudecarea în fiecare noapte dădea „ajută” fals în
 *  9–14 % din lumile fără efect (simulare, 20.000 de lumi), nu 5 %. Zilele de după apar doar ca monitorizare.
 *  27.10.2026 (revizia independentă F, 🔴4, protocolul § „Revizia”): judecata e permutarea pe episoade de etichetă (Welch minte până la ~8 %
 *  cu volatilitate în ciorchini); Welch rămâne doar în `ajutaOricand` — ce ar fi spus regula veche, rejudecată în fiecare noapte. */
export function proba(linii, spyBars, dateOf, cal, { orizont = PROBA.orizont, minim = PROBA.minimPeGrup, alfa = PROBA.alfa } = {}) {
  const idx = new Map(spyBars.map((b, i) => [dateOf(b.t), i])), c = spyBars.map((b) => b.c), rows = [], excluse = [];
  for (const l of linii) {
    if (!deRegula(l)) { excluse.push(l.asOf); continue; }   // notată sub altă regulă: rămâne în istoric, nu în probă
    if (cal && Number.isFinite(Date.parse(l.generat)) && cal.beforeNextOpen({ timezone: 'America/New_York', closeMinutes: 960, asOf: l.asOf }, Date.parse(l.generat)) === false) continue; // notată după deschidere: nu contează
    const i = idx.get(l.asOf); if (i === undefined || i + orizont >= c.length) continue;
    let dd = 0; for (let k = 1; k <= orizont; k++) dd = Math.min(dd, c[i + k] / c[i] - 1);
    rows.push({ asOf: l.asOf, i, grup: l.label === 'prudent' || l.label === 'defensiv' ? 'redus' : 'normal', dd: dd * 100, r: (c[i + orizont] / c[i] - 1) * 100 });
  }
  rows.sort((a, b) => a.i - b.i); const sep = []; let ultim = -Infinity; for (const r of rows) if (r.i >= ultim + orizont) { sep.push(r); ultim = r.i; }
  // eșantionul fix: zilele separate până la prima în care ambele grupuri au câte `minim`; „ajutaOricand” arată doar ce ar fi spus rejudecarea
  let na = 0, nb = 0, cut = -1, ajutaOricand = false;
  for (let j = 0; j < sep.length; j++) {
    if (sep[j].grup === 'redus') na++; else nb++;
    if (na >= minim && nb >= minim) { const pre = sep.slice(0, j + 1), A0 = pre.filter((r) => r.grup === 'redus'), B0 = pre.filter((r) => r.grup !== 'redus'), q = welch(A0, B0);
      if (cut < 0) cut = j; if (q !== null && q < alfa && A0.reduce((s, x) => s + x.dd, 0) / A0.length < B0.reduce((s, x) => s + x.dd, 0) / B0.length) ajutaOricand = true; }
  }
  const fix = cut >= 0 ? sep.slice(0, cut + 1) : sep, g = (xs, k) => xs.filter((r) => r.grup === k), A = g(fix, 'redus'), B = g(fix, 'normal'), m = (xs, f) => (xs.length ? xs.reduce((s, x) => s + f(x), 0) / xs.length : null);
  const gata = cut >= 0, t = gata ? permutareEpisoade(fix) : null, p = t ? t.p : null, verdict = !gata ? 'in-proba' : p !== null && p <= alfa && m(A, (x) => x.dd) < m(B, (x) => x.dd) ? 'ajuta' : 'nu-ajuta';
  const n = (x) => (x === null ? '—' : x.toLocaleString('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const mesaj = verdict === 'in-proba' ? `Regula verdictului e în probă pe zile noi: ${A.length} zile „Prudent / Defensiv” și ${B.length} „Neutru / Favorabil” din câte ${minim} necesare; verdictul se dă o singură dată, când ambele ajung la ${minim}.`
    : verdict === 'ajuta' ? `Regula verdictului ajută pe zile noi (judecată o singură dată, pe primele ${A.length} și ${B.length} zile separate): după zilele „Prudent / Defensiv” S&P a căzut în medie ${n(m(A, (x) => x.dd))}% în 5 sesiuni, față de ${n(m(B, (x) => x.dd))}%.`
    : `Pe zile noi (judecată o singură dată, pe primele ${A.length} și ${B.length} zile separate), regula verdictului nu a separat căderile S&P cu pragul scris dinainte: tratează-l ca descriere, nu ca avertizare.`;
  const Ma = g(sep, 'redus'), Mb = g(sep, 'normal'), ultimaFix = fix.at(-1), tm = Ma.length && Mb.length ? permutareEpisoade(sep) : null;
  return { verdict, mesaj, zile: sep.length, redus: { n: A.length, cadere: m(A, (x) => x.dd), randament: m(A, (x) => x.r) }, normal: { n: B.length, cadere: m(B, (x) => x.dd), randament: m(B, (x) => x.r) }, p, prag: PROBA,
    test: { metoda: 'permutare pe episoade de etichetă', episoade: t ? t.episoade : null, exact: t ? t.exact : null, aranjamente: t ? t.aranjamente : null },
    regula: REGULA, excluse: { n: excluse.length, zile: excluse, motiv: 'notate sub altă regulă decât ' + REGULA },
    judecata: judecataDin({ la: minim, data: gata && ultimaFix.i + orizont < spyBars.length ? dateOf(spyBars[ultimaFix.i + orizont].t) : null, verdict: gata ? verdict : null, unic: true }),
    monitorizare: { zile: sep.length, dupaJudecata: gata ? sep.length - fix.length : 0, redus: { n: Ma.length, cadere: m(Ma, (x) => x.dd) }, normal: { n: Mb.length, cadere: m(Mb, (x) => x.dd) }, p: tm ? tm.p : null, ajutaOricand },
    ultimaZiSeparata: sep.at(-1)?.asOf || null };
}
/** 27.10.2026 (I-743): amprenta judecătorului verdictului — funcțiile care aleg liniile, măsoară și judecă, plus pragurile; scrisă în protocol. */
export function amprentaJudecator() { return 'jv-' + amprentaFunctii({ deRegula, welch, proba, tcdf, episoade, permutareEpisoade }, ['deRegula', 'welch', 'proba', 'tcdf', 'episoade', 'permutareEpisoade'], JSON.stringify({ PROBA, REGULA, REVIZIE, AMPRENTE_V21 })); }

/* ---------- puterea și data primului verdict (contractul cu lotul D, I-744) ---------- */
/** O lume sintetică pentru mărime / putere: SPY cu pași N(0, 1 %/zi), etichete „redus” cu pondere `pRedus` și persistență `sta` (probabilitatea
 *  de a păstra eticheta de ieri), independente de viitor; `efect` = puncte procentuale de cădere în plus pe cele 5 sesiuni de după fiecare zi
 *  separată „redus” (zilele separate sunt 0, 5, 10… — notare în fiecare sesiune), deci exact pe ce măsoară proba, fără să atingă grupul „normal”. */
export function lumeVerdict(seed, { pRedus = 0.3, sta = 0.8, zile = 500, efect = 0 } = {}) {
  const r = mulberry32(seed), g = gauss(r), lab = []; let red = r() < pRedus;
  for (let i = 0; i < zile; i++) { if (i && r() > sta) red = r() < pRedus; lab.push(red); }
  const spy = []; let p = 100; for (let i = 0; i < zile + 6; i++) { const s = Math.floor((i - 1) / 5) * 5, scade = efect && i > 0 && lab[s] ? efect / 100 / 5 : 0; p *= 1 + 0.01 * g() - scade; spy.push({ t: Date.UTC(2026, 0, 5) + i * 86400000, c: p }); }
  return { spy, linii: lab.map((x, i) => ({ asOf: new Date(spy[i].t).toISOString().slice(0, 10), generat: 'x', regula: REGULA, label: x ? 'prudent' : 'neutru' })) };
}
/** Rata „ajută” a judecății unice pe `lumi` lumi (mărimea cu efect 0, puterea cu efect > 0). */
export function rataAjuta({ lumi = 2000, samanta = 27102026, ...o } = {}) {
  const dateOf = (t) => new Date(t).toISOString().slice(0, 10); let k = 0;
  for (let w = 0; w < lumi; w++) { const { spy, linii } = lumeVerdict(samanta + w, o); if (proba(linii, spy, dateOf, null).verdict === 'ajuta') k++; }
  return k / lumi;
}
/** Puterea scrisă în protocol pe 27.10.2026 (`rataAjuta`, 2000 de lumi, 30 % zile „redus”, persistența 0,8): judecata la primul 20 / 20.
 *  Revizia F (🔴4): recalculată cu permutarea pe episoade (Welch dădea 14,3 % / 34,9 % și mărimea 4,0 % pe aceeași lume i.i.d.). */
export const PUTERE = Object.freeze({ unitate: 'puncte procentuale de cădere maximă a SPY în 5 sesiuni, în plus după zilele „Prudent / Defensiv”', lumi: 2000,
  laPlus: Object.freeze([Object.freeze({ pct: 0.5, putere: 0.136 }), Object.freeze({ pct: 1, putere: 0.335 })]), marime: 0.041 });
/** Câmpurile de contract: puterea, data primului verdict (când ambele grupuri ajung la 20 de zile separate), judecata (unică). */
export function contractVerdict(pr, { cal, azi, notate = 0, asteptate = 0 }) {
  const nA = pr.redus.n, nB = pr.normal.n, tot = nA + nB, q = tot >= 5 ? Math.min(0.9, Math.max(0.1, nA / tot)) : 0.3, min = PROBA.minimPeGrup, o = PROBA.orizont;
  const maiTrebuie = pr.judecata.verdict ? 0 : Math.ceil(Math.max((min - nA) / q, (min - nB) / (1 - q), 0)), deLa = pr.ultimaZiSeparata && pr.ultimaZiSeparata <= azi ? pr.ultimaZiSeparata : azi;
  const ses = maiTrebuie * o + o, opt = dupaSesiuni(cal, deLa, ses), r = asteptate > 0 && notate < asteptate ? Math.min(0.8, 1 - notate / asteptate) : 0, rl = dupaSesiuni(cal, deLa, Math.round(ses * (r > 0 ? 1 + r / ((1 - r) * o) : 1)));
  const unu = (x) => (x * 100).toFixed(1).replace('.', ',');
  const laPlus = PUTERE.laPlus.map((x) => ({ ...x }));
  return { putere: { ...PUTERE, laPlus, text: laPlus.every((x) => Number.isFinite(x.putere)) ? `La primul 20 / 20 de zile separate proba vede o cădere în plus de ${laPlus.map((x) => String(x.pct).replace('.', ',') + ' pp în ' + unu(x.putere) + ' %').join(' și de ')} din cazuri; „nu ajută” nu înseamnă „s-a dovedit că nu”.` : null },
    primulVerdict: { optimist: opt.zi, realist: rl.zi > opt.zi ? rl.zi : opt.zi, motiv: `Verdictul vine când ambele grupuri au câte 20 de zile separate (≥ 5 sesiuni între ele): azi ${nA} „Prudent / Defensiv” și ${nB} „Neutru / Favorabil”; ` +
      (tot >= 5 ? `cu ${Math.round(100 * q)} % zile „redus” cât s-au văzut până acum` : 'presupunând 30 % zile „redus” (prea puține zile ca să se măsoare)') + ` mai trebuie ~${maiTrebuie} zile separate` + (r > 0 ? `; realist: robotul a pierdut ${asteptate - notate} din ${asteptate} sesiuni` : '') + (opt.aproximativ || rl.aproximativ ? '; dincolo de calendarul oficial NYSE datele sunt aproximative' : '') },
    judecata: pr.judecata };
}
export function citesteIstoric(text) { return String(text || '').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); }

export async function ruleaza({ radacina = '.', now = Date.now(), sursa = adu, fetchImpl = fetch, log = () => {}, istoric = [] } = {}) {
  const c = motorVerdict(radacina), MV = c.MarketVerdict, dateOf = (t) => c.DailySeries.date(t, 'America/New_York');
  const rv = amprentaRegulii(radacina), regula = regulaPentru(rv);   // 27.10.2026 (revizia F, 🟡8): regula din conținut, nu scrisă de mână
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
  const linie = adaugaLinie(istoric, linieZi(v, generat, regim, regula, rv)), toate = linie ? istoric.concat(linie) : istoric;
  const spy = raw.SPY ? (() => { try { return c.DailySeries.read(raw.SPY, 'SPY', now).bars; } catch { return []; } })() : [];
  const pr = proba(toate, spy, dateOf, c.ExchangeCalendar);
  // 27.10.2026 — contractul cu panourile (I-744): puterea, data primului verdict (sesiunile pierdute de robot o împing), judecata unică
  const aleRegulii = [...new Set(toate.filter(deRegula).map((l) => l.asOf))].sort(), cal = c.ExchangeCalendar, azi = dateOf(now);
  let asteptate = 0; try { asteptate = aleRegulii.length ? sesiuniIntre(cal, aleRegulii[0], aleRegulii.at(-1)) + 1 : 0; } catch { asteptate = 0; }
  const ctr = contractVerdict(pr, { cal, azi, notate: aleRegulii.length, asteptate });
  const j = { version: VERSIUNE, generat, asOf: v.asOf, label: v.label.id, score: v.score, citite: v.citite, fraza: v.fraza, rezumat: v.rezumat,
    indicatori: v.indicatori.map((x) => ({ id: x.id, name: x.name, value: x.value, score: x.score })), regim, rezultateMari, futures: v.futures, istoric: toate.slice(-60), proba: pr, surseLipsa: extra.erori,
    regula, amprentaRegula: rv, judecator: amprentaJudecator(), putere: ctr.putere, primulVerdict: ctr.primulVerdict, judecata: ctr.judecata };
  return { j, linie };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const vechi = existsSync(FISIER) ? (() => { try { return JSON.parse(readFileSync(FISIER, 'utf8')); } catch { return null; } })() : null;
  const istoric = existsSync(ISTORIC) ? citesteIstoric(readFileSync(ISTORIC, 'utf8')) : [];
  const { j, linie } = await ruleaza({ log: console.log, istoric });
  console.log(`Verdict ${j.asOf}: ${j.label} (scor ${j.score}, ${j.citite} din 6) · regim macro ${j.regim?.treapta?.cod || '—'} · mari ${j.rezultateMari.length} · istoric ${j.istoric.length} · ${j.proba.mesaj}`);
  if (j.citite < 3) { console.error('Prea puține surse citite; fișierul vechi rămâne.'); process.exit(1); }
  if (!process.argv.includes('--uscat')) { writeFileSync(FISIER, JSON.stringify(j) + '\n'); if (linie) appendFileSync(ISTORIC, JSON.stringify(linie) + '\n'); }
  // I-686: cursul BNR pe anul curent și pe cel trecut (pentru raportul fiscal din Jurnal); dacă BNR nu răspunde, fișierul vechi rămâne.
  try {
    // revizia 17.10: anii vechi din fișier rămân (raportul fiscal pe 2025 trebuie să meargă și în 2027); se reîmprospătează doar anul trecut și cel curent
    const an = new Date().getUTCFullYear(), curs = existsSync(CURS) ? (() => { try { return JSON.parse(readFileSync(CURS, 'utf8')).curs || {}; } catch { return {}; } })() : {};
    for (const y of [an - 1, an]) { const r = await fetch(`https://curs.bnr.ro/files/xml/years/nbrfxrates${y}.xml`, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) }); if (r.ok) Object.assign(curs, cursDin(await r.text())); }
    const n = Object.keys(curs).length; console.log('Cursul BNR: ' + n + ' zile');
    if (n > 50 && !process.argv.includes('--uscat')) writeFileSync(CURS, JSON.stringify({ sursa: 'curs.bnr.ro', generat: new Date().toISOString(), curs }) + '\n');
  } catch (e) { console.log('Cursul BNR ✗ ' + e.message); }
  // Discord: doar la schimbarea etichetei față de sesiunea precedentă notată
  if (process.env.DISCORD_WEBHOOK && !process.argv.includes('--uscat') && vechi?.label && vechi.asOf !== j.asOf && vechi.label !== j.label) {
    const T = { favorabil: 'Favorabil', neutru: 'Neutru', prudent: 'Prudent', defensiv: 'Defensiv' };
    try { const r = await fetch(process.env.DISCORD_WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: `**Verdictul pieței** · ${T[vechi.label] || vechi.label} → **${T[j.label] || j.label}** (după sesiunea ${j.asOf})\n${j.fraza}\nContext, nu semnal; detaliile pe Astăzi.` }), signal: AbortSignal.timeout(20000) }); console.log('Discord: ' + r.status); } catch (e) { console.log('Discord: ' + e.message); }
  }
}
