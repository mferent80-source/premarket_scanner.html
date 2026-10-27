// I-643 + I-647 (16.10.2026) — jurnalul de noapte al votului: robotul își notează votul pe fiecare acțiune, îl verifică singur
// pe închiderile reale și scrie un bilanț. Pragul e scris ÎNAINTEA oricărui rezultat (protocolul: docs/clasificator-protocol.md).
// 17.10.2026 — protocolul revizuit înaintea primului rezultat al motorului în probă (I-671, puterea calculată pe istoric; revizia
//   de cod a arătat prin simulare că Newey-West cu decalaj = orizontul respinge în 9–12% din cazuri la 5% nominal ⇒ înlocuit):
//   zilele verificate se împart în 8 perioade egale, cu h−1 zile lăsate deoparte între ele (orizonturile nu se suprapun);
//   testul t pe cele 8 medii (7 grade de libertate) ține 4–6% la 5% nominal în simulare;
//   verdictul se dă O SINGURĂ dată, pe primele ≥180 de zile verificate la ținta de 5 sesiuni și ≥252 la ținta de 20 (eșantion fix:
//   zilele de după verdict sunt doar descriptive, ca recalcularea zilnică să nu umfle eroarea);
//   „ține” = eroarea votului mai mică cu ≥0,02 decât AMBELE repere (frecvențele claselor și momentum), cu p<α față de fiecare;
//   altfel „nu ține”. Pe regim (SPY peste / sub media de 200 de zile) același calcul, cu corecția Holm pentru cele 2 felii.
// Jurnalul (I-660 / I-662 / I-672 / I-674): un dosar pe versiunea motorului, câte un fișier pe lună pentru voturi și pentru
// rezultate; fișierele doar cresc. Se judecă doar versiunea în probă (PROBA); celelalte rămân istoric sau umbră.
// 27.10.2026 (auditul F, I-743): codul care JUDECĂ e amprentat (`amprentaJudecator`, rândul în docs/clasificator-versiuni.md); contractul cu
// panourile (`contractClasificator`: putere / primulVerdict / judecata). Funcțiile noi stau la coada fișierului, în afara judecătorului.
import { readFileSync } from 'node:fs';
import { inchidere, amprentaText, dupaSesiuni, judecata as judecataDin } from '../lib/proba-contract.mjs';
export const DIR = 'candidate-engine/generated/clasificator-jurnal';
export const ISTORIC = 'candidate-engine/generated/clasificator-istoric.jsonl'; // fișierul vechi (până la 17.10), mutat în DIR
export const PROBA = 'holdings-clf-v5';
export const PRAG = Object.freeze({ zileMinime: 180, zileMinime20: 252, grupe: 8, castig: 0.02, alfa: 0.05, marja: 0.1, top: 10, minimZi: 20, asteptare: 10, rezerva: 0.05 });
// I-649 (scris înaintea datelor): primele 10 după probabilitatea „Long” a votului (egalitate ⇒ alfabetic), față de media universului
// în aceeași zi, după costuri; doar zile cu ≥20 de acțiuni verificate; „ordonează” = diferența medie > 0 cu p<α după numărul minim de zile.
const TINTE = [{ h: 5, prag: 1, cheie: 'voturi' }, { h: 20, prag: 2, cheie: 'voturi20' }];
const r4 = (v) => Math.round(v * 1e4) / 1e4;
// I-659: aceeași regulă de cost ca motorul (HoldingsClassifier.costFor); testul le compară.
export function costFor(bars, i) { let s = 0, n = 0; for (let k = Math.max(0, i - 19); k <= i; k++) { s += bars[k].c * bars[k].v; n++; } const dv = n ? s / n : 0; return 0.3 + (dv >= 1e9 ? 0.05 : dv >= 1e8 ? 0.1 : dv >= 2e7 ? 0.3 : 0.8); }

/** Regimul pieței în ziua votului (închiderea SPY față de media ei de 200 de zile, ambele știute la închidere). */
export function regim(spy, asOf, dateOf) {
  if (!Array.isArray(spy)) return null; const i = spy.findIndex((b) => dateOf(b.t) === asOf); if (i < 199) return null;
  let s = 0; for (let k = i - 199; k <= i; k++) s += spy[k].c; return spy[i].c > s / 200 ? 'sus' : 'jos';
}
/** Linia zilei din fișierul robotului; doar ce trebuie la verificare (votul înghețat, închiderea, ATR, reperele). */
function voturiDin(entries) {
  const voturi = {};
  for (const [s, e] of Object.entries(entries || {})) {
    const v = e.algos?.vote; if (!v || !Number.isFinite(e.close) || !Number.isFinite(e.atrPct) || !Array.isArray(e.prior)) continue;
    voturi[s] = { k: v.classIndex, p: v.support.map(r4), st: e.state, c: e.close, a: e.atrPct, r5: e.ret5, pr: e.prior.map(r4) };
  }
  return voturi;
}
export function ziua(j, reg) {
  const l = { asOf: j.asOf, generat: j.generat, motor: j.motor, regim: reg || null, voturi: voturiDin(j.entries) };
  if (j.tinta20?.entries) l.voturi20 = voturiDin(j.tinta20.entries); // I-650
  return l;
}
/** Prima notare a fiecărei acțiuni rămâne (votul e înghețat). O rulare ulterioară din aceeași zi adaugă doar acțiunile care
 *  lipseau (linie de completare, separată, cu ora ei — contează doar dacă și ea e la timp). Întoarce { linii, nou }. */
export function adauga(linii, linie) {
  if (!linie || !linie.asOf || !linie.motor || !Object.keys(linie.voturi || {}).length) return { linii, nou: [] };
  const ale = linii.filter((l) => l.asOf === linie.asOf && l.motor === linie.motor);
  if (!ale.length) return { linii: linii.concat(linie), nou: [linie] };
  const are = (ch) => new Set(ale.flatMap((l) => Object.keys(l[ch] || {}))), rest = (ch) => { const a = are(ch); return Object.fromEntries(Object.entries(linie[ch] || {}).filter(([s]) => !a.has(s))); };
  const v = rest('voturi'), v20 = rest('voturi20'); if (!Object.keys(v).length && !Object.keys(v20).length) return { linii, nou: [] };
  const c = { ...linie, voturi: v, ...(linie.voturi20 ? { voturi20: v20 } : {}), completare: true };
  return { linii: linii.concat(c), nou: [c] };
}
export function citeste(text) { return String(text || '').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); }
const momentum = (r5, a) => { const d = r5 / a, k = d <= -1 ? 0 : d >= 1 ? 2 : 1; return [0, 1, 2].map((i) => (i === k ? 0.8 : 0.1)); };

/* ---------- fișierele jurnalului (I-662): DIR/<motor>/voturi-AAAA-LL.jsonl și rezultate-AAAA-LL.jsonl, luna votului ---------- */
export const caleVoturi = (motor, asOf) => `${DIR}/${motor}/voturi-${asOf.slice(0, 7)}.jsonl`;
export const caleRezultate = (motor, asOf) => `${DIR}/${motor}/rezultate-${asOf.slice(0, 7)}.jsonl`;
/** Citește tot jurnalul (toate motoarele, toate lunile). fs = { existsSync, readdirSync, readFileSync }. */
export function incarca(fs, radacina = '.') {
  const voturi = [], rezultate = [], baza = radacina + '/' + DIR;
  if (!fs.existsSync(baza)) return { voturi, rezultate };
  for (const motor of fs.readdirSync(baza).sort()) {
    let fis; try { fis = fs.readdirSync(baza + '/' + motor).sort(); } catch { continue; }
    for (const f of fis) {
      const linii = citeste(fs.readFileSync(baza + '/' + motor + '/' + f, 'utf8'));
      if (/^voturi-\d{4}-\d{2}\.jsonl$/.test(f)) for (const l of linii) voturi.push({ ...l, motor: l.motor || motor });
      else if (/^rezultate-\d{4}-\d{2}\.jsonl$/.test(f)) for (const r of linii) rezultate.push({ ...r, m: r.m || motor });
    }
  }
  voturi.sort((a, b) => (a.asOf < b.asOf ? -1 : a.asOf > b.asOf ? 1 : a.motor < b.motor ? -1 : 1));
  return { voturi, rezultate };
}
/** Ce se adaugă în fiecare fișier (doar adăugare la coadă — fișierele vechi nu se rescriu niciodată). */
export function deScris({ voturi = [], rezultate = [] }) {
  const out = new Map(), pune = (p, o) => out.set(p, (out.get(p) || '') + JSON.stringify(o) + '\n');
  for (const l of voturi) pune(caleVoturi(l.motor, l.asOf), l);
  for (const r of rezultate) pune(caleRezultate(r.m, r.asOf), r);
  return out;
}

/* ---------- rezultatele înghețate (I-672): notate în noaptea în care se încheie orizontul ---------- */
/** Rezultatul unui vot pe seria b (aceeași acțiune), din ziua i până la ziua `end`. Toate mărimile sunt relative ⇒ un split
 *  (prețuri rescalate) nu schimbă rezultatul; raportul față de închiderea notată se păstrează ca urmă (r). */
function rezultat(b, i, v, end, prag) {
  const r = b[i].c / v.c, move = (b[end].c / b[i].c - 1) * 100 / v.a, y = move <= -prag ? 0 : move >= prag ? 2 : 1;
  const entry = b[i + 1].o, stop = entry - v.a / 100 * b[i].c; let out = null;
  for (let k = i + 1; k <= end && out === null; k++) { if (k > i + 1 && b[k].o <= stop) out = b[k].o; else if (b[k].l <= stop) out = stop; }
  return { y, pnl: r4(((out ?? b[end].c) / entry - 1) * 100 - costFor(b, i)), ...(Math.abs(r - 1) > 1e-6 ? { r: r4(r) } : {}) };
}
const cheieR = (m, asOf, h, s) => m + '|' + asOf + '|' + h + '|' + s;
/** Rezultatele noi: voturile al căror orizont s-a încheiat și nu au încă rezultat. sesiuniDupa(asOf) = câte sesiuni încheiate
 *  au trecut de la vot (din calendar). Regulă scrisă dinainte: după orizont + 10 sesiuni fără date, votul se notează
 *  „nejudecat” cu motivul; dacă seria s-a oprit (acțiune delistată), ieșirea e la ultima închidere cunoscută. */
export function incheie(linii, rezultate, serii, dateOf, { sesiuniDupa = () => Infinity } = {}) {
  const fac = new Set(rezultate.map((r) => cheieR(r.m, r.asOf, r.h, r.s))), out = [];
  for (const L of linii) {
    for (const { h, prag, cheie } of TINTE) {
      const voturi = L[cheie]; if (!voturi) continue; let trecute = null;
      for (const [s, v] of Object.entries(voturi)) {
        if (fac.has(cheieR(L.motor, L.asOf, h, s))) continue;
        const b = serii[s], i = b ? b.findIndex((x) => dateOf(x.t) === L.asOf) : -1, baza = { m: L.motor, asOf: L.asOf, h, s };
        if (i >= 0 && i + h < b.length) { out.push({ ...baza, ...rezultat(b, i, v, i + h, prag) }); continue; }
        if (trecute === null) trecute = sesiuniDupa(L.asOf);
        if (trecute <= h + PRAG.asteptare) continue; // încă nu s-a încheiat sau datele întârzie: mai așteaptă
        if (i >= 0 && i + 1 < b.length) out.push({ ...baza, ...rezultat(b, i, v, b.length - 1, prag), oprit: dateOf(b.at(-1).t) });
        else out.push({ ...baza, nejudecat: !b ? 'fără serie (delistată sau sursă indisponibilă)' : i < 0 ? 'ziua votului lipsește din serie' : 'seria s-a oprit în ziua votului' });
      }
    }
  }
  return out;
}
/** Zilele de judecat: votul înghețat + rezultatul înghețat; o zi = acțiunile ei cu rezultat. */
export function zileDin(linii, rezultate, { h = 5, cheie = 'voturi' } = {}) {
  const R = new Map(rezultate.filter((r) => r.h === h).map((r) => [cheieR(r.m, r.asOf, r.h, r.s), r])), peZi = new Map();
  for (const L of linii) {
    const z = peZi.get(L.asOf) || { asOf: L.asOf, regim: L.regim, rows: [] }; if (!z.regim && L.regim) z.regim = L.regim;
    for (const [s, v] of Object.entries(L[cheie] || {})) { const x = R.get(cheieR(L.motor, L.asOf, h, s)); if (x && !x.nejudecat) z.rows.push({ s, y: x.y, p: v.p, pr: v.pr, mom: momentum(v.r5, v.a), k: v.k, pnl: x.pnl }); }
    peZi.set(L.asOf, z);
  }
  return [...peZi.values()].filter((z) => z.rows.length).sort((a, b) => (a.asOf < b.asOf ? -1 : 1));
}

/* ---------- testul: mediile pe 8 perioade, cu pauze între ele (I-671, după revizia din 17.10) ---------- */
// Repartiția Student (funcția beta incompletă regularizată, fracție continuă — Numerical Recipes); suficientă pentru p-valori.
function lgamma(x) { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const k of c) s += k / ++y; return -t + Math.log(2.5066282746310005 * s / x); }
function betacf(a, b, x) { let c = 1, d = 1 - (a + b) * x / (a + 1); d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d); let h = d; for (let m = 1; m <= 200; m++) { const m2 = 2 * m; let aa = m * (b - m) * x / ((a - 1 + m2) * (a + m2)); d = 1 + aa * d; d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d); c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30; h *= d * c; aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + 1 + m2)); d = 1 + aa * d; d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d); c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30; const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-12) break; } return h; }
function ibeta(a, b, x) { if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x)); return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b; }
/** P(T ≤ t) pentru Student cu df grade de libertate. */
export function tcdf(t, df) { const x = df / (df + t * t), q = 0.5 * ibeta(df / 2, 0.5, x); return t >= 0 ? 1 - q : q; }
/** Cuantila Student (bisecție) — pentru calculul puterii. */
export function tq(p, df) { let lo = -50, hi = 50; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (tcdf(m, df) < p) lo = m; else hi = m; } return (lo + hi) / 2; }
/** Test unilateral (media > 0) pe zile suprapuse: zilele se împart în `grupe` perioade egale, consecutive, cu `pauza` zile lăsate
 *  deoparte între ele (pauza = orizont − 1 ⇒ rezultatele a două perioade nu se suprapun); test t pe mediile perioadelor. */
export function test(xs, { grupe = PRAG.grupe, pauza = 0 } = {}) {
  const n = xs.length, L = Math.floor((n - pauza * (grupe - 1)) / grupe);
  if (L < 2) return { n, medie: n ? xs.reduce((a, b) => a + b, 0) / n : null, p: 1, grupe: 0 };
  const ms = []; for (let j = 0; j < grupe; j++) { const st = j * (L + pauza); let s = 0; for (let i = st; i < st + L; i++) s += xs[i]; ms.push(s / L); }
  const m = ms.reduce((a, b) => a + b, 0) / grupe, v = ms.reduce((a, b) => a + (b - m) ** 2, 0) / (grupe - 1);
  return { n, medie: m, p: v <= 1e-18 ? (m > 0 ? 0 : 1) : 1 - tcdf(m / Math.sqrt(v / grupe), grupe - 1), grupe, zilePeGrupa: L };
}
function bani(zile) { const xs = zile.map((z) => z.rows.filter((r) => { const s = r.p.slice().sort((a, b) => b - a); return r.k === 2 && s[0] - s[1] >= PRAG.marja; }).map((r) => r.pnl)).filter((x) => x.length).map((x) => x.reduce((a, b) => a + b, 0) / x.length); return { zile: xs.length, medie: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null }; }
const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function judeca(zile, { alfa = PRAG.alfa, minim = PRAG.zileMinime, pauza = 0 } = {}) {
  const n = zile.length, fix = n >= minim ? zile.slice(0, minim) : zile, dupa = zile.slice(fix.length); // verdictul: o singură dată, pe primele `minim` zile
  const ll = (p, y) => -Math.log(Math.max(1e-12, p[y])), d = (zs, ref) => zs.map((z) => z.rows.reduce((s, r) => s + ll(r[ref], r.y) - ll(r.p, r.y), 0) / z.rows.length);
  const o = { pauza }, f = test(d(fix, 'pr'), o), m = test(d(fix, 'mom'), o);
  const verdict = n < minim ? 'in-proba' : f.medie >= PRAG.castig && m.medie >= PRAG.castig && f.p < alfa && m.p < alfa ? 'tine' : 'nu-tine';
  return { zileTest: n, zileMinime: minim, verdict, ...(verdict !== 'in-proba' ? { verdictPe: [fix[0].asOf, fix.at(-1).asOf] } : {}), vsFrecvente: f, vsMomentum: m, bani: bani(fix),
    dupaVerdict: dupa.length ? { zile: dupa.length, vsFrecvente: media(d(dupa, 'pr')), vsMomentum: media(d(dupa, 'mom')) } : null };
}
export function primele(rows, n = PRAG.top) { return rows.slice().sort((a, b) => b.p[2] - a.p[2] || (a.s < b.s ? -1 : 1)).slice(0, n); }
function clasament(zile, { alfa = PRAG.alfa, minim = PRAG.zileMinime, pauza = 0 } = {}) {
  const toate = zile.filter((z) => z.rows.length >= PRAG.minimZi).map((z) => { const top = primele(z.rows), m = (xs) => xs.reduce((a, r) => a + r.pnl, 0) / xs.length; return m(top) - m(z.rows); });
  const d = toate.length >= minim ? toate.slice(0, minim) : toate; // eșantion fix, ca la ținte
  const t = { ...test(d, { pauza }), n: toate.length }, verdict = t.n < minim ? 'in-proba' : t.medie > 0 && t.p < alfa ? 'ordoneaza' : 'nu-ordoneaza';
  const mesaj = verdict === 'in-proba' ? `Clasamentul: ${t.n} din ${minim} de zile verificate; verdictul vine după.` : verdict === 'ordoneaza' ? 'Clasamentul ordonează: primele 10 bat media universului după costuri, pe zile noi.' : 'Clasamentul nu ordonează: primele 10 nu bat media universului cu pragul scris dinainte.';
  return { zileTest: t.n, zileMinime: minim, verdict, medie: t.medie, p: t.p, alfa, mesaj, dupaVerdict: toate.length > d.length ? { zile: toate.length - d.length, medie: media(toate.slice(d.length)) } : null };
}
/* Bilanțul lunar (descriptiv: toate zilele verificate, pe luna votului) — nu e verdict. */
export function lunar(zile) {
  const ll = (p, y) => -Math.log(Math.max(1e-12, p[y])), luni = new Map();
  for (const z of zile) { const k = z.asOf.slice(0, 7); if (!luni.has(k)) luni.set(k, []); luni.get(k).push(z); }
  return [...luni.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([luna, zs]) => {
    const m = (f) => zs.reduce((s, z) => s + z.rows.reduce((a, r) => a + f(r), 0) / z.rows.length, 0) / zs.length;
    const cl = zs.filter((z) => z.rows.length >= PRAG.minimZi).map((z) => { const t = primele(z.rows), mm = (xs) => xs.reduce((a, r) => a + r.pnl, 0) / xs.length; return mm(t) - mm(z.rows); });
    return { luna, zile: zs.length, vsFrecvente: m((r) => ll(r.pr, r.y) - ll(r.p, r.y)), vsMomentum: m((r) => ll(r.mom, r.y) - ll(r.p, r.y)), clasament: cl.length ? cl.reduce((a, b) => a + b, 0) / cl.length : null };
  });
}
/** Bilanțul: pe toate zilele verificate + pe regim (Holm pe 2 felii: prima la α/2, a doua la α). */
export function bilant(linii, zileVerificate, { alfa = PRAG.alfa, minim = PRAG.zileMinime, pauza = 0, alfaClasament = PRAG.alfa } = {}) {
  const o = { minim, pauza }, tot = judeca(zileVerificate, { ...o, alfa }), felii = {};
  for (const r of ['sus', 'jos']) felii[r] = judeca(zileVerificate.filter((z) => z.regim === r), { ...o, alfa: alfa / 2 });
  const ordine = Object.entries(felii).filter(([, x]) => x.verdict !== 'in-proba').sort((a, b) => Math.max(a[1].vsFrecvente.p, a[1].vsMomentum.p) - Math.max(b[1].vsFrecvente.p, b[1].vsMomentum.p)); // „ambele repere” ⇒ decide p-ul mai mare
  if (ordine[1] && ordine[0][1].verdict === 'tine') felii[ordine[1][0]] = judeca(zileVerificate.filter((z) => z.regim === ordine[1][0]), { ...o, alfa });
  const mesaj = tot.verdict === 'in-proba' ? `În probă: ${tot.zileTest} din ${minim} de zile verificate; verdictul vine după.` : tot.verdict === 'tine' ? 'Ține: votul bate ambele repere pe zile noi, după prag și test.' : 'Nu ține: pe zile noi votul nu bate ambele repere cu pragul scris dinainte.';
  return { prag: PRAG, alfa, zileNotate: new Set(linii.map((l) => l.asOf)).size, zileVerificate: zileVerificate.length, ...tot, mesaj, regim: felii, clasament: clasament(zileVerificate, { ...o, alfa: alfaClasament }), lunar: lunar(zileVerificate) };
}

/* ---------- integritatea probei: versiunea, notarea la timp, zilele lipsă (I-660 / I-668 / I-670) ---------- */
const US = { timezone: 'America/New_York', closeMinutes: 960 }, deschisa = (cal, d) => !['closed', 'unknown'].includes(cal.session('US', d).state);
/** Linia contează doar dacă a fost notată înainte de deschiderea sesiunii următoare (altfel intrarea ar fi deja în trecut). */
export function laTimp(L, cal) { if (!cal) return true; const t = Date.parse(L.generat); if (!Number.isFinite(t)) return false; return cal.beforeNextOpen({ ...US, asOf: L.asOf }, t) !== false; } // null (an fără calendar oficial) ⇒ numărat, dar raportat ca neverificat
/** true / false / null (null = calendarul oficial nu acoperă anul; garda din suită cere extinderea lui din timp). */
export function laTimpVerificat(L, cal) { if (!cal) return null; const t = Date.parse(L.generat); if (!Number.isFinite(t)) return false; return cal.beforeNextOpen({ ...US, asOf: L.asOf }, t); }
/** Sesiunile încheiate de la `de` (inclusiv) până la ultima încheiată acum, după calendarul oficial US. */
export function sesiuni(cal, de, now) {
  if (!cal || !de) return []; let ultima; try { ultima = cal.latest(now, 'US').day; } catch { return []; }
  const out = []; let d = deschisa(cal, de) ? de : cal.next(de, 'US')?.day;
  for (let k = 0; d && d <= ultima && k < 800; k++) { out.push(d); d = cal.next(d, 'US')?.day; }
  return out;
}
/** Câte sesiuni încheiate au trecut după ziua votului (pentru așteptarea rezultatelor). */
export function sesiuniDupa(cal, now) {
  const memo = new Map(), lucratoare = (asOf) => { let k = 0, t = Date.parse(asOf + 'T12:00:00Z') + 86400000; for (; t < now - 20 * 3600000 && k < 2000; t += 86400000) { const w = new Date(t).getUTCDay(); if (w > 0 && w < 6) k++; } return k; };
  return (asOf) => { if (!cal) return Infinity; if (!memo.has(asOf)) { const s = sesiuni(cal, asOf, now); memo.set(asOf, s.length ? Math.max(0, s.filter((d) => d > asOf).length) : lucratoare(asOf)); } return memo.get(asOf); }; // fără calendar oficial pentru an ⇒ zile lucrătoare
}
/** Rezumatul integrității pentru motorul în probă. */
export function integritate(linii, rezultate, { motor = PROBA, cal = null, now = Date.now(), faraUltima = false } = {}) {
  const ale = linii.filter((L) => L.motor === motor && !L.completare), bune = ale.filter((L) => laTimp(L, cal)), notate = new Set(bune.map((L) => L.asOf));
  let lipsa = ale.length ? sesiuni(cal, ale.map((L) => L.asOf).sort()[0], now).filter((d) => !notate.has(d)) : [];
  const din = ale.length ? ale.map((L) => L.asOf).sort()[0] : null, ultima = sesiuni(cal, din, now).at(-1);
  if (faraUltima && ultima) lipsa = lipsa.filter((d) => d !== ultima); // motorul în probă rulează în job paralel: ziua de azi vine separat
  const neverificate = ale.filter((L) => laTimpVerificat(L, cal) === null && cal).length;
  const mele = rezultate.filter((r) => r.m === motor), nej = mele.filter((r) => r.nejudecat), motive = {};
  for (const r of nej) motive[r.nejudecat] = (motive[r.nejudecat] || 0) + 1;
  const alte = [...new Set(linii.filter((L) => L.motor !== motor).map((L) => L.motor))];
  return { motor, din, alteVersiuni: alte, zileAlte: new Set(linii.filter((L) => L.motor !== motor).map((L) => L.motor + L.asOf)).size, tarzii: ale.length - bune.length, neverificate, lipsa: lipsa.slice(-20), lipsaTotal: lipsa.length,
    rezultate: mele.length, nejudecate: nej.length, motive, oprite: mele.filter((r) => r.oprit).length, rezerve: mele.length ? nej.length / mele.length > PRAG.rezerva : false };
}
const zz = (d) => d.slice(8, 10) + '.' + d.slice(5, 7);
/** Nota de integritate, în cuvinte (Planuri, Health, Discord, raport). */
export function notaIntegritate(x) {
  if (!x) return '';
  const p = [];
  if (x.din) p.push(`Numărătoarea pentru ${x.motor} a pornit la ${zz(x.din)}` + (x.zileAlte ? `; ${x.zileAlte} ${x.zileAlte === 1 ? 'zi' : 'zile'} din ${x.alteVersiuni.join(', ')} ${x.zileAlte === 1 ? 'rămâne' : 'rămân'} doar istoric.` : '.'));
  else p.push(`Motorul în probă (${x.motor}) nu are încă nicio zi notată.`);
  if (x.lipsaTotal) p.push(`Sesiuni nenotate: ${x.lipsaTotal} (${x.lipsa.map(zz).join(', ')}).`);
  if (x.tarzii) p.push(`${x.tarzii} ${x.tarzii === 1 ? 'zi notată' : 'zile notate'} după deschiderea sesiunii următoare — nu intră în verdict.`);
  if (x.neverificate) p.push(`${x.neverificate} ${x.neverificate === 1 ? 'zi notată' : 'zile notate'} într-un an fără calendar oficial NYSE — ora notării nu poate fi verificată.`);
  if (x.nejudecate) p.push(`Voturi nejudecate: ${x.nejudecate} din ${x.rezultate}` + (x.rezerve ? ' — peste 5%, verdictul are rezerve.' : '.'));
  return p.join(' ');
}
/** Ultimele n sesiuni: notată sau nu, la timp, câte voturi (Health, I-670). */
export function nopti(linii, cal, now, motor = PROBA, n = 10) {
  let d; try { d = cal.latest(now, 'US').day; } catch { return []; }
  const zile = [];
  for (let k = 0; k < n && d; k++) { zile.unshift(d); let p = d, gasit = null; for (let i = 0; i < 10 && !gasit; i++) { p = cal.add(p, -1); if (deschisa(cal, p)) gasit = p; } d = gasit; }
  return zile.map((z) => { const L = linii.find((x) => x.motor === motor && x.asOf === z); return { zi: z, notat: !!L, laTimp: L ? laTimp(L, cal) : null, voturi: L ? Object.keys(L.voturi || {}).length : 0 }; });
}

/** I-657: mesajul zilnic există DOAR când un verdict e pozitiv (ține / ordonează); altfel null (robotul tace). */
export function mesajZilnic(j) {
  const poz = [['ținta de 5 sesiuni', j.jurnal?.verdict === 'tine'], ['clasamentul pe 5 sesiuni', j.jurnal?.clasament?.verdict === 'ordoneaza'], ['ținta de 20 de sesiuni', j.jurnal20?.verdict === 'tine'], ['clasamentul pe 20 de sesiuni', j.jurnal20?.clasament?.verdict === 'ordoneaza']].filter((x) => x[1]).map((x) => x[0]);
  if (!poz.length) return null;
  const b = new Set((j.clasament20 || []).slice(0, 10).map((x) => x.s));
  const top = (j.clasament || []).slice(0, 10).map((x) => x.s + (b.has(x.s) ? ' ★' : '')).join(', ');
  return `**Clasificator · ${j.asOf}** — verdict pozitiv pe: ${poz.join(', ')}.\nPrimele 10 (5 sesiuni): ${top || '—'}.\nInformativ, nu ordin; verdictul se poate schimba — robotul trimite mesaj și atunci.`;
}
const VERDICTE = (x) => [x?.jurnal?.verdict, x?.jurnal?.clasament?.verdict, x?.jurnal20?.verdict, x?.jurnal20?.clasament?.verdict], NUME = ['ținta de 5', 'clasamentul pe 5', 'ținta de 20', 'clasamentul pe 20'];
/** Schimbările de verdict (toate patru) față de rularea trecută, pentru un singur mesaj de schimbare. */
export function schimbari(vechi, j) {
  const a = VERDICTE(vechi), b = VERDICTE(j);
  return NUME.map((nume, i) => (a[i] && b[i] && a[i] !== b[i] ? `${nume}: ${a[i]} → ${b[i]}` : null)).filter(Boolean);
}
/** I-663: raportul la verdict — doar în noaptea în care o probă iese din „în probă”. Întoarce textul Markdown sau null. */
export function raportVerdict(vechi, j) {
  const a = VERDICTE(vechi), b = VERDICTE(j), noi = NUME.filter((_, i) => b[i] && b[i] !== 'in-proba' && (!a[i] || a[i] === 'in-proba'));
  if (!noi.length) return null;
  const f = (v, d = 3) => (v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : '') + v.toLocaleString('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const pv = (v) => (v == null ? '—' : v < 0.001 ? '<0,001' : v.toLocaleString('ro-RO', { maximumFractionDigits: 3 }));
  const tinta = (z, nume) => z ? [`### ${nume}`, '', `- **Verdict:** ${z.verdict} — ${z.mesaj}`, `- Zile verificate: ${z.zileTest}; verdictul s-a dat o singură dată, pe primele ${z.zileMinime}` + (z.verdictPe ? ` (${z.verdictPe[0]} – ${z.verdictPe[1]})` : '') + `; notate: ${z.zileNotate}.`,
    `- Votul față de frecvențe: ${f(z.vsFrecvente?.medie)} (p ${pv(z.vsFrecvente?.p)}) · față de momentum: ${f(z.vsMomentum?.medie)} (p ${pv(z.vsMomentum?.p)}) · α ${pv(z.alfa)} · prag ${f(PRAG.castig, 2)}.`,
    `- Bani (Long cu marjă, după costuri): ${z.bani?.zile || 0} zile, media ${z.bani?.medie == null ? '—' : f(z.bani.medie, 2) + '%'} pe tranzacție.`,
    `- Pe regim: peste media de 200 de zile ${z.regim?.sus?.verdict || '—'} (${z.regim?.sus?.zileTest || 0} zile) · sub ${z.regim?.jos?.verdict || '—'} (${z.regim?.jos?.zileTest || 0} zile).`,
    `- Clasamentul: ${z.clasament?.verdict || '—'} — ${z.clasament?.mesaj || ''} (diferența medie ${z.clasament?.medie == null ? '—' : f(z.clasament.medie, 2) + '%'}, p ${pv(z.clasament?.p)}).`, ''].join('\n') : '';
  return [`# Clasificatorul — verdict ${j.asOf}`, '', `Scris automat de robot în noaptea în care proba a ieșit din „în probă” pe: **${noi.join(', ')}**.`,
    `Motorul judecat: **${j.jurnal?.integritate?.motor || PROBA}** · motorul paginii: ${j.motor} · reguli: [protocolul](clasificator-protocol.md) (praguri fixate dinainte; registrul încercărilor e acolo).`, '',
    '## Integritatea probei', '', notaIntegritate(j.jurnal?.integritate) || '—', '', '## Ținte', '', tinta(j.jurnal, 'Ținta de 5 sesiuni (±1 ATR)'), tinta(j.jurnal20, 'Ținta de 20 de sesiuni (±2 ATR)'),
    '## Ce înseamnă', '', 'Un verdict „ține” / „ordonează” e o dovadă pe zile noi, nu o promisiune; costurile reale și execuția pot diferi. Un „nu ține” închide direcția pentru acest motor: o versiune nouă pornește o probă nouă, de la zero.', ''].join('\n');
}
/** I-650: două ținte ⇒ Holm pe 2: amândouă la α/2; dacă una „ține”, cealaltă se rejudecă la α. Se judecă doar motorul în probă,
 *  doar zilele notate la timp, pe rezultatele înghețate. */
export function bilantDoua(linii, rezultate, { motor = PROBA, cal = null, now = Date.now(), faraUltima = false } = {}) {
  const bune = linii.filter((L) => L.motor === motor && laTimp(L, cal));
  const z5 = zileDin(bune, rezultate), z20 = zileDin(bune, rezultate, { h: 20, cheie: 'voturi20' }), o5 = { minim: PRAG.zileMinime, pauza: 4 }, o20 = { minim: PRAG.zileMinime20, pauza: 19 }; // pauza = orizont − 1
  const A = PRAG.alfa, run = (z, o, aT, aC) => bilant(bune, z, { ...o, alfa: aT, alfaClasament: aC });
  let a5 = A / 2, a20 = A / 2, c5 = A / 2, c20 = A / 2, b5 = run(z5, o5, a5, c5), b20 = run(z20, o20, a20, c20);
  if (b5.verdict === 'tine') a20 = A; else if (b20.verdict === 'tine') a5 = A;
  if (b5.clasament.verdict === 'ordoneaza') c20 = A; else if (b20.clasament.verdict === 'ordoneaza') c5 = A;
  if (a5 !== A / 2 || a20 !== A / 2 || c5 !== A / 2 || c20 !== A / 2) { b5 = run(z5, o5, a5, c5); b20 = run(z20, o20, a20, c20); }
  const integ = integritate(linii, rezultate, { motor, cal, now, faraUltima }), nota = notaIntegritate(integ);
  return { b5: { ...b5, integritate: integ, nota }, b20: { ...b20, integritate: integ, nota } };
}

/* ---------- 27.10.2026 (auditul F): amprenta judecătorului și contractul cu panourile — în afara judecătorului ---------- */
/** Judecătorul = închiderea tranzitivă din acest fișier pornind de la `bilantDoua` (verdictele) și `incheie` (rezultatele înghețate),
 *  fără textele de afișaj (`notaIntegritate`, bilanțul lunar descriptiv). Amprenta lui stă în docs/clasificator-versiuni.md. */
const RADACINI_JUDECATOR = Object.freeze(['bilantDoua', 'incheie']), AFISAJ_JUDECATOR = Object.freeze(['notaIntegritate', 'lunar']);
const sursaJurnal = () => readFileSync(new URL(import.meta.url), 'utf8');
export function FUNCTII_JUDECATOR(src = sursaJurnal()) { return inchidere(src, RADACINI_JUDECATOR, { exclude: AFISAJ_JUDECATOR }); }
export function amprentaJudecator(src = sursaJurnal()) { return 'jc-' + amprentaText(src, FUNCTII_JUDECATOR(src)); }
/** Puterea din protocol (I-671, docs/clasificator-putere-2026-10.md): efectul minim detectabil cu 80 % putere. */
export const PUTERE_CLF = Object.freeze({ 5: Object.freeze({ mde80: 0.007, clasament: 0.6 }), 20: Object.freeze({ mde80: 0.016, clasament: 1.2 }) });
/** Câmpurile de contract pentru o țintă: data primului verdict = al `minim`-lea vot notat la timp + h sesiuni (dacă de azi încolo se notează
 *  fiecare noapte); realist = cu nopțile pierdute până acum; judecata e unică (eșantion fix), datată la încheierea ultimului vot judecat. */
export function contractClasificator(b, { linii, motor = PROBA, cal, azi, h, minim }) {
  const bune = [...new Set((linii || []).filter((L) => L.motor === motor && !L.completare && laTimp(L, cal)).map((L) => L.asOf))].sort(), n = bune.length;
  const lipsa = b?.integritate?.lipsaTotal || 0, r = n + lipsa > 0 ? Math.min(0.8, lipsa / (n + lipsa)) : 0, rest = Math.max(0, minim - n);
  const deLa = n >= minim ? bune[minim - 1] : bune.at(-1) || azi, opt = dupaSesiuni(cal, deLa, n >= minim ? h : rest + h), rl = dupaSesiuni(cal, deLa, n >= minim ? h : Math.round(rest / (1 - r)) + h);
  const p = PUTERE_CLF[h] || PUTERE_CLF[5], v = b?.verdict && b.verdict !== 'in-proba' ? b.verdict : null;
  return {
    putere: { unitate: 'câștig de log loss pe zi față de ambele repere (frecvențe, momentum)', laPlus: [{ pct: p.mde80, putere: 0.8 }],
      text: `Proba vede un câștig de log loss de ${String(p.mde80).replace('.', ',')} cu 80 % putere după ${minim} de zile verificate; pragul „ține” cere însă un câștig mediu ≥ 0,02 față de ambele repere. Clasamentul vede doar un avantaj de ~${String(p.clasament).replace('.', ',')} % pe tranzacție.` },
    primulVerdict: { optimist: opt.zi, realist: rl.zi > opt.zi ? rl.zi : opt.zi, motiv: `${minim} de zile verificate (votul notat la timp + ${h} sesiuni); ${n} notate la timp până acum` + (lipsa ? `; realist: ${lipsa} nopți pierdute din ${n + lipsa}` : '; realist = optimist (nicio noapte pierdută)') + (opt.aproximativ || rl.aproximativ ? '; dincolo de calendarul oficial NYSE datele sunt aproximative' : '') },
    judecata: judecataDin({ la: minim, data: v && b.verdictPe ? dupaSesiuni(cal, b.verdictPe[1], h).zi : null, verdict: v, unic: true })
  };
}
/** 🔵 auditul F: rezultatele noi poartă ora notării (`notat`) — „înghețat” se poate proba și altfel decât prin garda „doar crește”. */
export function cuNotat(rezultate, now = Date.now()) { const t = new Date(now).toISOString(); return rezultate.map((r) => ({ ...r, notat: t })); }
