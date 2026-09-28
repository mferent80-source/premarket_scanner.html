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
const POZ_AVGO = { s: 'AVGO', t212: 'AVGO_US_EQ', buc: 2.8187, mediu: 399.96, pret: 352.81, prev: 350.36, la: ACUM - 2 * 60000, closes30: [392.99, 352.81], pplLei: -615, pctLei: -0.118, pctPret: -0.1179, plan: { trailPct: 15, tinta: 413.47, stop: 350.63, max: 412.5 }, trend: 'jos', pondere: 0.157, niv: 'iesi', motive: ['a coborât sub stopul din plan'], sfat: 'aș ieși' };
const POZA_BAZA = () => ({ la: ACUM, t212: [JSON.parse(JSON.stringify(POZ_AVGO))], boti: [], simboluri: [], gol: { boti: 'niciun bot activ', t212: null } });
const O = (poza, extra) => Object.assign({ simboluri: [], preturiLive: {}, acum: ACUM, cheie: true, prospetime: RadarPoza.prospetime(poza, ACUM) }, extra || {});

test('I-459: pe randurile T212 castiga pretul T212 (chip T212) cat e proaspat (<10 min), chiar daca Yahoo e mai nou; vechi -> Yahoo', () => {
  const el = { innerHTML: '', addEventListener() {}, dataset: {} };
  const poza = POZA_BAZA();
  RadarEcran.randeaza(el, poza, O(poza, { preturiLive: { AVGO: { pret: 355.0, prev: 350.36, la: ACUM, chip: '<span class="px-sess">RTH</span>' } } }));
  assert.match(el.innerHTML, /\$352,81/, 'pretul T212 (poza)'); assert.match(el.innerHTML, /T212<\/span>/, 'chip-ul T212');
  poza.t212[0].la = ACUM - 20 * 60000;
  RadarEcran.randeaza(el, poza, O(poza, { preturiLive: { AVGO: { pret: 355.0, prev: 350.36, la: ACUM, chip: '<span class="px-sess">RTH</span>' } } }));
  assert.match(el.innerHTML, /\$355,00/, 'T212 vechi de 20 min -> Yahoo'); assert.match(el.innerHTML, /px-sess/);
});
test('I-460: „Ce ai de facut acum" - stopul depasit / IESI rosu, peste 20% din cont galben, botul cu semnal; nimic urgent cand e liniste', () => {
  const el = { innerHTML: '', addEventListener() {}, dataset: {} };
  const poza = POZA_BAZA();
  poza.t212.push({ s: 'APLD', pret: 26.25, prev: 27.06, mediu: 29.55, closes30: [31.2, 26.25], pplLei: -813, plan: { stop: 26.09, tinta: 34.44, max: 30.69, trailPct: 15 }, trend: 'jos', pondere: 0.23, niv: 'atentie', motive: ['23% din cont'], sfat: 'nu adaug' });
  poza.boti = [{ id: '1', s: 'JTO', dir: 'long', lev: 5, investit: 98, jos: 0.57, sus: 0.66, pret: 0.60, total: -1, perechi: 0, gridBrut: 0, pozitie: -0.9, comisioane: -0.1, zero: 0.6048, plan: null, niv: 'atentie', motive: ['costurile pe zi depășesc ce aduc grilele'], sfat: 'levier mai mic', pret30: [0.6, 0.6] }];
  RadarEcran.randeaza(el, poza, O(poza));
  const todo = el.innerHTML.slice(el.innerHTML.indexOf('Ce ai de făcut acum'), el.innerHTML.indexOf('💼 Trading 212'));   // pana la capul panoului T212 (sumarul de sus are si el „Trading 212 ·")
  assert.ok(todo.length > 0, 'panoul exista inainte de tabele');
  assert.match(todo, /AVGO/); assert.match(todo, /APLD[^<]*23%|23%[^<]*APLD/, 'APLD peste plafon'); assert.match(todo, /JTO/); assert.match(todo, /fără plan/i, 'botul fara plan');
  assert.ok(todo.indexOf('AVGO') < todo.indexOf('JTO'), 'rosul (IESI) inaintea galbenului');
  assert.match(todo, /data-fac="vezi" data-s="AVGO"/, 'butonul duce la rand');
  const linistit = POZA_BAZA(); linistit.t212[0].niv = 'tine'; linistit.t212[0].pret = 360; linistit.t212[0].plan.stop = 300; linistit.t212[0].pondere = 0.1;
  RadarEcran.randeaza(el, linistit, O(linistit));
  assert.match(el.innerHTML, /Nimic urgent/);
});
test('I-462: cu adresa tunelului in poza, „Deschide in Radar" duce la tunel (si de pe telefon); fara ea, la 127.0.0.1 „doar acasa"', () => {
  const el = { innerHTML: '', addEventListener() {}, dataset: {} };
  const poza = POZA_BAZA(); poza.radarUrl = 'https://abc-def.trycloudflare.com';
  RadarEcran.randeaza(el, poza, O(poza));
  assert.match(el.innerHTML, /href="https:\/\/abc-def\.trycloudflare\.com\/#ecran=t212"/); assert.match(el.innerHTML, /și de pe telefon/); assert.doesNotMatch(el.innerHTML, /127\.0\.0\.1/);
  const fara = POZA_BAZA(); RadarEcran.randeaza(el, fara, O(fara));
  assert.match(el.innerHTML, /href="http:\/\/127\.0\.0\.1:8788\/#ecran=t212"/); assert.match(el.innerHTML, /doar acasă/);
  // o adresa care nu e http/https (javascript:, data:) nu ajunge niciodata in href - cade pe adresa de acasa
  for (const rau of ['javascript:alert(1)', 'data:text/html,x', 'ftp://x', 'abc']) { const p = POZA_BAZA(); p.radarUrl = rau; RadarEcran.randeaza(el, p, O(p)); assert.match(el.innerHTML, /href="http:\/\/127\.0\.0\.1:8788\/#ecran=t212"/, 'refuzat: ' + rau); assert.doesNotMatch(el.innerHTML, /javascript:|data:text/); }
});
test('cheia din link (#cheie=… sau ?cheie=…) se salveaza o data si dispare din adresa', () => {
  const scris = {}, istoric = [];
  const loc = { href: 'https://mferent80-source.github.io/premarket_scanner.html/alerts/?x=1#cheie=aPKhvxRbDOU1YNCDQoYbD81v8dJnaLam', pathname: '/premarket_scanner.html/alerts/' };
  const RP = new Function('window', 'localStorage', 'fetch', 'document', 'location', 'history', src('lib/radar-poza.js') + '; return RadarPoza;')(
    {}, { getItem(k) { return scris[k] ?? null; }, setItem(k, v) { scris[k] = v; }, removeItem(k) { delete scris[k]; } }, () => Promise.reject(new Error('fara retea')), { hidden: false, addEventListener() {} },
    loc, { replaceState(a, b, u) { istoric.push(u); } });
  assert.strictEqual(RP.cheieDinUrl(), 'aPKhvxRbDOU1YNCDQoYbD81v8dJnaLam');
  assert.strictEqual(scris.radar_cheie, 'aPKhvxRbDOU1YNCDQoYbD81v8dJnaLam', 'cheia e salvata in browser');
  assert.strictEqual(istoric[0], 'https://mferent80-source.github.io/premarket_scanner.html/alerts/?x=1', 'adresa ramane fara cheie (istoricul browserului nu o tine)');
  loc.href = 'https://mferent80-source.github.io/premarket_scanner.html/alerts/';
  assert.strictEqual(RP.cheieDinUrl(), null, 'fara cheie in link: nimic');
});

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
test('insText: verdictele si "fara Form 4"; lipsa fara cheie = cere cheia; lipsa CU cheie = vine cu poza urmatoare', () => {
  assert.match(RadarEcran.insText({ form4: false }).t, /fără Form 4/);
  assert.match(RadarEcran.insText({ form4: true, verdict: 'bull1', bp: 1, net: 105263 }).m, /105 k/);
  assert.match(RadarEcran.insText({ form4: true, verdict: 'bear', sells: 10, sp: 7, net: -54130 }).t, /vând/);
  assert.match(RadarEcran.insText(null, false).t, /cere cheia/);
  assert.match(RadarEcran.insText(null, true).t, /încă nimic/);
  assert.match(RadarEcran.insText(null, true).m, /poza următoare/);
});
test('cheia gresita nu tace: caseta se deschide si scrie "nu e buna" cu cheia pusa', () => {
  const el = { innerHTML: '', addEventListener() {}, dataset: {} };
  RadarEcran.randeaza(el, null, { simboluri: [], preturiLive: {}, acum: ACUM, cheie: true, prospetime: RadarPoza.prospetime(null, ACUM), eroare: 'cheia nu e bună' });
  assert.match(el.innerHTML, /nu e bună/);
  assert.match(el.innerHTML, /id="radCaseta">/, 'caseta cheii e deschisa (fara hidden)');
  assert.doesNotMatch(el.innerHTML, /Aștept prima poză/, 'nu da vina pe colector cand cheia e gresita');
});
test('T212 n-a raspuns: pozitiile vechi raman, cu ora lor si cu eroarea la vedere in panou', () => {
  const el = { innerHTML: '', addEventListener() {}, dataset: {} };
  const poza = { la: ACUM, t212La: ACUM - 3600000, t212Eroare: 'Trading 212 a limitat cererile', t212: [{ s: 'UHS', pret: 178.86, prev: 176.99, mediu: 184.51, closes30: [170, 178.86], pplLei: -94, plan: null, niv: 'tine', motive: [], sfat: '' }], boti: [], simboluri: [], gol: { boti: 'niciun bot activ', t212: null } };
  RadarEcran.randeaza(el, poza, { simboluri: [], preturiLive: {}, acum: ACUM, cheie: true, prospetime: RadarPoza.prospetime(poza, ACUM) });
  assert.match(el.innerHTML, /UHS/);
  assert.match(el.innerHTML, /n-a răspuns/);
  assert.match(el.innerHTML, /pozițiile de la 15:20/, 'ora pozitiilor (Bucuresti) langa avertisment');
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

// v126 (el, 28.09: „la Trading 212 de ce nu apar și aici insiderii” + „când dau clic Deschide în Radar îmi dă erori”)
test('v126: pozițiile T212 au coloana „Insideri · 60 z” și tranzacțiile în rândul desfăcut; fără date = „vine cu poza următoare”', () => {
  const el = { innerHTML: '', addEventListener() {}, dataset: {} };
  const poza = POZA_BAZA();
  poza.t212[0].insideri = { form4: true, verdict: 'bear', n60: 4, buys: 0, sells: 4, bp: 0, sp: 3, net: -12000, top: [{ d: '09-12', cine: 'Hock Tan', rol: 'CEO', f: 'sell', act: 10000, val: 3500000 }] };
  poza.t212.push(Object.assign(JSON.parse(JSON.stringify(POZ_AVGO)), { s: 'UHS', t212: 'UHS_US_EQ', insideri: null }));
  RadarEcran.randeaza(el, poza, O(poza));
  assert.match(el.innerHTML, /<th>Insideri · 60 z<\/th>/);
  assert.match(el.innerHTML, /🔴 vând/); assert.match(el.innerHTML, /Hock Tan/); assert.match(el.innerHTML, /▼ vinde 10 k/);
  assert.match(el.innerHTML, /vine cu poza următoare/, 'Yahoo n-a dat nimic încă: se spune, nu „liniște”');
  assert.match(el.innerHTML, /colspan="10"/, 'rândul desfăcut acoperă și coloana nouă');
  RadarEcran.randeaza(el, poza, O(poza, { cheie: false }));
  assert.doesNotMatch(el.innerHTML, /Hock Tan/, 'fără cheie nu se arată nimic din poză');
});
test('v126: cu parola Radarului pusă, „Deschide în Radar” o duce DUPĂ # (+ ecranul); fără ea, doar ecranul și îndemnul să o pui', () => {
  const el = { innerHTML: '', addEventListener() {}, dataset: {} };
  const poza = POZA_BAZA(); poza.radarUrl = 'https://abc-def.trycloudflare.com';
  poza.boti = [{ id: '2386', s: 'JTO', dir: 'long', lev: 5, investit: 98.14, jos: 0.55, sus: 0.565, pret: 0.5577, total: -14.7, niv: 'atentie', motive: [], plan: null }];
  RadarEcran.randeaza(el, poza, O(poza, { parolaRadar: 'a/b c' }));
  assert.match(el.innerHTML, /href="https:\/\/abc-def\.trycloudflare\.com\/#parola=a%2Fb%20c&amp;ecran=t212"/);
  assert.match(el.innerHTML, /href="https:\/\/abc-def\.trycloudflare\.com\/#parola=a%2Fb%20c&amp;ecran=tabloubot"/);
  assert.match(el.innerHTML, /🔐 parola Radarului: pusă/); assert.doesNotMatch(el.innerHTML, /pune parola Radarului sus/);
  RadarEcran.randeaza(el, poza, O(poza));
  assert.match(el.innerHTML, /href="https:\/\/abc-def\.trycloudflare\.com\/#ecran=tabloubot"/); assert.match(el.innerHTML, /pune parola Radarului sus/);
  assert.match(el.innerHTML, /parola Radarului: <b class="warn">lipsește<\/b>/); assert.match(el.innerHTML, /id="radParola" type="password"/);
});
test('v126: parola Radarului din linkul paginii (#parola=…) se ține minte și dispare din adresă, împreună cu cheia', () => {
  const scris = {}, istoric = [];
  const loc = { href: 'https://mferent80-source.github.io/premarket_scanner.html/alerts/#cheie=aPKhvxRbDOU1YNCDQoYbD81v8dJnaLam&parola=x%2Fy' };
  const RP = new Function('window', 'localStorage', 'fetch', 'document', 'location', 'history', src('lib/radar-poza.js') + '; return RadarPoza;')(
    {}, { getItem(k) { return scris[k] ?? null; }, setItem(k, v) { scris[k] = v; }, removeItem(k) { delete scris[k]; } }, () => Promise.reject(new Error('fara retea')), { hidden: false, addEventListener() {} },
    loc, { replaceState(a, b, u) { istoric.push(u); } });
  RP.cheieDinUrl();
  assert.strictEqual(scris.radar_parola, 'x/y'); assert.strictEqual(scris.radar_cheie, 'aPKhvxRbDOU1YNCDQoYbD81v8dJnaLam');
  assert.strictEqual(istoric[0], 'https://mferent80-source.github.io/premarket_scanner.html/alerts/', 'nici cheia, nici parola nu rămân în adresă');
  assert.strictEqual(RP.parolaRadar(), 'x/y'); RP.puneParolaRadar(''); assert.strictEqual(scris.radar_parola, undefined);
});
