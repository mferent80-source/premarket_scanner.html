// radar-ecran.test.mjs — functiile pure ale sectiunilor "Din Radar" de pe pagina alerts (v116).
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// CRLF -> LF: cu core.autocrlf=true, un checkout/rebase scrie CSS-ul cu CRLF pe disc si cautarile pe „{\nbody” picau (29.09)
const src = (f) => readFileSync(join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
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
test('I-460 / v127: ce are de făcut stă pe rândul poziției / botului (roșu IEȘI, galben atenție / peste 20% / fără plan); panoul separat nu mai există', () => {
  const el = { innerHTML: '', addEventListener() {}, dataset: {} };
  const poza = POZA_BAZA();
  poza.t212.push({ s: 'APLD', pret: 26.25, prev: 27.06, mediu: 29.55, closes30: [31.2, 26.25], pplLei: -813, plan: { stop: 26.09, tinta: 34.44, max: 30.69, trailPct: 15 }, trend: 'jos', pondere: 0.23, niv: 'atentie', motive: ['23% din cont'], sfat: 'nu adaug' });
  poza.boti = [{ id: '1', s: 'JTO', dir: 'long', lev: 5, investit: 98, jos: 0.57, sus: 0.66, pret: 0.60, total: -1, perechi: 0, gridBrut: 0, pozitie: -0.9, comisioane: -0.1, zero: 0.6048, plan: null, niv: 'atentie', motive: ['costurile pe zi depășesc ce aduc grilele'], sfat: 'levier mai mic', pret30: [0.6, 0.6] }];
  RadarEcran.randeaza(el, poza, O(poza));
  assert.doesNotMatch(el.innerHTML, /Ce ai de făcut acum/, 'panoul a ieșit din pagină');
  assert.doesNotMatch(el.innerHTML, /data-fac="vezi"/);
  const rand = (s) => { const i = el.innerHTML.indexOf('<tr class="rand' + (s === 'JTO' ? ' bot' : '') + '" tabindex="0" aria-expanded="false" data-s="' + s + '"'); return el.innerHTML.slice(i, el.innerHTML.indexOf('</tr>', i)); };
  assert.match(rand('APLD'), /class="faRand g"[^>]*>e 23% din cont/, 'APLD peste plafon, pe rândul lui, fără numele repetat');
  assert.match(rand('APLD'), /class="faRand g"[^>]*>23% din cont <span class="faP">· 👉 nu adaug/, 'motivul + ce aș face');
  assert.match(rand('JTO'), /class="faRand g"[^>]*>costurile pe zi/); assert.match(rand('JTO'), /e fără plan/);
  assert.match(rand('AVGO'), /class="faRand /, 'AVGO (atenție în fixture) are rândul lui de făcut');
  const linistit = POZA_BAZA(); linistit.t212[0].niv = 'tine'; linistit.t212[0].pret = 360; linistit.t212[0].plan.stop = 300; linistit.t212[0].pondere = 0.1;
  RadarEcran.randeaza(el, linistit, O(linistit));
  assert.doesNotMatch(el.innerHTML, /class="faRand/, 'liniște: niciun rând în plus');
  RadarEcran.randeaza(el, poza, O(poza, { cheie: false }));
  assert.doesNotMatch(el.innerHTML, /class="faRand/, 'fără cheie nu se arată nimic din poză');
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
  const loc = { href: 'https://mferent80-source.github.io/premarket_scanner.html/alerts/?x=1#cheie=CheieFalsaDeProba0123456789abcdef', pathname: '/premarket_scanner.html/alerts/' };
  const RP = new Function('window', 'localStorage', 'fetch', 'document', 'location', 'history', src('lib/radar-poza.js') + '; return RadarPoza;')(
    {}, { getItem(k) { return scris[k] ?? null; }, setItem(k, v) { scris[k] = v; }, removeItem(k) { delete scris[k]; } }, () => Promise.reject(new Error('fara retea')), { hidden: false, addEventListener() {} },
    loc, { replaceState(a, b, u) { istoric.push(u); } });
  assert.strictEqual(RP.cheieDinUrl(), 'CheieFalsaDeProba0123456789abcdef');
  assert.strictEqual(scris.radar_cheie, 'CheieFalsaDeProba0123456789abcdef', 'cheia e salvata in browser');
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
  assert.match(el.innerHTML, /colspan="9"/, "rândul desfăcut acoperă toate coloanele (v129: Stop + Țintă au devenit o coloană)");
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
test('v138: adresa FIXĂ prin Tailscale (*.ts.net) în poză ⇒ butoanele duc acolo și spun „adresă fixă”; tunelul păstrează textul vechi', () => {
  const el = { innerHTML: '', addEventListener() {}, dataset: {} };
  const poza = POZA_BAZA(); poza.radarUrl = 'https://pc.tailabc.ts.net:8443';
  poza.boti = [{ id: '2386', s: 'JTO', dir: 'long', lev: 5, investit: 98.14, jos: 0.55, sus: 0.565, pret: 0.5577, total: -14.7, niv: 'atentie', motive: [], plan: null }];
  RadarEcran.randeaza(el, poza, O(poza));
  assert.match(el.innerHTML, /href="https:\/\/pc\.tailabc\.ts\.net:8443\/#ecran=tabloubot"/);
  assert.match(el.innerHTML, /href="https:\/\/pc\.tailabc\.ts\.net:8443\/#ecran=t212"/);
  assert.match(el.innerHTML, /adresă fixă · merge și de pe telefon, cu Tailscale pornit/); assert.match(el.innerHTML, /ți-o cere o dată/);
  assert.doesNotMatch(el.innerHTML, /prin tunelul Radarului|adresă nouă a tunelului/);
  poza.radarUrl = 'https://abc-def.trycloudflare.com';
  RadarEcran.randeaza(el, poza, O(poza));
  assert.match(el.innerHTML, /prin tunelul Radarului/); assert.doesNotMatch(el.innerHTML, /adresă fixă/);
  poza.radarUrl = 'https://ts.net.rau.com'; RadarEcran.randeaza(el, poza, O(poza));
  assert.doesNotMatch(el.innerHTML, /adresă fixă/, 'doar gazda care SE TERMINĂ în .ts.net');
});
test('v126: parola Radarului din linkul paginii (#parola=…) se ține minte și dispare din adresă, împreună cu cheia', () => {
  const scris = {}, istoric = [];
  const loc = { href: 'https://mferent80-source.github.io/premarket_scanner.html/alerts/#cheie=CheieFalsaDeProba0123456789abcdef&parola=x%2Fy' };
  const RP = new Function('window', 'localStorage', 'fetch', 'document', 'location', 'history', src('lib/radar-poza.js') + '; return RadarPoza;')(
    {}, { getItem(k) { return scris[k] ?? null; }, setItem(k, v) { scris[k] = v; }, removeItem(k) { delete scris[k]; } }, () => Promise.reject(new Error('fara retea')), { hidden: false, addEventListener() {} },
    loc, { replaceState(a, b, u) { istoric.push(u); } });
  RP.cheieDinUrl();
  assert.strictEqual(scris.radar_parola, 'x/y'); assert.strictEqual(scris.radar_cheie, 'CheieFalsaDeProba0123456789abcdef');
  assert.strictEqual(istoric[0], 'https://mferent80-source.github.io/premarket_scanner.html/alerts/', 'nici cheia, nici parola nu rămân în adresă');
  assert.strictEqual(RP.parolaRadar(), 'x/y'); RP.puneParolaRadar(''); assert.strictEqual(scris.radar_parola, undefined);
});

// v128 (el, 28.09: „nu mai apare evoluția zilei pe pagina alerts, fă cu verde creșterea și roșu scăderea” + „verifică și pe telefon”)
test('v128: la Trading 212 evoluția zilei e GROASĂ și colorată (verde sus, roșu jos), ca la bot; pe telefon coloana „Acum” se vede', () => {
  const el = { innerHTML: '', addEventListener() {}, dataset: {} };
  const poza = POZA_BAZA();   // AVGO: 352,81 față de 350,36 = +0,7%
  RadarEcran.randeaza(el, poza, O(poza));
  assert.match(el.innerHTML, /<b class="d24 good">▲ \+0,7%<\/b><span class="mic">azi <span class="px-sess t212"/);
  const jos = POZA_BAZA(); jos.t212[0].prev = 360; RadarEcran.randeaza(el, jos, O(jos));
  assert.match(el.innerHTML, /<b class="d24 bad">▼ −2,0%<\/b>/);
  assert.doesNotMatch(el.innerHTML, /<span class="mic (good|bad)">/, 'nu mai e procent gri în .mic');
  const css = src('lib/radar-ui.css');
  assert.match(css, /\.rad \.d24\.good\{color:var\(--good\)\}/); assert.match(css, /\.rad \.d24\.bad\{color:var\(--bad\)\}/);
  assert.match(css, /td\.c-azi b\.good\{color:var\(--good\)\}/, 'și coloana Azi din Simbolurile tale');
  const tel = css.slice(css.indexOf('@media (max-width:640px){\nbody.al-page .rad .poz thead'));
  assert.match(tel, /#radT212 tr\.rand td\.c-acum\{display:block/, 'pe telefon, la T212, prețul și ziua se văd');
});
// v139 (el, 29.09: „pe pagina alerts nu văd eu sau nu se afișează prețul live?” + „și la stocks?”): pe telefon regula care ascunde
// td.c-acum pe TOATE randurile era desfacuta doar la boti si la T212 - la Simbolurile tale ramanea doar „Azi %”, fara pret
test('v139: pe telefon, Simbolurile tale își arată prețul (c-acum), ca pozițiile T212 și boții', () => {
  const css = src('lib/radar-ui.css');
  const tel = css.slice(css.indexOf('@media (max-width:640px){\nbody.al-page .rad .poz thead'));
  const ascunde = tel.indexOf('td.c-acum, body.al-page .rad .poz tr.rand td.c-trend'), arata = tel.search(/#radSimboluri tr\.rand td\.c-acum\{display:block/);
  assert.ok(ascunde >= 0, 'regula care ascunde c-acum pe telefon');
  assert.ok(arata > ascunde, 'regula care o arată la Simbolurile tale vine DUPĂ cea care o ascunde (altfel pierde)');
  const el = { innerHTML: '', addEventListener() {}, dataset: {} };
  const poza = POZA_BAZA(); poza.simboluri = [{ s: 'APLD', closes30: [31.2, 26.25], prev: 24.5 }];
  RadarEcran.randeaza(el, poza, O(poza, { simboluri: [{ s: 'APLD', nota: '' }], preturiLive: { APLD: { pret: 24.96, prev: 24.5, la: ACUM, chip: '' } } }));
  const sim = el.innerHTML.slice(el.innerHTML.indexOf('id="radSimboluri"'));
  assert.match(sim, /<td class="c-acum">\$24,96/, 'prețul live e în celula c-acum a simbolului');
});

// v129 (spec 2026-09-28-sl-tp-pe-alerts): SL / TP pe pagina alerts
test('v129: sltpT212 - planul bate sugestia; fara plan = sugerat; fara nimic = null (poza veche)', () => {
  const sg = { stop: 90, tinta: 130, k: 2, riscPct: 0.1, trend: 'sus', proba: { n: 100, pePlus: 0.55, medie: 0.02 } };
  assert.deepStrictEqual(RadarEcran.sltpT212({ mediu: 100, plan: { stop: 85, tinta: 120 }, sugestie: sg }), { sl: 85, tp: 120, intr: 100, intrEt: 'prețul tău mediu', sursa: 'plan', orient: false });
  assert.strictEqual(RadarEcran.sltpT212({ mediu: 100, plan: null, sugestie: sg }).sursa, 'sugerat');
  assert.strictEqual(RadarEcran.sltpT212({ mediu: 100, plan: { stop: 85, tinta: null }, sugestie: sg }).tp, 130, 'plan fara tinta: tinta sugerata');
  assert.strictEqual(RadarEcran.sltpT212({ mediu: 100, plan: null }), null);
});
test('v129: baraSLTP - procentele, punctul, SUB STOP / ȚINTĂ ATINSĂ, ultimul sfert colorat, fara impartire la zero', () => {
  const o = { sl: 90, tp: 130, intr: 100, intrEt: 'prețul tău mediu' };
  const h = RadarEcran.baraSLTP(o, 110, '$');
  assert.match(h, /SL <b>\$90,00<\/b>/); assert.match(h, /TP <b>\$130,00<\/b>/); assert.match(h, /−18,2% până la SL/); assert.match(h, /\+18,2% până la TP/); assert.match(h, /prețul tău mediu \$100,00/);
  assert.match(RadarEcran.baraSLTP(o, 88, '$'), /SUB STOP/); assert.match(RadarEcran.baraSLTP(o, 88, '$'), /sub SL cu 2,3%/);
  assert.match(RadarEcran.baraSLTP(o, 131, '$'), /ȚINTĂ ATINSĂ/);
  assert.match(RadarEcran.baraSLTP(o, 92, '$'), /class="punct r"/, 'ultimul sfert spre SL = rosu'); assert.match(RadarEcran.baraSLTP(o, 125, '$'), /class="punct v"/);
  assert.doesNotMatch(RadarEcran.baraSLTP({ sl: 100, tp: 100 }, 100, '$'), /NaN|Infinity|până la/, 'SL = TP: doar text, fără împărțire la zero (revizia finală)'); assert.strictEqual(RadarEcran.baraSLTP({ sl: 90, tp: null }, 100, '$'), '');
  assert.doesNotMatch(RadarEcran.baraSLTP(o, 110, '$'), /NaN|undefined|Infinity/);
});
test('v129: la T212 coloana „SL ← acum → TP” inlocuieste Stop + Tinta; eticheta PLANUL TĂU / SUGERAT; dovada; regula care pierde spusa pe fata', () => {
  const el = { innerHTML: '', addEventListener() {}, dataset: {} };
  const poza = POZA_BAZA();
  poza.t212[0].sugestie = { stop: 320, tinta: 409, k: 3, riscPct: 0.083, trend: 'jos', proba: { n: 105, pePlus: 0.41, medie: 0.0202 } };
  poza.t212.push(Object.assign(JSON.parse(JSON.stringify(POZ_AVGO)), { s: 'UHS', plan: null, mediu: 184.51, pret: 178.8, sugestie: { stop: 157.15, tinta: 197.47, k: 1.5, riscPct: 0.052, trend: 'lateral', proba: { n: 42, pePlus: 0.262, medie: -0.0241 } } }));
  RadarEcran.randeaza(el, poza, O(poza));
  assert.match(el.innerHTML, /<th>SL ← acum → TP<\/th>/); assert.doesNotMatch(el.innerHTML, /<th>Stop din plan<\/th>|<th>Țintă<\/th>/);
  assert.match(el.innerHTML, /class="slEt plan">PLANUL TĂU/); assert.match(el.innerHTML, /class="slEt sug">SUGERAT/);
  assert.match(el.innerHTML, /Pe istoricul UHS regula asta a pierdut în medie/); assert.match(el.innerHTML, /colspan="9"/);
  const vechi = POZA_BAZA(); delete vechi.t212[0].sugestie; vechi.t212[0].plan = null; RadarEcran.randeaza(el, vechi, O(vechi));
  assert.match(el.innerHTML, /fără plan/, 'poza veche fara sugestie: „fără plan” ca inainte');
});

test('v129: Simbolurile tale - „SL ← intrare → TP” + „Pe istoric”; trend in jos = ORIENTATIV; fara-date = motivul; fara sugestie = gol, fara exceptie', () => {
  const el = { innerHTML: '', addEventListener() {}, dataset: {} };
  const poza = POZA_BAZA();
  poza.simboluri = [
    { s: 'INTC', pret: 115.46, prev: 116, closes30: [100, 115.46], sugestie: { intrare: { pret: 112.05, motiv: 'retragere spre media pe 20 de zile (ordin limită), nu după mișcare' }, stop: 94.73, tinta: 146.69, k: 3, riscPct: 0.15, trend: 'sus', proba: { n: 140, pePlus: 0.571, medie: 0.0703 } } },
    { s: 'RHM.DE', moneda: '€', pret: 966.3, prev: 980, closes30: [], sugestie: { intrare: null, stop: 917.3, tinta: 1064.29, k: 1.5, riscPct: 0.051, trend: 'jos', proba: { n: 141, pePlus: 0.248, medie: -0.0255 } } },
    { s: 'NOU', pret: 10, closes30: [], sugestie: { nivel: 'fara-date', motiv: 'prea puține zile de prețuri (60 din 120)' } },
    { s: 'VECHI', pret: 10, closes30: [] }];
  RadarEcran.randeaza(el, poza, O(poza, { simboluri: poza.simboluri.map(function (x) { return { s: x.s }; }) }));
  assert.match(el.innerHTML, /<th>SL ← intrare → TP<\/th><th>Pe istoric<\/th>/);
  assert.match(el.innerHTML, /intrare sugerată \$112,05/); assert.match(el.innerHTML, /class="slEt orient">ORIENTATIV · TREND ÎN JOS/); assert.match(el.innerHTML, /slBara orient/);
  assert.match(el.innerHTML, /prea puține zile de prețuri \(60 din 120\)/);
  assert.match(el.innerHTML, /<b class="bad">−2,5%<\/b><span class="mic">25 % pe plus · 141 intrări/, 'pe istoric: rosu cand pierde');
  assert.match(el.innerHTML, /Pe istoricul RHM\.DE regula asta a pierdut în medie/); assert.match(el.innerHTML, /Trend în jos pe zilnice/);
  assert.match(el.innerHTML, /colspan="10"/, 'rândul desfăcut al simbolului acoperă și cele două coloane noi');
  assert.doesNotMatch(el.innerHTML, /NaN|undefined/);
});

test('v129: prețul la mai puțin de 0,05% de SL scrie „chiar la SL”, nu „sub SL cu 0,0%” (AVGO, 28.09: $350,62 cu SL $350,63)', () => {
  const o = { sl: 350.63, tp: 413.47, intr: 399.96, intrEt: 'prețul tău mediu' };
  const sub = RadarEcran.baraSLTP(o, 350.62, '$'), peste = RadarEcran.baraSLTP(o, 350.70, '$');
  assert.match(sub, /chiar la SL/); assert.match(sub, /SUB STOP/, 'tot sub stop e'); assert.doesNotMatch(sub, /0,0%/);
  assert.match(peste, /chiar la SL/); assert.doesNotMatch(peste, /−0,0%/);
  assert.match(RadarEcran.baraSLTP(o, 340, '$'), /sub SL cu 3,1%/, 'mai departe: procentul, ca înainte (350,63 / 340 − 1 = 3,1%)');
});

// revizia finala (28.09): trei constatari Important, fiecare cu testul ei
test('revizie 1: stopul urcat PESTE ținta (poziție câștigătoare) sau prețul lipsă - SL și TP rămân la vedere, ca text, nu celulă goală', () => {
  const peste = RadarEcran.baraSLTP({ sl: 140.25, tp: 120, intr: 100, intrEt: 'prețul tău mediu' }, 160, '$');
  assert.match(peste, /SL <b>\$140,25<\/b>/); assert.match(peste, /TP <b>\$120,00<\/b>/); assert.match(peste, /ȚINTĂ ATINSĂ/); assert.doesNotMatch(peste, /NaN|undefined|Infinity/);
  const faraPret = RadarEcran.baraSLTP({ sl: 90, tp: 130 }, null, '$');
  assert.match(faraPret, /SL <b>\$90,00<\/b>/); assert.match(faraPret, /TP <b>\$130,00<\/b>/); assert.doesNotMatch(faraPret, /NaN|undefined|Infinity|până la/);
  assert.strictEqual(RadarEcran.baraSLTP({ sl: 90, tp: null }, 100, '$'), '', 'fără TP deloc: nimic de arătat');
});
test('revizie 2: marca „prețul tău mediu” nu iese din bară (mediu în afara intervalului SL-TP)', () => {
  const stanga = RadarEcran.baraSLTP({ sl: 110.5, tp: 150, intr: 100, intrEt: 'prețul tău mediu' }, 128, '$');
  const dreapta = RadarEcran.baraSLTP({ sl: 80, tp: 110, intr: 140, intrEt: 'prețul tău mediu' }, 95, '$');
  assert.match(stanga, /class="intr" style="left:0\.0%"/); assert.match(dreapta, /class="intr" style="left:100\.0%"/);
  assert.match(stanga, /prețul tău mediu \$100,00/, 'textul din mijloc rămâne cu valoarea reală');
});
test('revizie 3: la poziții dovada spune regula reală a SL-ului (−15 % de la maxim, verificată 25.09) și de unde vine ținta', () => {
  const el = { innerHTML: '', addEventListener() {}, dataset: {} };
  const poza = POZA_BAZA();
  poza.t212[0].plan = null;
  poza.t212[0].sugestie = { stop: 157.15, tinta: 197.47, k: 1.5, riscPct: 0.052, trend: 'lateral', proba: { n: 42, pePlus: 0.262, medie: -0.0241 } };
  RadarEcran.randeaza(el, poza, O(poza));
  assert.match(el.innerHTML, /−15 % de la maximul de după cumpărare \(\$184,88\)/, 'maximul = stopul / 0,85');
  assert.match(el.innerHTML, /\+1\.001 lei/); assert.match(el.innerHTML, /Ținta: 2 × 1,5 × volatilitatea zilnică/);
  assert.doesNotMatch(el.innerHTML, /≈ −5,2% de la intrare/, 'nu mai pretinde că stopul poziției e k × volatilitatea');
  assert.match(el.innerHTML, /regula asta a pierdut în medie/);
});

// v131 (el, 28.09: ideile 4 „câte bucăți” si 6 „Păstrează ca plan”)
test('v131: la simbolul urmărit cu intrare sugerată, rândul desfăcut spune câte bucăți (1 % risc din cont, plafon 20 %)', () => {
  const el = { innerHTML: '', addEventListener() {}, dataset: {} };
  const poza = POZA_BAZA();
  poza.simboluri = [
    { s: 'INTC', pret: 115.31, prev: 116, closes30: [], sugestie: { intrare: { pret: 111.91, motiv: 'retragere' }, stop: 94.68, tinta: 146.61, k: 3, riscPct: 0.15, trend: 'sus', proba: { n: 140, pePlus: 0.571, medie: 0.0703 }, marime: { bucati: 16.6547, suma: 8570, risc: 1316, plafonat: false } } },
    { s: 'WDC', pret: 455, prev: 450, closes30: [], sugestie: { intrare: { pret: 413.3, motiv: 'lateral' }, stop: 345.1, tinta: 549.7, k: 3, riscPct: 0.165, trend: 'lateral', proba: { n: 171, pePlus: 0.66, medie: 0.125 }, marime: { bucati: 4.6, suma: 8800, risc: 1450, plafonat: true } } },
    { s: 'RHM.DE', moneda: '€', pret: 966.3, closes30: [], sugestie: { intrare: null, stop: 917.3, tinta: 1064.29, k: 1.5, riscPct: 0.051, trend: 'jos', proba: { n: 141, pePlus: 0.25, medie: -0.025 } } }];
  RadarEcran.randeaza(el, poza, O(poza, { simboluri: poza.simboluri.map(function (x) { return { s: x.s }; }) }));
  assert.match(el.innerHTML, /Cât cumpăr/); assert.match(el.innerHTML, /16,65 buc la \$111,91/); assert.match(el.innerHTML, /~8\.570 lei/); assert.match(el.innerHTML, /pierzi ~1\.316 lei/);
  assert.match(el.innerHTML, /plafonat la 20 % din cont/, 'WDC plafonat: se spune');
  const rhm = el.innerHTML.slice(el.innerHTML.indexOf('data-det="RHM.DE"')); assert.doesNotMatch(rhm.slice(0, rhm.indexOf('</tr>')), /Cât cumpăr/, 'trend în jos: fără bucăți');
});
test('v131: poziție SUGERAT (fără plan) -> butonul „Păstrează ca plan” deschide Radarul pe poziție; cu plan nu apare', () => {
  const el = { innerHTML: '', addEventListener() {}, dataset: {} };
  const poza = POZA_BAZA(); poza.radarUrl = 'https://abc-def.trycloudflare.com';
  poza.t212[0].plan = null; poza.t212[0].sugestie = { stop: 350.6, tinta: 412, k: 3, riscPct: 0.08, trend: 'jos', proba: { n: 105, pePlus: 0.41, medie: 0.02 } };
  RadarEcran.randeaza(el, poza, O(poza, { parolaRadar: 'p1' }));
  assert.match(el.innerHTML, /href="https:\/\/abc-def\.trycloudflare\.com\/#parola=p1&amp;ecran=t212&amp;poz=AVGO_US_EQ"[^>]*>Păstrează ca plan</);
  const cuPlan = POZA_BAZA(); RadarEcran.randeaza(el, cuPlan, O(cuPlan)); assert.doesNotMatch(el.innerHTML, /Păstrează ca plan/);
});

// v132 (el, 28.09: „da” - eticheta „LA INTRARE” cand bulina atinge linia; aceeasi regula ca alerta de pe Discord: pret <= intrare + 0,5 %)
test('v132: eticheta „LA INTRARE” lângă nume când prețul a ajuns la intrarea sugerată (+0,5 %); departe sau trend în jos - nu', () => {
  const el = { innerHTML: '', addEventListener() {}, dataset: {} };
  const poza = POZA_BAZA();
  const sg = (pret, intrare) => ({ intrare: intrare === null ? null : { pret: intrare, motiv: 'retragere' }, stop: 94, tinta: 146, k: 3, riscPct: 0.15, trend: intrare === null ? 'jos' : 'sus', proba: { n: 140, pePlus: 0.57, medie: 0.07 } });
  poza.simboluri = [{ s: 'INTC', pret: 112.4, closes30: [], sugestie: sg(112.4, 112.0) }, { s: 'CSCO', pret: 106.93, closes30: [], sugestie: sg(106.93, 105.22) }, { s: 'RHM.DE', moneda: '€', pret: 900, closes30: [], sugestie: sg(900, null) }];
  RadarEcran.randeaza(el, poza, O(poza, { simboluri: poza.simboluri.map(function (x) { return { s: x.s }; }) }));
  const rand = (s) => { const i = el.innerHTML.indexOf('<tr class="rand" tabindex="0" aria-expanded="false" data-s="' + s + '"'); return el.innerHTML.slice(i, el.innerHTML.indexOf('</tr>', i)); };
  assert.match(rand('INTC'), /class="slEt laIntrare">LA INTRARE</, 'INTC la 0,4 % peste intrare');
  assert.doesNotMatch(rand('CSCO'), /LA INTRARE/, 'CSCO la 1,6 % peste intrare: încă nu');
  assert.doesNotMatch(rand('RHM.DE'), /LA INTRARE/, 'trend în jos: niciodată');
});
// v133 (el, 29.09: „pagina alerts nu deschide nimic când dau Radar sau Tabloul botului” - „se deschide, dar gol/eroare”, pe PC):
// alerts stă în iframe-ul shell-ului; linkul fără țintă încărca Radarul ÎN iframe, iar Radarul refuză ramele
// (X-Frame-Options: DENY + frame-ancestors 'none') => ecran gri cu 🚫. Toate linkurile spre Radar pleacă într-o filă nouă.
test('v133: „Deschide în Radar”, „Deschide Tabloul botului” și „Păstrează ca plan” se deschid în filă nouă (nu în iframe-ul shell-ului)', () => {
  const el = { innerHTML: '', addEventListener() {}, dataset: {} };
  const poza = POZA_BAZA(); poza.radarUrl = 'https://abc-def.trycloudflare.com';
  poza.t212[0].plan = null; poza.t212[0].sugestie = { stop: 350.6, tinta: 412, k: 3, riscPct: 0.08, trend: 'jos', proba: { n: 105, pePlus: 0.41, medie: 0.02 } };
  poza.boti = [{ id: '2386', s: 'JTO', dir: 'long', lev: 5, investit: 98.14, jos: 0.55, sus: 0.565, pret: 0.5577, total: -14.7, niv: 'atentie', motive: [], plan: null }];
  RadarEcran.randeaza(el, poza, O(poza, { parolaRadar: 'p1' }));
  const linkuri = el.innerHTML.match(/<a [^>]*href="https:\/\/abc-def\.trycloudflare\.com\/[^"]*"[^>]*>[^<]*/g) || [];
  const texte = linkuri.map((a) => a.replace(/^.*>/, ''));
  for (const t of ['Deschide în Radar', 'Deschide Tabloul botului', 'Păstrează ca plan']) assert.ok(texte.includes(t), 'lipsește linkul „' + t + '”: ' + texte.join(' | '));
  for (const a of linkuri) { assert.match(a, /target="_blank"/, 'fără filă nouă: ' + a); assert.match(a, /rel="noopener"/, 'fără noopener: ' + a); }
});
// v134 (el, 29.09: „în pagina alerts PUMP arată greșit”): planul botului e în USDT (Radarul: {plus: USDT, minus: USDT, afaraOre}),
// pagina îl scria cu % („plan +4.6 % / −13 %”, în Tablou „ținta de +4.6 USDT”)
test('v134: planul botului se scrie în USDT (rândul și detaliul), nu în %', () => {
  const el = { innerHTML: '', addEventListener() {}, dataset: {} };
  const poza = POZA_BAZA();
  poza.boti = [{ id: '2388', s: 'PUMPFUN', m: 'PUMP', dir: 'long', lev: 4, investit: 85.94, jos: 0.004598, sus: 0.005374, pret: 0.004919, total: 3.27, niv: 'atentie', motive: [], zero: 0.004825, plan: { plus: 4.6, minus: 13, afaraOre: 12 } }];
  RadarEcran.randeaza(el, poza, O(poza));
  assert.match(el.innerHTML, /plan \+4,6 USDT \/ −13 USDT \/ 12 h/);
  assert.match(el.innerHTML, /\+4,6 USDT \/ −13 USDT \/ afară 12 h/);
  assert.doesNotMatch(el.innerHTML, /plan \+4\.6 %|\+4\.6% \//, 'fără procente la plan');
});

// v141 (el, 29.09: „pagina alerts nu încarcă Trade 212 și botul pe PC”): managerul de parole din Edge a completat câmpul
// „adresa worker-ului” (textul de dinaintea parolei) cu „1000” -> radar_url=1000 -> fetch pe alerts/1000/poza = 404, „nicio poză”
test('v141: adresa worker-ului salvată greșit (nu e https://) nu mai strică citirea - se folosește adresa implicită', () => {
  const scris = { radar_url: '1000' };
  const RP = new Function('window', 'localStorage', 'fetch', 'document', src('lib/radar-poza.js') + '; return RadarPoza;')(
    {}, { getItem(k) { return scris[k] ?? null; }, setItem(k, v) { scris[k] = v; }, removeItem(k) { delete scris[k]; } }, () => Promise.reject(new Error('fara retea')), { hidden: false, addEventListener() {} });
  assert.strictEqual(RP.url(), 'https://paznic-radar.mferent80.workers.dev', 'valoarea stricată deja salvată e ignorată');
  RP.puneUrl('admin'); assert.strictEqual(RP.url(), 'https://paznic-radar.mferent80.workers.dev', 'un nume de utilizator nu devine adresă');
  RP.puneUrl('http://altceva.example'); assert.strictEqual(RP.url(), 'https://paznic-radar.mferent80.workers.dev', 'doar https');
  RP.puneUrl('https://alt-worker.example.workers.dev/'); assert.strictEqual(RP.url(), 'https://alt-worker.example.workers.dev', 'o adresă https bună rămâne');
});
test('v141: caseta cheii nu mai lasă managerul de parole să completeze adresa worker-ului', () => {
  const h = src('lib/radar-ecran.js');
  const u = /<input id="radUrl"[^>]*>/.exec(h)[0], p = /<input id="radParola"[^>]*>/.exec(h)[0];
  assert.match(u, /type="url"/); assert.match(u, /autocomplete="off"/); assert.match(u, /data-1p-ignore|data-lpignore|data-protonpass-ignore/);
  assert.match(p, /autocomplete="new-password"/, 'parola Radarului nu e o parolă de site salvată: fără completare automată');
});
