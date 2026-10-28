// trend-12-1-lib.mjs — funcțiile pure ale robotului „Trend 12 luni” (14.10.2026).
//
// Semnalul: primele 20 % dintre acțiunile SUA lichide după randamentul pe lunile 2–12 (ultima lună de bursă SĂRITĂ),
// cu momentum pozitiv. Auditul de dimineață (14.10.2026, mom12_audit.txt) a dat +0,9 % pe 20 de zile față de ALTE acțiuni în aceleași
// zile cu „p 0,000” — numărat pe ZILE care se suprapun. Auditul de seară (docs/AUDIT-PROBA-TREND-SCOR-2026-10-14.md, audit_proba_1410.txt),
// pe ferestre de 20 de zile NESUPRAPUSE (48): +0,8 %, t ≈ 1,5, Sharpe deflat 75 % cu 7 variante încercate ⇒ INDICIU, nu probat.
// NEPROBAT nici față de aceleași acțiuni în alte zile (lista e a supraviețuitorilor de azi).
// Planul Desk-ului (stop 1,25 ATR / țintă 2R) anulează efectul ⇒ modul nu construiește plan.
//
//   mom12 = C[t−21] / C[t−252] − 1 · mom6 = C[t−21] / C[t−126] − 1 · rang = poziția / numărul de acțiuni clasate
//   regim = SPY închis peste media simplă pe 200 de zile (2022, an negativ, cade când regimul e oprit)

import { readFileSync } from 'node:fs';
import { mulberry32, gauss, amprentaFunctii, amprentaText, inchidere, dupaSesiuni, sesiuniIntre, primulVerdict, intervalPentru, judecata as judecataDin } from '../lib/proba-contract.mjs';
import { ETICHETA_NEVERIFICAT } from './discord-mesaj.mjs';

const zi = (t) => new Date(t).toISOString().slice(0, 10);

/** Rândurile screenerului Nasdaq ⇒ universul: SUA, fără preferențiale / note / warrants / units / rights, cap ≥ minCap, primele n după cap. */
export function curataUnivers(rows, o = {}) {
  const minCap = o.minCap ?? 2e9, n = o.n ?? 600, out = [];
  for (const x of Array.isArray(rows) ? rows : []) {
    const s = String(x && x.symbol || '').trim(), nume = String(x && x.name || ''), cap = Number(x && x.marketCap);
    if (!s || /\^/.test(s) || /\b(Preferred|Depositary|Notes?|Debentures?|Warrants?|Units?|Rights?)\b/i.test(nume)) continue;
    if (x.country !== 'United States' || !(cap >= minCap)) continue;
    out.push({ s: s.replace('/', '-'), nume: nume.replace(/\s+(Common Stock|Class [A-Z] Common Stock|Ordinary Shares|Inc\.?)$/i, '').slice(0, 60), sector: String(x.sector || ''), cap });
  }
  out.sort((a, b) => b.cap - a.cap);
  return out.slice(0, n);
}

/** I-715 (19.10.2026): instantaneul DATAT al universului — TOATE acțiunile SUA ≥ minCap din screener în ziua aceea (nu doar primele N),
    ca în 12–24 de luni orice regulă să se poată testa pe universul de ATUNCI, fără părtinirea supraviețuitorilor (lista de azi).
    { d: ziua New York, la, minCap, n, l: [[simbol, capitalizare în mld. $ cu o zecimală, sector]] } */
export function instantaneuUnivers(rows, la, minCap = 2e9) {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(la));
  const l = curataUnivers(rows, { minCap, n: Infinity }).map((x) => [x.s, Math.round(x.cap / 1e8) / 10, x.sector]);
  return { d, la, minCap, n: l.length, l };
}
export const caleArhivaUnivers = (d) => 'univers-sua-istoric/' + d.slice(0, 4) + '/' + d + '.json.gz';

/** serii = { simbol: bare[] } (bare zilnice {t,o,h,l,c,v}), spy = bare[] ⇒ clasamentul 12-1 al zilei. */
export function clasament(serii, spy, o = {}) {
  const top = o.top ?? 40, minPret = o.minPret ?? 5, minDolari = o.minDolari ?? 1e7;
  const dataUltimei = zi(spy[spy.length - 1].t), excluse = { pret: 0, bani: 0, scurt: 0, vechi: 0 }, l = [], faraDate = [];
  // 15.10.2026: robotul rulat târziu (00:51 UTC) găsea 136 de acțiuni fără bara zilei (Yahoo încă n-o dăduse) ⇒ „au ieșit din univers”,
  // chiar primele din top. O zi de întârziere NU mai scoate acțiunea: se clasează pe ultima ei zi (12-1 sare oricum ultima lună), marcată
  // `intarziat`; 2+ zile ⇒ „vechi”, exclusă și pusă în `faraDate` (nu e o ieșire din trend, e o lipsă de date).
  const ziuaDinainte = spy.length > 1 ? zi(spy[spy.length - 2].t) : null;
  let intarziate = 0;
  for (const [s, b] of Object.entries(serii)) {
    if (!Array.isArray(b) || b.length < 260) { excluse.scurt++; continue; }
    const n = b.length;
    const ultimaZi = zi(b[n - 1].t), intarziat = ultimaZi !== dataUltimei && ultimaZi === ziuaDinainte;
    if (ultimaZi !== dataUltimei && !intarziat) { excluse.vechi++; faraDate.push(s); continue; }
    const pret = b[n - 1].c;
    if (!(pret >= minPret)) { excluse.pret++; continue; }
    const dolari20 = b.slice(-20).reduce((a, x) => a + x.c * x.v, 0) / 20;
    if (!(dolari20 >= minDolari)) { excluse.bani++; continue; }
    // 14.10 („fă toate”): cel mai mare salt close-to-close într-o zi din fereastra 12-1 — split neajustat / reverse split / glitch / știre (MRNA +177 %
    // într-un pas pe 14.10). Se PUBLICĂ, nu se taie: robotul măsoară, omul verifică seria înainte să creadă cifra 12-1.
    l.push({ s, pret, m12: b[n - 22].c / b[n - 253].c - 1, m6: b[n - 22].c / b[n - 127].c - 1, r60: n > 61 ? b[n - 1].c / b[n - 61].c - 1 : null, dolari20, ultima: zi(b[n - 1].t), salt: saltMaxim(b.slice(n - 253)), ...(intarziat ? { intarziat: true } : {}) });
    if (intarziat) intarziate++;
  }
  l.sort((a, b) => b.m12 - a.m12);
  const n = l.length;
  l.forEach((x, i) => { x.rang = i / n; });
  return { dataUltimei, n, excluse, intarziate, faraDate, clasament: l.filter((x) => x.m12 > 0).slice(0, top), toate: l, clasate: l.map((x) => x.s) };
}

/** 15.10.2026: câte acțiuni au date VECHI (2+ zile) din cele care puteau fi clasate. ≤ 5 % ⇒ public; peste ⇒ prima încercare (22:40 UTC)
 *  nu publică și lasă a doua (03:10 UTC) să reîncerce; a doua încercare cu tot peste 5 % ⇒ pică (Discord „robotul a PICAT”, I-629). */
export function decizieDateVechi({ vechi, baza, incercare } = {}) {
  if (!(baza > 0) || !(vechi / baza > 0.05)) return 'public';
  return incercare === 'a doua' ? 'pica' : 'reincerc';
}

/** Cel mai mare salt close-to-close într-o zi (fracție, cu ziua lui); null sub 2 bare. Nu judecă: un split neajustat și o știre arată la fel. */
export function saltMaxim(b) {
  let pct = 0, d = null;
  for (let i = 1; i < (b || []).length; i++) { const p = b[i - 1].c; if (!(p > 0) || !(b[i].c > 0)) continue; const v = Math.abs(b[i].c / p - 1); if (v > pct) { pct = v; d = zi(b[i].t); } }
  return d ? { pct: +pct.toFixed(4), d } : null;
}

/** Calendarul Finnhub (14 zile, toate raportările) ⇒ { simbol: {d, ora, zile} } — prima raportare a simbolului, zilele de la data clasamentului. */
export function raporteazaDinCalendar(items, dataUltimei) {
  const out = {}, t0 = Date.parse(dataUltimei + 'T12:00:00Z');
  for (const e of Array.isArray(items) ? items : []) {
    const s = String(e && e.symbol || '').replace(/^([A-Z][A-Z0-9]{0,4})\.([A-Z])$/, '$1-$2');   // revizie 14.10: BRK.B (Finnhub) = BRK-B (Yahoo)
    if (!/^[A-Z][A-Z0-9]{0,4}(-[A-Z])?$/.test(s) || !e.date || out[s]) continue;
    const zile = Math.round((Date.parse(e.date + 'T12:00:00Z') - t0) / 86400000);
    if (!Number.isFinite(zile)) continue;
    out[s] = { d: e.date, ora: e.hour || '', zile };
  }
  return out;
}

/** Cine a ieșit din primele 20 față de ziua dinainte (linia din istoric) și de ce. */
export function iesiri(prev, clasat, rg, faraDate) {   /* 15.10: faraDate = Set cu acțiunile fără date azi (nu sunt ieșiri) */
  if (!prev || !Array.isArray(prev.top)) return [];
  const azi = new Map((clasat || []).map((x) => [x.s, x])), out = [];
  for (const [s] of prev.top) {
    const x = azi.get(s);
    if (rg && rg.peste === false && prev.regim === true) { out.push({ s, motiv: 'regimul s-a oprit (SPY sub media pe 200 de zile)', rangAzi: x ? x.rang : null, m12: x ? x.m12 : null }); continue; }   // revizie 14.10: doar la OPRIRE, nu zilnic cât e oprit
    if (!x && faraDate && faraDate.has(s)) continue;   /* 15.10: lipsă de date, nu ieșire din trend */
    if (!x) { out.push({ s, motiv: 'a ieșit din univers', rangAzi: null, m12: null }); continue; }
    if (!(x.m12 > 0)) { out.push({ s, motiv: 'momentum 12-1 sub zero', rangAzi: x.rang, m12: x.m12 }); continue; }
    if (x.rang >= 0.2) out.push({ s, motiv: 'a căzut la top ' + (x.rang * 100).toFixed(1).replace('.', ',') + ' %', rangAzi: x.rang, m12: x.m12 });
  }
  return out;
}

/** Cine a intrat în primele 20 față de ziua dinainte. */
export function intrari(prev, top) {
  const fost = new Set(prev && Array.isArray(prev.top) ? prev.top.map(([s]) => s) : []);
  return (top || []).filter((x) => !fost.has(x.s));
}

/** Mesajul pentru Discord — doar când s-a schimbat ceva (regim, intrări, ieșiri); cine raportează e informație în plus. */
export function mesajDiscord(o) {
  const peste = !!(o.regim && o.regim.peste), flip = o.regimPrev != null && o.regimPrev !== peste;
  const intr = o.intrari || [], ies = o.iesiri || [], rap = (o.raporteaza || []).filter((r) => Number.isFinite(r.zile) && r.zile >= 0 && r.zile <= 14);
  if (!flip && !intr.length && !ies.length) return '';
  const L = ['**Trend 12 luni · ' + o.dataUltimei + '** · regim ' + (peste ? 'pornit' : 'OPRIT') + (flip ? ' (schimbat)' : '')];
  if (intr.length) L.push('intrat: ' + intr.map((x) => x.s + (Number.isFinite(x.m12) ? ' (' + (x.m12 >= 0 ? '+' : '') + (x.m12 * 100).toFixed(1).replace('.', ',') + ' %)' : '')).join(', '));
  if (ies.length) L.push('ieșit: ' + ies.map((x) => x.s + ' — ' + x.motiv).join('; '));
  if (rap.length) L.push('raportează: ' + rap.map((r) => r.s + ' în ' + r.zile + 'z' + (r.ora ? ' ' + r.ora : '')).join(', '));
  const sal = (o.salturi || []).filter((x) => x && Number.isFinite(x.pct) && x.pct >= 0.5);
  if (sal.length) L.push('salt într-o zi, verifică seria: ' + sal.map((x) => x.s + ' ' + Math.round(x.pct * 100) + ' %' + (x.d ? ' (' + x.d + ')' : '')).join(', '));
  L.push('_în probă; nu e un buton de cumpărat — detalii în Candidate Engine → Trend 12 luni_');
  let m = L.join('\n'); if (m.length > 1900) m = m.slice(0, 1880) + '…';
  return m;
}

/** Garda de formă a fișierelor publicate (I-619): întoarce lista problemelor; goală = bine. */
export function validareFisiere(j, jsonl) {
  const p = [];
  if (!j || typeof j !== 'object') return ['JSON lipsă'];
  if (j.versiune !== 1) p.push('versiune ≠ 1');
  const ziOk = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T12:00:00Z')) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s;
  if (!ziOk(j.dataUltimei)) p.push('dataUltimei nu e o zi validă');
  if (!j.regim || (typeof j.regim.peste !== 'boolean' && j.regim.peste !== null)) p.push('regim.peste nu e boolean');
  if (!Array.isArray(j.clasament) || j.clasament.length > 40) p.push('clasament lipsă sau > 40');
  else if (!j.clasament.length) p.push('clasament gol');
  else j.clasament.forEach((x, i) => { if (!x || typeof x.s !== 'string' || !['pret', 'm12', 'm6', 'rang'].every((k) => Number.isFinite(x[k])) || !Array.isArray(x.spark)) p.push('clasament[' + i + '] fără câmpurile cerute'); });
  const linii = String(jsonl || '').split('\n').filter(Boolean);
  if (!linii.length) p.push('istoric gol');
  let ultima = null;   // revizie 14.10: doar ULTIMA linie trebuie să fie bună — o linie veche stricată nu blochează robotul pentru totdeauna
  linii.forEach((l, i) => { const e = i === linii.length - 1; try { const o = JSON.parse(l); if (e && (!ziOk(o.d) || !Array.isArray(o.top))) p.push('istoric linia ' + (i + 1) + ' fără d/top'); if (e) ultima = o; } catch { if (e) p.push('istoric linia ' + (i + 1) + ' nu e JSON'); } });
  if (ultima && ultima.d !== j.dataUltimei) p.push('istoric: ultima zi ' + ultima.d + ' ≠ dataUltimei ' + j.dataUltimei);
  return p;
}

// mulberry32 — generatorul cerut de regula din 06.10
function rnd(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// revizie 14.10: ferestrele de 20 de zile luate zi de zi se SUPRAPUN (regula din 06.10 despre puține observații independente) ⇒
// bootstrap pe BLOCURI de `bloc` observații consecutive (circular), nu pe observații una câte una
// 14.10 seara (audit „probă statistică”, calibrare_bilant_1410 / calibrare_secventa_1410 pe E:): criteriul vechi (marginea bootstrap pe
// zile suprapuse) dădea „probat” în 13 % și „picat” în 9 % din lumile FĂRĂ avantaj. Noul criteriu: t pe ferestrele de 20 de zile care NU se
// suprapun, prag 3,2 — ales în lumea fără avantaj, ca „probat” fals să rămână sub 5 % în 5 ani de priviri săptămânale (4,3 %). Prețul,
// spus cinstit: cu avantajul din istorie trece în ~25 % din cazuri în 3 ani și ~34 % în 5 ani.
export const T_PRAG = 3.2;
/** 27.10.2026: sesiuni de așteptat după orizont înainte ca o acțiune fără date să fie tratată ca delistată (ca la Clasificator și V1). */
export const ASTEPTARE = 10;
// pragurile de ABATERE live, scrise ÎNAINTE de date (14.10.2026): percentila 5 a mediei pe k ferestre dacă avantajul ar fi cel din istorie
// (+0,78 % pe fereastră, abatere 3,51 %, bootstrap pe ferestrele reale); peste 12 ferestre: 0,78 % − 1,645 × 3,51 % / √k
export const PRAG_ABATERE = [[12, -0.0090], [9, -0.0124], [6, -0.0180], [3, -0.0295]];
export function pragAbatere(k) {
  if (!(k >= 3)) return null;
  if (k > 12) return 0.0078 - 1.645 * 0.0351 / Math.sqrt(k);
  for (const [n, p] of PRAG_ABATERE) if (k >= n) return p;
  return null;
}
/** Ferestrele care nu se suprapun: din (indexul zilei în calendarul SPY, valoare), câte una la cel puțin h zile de bursă de precedenta. */
export function ferestreNesuprapuse(perechi, h) {
  const out = []; let ult = -Infinity;
  perechi.slice().sort((a, b) => a[0] - b[0]).forEach(([i, v]) => { if (i >= ult + h) { out.push(v); ult = i; } });
  return out;
}
function interval(v, extr = 1000, bloc = 20) { if (!v.length) return [null, null]; const R = rnd(7), bs = [], n = v.length, b = Math.min(bloc, n); for (let k = 0; k < extr; k++) { let s = 0, c = 0; while (c < n) { const st = Math.floor(R() * n); for (let j = 0; j < b && c < n; j++, c++) s += v[(st + j) % n]; } bs.push(s / n); } bs.sort((a, b2) => a - b2); return [bs[Math.floor(extr * 0.05)], bs[Math.floor(extr * 0.95)]]; }

/**
 * Bilanțul probei (I-614): pe fiecare zi din istoric cu h zile de bursă după ea, randamentul mediu al primelor 20 la h zile față de SPY
 * (intrare la deschiderea zilei următoare, cost 0,3 %) și același lucru pentru universul zilei (nulul B: alte acțiuni, aceleași zile).
 * Interval pe ZILE (bootstrap). Verdict după criteriile pre-înregistrate pe 14.10.2026: ≥ 30 de zile cu rezultat la 20 z și marginea de 5 %
 * a diferenței față de univers > 0 ⇒ „probat față de alte acțiuni”; ≥ 60 de zile și marginea de 95 % < 0 ⇒ „picat”; altfel „în probă”.
 */
export function bilant(istoric, preturi, o = {}) {
  const H = o.h || [20, 60], COST = 0.003, spy = preturi.SPY || [];
  // 27.10.2026 (revizia F, 🔴3): cu `o.inghetate` (fișierul trend-12-1-inghetat.jsonl), zilele deja înghețate își iau cifrele din fișier
  // (nu se mai recalculează din Yahoo), iar zilele cu orizontul + ASTEPTARE sesiuni scurse se întorc în `deIngheta` (de adăugat în fișier)
  const ing = Array.isArray(o.inghetate) ? new Map(o.inghetate.filter((x) => x && x.tip === 'zi').map((x) => [x.h + '|' + x.d, x])) : null, deIngheta = [];
  const idx = {}; for (const [s, b] of Object.entries(preturi)) { const m = new Map(); (b || []).forEach((x, i) => m.set(zi(x.t), i)); idx[s] = m; }
  const rez = {}, nej = {}, opr = {}, vazut = new Set(); for (const h of H) { rez[h] = { top: [], nul: [], dif: [], si: [] }; nej[h] = { n: 0, motive: {} }; opr[h] = 0; }
  // 27.10.2026 (docs/trend-12-1-protocol.md, scris înaintea primei ferestre): o acțiune fără date la ASTEPTARE sesiuni după orizont iese la
  // ultima închidere cunoscută (față de SPY pe aceleași date); fără serie / fără ziua intrării ⇒ „nejudecată”, cu motiv (înainte: tăcut afară)
  const nejudecat = (h, l, s, motiv, loc) => { const k = h + '|' + l.d + '|' + s; if (vazut.has(k)) return; vazut.add(k); nej[h].n++; nej[h].motive[motiv] = (nej[h].motive[motiv] || 0) + 1; if (loc) loc.nej[motiv] = (loc.nej[motiv] || 0) + 1; };
  let zile = 0;
  for (const l of istoric || []) {
    if (!l || !Array.isArray(l.top) || !l.d) continue; zile++;
    const si = idx.SPY ? idx.SPY.get(l.d) : null;
    for (const h of H) {
      const f = ing && ing.get(h + '|' + l.d);
      if (f) {   // ziua înghețată: cifrele din fișier; SPY trebuie doar s-o așeze în calendar (ferestrele care nu se suprapun)
        if (si == null) throw Error('SPY nu acoperă ziua înghețată ' + l.d + ' — prețurile trebuie să acopere tot istoricul; bilanțul vechi rămâne');
        for (const [m, n] of Object.entries(f.nej || {})) { nej[h].n += n; nej[h].motive[m] = (nej[h].motive[m] || 0) + n; } opr[h] += f.oprite || 0;
        if (f.top === null) continue;
        rez[h].top.push(f.top); if (f.nul !== null) { rez[h].nul.push(f.nul); rez[h].dif.push(f.top - f.nul); rez[h].si.push(si); }
        continue;
      }
      if (si == null || si + h >= spy.length) continue;
      const zIn = zi(spy[si + 1].t), zOut = zi(spy[si + h].t), spyR = spy[si + h].c / spy[si + 1].o - 1, gata = si + h + ASTEPTARE < spy.length, loc = { nej: {}, opr: 0 };
      // revizie 14.10: intrarea și ieșirea pe DATELE calendarului SPY, nu pe indicii acțiunii (o zi lipsă nu mai decalează fereastra)
      const rand = (s) => {
        const b = preturi[s], m = idx[s]; if (!b || !m || !b.length) { if (gata) nejudecat(h, l, s, 'fără serie (delistată sau sursă indisponibilă)', loc); return null; }
        const i0 = m.get(zIn), i1 = m.get(zOut); if (i0 == null) { if (gata) nejudecat(h, l, s, 'ziua intrării lipsește din serie', loc); return null; }
        if (i1 != null) return b[i1].c / b[i0].o - 1 - COST - spyR;
        const ult = b.length - 1, dUlt = zi(b[ult].t), sj = idx.SPY.get(dUlt);
        if (!gata || dUlt >= zOut) return null;   // încă nu s-a încheiat sau datele întârzie
        if (ult <= i0 || sj == null) { nejudecat(h, l, s, 'seria s-a oprit în ziua intrării', loc); return null; }
        const k = 'o|' + h + '|' + l.d + '|' + s; if (!vazut.has(k)) { vazut.add(k); opr[h]++; loc.opr++; }
        return b[ult].c / b[i0].o - 1 - COST - (spy[sj].c / spy[si + 1].o - 1);
      };
      const top = l.top.map(([s]) => rand(s)).filter((v) => v !== null);
      const univ = top.length ? (l.univers || []).map(rand).filter((v) => v !== null) : [];
      const mTop = top.length ? top.reduce((a, b) => a + b, 0) / top.length : null, mUniv = univ.length ? univ.reduce((a, b) => a + b, 0) / univ.length : null;
      if (ing && gata) deIngheta.push({ tip: 'zi', d: l.d, h, top: mTop, nul: mTop === null ? null : mUniv, nTop: top.length, nUniv: univ.length, nej: loc.nej, oprite: loc.opr });
      if (!top.length) continue;
      rez[h].top.push(mTop); if (mUniv !== null) { rez[h].nul.push(mUniv); rez[h].dif.push(mTop - mUniv); rez[h].si.push(si); }
    }
  }
  const medie = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const r20 = rez[H[0]], r60 = rez[H[1]] || { top: [], nul: [], dif: [] }, dif20 = interval(r20.dif, 1000, H[0]);
  // 14.10 seara: observațiile independente = ferestrele de 20 de zile care NU se suprapun (pe calendarul SPY); testul t pe ele
  const w = ferestreNesuprapuse(r20.si.map((s, i) => [s, r20.dif[i]]), H[0]), ferestre20 = w.length, mW = medie(w);
  const sW = ferestre20 > 1 ? Math.sqrt(w.reduce((a, x) => a + (x - mW) ** 2, 0) / (ferestre20 - 1)) : null;
  const t20 = ferestre20 > 1 ? Math.max(-99, Math.min(99, sW > 0 ? mW / (sW / Math.sqrt(ferestre20)) : mW > 0 ? 99 : mW < 0 ? -99 : 0)) : null;
  const se20 = ferestre20 > 1 ? sW / Math.sqrt(ferestre20) : null, mDif = medie(r20.dif);
  const difInterval = se20 != null && mDif != null ? [mDif - 2 * se20, mDif + 2 * se20] : dif20;   // ± 2 erori standard măsurate pe ferestre
  let verdict = 'în probă';
  if (ferestre20 >= 12 && t20 > T_PRAG) verdict = 'probat față de alte acțiuni';
  else if (ferestre20 >= 12 && t20 < -T_PRAG) verdict = 'picat față de alte acțiuni';
  const prag = pragAbatere(ferestre20), abatere = prag == null ? null : { k: ferestre20, medie: mW, prag, atinsa: mW < prag };
  const starturi20 = ferestreNesuprapuse(r20.si.map((s) => [s, s]), H[0]).map((s) => zi(spy[s].t));   // ziua de start a fiecărei ferestre
  return {
    zile, n20: r20.top.length, n60: r60.top.length, ferestre20, starturi20, nejudecate: nej, oprite: opr, deIngheta,
    exces20: medie(r20.top), exces60: medie(r60.top), nulB20: medie(r20.nul), nulB60: medie(r60.nul),
    interval20: interval(r20.top, 1000, H[0]), diferenta20: { medie: mDif, interval: difInterval, ferestre: mW }, t20, abatere, diferenta60: { medie: medie(r60.dif), interval: interval(r60.dif, 1000, H[1] || 60) },
    verdict, criterii: 'cel puțin 12 ferestre de 20 de zile care nu se suprapun și t > 3,2 pe diferența față de universul zilei ⇒ probat; t < −3,2 ⇒ picat; altfel în probă. Pragul e ales (14.10.2026) ca „probat” fals să rămână sub 5 % în 5 ani de priviri săptămânale; cu avantajul din istorie trece în ~25 % din cazuri în 3 ani — după un an, cel mai probabil tot „în probă”. Abatere: media ferestrelor sub pragul scris înainte (−3,0 % după 3, −1,8 % după 6, −1,2 % după 9, −0,9 % după 12)',
  };
}

/** 27.10.2026 (revizia F, 🔴3): fișierul zilelor înghețate (JSONL, doar crește); o linie stricată oprește bilanțul. */
export function citesteInghetatTrend(text) { return String(text || '').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)); }
/** 27.10.2026 (I-764, revizia A–E): ce pleacă pe Discord — mesajul bilanțului + pe rând separat eticheta „generat automat · neverificat de om”. */
export function mesajBilantDiscord(prev, out) { const m = mesajBilant(prev, out); return m ? m + '\n-# ' + ETICHETA_NEVERIFICAT : ''; }
/** I-631: mesajul Discord al bilanțului — DOAR când verdictul s-a schimbat față de bilanțul dinainte (altfel ''). */
export function mesajBilant(prev, out) {
  // 14.10 seara: și ABATEREA (media live sub pragul scris înainte) se anunță o singură dată, când apare
  const a0 = !!(prev && prev.abatere && prev.abatere.atinsa), a = out && out.abatere, ab = a && a.atinsa && !a0 && Number.isFinite(a.medie) && Number.isFinite(a.prag)
    ? '**Trend 12 luni · ABATERE** · media pe ' + a.k + ' ferestre de 20 z, ' + (a.medie >= 0 ? '+' : '−') + Math.abs(a.medie).toFixed(1).replace('.', ',') + ' % față de univers, a coborât sub pragul scris înainte (' + (a.prag >= 0 ? '+' : '−') + Math.abs(a.prag).toFixed(1).replace('.', ',') + ' %) ⇒ avantajul din istorie devine improbabil; de revăzut, nu de cumpărat' : '';
  const v0 = prev && prev.verdict, v1 = out && out.verdict;
  if (!v1 || !v0 || v0 === v1) return ab;
  const d = out.diferenta20 && Number.isFinite(out.diferenta20.medie) && out.n20 > 0 ? ', ' + (out.diferenta20.medie >= 0 ? '+' : '−') + Math.abs(out.diferenta20.medie).toFixed(1).replace('.', ',') + ' % față de univers la 20 z' : '';
  return ['**Trend 12 luni · bilanțul probei** · verdictul s-a schimbat: „' + v0 + '” → „' + v1 + '” (' + (out.n20 || 0) + ' zile cu rezultat, ' + (out.ferestre20 ?? 0) + ' ferestre de 20 z' + d + ')\n_în probă sau nu, nu e un buton de cumpărat — detalii în Candidate Engine → Trend 12 luni_', ab].filter(Boolean).join('\n');
}

/** Regimul pieței: SPY închis peste media simplă pe 200 de zile. Sub 200 de bare ⇒ necunoscut (null). */
export function regim(spy) {
  const n = spy.length, inchidere = spy[n - 1].c;
  if (n < 200) return { inchidere, sma200: null, peste: null };
  const sma200 = spy.slice(-200).reduce((a, b) => a + b.c, 0) / 200;
  return { inchidere, sma200, peste: inchidere > sma200 };
}

/** Rulat în timpul sesiunii (manual), ultima bară a zilei e neînchisă: se taie din SPY și din seriile care o au. */
export function taieBaraPartiala(serii, spy, now = Date.now()) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(fmt.formatToParts(new Date(now)).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  const azi = p.year + '-' + p.month + '-' + p.day, minute = Number(p.hour) * 60 + Number(p.minute);
  const ziNY = (t) => { const q = Object.fromEntries(fmt.formatToParts(new Date(t)).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value])); return q.year + '-' + q.month + '-' + q.day; };
  const deschis = minute < 16 * 60 + 15 && ziNY(spy[spy.length - 1].t) === azi;
  if (!deschis) return { serii, spy, taiat: false };
  const taie = (b) => (b.length && ziNY(b[b.length - 1].t) === azi ? b.slice(0, -1) : b);
  return { serii: Object.fromEntries(Object.entries(serii).map(([s, b]) => [s, taie(b)])), spy: taie(spy), taiat: true };
}

/** O linie de istoric (pentru testul de peste 6–12 luni, pe date pe care nu le-am văzut): ziua, regimul, numărul, primele 20. */
export function liniaIstoric(rez, rg) {
  return { d: rez.dataUltimei, regim: rg ? rg.peste : null, n: rez.n, top: rez.clasament.slice(0, 20).map((x) => [x.s, +x.m12.toFixed(4)]), univers: Array.isArray(rez.clasate) ? rez.clasate.slice() : [] };
}

/** Adaugă linia în textul JSONL; dacă ziua ei e deja ultima scrisă, o înlocuiește (rulările repetate din aceeași zi nu dublează, dar îmbogățesc). */
export function adaugaIstoric(text, linie) {
  const linii = String(text || '').split('\n').filter(Boolean);
  if (linii.length) { try { if (JSON.parse(linii[linii.length - 1]).d === linie.d) return linii.slice(0, -1).concat(JSON.stringify(linie)).join('\n') + '\n'; } catch { /* linie stricată ⇒ adăugăm oricum */ } }
  const t = String(text || '');
  return (t && !t.endsWith('\n') ? t + '\n' : t) + JSON.stringify(linie) + '\n';
}

/* ---------- 27.10.2026 (auditul F): mărimea și puterea în depozit, contractul cu panourile, amprenta judecătorului ---------- */
/** Diferențele pe ferestre (top − univers) i.i.d. cu abaterea din istorie (3,51 %) + `efect`; „probat” = t > T_PRAG la oricare privire
 *  (după fiecare fereastră nouă, de la 12 la `ferestre`). `coada`: forma ferestrelor reale din auditul 14.10 (asimetrie −1,3, curtoză ≈ 6,4):
 *  0,5·Z + 0,866·(1 − E), Z normală, E exponențială(1) — medie 0, abatere 1. Întoarce rata cumulată a „probat” la 12, 36 și 60 de ferestre
 *  (≈ 1, 3, 5 ani). mulberry32, sămânță fixă. */
export function marimePutereTrend({ efect = 0, ferestre = 60, lumi = 4000, coada = false, samanta = 14102026, sigma = 0.0351 } = {}) {
  const r = mulberry32(samanta + Math.round(efect * 1e4) + (coada ? 7 : 0)), g = gauss(r), z = () => (coada ? 0.5 * g() + 0.8660254 * (1 + Math.log(1 - r())) : g());
  const la = { 12: 0, 36: 0, 60: 0 };
  for (let w = 0; w < lumi; w++) {
    let s = 0, q = 0, probat = false;
    for (let k = 1; k <= ferestre; k++) { const x = efect + sigma * z(); s += x; q += x * x; if (k >= 12 && !probat) { const m = s / k, sd = Math.sqrt((q - k * m * m) / (k - 1)); if (sd > 0 && m / (sd / Math.sqrt(k)) > T_PRAG) probat = true; } if (probat && la[k] !== undefined) la[k]++; }
  }
  for (const k of Object.keys(la)) la[k] /= lumi;
  return { efect, ferestre, lumi, la };
}
/** Puterea scrisă în docs/trend-12-1-protocol.md (marimePutereTrend, 4000 de lumi): „probat” până la 12 / 36 / 60 de ferestre. */
export const PUTERE_TREND = Object.freeze({ unitate: '% pe fereastră de 20 de zile, față de universul zilei', ferestre: 12, lumi: 4000,
  laPlus: Object.freeze([Object.freeze({ pct: 0.5, putere: 0.015, la36: 0.051, la60: 0.079 }), Object.freeze({ pct: 1, putere: 0.041, la36: 0.172, la60: 0.3 })]),
  marime: Object.freeze({ la12: 0.004, la36: 0.012, la60: 0.015 }),
  // forma ferestrelor reale (asimetrie −1,3): mărimea urcă la 5,0 % în 3 ani și 5,7 % în 5; +1 % ⇒ 9,5 / 30,9 / 43,9 %
  asimetric: Object.freeze({ marime: Object.freeze({ la12: 0.016, la36: 0.05, la60: 0.057 }), plus1: Object.freeze({ la12: 0.095, la36: 0.309, la60: 0.439 }) }) });
/** Câmpurile de contract (lotul D) pentru trend-12-1-bilant.json. Verdictul e SECVENȚIAL prin construcție (pragul 3,2 ales pentru privirile
 *  repetate), deci `unic: false`; `la` = 12 ferestre (primul verdict posibil). */
export function contractTrend(b, { cal, azi, primaZi = null, notate = 0, asteptate = 0 }) {
  const laPlus = PUTERE_TREND.laPlus.map((x) => ({ ...x })), unu = (x) => (x * 100).toFixed(1).replace('.', ',');
  const gata = b.verdict && b.verdict !== 'în probă', ult = (b.starturi20 || []).at(-1), data = gata && ult && cal ? dupaSesiuni(cal, ult, 20).zi : null;
  return { putere: { ...PUTERE_TREND, laPlus, text: `La 12 ferestre de 20 de zile (≈ 1 an), pragul t > 3,2 trece cu un avantaj de +1 %/fereastră în ${unu(laPlus[1].putere)} % din cazuri (${unu(laPlus[1].la36)} % în 3 ani, ${unu(laPlus[1].la60)} % în 5) și cu +0,5 % în ${unu(laPlus[0].putere)} %: „în probă” e rezultatul aproape sigur în primul an.` },
    primulVerdict: cal ? primulVerdict({ cal, azi, inceput: primaZi, starturi: b.starturi20 || [], k: 20, perioade: 12, notate, asteptate, ce: 'ferestre' }) : null,
    judecata: judecataDin({ la: 12, data, verdict: gata ? b.verdict : null, unic: false }) };
}
/** Conținutul fișierului trend-12-1-bilant.json (pur): cifrele în %, verdictul, delistatele, judecătorul și câmpurile de contract.
 *  `notate` = zilele din istoric; `asteptate` = sesiunile NYSE de la prima la ultima zi (zilele pierdute împing data realistă). */
export function continutBilant(b, istoric, { cal = null, azi, la }) {
  const pc = (v) => (v == null ? null : +(v * 100).toFixed(2)), zile = [...new Set(istoric.map((l) => l && l.d).filter(Boolean))].sort();
  let asteptate = 0; try { asteptate = cal && zile.length ? sesiuniIntre(cal, zile[0], zile.at(-1)) + 1 : 0; } catch { asteptate = 0; }
  const c = contractTrend(b, { cal, azi, primaZi: zile[0] || null, notate: zile.length, asteptate });
  return {
    versiune: 1, la, de: istoric[0].d, pana: istoric[istoric.length - 1].d, zile: b.zile, n20: b.n20, n60: b.n60,
    exces20: pc(b.exces20), exces60: pc(b.exces60), nulB20: pc(b.nulB20), nulB60: pc(b.nulB60),
    interval20: b.interval20.map(pc), diferenta20: { medie: pc(b.diferenta20.medie), interval: b.diferenta20.interval.map(pc) }, diferenta60: { medie: pc(b.diferenta60.medie), interval: b.diferenta60.interval.map(pc) },
    ferestre20: b.ferestre20, t20: b.t20 == null ? null : +b.t20.toFixed(2), pragT: T_PRAG,   /* 14.10 seara: criteriul pe ferestre nesuprapuse */
    abatere: b.abatere ? { k: b.abatere.k, medie: pc(b.abatere.medie), prag: pc(b.abatere.prag), atinsa: b.abatere.atinsa } : null,
    verdict: b.verdict, criterii: b.criterii, cost: 0.3, nota: 'randamente în %, față de SPY, intrare la deschiderea zilei următoare; „alte acțiuni” = universul clasat în aceeași zi',
    nejudecate: b.nejudecate, oprite: b.oprite, starturi20: b.starturi20, judecator: amprentaJudecatorTrend(),
    putere: c.putere, primulVerdict: c.primulVerdict, judecata: c.judecata, sesiuni: { notate: zile.length, asteptate }
  };
}
/** 28.10.2026 (revizia F2, 🟡5): intervalele Yahoo ale bilanțului, ca funcție (testată pe comportament, nu pe șir): SPY acoperă prima zi a
 *  istoricului (le așază pe toate în calendar), acțiunile doar de la prima zi încă neînghețată la 20 ȘI la 60 de zile (2y ⇒ 5y ⇒ 10y). */
export function intervaleBilant(istoric, inghetate, azi) {
  const zi = (h) => new Set((inghetate || []).filter((x) => x && x.tip === 'zi' && x.h === h).map((x) => x.d)), g20 = zi(20), g60 = zi(60);
  const primaVie = ((istoric || []).find((l) => !(g20.has(l.d) && g60.has(l.d))) || istoric[istoric.length - 1]).d;
  return { RANGE_SPY: intervalPentru(istoric[0].d, azi), RANGE: intervalPentru(primaVie, azi), primaVie };
}

/* ---------- 28.10.2026 (revizia F2, 🟡3): amprenta CLASAMENTULUI pe fiecare linie de istoric ---------- */
/** Ce decide primele 20 și universul zilei: închiderea din acest fișier pornind de la `clasament`, `curataUnivers`, `regim`,
 *  `taieBaraPartiala`, `liniaIstoric`, plus pragurile robotului (`MIN_CAP`, `N`, `TOP` din tools/trend-12-1.mjs). `instantaneuUnivers`
 *  (arhiva zilnică a universului) nu decide clasamentul. Fiecare linie nouă de istoric poartă amprenta (`v`); bilanțul judecă doar liniile
 *  versiunii de acum — o regulă schimbată repornește proba Trend, iar liniile vechi rămân în istoric. */
export const RADACINI_CLASAMENT = Object.freeze(['clasament', 'curataUnivers', 'regim', 'taieBaraPartiala', 'liniaIstoric']);
const citesteDepozit = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
export function amprentaClasamentTrend(citeste = citesteDepozit) {
  const lib = citeste('tools/trend-12-1-lib.mjs'), rob = citeste('tools/trend-12-1.mjs');
  const m = /\bconst MIN_CAP = ([^,;]+), N = ([^,;]+), TOP = ([^,;]+)[,;]/.exec(rob);
  if (!m) throw Error('Robotul Trend: pragurile MIN_CAP / N / TOP nu se găsesc — amprenta clasamentului nu se poate calcula (închis la eroare).');
  return 'tc-' + amprentaText(lib, inchidere(lib, RADACINI_CLASAMENT), JSON.stringify({ MIN_CAP: m[1].trim(), N: m[2].trim(), TOP: m[3].trim() }));
}
/** Liniile scrise înainte de 28.10.2026 n-au `v`. Din git (revizia F2): amprenta e `tc-86d0c9bbf68a` de la a3bd8443 (15.10.2026, 04:08 UTC)
 *  până azi, iar prima zi scrisă sub ea e 15.10 (linia din 14.10 a fost rescrisă la 04:08:41 UTC de un robot pornit pe codul vechi) ⇒
 *  liniile fără `v` cu ziua ≥ 15.10 sunt ale ei; 13.10 și 14.10 sunt sub regula de dinainte (`tc-b7a4179a6e14`) și ies din probă. */
export const LINII_FARA_V = Object.freeze({ deLa: '2026-10-15', v: 'tc-86d0c9bbf68a', inainte: 'tc-b7a4179a6e14' });
export function versiuneLinie(l) { return l && typeof l.v === 'string' && l.v ? l.v : l && typeof l.d === 'string' && l.d >= LINII_FARA_V.deLa ? LINII_FARA_V.v : LINII_FARA_V.inainte; }
/** Liniile istoricului care aparțin versiunii `V` (cea de acum, implicit). */
export function liniiInProba(istoric, V = amprentaClasamentTrend()) { return (istoric || []).filter((l) => versiuneLinie(l) === V); }

/** Amprenta judecătorului probei Trend: funcțiile care măsoară și judecă bilanțul + pragurile; scrisă în docs/trend-12-1-protocol.md. */
export function amprentaJudecatorTrend() { return 'jt-' + amprentaFunctii({ bilant, ferestreNesuprapuse, pragAbatere, interval, rnd }, ['bilant', 'ferestreNesuprapuse', 'pragAbatere', 'interval', 'rnd'], JSON.stringify({ T_PRAG, PRAG_ABATERE, ASTEPTARE })); }
