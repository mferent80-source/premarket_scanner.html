// 18.10.2026 — Proba în timp a Reguli V1 (protocolul: docs/v1-proba-protocol.md, scris ÎNAINTE de date). Funcții pure:
// înregistrarea zilei din raportul scannerului, excesul față de reper la k sesiuni, perioadele care nu se suprapun și testul semnelor.
// 27.10.2026 — v2 (I-741 / I-743, lotul F al auditului; protocolul v2 scris înainte, proba REPORNEȘTE, jurnalul v1 rămâne sub versiunea veche):
//  · verdictul se dă O SINGURĂ dată, pe primele `perioadeCerute[k]` perioade (eșantion fix); după aceea doar monitorizare — recalcularea la
//    fiecare perioadă nouă dădea „ajută” fals ≈ 15 %/an (simulat în audit);
//  · numărul de perioade cerut vine din simularea puterii (`putere`): cel mai mic la care un avantaj de +1 %/perioadă e văzut în ≥ 50 % din lumi;
//    puterea la +0,5 % și +1 % se scrie în JSON (`putere.laPlus`), cu data estimată a primului verdict (`primulVerdict`) și `judecata`;
//  · versiunea probei e o amprentă SHA pe regulile V1 (funcțiile care verifică, din lib/independent-scanner.js) ȘI pe evaluatorul de aici,
//    nu șirul constant `experimental-1.0.0`: o schimbare în oricare repornește proba;
//  · acțiunile fără serie după orizont + 10 sesiuni (delistate) ies la ultima închidere cunoscută (`oprit`), iar cele fără serie deloc sunt
//    „nejudecate”, cu motiv, numărate (înainte ieșeau tăcut din medii).
import { mulberry32, gauss, amprentaText, amprentaFunctii, inchidere, sesiuniIntre, primulVerdict as primulVerdictDin, judecata as judecataDin } from './proba-contract.mjs';

export const PROTOCOL = Object.freeze({
  id: 'v1-proba-2', scrisLa: '2026-10-27',
  precedent: Object.freeze({ id: 'v1-proba-1', scrisLa: '2026-10-18', versiune: 'experimental-1.0.0', perioadeMin: 8, zile: ['2026-10-16', '2026-10-23'] }),
  orizonturi: Object.freeze([5, 20]), principal: 20,
  // v2: judecata unică la exact atâtea perioade = cel mai mic N din grilă la care +1 %/perioadă e văzut în ≥ 50 % din lumi, pentru AMBELE
  // probe care împart evaluatorul (Reguli V1 și Top Long; docs/proba-putere-2026-10-27.json). La 8 perioade puterea era 15–39 %; v1 cerea 8.
  perioadeCerute: Object.freeze({ 5: 16, 20: 60 }),
  minPeGrup: 3, alfa: 0.05, pragSus: 6, pragPersistenta: 0.2,
  asteptare: 10, // sesiuni după orizont fără date ⇒ acțiunea e delistată: iese la ultima închidere; fără serie ⇒ nejudecată
  // puterea (I-741): lumi sintetice cu înregistrări ZILNICE, grupuri ca în jurnalul real (65 verificate: 16 SUS, 49 JOS), abaterea zilnică
  // 2,2 % aleasă ca diferența SUS − JOS pe o perioadă de 20 de sesiuni să aibă ≈ 3,4 % la Top Long (Anexa A a protocolului Top Long);
  // mulberry32, sămânță fixă; rezultatele de mai jos sunt cele scrise în protocol pe 27.10.2026 (recalculabile cu `putere`)
  putere: Object.freeze({ lumi: 2000, samanta: 27102026, sigmaZi: 0.022, sigmaPiata: 0.01, verificate: 65, grup: Object.freeze({ sus: 16, jos: 49 }), laPlus: Object.freeze([0.5, 1]),
    // puterea Reguli V1 la perioadele cerute (16 la k = 5, 60 la k = 20), din docs/proba-putere-2026-10-27.json
    rezultate: Object.freeze({ 5: Object.freeze({ '0.5': 0.2475, '1': 0.6685 }), 20: Object.freeze({ '0.5': 0.2615, '1': 0.664 }) }) }),
  // lista Core a Premarket Scanner (candidate-engine/engine.js, US_CORE + EU_CORE) înghețată pe 18.10.2026
  univers: Object.freeze([
    'AAPL','MSFT','NVDA','AVGO','AMD','MU','INTC','WDC','AMAT','LRCX','KLAC','QCOM','TSM',
    'PLTR','CRWD','PANW','SNOW','AMZN','META','GOOGL','NFLX','TSLA','COIN','HOOD','SOFI',
    'JPM','BAC','XOM','CVX','CAT','BA','GE','RTX','UNH','LLY','PFE','NVO','PYPL','EL',
    'UPS','APLD','CIFR','MARA','RIOT','NKE','SBUX','DG','TGT','DIS','RIVN','LCID','ROKU',
    'ENPH','SEDG','ON','SMCI','MRVL','CRM','ADBE','PATH','U','DKNG','CHWY','ETSY','JD','BABA','PDD',
    'ASML.AS','SAP.DE','RHM.DE','VOW3.DE','MBG.DE','BAYN.DE','SIE.DE','AIR.PA','SU.PA',
    'MC.PA','TTE.PA','OR.PA','NOVO-B.CO','MIGA.MU','IFX.DE','ADS.DE','ALV.DE','DTE.DE'
  ])
});
const COD = { research_match: 'm', rules_not_met: 'n', unverifiable: 'u' };
const ziValida = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Rândul zilei: { zi, v, la, r: [[simbol, cod, verificări trecute, data EOD, reper]] }. zi = cea mai recentă dată EOD verificată.
 *  v2: `versiune` (amprenta SHA) înlocuiește șirul `report.version` când e dată. */
export function inregistrare(report, at = Date.now(), versiune = null) {
  const r = (report?.items || []).filter((i) => i && typeof i.symbol === 'string' && COD[i.verdict]).map((i) => [i.symbol, COD[i.verdict], Number.isFinite(i.passed) ? i.passed : 0, ziValida(i.sourceDate) ? i.sourceDate : null, i.metrics?.benchmarkSymbol || null]);
  const zile = r.filter((x) => x[1] !== 'u' && x[3]).map((x) => x[3]).sort();
  return { zi: zile.at(-1) || null, v: String(versiune || report?.version || ''), la: new Date(at).toISOString(), r };
}
/** Adaugă ziua. 27.10.2026 (revizia F, 🟡9): aceeași zi + aceeași versiune NU se mai înlocuiește — prima notare rămâne (ca istoricul
 *  verdictului pieței); rezerva de dimineață sau o rulare de mână nu mai rescrie ziua notată seara. */
export function adauga(jurnal, rec) {
  const zile = (Array.isArray(jurnal?.zile) ? jurnal.zile : []).slice();
  if (rec.zi && !zile.some((z) => z.zi === rec.zi && z.v === rec.v)) zile.push(rec);
  zile.sort((a, b) => (a.zi < b.zi ? -1 : a.zi > b.zi ? 1 : 0));
  return { protocol: PROTOCOL.id, zile };
}
/** Prețul la data d sau ultima dată ≤ d (reperul poate avea alt calendar). serie = [{ d, c }] crescător. */
function laData(serie, d) { let lo = 0, hi = serie.length - 1, out = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (serie[m].d <= d) { out = m; lo = m + 1; } else hi = m - 1; } return out; }
const INDEX = new WeakMap();
/** Indexul datelor unei serii (ținut minte pe serie: evaluarea și simulările cer mii de căutări). */
function indexLa(serie, d) { let m = INDEX.get(serie); if (!m) { m = new Map(); serie.forEach((x, i) => { if (!m.has(x.d)) m.set(x.d, i); }); INDEX.set(serie, m); } const i = m.get(d); return i === undefined ? -1 : i; }
/** Excesul pe k sesiuni pentru fiecare acțiune verificată din zilele versiunii date. serii = { simbol: [{ d, c }] }.
 *  Cu `sesiuni` (calendarul SPY): după orizont + `asteptare` sesiuni fără date, acțiunea delistată iese la ultima închidere (`oprit`),
 *  iar cea fără serie sau fără ziua notată e întoarsă cu `ex: null` și `nejudecat` (motivul). Fără `sesiuni`: doar ce are k sesiuni. */
export function excese(jurnal, serii, k, versiune, { sesiuni = null, asteptare = PROTOCOL.asteptare } = {}) {
  const out = [], idxS = sesiuni ? new Map(sesiuni.map((d, i) => [d, i])) : null;
  for (const z of jurnal?.zile || []) {
    if (z.v !== versiune) continue;
    for (const rec of z.r) { const r = excesRec(rec, z.zi, k, serii, { sesiuni, idxS, asteptare }); if (r) out.push(r); }
  }
  return out;
}
/** Un rând al unei zile ⇒ { zi, sym, cod, trecute, ex, oprit? } sau { …, ex: null, nejudecat } sau null (nu se poate judeca încă / nu intră). */
function excesRec([sym, cod, trecute, d, reper], zi, k, serii, { sesiuni, idxS, asteptare }) {
  if (cod === 'u' || !d || !reper) return null;
  const iS = idxS ? idxS.get(d) : undefined, limita = iS !== undefined && iS + k + asteptare < sesiuni.length ? sesiuni[iS + k + asteptare] : null;
  const s = serii[sym], b = serii[reper], baza = { zi, sym, cod, trecute };
  if (!s || !b) return limita ? { ...baza, ex: null, nejudecat: !s ? 'fără serie (delistată sau sursă indisponibilă)' : 'reperul fără serie' } : null;
  const i = indexLa(s, d); if (i < 0) return limita ? { ...baza, ex: null, nejudecat: 'ziua notată lipsește din serie' } : null;
  let fin, cFin, oprit = null;
  if (i + k < s.length) { fin = s[i + k].d; cFin = s[i + k].c; }
  else if (limita && s[s.length - 1].d < limita) { if (s.length - 1 > i) { fin = s[s.length - 1].d; cFin = s[s.length - 1].c; oprit = fin; } else return { ...baza, ex: null, nejudecat: 'seria s-a oprit în ziua notată' }; }
  else return null; // încă nu s-au încheiat k sesiuni
  const b0 = laData(b, d), b1 = laData(b, fin); if (b0 < 0 || b1 <= b0 || b[b0].d !== d) return null;
  const rS = cFin / s[i].c - 1, rB = b[b1].c / b[b0].c - 1; if (!Number.isFinite(rS) || !Number.isFinite(rB)) return null;
  return { ...baza, ex: rS - rB, ...(oprit ? { oprit } : {}) };
}
/** P(X ≥ pozitive | Bin(n, 1/2)) — testul semnelor, unilateral. */
export function pSemne(pozitive, n) { if (n <= 0) return 1; let p = 0, c = 1; for (let x = 0; x <= n; x++) { if (x > 0) c = (c * (n - x + 1)) / x; if (x >= pozitive) p += c; } return p / 2 ** n; }
/** Zilele de start care nu se suprapun: prima zi, apoi prima zi din jurnal aflată la ≥ k sesiuni după precedenta (sesiuni = calendarul SPY). */
export function starturi(zileJurnal, sesiuni, k) {
  const idx = new Map(sesiuni.map((d, i) => [d, i])), out = []; let ultim = -Infinity;
  for (const d of [...new Set(zileJurnal)].sort()) { const i = idx.get(d); if (i === undefined) continue; if (i - ultim >= k) { out.push(d); ultim = i; } }
  return out;
}
const medie = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
/** Perioadele închise ale unui orizont: [{ zi, dif, sus, jos }] în ordine cronologică (diferențele exact 0 nu intră).
 *  Starturile se aleg dintre zilele cu cel puțin un rând judecabil; excesele (și cifrele descriptive, nejudecatele) se calculează DOAR pe zilele de
 *  start — aceleași perioade ca înainte, de k ori mai puțină muncă (simulările de putere trec prin exact acest cod). */
export function perioadeDin(jurnal, serii, { k, versiune, sesiuni, inSus = (r) => r.trecute >= PROTOCOL.pragSus }) {
  const idxS = new Map(sesiuni.map((d, i) => [d, i])), o = { sesiuni, idxS, asteptare: PROTOCOL.asteptare }, zile = (jurnal?.zile || []).filter((z) => z.v === versiune);
  const cuRezultat = zile.filter((z) => z.r.some((rec) => { const r = excesRec(rec, z.zi, k, serii, o); return r && r.ex !== null; })).map((z) => z.zi);
  const st = new Set(starturi(cuRezultat, sesiuni, k)), toate = excese({ zile: zile.filter((z) => st.has(z.zi)) }, serii, k, versiune, { sesiuni });
  const rows = toate.filter((r) => r.ex !== null), nejudecate = toate.filter((r) => r.ex === null), peZi = new Map(), nejZi = new Map();
  for (const r of rows) { if (!peZi.has(r.zi)) peZi.set(r.zi, []); peZi.get(r.zi).push(r); }
  for (const r of nejudecate) { if (!nejZi.has(r.zi)) nejZi.set(r.zi, []); nejZi.get(r.zi).push(r); }
  // 27.10.2026 (revizia F, 🔴2): `detaliu` = fiecare start, și cel exclus, cu randamentele lui — exact ce se îngheață în fișierul care doar crește
  const perioade = [], detaliu = [];
  for (const d of [...st].sort()) {
    const zi = peZi.get(d) || [], sus = zi.filter(inSus).map((r) => r.ex), jos = zi.filter((r) => !inSus(r)).map((r) => r.ex);
    const rand = { zi: d, dif: null, sus: sus.length, jos: jos.length, exclusa: null, r: zi.map((r) => (r.oprit ? [r.sym, Math.round(r.ex * 1e6) / 1e6, inSus(r) ? 1 : 0, r.cod, r.oprit] : [r.sym, Math.round(r.ex * 1e6) / 1e6, inSus(r) ? 1 : 0, r.cod])), nej: (nejZi.get(d) || []).map((r) => [r.sym, r.nejudecat]) };
    if (sus.length < PROTOCOL.minPeGrup || jos.length < PROTOCOL.minPeGrup) { detaliu.push({ ...rand, exclusa: 'sub ' + PROTOCOL.minPeGrup + ' acțiuni pe grup' }); continue; }
    const dif = medie(sus) - medie(jos);
    if (dif === 0) { detaliu.push({ ...rand, dif: 0, exclusa: 'diferența exact 0' }); continue; }
    perioade.push({ zi: d, dif, sus: sus.length, jos: jos.length }); detaliu.push({ ...rand, dif });
  }
  return { perioade, rows, nejudecate, detaliu };
}
/** v2: judecata UNICĂ pe primele `cerute` perioade (eșantion fix): testul semnelor unilateral, media > 0 și p ≤ α ⇒ „ajută”. */
export function judeca(perioade, cerute, { alfa = PROTOCOL.alfa } = {}) {
  const fix = perioade.slice(0, cerute), n = fix.length, pozitive = fix.filter((p) => p.dif > 0).length, p = pSemne(pozitive, n), medieDif = medie(fix.map((x) => x.dif));
  if (n < cerute) return { gata: false, n, pozitive, p, medieDif, verdict: 'astept', persistenta: null, rezerve: null };
  const verdict = medieDif > 0 && p <= alfa ? 'ajuta' : 'fara-avantaj', rho = persistenta(fix.map((x) => x.dif));
  // 27.10.2026 (scris înainte): testul semnelor presupune perioade independente; cu ρ = 0,2 mărimea urcă la 6–7 % (docs/proba-putere-2026-10-27.json)
  const rezerve = verdict === 'ajuta' && rho !== null && rho >= PROTOCOL.pragPersistenta ? 'perioadele au persistență (ρ = ' + rho.toFixed(2).replace('.', ',') + '): „ajută” cu rezerve, mărimea testului ar fi ~6–7 %, nu 5 %' : null;
  return { gata: true, n, pozitive, p, medieDif, verdict, persistenta: rho, rezerve };
}
/** Autocorelarea de ordinul 1 a diferențelor (null sub 3 perioade sau fără variație). */
function persistenta(xs) {
  if (xs.length < 3) return null; const m = medie(xs); let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { den += (xs[i] - m) ** 2; if (i) num += (xs[i] - m) * (xs[i - 1] - m); }
  return den > 0 ? num / den : null;
}
/* ---------- 27.10.2026 (revizia independentă F, 🔴2): perioadele și judecata ÎNGHEȚATE, în fișiere care doar cresc ---------- */
/** Fișierul înghețat (JSONL): o înregistrare pe linie; o linie stricată oprește robotul (fișierul doar crește, nu se „repară” tăcut). */
export function citesteInghetat(text) { return String(text || '').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)); }
export function liniiInghetat(recs) { return (recs || []).map((x) => JSON.stringify(x)).join('\n') + ((recs || []).length ? '\n' : ''); }
/** Perioadele înghețate ale unui orizont (v, k) + ce se îngheață în noaptea asta + judecata. O perioadă (start + k sesiuni) se îngheață când s-au
 *  scurs și cele `asteptare` sesiuni de după orizont: atunci fiecare rând e definitiv (randament, ieșire la ultima închidere sau „nejudecat”).
 *  Starturile noi se caută doar din ziua în care s-a închis ultima perioadă înghețată (aceleași perioade care nu se suprapun ca pe tot jurnalul).
 *  Judecata (la exact `judecaLa` perioade valabile, înghețate) se scrie o singură dată; cea scrisă are întâietate, iar o recalculare care ar ieși
 *  altfel apare doar ca `abatere`. Întoarce { perioade (vechi + noi), noi, asteapta, judecata, judecataNoua, abatere }. */
export function ingheata(inghetate, jurnal, serii, { k, versiune, sesiuni, inSus = (r) => r.trecute >= PROTOCOL.pragSus, judecaLa = null, asteptare = PROTOCOL.asteptare, la = null } = {}) {
  const ale = (inghetate || []).filter((x) => x && x.v === versiune && x.k === k), vechi = ale.filter((x) => x.tip === 'perioada'), dupa = vechi.length ? vechi[vechi.length - 1].inchisa : null;
  const zile = (jurnal?.zile || []).filter((z) => z.v === versiune && (!dupa || z.zi >= dupa));
  const { detaliu } = perioadeDin({ zile }, serii, { k, versiune, sesiuni, inSus });
  const idx = new Map(sesiuni.map((d, i) => [d, i])), noi = [], asteapta = [];
  let opreste = false;   // în ordine: o perioadă care nu se poate îngheța încă oprește și înghețarea celor de după ea
  for (const p of detaliu) {
    const i = idx.get(p.zi);
    if (opreste || i === undefined || i + k + asteptare >= sesiuni.length) { opreste = true; if (i !== undefined && i + k < sesiuni.length) asteapta.push({ zi: p.zi, inchisa: sesiuni[i + k] }); continue; }
    noi.push({ tip: 'perioada', v: versiune, k, zi: p.zi, inchisa: sesiuni[i + k], inghetata: sesiuni[i + k + asteptare], dif: p.dif, sus: p.sus, jos: p.jos, exclusa: p.exclusa, r: p.r, nej: p.nej, ...(la ? { la } : {}) });
  }
  const perioade = vechi.concat(noi), valabile = perioade.filter((x) => !x.exclusa);
  let judecata = ale.find((x) => x.tip === 'judecata') || null, judecataNoua = null, abatere = null;
  if (judecaLa) {
    const j = judeca(valabile, judecaLa);
    if (j.gata) {
      const rec = { tip: 'judecata', v: versiune, k, la: judecaLa, data: valabile[judecaLa - 1].inghetata, verdict: j.verdict, n: j.n, pozitive: j.pozitive, p: j.p, medieDif: j.medieDif, persistenta: j.persistenta, rezerve: j.rezerve, perioade: valabile.slice(0, judecaLa).map((x) => x.zi), ...(la ? { la } : {}) };
      if (!judecata) { judecata = rec; judecataNoua = rec; }
      else if (judecata.verdict !== rec.verdict || judecata.p !== rec.p) abatere = { verdict: rec.verdict, p: rec.p, pozitive: rec.pozitive, motiv: 'recalcularea din perioadele înghețate iese altfel decât judecata scrisă — rămâne cea scrisă; de verificat (fișier atins sau evaluator schimbat)' };
    }
  }
  return { perioade, noi, asteapta, judecata, judecataNoua, abatere };
}
/** Evaluarea pe perioadele ÎNGHEȚATE (robotul): judecata, monitorizarea și cifrele descriptive vin din fișier, nu din seriile de azi;
 *  `deScris` = liniile noi pentru fișierul care doar crește (perioadele înghețate în noaptea asta + judecata, o singură dată). */
function evalueazaInghetat(jurnal, serii, { k, versiune, sesiuni, inSus, judecaLa, inghetate, la }) {
  const g = ingheata(inghetate, jurnal, serii, { k, versiune, sesiuni, inSus, judecaLa, la });
  const valabile = g.perioade.filter((x) => !x.exclusa).map((x) => ({ zi: x.zi, dif: x.dif, sus: x.sus, jos: x.jos })), n = valabile.length, jd = g.judecata;
  const partial = judecaLa ? judeca(valabile, judecaLa) : null, poz = valabile.filter((x) => x.dif > 0).length;
  const randuri = g.perioade.flatMap((x) => x.r.map(([sym, ex, gr, cod, oprit]) => ({ sym, ex, gr, cod, oprit: oprit || null }))), nej = g.perioade.flatMap((x) => x.nej);
  const grup = (f) => { const a = randuri.filter(f).map((r) => r.ex); return { n: a.length, medie: medie(a) }; };
  const motive = {}; for (const [, m] of nej) motive[m] = (motive[m] || 0) + 1;
  return { k, principal: k === PROTOCOL.principal, perioade: n, necesare: judecaLa,
    pozitive: jd ? jd.pozitive : partial ? partial.pozitive : poz, p: jd ? jd.p : partial ? partial.p : null, medieDif: jd ? jd.medieDif : partial ? partial.medieDif : medie(valabile.map((x) => x.dif)),
    verdict: !judecaLa ? 'monitorizare' : jd ? jd.verdict : 'astept', persistenta: jd ? jd.persistenta : null, rezerve: jd ? jd.rezerve : null,
    judecata: judecataDin({ la: judecaLa, data: jd ? jd.data : null, verdict: jd ? jd.verdict : null, unic: true }), abatereJudecata: g.abatere,
    monitorizare: { perioade: n, pozitive: poz, medieDif: medie(valabile.map((x) => x.dif)), dupaJudecata: judecaLa ? Math.max(0, n - judecaLa) : n, inAsteptare: g.asteapta.length },
    descriptiv: { sus: grup((r) => r.gr === 1), jos: grup((r) => r.gr !== 1), indeplineste: grup((r) => r.cod === 'm'), oprite: randuri.filter((r) => r.oprit).length, nejudecate: { n: nej.length, motive } },
    ultimaPerioada: valabile.at(-1) || null, starturi: valabile.map((x) => x.zi), inAsteptare: g.asteapta.map((x) => x.zi), inghetate: g.perioade.length,
    deScris: g.noi.concat(g.judecataNoua ? [g.judecataNoua] : []) };
}
/** Evaluarea pe un orizont: perioadele, judecata unică la `judecaLa` perioade (implicit cele cerute de protocol pentru k; `null` = orizont doar de
 *  monitorizare, fără verdict), monitorizarea de după, cifrele descriptive și nejudecatele. `inSus` alege grupul SUS (implicit V1: ≥ 6 verificări);
 *  proba Premarket dă „în Top Long”. Cu `inghetate` (lista din fișierul înghețat — robotul): pe perioadele înghețate (🔴2); fără: pe tot jurnalul. */
export function evalueaza(jurnal, serii, { k, versiune, sesiuni, inSus = (r) => r.trecute >= PROTOCOL.pragSus, judecaLa = PROTOCOL.perioadeCerute[k] ?? null, inghetate = null, la = null }) {
  if (Array.isArray(inghetate)) return evalueazaInghetat(jurnal, serii, { k, versiune, sesiuni, inSus, judecaLa, inghetate, la });
  const { perioade, rows, nejudecate } = perioadeDin(jurnal, serii, { k, versiune, sesiuni, inSus });
  const n = perioade.length, j = judecaLa ? judeca(perioade, judecaLa) : { gata: false, pozitive: perioade.filter((x) => x.dif > 0).length, p: null, medieDif: medie(perioade.map((x) => x.dif)), verdict: 'monitorizare', persistenta: null, rezerve: null }, idx = new Map(sesiuni.map((d, i) => [d, i]));
  const inchisa = (zi) => { const i = idx.get(zi); return i !== undefined && i + k < sesiuni.length ? sesiuni[i + k] : null; };
  const data = j.gata ? inchisa(perioade[judecaLa - 1].zi) : null;
  const grup = (f) => { const a = rows.filter(f).map((r) => r.ex); return { n: a.length, medie: medie(a) }; };
  const motive = {}; for (const r of nejudecate) motive[r.nejudecat] = (motive[r.nejudecat] || 0) + 1;
  return { k, principal: k === PROTOCOL.principal, perioade: n, necesare: judecaLa, pozitive: j.pozitive, p: j.p, medieDif: j.medieDif, verdict: j.verdict, persistenta: j.persistenta, rezerve: j.rezerve,
    judecata: judecataDin({ la: judecaLa, data, verdict: j.gata ? j.verdict : null, unic: true }),
    monitorizare: { perioade: n, pozitive: perioade.filter((x) => x.dif > 0).length, medieDif: medie(perioade.map((x) => x.dif)), dupaJudecata: judecaLa ? Math.max(0, n - judecaLa) : n },
    descriptiv: { sus: grup(inSus), jos: grup((r) => !inSus(r)), indeplineste: grup((r) => r.cod === 'm'), oprite: rows.filter((r) => r.oprit).length, nejudecate: { n: nejudecate.length, motive } },
    ultimaPerioada: perioade.at(-1) || null, starturi: perioade.map((x) => x.zi) };
}

/* ---------- contractul cu panourile (I-741 / I-744): puterea, primul verdict, judecata ---------- */
/** Câmpurile de contract pentru un orizont evaluat: `putere.laPlus` din protocol, `primulVerdict` pe calendarul NYSE, `judecata` din evaluare. */
/** Câmpurile de contract în fișierul robotului: pe fiecare orizont și, la nivelul de sus, ale orizontului principal; `sesiuni` = câte
 *  sesiuni NYSE sunt notate din câte erau de notat de la prima zi a versiunii (zilele pierdute împing data „realistă”). */
export function contractProba(orizonturi, { jurnal, versiune, cal, azi, putere = PROTOCOL.putere }) {
  const zile = (jurnal?.zile || []).filter((z) => z.v === versiune && z.zi).map((z) => z.zi).sort(), inceput = zile[0] || null;
  const asteptate = inceput ? sesiuniIntre(cal, inceput, zile.at(-1)) + 1 : 0, notate = new Set(zile).size;
  const out = orizonturi.map((o) => ({ ...o, ...contract(o, { cal, azi, inceput, notate, asteptate, putere }) })), p = out.find((o) => o.principal) || out[0] || null;
  return { orizonturi: out, putere: p ? p.putere : null, primulVerdict: p ? p.primulVerdict : null, judecata: p ? p.judecata : null, sesiuni: { notate, asteptate } };
}
export function contract(o, { cal, azi, inceput = null, notate = 0, asteptate = 0, putere = PROTOCOL.putere, ce = 'perioade' }) {
  if (!o.necesare) return { putere: null, primulVerdict: null, judecata: o.judecata };   // 27.10.2026: orizont doar de monitorizare, fără verdict
  const rez = putere?.rezultate?.[o.k] || null, laPlus = putere.laPlus.map((pct) => ({ pct, putere: rez ? rez[String(pct)] ?? null : null }));
  const unu = (x) => (x * 100).toFixed(1).replace('.', ','), cu = laPlus.filter((x) => Number.isFinite(x.putere)).sort((a, b) => b.pct - a.pct);
  const text = cu.length ? `La ${o.necesare} perioade de ${o.k} sesiuni proba vede ` + cu.map((x) => `un avantaj de +${String(x.pct).replace('.', ',')} %/perioadă în ${unu(x.putere)} % din cazuri`).join(' și ') + '; sub atât, „nu s-a văzut un avantaj” e rezultatul cel mai probabil și nu înseamnă „s-a dovedit că nu”.' : null;
  return {
    putere: { laPlus, perioade: o.necesare, lumi: putere.lumi, text, metoda: 'simulare mulberry32 pe înregistrări zilnice; +x % pe perioadă pentru grupul SUS; testul semnelor cu judecată unică la ' + o.necesare + ' perioade' },
    // 27.10.2026 (revizia F, 🔴2): perioadele închise încă neînghețate se numără la termen; judecata vine la înghețare (+ `asteptare` sesiuni)
    primulVerdict: primulVerdictDin({ cal, azi, inceput, starturi: (o.starturi || []).concat(o.inAsteptare || []), k: o.k, perioade: o.necesare, notate, asteptate, ce, dupa: Array.isArray(o.inAsteptare) ? PROTOCOL.asteptare : 0 }),
    judecata: o.judecata
  };
}

/* ---------- puterea (I-741): simulare pe lumi sintetice cu înregistrări zilnice ---------- */
function zileLucratoare(n, de = '2026-01-05') { const out = []; let t = Date.parse(de + 'T12:00:00Z'); while (out.length < n) { const x = new Date(t); if (x.getUTCDay() % 6) out.push(x.toISOString().slice(0, 10)); t += 86400000; } return out; }
/** O lume: `verificate` acțiuni cu înregistrări în FIECARE sesiune (ca jurnalul real), SPY ca reper; în fiecare zi `sus` acțiuni (la întâmplare,
 *  cu persistență) sunt în grupul SUS; cele din SUS în ziua unui start primesc +`avantaj` (fracție) pe perioada de k sesiuni care începe atunci. */
export function simuleaza(seed, { k, perioade, avantaj = 0, verificate = PROTOCOL.putere.verificate, sus = PROTOCOL.putere.grup.sus, sigmaZi = PROTOCOL.putere.sigmaZi, sigmaPiata = PROTOCOL.putere.sigmaPiata, cod = 'trecute' } = {}) {
  const rnd = mulberry32(seed), g = gauss(rnd), n = perioade * k + k + 1, d = zileLucratoare(n), V = 'sim';
  const spy = [{ d: d[0], c: 100 }]; for (let i = 1; i < n; i++) spy.push({ d: d[i], c: spy[i - 1].c * (1 + sigmaPiata * g()) });
  const simboluri = Array.from({ length: verificate }, (_, i) => 'S' + i), serii = { SPY: spy }, jurnal = { zile: [] };
  // apartenența la SUS: în fiecare zi se re-trag `sus` acțiuni, dar jumătate rămân din ziua precedentă (persistență, ca listele reale)
  let inSus = new Set(simboluri.slice().sort(() => rnd() - 0.5).slice(0, sus));
  const membri = [];
  for (let i = 0; i < n; i++) {
    if (i) { const raman = [...inSus].filter(() => rnd() < 0.5), rest = simboluri.filter((s) => !inSus.has(s)).sort(() => rnd() - 0.5); inSus = new Set(raman.concat(rest.slice(0, sus - raman.length))); }
    membri.push(inSus);
  }
  const bonus = avantaj / k, startSus = (i) => membri[Math.floor(i / k) * k];
  for (const s of simboluri) { const a = [{ d: d[0], c: 50 }]; for (let i = 1; i < n; i++) { const r = spy[i].c / spy[i - 1].c - 1 + sigmaZi * g() + (startSus(i - 1).has(s) ? bonus : 0); a.push({ d: d[i], c: a[i - 1].c * (1 + r) }); } serii[s] = a; }
  for (let i = 0; i < n; i++) jurnal.zile.push({ zi: d[i], v: V, la: d[i] + 'T22:00:00Z', r: simboluri.map((s) => (cod === 'trecute' ? [s, membri[i].has(s) ? 'n' : 'n', membri[i].has(s) ? 7 : 3, d[i], 'SPY'] : [s, membri[i].has(s) ? 'm' : 'n', 60, d[i], 'SPY', ''])) });
  return { jurnal, serii, sesiuni: d, versiune: V };
}
/** Puterea testului semnelor cu judecată unică, pe o grilă de perioade cerute (eșantioane fixe, aceeași lume), pentru avantaje în % pe perioadă.
 *  Întoarce { k, lumi, sigmaPerioada (sub H0), rezultate: { [N]: { '0': fals pozitiv, [pct]: putere } } }. */
/** 27.10.2026 (revizia F, 🟡6): `sigmaZi` se poate da (abaterea zilnică idiosincratică aleasă ca SUS − JOS pe o perioadă să aibă abaterea
 *  MĂSURATĂ pe motorul real; `sigmaZiPentru`), în locul celei fixe din protocol (2,2 %, prea mică pentru universul Core). */
export function sigmaZiPentru(sigmaPerioada, { k, sus, jos }) { return sigmaPerioada / Math.sqrt(k * (1 / sus + 1 / jos)); }
export function putere({ k, grila = [8, 12, 16, 20, 24, 30, 36, 48, 60, 72, 96, 120], laPlus = [...PROTOCOL.putere.laPlus], lumi = PROTOCOL.putere.lumi, samanta = PROTOCOL.putere.samanta, inSus, cod = 'trecute', verificate, sus, sigmaZi = PROTOCOL.putere.sigmaZi } = {}) {
  const maxN = Math.max(...grila), avantaje = [0, ...laPlus], contor = {}, dife = [];
  for (const N of grila) { contor[N] = {}; for (const a of avantaje) contor[N][String(a)] = 0; }
  for (let w = 0; w < lumi; w++) for (const a of avantaje) {
    const lume = simuleaza(samanta + w * 7919 + Math.round(a * 1000), { k, perioade: maxN, avantaj: a / 100, cod, verificate, sus, sigmaZi });
    const { perioade } = perioadeDin(lume.jurnal, lume.serii, { k, versiune: lume.versiune, sesiuni: lume.sesiuni, inSus: inSus || (cod === 'trecute' ? (r) => r.trecute >= PROTOCOL.pragSus : (r) => r.cod === 'm') });
    if (a === 0 && w < 200) dife.push(...perioade.map((p) => p.dif));
    for (const N of grila) if (judeca(perioade, N).verdict === 'ajuta') contor[N][String(a)]++;
  }
  const rezultate = {}; for (const N of grila) { rezultate[N] = {}; for (const a of avantaje) rezultate[N][String(a)] = contor[N][String(a)] / lumi; }
  const m = medie(dife), sd = dife.length > 1 ? Math.sqrt(dife.reduce((s, x) => s + (x - m) ** 2, 0) / (dife.length - 1)) : null;
  return { k, lumi, grila, laPlus, sigmaPerioada: sd, rezultate };
}
/** Cel mai mic număr de perioade din grilă la care puterea la `pct` % pe perioadă atinge `prag` (null dacă niciunul). */
export function perioadeNecesare(rez, pct = 1, prag = 0.5) { for (const N of rez.grila) if ((rez.rezultate[N][String(pct)] || 0) >= prag) return N; return null; }

/* ---------- versiunea probei (I-743): amprenta SHA a regulilor V1 + a evaluatorului ---------- */
/** Regulile V1 = închiderea tranzitivă din lib/independent-scanner.js pornind de la evaluarea unei acțiuni și de la verificarea reperului;
 *  textele de afișaj (etichetele verificărilor, descrierea regulilor, șirul VERSION, universul implicit al paginii) nu decid verdictul. */
export const RADACINI_V1 = Object.freeze(['evaluate', 'benchmarkSource']), AFISAJ_V1 = Object.freeze(['LABELS', 'rule', 'VERSION', 'DEFAULT_UNIVERSE']);
export function FUNCTII_V1(srcScanner) { return inchidere(srcScanner, RADACINI_V1, { exclude: AFISAJ_V1 }); }
const REGULI = () => JSON.stringify({ COD, orizonturi: PROTOCOL.orizonturi, principal: PROTOCOL.principal, perioadeCerute: PROTOCOL.perioadeCerute, minPeGrup: PROTOCOL.minPeGrup, alfa: PROTOCOL.alfa, pragSus: PROTOCOL.pragSus, pragPersistenta: PROTOCOL.pragPersistenta, asteptare: PROTOCOL.asteptare, univers: PROTOCOL.univers });
/** Funcțiile de aici care JUDECĂ (toate cele prin care trece un rând până la verdict). */
// 27.10.2026 (revizia F, 🟡7): și înregistrarea zilei (`inregistrare` cu `COD`, în REGULI) și `adauga` — ele decid ce intră în grupuri
export const FUNCTII_EVALUATOR = Object.freeze(['inregistrare', 'adauga', 'laData', 'indexLa', 'excese', 'excesRec', 'pSemne', 'starturi', 'medie', 'perioadeDin', 'judeca', 'persistenta', 'evalueaza', 'citesteInghetat', 'ingheata', 'evalueazaInghetat']);
/** Amprenta evaluatorului V1 (funcțiile care judecă + regulile din PROTOCOL, fără cifrele puterii). */
export function amprentaEvaluator() { return amprentaFunctii({ inregistrare, adauga, laData, indexLa, excese, excesRec, pSemne, starturi, medie, perioadeDin, judeca, persistenta, evalueaza, citesteInghetat, ingheata, evalueazaInghetat }, FUNCTII_EVALUATOR, REGULI()); }
/** Versiunea probei Reguli V1: `v1-` + SHA pe textul regulilor din scanner (CRLF = LF) și pe evaluator. */
export function versiuneV1(srcScanner) { return 'v1-' + amprentaText(srcScanner, FUNCTII_V1(srcScanner), amprentaEvaluator()); }

/* ---------- mărimea testului cu persistență (I-741, scrisă înainte) ---------- */
/** Rata „ajută” sub H0 a judecății unice la N perioade, când diferențele perioadelor au autocorelare ρ (AR(1) gaussian, medie 0):
 *  cu ρ = 0 e coada binomială exactă; cu ρ > 0 semnele vin în șiruri și testul semnelor minte mai des. mulberry32, sămânță fixă. */
export function marimeSemneAR({ rho = 0, N, lumi = 20000, samanta = 27102026 } = {}) {
  const g = gauss(mulberry32(samanta + Math.round(rho * 1000) + N)), s = Math.sqrt(1 - rho * rho); let fals = 0;
  for (let w = 0; w < lumi; w++) { const p = []; let x = g(); for (let i = 0; i < N; i++) { if (i) x = rho * x + s * g(); p.push({ dif: x }); } if (judeca(p, N).verdict === 'ajuta') fals++; }
  return fals / lumi;
}
