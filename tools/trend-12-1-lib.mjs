// trend-12-1-lib.mjs — funcțiile pure ale robotului „Trend 12 luni” (14.10.2026).
//
// Semnalul: primele 20 % dintre acțiunile SUA lichide după randamentul pe lunile 2–12 (ultima lună de bursă SĂRITĂ),
// cu momentum pozitiv. Probat pe 14.10.2026 (E:\Backup-Claude\premarket-suite\audit-candidate-engine-2026-10-14,
// mom12_audit.txt): +0,9 % pe 20 de zile și +3,4 % pe 60 față de ALTE acțiuni în aceleași zile (p 0,000, interval pe zile
// +0,7…+1,1 %), în ambele jumătăți; NEPROBAT față de aceleași acțiuni în alte zile (lista e a supraviețuitorilor de azi).
// Planul Desk-ului (stop 1,25 ATR / țintă 2R) anulează efectul ⇒ modul nu construiește plan.
//
//   mom12 = C[t−21] / C[t−252] − 1 · mom6 = C[t−21] / C[t−126] − 1 · rang = poziția / numărul de acțiuni clasate
//   regim = SPY închis peste media simplă pe 200 de zile (2022, an negativ, cade când regimul e oprit)

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

/** serii = { simbol: bare[] } (bare zilnice {t,o,h,l,c,v}), spy = bare[] ⇒ clasamentul 12-1 al zilei. */
export function clasament(serii, spy, o = {}) {
  const top = o.top ?? 40, minPret = o.minPret ?? 5, minDolari = o.minDolari ?? 1e7;
  const dataUltimei = zi(spy[spy.length - 1].t), excluse = { pret: 0, bani: 0, scurt: 0, vechi: 0 }, l = [];
  for (const [s, b] of Object.entries(serii)) {
    if (!Array.isArray(b) || b.length < 260) { excluse.scurt++; continue; }
    const n = b.length;
    if (zi(b[n - 1].t) !== dataUltimei) { excluse.vechi++; continue; }
    const pret = b[n - 1].c;
    if (!(pret >= minPret)) { excluse.pret++; continue; }
    const dolari20 = b.slice(-20).reduce((a, x) => a + x.c * x.v, 0) / 20;
    if (!(dolari20 >= minDolari)) { excluse.bani++; continue; }
    l.push({ s, pret, m12: b[n - 22].c / b[n - 253].c - 1, m6: b[n - 22].c / b[n - 127].c - 1, r60: n > 61 ? b[n - 1].c / b[n - 61].c - 1 : null, dolari20, ultima: zi(b[n - 1].t) });
  }
  l.sort((a, b) => b.m12 - a.m12);
  const n = l.length;
  l.forEach((x, i) => { x.rang = i / n; });
  return { dataUltimei, n, excluse, clasament: l.filter((x) => x.m12 > 0).slice(0, top), toate: l, clasate: l.map((x) => x.s) };
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
export function iesiri(prev, clasat, rg) {
  if (!prev || !Array.isArray(prev.top)) return [];
  const azi = new Map((clasat || []).map((x) => [x.s, x])), out = [];
  for (const [s] of prev.top) {
    const x = azi.get(s);
    if (rg && rg.peste === false && prev.regim === true) { out.push({ s, motiv: 'regimul s-a oprit (SPY sub media pe 200 de zile)', rangAzi: x ? x.rang : null, m12: x ? x.m12 : null }); continue; }   // revizie 14.10: doar la OPRIRE, nu zilnic cât e oprit
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
function interval(v, extr = 1000, bloc = 20) { if (!v.length) return [null, null]; const R = rnd(7), bs = [], n = v.length, b = Math.min(bloc, n); for (let k = 0; k < extr; k++) { let s = 0, c = 0; while (c < n) { const st = Math.floor(R() * n); for (let j = 0; j < b && c < n; j++, c++) s += v[(st + j) % n]; } bs.push(s / n); } bs.sort((a, b2) => a - b2); return [bs[Math.floor(extr * 0.05)], bs[Math.floor(extr * 0.95)]]; }

/**
 * Bilanțul probei (I-614): pe fiecare zi din istoric cu h zile de bursă după ea, randamentul mediu al primelor 20 la h zile față de SPY
 * (intrare la deschiderea zilei următoare, cost 0,3 %) și același lucru pentru universul zilei (nulul B: alte acțiuni, aceleași zile).
 * Interval pe ZILE (bootstrap). Verdict după criteriile pre-înregistrate pe 14.10.2026: ≥ 30 de zile cu rezultat la 20 z și marginea de 5 %
 * a diferenței față de univers > 0 ⇒ „probat față de alte acțiuni”; ≥ 60 de zile și marginea de 95 % < 0 ⇒ „picat”; altfel „în probă”.
 */
export function bilant(istoric, preturi, o = {}) {
  const H = o.h || [20, 60], COST = 0.003, spy = preturi.SPY || [];
  const idx = {}; for (const [s, b] of Object.entries(preturi)) { const m = new Map(); (b || []).forEach((x, i) => m.set(zi(x.t), i)); idx[s] = m; }
  const rez = {}; for (const h of H) rez[h] = { top: [], nul: [], dif: [] };
  let zile = 0;
  for (const l of istoric || []) {
    if (!l || !Array.isArray(l.top) || !l.d) continue; zile++;
    const si = idx.SPY ? idx.SPY.get(l.d) : null; if (si == null) continue;
    for (const h of H) {
      if (si + h >= spy.length) continue;
      const zIn = zi(spy[si + 1].t), zOut = zi(spy[si + h].t), spyR = spy[si + h].c / spy[si + 1].o - 1;
      // revizie 14.10: intrarea și ieșirea pe DATELE calendarului SPY, nu pe indicii acțiunii (o zi lipsă nu mai decalează fereastra)
      const rand = (s) => { const b = preturi[s], m = idx[s]; if (!b || !m) return null; const i0 = m.get(zIn), i1 = m.get(zOut); if (i0 == null || i1 == null) return null; return b[i1].c / b[i0].o - 1 - COST - spyR; };
      const top = l.top.map(([s]) => rand(s)).filter((v) => v !== null); if (!top.length) continue;
      const univ = (l.univers || []).map(rand).filter((v) => v !== null);
      const mTop = top.reduce((a, b) => a + b, 0) / top.length, mUniv = univ.length ? univ.reduce((a, b) => a + b, 0) / univ.length : null;
      rez[h].top.push(mTop); if (mUniv !== null) { rez[h].nul.push(mUniv); rez[h].dif.push(mTop - mUniv); }
    }
  }
  const medie = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const r20 = rez[H[0]], r60 = rez[H[1]] || { top: [], nul: [], dif: [] }, dif20 = interval(r20.dif, 1000, H[0]);
  const ferestre20 = Math.floor(r20.dif.length / H[0]);   // ferestre de 20 de zile care NU se suprapun = observațiile independente
  let verdict = 'în probă';
  if (ferestre20 >= 12 && dif20[0] !== null && dif20[0] > 0) verdict = 'probat față de alte acțiuni';
  else if (ferestre20 >= 12 && dif20[1] !== null && dif20[1] < 0) verdict = 'picat față de alte acțiuni';
  return {
    zile, n20: r20.top.length, n60: r60.top.length, ferestre20,
    exces20: medie(r20.top), exces60: medie(r60.top), nulB20: medie(r20.nul), nulB60: medie(r60.nul),
    interval20: interval(r20.top, 1000, H[0]), diferenta20: { medie: medie(r20.dif), interval: dif20 }, diferenta60: { medie: medie(r60.dif), interval: interval(r60.dif, 1000, H[1] || 60) },
    verdict, criterii: 'cel puțin 12 ferestre de 20 de zile care nu se suprapun (≈ 1 an) și marginea de 5 % a diferenței față de universul zilei > 0 (bootstrap pe blocuri de 20) ⇒ probat; 12 ferestre și marginea de 95 % < 0 ⇒ picat; nulul „aceleași acțiuni, alte zile” se face separat, la 6–12 luni',
  };
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
