// 27.10.2026 — lotul F al auditului (I-741 / I-743 / I-744): ce au în comun probele în timp.
//  · contractul cu panourile: `putere: { laPlus: [{ pct, putere }] }`, `primulVerdict: { optimist, realist, motiv }`,
//    `judecata: { la, data, verdict, unic }` — scrise de roboți în JSON-urile probelor, citite de Desk / scanner / Astăzi;
//  · calendarul oficial NYSE (lib/exchange-calendar.js) pentru „când poate veni primul verdict” — dincolo de anii acoperiți se numără
//    zilele lucrătoare și se spune „aproximativ” (nu se ghicește tăcut);
//  · amprentele din text: funcțiile care JUDECĂ o probă intră în versiunea ei la fel ca motorul (o schimbare „inofensivă” în evaluare
//    nu mai poate muta verdictul fără repornire) — se extrag din sursă după nume, ca să nu fie nevoie ca fiecare fișier să le exporte;
//  · generatorul aleator al casei (mulberry32, regula din 06.10.2026) și o normală (Box–Muller) pentru simulările de mărime și putere.
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** Generatorul aleator al casei: determinist, cu sămânță; NICIODATĂ LCG. */
export function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** Normală standard din generatorul dat (Box–Muller; u = 0 e evitat). */
export function gauss(rnd) { return () => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }; }

const ziValida = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
/** Calendarul oficial al burselor (același fișier ca pagina), încărcat izolat. */
export function calendarSUA(radacina = '.') {
  const c = { console, Intl, Date, Math, JSON }; c.window = c; vm.createContext(c);
  vm.runInContext(readFileSync(radacina + '/lib/exchange-calendar.js', 'utf8'), c, { filename: 'lib/exchange-calendar.js' });
  return c.ExchangeCalendar;
}
const ziLucratoareUrmatoare = (d) => { let t = Date.parse(d + 'T12:00:00Z'); do { t += 86400000; } while ([0, 6].includes(new Date(t).getUTCDay())); return new Date(t).toISOString().slice(0, 10); };
/** Ziua aflată la n sesiuni NYSE după `zi`. Dincolo de anii cu calendar oficial: zile lucrătoare (±2–3 zile de sărbători pe an) ⇒ `aproximativ: true`. */
export function dupaSesiuni(cal, zi, n) {
  if (!ziValida(zi)) throw Error('dupaSesiuni: zi invalidă ' + zi);
  let x = zi, aproximativ = false;
  for (let i = 0; i < n; i++) { const s = cal && cal.next(x, 'US'); if (s && s.day) x = s.day; else { x = ziLucratoareUrmatoare(x); aproximativ = true; } }
  return { zi: x, aproximativ };
}
/** Câte sesiuni NYSE sunt în (a, b] (a exclus, b inclus); dincolo de calendar, zile lucrătoare. */
export function sesiuniIntre(cal, a, b) { let n = 0, x = a; while (x < b && n < 20000) { x = dupaSesiuni(cal, x, 1).zi; n++; } return n; }

/* ---------- 27.10.2026 (revizia independentă F, 🔴1 / 🔴3 / 🟡10): seriile pentru evaluare acoperă toată proba ---------- */
/** Intervalul Yahoo care acoperă `primaZi` + orizontul + o marjă (regula Top Long din 19.10, acum comună: V1, Top Long, Trend). */
export function intervalPentru(primaZi, azi = new Date().toISOString().slice(0, 10)) {
  const zile = (Date.parse(azi + 'T00:00:00Z') - Date.parse(primaZi + 'T00:00:00Z')) / 86400000 + 60;
  return zile <= 700 ? '2y' : zile <= 1800 ? '5y' : '10y';
}
/** Simbolurile de reluat înainte de evaluare: acțiunile și reperele zilelor (doar ale versiunii date, când e dată) + SPY, fără dubluri.
 *  Rândul unei zile: [simbol, cod, …, data EOD, reper]; rândurile neverificabile (cod 'u') nu intră în probă, deci nu se reiau. */
export function simboluriDeReluat(jurnal, versiune = null) {
  return [...new Set((jurnal?.zile || []).filter((z) => versiune == null || z.v === versiune).flatMap((zi) => (zi.r || []).filter((x) => x[1] !== 'u').flatMap((x) => [x[0], x[4]])).filter(Boolean).concat('SPY'))];
}
/** 27.10.2026 (revizia F, 🔵17 / 🟡5): amprenta în vigoare scrisă într-un protocol = rândul de jos al tabelului „Amprentele v2” (null fără tabel).
 *  Garda din fluxul robotului o compară cu amprenta de azi cât timp fișierul probei e încă al probei precedente (înainte de prima zi v2). */
export function amprentaScrisa(text, prefix) { const r = [...String(text).replace(/\r\n/g, '\n').matchAll(new RegExp('^\\| [^|\\n]+ \\| `(' + prefix + '-[0-9a-f]{12})` \\|', 'gm'))]; return r.length ? r[r.length - 1][1] : null; }
/** Seriile { simbol: [{ d, c }] } tăiate la ziua `zi` inclusiv: barele de după (ex. sesiunea UE încă deschisă la rularea de 10:15 UTC) nu intră. */
export function taieLaZi(serii, zi) { if (!zi) return serii; return Object.fromEntries(Object.entries(serii).map(([k, v]) => [k, Array.isArray(v) ? v.filter((x) => x.d <= zi) : v])); }

/** Data estimată a primului verdict (contractul cu lotul D).
 *  optimist: fiecare sesiune de aici încolo e notată ⇒ perioadele cerute se închid la câte k sesiuni de la ultimul start cunoscut
 *            (sau de azi, dacă proba n-are încă nicio zi);
 *  realist:  în plus, alunecarea zilelor pierdute: cu rata r = 1 − notate / așteptate, un start lipsă împinge perioada cu r / (1 − r)
 *            sesiuni în medie (așteptarea geometrică) ⇒ sesiunile rămase × (1 + r / ((1 − r) · k)). */
export function primulVerdict({ cal, azi, inceput = null, starturi = [], k, perioade, notate = 0, asteptate = 0, ce = 'perioade', dupa = 0 }) {
  if (!ziValida(azi)) throw Error('primulVerdict: azi invalid');
  const s = [...starturi].filter(ziValida).sort(), n = s.length;
  let deLa, sesiuni;
  if (n >= perioade) { deLa = s[perioade - 1]; sesiuni = k; }
  else if (n) { deLa = s[n - 1]; sesiuni = (perioade - n) * k + k; }
  else { deLa = ziValida(inceput) && inceput <= azi ? inceput : azi; sesiuni = perioade * k; }   // prima perioadă pornește din prima zi notată
  sesiuni += dupa;   // 27.10.2026 (revizia F, 🔴2): judecata vine când se îngheață a N-a perioadă — orizontul + `dupa` sesiuni de așteptare
  const o = dupaSesiuni(cal, deLa, sesiuni);
  const r = asteptate > 0 && notate < asteptate ? Math.min(0.8, 1 - notate / asteptate) : 0;
  const factor = r > 0 ? 1 + r / ((1 - r) * k) : 1, rl = dupaSesiuni(cal, deLa, Math.round(sesiuni * factor));
  const ro = (d) => d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4);
  const motiv = `${perioade} ${ce} de ${k} sesiuni care nu se suprapun, din care ${n} închise până acum` + (n ? '' : ` (numărate de la ${ro(deLa)})`) + (dupa ? `; judecata vine la înghețarea ultimei perioade, după încă ${dupa} sesiuni` : '') +
    (r > 0 ? `; realist: robotul a pierdut ${asteptate - notate} din ${asteptate} sesiuni așteptate ⇒ fiecare perioadă alunecă în medie cu ${(r / (1 - r)).toFixed(1).replace('.', ',')} sesiuni` : '; realist = optimist (nicio sesiune pierdută până acum)') +
    (o.aproximativ || rl.aproximativ ? '; dincolo de calendarul oficial NYSE datele sunt aproximative (zile lucrătoare)' : '');
  return { optimist: o.zi, realist: rl.zi > o.zi ? rl.zi : o.zi, motiv };
}
/** Judecata (contractul cu lotul D): `la` = câte perioade / zile cere protocolul, `data` = când s-a dat, `verdict`, `unic` = o singură judecată. */
export function judecata({ la, data = null, verdict = null, unic = true }) { return { la, data, verdict, unic }; }

/** Dacă la poziția i începe un comentariu, un șir (inclusiv șablon cu `${…}`) sau un literal regex, întoarce indexul de după el; altfel −1.
 *  `prev` = ultimul caracter semnificativ de cod dinainte (decide între împărțire și regex). Fără el, `/[&<>"']/` strica numărătoarea. */
function sare(s, i, prev) {
  const ch = s[i];
  if (ch === '/' && s[i + 1] === '/') { const e = s.indexOf('\n', i); return e < 0 ? s.length : e; }
  if (ch === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2); return e < 0 ? s.length : e + 2; }
  if (ch === '"' || ch === "'") { let j = i + 1; while (j < s.length && s[j] !== ch && s[j] !== '\n') { if (s[j] === '\\') j++; j++; } return j + 1; }
  if (ch === '`') {
    let j = i + 1;
    while (j < s.length && s[j] !== '`') {
      if (s[j] === '\\') { j += 2; continue; }
      if (s[j] === '$' && s[j + 1] === '{') { let d = 1, p = '{'; j += 2; while (j < s.length && d > 0) { const k = sare(s, j, p); if (k >= 0) { j = k; p = 'x'; continue; } if (s[j] === '{') d++; else if (s[j] === '}') d--; if (!/\s/.test(s[j])) p = s[j]; j++; } continue; }
      j++;
    }
    return j + 1;
  }
  if (ch === '/' && (prev === null || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev))) {
    let j = i + 1, clasa = false;
    while (j < s.length && s[j] !== '\n') { if (s[j] === '\\') { j += 2; continue; } if (s[j] === '[') clasa = true; else if (s[j] === ']') clasa = false; else if (s[j] === '/' && !clasa) break; j++; }
    j++; while (j < s.length && /[a-z]/.test(s[j])) j++;
    return j;
  }
  return -1;
}
/** Sursa fără comentarii, șiruri și regexuri (înlocuite cu un spațiu) — doar pentru căutarea numelor folosite. */
function doarCod(s) {
  let out = '', i = 0, prev = null;
  while (i < s.length) { const k = sare(s, i, prev); if (k >= 0) { out += ' '; i = k; prev = 'x'; continue; } out += s[i]; if (!/\s/.test(s[i])) prev = s[i]; i++; }
  return out;
}
/** Indentarea nivelului de sus: 2 spații într-un fișier-pagină învelit într-o funcție care se autoapelează (`(function () {` …), 0 într-un
 *  modul. Altfel, într-un modul, declarațiile din corpul funcțiilor (indentate cu 2) ar trece drept „de sus”. */
const nivelSus = (s) => (/^\s*(?:'use strict';\s*)?(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*[(!]\s*(?:async\s+)?(?:function\b|\(\s*\)\s*=>)/.test(s) ? 2 : 0);
const reDecl = (nivel) => new RegExp('^ {' + nivel + '}(?:export\\s+)?(?:(?:async\\s+)?function\\s+([A-Za-z_$][\\w$]*)\\s*\\(|(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=)', 'gm');
/** Numele declarate la nivelul de sus (al modulului sau al funcției care se autoapelează), în ordinea din sursă. */
export function declaratii(src) {
  const s = String(src).replace(/\r\n?/g, '\n'), out = [];
  for (const m of s.matchAll(reDecl(nivelSus(s)))) { const n = m[1] || m[2]; if (!out.includes(n)) out.push(n); }
  return out;
}
/** Închiderea tranzitivă: rădăcinile + toate declarațiile de sus folosite de ele (în cod, nu în comentarii / șiruri), mai puțin `exclude`
 *  (textele de afișaj, declarate de protocol). Întoarce numele sortate — amprenta nu depinde de ordinea în fișier. */
export function inchidere(src, radacini, { exclude = [] } = {}) {
  const decl = new Set(declaratii(src)), fara = new Set(exclude), gata = new Set(), coada = [...radacini];
  for (const r of radacini) if (!decl.has(r)) throw Error('Rădăcina „' + r + '” nu e declarată în sursă.');
  while (coada.length) {
    const n = coada.shift(); if (gata.has(n) || fara.has(n)) continue; gata.add(n);
    for (const m of doarCod(functieDinText(src, n)).matchAll(/[A-Za-z_$][\w$]*/g)) { const x = m[0]; if (x !== n && decl.has(x) && !gata.has(x) && !fara.has(x)) coada.push(x); }
  }
  return [...gata].sort();
}

/** Textul unei funcții / constante din sursă, după nume: `function n(`, `async function n(`, `const n = (…) => {…}`, `const n = … ;`,
 *  `const n = Object.freeze({…})` (cu sau fără `export`), declarată la nivelul de sus (indentare ≤ 2). Acoladele / parantezele se
 *  numără; șirurile, șabloanele, comentariile și regexurile sunt sărite. */
export function functieDinText(src, nume) {
  const s = String(src).replace(/\r\n?/g, '\n'), n = String(nume).replace(/[$]/g, '\\$'), re = new RegExp('(?:^|\\n) {' + nivelSus(s) + '}(?:export\\s+)?(?:(async\\s+)?function\\s+' + n + '\\s*\\(|(?:const|let|var)\\s+' + n + '(?![\\w$])\\s*=)', 'g');
  const m = re.exec(s); if (!m) throw Error('Funcția / constanta „' + nume + '” nu există în sursă.');
  const start = m.index + (m[0].startsWith('\n') ? 1 : 0), from = s.indexOf(nume, start) + nume.length;
  const inchide = { '{': '}', '(': ')', '[': ']' };
  let i = from, depth = 0, deschis = false, lastClose = -1, prev = '=';
  while (i < s.length) {
    const ch = s[i], k = sare(s, i, prev);
    if (k >= 0) { i = k; prev = 'x'; continue; }
    if (!/\s/.test(ch)) prev = ch;
    if (inchide[ch]) { depth++; deschis = true; }
    else if (ch === '}' || ch === ')' || ch === ']') { depth--; lastClose = i; if (deschis && depth === 0) { const rest = s.slice(i + 1, s.indexOf('\n', i + 1) < 0 ? s.length : s.indexOf('\n', i + 1)); if (!/^\s*(?:\{|=>|\.|\(|\[)/.test(rest)) return s.slice(start, i + 1).replace(/^export\s+/, '').trim(); } }
    else if (ch === '\n' && depth === 0 && deschis) return s.slice(start, lastClose + 1).replace(/^export\s+/, '').trim();
    else if (ch === ';' && depth === 0) return s.slice(start, i + 1).replace(/^export\s+/, '').trim();
    else if (ch === '\n' && depth === 0 && !deschis) return s.slice(start, i).replace(/^export\s+/, '').trim();
    i++;
  }
  return s.slice(start).replace(/^export\s+/, '').trim();
}
/** SHA-256 (12 hex) pe numele și textele funcțiilor cerute, în ordine, plus un text în plus (ex. JSON-ul regulilor); CRLF = LF. */
export function amprentaText(src, nume, extra = '') {
  const h = createHash('sha256');
  for (const n of nume) h.update(n + '\n' + functieDinText(src, n) + '\n');
  if (extra) h.update('extra\n' + String(extra).replace(/\r\n?/g, '\n') + '\n');
  return h.digest('hex').slice(0, 12);
}
/** Amprenta unor funcții DATE (nu din text): numele + `toString()`; CRLF = LF (copia Windows vs robotul GitHub). */
export function amprentaFunctii(functii, nume, extra = '') {
  const h = createHash('sha256');
  for (const n of nume) { if (typeof functii[n] !== 'function') throw Error('Lipsește funcția ' + n + '.'); h.update(n + '\n' + functii[n].toString().replace(/\r\n?/g, '\n') + '\n'); }
  if (extra) h.update('extra\n' + String(extra).replace(/\r\n?/g, '\n') + '\n');
  return h.digest('hex').slice(0, 12);
}
