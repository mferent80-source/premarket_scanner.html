// radar-bot-24h.test.mjs — v120 (28.09, el: „unde văd procentul la JTO?"): randul botului din sectiunea Boti Pionex arata
// mișcarea pe 24 h GROS, sub pret, ca la actiuni (▲/▼ + procent), din campul d24 al pozei; fara d24 ramane textul mic de sub linie.
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => readFileSync(join(ROOT, f), 'utf8');
const RadarEcran = new Function(src('lib/radar-ecran.js') + '; return RadarEcran;')();
const RadarPoza = new Function('window', 'localStorage', 'fetch', 'document', src('lib/radar-poza.js') + '; return RadarPoza;')({}, { getItem() { return null; }, setItem() {}, removeItem() {} }, () => {}, {});

const ACUM = Date.UTC(2026, 8, 28, 7, 0);
const BOT = () => ({ id: '2386', s: 'JTO', dir: 'long', lev: 5, investit: 98.14, jos: 0.5722, sus: 0.6572, pret: 0.5702, inGrid: -0.02, lichidarePct: 17, total: -18.84, perechi: 10, gridBrut: 2.15, pozitie: -20.7, comisioane: -0.29, zero: 0.5951, plan: { plus: 5.2, minus: 14.9, afaraOre: 12 }, niv: 'iesi', motive: ['planul tău: pierderea a atins pragul'], sfat: 'ieși', pret30: [0.5706, 0.5691, 0.5707, 0.5702], la: ACUM - 60000 });
const poza = (bot) => ({ la: ACUM, t212: [], boti: [bot], simboluri: [], gol: { boti: null, t212: 'nicio poziție deschisă' } });
const O = (p) => ({ simboluri: [], preturiLive: {}, acum: ACUM, cheie: true, prospetime: RadarPoza.prospetime(p, ACUM) });
const randeaza = (bot) => { const el = { innerHTML: '', addEventListener() {}, dataset: {} }; const p = poza(bot); RadarEcran.randeaza(el, p, O(p)); return el.innerHTML; };

test('botul cu d24 in poza: sub pret apare GROS mișcarea pe 24 h, cu săgeată și semn, colorată; pe minus ▼', () => {
  const h = randeaza(Object.assign(BOT(), { d24: -0.0312, d24Ore: 24 }));
  const rand = h.slice(h.indexOf('data-s="JTO"'), h.indexOf('class="det"'));
  assert.match(rand, /class="c-acum"[\s\S]*?<b class="d24 bad">▼ −3,1%<\/b>[\s\S]*?pe 24 h/, 'procentul pe 24 h, gros si rosu, sub pret: ' + rand.slice(0, 600));
  assert.match(rand, /−0,1% pe ultimele 4 min/, 'textul mic de sub linie ramane');
  const h2 = randeaza(Object.assign(BOT(), { d24: 0.0212, d24Ore: 24 }));
  assert.match(h2, /<b class="d24 good">▲ \+2,1%<\/b>/);
});
test('botul mai tanar de 24 h: procentul e de la pornire, cu orele spuse („pe 7 h", nu „pe 24 h")', () => {
  const h = randeaza(Object.assign(BOT(), { d24: 0.004, d24Ore: 7 }));
  assert.match(h, /<b class="d24 good">▲ \+0,4%<\/b>[\s\S]*?pe 7 h/); assert.doesNotMatch(h, /pe 24 h/);
});
test('poza veche (colector fara d24): nu inventeaza un procent - ramane doar textul mic de sub linie, fara „pe 24 h"', () => {
  const h = randeaza(BOT());
  assert.doesNotMatch(h, /class="d24/); assert.doesNotMatch(h, /pe 24 h/); assert.match(h, /pe ultimele 4 min/);
});
// v123 (el, 28.09: „ce înseamnă ultimele 30 de poze?” -> „OK” la „pe ultimele 30 min”): colectorul citeste pretul botului o data
// pe minut (PAS_MS = 60 s), deci cele 30 de preturi sunt ultima jumatate de ora; „poze” se confunda cu poza trimisa la 2 min.
test('v123: linia botului spune minutele, nu „poze” - capul coloanei „Ultimele 30 min”, textul „pe ultimele N min”, la inceput „puține citiri încă”', () => {
  const h = randeaza(BOT());
  assert.match(h, /<th class="c-spark">Ultimele 30 min<\/th>/, 'capul coloanei');
  assert.doesNotMatch(h, /poze/i, 'nicaieri „poze” in panoul botului');
  const scurt = randeaza(Object.assign(BOT(), { pret30: [0.57] }));
  assert.match(scurt, /puține citiri încă/);
});
// v122 (el, 28.09: „vreau ca procentul de crestere sau scadere sa fie LIVE acelasi cu cel din TradingView”)
const randeazaLive = (bot, botiLive) => { const el = { innerHTML: '', addEventListener() {}, dataset: {} }; const p = poza(bot); RadarEcran.randeaza(el, p, Object.assign(O(p), { botiLive })); return el.innerHTML; };
test('v122: cu lumanarea zilnica live (Binance) procentul e ca in TradingView - pretul de acum fata de inchiderea de ieri (deschiderea zilei), „azi”, si pretul afisat e cel live', () => {
  const h = randeazaLive(Object.assign(BOT(), { d24: -0.062, d24Ore: 14 }), { JTO: { deschidere: 0.5961, pret: 0.5582, la: ACUM - 3000, sursa: 'Binance' } });
  const rand = h.slice(h.indexOf('data-s="JTO"'), h.indexOf('class="det"'));
  assert.match(rand, /<b class="d24 bad">▼ −6,4%<\/b>/, '0.5582 / 0.5961 − 1 = −6,36%: ' + rand.slice(0, 700));
  assert.match(rand, /azi · ca în TradingView/); assert.doesNotMatch(rand, /pe 14 h/, 'nu mai e procentul de la pornirea botului');
  assert.match(rand, /0,5582/, 'pretul live'); assert.match(rand, /class="px-sess live"/, 'chip „live”');
});
test('v122: fara Binance (moneda doar pe Pionex), procentul zilei vine din poza (lumanarea zilnica Pionex), cu sursa spusa; fara nimic -> ramane cel vechi', () => {
  const h = randeazaLive(Object.assign(BOT(), { d24: -0.062, d24Ore: 14, zi: { deschidere: 0.596, pct: -0.0433 } }), {});
  assert.match(h, /<b class="d24 bad">▼ −4,3%<\/b>/); assert.match(h, /azi · Pionex, la 2 min/);
  const vechi = randeazaLive(Object.assign(BOT(), { d24: -0.062, d24Ore: 14 }), {});
  assert.match(vechi, /▼ −6,2%<\/b>[\s\S]*?pe 14 h/);
  const stale = randeazaLive(Object.assign(BOT(), { zi: { deschidere: 0.596, pct: -0.0433 } }), { JTO: { deschidere: 0.5961, pret: 0.5582, la: ACUM - 5 * 60000, sursa: 'Binance' } });
  assert.match(stale, /▼ −4,3%/, 'citirea live veche de 5 minute nu bate poza');
});
test('v122: pagina aduce lumanarea zilnica a botilor de la Binance futures la 10 s si o da randarii (botiLive); simbolul care nu exista pe Binance nu se mai cere la fiecare tura', () => {
  const html = src('alerts/index.html');
  assert.match(html, /fapi\.binance\.com\/fapi\/v1\/klines\?symbol=/); assert.match(html, /interval=1d&limit=1/);
  assert.match(html, /botiLive:\s*radBotiLive\(\)/); assert.match(html, /setInterval\(radAduBotiLive,\s*10000\)/);
  assert.match(html, /_radBotiFara/, 'tine minte ce nu exista pe Binance');
});
test('pe telefon randul botului nu ascunde pretul: celula c-acum e marcata pe rand (tr.rand.bot), iar CSS-ul o afiseaza sub 640px', () => {
  const h = randeaza(Object.assign(BOT(), { d24: -0.0312, d24Ore: 24 }));
  assert.match(h, /<tr class="rand bot" [^>]*data-s="JTO"/);
  const css = src('lib/radar-ui.css');
  assert.match(css, /tr\.rand\.bot td\.c-acum\{display:block/, 'regula de telefon pentru pretul botului');
});
