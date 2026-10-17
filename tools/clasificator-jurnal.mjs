// I-643 + I-647 (16.10.2026) — jurnalul de noapte al votului: robotul își notează votul pe fiecare acțiune, îl verifică singur
// pe închiderile reale și scrie un bilanț. Pragul e scris ÎNAINTEA oricărui rezultat (protocolul: docs/clasificator-protocol.md).
// 17.10.2026 — protocolul revizuit înaintea primului rezultat al motorului în probă (I-671, puterea calculată pe istoric):
//   toate zilele verificate intră în test (nu una din 6), cu eroarea Newey-West pentru zilele suprapuse (decalaj = orizontul);
//   verdict abia după ≥180 de zile verificate la ținta de 5 sesiuni și ≥252 la ținta de 20;
//   „ține” = eroarea votului mai mică cu ≥0,02 decât AMBELE repere (frecvențele claselor și momentum), cu p<α față de fiecare;
//   altfel „nu ține”. Pe regim (SPY peste / sub media de 200 de zile) același calcul, cu corecția Holm pentru cele 2 felii.
// Jurnalul (I-660 / I-662 / I-672 / I-674): un dosar pe versiunea motorului, câte un fișier pe lună pentru voturi și pentru
// rezultate; fișierele doar cresc. Se judecă doar versiunea în probă (PROBA); celelalte rămân istoric sau umbră.
export const DIR = 'candidate-engine/generated/clasificator-jurnal';
export const ISTORIC = 'candidate-engine/generated/clasificator-istoric.jsonl'; // fișierul vechi (până la 17.10), mutat în DIR
export const PROBA = 'holdings-clf-v5';
export const PRAG = Object.freeze({ zileMinime: 180, zileMinime20: 252, decalaj: 5, decalaj20: 20, castig: 0.02, alfa: 0.05, marja: 0.1, top: 10, minimZi: 20, asteptare: 10, rezerva: 0.05 });
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
/** Prima notare a zilei rămâne pentru fiecare motor (a doua rulare din aceeași zi nu o rescrie: votul e înghețat). */
export function adauga(linii, linie) {
  if (!linie || !linie.asOf || !linie.motor || !Object.keys(linie.voturi || {}).length || linii.some((l) => l.asOf === linie.asOf && l.motor === linie.motor)) return linii;
  return linii.concat(linie);
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
  const R = new Map(rezultate.filter((r) => r.h === h).map((r) => [cheieR(r.m, r.asOf, r.h, r.s), r])), zile = [];
  for (const L of linii) {
    const rows = [];
    for (const [s, v] of Object.entries(L[cheie] || {})) { const x = R.get(cheieR(L.motor, L.asOf, h, s)); if (x && !x.nejudecat) rows.push({ s, y: x.y, p: v.p, pr: v.pr, mom: momentum(v.r5, v.a), k: v.k, pnl: x.pnl }); }
    if (rows.length) zile.push({ asOf: L.asOf, regim: L.regim, rows });
  }
  return zile.sort((a, b) => (a.asOf < b.asOf ? -1 : 1));
}

/* ---------- testul: toate zilele, eroare Newey-West (I-671) ---------- */
function cdf(z) { const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x), y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y); }
/** Test unilateral (media > 0) pe zile suprapuse: varianța pe termen lung Newey-West, ponderi Bartlett, decalajul dat. */
export function test(xs, decalaj = 0) {
  const n = xs.length; if (n < 2) return { n, medie: n ? xs[0] : null, p: 1 };
  const m = xs.reduce((a, b) => a + b, 0) / n, g = (k) => { let s = 0; for (let i = k; i < n; i++) s += (xs[i] - m) * (xs[i - k] - m); return s / n; };
  let v = g(0); for (let k = 1; k <= Math.min(decalaj, n - 1); k++) v += 2 * (1 - k / (decalaj + 1)) * g(k);
  v = v * n / (n - 1); // corecția pentru eșantion mic (la decalaj 0 = varianța obișnuită)
  return { n, medie: m, p: v <= 1e-18 ? (m > 0 ? 0 : 1) : 1 - cdf(m / Math.sqrt(v / n)) };
}
function bani(zile) { const xs = zile.map((z) => z.rows.filter((r) => { const s = r.p.slice().sort((a, b) => b - a); return r.k === 2 && s[0] - s[1] >= PRAG.marja; }).map((r) => r.pnl)).filter((x) => x.length).map((x) => x.reduce((a, b) => a + b, 0) / x.length); return { zile: xs.length, medie: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null }; }
function judeca(zile, { alfa = PRAG.alfa, minim = PRAG.zileMinime, decalaj = PRAG.decalaj } = {}) {
  const ll = (p, y) => -Math.log(Math.max(1e-12, p[y])), d = (ref) => zile.map((z) => z.rows.reduce((s, r) => s + ll(r[ref], r.y) - ll(r.p, r.y), 0) / z.rows.length);
  const f = test(d('pr'), decalaj), m = test(d('mom'), decalaj), n = zile.length;
  const verdict = n < minim ? 'in-proba' : f.medie >= PRAG.castig && m.medie >= PRAG.castig && f.p < alfa && m.p < alfa ? 'tine' : 'nu-tine';
  return { zileTest: n, zileMinime: minim, verdict, vsFrecvente: f, vsMomentum: m, bani: bani(zile) };
}
export function primele(rows, n = PRAG.top) { return rows.slice().sort((a, b) => b.p[2] - a.p[2] || (a.s < b.s ? -1 : 1)).slice(0, n); }
function clasament(zile, { alfa = PRAG.alfa, minim = PRAG.zileMinime, decalaj = PRAG.decalaj } = {}) {
  const d = zile.filter((z) => z.rows.length >= PRAG.minimZi).map((z) => { const top = primele(z.rows), m = (xs) => xs.reduce((a, r) => a + r.pnl, 0) / xs.length; return m(top) - m(z.rows); });
  const t = test(d, decalaj), verdict = t.n < minim ? 'in-proba' : t.medie > 0 && t.p < alfa ? 'ordoneaza' : 'nu-ordoneaza';
  const mesaj = verdict === 'in-proba' ? `Clasamentul: ${t.n} din ${minim} de zile verificate; verdictul vine după.` : verdict === 'ordoneaza' ? 'Clasamentul ordonează: primele 10 bat media universului după costuri, pe zile noi.' : 'Clasamentul nu ordonează: primele 10 nu bat media universului cu pragul scris dinainte.';
  return { zileTest: t.n, zileMinime: minim, verdict, medie: t.medie, p: t.p, alfa, mesaj };
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
export function bilant(linii, zileVerificate, { alfa = PRAG.alfa, minim = PRAG.zileMinime, decalaj = PRAG.decalaj, alfaClasament = PRAG.alfa } = {}) {
  const o = { minim, decalaj }, tot = judeca(zileVerificate, { ...o, alfa }), felii = {};
  for (const r of ['sus', 'jos']) felii[r] = judeca(zileVerificate.filter((z) => z.regim === r), { ...o, alfa: alfa / 2 });
  const ordine = Object.entries(felii).filter(([, x]) => x.verdict !== 'in-proba').sort((a, b) => Math.min(a[1].vsFrecvente.p, a[1].vsMomentum.p) - Math.min(b[1].vsFrecvente.p, b[1].vsMomentum.p));
  if (ordine[1] && ordine[0][1].verdict === 'tine') felii[ordine[1][0]] = judeca(zileVerificate.filter((z) => z.regim === ordine[1][0]), { ...o, alfa });
  const mesaj = tot.verdict === 'in-proba' ? `În probă: ${tot.zileTest} din ${minim} de zile verificate; verdictul vine după.` : tot.verdict === 'tine' ? 'Ține: votul bate ambele repere pe zile noi, după prag și test.' : 'Nu ține: pe zile noi votul nu bate ambele repere cu pragul scris dinainte.';
  return { prag: PRAG, alfa, zileNotate: linii.length, zileVerificate: zileVerificate.length, ...tot, mesaj, regim: felii, clasament: clasament(zileVerificate, { ...o, alfa: alfaClasament }), lunar: lunar(zileVerificate) };
}

/* ---------- integritatea probei: versiunea, notarea la timp, zilele lipsă (I-660 / I-668 / I-670) ---------- */
const US = { timezone: 'America/New_York', closeMinutes: 960 }, deschisa = (cal, d) => !['closed', 'unknown'].includes(cal.session('US', d).state);
/** Linia contează doar dacă a fost notată înainte de deschiderea sesiunii următoare (altfel intrarea ar fi deja în trecut). */
export function laTimp(L, cal) { if (!cal) return true; const t = Date.parse(L.generat); if (!Number.isFinite(t)) return false; return cal.beforeNextOpen({ ...US, asOf: L.asOf }, t) !== false; }
/** Sesiunile încheiate de la `de` (inclusiv) până la ultima încheiată acum, după calendarul oficial US. */
export function sesiuni(cal, de, now) {
  if (!cal || !de) return []; let ultima; try { ultima = cal.latest(now, 'US').day; } catch { return []; }
  const out = []; let d = deschisa(cal, de) ? de : cal.next(de, 'US')?.day;
  for (let k = 0; d && d <= ultima && k < 800; k++) { out.push(d); d = cal.next(d, 'US')?.day; }
  return out;
}
/** Câte sesiuni încheiate au trecut după ziua votului (pentru așteptarea rezultatelor). */
export function sesiuniDupa(cal, now) { const memo = new Map(); return (asOf) => { if (!cal) return Infinity; if (!memo.has(asOf)) memo.set(asOf, Math.max(0, sesiuni(cal, asOf, now).filter((d) => d > asOf).length)); return memo.get(asOf); }; }
/** Rezumatul integrității pentru motorul în probă. */
export function integritate(linii, rezultate, { motor = PROBA, cal = null, now = Date.now() } = {}) {
  const ale = linii.filter((L) => L.motor === motor), bune = ale.filter((L) => laTimp(L, cal)), notate = new Set(bune.map((L) => L.asOf));
  const din = ale.length ? ale.map((L) => L.asOf).sort()[0] : null, lipsa = din ? sesiuni(cal, din, now).filter((d) => !notate.has(d)) : [];
  const mele = rezultate.filter((r) => r.m === motor), nej = mele.filter((r) => r.nejudecat), motive = {};
  for (const r of nej) motive[r.nejudecat] = (motive[r.nejudecat] || 0) + 1;
  const alte = [...new Set(linii.filter((L) => L.motor !== motor).map((L) => L.motor))];
  return { motor, din, alteVersiuni: alte, zileAlte: linii.length - ale.length, tarzii: ale.length - bune.length, lipsa: lipsa.slice(-20), lipsaTotal: lipsa.length,
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
  const tinta = (z, nume) => z ? [`### ${nume}`, '', `- **Verdict:** ${z.verdict} — ${z.mesaj}`, `- Zile verificate în test: ${z.zileTest} (minim ${z.zileMinime}); notate: ${z.zileNotate}.`,
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
export function bilantDoua(linii, rezultate, { motor = PROBA, cal = null, now = Date.now() } = {}) {
  const bune = linii.filter((L) => L.motor === motor && laTimp(L, cal));
  const z5 = zileDin(bune, rezultate), z20 = zileDin(bune, rezultate, { h: 20, cheie: 'voturi20' }), o5 = { minim: PRAG.zileMinime, decalaj: PRAG.decalaj }, o20 = { minim: PRAG.zileMinime20, decalaj: PRAG.decalaj20 };
  const A = PRAG.alfa, run = (z, o, aT, aC) => bilant(bune, z, { ...o, alfa: aT, alfaClasament: aC });
  let a5 = A / 2, a20 = A / 2, c5 = A / 2, c20 = A / 2, b5 = run(z5, o5, a5, c5), b20 = run(z20, o20, a20, c20);
  if (b5.verdict === 'tine') a20 = A; else if (b20.verdict === 'tine') a5 = A;
  if (b5.clasament.verdict === 'ordoneaza') c20 = A; else if (b20.clasament.verdict === 'ordoneaza') c5 = A;
  if (a5 !== A / 2 || a20 !== A / 2 || c5 !== A / 2 || c20 !== A / 2) { b5 = run(z5, o5, a5, c5); b20 = run(z20, o20, a20, c20); }
  const integ = integritate(linii, rezultate, { motor, cal, now }), nota = notaIntegritate(integ);
  return { b5: { ...b5, integritate: integ, nota }, b20: { ...b20, integritate: integ, nota } };
}
