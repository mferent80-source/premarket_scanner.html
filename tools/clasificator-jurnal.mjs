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

/** Regimul pieței în ziua votului (închiderea SPY față de media ei de 200 de zile, ambele știute la închidere). */
export function regim(spy, asOf, dateOf) {
  if (!Array.isArray(spy)) return null; const i = spy.findIndex((b) => dateOf(b.t) === asOf); if (i < 199) return null;
  let s = 0; for (let k = i - 199; k <= i; k++) s += spy[k].c; return spy[i].c > s / 200 ? 'sus' : 'jos';
}
/** Linia zilei din fișierul robotului; doar ce trebuie la verificare (votul înghețat, închiderea, ATR, reperele). */
export function ziua(j, reg) {
  const voturi = {};
  for (const [s, e] of Object.entries(j.entries || {})) {
    const v = e.algos?.vote; if (!v || !Number.isFinite(e.close) || !Number.isFinite(e.atrPct) || !Array.isArray(e.prior)) continue;
    voturi[s] = { k: v.classIndex, p: v.support.map(r4), st: e.state, c: e.close, a: e.atrPct, r5: e.ret5, pr: e.prior.map(r4) };
  }
  return { asOf: j.asOf, generat: j.generat, motor: j.motor, regim: reg || null, voturi };
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
export function verifica(linii, serii, dateOf) {
  const zile = [];
  for (const L of linii) {
    const rows = [];
    for (const [s, v] of Object.entries(L.voturi || {})) {
      const b = serii[s]; if (!b) continue; const i = b.findIndex((x) => dateOf(x.t) === L.asOf);
      if (i < 0 || i + H >= b.length || Math.abs(b[i].c - v.c) > 1e-6 * Math.max(1, v.c)) continue; // lipsă, prea devreme sau istoric revizuit
      const move = (b[i + H].c / b[i].c - 1) * 100 / v.a, y = move <= -1 ? 0 : move >= 1 ? 2 : 1;
      const entry = b[i + 1].o, stop = entry - v.a / 100 * b[i].c; let out = null;
      for (let k = i + 1; k <= i + H && out === null; k++) { if (k > i + 1 && b[k].o <= stop) out = b[k].o; else if (b[k].l <= stop) out = stop; }
      rows.push({ s, y, p: v.p, pr: v.pr, mom: momentum(v.r5, v.a), k: v.k, pnl: ((out ?? b[i + H].c) / entry - 1) * 100 - PRAG.cost });
    }
    if (rows.length) zile.push({ asOf: L.asOf, regim: L.regim, rows });
  }
  return zile.sort((a, b) => (a.asOf < b.asOf ? -1 : 1));
}
function separa(zile) { const out = []; let ultim = -Infinity; zile.forEach((z, i) => { if (i >= ultim + PRAG.distanta) { out.push(z); ultim = i; } }); return out; }
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
function clasament(zile) {
  const d = zile.filter((z) => z.rows.length >= PRAG.minimZi).map((z) => { const top = primele(z.rows), m = (xs) => xs.reduce((a, r) => a + r.pnl, 0) / xs.length; return m(top) - m(z.rows); });
  const t = test(d), verdict = t.n < PRAG.zileSeparate ? 'in-proba' : t.medie > 0 && t.p < PRAG.alfa ? 'ordoneaza' : 'nu-ordoneaza';
  const mesaj = verdict === 'in-proba' ? `Clasamentul: ${t.n} din ${PRAG.zileSeparate} de zile separate; verdictul vine după.` : verdict === 'ordoneaza' ? 'Clasamentul ordonează: primele 10 bat media universului după costuri, pe zile noi.' : 'Clasamentul nu ordonează: primele 10 nu bat media universului cu pragul scris dinainte.';
  return { zileSeparate: t.n, verdict, medie: t.medie, p: t.p, mesaj };
}
/** Bilanțul: pe toate zilele separate + pe regim (Holm pe 2 felii: prima la α/2, a doua la α). */
export function bilant(linii, zileVerificate) {
  const sep = separa(zileVerificate), tot = judeca(sep), felii = {};
  for (const r of ['sus', 'jos']) felii[r] = judeca(sep.filter((z) => z.regim === r), PRAG.alfa / 2);
  const ordine = Object.entries(felii).filter(([, x]) => x.verdict !== 'in-proba').sort((a, b) => Math.min(a[1].vsFrecvente.p, a[1].vsMomentum.p) - Math.min(b[1].vsFrecvente.p, b[1].vsMomentum.p));
  if (ordine[1] && ordine[0][1].verdict === 'tine') felii[ordine[1][0]] = judeca(sep.filter((z) => z.regim === ordine[1][0]), PRAG.alfa);
  const mesaj = tot.verdict === 'in-proba' ? `În probă: ${tot.zileSeparate} din ${PRAG.zileSeparate} de zile separate verificate; verdictul vine după.` : tot.verdict === 'tine' ? 'Ține: votul bate ambele repere pe zile noi, după prag și test.' : 'Nu ține: pe zile noi votul nu bate ambele repere cu pragul scris dinainte.';
  return { prag: PRAG, zileNotate: linii.length, zileVerificate: zileVerificate.length, ...tot, mesaj, regim: felii, clasament: clasament(sep) };
}
