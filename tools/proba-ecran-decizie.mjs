#!/usr/bin/env node
// 20.10.2026 (I-725): proba de ecran pentru Decision App. Din 253 de fișiere de test niciunul nu deschidea aplicația într-un browser —
// bugurile din 19.10 (prima deschidere 41 s, pagina Astăzi care nu recitea) s-au văzut abia cu o unealtă scrisă pe loc.
// Proba deschide aplicația PRIN CARCASĂ (app/?module=<ruta>) într-un Edge headless separat (profil gol), pagină cu pagină,
// fiecare într-o filă nouă, de două ori: a doua oară cu același profil, după repornirea browserului (service worker-ul e activ).
// ROȘU la: excepție JS (carcasă, iframe-uri, workeri, service worker), element-cheie lipsă, versiunea veche din cache,
// cerere proprie eșuată, refuz al browserului („Refused to …”), modul fără conținut.
//   node tools/proba-ecran-decizie.mjs
//   node tools/proba-ecran-decizie.mjs --pagini today,desk-tichet --out raport.json --timp 45000
//   node tools/proba-ecran-decizie.mjs --base http://127.0.0.1:8080/premarket_scanner.html/   (server static local)
// Ieșirea: 0 = verde, 1 = roșu (și „proba n-a putut rula”). Raportul întreg: JSON la --out (implicit în folderul temporar).
// Evaluarea (raport ⇒ verdict + motive) e funcția pură `evalueaza`, testată fără browser în tools/proba-ecran-decizie.test.mjs.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const BAZA_IMPLICITA = 'https://mferent80-source.github.io/premarket_scanner.html/';
export const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
/* 27.10.2026 (I-747): proba rulează și pe runnerul GitHub (Ubuntu, Google Chrome), după fiecare publicare. Pe PC rămâne Edge; altfel primul
   Chrome / Chromium găsit; o cale dată cu --browser (sau BROWSER / CHROME_PATH din mediu) are întâietate și trebuie să existe. */
export const CANDIDATI_BROWSER = Object.freeze([EDGE, 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']);
export function alegeBrowser(dat, exista = existsSync) {
  if (dat) { if (exista(dat)) return dat; throw Error('browserul dat nu există: ' + dat); }
  const gasit = CANDIDATI_BROWSER.find((p) => exista(p));
  if (!gasit) throw Error('niciun Edge / Chrome / Chromium în locurile obișnuite — dă calea cu --browser <cale>');
  return gasit;
}
// „rețeaua s-a liniștit” = nicio cerere pornită sau încheiată de 3 s (ca în masoara.mjs, 19.10)
const LINISTE_MS = 3000;
// după liniște, elementele-cheie mai primesc 5 s (desene întârziate) înainte să fie declarate lipsă
const ASTEPTARE_ELEMENTE_MS = 5000;
const PAS_MS = 250;
// „conținut” = textul vizibil al cadrului modulului are peste 200 de caractere (ca în masoara.mjs)
const TEXT_MINIM = 200;
// cadrul ascuns al scanării din fundal (app/index.html: moduleTarget('candidate-engine/','background=1')) rulează minute întregi
// și nu ține de modulul măsurat ⇒ cererile lui nu amână „gata” (eșecurile lor se numără totuși)
const RE_FUNDAL = /candidate-engine\/[^#]*[?&]background=1/;

/** Paginile probate, în ordine. Selectorii sunt aleși citind HTML-ul și scripturile fiecărei pagini (20.10.2026).
 *  `text` = expresie regulată pe textul elementului; `diferitDe` = textul static din HTML pe care scriptul paginii trebuie să-l înlocuiască;
 *  `continut` = selector care trebuie să existe ca pagina să aibă „conținut” (tichetul). */
export const PAGINI = Object.freeze([
  { id: 'today', ruta: 'today/', nume: 'Astăzi', elemente: [
    // today/index.html: <section id="marketVerdict" aria-label="Verdictul pieței"> începe cu „Se citesc sursele pieței…”;
    // textul „Verdictul pieței” apare doar după ce lib/market-verdict.js a desenat panoul (antetul .mv-head)
    { nume: 'verdictul pieței', selector: '#marketVerdict', text: 'Verdictul pieței' },
    // today/view.js renderAccount: suma contului (.account-total) sau, într-un profil gol, „Conectează contul” (.account-connect)
    { nume: 'capitalul contului', selector: '#accountSummary .account-total, #accountSummary .account-connect' },
    // today/view.js: rândurile pozițiilor sau mesajul de stare („Pozițiile nu pot fi confirmate…”)
    { nume: 'pozițiile', selector: '#positionsList .position-row, #positionsList .state-message' },
  ] },
  { id: 'scanner-verdicts', ruta: 'scanner-verdicts/', nume: 'Piață', elemente: [
    // scanner-verdicts/view.js brief(): „Piața pe scurt” = articole desenate din cele două rapoarte
    { nume: 'piața pe scurt', selector: '#marketBrief article' },
    // panoul care pornește motoarele (static în HTML)
    { nume: 'panoul motoarelor', selector: '#runPanel #runAll' },
    // view.js rules(): „Versiune … Toate cele 8 verificări …” — scris abia la capătul pornirii paginii
    { nume: 'regulile V1', selector: '#rulesBody', text: '8 verificări' },
  ] },
  { id: 'holdings', ruta: 'holdings/', nume: 'Portofoliu', elemente: [
    // holdings/holdings.js snapshotStatus(): înlocuiește textul static (în profil gol: „Fără portofoliu Invest sincronizat.”)
    { nume: 'bara de stare', selector: '#status', diferitDe: 'Citesc ultimul portofoliu Invest sincronizat…' },
    { nume: 'fila Dețineri', selector: '#workspace-tab-holdings[aria-selected="true"]' },
  ] },
  { id: 'desk', ruta: 'desk/', nume: 'Planuri', elemente: [
    // desk/index.html: „—” static; Guardrail scrie verdictul (în profil gol „NEVERIFICAT”, proba pe viu 20.10)
    { nume: 'verdictul gărzii', selector: '#guardVerdict', diferitDe: '—' },
    // verdictul tichetului (în dialogul #ticketWrap, închis aici)
    { nume: 'verdictul tichetului', selector: '#ticketVerdict', text: '\\S' },
  ] },
  { id: 'desk-tichet', ruta: 'desk/', interogare: 'ticket=1', nume: 'Planuri · tichet', tichet: true, continut: '#ticketWrap[open]', elemente: [
    // desk/index.html: ticket=1 ⇒ openRequestedTicket() ⇒ #ticketWrap.showModal()
    { nume: 'tichetul deschis', selector: '#ticketWrap[open]' },
    { nume: 'verdictul tichetului', selector: '#ticketWrap[open] #ticketVerdict', text: '\\S' },
    { nume: 'verdictul gărzii', selector: '#guardVerdict', diferitDe: '—' },
  ] },
  { id: 'journal', ruta: 'journal/#exec', nume: 'Jurnal', elemente: [
    // lib/app-routes.js: „Jurnal” = journal/#exec; journal/index.html setJTab('exec') marchează fila și arată panoul
    { nume: 'fila Execuții activă', selector: '#jrTabExec[aria-selected="true"]' },
    { nume: 'panoul Execuții vizibil', selector: '#jpaneExec:not([hidden])' },
    { nume: 'fila Raport', selector: '#jrTabRaport' },
  ] },
  { id: 'health', ruta: 'health/', nume: 'Health', suita: true, elemente: [
    // health/index.html: <span id="suiteBadge">—</span>, pictat de lib/suite-version.js cu SUITE_VERSION_SHORT
    { nume: 'insigna versiunii suitei', selector: '#suiteBadge', text: '^tt-v\\d+' },
  ] },
]);

/* ---------- partea PURĂ (fără browser): adrese, clasificarea cererilor, evaluarea, rezumatul ---------- */

/** Adresa fără parametri (cheile de API din interogare nu ajung în raport); păstrează doar module / ticket / background. */
export function curata(url) {
  try {
    const u = new URL(String(url));
    if (!/^https?:$/.test(u.protocol)) return u.protocol + '…';
    const pastrate = ['module', 'ticket', 'background'].filter((k) => u.searchParams.has(k)).map((k) => k + '=' + u.searchParams.get(k));
    return u.origin + u.pathname + (pastrate.length ? '?' + pastrate.join('&') : '');
  } catch { return String(url || '').slice(0, 200); }
}
/** Adresa curățată, fără baza aplicației (ex. „desk/?ticket=1”). */
export function scurt(url, baza) {
  const s = curata(url);
  return baza && s.startsWith(baza) ? (s.slice(baza.length) || './') : s;
}
function origine(url) { try { return new URL(String(url)).origin; } catch { return ''; } }
export function secunde(ms) { return Number.isFinite(ms) ? (ms / 1000).toFixed(1).replace('.', ',') + ' s' : '—'; }

/* Zgomotul care NU e defect (nu face roșu, dar rămâne în raport):
   1. cererile anulate (net::ERR_ABORTED / canceled): navigarea la pagina următoare, cadrele scoase din bazin (src = about:blank),
      AbortController-ul scannerului;
   2. 404 pe fișiere PROPRII de DATE (.json/.csv/.txt sau fetch/XHR fără extensie de cod): rapoartele roboților
      (generated/*.json, market-breadth/data/*.json) pot lipsi până rulează robotul — pagina spune singură ce lipsește;
   3. favicon.ico — îl cere browserul, nu aplicația;
   4. cererile către ALTE origini (Yahoo, Finnhub, alternative.me, proxy-ul Cloudflare, Google): pică din cauza rețelei sau a
      limitelor furnizorului ⇒ avertisment, nu roșu;
   5. adresele ne-HTTP (data:, blob:).
   ROȘU rămâne orice eșec pe fișierele proprii de cod (.js/.mjs/.css/.html/.webmanifest, documente, scripturi, foi de stil),
   orice alt cod de eroare (≠ 404) sau cădere de rețea pe fișierele proprii de date și orice cerere proprie blocată. */
const COD = /\.(m?js|css|html?|webmanifest)$/i;
const DATE = /\.(json|csv|txt|ndjson|xml)$/i;
const TIP_COD = new Set(['Document', 'Script', 'Stylesheet', 'Manifest']);
/** Clasa unei cereri eșuate: 'rosu' | 'zgomot' | 'terti', cu motivul. `c` = {url, status, eroare, anulata, blocat, tip}. */
export function clasificaCerere(c, baza = BAZA_IMPLICITA) {
  let u;
  try { u = new URL(String(c && c.url)); } catch { return { clasa: 'zgomot', motiv: 'adresă nevalidă' }; }
  if (!/^https?:$/.test(u.protocol)) return { clasa: 'zgomot', motiv: 'adresă ne-HTTP' };
  // 20.10.2026: Chrome anulează (ERR_ABORTED, canceled) și scriptul care a primit 404 ⇒ cu cod HTTP de eroare NU e „doar anulată”
  if ((c.anulata || /ERR_ABORTED/.test(c.eroare || '')) && !(c.status >= 400)) return { clasa: 'zgomot', motiv: 'cerere anulată (navigare / cadru înlocuit)' };
  if (u.origin !== origine(baza)) return { clasa: 'terti', motiv: 'altă origine (' + u.host + ')' };
  if (/\/favicon\.ico$/i.test(u.pathname)) return { clasa: 'zgomot', motiv: 'favicon cerut de browser' };
  const cod = COD.test(u.pathname) || u.pathname.endsWith('/') || TIP_COD.has(c.tip);
  if (cod) return { clasa: 'rosu', motiv: c.blocat ? 'fișier propriu de cod blocat (' + c.blocat + ')' : 'fișier propriu de cod' };
  if (c.status === 404 && (DATE.test(u.pathname) || c.tip === 'Fetch' || c.tip === 'XHR')) return { clasa: 'zgomot', motiv: '404 pe fișier opțional de date' };
  return { clasa: 'rosu', motiv: c.blocat ? 'cerere proprie blocată (' + c.blocat + ')' : 'cerere proprie eșuată' };
}

/** Verdictul unui element-cheie din ce a găsit pagina (`gasit` = {exista, text, eroare}). */
export function verificaElement(spec, gasit) {
  const r = { nume: spec.nume, selector: spec.selector, ok: false, text: (gasit && gasit.text) || '' };
  if (!gasit || !gasit.exista) return { ...r, motiv: gasit && gasit.eroare ? 'selector nevalid: ' + gasit.eroare : 'lipsește din pagină' };
  if (spec.text && !new RegExp(spec.text).test(r.text)) return { ...r, motiv: 'textul nu se potrivește cu /' + spec.text + '/' };
  if (spec.diferitDe !== undefined && (!r.text || r.text === spec.diferitDe)) return { ...r, motiv: 'a rămas textul static „' + spec.diferitDe + '” (scriptul paginii nu a rulat)' };
  return { ...r, ok: true };
}
/** Cadrul activ al carcasei trebuie să fie modulul cerut (altfel carcasa a căzut pe altă rută). */
export function verificaCadru(pagina, cadru, baza = BAZA_IMPLICITA) {
  const cale = pagina.ruta.split('#')[0];
  const r = { nume: 'cadrul modulului', selector: 'iframe → ' + cale, text: cadru ? scurt(cadru, baza) : '', ok: false };
  let p = '';
  try { p = new URL(cadru).pathname; } catch { /* cadrul nu are încă adresă */ }
  const asteptat = new URL(cale, baza).pathname;
  if (p === asteptat || p === asteptat + 'index.html') return { ...r, ok: true };
  return { ...r, motiv: cadru ? 'carcasa a deschis alt modul' : 'cadrul modulului nu s-a încărcat' };
}

// notificarea „ResizeObserver loop …” e benignă (o raportează browserul, nu e o excepție a aplicației)
const ZGOMOT_JS = /ResizeObserver loop/;

/** Evaluarea raportului colectat ⇒ { verdict: 'verde' | 'rosu', motive (roșii), avertismente, pagini: id → {ok, motive, avertismente} }. Pură. */
export function evalueaza(raport) {
  const r = raport || {}, baza = r.baza || BAZA_IMPLICITA;
  const motive = [], avertismente = [], pagini = {};
  const loc = (e) => {
    if (!e || !e.fisier) return e && e.cadru ? ' [' + e.cadru + ']' : '';
    let f = scurt(e.fisier, baza);
    if (f.endsWith('/')) f += 'index.html';
    return ' (' + f + (e.rand ? ':' + e.rand + (e.coloana ? ':' + e.coloana : '') : '') + ')' + (e.cadru ? ' [' + e.cadru + ']' : '') + (e.n > 1 ? ' ×' + e.n : '');
  };
  if (r.eroareProba) motive.push('proba nu a putut rula: ' + r.eroareProba);
  // I-747: după publicare proba așteaptă ca site-ul să servească versiunea din depozit; dacă n-o servește, verdictul ar fi pe versiunea veche
  const w = r.asteptare;
  if (w && w.ceruta && w.gasita !== w.ceruta) motive.push('site-ul nu servește versiunea ' + w.ceruta + ' după ' + (Number.isFinite(w.ms) ? (w.ms / 60000).toFixed(1).replace('.', ',') + ' min' : '—') + ' (servește ' + (w.gasita || 'nimic citibil') + ')');
  const deschideri = Array.isArray(r.deschideri) ? r.deschideri : [];
  if (!deschideri.some((d) => d && Array.isArray(d.pagini) && d.pagini.length)) motive.push('nicio pagină măsurată');
  for (const d of deschideri) {
    for (const p of (d && d.pagini) || []) {
      const m = [], a = [], tag = (p.nume || p.id) + ' · ' + (d.eticheta || '?');
      if (p.eroare) m.push(tag + ': pagina nu a putut fi măsurată — ' + p.eroare);
      else if (p.continutMs == null) m.push(tag + ': modulul nu a afișat conținut în ' + secunde(p.plafonMs));
      for (const e of p.erori || []) {
        if (ZGOMOT_JS.test(e.mesaj || '')) a.push(tag + ': ' + e.mesaj + ' (benign)');
        else m.push(tag + ': excepție JS — ' + e.mesaj + loc(e));
      }
      for (const x of p.refuzuri || []) m.push(tag + ': refuzat de browser — ' + x.text + loc(x));
      for (const el of p.elemente || []) if (!el.ok) m.push(tag + ': element-cheie lipsă „' + el.nume + '” (' + el.selector + ')' + (el.motiv ? ' — ' + el.motiv : ''));
      const v = p.versiune;
      if (v && !p.eroare) {
        if (!v.publicata) m.push(tag + ': versiunea publicată nu a putut fi citită (app/version.json)');
        else if (!v.carcasa) m.push(tag + ': carcasa nu are data-app-version');
        else if (v.carcasa !== v.publicata) m.push(tag + ': versiunea veche din cache — carcasa ' + v.carcasa + ', publicată ' + v.publicata);
      }
      const s = p.suita;
      if (s && !p.eroare) {
        if (!s.publicata) a.push(tag + ': versiunea suitei (sw-app.js) nu a putut fi citită');
        else if (s.insigna && !(s.publicata === s.insigna || s.publicata.startsWith(s.insigna + '-'))) m.push(tag + ': versiunea suitei veche din cache — insigna ' + s.insigna + ', sw-app.js publicat ' + s.publicata);
      }
      let terti = 0;
      for (const c of p.cereriEsuate || []) {
        const k = clasificaCerere(c, baza);
        const cum = c.status >= 400 ? String(c.status) : [c.status, c.eroare].filter(Boolean).join(' · ') || '?';
        if (k.clasa === 'rosu') m.push(tag + ': cerere proprie eșuată — ' + scurt(c.url, baza) + ' (' + cum + ') · ' + k.motiv + (c.cadru ? ' [' + c.cadru + ']' : ''));
        else if (k.clasa === 'terti') terti++;
      }
      if (terti) a.push(tag + ': ' + terti + (terti === 1 ? ' cerere către alte origini a eșuat' : ' cereri către alte origini au eșuat') + ' (rețea / furnizori externi)');
      for (const x of p.consoleErori || []) a.push(tag + ': console.error — ' + x.text + loc(x));
      for (const x of p.logErori || []) a.push(tag + ': browserul a raportat — ' + x.text + loc(x));
      for (const x of p.dialoguri || []) a.push(tag + ': dialog JS „' + x + '” (acceptat automat)');
      if (p.plafon && p.continutMs != null) a.push(tag + ': rețeaua nu s-a liniștit în ' + secunde(p.plafonMs) + ' (gata = —)');
      if (p.blocajMaxMs >= 2000) a.push(tag + ': firul principal a stat ocupat până la ' + secunde(p.blocajMaxMs) + ' (evaluarea probei a așteptat)');
      if (p.inchidereMs === null) a.push(tag + ': fila nu s-a închis în 15 s după măsurare (muncă rămasă în pagină)');
      else if (p.inchidereMs > 5000) a.push(tag + ': închiderea filei a durat ' + secunde(p.inchidereMs) + ' (muncă rămasă în pagină)');
      if (d.swAsteptat && p.sw && !p.sw.carcasa && !p.eroare) a.push(tag + ': service worker-ul nu controlează carcasa la a doua deschidere');
      for (const x of p.avertismente || []) a.push(tag + ': ' + x);
      const cheie = p.id || p.ruta;
      if (!pagini[cheie]) pagini[cheie] = { ok: true, motive: [], avertismente: [] };
      if (m.length) pagini[cheie].ok = false;
      pagini[cheie].motive.push(...m);
      pagini[cheie].avertismente.push(...a);
      motive.push(...m);
      avertismente.push(...a);
    }
  }
  return { verdict: motive.length ? 'rosu' : 'verde', motive, avertismente, pagini };
}

/** Timpii primei și celei de-a doua deschideri, pagină cu pagină. */
export function compara(deschideri) {
  const [a, b] = deschideri || [];
  return ((a && a.pagini) || []).map((p) => {
    const q = ((b && b.pagini) || []).find((x) => x.id === p.id);
    return { id: p.id, nume: p.nume, continut1: p.continutMs, continut2: q ? q.continutMs : null, gata1: p.gataMs, gata2: q ? q.gataMs : null };
  });
}

function timpi(p) {
  if (!p) return '—';
  if (p.eroare) return 'eroare';
  return 'conținut ' + secunde(p.continutMs) + ' · gata ' + (p.gataMs != null ? secunde(p.gataMs) : p.plafon ? '>' + secunde(p.plafonMs) : '—');
}
/** Rezumatul lizibil: o linie pe pagină (✓/✗, timpii celor două deschideri, erorile), apoi verdictul și motivele. */
export function rezumat(raport, ev) {
  const r = raport || {}, e = ev || evalueaza(r), baza = r.baza || BAZA_IMPLICITA, linii = [];
  const [d1, d2] = r.deschideri || [];
  linii.push('Proba de ecran · Decision App · ' + baza);
  linii.push('Versiunea publicată ' + ((d1 && d1.versiunePublicata) || '?') + ' · suita ' + ((d1 && d1.suitaPublicata) || '?') + (r.browser ? ' · ' + r.browser : ''));
  const p1 = (d1 && d1.pagini) || [], p2 = (d2 && d2.pagini) || [];
  const ids = [...new Set([...p1, ...p2].map((p) => p.id))];
  for (const id of ids) {
    const a = p1.find((p) => p.id === id), b = p2.find((p) => p.id === id), x = a || b;
    const ok = !(e.pagini[id] && e.pagini[id].ok === false);
    const js = [a, b].map((p) => (p ? (p.erori || []).reduce((s, q) => s + (q.n || 1), 0) : '—')).join('/');
    const proprii = [a, b].map((p) => (p ? (p.cereriEsuate || []).filter((c) => clasificaCerere(c, baza).clasa === 'rosu').length : '—')).join('/');
    const lipsa = [a, b].map((p) => (p ? (p.elemente || []).filter((q) => !q.ok).length : '—')).join('/');
    linii.push((ok ? '✓ ' : '✗ ') + String(x.nume).padEnd(17) + ' 1: ' + timpi(a).padEnd(34) + ' 2: ' + timpi(b).padEnd(34) + ' JS ' + js + ' · cereri proprii eșuate ' + proprii + ' · elemente lipsă ' + lipsa);
  }
  linii.push('');
  linii.push('VERDICT: ' + (e.verdict === 'verde' ? 'VERDE' : 'ROȘU — ' + e.motive.length + (e.motive.length === 1 ? ' motiv' : ' motive')));
  for (const m of e.motive.slice(0, 40)) linii.push('  ✗ ' + m);
  if (e.motive.length > 40) linii.push('  … încă ' + (e.motive.length - 40) + ' în raportul JSON');
  if (e.avertismente.length) {
    linii.push('Avertismente (' + e.avertismente.length + ', nu fac roșu):');
    for (const a of e.avertismente.slice(0, 30)) linii.push('  · ' + a);
    if (e.avertismente.length > 30) linii.push('  … încă ' + (e.avertismente.length - 30) + ' în raportul JSON');
  }
  return linii.join('\n');
}

/** 27.10.2026 (I-747): rezumatul scurt publicat în health/generated/proba-ecran.json (Health îl arată): verdictul, versiunea probată, durata,
 *  paginile cu timpii celor două deschideri, motivele (cel mult 20) și rularea. Raportul întreg (diagnostic, cereri) rămâne în jurnalul rulării. Pur. */
export function rezumatHealth(raport, ev, { rulare = null, commit = null } = {}) {
  const r = raport || {}, e = ev || evalueaza(r), [d1] = r.deschideri || [];
  return {
    versiune: 'proba-ecran-v1', unealta: 'tools/proba-ecran-decizie.mjs (I-725 / I-747)', la: r.pornit || null, durataMs: Number.isFinite(r.durataMs) ? r.durataMs : null,
    baza: r.baza || null, browser: r.browser || null, versiunePublicata: (d1 && d1.versiunePublicata) || null, suitaPublicata: (d1 && d1.suitaPublicata) || null,
    verdict: e.verdict, nMotive: e.motive.length, motive: e.motive.slice(0, 20).map((m) => String(m).slice(0, 300)), nAvertismente: e.avertismente.length,
    avertismente: e.avertismente.slice(0, 10).map((m) => String(m).slice(0, 300)), eroareProba: r.eroareProba ? String(r.eroareProba).slice(0, 300) : null,
    pagini: compara(r.deschideri).map((p) => ({ id: p.id, nume: p.nume, ok: !(e.pagini[p.id] && e.pagini[p.id].ok === false), continut1: p.continut1 ?? null, continut2: p.continut2 ?? null })),
    rulare: typeof rulare === 'string' && /^https:\/\//.test(rulare) ? rulare : null, commit: typeof commit === 'string' && commit ? commit.slice(0, 8) : null,
  };
}

/* ---------- argumentele ---------- */

export const AJUTOR = [
  'Proba de ecran pentru Decision App (I-725) — deschide paginile prin carcasă într-un Edge headless separat, de două ori.',
  '  node tools/proba-ecran-decizie.mjs [opțiuni]',
  '  --base <url>          baza site-ului (implicit ' + BAZA_IMPLICITA + '; acceptă și variabila de mediu BASE)',
  '  --pagini a,b,c        ' + PAGINI.map((p) => p.id).join(',') + ' (implicit toate, în ordinea asta)',
  '  --timp <ms>           plafonul pe pagină (implicit 60000)',
  '  --out <fișier.json>   raportul JSON (implicit în folderul temporar al sistemului)',
  '  --port <n>            portul CDP al lui Edge (implicit unul liber)',
  '  --profil <folder>     profilul Edge (implicit unul temporar, gol; un profil dat NU se șterge)',
  '  --pastreaza-profil    nu șterge profilul temporar la final',
  '  --browser <cale>      Edge / Chrome / Chromium (implicit Edge pe PC, altfel primul Chrome găsit; acceptă și BROWSER / CHROME_PATH)',
  '  --fara-sandbox        pentru runnerul CI (Linux): --no-sandbox și --disable-dev-shm-usage',
  '  --rezumat <fișier>    rezumatul scurt pentru Health (health/generated/proba-ecran.json)',
  '  --asteapta-versiune <v>  așteaptă (cel mult 10 min) ca site-ul să servească app/version.json = v înainte de probă',
  'Ieșirea: 0 = verde, 1 = roșu.',
].join('\n');

function normalizeaza(s) {
  const x = String(s).trim().toLowerCase();
  if (x === 'tichet' || x === 'ticket' || x === 'desk-ticket' || /^desk\/?\?ticket=1$/.test(x)) return 'desk-tichet';
  return x.split('#')[0].replace(/\/+$/, '');
}
export function alegePagini(text) {
  const ids = String(text || '').split(',').map((s) => s.trim()).filter(Boolean).map(normalizeaza);
  const necunoscute = ids.filter((id) => !PAGINI.some((p) => p.id === id));
  if (!ids.length || necunoscute.length) throw Error('pagini necunoscute: ' + (necunoscute.join(', ') || '(niciuna)') + ' — cunoscute: ' + PAGINI.map((p) => p.id).join(', '));
  return ids.map((id) => PAGINI.find((p) => p.id === id));
}
export function citesteArgumente(argv = [], env = {}) {
  const o = { base: env.BASE || BAZA_IMPLICITA, port: null, profil: null, pagini: PAGINI, out: null, pastreazaProfil: false, timp: 60000, ajutor: false,
    browser: env.BROWSER || env.CHROME_PATH || null, faraSandbox: false, rezumat: null, asteaptaVersiune: null };
  const lista = [];
  for (const a of argv) {
    const i = String(a).indexOf('=');
    if (String(a).startsWith('--') && i > 2) lista.push(a.slice(0, i), a.slice(i + 1));
    else lista.push(a);
  }
  for (let i = 0; i < lista.length; i++) {
    const a = lista[i];
    const val = () => {
      const v = lista[++i];
      if (v === undefined || String(v).startsWith('--')) throw Error('lipsește valoarea pentru ' + a);
      return v;
    };
    if (a === '--base') o.base = val();
    else if (a === '--port') o.port = Number(val());
    else if (a === '--profil') o.profil = val();
    else if (a === '--pagini') o.pagini = alegePagini(val());
    else if (a === '--out') o.out = val();
    else if (a === '--timp') o.timp = Number(val());
    else if (a === '--pastreaza-profil') o.pastreazaProfil = true;
    else if (a === '--browser') o.browser = val();
    else if (a === '--fara-sandbox') o.faraSandbox = true;
    else if (a === '--rezumat') o.rezumat = val();
    else if (a === '--asteapta-versiune') o.asteaptaVersiune = val();
    else if (a === '--ajutor' || a === '--help' || a === '-h') o.ajutor = true;
    else throw Error('argument necunoscut: ' + a);
  }
  if (!o.base.endsWith('/')) o.base += '/';
  let u;
  try { u = new URL(o.base); } catch { throw Error('--base nu e o adresă: ' + o.base); }
  if (!/^https?:$/.test(u.protocol)) throw Error('--base trebuie să fie http(s): ' + o.base);
  if (o.port !== null && !(Number.isInteger(o.port) && o.port > 0 && o.port < 65536)) throw Error('--port nevalid');
  if (!(Number.isFinite(o.timp) && o.timp >= 5000)) throw Error('--timp trebuie să fie cel puțin 5000 (ms)');
  if (o.asteaptaVersiune !== null && !/^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(o.asteaptaVersiune)) throw Error('--asteapta-versiune cere o versiune YY.MM.DD.HHMM');
  return o;
}

/* ---------- partea cu browserul (CDP prin WebSocket-ul din Node 24, fără npm) ---------- */

const asteapta = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  static async conecteaza(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(Error('WebSocket CDP nu s-a deschis: ' + url)); });
    return new Cdp(ws);
  }
  constructor(ws) {
    this.ws = ws; this.id = 0; this.asteptate = new Map(); this.ascultatori = new Set(); this.inchis = false;
    ws.onmessage = (e) => { try { this.mesaj(JSON.parse(String(e.data))); } catch { /* mesaj stricat: ignorat */ } };
    ws.onclose = () => {
      this.inchis = true;
      for (const p of this.asteptate.values()) { clearTimeout(p.t); p.rej(Error('conexiunea CDP s-a închis')); }
      this.asteptate.clear();
    };
  }
  mesaj(m) {
    if (m.id && this.asteptate.has(m.id)) {
      const p = this.asteptate.get(m.id);
      this.asteptate.delete(m.id); clearTimeout(p.t);
      if (m.error) p.rej(Error(m.error.message || 'eroare CDP')); else p.res(m.result || {});
      return;
    }
    if (m.method) for (const f of this.ascultatori) { try { f(m); } catch { /* un ascultător stricat nu oprește proba */ } }
  }
  trimite(method, params = {}, sessionId, ms = 20000) {
    if (this.inchis) return Promise.reject(Error('conexiunea CDP e închisă'));
    const id = ++this.id;
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.asteptate.delete(id); rej(Error('CDP fără răspuns în ' + ms + ' ms la ' + method)); }, ms);
      this.asteptate.set(id, { res, rej, t });
      this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }
  asculta(f) { this.ascultatori.add(f); }
  inchide() { try { this.ws.close(); } catch { /* deja închisă */ } }
}

function portLiber() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.unref(); s.on('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
async function raspundeCdp(port) {
  try { const r = await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(1500) }); return r.ok ? await r.json() : null; } catch { return null; }
}
async function pornesteEdge(opt, profil) {
  const port = opt.port || await portLiber();
  const exe = alegeBrowser(opt.browser);
  // garda: dacă portul răspunde deja, ne-am atașa la browserul ALTCUIVA
  if (await raspundeCdp(port)) throw Error('portul ' + port + ' răspunde deja la CDP (alt browser pornit cu --remote-debugging-port) — alege alt --port');
  const ci = opt.faraSandbox ? ['--no-sandbox', '--disable-dev-shm-usage'] : [];
  const proc = spawn(exe, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + profil, '--no-first-run', '--no-default-browser-check', '--window-size=412,915', ...ci, 'about:blank'], { stdio: 'ignore' });
  const b = { proc, port, iesit: false, eroare: null, cdp: null, produs: '' };
  proc.on('exit', () => { b.iesit = true; });
  proc.on('error', (e) => { b.iesit = true; b.eroare = e.message; });
  let v = null;
  for (let i = 0; i < 100 && !v && !b.iesit; i++) { v = await raspundeCdp(port); if (!v) await asteapta(200); }
  if (!v) {
    const motiv = b.eroare ? 'browserul (' + exe + ') nu a pornit: ' + b.eroare : b.iesit ? 'browserul (' + exe + ') s-a închis imediat (profilul e folosit de alt browser? pe Linux fără --fara-sandbox?)' : 'browserul (' + exe + ') nu a deschis portul CDP în 20 s';
    await opresteEdge(b);
    throw Error(motiv);
  }
  b.produs = v.Browser || '';
  // fără conexiune CDP browserul nu se mai poate închide politicos ⇒ îl oprim aici, să nu rămână orfan
  try { b.cdp = await Cdp.conecteaza(v.webSocketDebuggerUrl); } catch (e) { await opresteEdge(b); throw e; }
  return b;
}
async function opresteEdge(b) {
  if (!b) return;
  try { if (b.cdp && !b.cdp.inchis) await b.cdp.trimite('Browser.close', {}, undefined, 5000); } catch { /* browserul se închide oricum */ }
  for (let i = 0; i < 50 && !b.iesit; i++) await asteapta(200);
  if (!b.iesit) {
    try { spawnSync('taskkill', ['/PID', String(b.proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* nu e Windows */ }
    try { b.proc.kill(); } catch { /* deja oprit */ }
    for (let i = 0; i < 25 && !b.iesit; i++) await asteapta(200);
  }
  if (b.cdp) b.cdp.inchide();
  // Windows: profilul se eliberează abia după ce ies și procesele copil
  await asteapta(1000);
}

/** Citește de pe site, cu cache-bust, versiunea aplicației (app/version.json) și a suitei (CACHE_VERSION din sw-app.js). */
async function citestePublicat(baza) {
  const out = { versiune: null, suita: null, erori: [] };
  try {
    const r = await fetch(baza + 'app/version.json?v=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw Error('HTTP ' + r.status);
    const j = await r.json();
    if (typeof j.version !== 'string') throw Error('fără câmpul version');
    out.versiune = j.version;
  } catch (e) { out.erori.push('app/version.json: ' + e.message); }
  try {
    const r = await fetch(baza + 'sw-app.js?v=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw Error('HTTP ' + r.status);
    const m = (await r.text()).match(/CACHE_VERSION\s*=\s*'([^']+)'/);
    if (!m) throw Error('fără CACHE_VERSION');
    out.suita = m[1];
  } catch (e) { out.erori.push('sw-app.js: ' + e.message); }
  return out;
}

// Rulează ÎN carcasă (trimisă ca text prin Runtime.evaluate): cadrul activ, textul lui, elementele-cheie, versiunea, service worker-ul.
function stareInPagina(selectori, continutSel) {
  const out = { cadru: '', text: 0, stareDoc: null, continutSel: true, elemente: [], versiune: null, sw: { carcasa: false, cadru: false }, carcasa: null };
  const f = document.querySelector('iframe[data-tt-active="1"]') || document.getElementById('frame');
  let d = null;
  try { d = f ? f.contentDocument : null; out.cadru = f && f.contentWindow ? String(f.contentWindow.location.href) : ''; } catch (e) { out.eroareCadru = String((e && e.message) || e); }
  out.text = d && d.body ? d.body.innerText.trim().length : 0;
  out.stareDoc = d ? d.readyState : null;
  if (continutSel) out.continutSel = !!(d && d.querySelector(continutSel));
  out.elemente = selectori.map((s) => {
    try {
      const el = d ? d.querySelector(s) : null;
      return { exista: !!el, text: el ? String(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160) : '' };
    } catch (e) { return { exista: false, text: '', eroare: String((e && e.message) || e) }; }
  });
  out.versiune = document.documentElement.getAttribute('data-app-version');
  try { out.sw.carcasa = !!(navigator.serviceWorker && navigator.serviceWorker.controller); } catch (e) { /* fără SW */ }
  try { out.sw.cadru = !!(f && f.contentWindow.navigator.serviceWorker && f.contentWindow.navigator.serviceWorker.controller); } catch (e) { /* fără SW */ }
  try { const n = performance.getEntriesByType('navigation')[0]; if (n) out.carcasa = { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) }; } catch (e) { /* fără măsurători */ }
  return out;
}
// Rulează ÎN carcasă: modulul activ cere tichetul exact cum o face scannerul (candidate-engine/engine.js: parent.postMessage({ttOpenModule:'desk/', ttQuery})).
// Scriptul e pus în documentul cadrului ⇒ mesajul pleacă din fereastra modulului (carcasa acceptă doar e.source === cadrul activ).
function deschideTichet() {
  const f = document.querySelector('iframe[data-tt-active="1"]') || document.getElementById('frame');
  const d = f && f.contentDocument;
  if (!d || !d.documentElement) return false;
  const s = d.createElement('script');
  s.textContent = "parent.postMessage({ttOpenModule:'desk/',ttQuery:'ticket=1'},location.origin)";
  (d.head || d.documentElement).appendChild(s);
  s.remove();
  return true;
}
async function inPagina(cdp, S, expresie) {
  try {
    const r = await cdp.trimite('Runtime.evaluate', { expression: expresie, returnByValue: true }, S, 10000);
    return r.exceptionDetails ? null : (r.result ? r.result.value : null);
  } catch { return null; }
}

function formateazaExceptie(det) {
  const ex = det.exception || {}, cf = (det.stackTrace && det.stackTrace.callFrames) || [];
  const desc = String(ex.description || (ex.value !== undefined ? ex.value : '') || '').split('\n')[0];
  const text = String(det.text || '').trim();
  const prefix = text && !desc.startsWith(text) ? text + (desc ? ' ' : '') : '';
  const mesaj = (prefix + desc) || text || 'excepție fără mesaj';
  const url = det.url || (cf[0] && cf[0].url) || '';
  const linie = det.url ? det.lineNumber : (cf[0] ? cf[0].lineNumber : undefined);
  const col = det.url ? det.columnNumber : (cf[0] ? cf[0].columnNumber : undefined);
  return {
    mesaj: mesaj.slice(0, 300), fisier: url ? curata(url) : '', rand: Number.isFinite(linie) ? linie + 1 : null, coloana: Number.isFinite(col) ? col + 1 : null,
    stiva: cf.slice(0, 4).map((f) => (f.functionName || '(anonim)') + ' @ ' + curata(f.url) + ':' + (f.lineNumber + 1)),
  };
}
function textConsola(args) {
  return (args || []).map((a) => (a.value !== undefined ? (typeof a.value === 'string' ? a.value : JSON.stringify(a.value)) : a.description || a.unserializableValue || a.type || '')).join(' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}

/** Colectorul unei pagini: cereri, excepții, console.error, refuzuri, contexte și cadre (pentru atribuire). */
function colectorNou(baza, cadruPrincipal) {
  const c = { cereri: new Map(), erori: new Map(), consoleErori: new Map(), refuzuri: new Map(), logErori: new Map(), dialoguri: [], contexte: new Map(), cadre: new Map(), cuContext: new Set(), tinte: [], ultimaActivitate: Date.now() };
  const cheie = (ses, id) => (ses ? ses.id : 'p') + '|' + id;
  const fundal = (frameId) => RE_FUNDAL.test(c.cadre.get(frameId) || '');
  const activ = (frameId) => { if (!frameId || !fundal(frameId)) c.ultimaActivitate = Date.now(); };
  const cadruDin = (ses, ctxId) => {
    if (ses) return ses.tip + ' ' + scurt(ses.url, baza);
    const x = c.contexte.get(cheie(null, ctxId));
    if (!x) return '';
    return x.frameId === cadruPrincipal ? 'carcasa' : scurt(c.cadre.get(x.frameId) || x.origin || '', baza);
  };
  const adauga = (harta, o, ...extra) => {
    const k = [o.mesaj || o.text, o.fisier, o.rand].join('|');
    const v = harta.get(k);
    if (v) { v.n++; if (extra.length) v.ids.push(...extra); } else harta.set(k, { ...o, n: 1, ids: extra });
  };
  c.eveniment = (m, ses) => {
    const p = m.params || {};
    switch (m.method) {
      case 'Page.frameNavigated': if (!ses && p.frame) c.cadre.set(p.frame.id, p.frame.url); break;
      case 'Network.requestWillBeSent': {
        if (!ses && p.type === 'Document' && p.frameId) c.cadre.set(p.frameId, p.request.url);
        const k = cheie(ses, p.requestId), vechi = c.cereri.get(k);
        if (vechi) vechi.url = p.request.url;
        // cererile făcute DE service worker (preluarea răspunsului pentru pagină, precache) se numără separat; eșecurile lor contează
        else c.cereri.set(k, { url: p.request.url, tip: p.type || '', frameId: ses ? null : p.frameId || null, dinWorkerSW: !!(ses && /service/.test(ses.tip)) });
        activ(ses ? null : p.frameId);
        break;
      }
      case 'Network.responseReceived': {
        const r = c.cereri.get(cheie(ses, p.requestId));
        if (r && p.response) { r.status = p.response.status; r.dinSW = !!p.response.fromServiceWorker; r.mime = p.response.mimeType || ''; }
        break;
      }
      case 'Network.loadingFinished': {
        const r = c.cereri.get(cheie(ses, p.requestId));
        if (r) { r.octeti = p.encodedDataLength || 0; activ(r.frameId); }
        break;
      }
      case 'Network.loadingFailed': {
        const r = c.cereri.get(cheie(ses, p.requestId));
        if (r) { r.eroare = p.errorText || 'eșuată'; r.anulata = !!p.canceled; r.blocat = p.blockedReason || ''; if (!r.tip) r.tip = p.type || ''; activ(r.frameId); }
        break;
      }
      case 'Runtime.executionContextCreated': {
        const x = p.context || {}, aux = x.auxData || {};
        c.contexte.set(cheie(ses, x.id), { frameId: aux.frameId || null, tip: aux.type || '', origin: x.origin || '' });
        if (!ses && aux.isDefault && aux.frameId && aux.frameId !== cadruPrincipal) c.cuContext.add(aux.frameId);
        break;
      }
      case 'Runtime.exceptionThrown': {
        const det = p.exceptionDetails || {}, x = c.contexte.get(cheie(ses, det.executionContextId));
        // context izolat = scripturile unei extensii a browserului, nu codul aplicației
        if (x && x.tip === 'isolated') break;
        adauga(c.erori, { ...formateazaExceptie(det), cadru: cadruDin(ses, det.executionContextId) }, det.exceptionId);
        break;
      }
      case 'Runtime.exceptionRevoked': {
        // promisiune respinsă care a primit totuși un handler ⇒ nu mai e excepție neprinsă
        for (const [k, e] of c.erori) {
          const i = e.ids.indexOf(p.exceptionId);
          if (i >= 0) { e.ids.splice(i, 1); e.n--; if (e.n <= 0) c.erori.delete(k); break; }
        }
        break;
      }
      case 'Runtime.consoleAPICalled': {
        if (p.type !== 'error' && p.type !== 'assert') break;
        const x = c.contexte.get(cheie(ses, p.executionContextId));
        if (x && x.tip === 'isolated') break;
        const cf = (p.stackTrace && p.stackTrace.callFrames && p.stackTrace.callFrames[0]) || null;
        adauga(c.consoleErori, { text: textConsola(p.args), fisier: cf ? curata(cf.url) : '', rand: cf ? cf.lineNumber + 1 : null, cadru: cadruDin(ses, p.executionContextId) });
        break;
      }
      case 'Log.entryAdded': {
        const en = p.entry || {};
        if (en.level !== 'error') break;
        const text = String(en.text || '').replace(/\s+/g, ' ').slice(0, 300);
        // „Refused to …” = browserul a blocat ceva (CSP, nosniff, X-Frame-Options) ⇒ roșu; foaia de stil cu tip MIME greșit
        // NU mai e raportată de Edge 155 (proba-martor 20.10) ⇒ o prinde verificarea răspunsului din c.rezultat
        if (/^Refused to /.test(text)) adauga(c.refuzuri, { text, fisier: en.url ? curata(en.url) : '', rand: Number.isFinite(en.lineNumber) ? en.lineNumber + 1 : null });
        // erorile de rețea le are deja Network (loadingFailed / status), aici ar fi dubluri
        else if (en.source !== 'network') adauga(c.logErori, { text, fisier: en.url ? curata(en.url) : '', rand: null });
        break;
      }
      default: break;
    }
  };
  c.tinta = (ti) => { if (c.tinte.length < 20) c.tinte.push(ti.type + ' ' + scurt(ti.url, baza)); };
  c.rezultat = () => {
    const cereri = [...c.cereri.values()];
    // 20.10.2026: Edge 155 nu mai spune nimic (nici Log, nici Audits) când o foaie de stil vine ca text/html ⇒ se vede doar pe răspuns.
    // Același lucru pentru un script servit ca pagină HTML (de obicei 404-ul site-ului sau o copie greșită din service worker).
    for (const r of cereri) {
      if (r.eroare || !(r.status < 400) || !r.mime) continue;
      if ((r.tip === 'Stylesheet' && !/^text\/css/i.test(r.mime)) || (r.tip === 'Script' && /^text\/html/i.test(r.mime))) r.eroare = 'tip MIME greșit: ' + r.mime;
    }
    const esuate = cereri.filter((r) => r.eroare || r.status >= 400);
    const anulate = esuate.filter((r) => (r.anulata || /ERR_ABORTED/.test(r.eroare || '')) && !(r.status >= 400));
    const rest = esuate.filter((r) => !anulate.includes(r));
    const proprii = rest.filter((r) => origine(r.url) === origine(baza)), straine = rest.filter((r) => origine(r.url) !== origine(baza));
    const fara = (x) => { const { ids, ...rest2 } = x; return rest2; };
    const aleFilei = cereri.filter((r) => !r.dinWorkerSW);
    return {
      cereri: aleFilei.length, kb: Math.round(aleFilei.reduce((s, r) => s + (r.octeti || 0), 0) / 1024), dinSW: aleFilei.filter((r) => r.dinSW).length, cereriServiceWorker: cereri.length - aleFilei.length,
      cereriEsuate: [...proprii, ...straine.slice(0, 60)].map((r) => ({ url: curata(r.url), status: r.status || 0, eroare: r.eroare || '', blocat: r.blocat || '', tip: r.tip || '', cadru: r.frameId ? scurt(c.cadre.get(r.frameId) || '', baza) : '' })),
      cereriAnulate: anulate.length, tertiOmise: Math.max(0, straine.length - 60),
      erori: [...c.erori.values()].map(fara), consoleErori: [...c.consoleErori.values()].slice(0, 30).map(fara),
      refuzuri: [...c.refuzuri.values()].map(fara), logErori: [...c.logErori.values()].slice(0, 20).map(fara), dialoguri: c.dialoguri.slice(0, 10),
      diagnostic: { iframeCuContextPePagina: [...c.cuContext].map((f) => scurt(c.cadre.get(f) || '?', baza)), tinteCopil: c.tinte },
    };
  };
  return c;
}

/** Ascultarea browserului: filele probei și țintele lor copil (iframe-uri în alt proces, workeri, service worker-ul aplicației). */
async function conecteaza(b, baza) {
  const { cdp } = b;
  // atasate: ținta → sesiunea prin care o ascultăm (o singură sesiune pe țintă); distrugeri: ținta → așteptarea închiderii ei
  const ctx = { cdp, baza, S: null, tinta: null, cadruPrincipal: null, colector: null, atasate: new Map(), sesiuni: new Map(), distrugeri: new Map() };
  const proprie = (url) => origine(url) === origine(baza);
  /* 20.10.2026 — CAPCANĂ (proba pe viu): o sesiune CDP atașată DIRECT (Target.attachToTarget) la service worker-ul carcasei face ca,
     la repornirea lui (Chrome îl oprește după câteva secunde de inactivitate, de ex. în timpul Pieței), worker-ul nou să aștepte
     depanatorul ⇒ navigările spre app/ au atârnat 60 s, toate, până la repornirea browserului. Service worker-ul vine aici doar ca
     țintă copil a filei (auto-attach), unde fiecare pornire aduce Target.attachedToTarget și primește Runtime.runIfWaitingForDebugger. */
  cdp.asculta((m) => {
    const s = m.sessionId, p = m.params || {};
    if (m.method === 'Target.targetDestroyed') {
      const f = ctx.distrugeri.get(p.targetId);
      if (f) f();
      return;
    }
    if (m.method === 'Target.attachedToTarget') {
      // doar țintele copil (venite pe sesiunea filei sau a unui iframe); atașarea filei însăși (fără sessionId) o face filaNoua.
      // Reluarea (runIfWaitingForDebugger) pleacă ORICUM, și pentru țintele pe care nu le ascultăm, ca nimic să nu rămână în pauză.
      if (!s) return;
      const ch = p.sessionId, ti = p.targetInfo || {}, nou = !ctx.atasate.has(ti.targetId), aici = nou && proprie(ti.url);
      if (nou) ctx.atasate.set(ti.targetId, ch);
      if (aici) ctx.sesiuni.set(ch, { id: ch, tip: ti.type, url: ti.url });
      if (ctx.colector && nou) ctx.colector.tinta(ti);
      (async () => {
        try {
          if (aici) {
            await cdp.trimite('Runtime.enable', {}, ch);
            await cdp.trimite('Log.enable', {}, ch).catch(() => {});
            await cdp.trimite('Network.enable', {}, ch).catch(() => {});
            if (ti.type === 'iframe') await cdp.trimite('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, ch).catch(() => {});
          }
        } catch { /* ținta a dispărut între timp */ } finally { cdp.trimite('Runtime.runIfWaitingForDebugger', {}, ch).catch(() => {}); }
      })();
      return;
    }
    if (m.method === 'Target.detachedFromTarget') {
      ctx.sesiuni.delete(p.sessionId);
      for (const [t, x] of ctx.atasate) if (x === p.sessionId) ctx.atasate.delete(t);
      return;
    }
    if (m.method === 'Page.javascriptDialogOpening' && s) {
      // orice dialog (și „beforeunload” la închiderea filei) e acceptat, altfel fila rămâne agățată
      if (ctx.colector && s === ctx.S) ctx.colector.dialoguri.push(String(p.message || p.type || '').slice(0, 120));
      cdp.trimite('Page.handleJavaScriptDialog', { accept: true }, s).catch(() => {});
      return;
    }
    if (!ctx.colector) return;
    if (s === ctx.S) ctx.colector.eveniment(m, null);
    else if (s && ctx.sesiuni.has(s)) ctx.colector.eveniment(m, ctx.sesiuni.get(s));
  });
  // fila de pornire (about:blank) rămâne deschisă și ține browserul viu între filele probei
  await cdp.trimite('Target.setDiscoverTargets', { discover: true });
  return ctx;
}

const cuTermen = (promisiune, ms) => {
  let t;
  return Promise.race([promisiune.finally(() => clearTimeout(t)), new Promise((res) => { t = setTimeout(() => res(false), ms); })]);
};
/* 20.10.2026: fiecare pagină se măsoară într-o filă NOUĂ. Proba pe viu: după Piață (motoarele pornesc singure în profil gol),
   Page.navigate spre about:blank a răspuns abia după ~10 s, iar navigarea următoare în aceeași filă a rămas agățată 60 s. */
async function filaNoua(ctx) {
  const { cdp } = ctx;
  // sesiunile copil ale filei vechi (iframe-uri, workeri, service worker) au plecat odată cu ea
  ctx.sesiuni.clear();
  ctx.atasate.clear();
  const { targetId } = await cdp.trimite('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.trimite('Target.attachToTarget', { targetId, flatten: true });
  ctx.tinta = targetId;
  ctx.S = sessionId;
  for (const [metoda, params] of [['Page.enable', {}], ['Network.enable', {}], ['Runtime.enable', {}], ['Log.enable', {}],
    // ecran de telefon, ca --window-size=412,915 (carcasa: max-width 760px ⇒ 4 pagini vii)
    ['Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 0, mobile: false }],
    ['Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }]]) await cdp.trimite(metoda, params, sessionId);
  const { frameTree } = await cdp.trimite('Page.getFrameTree', {}, sessionId);
  ctx.cadruPrincipal = frameTree.frame.id;
}
/** Închide fila curentă și așteaptă să dispară (cel mult 15 s) ⇒ munca rămasă în ea nu se amestecă în pagina următoare.
 *  Întoarce durata închiderii (ms) sau null dacă fila n-a dispărut în 15 s. */
async function inchideFila(ctx) {
  if (!ctx.tinta) return undefined;
  const id = ctx.tinta, t0 = Date.now();
  ctx.tinta = null;
  ctx.S = null;
  const disparuta = new Promise((res) => { ctx.distrugeri.set(id, () => res(true)); });
  try { await ctx.cdp.trimite('Target.closeTarget', { targetId: id }, undefined, 15000); } catch { /* fila e deja închisă sau browserul nu răspunde */ }
  const ok = await cuTermen(disparuta, 15000);
  ctx.distrugeri.delete(id);
  return ok ? Date.now() - t0 : null;
}

async function masoaraPagina(ctx, pagina, opt, publicat) {
  const { cdp, S } = ctx;
  const rez = { id: pagina.id, ruta: pagina.ruta, nume: pagina.nume, adresa: opt.base + 'app/?module=' + encodeURIComponent(pagina.ruta) + (pagina.interogare ? '&' + pagina.interogare : ''), plafonMs: opt.timp, continutMs: null, gataMs: null, plafon: false, blocajMaxMs: 0, avertismente: [] };
  const c = colectorNou(opt.base, ctx.cadruPrincipal);
  ctx.colector = c;
  const expr = '(' + stareInPagina + ')(' + JSON.stringify(pagina.elemente.map((e) => e.selector)) + ', ' + JSON.stringify(pagina.continut || null) + ')';
  const t0 = Date.now();
  c.ultimaActivitate = t0;
  try {
    const nav = await cdp.trimite('Page.navigate', { url: rez.adresa }, S, opt.timp);
    if (nav.errorText) rez.eroare = 'navigarea a eșuat: ' + nav.errorText;
  } catch (e) { rez.eroare = 'navigarea a eșuat: ' + e.message; }
  let stare = null, continutLa = null, declansat = false;
  while (!rez.eroare) {
    if (cdp.inchis) { rez.eroare = 'conexiunea cu browserul s-a pierdut (a căzut?)'; break; }
    if (Date.now() - t0 >= opt.timp) { rez.plafon = true; break; }
    await asteapta(PAS_MS);
    const inainte = Date.now();
    const s = await inPagina(cdp, S, expr);
    // cât a așteptat evaluarea ≈ cât a stat ocupat firul principal (o pagină „înghețată” se vede aici; plafon 10 s)
    rez.blocajMaxMs = Math.max(rez.blocajMaxMs, Date.now() - inainte);
    if (!s) continue;
    stare = s;
    // tichetul: carcasa nu citește ticket=1 din adresa ei ⇒ îl cere modulul, prin mesajul folosit de scanner (o singură dată)
    if (pagina.tichet && !declansat && s.text > TEXT_MINIM && s.stareDoc !== 'loading' && /\/desk\//.test(s.cadru) && !/[?&]ticket=1/.test(s.cadru)) {
      declansat = !!(await inPagina(cdp, S, '(' + deschideTichet + ')()'));
      continue;
    }
    if (!continutLa && s.text > TEXT_MINIM && s.continutSel) continutLa = Date.now();
    if (!continutLa) continue;
    const liniste = Date.now() - c.ultimaActivitate;
    const toate = pagina.elemente.every((e, i) => verificaElement(e, s.elemente[i]).ok);
    if (liniste >= LINISTE_MS && (toate || liniste >= LINISTE_MS + ASTEPTARE_ELEMENTE_MS)) { rez.gataMs = Math.max(continutLa, c.ultimaActivitate) - t0; break; }
  }
  const fin = rez.eroare ? stare : (await inPagina(cdp, S, expr)) || stare;
  rez.continutMs = continutLa ? continutLa - t0 : null;
  rez.durataMs = Date.now() - t0;
  if (!rez.eroare) {
    const el = pagina.elemente.map((e, i) => verificaElement(e, fin && fin.elemente ? fin.elemente[i] : null));
    rez.elemente = [verificaCadru(pagina, fin && fin.cadru, opt.base), ...el];
    if (pagina.suita) { const ins = el.find((x) => x.selector === '#suiteBadge'); rez.suita = { insigna: (ins && ins.ok && ins.text) || null, publicata: publicat.suita }; }
  }
  rez.cadru = fin && fin.cadru ? scurt(fin.cadru, opt.base) : '';
  rez.versiune = { carcasa: (fin && fin.versiune) || null, publicata: publicat.versiune };
  rez.sw = fin ? fin.sw : null;
  rez.carcasa = fin ? fin.carcasa : null;
  if (pagina.tichet) {
    const deschis = !!(fin && fin.continutSel);
    rez.tichet = { prinAdresa: deschis && !declansat, prinMesaj: deschis && declansat };
    if (declansat) rez.avertismente.push('carcasa nu transmite ticket=1 din adresa ei (app/?module=desk%2F&ticket=1 a deschis Planuri fără tichet)' + (deschis ? '; tichetul s-a deschis prin mesajul ttOpenModule al modulului (calea folosită de scanner)' : ''));
  }
  Object.assign(rez, c.rezultat());
  rez.diagnostic.serviceWorkereAscultate = [...ctx.sesiuni.values()].filter((v) => /service/.test(v.tip)).map((v) => scurt(v.url, opt.base));
  ctx.colector = null;
  return rez;
}

function progres(eticheta, p) {
  const js = (p.erori || []).reduce((s, e) => s + (e.n || 1), 0);
  process.stderr.write('[' + eticheta + '] ' + p.nume + ' · ' + timpi(p) + ' · JS ' + js + ' · cereri ' + (p.cereri ?? '—') + ' · blocaj max ' + secunde(p.blocajMaxMs) + ' · închidere ' + (p.inchidereMs === null ? '>15 s' : secunde(p.inchidereMs)) + (p.eroare ? ' · ' + p.eroare : '') + '\n');
}

async function deschidere(b, opt, publicat, eticheta) {
  const d = { eticheta, pornit: new Date().toISOString(), versiunePublicata: publicat.versiune, suitaPublicata: publicat.suita, eroriCitire: publicat.erori, pagini: [] };
  const ctx = await conecteaza(b, opt.base);
  for (const pagina of opt.pagini) {
    if (b.cdp.inchis) break;
    let p;
    try {
      await filaNoua(ctx);
      p = await masoaraPagina(ctx, pagina, opt, publicat);
    } catch (e) {
      p = { id: pagina.id, ruta: pagina.ruta, nume: pagina.nume, eroare: 'proba paginii a căzut: ' + e.message, plafonMs: opt.timp, continutMs: null, gataMs: null };
      ctx.colector = null;
    }
    // fila se închide înainte de pagina următoare; o închidere lungă înseamnă muncă rămasă în pagină
    p.inchidereMs = await inchideFila(ctx);
    d.pagini.push(p);
    progres(eticheta, p);
  }
  return d;
}

function stergeProfil(profil) {
  try { rmSync(profil, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch (e) { process.stderr.write('Profilul temporar nu a putut fi șters (' + e.message + '): ' + profil + '\n'); }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  let opt;
  try { opt = citesteArgumente(argv, env); } catch (e) { console.error('Argumente: ' + e.message + '\n\n' + AJUTOR); return 1; }
  if (opt.ajutor) { console.log(AJUTOR); return 0; }
  const out = resolve(opt.out || join(tmpdir(), 'proba-ecran-decizie-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'));
  const temporar = !opt.profil;
  const profil = temporar ? mkdtempSync(join(tmpdir(), 'proba-ecran-decizie-')) : resolve(opt.profil);
  const raport = { unealta: 'proba-ecran-decizie (I-725)', baza: opt.base, pornit: new Date().toISOString(), profil: temporar ? '(temporar, ' + (opt.pastreazaProfil ? 'păstrat: ' + profil : 'șters la final') + ')' : profil, plafonMs: opt.timp, pagini: opt.pagini.map((p) => p.id), deschideri: [] };
  const t0 = Date.now();
  try {
    // I-747: după publicare, întâi versiunea din depozit trebuie să fie cea servită de site (Pages + CDN pot întârzia câteva minute)
    if (opt.asteaptaVersiune) {
      const w = { ceruta: opt.asteaptaVersiune, gasita: null, ms: 0 }, start = Date.now();
      for (;;) {
        w.gasita = (await citestePublicat(opt.base)).versiune; w.ms = Date.now() - start;
        if (w.gasita === w.ceruta || w.ms >= 600000) break;
        process.stderr.write('[așteptare] site-ul servește ' + (w.gasita || '—') + ', aștept ' + w.ceruta + '\n');
        await asteapta(20000);
      }
      raport.asteptare = w;
    }
    // a doua deschidere: ACELAȘI profil, browserul repornit ⇒ service worker-ul și cache-urile din prima trecere sunt active
    for (const [eticheta, swAsteptat] of [['prima', false], ['a doua', true]]) {
      const publicat = await citestePublicat(opt.base);
      const b = await pornesteEdge(opt, profil);
      try {
        raport.browser = b.produs;
        const d = await deschidere(b, opt, publicat, eticheta);
        d.swAsteptat = swAsteptat;
        raport.deschideri.push(d);
      } finally { await opresteEdge(b); }
    }
  } catch (e) {
    raport.eroareProba = e.message;
  } finally {
    if (temporar && !opt.pastreazaProfil) stergeProfil(profil);
  }
  raport.durataMs = Date.now() - t0;
  raport.comparatie = compara(raport.deschideri);
  const ev = evalueaza(raport);
  raport.verdict = ev.verdict;
  raport.motive = ev.motive;
  raport.avertismente = ev.avertismente;
  try { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(raport, null, 1)); } catch (e) { console.error('Raportul JSON nu a putut fi scris: ' + e.message); }
  if (opt.rezumat) {
    const scurtat = resolve(opt.rezumat);
    try { mkdirSync(dirname(scurtat), { recursive: true }); writeFileSync(scurtat, JSON.stringify(rezumatHealth(raport, ev, { rulare: env.RUN_URL || null, commit: env.GITHUB_SHA || null }), null, 1) + '\n'); } catch (e) { console.error('Rezumatul pentru Health nu a putut fi scris: ' + e.message); }
  }
  console.log(rezumat(raport, ev));
  console.log('Raport JSON: ' + out + ' · durata ' + secunde(raport.durataMs));
  return ev.verdict === 'verde' ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then((cod) => {
    process.exitCode = cod;
    // plasă: dacă un mâner rămas deschis ține procesul viu, ieșim oricum
    setTimeout(() => process.exit(cod), 5000).unref();
  }, (e) => { console.error('Proba de ecran: ' + ((e && e.stack) || e)); process.exit(1); });
}
