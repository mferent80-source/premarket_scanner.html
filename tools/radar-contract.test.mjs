// radar-contract.test.mjs — contractul pozei (28.10.2026, audit Radar, I-786): tools/exemplu-poza.json e copia fidelă a
// paznic/exemplu-poza.json din depozitul crypto, produsă de construiestePoza (scripts/exemplu-poza.mjs acolo). Pagina Alerte trebuie
// (1) să randeze exemplul întreg, pe ambele file, fără NaN / undefined; (2) să nu lase să treacă brut în HTML niciun text pus în ORICE
// frunză a pozei - string sau număr -, pentru că poza e date, nu cod. Un câmp nou în poză ⇒ regenerezi exemplul în crypto și-l copiezi aici.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => readFileSync(join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const RadarEcran = new Function(src('lib/radar-ecran.js') + '; return RadarEcran;')();
const RadarPoza = new Function('window', 'localStorage', 'fetch', 'document', src('lib/radar-poza.js') + '; return RadarPoza;')({}, { getItem() { return null; }, setItem() {}, removeItem() {} }, () => Promise.reject(new Error('fara retea')), { hidden: false, addEventListener() {} });
const EXEMPLU = JSON.parse(src('tools/exemplu-poza.json'));
const ACUM = EXEMPLU.la + 2 * 60000;
const el = () => ({ innerHTML: '', addEventListener() {}, dataset: {}, querySelectorAll() { return []; }, querySelector() { return null; } });
const simboluri = (p) => ((p && p.simboluri) || []).map((s) => ({ s: s.s, nota: s.nota }));
const randeaza = (p, fila, extra) => { const e = el(); RadarEcran.randeaza(e, p, Object.assign({ fila, simboluri: simboluri(p), preturiLive: {}, botiLive: {}, acum: ACUM, cheie: true, parolaRadar: 'P', saltAsteptare: [], prospetime: RadarPoza.prospetime(p, ACUM) }, extra || {})); return e.innerHTML; };

test('contract: exemplul are forma așteptată (capul, poziții, boți, simboluri, Salt, cereri, alerte) și e produs de colectorul v101.141', () => {
  for (const k of ['la', 'turaLa', 'versiune', 'radarUrl', 't212', 't212La', 'boti', 'simboluri', 'salt', 'saltCereri', 'gol', 'alerte']) assert.ok(k in EXEMPLU, 'lipsește ' + k);
  assert.equal(EXEMPLU.versiune, 'v101.141'); assert.equal(EXEMPLU.t212.length, 2); assert.equal(EXEMPLU.boti.length, 1); assert.equal(EXEMPLU.simboluri.length, 2); assert.equal(EXEMPLU.salt.randuri.length, 1); assert.equal(EXEMPLU.alerte.length, 3);
  assert.ok('stopT212' in EXEMPLU.t212[0] && 'costLei' in EXEMPLU.t212[0] && 'pplLei' in EXEMPLU.t212[0], 'câmpurile pe care se sprijină I-784 și I-790');
});
test('contract: pagina randează exemplul întreg, pe ambele file, fără NaN / undefined / [object Object], cu cifrele-cheie la locul lor', () => {
  const det = randeaza(EXEMPLU, 'det'), urm = randeaza(EXEMPLU, 'urm');
  for (const h of [det, urm]) { assert.doesNotMatch(h, /NaN|undefined|\[object Object\]/); assert.ok(h.length > 2000); }
  assert.match(det, /INTC/); assert.match(det, /\$116,10/, 'prețul T212'); assert.match(det, /\+412 lei/, 'P&L în lei din poză (fără cotație live)'); assert.match(det, /Ordin de stop la broker<\/span><b class="good">\$104,50/);
  assert.match(det, /RHM\.DE/); assert.match(det, /IEȘI/); assert.match(det, /JTO/); assert.match(det, /pe zero la 0,5951/); assert.match(det, /NFLX/); assert.match(det, /Netflix/);
  assert.match(det, /1 importantă · 2 cu grilele/, 'alertele de azi pe fila det'); assert.match(urm, /AVGO/); assert.match(urm, /intrare sugerată \$121,90/); assert.match(urm, /3,21 buc la \$121,90/); assert.match(urm, /Tan Lip-Bu/); assert.match(urm, /ORIENTATIV/, 'RHM.DE cu trend în jos');
  assert.match(det, /href="https:\/\/pc\.tailabc\.ts\.net:8443\/#parola=P&amp;ecran=t212"/, 'adresa Tailscale din poză primește parola (I-782)');
});
// fiecare frunză a pozei primește un marcaj unic cu HTML viu; nimic din el nu are voie să ajungă brut în pagină
function otraveste(x, cale, lista) {
  if (Array.isArray(x)) return x.map((v, i) => otraveste(v, cale + '[' + i + ']', lista));
  if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x)) o[k] = otraveste(x[k], cale + '.' + k, lista); return o; }
  if (typeof x === 'string' || typeof x === 'number') { const m = '<img src=x onerror="alert(' + lista.length + ')">'; lista.push({ cale, m }); return typeof x === 'string' ? x + m : m; }
  return x;
}
test('contract: HTML pus în ORICE frunză a pozei (string sau număr) nu ajunge brut în pagină, pe nicio filă - poza e date, nu cod', () => {
  const lista = [], rea = otraveste(EXEMPLU, 'poza', lista);
  assert.ok(lista.length > 150, 'exemplul are peste 150 de frunze: ' + lista.length);
  for (const fila of ['det', 'urm']) {
    const h = randeaza(rea, fila, { preturiLive: { AVGO: { pret: 355, prev: 350, la: ACUM } } });
    assert.doesNotMatch(h, /<img src=x onerror=/, fila + ': a trecut HTML brut');
    assert.doesNotMatch(h, /onerror="alert/, fila);
    assert.doesNotMatch(h, /href="javascript:/i, fila);
  }
  // și fără cheie / fără poză pagina nu cade
  randeaza(null, 'det', { cheie: false }); randeaza(rea, 'urm', { cheie: false });
});
test('contract: numerele otrăvite nu ajung nici în atributele de stil ori în adrese (width:, left:, href) - cele mai sensibile locuri', () => {
  const lista = [], rea = otraveste(EXEMPLU, 'poza', lista), h = randeaza(rea, 'det') + randeaza(rea, 'urm');
  for (const m of h.match(/style="[^"]*"/g) || []) assert.doesNotMatch(m, /<|onerror/, 'stil: ' + m.slice(0, 80));
  for (const m of h.match(/href="[^"]*"/g) || []) assert.doesNotMatch(m, /onerror|javascript:/i, 'adresă: ' + m.slice(0, 80));
});
