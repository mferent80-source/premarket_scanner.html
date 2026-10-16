// I-643 + I-647 (16.10.2026) — jurnalul de noapte al votului: robotul își notează votul pe fiecare acțiune, îl verifică singur
// după 5 sesiuni pe închiderile reale și scrie un bilanț. Pragul e scris ACUM, înaintea oricărei date:
//   verdict abia după ≥30 de zile SEPARATE (≥6 sesiuni între ele; o zi = media acțiunilor ei);
//   „ține” = eroarea votului mai mică cu ≥0,02 decât AMBELE repere (frecvențele claselor și momentum), cu p<0,05 față de fiecare;
//   altfel „nu ține”. Pe regim (SPY peste / sub media de 200 de zile) același calcul, cu corecția Holm pentru cele 2 felii.
export const ISTORIC = 'candidate-engine/generated/clasificator-istoric.jsonl';
export const PRAG = Object.freeze({ zileSeparate: 30, castig: 0.02, alfa: 0.05, distanta: 6, cost: 0.4, marja: 0.1, top: 10, minimZi: 20 });
// I-649 (scris înaintea datelor): primele 10 după probabilitatea „Long” a votului (egalitate ⇒ alfabetic), față de media universului
// în aceeași zi, după costuri; doar zile cu ≥20 de acțiuni verificate; „ordonează” = diferența medie > 0 cu p<0,05 după ≥30 de zile separate.
const H = 5, r4 = (v) => Math.round(v * 1e4) / 1e4;
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
/** Prima notare a zilei rămâne (a doua rulare din aceeași zi nu o rescrie: votul e înghețat). */
export function adauga(text, linie) {
  const linii = String(text || '').split('\n').filter(Boolean);
  if (!linie || !linie.asOf || !Object.keys(linie.voturi).length || linii.some((l) => { try { return JSON.parse(l).asOf === linie.asOf; } catch { return false; } })) return linii.join('\n') + (linii.length ? '\n' : '');
  return linii.concat(JSON.stringify(linie)).join('\n') + '\n';
}
export function citeste(text) { return String(text || '').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); }
const momentum = (r5, a) => { const d = r5 / a, k = d <= -1 ? 0 : d >= 1 ? 2 : 1; return [0, 1, 2].map((i) => (i === k ? 0.8 : 0.1)); };

/** Verifică voturile care au deja 5 sesiuni încheiate după ele. serii: { SIMBOL: bars întregi }. */
export function verifica(linii, serii, dateOf, { orizont = H, prag = 1, cheie = 'voturi' } = {}) {
  const zile = [];
  for (const L of linii) {
    const rows = [];
    for (const [s, v] of Object.entries(L[cheie] || {})) {
      const b = serii[s]; if (!b) continue; const i = b.findIndex((x) => dateOf(x.t) === L.asOf);
      if (i < 0 || i + orizont >= b.length || Math.abs(b[i].c - v.c) > 1e-6 * Math.max(1, v.c)) continue; // lipsă, prea devreme sau istoric revizuit
      const move = (b[i + orizont].c / b[i].c - 1) * 100 / v.a, y = move <= -prag ? 0 : move >= prag ? 2 : 1;
      const entry = b[i + 1].o, stop = entry - v.a / 100 * b[i].c; let out = null;
      for (let k = i + 1; k <= i + orizont && out === null; k++) { if (k > i + 1 && b[k].o <= stop) out = b[k].o; else if (b[k].l <= stop) out = stop; }
      rows.push({ s, y, p: v.p, pr: v.pr, mom: momentum(v.r5, v.a), k: v.k, pnl: ((out ?? b[i + orizont].c) / entry - 1) * 100 - costFor(b, i) });
    }
    if (rows.length) zile.push({ asOf: L.asOf, regim: L.regim, rows });
  }
  return zile.sort((a, b) => (a.asOf < b.asOf ? -1 : 1));
}
function separa(zile, distanta = PRAG.distanta) { const out = []; let ultim = -Infinity; zile.forEach((z, i) => { if (i >= ultim + distanta) { out.push(z); ultim = i; } }); return out; }
function cdf(z) { const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x), y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y); }
function test(xs) { const n = xs.length; if (n < 2) return { n, medie: n ? xs[0] : null, p: 1 }; const m = xs.reduce((a, b) => a + b, 0) / n, v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1); return { n, medie: m, p: v <= 1e-18 ? (m > 0 ? 0 : 1) : 1 - cdf(m / Math.sqrt(v / n)) }; }
function bani(zile) { const xs = zile.map((z) => z.rows.filter((r) => { const s = r.p.slice().sort((a, b) => b - a); return r.k === 2 && s[0] - s[1] >= PRAG.marja; }).map((r) => r.pnl)).filter((x) => x.length).map((x) => x.reduce((a, b) => a + b, 0) / x.length); return { zile: xs.length, medie: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null }; }
function judeca(zile, alfa = PRAG.alfa) {
  const ll = (p, y) => -Math.log(Math.max(1e-12, p[y])), d = (ref) => zile.map((z) => z.rows.reduce((s, r) => s + ll(r[ref], r.y) - ll(r.p, r.y), 0) / z.rows.length);
  const f = test(d('pr')), m = test(d('mom')), n = zile.length;
  const verdict = n < PRAG.zileSeparate ? 'in-proba' : f.medie >= PRAG.castig && m.medie >= PRAG.castig && f.p < alfa && m.p < alfa ? 'tine' : 'nu-tine';
  return { zileSeparate: n, verdict, vsFrecvente: f, vsMomentum: m, bani: bani(zile) };
}
export function primele(rows, n = PRAG.top) { return rows.slice().sort((a, b) => b.p[2] - a.p[2] || (a.s < b.s ? -1 : 1)).slice(0, n); }
function clasament(zile, alfa = PRAG.alfa) {
  const d = zile.filter((z) => z.rows.length >= PRAG.minimZi).map((z) => { const top = primele(z.rows), m = (xs) => xs.reduce((a, r) => a + r.pnl, 0) / xs.length; return m(top) - m(z.rows); });
  const t = test(d), verdict = t.n < PRAG.zileSeparate ? 'in-proba' : t.medie > 0 && t.p < alfa ? 'ordoneaza' : 'nu-ordoneaza';
  const mesaj = verdict === 'in-proba' ? `Clasamentul: ${t.n} din ${PRAG.zileSeparate} de zile separate; verdictul vine după.` : verdict === 'ordoneaza' ? 'Clasamentul ordonează: primele 10 bat media universului după costuri, pe zile noi.' : 'Clasamentul nu ordonează: primele 10 nu bat media universului cu pragul scris dinainte.';
  return { zileSeparate: t.n, verdict, medie: t.medie, p: t.p, alfa, mesaj };
}
/* Bilanțul lunar (descriptiv: toate zilele verificate, suprapuse, pe luna votului) — nu e verdict, verdictul rămâne pe zile separate. */
export function lunar(zile) {
  const ll = (p, y) => -Math.log(Math.max(1e-12, p[y])), luni = new Map();
  for (const z of zile) { const k = z.asOf.slice(0, 7); if (!luni.has(k)) luni.set(k, []); luni.get(k).push(z); }
  return [...luni.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([luna, zs]) => {
    const m = (f) => zs.reduce((s, z) => s + z.rows.reduce((a, r) => a + f(r), 0) / z.rows.length, 0) / zs.length;
    const cl = zs.filter((z) => z.rows.length >= PRAG.minimZi).map((z) => { const t = primele(z.rows), mm = (xs) => xs.reduce((a, r) => a + r.pnl, 0) / xs.length; return mm(t) - mm(z.rows); });
    return { luna, zile: zs.length, vsFrecvente: m((r) => ll(r.pr, r.y) - ll(r.p, r.y)), vsMomentum: m((r) => ll(r.mom, r.y) - ll(r.p, r.y)), clasament: cl.length ? cl.reduce((a, b) => a + b, 0) / cl.length : null };
  });
}
/** Bilanțul: pe toate zilele separate + pe regim (Holm pe 2 felii: prima la α/2, a doua la α). */
export function bilant(linii, zileVerificate, { alfa = PRAG.alfa, distanta = PRAG.distanta, alfaClasament = PRAG.alfa } = {}) {
  const sep = separa(zileVerificate, distanta), tot = judeca(sep, alfa), felii = {};
  for (const r of ['sus', 'jos']) felii[r] = judeca(sep.filter((z) => z.regim === r), alfa / 2);
  const ordine = Object.entries(felii).filter(([, x]) => x.verdict !== 'in-proba').sort((a, b) => Math.min(a[1].vsFrecvente.p, a[1].vsMomentum.p) - Math.min(b[1].vsFrecvente.p, b[1].vsMomentum.p));
  if (ordine[1] && ordine[0][1].verdict === 'tine') felii[ordine[1][0]] = judeca(sep.filter((z) => z.regim === ordine[1][0]), alfa);
  const mesaj = tot.verdict === 'in-proba' ? `În probă: ${tot.zileSeparate} din ${PRAG.zileSeparate} de zile separate verificate; verdictul vine după.` : tot.verdict === 'tine' ? 'Ține: votul bate ambele repere pe zile noi, după prag și test.' : 'Nu ține: pe zile noi votul nu bate ambele repere cu pragul scris dinainte.';
  return { prag: PRAG, alfa, zileNotate: linii.length, zileVerificate: zileVerificate.length, ...tot, mesaj, regim: felii, clasament: clasament(sep, alfaClasament), lunar: lunar(zileVerificate) };
}
/** I-657: mesajul zilnic există DOAR când un verdict e pozitiv (ține / ordonează); altfel null (robotul tace). */
export function mesajZilnic(j) {
  const poz = [['ținta de 5 sesiuni', j.jurnal?.verdict === 'tine'], ['clasamentul pe 5 sesiuni', j.jurnal?.clasament?.verdict === 'ordoneaza'], ['ținta de 20 de sesiuni', j.jurnal20?.verdict === 'tine'], ['clasamentul pe 20 de sesiuni', j.jurnal20?.clasament?.verdict === 'ordoneaza']].filter((x) => x[1]).map((x) => x[0]);
  if (!poz.length) return null;
  const a = new Set((j.clasament || []).slice(0, 10).map((x) => x.s)), b = new Set((j.clasament20 || []).slice(0, 10).map((x) => x.s));
  const top = (j.clasament || []).slice(0, 10).map((x) => x.s + (b.has(x.s) ? ' ★' : '')).join(', ');
  return `**Clasificator · ${j.asOf}** — verdict pozitiv pe: ${poz.join(', ')}.\nPrimele 10 (5 sesiuni): ${top || '—'}.\nInformativ, nu ordin; verdictul se poate schimba — robotul trimite mesaj și atunci.`;
}
/** Schimbările de verdict (toate patru) față de rularea trecută, pentru un singur mesaj de schimbare. */
export function schimbari(vechi, j) {
  const v = (x) => [x?.jurnal?.verdict, x?.jurnal?.clasament?.verdict, x?.jurnal20?.verdict, x?.jurnal20?.clasament?.verdict], n = ['ținta de 5', 'clasamentul pe 5', 'ținta de 20', 'clasamentul pe 20'], a = v(vechi), b = v(j);
  return n.map((nume, i) => (a[i] && b[i] && a[i] !== b[i] ? `${nume}: ${a[i]} → ${b[i]}` : null)).filter(Boolean);
}
/** I-650: două ținte ⇒ Holm pe 2: amândouă la α/2; dacă una „ține”, cealaltă se rejudecă la α. */
export function bilantDoua(linii, serii, dateOf) {
  const z5 = verifica(linii, serii, dateOf), z20 = verifica(linii, serii, dateOf, { orizont: 20, prag: 2, cheie: 'voturi20' }), o20 = { distanta: 21 };
  const A = PRAG.alfa, run = (z, o, aT, aC) => bilant(linii, z, { ...o, alfa: aT, alfaClasament: aC });
  let a5 = A / 2, a20 = A / 2, c5 = A / 2, c20 = A / 2, b5 = run(z5, {}, a5, c5), b20 = run(z20, o20, a20, c20);
  if (b5.verdict === 'tine') a20 = A; else if (b20.verdict === 'tine') a5 = A;
  if (b5.clasament.verdict === 'ordoneaza') c20 = A; else if (b20.clasament.verdict === 'ordoneaza') c5 = A;
  if (a5 !== A / 2 || a20 !== A / 2 || c5 !== A / 2 || c20 !== A / 2) { b5 = run(z5, {}, a5, c5); b20 = run(z20, o20, a20, c20); }
  return { b5, b20 };
}
