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

/** Data estimată a primului verdict (contractul cu lotul D).
 *  optimist: fiecare sesiune de aici încolo e notată ⇒ perioadele cerute se închid la câte k sesiuni de la ultimul start cunoscut
 *            (sau de azi, dacă proba n-are încă nicio zi);
 *  realist:  în plus, alunecarea zilelor pierdute: cu rata r = 1 − notate / așteptate, un start lipsă împinge perioada cu r / (1 − r)
 *            sesiuni în medie (așteptarea geometrică) ⇒ sesiunile rămase × (1 + r / ((1 − r) · k)). */
export function primulVerdict({ cal, azi, starturi = [], k, perioade, notate = 0, asteptate = 0, ce = 'perioade' }) {
  if (!ziValida(azi)) throw Error('primulVerdict: azi invalid');
  const s = [...starturi].filter(ziValida).sort(), n = s.length;
  let deLa, sesiuni;
  if (n >= perioade) { deLa = s[perioade - 1]; sesiuni = k; }
  else if (n) { deLa = s[n - 1]; sesiuni = (perioade - n) * k + k; }
  else { deLa = azi; sesiuni = perioade * k; }
  const o = dupaSesiuni(cal, deLa, sesiuni);
  const r = asteptate > 0 && notate < asteptate ? Math.min(0.8, 1 - notate / asteptate) : 0;
  const factor = r > 0 ? 1 + r / ((1 - r) * k) : 1, rl = dupaSesiuni(cal, deLa, Math.round(sesiuni * factor));
  const motiv = `${perioade} ${ce} de ${k} sesiuni care nu se suprapun; ${n} ${n === 1 ? 'start' : 'starturi'} până acum` +
    (r > 0 ? `; realist: robotul a pierdut ${asteptate - notate} din ${asteptate} sesiuni așteptate ⇒ fiecare perioadă alunecă în medie cu ${(r / (1 - r)).toFixed(1).replace('.', ',')} sesiuni` : '; realist = optimist (nicio sesiune pierdută până acum)') +
    (o.aproximativ || rl.aproximativ ? '; dincolo de calendarul oficial NYSE datele sunt aproximative (zile lucrătoare)' : '');
  return { optimist: o.zi, realist: rl.zi > o.zi ? rl.zi : o.zi, motiv };
}
/** Judecata (contractul cu lotul D): `la` = câte perioade / zile cere protocolul, `data` = când s-a dat, `verdict`, `unic` = o singură judecată. */
export function judecata({ la, data = null, verdict = null, unic = true }) { return { la, data, verdict, unic }; }

/** Textul unei funcții / constante din sursă, după nume: `function n(`, `async function n(`, `const n = (…) => {…}`, `const n = … ;`,
 *  `const n = Object.freeze({…})` (cu sau fără `export`). Acoladele / parantezele se numără; șirurile și comentariile simple sunt sărite. */
export function functieDinText(src, nume) {
  const s = String(src).replace(/\r\n?/g, '\n'), re = new RegExp('(?:^|\\n)[ \\t]*(?:export\\s+)?(?:(async\\s+)?function\\s+' + nume + '\\s*\\(|(?:const|let|var)\\s+' + nume + '\\s*=)', 'g');
  const m = re.exec(s); if (!m) throw Error('Funcția / constanta „' + nume + '” nu există în sursă.');
  const start = m.index + (m[0].startsWith('\n') ? 1 : 0), from = s.indexOf(nume, start) + nume.length;
  const inchide = { '{': '}', '(': ')', '[': ']' };
  let i = from, depth = 0, deschis = false, lastClose = -1;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '"' || ch === "'" || ch === '`') { const q = ch; i++; while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; } i++; continue; }
    if (ch === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (ch === '/' && s[i + 1] === '*') { i = s.indexOf('*/', i + 2); if (i < 0) i = s.length; else i += 2; continue; }
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
