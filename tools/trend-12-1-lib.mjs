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
    l.push({ s, pret, m12: b[n - 22].c / b[n - 253].c - 1, m6: b[n - 22].c / b[n - 127].c - 1, dolari20, ultima: zi(b[n - 1].t) });
  }
  l.sort((a, b) => b.m12 - a.m12);
  const n = l.length;
  l.forEach((x, i) => { x.rang = i / n; });
  return { dataUltimei, n, excluse, clasament: l.filter((x) => x.m12 > 0).slice(0, top) };
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
  return { d: rez.dataUltimei, regim: rg ? rg.peste : null, n: rez.n, top: rez.clasament.slice(0, 20).map((x) => [x.s, +x.m12.toFixed(4)]) };
}

/** Adaugă linia în textul JSONL doar dacă ziua ei nu e deja ultima scrisă. */
export function adaugaIstoric(text, linie) {
  const linii = String(text || '').split('\n').filter(Boolean);
  if (linii.length) { try { if (JSON.parse(linii[linii.length - 1]).d === linie.d) return text; } catch { /* linie stricată ⇒ adăugăm oricum */ } }
  const t = String(text || '');
  return (t && !t.endsWith('\n') ? t + '\n' : t) + JSON.stringify(linie) + '\n';
}
