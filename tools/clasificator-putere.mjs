#!/usr/bin/env node
// I-671 (17.10.2026) — puterea probei înainte, calculată ÎNAINTE de primul rezultat al motorului în probă.
// Întrebarea: cu regula jurnalului (o zi = media acțiunilor ei; zile separate; test unilateral), cât de mare trebuie să fie
// câștigul votului față de reper ca proba să-l vadă cu putere 80%? Varianța zilnică vine din istoric: pe fiecare acțiune,
// motorul (același fișier ca pagina) se antrenează pe partea veche și votează pe partea de test, zi de zi; nimic din test
// nu intră în antrenare. Rezultatul e o ipoteză despre varianță, nu despre avantaj (avantajul se judecă doar înainte).
//   node tools/clasificator-putere.mjs --cache <dir> [--max 70] [--out docs/clasificator-putere-2026-10.json]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { motor } from './clasificator-date.mjs';

const ll = (p, y) => -Math.log(Math.max(1e-12, p[y]));
/** z unilateral pentru probabilitatea q (Acklam, eroare < 1e-9 — suficient pentru planificare). */
export function zq(q) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239], b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572], c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783], d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425; let x;
  if (q < lo) { const t = Math.sqrt(-2 * Math.log(q)); x = (((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1); }
  else if (q <= 1 - lo) { const t = q - 0.5, r = t * t; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * t / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  else { const t = Math.sqrt(-2 * Math.log(1 - q)); x = -(((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1); }
  return x;
}
/** Efectul minim detectabil al unui test unilateral pe n zile independente cu abaterea standard sd. */
export const mde = (sd, n, alfa, putere = 0.8) => (zq(1 - alfa) + zq(putere)) * sd / Math.sqrt(n);
/** Zilele de care e nevoie ca un efect e să fie văzut cu puterea cerută. */
export const zileNecesare = (sd, e, alfa, putere = 0.8) => Math.ceil(((zq(1 - alfa) + zq(putere)) * sd / e) ** 2);
const sdOf = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
/** Autocorelația la decalajul k (pentru varianța pe zile suprapuse, Newey-West cu ponderi Bartlett). */
function neweyWest(xs, lag) { const n = xs.length, m = mean(xs), g = (k) => { let s = 0; for (let i = k; i < n; i++) s += (xs[i] - m) * (xs[i - k] - m); return s / n; }; let v = g(0); for (let k = 1; k <= lag; k++) v += 2 * (1 - k / (lag + 1)) * g(k); return v; }

/** Diferențele zilnice (reper − vot) pe zilele de test; o zi = media acțiunilor care au rând în ziua aceea. */
export function zilnic(c, serii, { now = Date.now(), spec = {}, log = () => {} } = {}) {
  const C = c.HoldingsClassifier, zi = (t) => c.DailySeries.date(t, 'America/New_York'), peZi = new Map();
  for (const [s, bars] of Object.entries(serii)) {
    try {
      const b = c.HoldingsBars.prepare(bars).bars, d = C.dataset(b, now, spec), parts = C.split(d.rows), f = C.fitModels(parts, {}), pr = C.prior(parts.train);
      for (const r of parts.test) { const p = f.vote.predict(r.x), k = zi(r.t); if (!peZi.has(k)) peZi.set(k, []); peZi.get(k).push({ fr: ll(pr, r.y) - ll(p, r.y), mo: ll(C.momentum(r.x), r.y) - ll(p, r.y), long: p[2], pnl: r.pnl }); }
      log(s + ' ✓ ' + parts.test.length);
    } catch (e) { log(s + ' ✗ ' + (e && e.message)); }
  }
  return [...peZi.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([z, rs]) => {
    // Clasamentul (aceeași regulă ca jurnalul): primele 10 după „Long”, față de media zilei, după costuri (pnl din dataset).
    const cu = rs.filter((r) => Number.isFinite(r.pnl)), top = cu.slice().sort((a, b) => b.long - a.long).slice(0, 10);
    return { zi: z, n: rs.length, fr: mean(rs.map((r) => r.fr)), mo: mean(rs.map((r) => r.mo)), cl: cu.length >= 20 ? mean(top.map((r) => r.pnl)) - mean(cu.map((r) => r.pnl)) : null };
  });
}

/** Rezumatul puterii: sd pe zile separate, efectul minim detectabil la 30 de zile și pe toate zilele (Newey-West). */
export function putere(zile, { distanta = 6, n = 30, alfa = 0.025, castig = 0.02, minim = 20 } = {}) {
  const z = zile.filter((x) => x.n >= minim), sep = z.filter((_, i) => i % distanta === 0), out = {};
  for (const k of ['fr', 'mo', 'cl']) {
    const xs = sep.map((x) => x[k]).filter(Number.isFinite), all = z.map((x) => x[k]).filter(Number.isFinite);
    if (xs.length < 3) { out[k] = null; continue; }
    const sd = sdOf(xs), lrv = neweyWest(all, distanta - 1);
    // Pe toate zilele: varianța pe termen lung / zi ⇒ câte zile „independente” valorează o zi notată.
    const sdAll = Math.sqrt(Math.max(lrv, 1e-12));
    out[k] = { zileSeparate: xs.length, medieIstoric: mean(xs), sd, mde30: mde(sd, n, alfa), zilePentruCastig: zileNecesare(sd, castig, alfa), toateZilele: { zile: all.length, sdLungTermen: sdAll, zileEchivalente: n * distanta, mdeTot: mde(sdAll, n * distanta, alfa), zilePentruCastig: zileNecesare(sdAll, castig, alfa) } };
  }
  return { distanta, n, alfa, castig, minim, zileTotal: z.length, ...out };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const dir = arg('--cache'), max = Number(arg('--max', 70)), out = arg('--out'), c = motor('.'), serii = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort().slice(0, max)) { const j = JSON.parse(readFileSync(dir + '/' + f, 'utf8')); serii[f.replace(/\.json$/, '')] = j.bars; }
  const now = Date.parse(arg('--now', new Date().toISOString())), t0 = Date.now();
  const z5 = zilnic(c, serii, { now, log: console.log }), r5 = putere(z5);
  const z20 = zilnic(c, serii, { now, spec: { horizon: 20, atr: 2 }, log: console.log }), r20 = putere(z20, { distanta: 21 });
  const rez = { generat: new Date().toISOString(), motor: c.HoldingsClassifier.VERSION, simboluri: Object.keys(serii).length, minute: Math.round((Date.now() - t0) / 600) / 100, tinta5: r5, tinta20: r20 };
  console.log(JSON.stringify(rez, null, 2)); if (out) writeFileSync(out, JSON.stringify(rez, null, 2) + '\n');
}
