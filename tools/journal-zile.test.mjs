// 27.10.2026 (I-763, partea Jurnal): etichetele ZILEI (regim, stare, emoție) cu rezultatul zilelor pe fiecare etichetă, „tranzacțiile ratate”
// (simbol, motiv, ce a făcut prețul în 5 sesiuni după), heatmap-ul oră × zi al intrărilor (culori din token-uri, legendă, tabel) și legenda +
// tabelul calendarului P&L. Totul stă în setările sincronizate ale Jurnalului (zile, ratate), ca etichetele tranzacțiilor.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const c = { console, JSON, Math, Number, Intl, Date, Map, Set, WeakMap, Float64Array }; c.window = c; vm.createContext(c);
for (const f of ['lib/journal-report.js', 'lib/journal-zile.js']) vm.runInContext(readFileSync(f, 'utf8'), c);
const Z = c.JournalZile, JR = c.JournalReport, H = 3600000, D = 86400000;
const NOW = Date.parse('2026-10-27T20:00:00Z');
const t = (iso) => Date.parse(iso);
const tr = [
  { id: 'a', ticker: 'AAPL_US_EQ', sym: 'AAPL', intrare: t('2026-10-19T13:45:00Z'), iesire: t('2026-10-19T18:00:00Z'), rez: 30, R: 1 },   // luni 9:45 NY
  { id: 'b', ticker: 'AAPL_US_EQ', sym: 'AAPL', intrare: t('2026-10-19T14:10:00Z'), iesire: t('2026-10-19T19:00:00Z'), rez: -10, R: -0.5 }, // luni 10:10 NY
  { id: 'c', ticker: 'MSFT_US_EQ', sym: 'MSFT', intrare: t('2026-10-21T17:00:00Z'), iesire: t('2026-10-22T15:00:00Z'), rez: -40, R: -1 }]; // miercuri 13:00 NY

test('etichetele zilei: vocabular fix, validare, scrise în setări (ultimele 400 de zile)', () => {
  assert.ok(Z.VOCAB.regim.includes('lateral') && Z.VOCAB.emotie.includes('FOMO'));
  assert.equal(Z.valideazaZi({ regim: 'lateral', stare: 'obosit', emotie: 'FOMO' }).ok, true);
  assert.equal(Z.valideazaZi({ regim: 'inventat' }).ok, false);
  assert.equal(Z.valideazaZi({}).ok, false, 'măcar o etichetă');
  const patch = Z.cuZi({ zile: { '2026-10-18': { regim: 'trend' } } }, '2026-10-19', { regim: 'lateral', stare: 'obosit', emotie: '' });
  assert.deepEqual(JSON.parse(JSON.stringify(patch.zile['2026-10-19'])), { regim: 'lateral', stare: 'obosit' });
  assert.ok(patch.zile['2026-10-18'], 'zilele vechi rămân');
});

test('rezultatul zilelor pe fiecare etichetă (ziua New York a ieșirii)', () => {
  const zile = { '2026-10-19': { regim: 'lateral', emotie: 'FOMO' }, '2026-10-22': { regim: 'lateral', stare: 'obosit' } };
  const a = Z.peEticheteZi(tr, zile);
  const lat = a.regim.find((x) => x.v === 'lateral');
  assert.deepEqual([lat.zile, lat.n, lat.rez], [2, 3, -20]); assert.ok(Math.abs(lat.R - -1 / 6) < 1e-9, 'R mediu pe tranzacție: ' + lat.R);
  assert.deepEqual([a.emotie[0].v, a.emotie[0].n, a.emotie[0].rez], ['FOMO', 2, 20]);
});

test('tranzacțiile ratate: validare, adăugare în setări, ce a făcut prețul în 5 sesiuni după', () => {
  assert.equal(Z.valideazaRatata({ simbol: 'NVDA', zi: '2026-10-20', motiv: 'Governor HALTED' }, NOW).ok, true);
  for (const x of [{ simbol: '', zi: '2026-10-20', motiv: 'x motiv' }, { simbol: 'NVDA', zi: '2026-11-20', motiv: 'în viitor' }, { simbol: 'NVDA', zi: '2026-10-20', motiv: 'a' }]) assert.equal(Z.valideazaRatata(x, NOW).ok, false);
  const p = Z.adaugaRatata({ ratate: [] }, { simbol: 'nvda', zi: '2026-10-20', motiv: 'Governor HALTED', pret: '100' }, NOW);
  assert.equal(p.ratate.length, 1); assert.equal(p.ratate[0].simbol, 'NVDA'); assert.equal(p.ratate[0].pret, 100); assert.match(p.ratate[0].id, /^rat_/);
  const zileBare = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27'];
  const bare = zileBare.map((z, i) => ({ t: t(z + 'T13:30:00Z'), c: 100 + i * 2, h: 101 + i * 2, l: 99 + i * 2, o: 100 + i * 2 }));
  const d = Z.dupaRatata(p.ratate[0], bare);
  assert.deepEqual([d.sesiuni, Math.round(d.pct * 10) / 10], [5, 12], 'de la 100 (prețul tău) la 112 după 5 sesiuni');
  const faraPret = Z.dupaRatata({ ...p.ratate[0], pret: null }, bare); assert.ok(Math.abs(faraPret.pct - ((112 - 102) / 102) * 100) < 1e-9, 'fără preț: închiderea zilei');
  assert.equal(Z.dupaRatata({ ...p.ratate[0], zi: '2026-10-27' }, bare), null, 'nicio sesiune după încă');
});

test('heatmap-ul oră × zi: intrările din SUA pe ziua săptămânii și ora New York; media și n pe celulă', () => {
  const h = Z.heatmap(tr);
  const luni930 = h.celule[0][1];
  assert.deepEqual([luni930.n, luni930.medie], [2, 10], 'luni 9:30–10:30: AAPL +30 și −10');
  assert.deepEqual([h.celule[2][3].n, h.celule[2][3].medie], [1, -40], 'miercuri 12:00–14:00');
  assert.equal(h.celule[1][1].n, 0); assert.equal(h.max, 40);
});

test('panoul heatmap: tabel cu antete, culori din token-uri (intensitate), legendă, valori cu o zecimală, celulele cu data-tip', () => {
  const html = Z.htmlHeatmap(Z.heatmap(tr), 'EUR');
  assert.match(html, /<table[^>]*class="jrr-hm"/); assert.match(html, /<th scope="row">Luni<\/th>/); assert.match(html, /<th scope="col">9:30–10:30<\/th>/);
  assert.match(html, /class="hm-gain"[^>]*style="--a:\d+%"/); assert.match(html, /class="hm-loss"/);
  assert.match(html, /\+10,0 €/); assert.match(html, /−40,0 €/); assert.match(html, /data-tip="/);
  assert.match(html, /jrr-leg/); assert.match(html, /câștig mediu/); assert.match(html, /pierdere medie/);
  assert.doesNotMatch(html, /#[0-9a-f]{6}/i, 'fără culori scrise în cod: doar token-uri');
});

test('panoul zilei: formularul etichetelor de azi, formularul „ratate” și lista cu ce a făcut prețul după', () => {
  const html = Z.htmlZile({ azi: '2026-10-27', zile: { '2026-10-27': { regim: 'lateral' } }, ratate: [{ id: 'rat_1', simbol: 'NVDA', zi: '2026-10-20', motiv: 'Governor HALTED', pret: 100 }], dupa: new Map([['rat_1', { pct: 10, sesiuni: 5 }]]), agregat: Z.peEticheteZi(tr, {}) });
  assert.match(html, /data-jrr-zi="regim"/); assert.match(html, /<option value="lateral" selected>/); assert.match(html, /data-jrr-zi-salveaza/);
  assert.match(html, /data-jrr-rat="simbol"/); assert.match(html, /data-jrr-rat-adauga/); assert.match(html, /NVDA/); assert.match(html, /\+10,0%/); assert.match(html, /5 sesiuni/);
});

test('calendarul P&L are legendă și tabelul lunilor', () => {
  const html = JR.render({ tr: tr.map((x) => ({ ...x, moneda: 'EUR' })), moneda: 'EUR', perioada: 0, now: NOW });
  const cal = html.slice(html.indexOf('id="jrrCal"'));
  assert.match(cal, /jrr-leg/); assert.match(cal, /Tabelul lunilor/); assert.match(cal, /octombrie 2026/);
});

test('poza de probă: zero după rotunjire fără semn în heatmap și în panoul zilei', () => {
  const h = Z.heatmap([{ ...tr[0], rez: -0.02 }]);
  assert.doesNotMatch(Z.htmlHeatmap(h, 'EUR'), /−0,0/);
});
