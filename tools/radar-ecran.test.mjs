// radar-ecran.test.mjs — functiile pure ale sectiunilor "Din Radar" de pe pagina alerts (v116).
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => readFileSync(join(ROOT, f), 'utf8');
// modulele sunt scripturi de browser (global var); le incarcam ca in colectorul Radarului
const RadarEcran = new Function(src('lib/radar-ecran.js') + '; return RadarEcran;')();
const RadarPoza = new Function('window', 'localStorage', 'fetch', 'document', src('lib/radar-poza.js') + '; return RadarPoza;')({}, { getItem() { return null; }, setItem() {}, removeItem() {} }, () => Promise.reject(new Error('fara retea')), { hidden: false, addEventListener() {} });
const ACUM = Date.UTC(2026, 8, 27, 13, 20);

test('judecaT212: stop din plan, depasit / aproape / tine, procent in lei cand exista cost', () => {
  const p = { s: 'AVGO', pret: 352.81, prev: 350.36, mediu: 399.96, pplLei: -615, pctLei: -0.118, pctPret: -0.1179, plan: { trailPct: 15, tinta: 413.47, stop: 350.63, max: 412.5 }, trend: 'jos', niv: 'atentie', closes30: [392.99, 352.81] };
  const j = RadarEcran.judecaT212(p);
  assert.strictEqual(j.stop, 350.63); assert.strictEqual(j.depasit, false); assert.ok(Math.abs(j.dStop - (350.63 / 352.81 - 1)) < 1e-9); assert.strictEqual(j.pct, -0.118); assert.strictEqual(j.pctFel, 'lei');
  const f = RadarEcran.judecaT212({ ...p, plan: null, pctLei: null }); assert.strictEqual(f.stop, null); assert.strictEqual(f.pctFel, 'preț'); assert.strictEqual(f.pct, -0.1179);
  const d = RadarEcran.judecaT212({ ...p, pret: 340 }); assert.strictEqual(d.depasit, true);
});
test('baraAzi: ±4% umple jumatatea; semnul alege partea; 0 = nimic', () => {
  assert.match(RadarEcran.baraAzi(0.04), /left:50%;width:50\.0%/); assert.match(RadarEcran.baraAzi(-0.02), /right:50%;width:25\.0%/); assert.match(RadarEcran.baraAzi(0), /width:0\.0%/); assert.match(RadarEcran.baraAzi(0.1), /width:50\.0%/);
});
test('spark: 2 puncte sau mai multe -> svg cu polyline si punctul de la capat; sub 2 -> gol', () => {
  assert.match(RadarEcran.spark([1, 2, 3]), /<polyline/); assert.match(RadarEcran.spark([1, 2, 3]), /<circle/); assert.strictEqual(RadarEcran.spark([1]), ''); assert.strictEqual(RadarEcran.spark(null), '');
});
test('insText: verdictele si "fara Form 4"; lipsa = cere cheia', () => {
  assert.match(RadarEcran.insText({ form4: false }).t, /fără Form 4/);
  assert.match(RadarEcran.insText({ form4: true, verdict: 'bull1', bp: 1, net: 105263 }).m, /105 k/);
  assert.match(RadarEcran.insText({ form4: true, verdict: 'bear', sells: 10, sp: 7, net: -54130 }).t, /vând/);
  assert.match(RadarEcran.insText(null).t, /cere cheia/);
});
test('mii: 9.999.985 -> 10,0 mil.; 105263 -> 105 k; 500 -> 500', () => {
  assert.strictEqual(RadarEcran.mii(9999985), '10,0 mil.'); assert.strictEqual(RadarEcran.mii(105263), '105 k'); assert.strictEqual(RadarEcran.mii(500), '500');
});
test('prospetime: viu sub 15 min, tace 15-60, oprit peste 60, lipsa fara poza', () => {
  const MIN = 60000;
  assert.strictEqual(RadarPoza.prospetime({ la: ACUM - 3 * MIN }, ACUM).stare, 'viu');
  assert.strictEqual(RadarPoza.prospetime({ la: ACUM - 20 * MIN }, ACUM).stare, 'tace');
  assert.strictEqual(RadarPoza.prospetime({ la: ACUM - 90 * MIN }, ACUM).stare, 'oprit');
  assert.strictEqual(RadarPoza.prospetime(null, ACUM).stare, 'lipsa');
  assert.match(RadarPoza.prospetime({ la: ACUM - 20 * MIN }, ACUM).text, /tace de 20 min/);
});
test('randeaza (DOM minimal): poza goala -> textele de gol; poza cu date -> randuri; fara cheie -> caseta', () => {
  const el = { innerHTML: '', addEventListener() {}, dataset: {} };
  RadarEcran.randeaza(el, { la: ACUM, t212: [], boti: [], simboluri: [], gol: { boti: 'niciun bot activ', t212: 'nicio poziție deschisă' } }, { simboluri: [], preturiLive: {}, acum: ACUM, cheie: true, prospetime: RadarPoza.prospetime({ la: ACUM }, ACUM) });
  assert.match(el.innerHTML, /niciun bot activ/); assert.match(el.innerHTML, /nicio poziție deschisă/);
  RadarEcran.randeaza(el, null, { simboluri: [{ s: 'AVGO', nota: '' }], preturiLive: { AVGO: { pret: 352.81, prev: 350.36 } }, acum: ACUM, cheie: false, prospetime: RadarPoza.prospetime(null, ACUM) });
  assert.match(el.innerHTML, /Pune cheia de citire/); assert.match(el.innerHTML, /AVGO/); assert.match(el.innerHTML, /cere cheia/);
  assert.doesNotMatch(el.innerHTML, /NaN|undefined/);
  const poza = { la: ACUM, t212: [{ s: 'AVGO', t212: 'AVGO_US_EQ', buc: 2.8187, mediu: 399.96, pret: 352.81, prev: 350.36, closes30: [392.99, 352.81], pplLei: -615, pctLei: -0.118, pctPret: -0.1179, plan: { trailPct: 15, tinta: 413.47, stop: 350.63, max: 412.5 }, trend: 'jos', pondere: 0.157, niv: 'atentie', motive: ['trend în jos'], sfat: 'aș ieși' }],
    boti: [{ id: '2383', s: 'VVV', dir: 'long', lev: 4, investit: 91.9, jos: 28.464, sus: 33.346, pret: 29.64, inGrid: 0.24, lichidarePct: 25.05, total: -4.42, perechi: 0, gridBrut: 0, pozitie: -4.31, comisioane: -0.106, zero: 30.1548, plan: null, niv: 'atentie', motive: ['costuri'], sfat: 'aș ieși pe zero', pret30: [30.4, 29.6, 29.64] }],
    simboluri: [{ s: 'INTC', nota: '', sursa: null, moneda: '$', pret: 123, prev: 127.39, closes30: [100, 123], insideri: { form4: true, buys: 1, sells: 0, bp: 1, sp: 0, net: 105263, verdict: 'bull1', top: [{ d: '08-11', cine: 'Tan Lip-Bu', rol: 'Chief Executive Officer', f: 'buy', act: 105263, val: 9999985 }], n60: 1 }, rezultate: { data: '2026-10-22', zile: 25, eps: 0.39 }, analisti: { tinta: 116.37, recom: 'buy', n: 43 }, shortFloat: 0.03 }],
    gol: { boti: null, t212: null } };
  RadarEcran.randeaza(el, poza, { simboluri: [{ s: 'INTC', nota: '' }], preturiLive: {}, acum: ACUM, cheie: true, prospetime: RadarPoza.prospetime(poza, ACUM) });
  assert.match(el.innerHTML, /ATENȚIE/); assert.match(el.innerHTML, /\$350,63/); assert.match(el.innerHTML, /VVV/); assert.match(el.innerHTML, /pe zero la 30,1548/); assert.match(el.innerHTML, /cumpără/); assert.match(el.innerHTML, /22 oct/); assert.match(el.innerHTML, /Tan Lip-Bu/);
  assert.doesNotMatch(el.innerHTML, /NaN|undefined/);
});
