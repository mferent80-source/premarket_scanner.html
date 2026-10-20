// 20.10.2026 (I-725): evaluarea probei de ecran (tools/proba-ecran-decizie.mjs) — fără browser, pe rapoarte construite de mână.
// Roșu: excepție JS, element-cheie lipsă, versiunea veche din cache, cerere proprie eșuată. Zgomot documentat: 404 pe date opționale,
// cereri anulate, alte origini.
import test from 'node:test';
import assert from 'node:assert/strict';
import { evalueaza, clasificaCerere, verificaElement, verificaCadru, citesteArgumente, alegePagini, rezumat, scurt, PAGINI, BAZA_IMPLICITA } from './proba-ecran-decizie.mjs';

const BAZA = 'https://exemplu.test/premarket_scanner.html/';
const VER = '26.01.02.0304';
const pagina = (over = {}) => ({
  id: 'today', ruta: 'today/', nume: 'Astăzi', continutMs: 1200, gataMs: 4100, plafon: false, plafonMs: 60000,
  erori: [], consoleErori: [], refuzuri: [], cereriEsuate: [], logErori: [], dialoguri: [], avertismente: [],
  elemente: [{ nume: 'cadrul modulului', selector: 'iframe → today/', ok: true, text: 'today/' }, { nume: 'verdictul pieței', selector: '#marketVerdict', ok: true, text: 'Verdictul pieței · după sesiunea din luni' }],
  versiune: { carcasa: VER, publicata: VER }, sw: { carcasa: true, cadru: false }, ...over,
});
const raport = (pagini, over = {}) => ({ baza: BAZA, deschideri: [{ eticheta: 'prima', pagini }], ...over });

test('verde: fără excepții, elemente găsite, versiunea la zi', () => {
  const ev = evalueaza(raport([pagina(), pagina({ id: 'desk', ruta: 'desk/', nume: 'Planuri' })]));
  assert.equal(ev.verdict, 'verde');
  assert.deepEqual(ev.motive, []);
  assert.equal(ev.pagini.today.ok, true);
});

test('o excepție JS ⇒ roșu, cu mesajul, fișierul și rândul', () => {
  const ev = evalueaza(raport([pagina({ erori: [{ mesaj: 'Uncaught TypeError: x is not a function', fisier: BAZA + 'desk/', rand: 121, coloana: 7, cadru: 'desk/', n: 1 }] })]));
  assert.equal(ev.verdict, 'rosu');
  assert.equal(ev.motive.length, 1);
  assert.match(ev.motive[0], /excepție JS — Uncaught TypeError: x is not a function \(desk\/index\.html:121:7\)/);
  assert.equal(ev.pagini.today.ok, false);
});

test('element-cheie lipsă ⇒ roșu, cu selectorul', () => {
  const lipsa = verificaElement({ nume: 'verdictul tichetului', selector: '#ticketVerdict', text: '\\S' }, { exista: false, text: '' });
  assert.equal(lipsa.ok, false);
  const ev = evalueaza(raport([pagina({ elemente: [lipsa] })]));
  assert.equal(ev.verdict, 'rosu');
  assert.match(ev.motive[0], /element-cheie lipsă „verdictul tichetului” \(#ticketVerdict\) — lipsește din pagină/);
});

test('textul static rămas sau textul greșit ⇒ elementul nu trece', () => {
  assert.equal(verificaElement({ nume: 'g', selector: '#guardVerdict', diferitDe: '—' }, { exista: true, text: '—' }).ok, false);
  assert.equal(verificaElement({ nume: 'g', selector: '#guardVerdict', diferitDe: '—' }, { exista: true, text: 'DATE LIPSĂ' }).ok, true);
  assert.equal(verificaElement({ nume: 'v', selector: '#marketVerdict', text: 'Verdictul pieței' }, { exista: true, text: 'Se citesc sursele pieței…' }).ok, false);
  assert.equal(verificaElement({ nume: 's', selector: '#suiteBadge', text: '^tt-v\\d+' }, { exista: true, text: 'tt-v981' }).ok, true);
  assert.equal(verificaCadru({ ruta: 'journal/#exec' }, BAZA + 'journal/?app=decision-mobile-v2&v=1#exec', BAZA).ok, true);
  assert.equal(verificaCadru({ ruta: 'desk/' }, BAZA + 'today/?app=decision-mobile-v2', BAZA).ok, false);
});

test('versiune diferită ⇒ roșu „versiunea veche din cache”', () => {
  const ev = evalueaza(raport([pagina({ versiune: { carcasa: '26.01.01.0000', publicata: VER } })]));
  assert.equal(ev.verdict, 'rosu');
  assert.match(ev.motive[0], /versiunea veche din cache — carcasa 26\.01\.01\.0000, publicată 26\.01\.02\.0304/);
  // fără versiunea publicată nu se poate confirma nimic ⇒ tot roșu
  assert.equal(evalueaza(raport([pagina({ versiune: { carcasa: VER, publicata: null } })])).verdict, 'rosu');
});

test('404 pe fișier de date opțional ⇒ NU e roșu; 404 pe fișier propriu de cod ⇒ roșu', () => {
  const date = { url: BAZA + 'scanner-verdicts/generated/v1-proba.json', status: 404, eroare: '', tip: 'Fetch' };
  assert.equal(clasificaCerere(date, BAZA).clasa, 'zgomot');
  assert.equal(evalueaza(raport([pagina({ cereriEsuate: [date] })])).verdict, 'verde');
  const cod = { url: BAZA + 'lib/data.js', status: 404, eroare: '', tip: 'Script' };
  assert.equal(clasificaCerere(cod, BAZA).clasa, 'rosu');
  const ev = evalueaza(raport([pagina({ cereriEsuate: [date, cod] })]));
  assert.equal(ev.verdict, 'rosu');
  assert.equal(ev.motive.length, 1);
  assert.match(ev.motive[0], /cerere proprie eșuată — lib\/data\.js \(404\)/);
  // alt cod decât 404 pe date proprii nu e „opțional”
  assert.equal(clasificaCerere({ url: BAZA + 'app/version.json', status: 500, tip: 'Fetch' }, BAZA).clasa, 'rosu');
});

test('scriptul cu 404 pe care Chrome îl și anulează ⇒ tot roșu; foaia de stil cu tip MIME greșit ⇒ roșu', () => {
  // proba-martor 20.10: Edge trimite responseReceived 404, apoi loadingFailed net::ERR_ABORTED canceled=true
  const s404 = { url: BAZA + 'lib/indicators.js', status: 404, eroare: 'net::ERR_ABORTED', anulata: true, tip: 'Script' };
  assert.equal(clasificaCerere(s404, BAZA).clasa, 'rosu');
  const css = { url: BAZA + 'today/verdict.css', status: 200, eroare: 'tip MIME greșit: text/html', tip: 'Stylesheet' };
  assert.equal(clasificaCerere(css, BAZA).clasa, 'rosu');
  const ev = evalueaza(raport([pagina({ cereriEsuate: [s404, css] })]));
  assert.equal(ev.motive.length, 2);
  assert.match(ev.motive[0], /lib\/indicators\.js \(404\)/);
  assert.match(ev.motive[1], /today\/verdict\.css \(200 · tip MIME greșit: text\/html\)/);
});

test('cereri anulate și către alte origini ⇒ nu sunt roșii, dar apar ca avertisment', () => {
  const anulata = { url: BAZA + 'today/view.js', status: 0, eroare: 'net::ERR_ABORTED', anulata: true, tip: 'Script' };
  const terta = { url: 'https://query1.finance.yahoo.com/v8/finance/chart/SPY', status: 429, eroare: '', tip: 'Fetch' };
  assert.equal(clasificaCerere(anulata, BAZA).clasa, 'zgomot');
  assert.equal(clasificaCerere(terta, BAZA).clasa, 'terti');
  const ev = evalueaza(raport([pagina({ cereriEsuate: [anulata, terta], consoleErori: [{ text: 'sync offline', fisier: '', rand: null, n: 1 }] })]));
  assert.equal(ev.verdict, 'verde');
  assert.ok(ev.avertismente.some((a) => /1 cerere către alte origini a eșuat/.test(a)));
  assert.ok(ev.avertismente.some((a) => /console\.error — sync offline/.test(a)));
});

test('modul fără conținut, refuz al browserului și insigna suitei veche ⇒ roșu', () => {
  assert.match(evalueaza(raport([pagina({ continutMs: null, gataMs: null, plafon: true })])).motive[0], /nu a afișat conținut în 60,0 s/);
  assert.equal(evalueaza(raport([pagina({ refuzuri: [{ text: "Refused to apply style from 'x.css' because its MIME type ('text/html') is not a supported stylesheet MIME type", n: 1 }] })])).verdict, 'rosu');
  const health = pagina({ id: 'health', ruta: 'health/', nume: 'Health', suita: { insigna: 'tt-v980', publicata: 'tt-v981-2026-10-19' } });
  assert.match(evalueaza(raport([health])).motive[0], /versiunea suitei veche din cache — insigna tt-v980/);
  assert.equal(evalueaza(raport([{ ...health, suita: { insigna: 'tt-v981', publicata: 'tt-v981-2026-10-19' } }])).verdict, 'verde');
  // plafonul atins cu conținut afișat = doar avertisment
  const ev = evalueaza(raport([pagina({ gataMs: null, plafon: true })]));
  assert.equal(ev.verdict, 'verde');
  assert.ok(ev.avertismente.some((a) => /rețeaua nu s-a liniștit/.test(a)));
});

test('firul principal ocupat și fila care se închide greu ⇒ avertisment, nu roșu', () => {
  const ev = evalueaza(raport([pagina({ blocajMaxMs: 6200, inchidereMs: null }), pagina({ id: 'desk', ruta: 'desk/', nume: 'Planuri', inchidereMs: 9800 })]));
  assert.equal(ev.verdict, 'verde');
  assert.ok(ev.avertismente.some((a) => /Astăzi · prima: firul principal a stat ocupat până la 6,2 s/.test(a)));
  assert.ok(ev.avertismente.some((a) => /Astăzi · prima: fila nu s-a închis în 15 s/.test(a)));
  assert.ok(ev.avertismente.some((a) => /Planuri · prima: închiderea filei a durat 9,8 s/.test(a)));
});

test('raport gol sau proba căzută ⇒ roșu; rezumatul pune ✗ pe pagina roșie', () => {
  assert.equal(evalueaza({ baza: BAZA, deschideri: [] }).verdict, 'rosu');
  assert.match(evalueaza({ baza: BAZA, eroareProba: 'Edge nu a pornit', deschideri: [] }).motive[0], /proba nu a putut rula: Edge nu a pornit/);
  const r = { ...raport([pagina(), pagina({ id: 'desk', ruta: 'desk/', nume: 'Planuri', erori: [{ mesaj: 'Uncaught Error: x', n: 1 }] })]), deschideri: [{ eticheta: 'prima', versiunePublicata: VER, pagini: [pagina()] }, { eticheta: 'a doua', swAsteptat: true, pagini: [pagina({ continutMs: 800, erori: [{ mesaj: 'Uncaught Error: x', n: 2 }] })] }] };
  const text = rezumat(r, evalueaza(r));
  assert.match(text, /^✗ Astăzi .* 1: conținut 1,2 s · gata 4,1 s .* 2: conținut 0,8 s · gata 4,1 s .* JS 0\/2/m);
  assert.match(text, /VERDICT: ROȘU — 1 motiv/);
});

test('argumentele: implicite, BASE din mediu, --pagini și forma --x=y', () => {
  const o = citesteArgumente([], {});
  assert.equal(o.base, BAZA_IMPLICITA);
  assert.equal(o.timp, 60000);
  assert.deepEqual(o.pagini.map((p) => p.id), ['today', 'scanner-verdicts', 'holdings', 'desk', 'desk-tichet', 'journal', 'health']);
  assert.equal(citesteArgumente([], { BASE: 'http://127.0.0.1:8080/premarket_scanner.html' }).base, 'http://127.0.0.1:8080/premarket_scanner.html/');
  const x = citesteArgumente(['--pagini=today/,journal/#exec,desk/?ticket=1', '--timp', '45000', '--pastreaza-profil'], {});
  assert.deepEqual(x.pagini.map((p) => p.id), ['today', 'journal', 'desk-tichet']);
  assert.equal(x.timp, 45000);
  assert.equal(x.pastreazaProfil, true);
  assert.throws(() => alegePagini('nu-exista'), /pagini necunoscute: nu-exista/);
  assert.throws(() => citesteArgumente(['--timp', '10']), /cel puțin 5000/);
  assert.throws(() => citesteArgumente(['--necunoscut']), /argument necunoscut/);
});

test('fiecare pagină are elemente-cheie, iar adresele scurtate nu duc cheile de API în raport', () => {
  for (const p of PAGINI) assert.ok(p.elemente.length > 0, p.id);
  assert.equal(scurt(BAZA + 'desk/?app=decision-mobile-v2&v=26.01.02.0304&ticket=1', BAZA), 'desk/?ticket=1');
  assert.equal(scurt('https://finnhub.io/api/v1/calendar/earnings?symbol=MU&token=CHEIE', BAZA), 'https://finnhub.io/api/v1/calendar/earnings');
});
