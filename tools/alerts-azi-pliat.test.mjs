// alerts-azi-pliat.test.mjs — 11.10.2026, Marius (poza de pe telefon): „alertele de azi fă în dropdown, și pe telefon se văd
// liniile aiurea că au mult scris — refă și acolo, dar pe telefon atât”.
// (1) „Alertele de azi” = <details> pliat implicit; în titlu: câte sunt (importante / toate); starea se ține minte pe filă.
// (2) Fontul monospațiat al temei PAZNIC doar pe cifre: tabelul are clasa „num” și regula `.num` îl punea pe TOT textul
//     (măsurat în browser: TABLE.poz.num → „IBM Plex Mono” moștenit de nume, note, „azi · ca în TradingView…”).
// (3) Pe telefon: celula prețului nu mai mănâncă lățimea numelui; eticheta (ATENȚIE / ȚINE) stă deasupra textului.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => readFileSync(join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const incarca = (stocare) => new Function('localStorage', src('lib/radar-ecran.js') + '; return RadarEcran;')({
  getItem: (k) => (k in stocare ? stocare[k] : null), setItem: (k, v) => { stocare[k] = String(v); }, removeItem: (k) => { delete stocare[k]; },
});
const ACUM = Date.UTC(2026, 9, 11, 13, 20);
const ALERTE = [
  { t: ACUM - 60000, grup: 'det', sim: 'ATOM', nivel: 'atentie', titlu: 'ATOM aproape de marginea de jos', mesaj: 'Prețul la 0,2% de marginea de jos\n👉 N-aș mări levierul' },
  { t: ACUM - 120000, grup: 'det', sim: 'ATOM', nivel: 'info', titlu: 'grilă atinsă', mesaj: 'grilă', zgomot: true },
];
const POZA = { la: ACUM, alerte: ALERTE, t212: [], boti: [], simboluri: [] };
const F = { tot: false, sim: null, mai: false };

test('„Alertele de azi” e un <details> PLIAT implicit, cu numărul alertelor în titlu', () => {
  const h = incarca({}).panouAlerte(POZA, 'det', F, { acum: ACUM, cheie: true });
  assert.match(h, /^<details class="panou alNou alAzi" data-alazi="det" aria-label="Alertele de azi">/);
  assert.match(h, /<summary class="panouCap alAziCap"><h3>🔔 Alertele de azi<\/h3><span class="alAziNr">1 importantă · 2 cu grilele<\/span><\/summary>/);
  assert.ok(!/<details[^>]*\sopen/.test(h), 'pliat implicit');
  assert.match(h, /<\/details>$/);
});
test('butoanele de filtru stau în corp, nu în <summary> (un clic pe ele nu pliază panoul)', () => {
  const h = incarca({}).panouAlerte(POZA, 'det', F, { acum: ACUM, cheie: true });
  const sum = h.slice(h.indexOf('<summary'), h.indexOf('</summary>'));
  assert.ok(!/<button/.test(sum)); assert.match(h.slice(h.indexOf('</summary>')), /data-alf="imp"/);
});
test('starea se ține minte pe filă: al_azi_deschis_det = 1 ⇒ deschis la următoarea desenare', () => {
  const h = incarca({ al_azi_deschis_det: '1' }).panouAlerte(POZA, 'det', F, { acum: ACUM, cheie: true });
  assert.match(h, /^<details class="panou alNou alAzi" data-alazi="det" aria-label="Alertele de azi" open>/);
  assert.ok(!/ open>/.test(incarca({ al_azi_deschis_urm: '1' }).panouAlerte(POZA, 'det', F, { acum: ACUM, cheie: true }).split('\n')[0]), 'altă filă, altă stare');
});
test('fără cheie / fără alerte: tot pliabil, cu mesajul în corp și „—” în titlu', () => {
  const E = incarca({});
  for (const h of [E.panouAlerte(null, 'det', F, { acum: ACUM, cheie: false }), E.panouAlerte({ la: ACUM }, 'det', F, { acum: ACUM, cheie: true })]) {
    assert.match(h, /^<details class="panou alNou alAzi"/); assert.match(h, /<span class="alAziNr">—<\/span>/); assert.match(h, /class="golAl"/); assert.match(h, /<\/details>$/);
  }
});
test('regula 1 / 20 de: „1 importantă”, „20 de importante”', () => {
  const multe = Array.from({ length: 20 }, (_, i) => ({ t: ACUM - i * 1000, grup: 'det', sim: 'X' + i, nivel: 'info', titlu: 't', mesaj: 'm' }));
  assert.match(incarca({}).panouAlerte({ la: ACUM, alerte: multe }, 'det', F, { acum: ACUM, cheie: true }), /<span class="alAziNr">20 de importante<\/span>/);
});
test('pagina ține minte deschiderea (evenimentul toggle, prins pe document în faza de capturare)', () => {
  const h = src('alerts/index.html');
  assert.match(h, /addEventListener\('toggle',[^\n]*al_azi_deschis_/);
});
test('CSS: săgeata panoului și titlul fără marcajul implicit al browserului', () => {
  const css = src('lib/radar-ui.css');
  assert.match(css, /\.alAziCap\{[^}]*cursor:pointer/); assert.match(css, /\.alAziCap::-webkit-details-marker\{display:none\}/);
  assert.match(css, /details\.alAzi\[open\]>\.alAziCap::after/);
});
test('fontul monospațiat doar pe cifre: regula PAZNIC `.num` nu mai prinde tabelul întreg', () => {
  const h = src('alerts/index.html');
  assert.ok(!/body\.al-page \.num,body\.al-page code/.test(h), 'regula veche (prindea table.poz.num)');
  assert.match(h, /body\.al-page \.num:not\(table\):not\(tbody\):not\(tr\)/);
  assert.match(src('tools/alerts-tema-paznic.mjs'), /\.num:not\(table\):not\(tbody\):not\(tr\)/);
});
test('telefon: prețul nu mănâncă lățimea numelui, eticheta stă deasupra textului (doar sub 640 px)', () => {
  const css = src('lib/radar-ui.css');
  const m = css.slice(css.lastIndexOf('/* 11.10.2026 telefon'));
  assert.match(m, /@media \(max-width:640px\)\{/);
  assert.match(m, /tr\.rand td\.c-acum\{[^}]*max-width:46%/);
  assert.match(m, /tr\.rand td \.sim\{[^}]*flex-wrap:wrap/);
});
