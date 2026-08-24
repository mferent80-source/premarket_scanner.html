// Teste pentru lib/price-day.js — baseline variația zilei Yahoo.
// Rulează: node --test tools/price-day.test.mjs
import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const PD = require('../lib/price-day.js');

test('RTH fără changePercent: last = regularMarketPrice, prev = chartPreviousClose', () => {
  const q = PD.yahooQuote({
    regularMarketPrice: 96.01,
    chartPreviousClose: 95.56,
    previousClose: 95.56
  }, 95.49, 'rth', false);
  assert.equal(q.last, 96.01);
  assert.equal(q.prev, 95.56);
  const chg = (q.last - q.prev) / q.prev * 100;
  assert.ok(chg > 0.4 && chg < 0.5, 'azi ~+0.47, nu bara 1m');
});

test('RTH cu changePercent oficial', () => {
  const q = PD.yahooQuote({
    regularMarketPrice: 96.01,
    regularMarketChangePercent: 0.47,
    chartPreviousClose: 95.56
  }, 95.49, 'rth', false);
  assert.equal(q.last, 96.01);
  const implied = 96.01 / (1 + 0.47 / 100);
  assert.ok(Math.abs(q.prev - implied) < 1e-6);
});

test('premarket: prev = regularMarketPrice (close ieri)', () => {
  const q = PD.yahooQuote({
    regularMarketPrice: 95.56,
    chartPreviousClose: 94.00
  }, 96.10, 'pre', false);
  assert.equal(q.last, 96.10);
  assert.equal(q.prev, 95.56);
});

test('busOk: doar surse de zi (alerts/yahoo), nu nasdaq-ext/finnhub', () => {
  assert.equal(PD.busOk('alerts'), true);
  assert.equal(PD.busOk('yahoo-rth'), true);
  assert.equal(PD.busOk('nasdaq-ext'), false);
  assert.equal(PD.busOk('nasdaq-fh'), false);
  assert.equal(PD.busOk('hub-market'), false);
  assert.equal(PD.busOk(''), false);
  assert.equal(PD.busOk(undefined), false);
});

test('lastBarFromCloses: ultima bară non-null', () => {
  assert.equal(PD.lastBarFromCloses([1, 2, null, 4, null]), 4);
  assert.equal(PD.lastBarFromCloses([]), null);
});

test('RTH: changePercent stale (ieri) nu inversează Δ azi', () => {
  // FISV marți $53.03, close luni $52.21 (+1.6%); Yahoo mai trimite −4.01% de luni
  const q = PD.yahooQuote({
    regularMarketPrice: 53.03,
    regularMarketChangePercent: -4.01,
    chartPreviousClose: 52.21,
    previousClose: 52.21
  }, 53.00, 'rth', false);
  assert.equal(q.prev, 52.21);
  const chg = (q.last - q.prev) / q.prev * 100;
  assert.ok(chg > 1.4 && chg < 1.8, 'azi +1.6, nu −4 de ieri');
});

test('closed: last = regularMarketPrice (close oficial), nu bara 1m AH', () => {
  // INTC noaptea: ultima bară AH 91.92, close RTH 92.13, prev 92.80
  const q = PD.yahooQuote({
    regularMarketPrice: 92.13,
    chartPreviousClose: 92.80,
    previousClose: 92.80
  }, 91.92, 'closed', false);
  assert.equal(q.last, 92.13);
  assert.equal(q.prev, 92.80);
  const chg = (q.last - q.prev) / q.prev * 100;
  assert.ok(chg > -0.8 && chg < -0.6, 'Δ oficial ~−0.72, nu −0.95 din bara AH');
});

test('usSessionEt: noapte ET = closed, 15:00 ET = rth', () => {
  assert.equal(PD.usSessionEt(Date.parse('2026-08-21T05:34:00Z')), 'closed'); // 01:34 EDT
  assert.equal(PD.usSessionEt(Date.parse('2026-08-21T19:00:00Z')), 'rth');    // 15:00 EDT
  assert.equal(PD.usSessionEt(Date.parse('2026-08-21T12:00:00Z')), 'pre');    // 08:00 EDT
  assert.equal(PD.usSessionEt(Date.parse('2026-08-21T21:00:00Z')), 'after');  // 17:00 EDT
});

test('after: last rămâne bara AH (preț live), prev = close ieri', () => {
  const q = PD.yahooQuote({
    regularMarketPrice: 92.13,
    chartPreviousClose: 92.80
  }, 91.92, 'after', false);
  assert.equal(q.last, 91.92);
  assert.equal(q.prev, 92.80);
});

test('botul folosește PriceDay.yahooQuote pe stocks (paritate overnight cu /alerts/)', () => {
  const { readFileSync } = require('node:fs');
  const { fileURLToPath } = require('node:url');
  const { dirname, join } = require('node:path');
  const bot = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'check-alerts.mjs'), 'utf8');
  assert.match(bot, /lib\/price-day\.js/);
  assert.match(bot, /yahooQuote/);
  assert.match(bot, /usSessionEt/);
});

test('summarizeBus: numără surse și otrava', () => {
  const s = PD.summarizeBus({
    HOOD: { src: 'nasdaq-ext', chgPct: -4, price: 95 },
    ASTS: { src: 'yahoo-rth', chgPct: 1.2, price: 73 },
    FIX: { src: 'alerts', chgPct: 0.5, price: 1800 }
  });
  assert.equal(s.n, 3);
  assert.equal(s.bySrc['nasdaq-ext'], 1);
  assert.equal(s.bySrc['yahoo-rth'], 1);
  assert.equal(s.poisonN, 1);
  assert.ok(s.poison[0].indexOf('HOOD') >= 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// REGRESIE 23.08.2026 — „la 16:30 RO pagina revine la cifrele de ieri".
// La open (9:30 ET) Yahoo ține minute bune `regularMarketPrice`/`regularMarketTime`
// pe close-ul de IERI, în timp ce barele 1m de azi curg deja. Ramura `rth` suprascria
// orbește bara live cu meta → pe ecran reapăreau prețul + Δ-ul de ieri, cu chip „RTH".
// Fereastra sesiunii curente vine chiar din răspuns: `currentTradingPeriod.regular`.
// ─────────────────────────────────────────────────────────────────────────────
const ET = { OPEN_AZI: 1787578200, CLOSE_IERI: 1787342401, OPEN_IERI: 1787319000 };

test('OPEN: meta rămasă pe close-ul de IERI nu mai înlocuiește bara live de azi', () => {
  const q = PD.yahooQuote({
    regularMarketPrice: 90.07,          // close-ul de IERI, meta încă neactualizat
    regularMarketTime: ET.CLOSE_IERI,
    currentTradingPeriod: { regular: { start: ET.OPEN_AZI, end: ET.OPEN_AZI + 23400 } },
    previousClose: 92.13,
    chartPreviousClose: 92.13
  }, 91.50, 'rth', false, ET.OPEN_AZI * 1000 + 60000);   // bara de azi, 9:31 ET
  assert.equal(q.last, 91.50, 'prețul afișat rămâne bara de AZI, nu close-ul de ieri');
  assert.equal(q.prev, 92.13);
  assert.equal(q.ts, ET.OPEN_AZI * 1000 + 60000, 'ts e al barei afișate, nu al metei vechi');
});

test('OPEN: după ce meta se actualizează, ea redevine sursa (bara 1m poate fi întârziată)', () => {
  const q = PD.yahooQuote({
    regularMarketPrice: 91.80,
    regularMarketTime: ET.OPEN_AZI + 300,      // 9:35 ET, în sesiunea curentă
    currentTradingPeriod: { regular: { start: ET.OPEN_AZI, end: ET.OPEN_AZI + 23400 } },
    previousClose: 92.13,
    chartPreviousClose: 92.13
  }, 91.50, 'rth', false, ET.OPEN_AZI * 1000 + 240000);
  assert.equal(q.last, 91.80, 'meta e din sesiunea curentă → ea bate bara');
  assert.equal(q.ts, (ET.OPEN_AZI + 300) * 1000);
});

test('metaRegularIsCurrent: true / false / null (nu se poate ști)', () => {
  const win = { regular: { start: ET.OPEN_AZI, end: ET.OPEN_AZI + 23400 } };
  assert.equal(PD.metaRegularIsCurrent({ regularMarketTime: ET.OPEN_AZI + 60, currentTradingPeriod: win }), true);
  assert.equal(PD.metaRegularIsCurrent({ regularMarketTime: ET.CLOSE_IERI, currentTradingPeriod: win }), false);
  assert.equal(PD.metaRegularIsCurrent({ regularMarketTime: ET.OPEN_AZI }), null, 'fără fereastră → necunoscut');
  assert.equal(PD.metaRegularIsCurrent({ currentTradingPeriod: win }), null, 'fără regularMarketTime → necunoscut');
  assert.equal(PD.metaRegularIsCurrent({}), null);
});

test('meta fără regularMarketTime: comportamentul vechi se păstrează (meta bate bara)', () => {
  const q = PD.yahooQuote({
    regularMarketPrice: 96.01, previousClose: 95.56, chartPreviousClose: 95.56
  }, 95.49, 'rth', false, Date.now());
  assert.equal(q.last, 96.01, 'fără dovadă că meta e veche, nu schimbăm nimic');
});

test('ts urmărește VALOAREA afișată, nu ultimul tick regular', () => {
  const barAzi = Date.UTC(2026, 7, 24, 12, 30);   // bară pre-market de azi
  const meta = {
    regularMarketPrice: 90.07,
    regularMarketTime: ET.CLOSE_IERI,             // ultimul tick regular = IERI 16:00
    chartPreviousClose: 92.13
  };
  const pre = PD.yahooQuote(meta, 91.50, 'pre', false, barAzi);
  assert.equal(pre.last, 91.50);
  assert.equal(pre.ts, barAzi, 'în pre-market cifra e de azi — ts-ul trebuie s-o spună');

  const closed = PD.yahooQuote(meta, 91.50, 'closed', false, barAzi);
  assert.equal(closed.last, 90.07, 'noaptea afișăm close-ul oficial…');
  assert.equal(closed.ts, ET.CLOSE_IERI * 1000, '…deci ts-ul e al lui, de ieri');
});

test('yahooQuote fără lastBarTs (apelanți vechi) cade pe regularMarketTime', () => {
  const q = PD.yahooQuote({
    regularMarketPrice: 92.13, regularMarketTime: ET.CLOSE_IERI, chartPreviousClose: 92.80
  }, 91.92, 'after', false);
  assert.equal(q.ts, ET.CLOSE_IERI * 1000);
});

test('lastBarAt: valoarea ȘI momentul ultimei bare non-null', () => {
  assert.deepEqual(PD.lastBarAt([1, 2, null, 4, null], [10, 20, 30, 40, 50]),
    { value: 4, ts: 40000 });
  assert.deepEqual(PD.lastBarAt([1], []), { value: 1, ts: null }, 'fără timestamps → ts null');
  assert.equal(PD.lastBarAt([], []), null);
  assert.equal(PD.lastBarAt(null, null), null);
});

test('botul pasează ora barei către yahooQuote (aceeași gardă ca pagina)', () => {
  const { readFileSync } = require('node:fs');
  const { fileURLToPath } = require('node:url');
  const { dirname, join } = require('node:path');
  const bot = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'check-alerts.mjs'), 'utf8');
  assert.match(bot, /lastBarTs/, 'botul trebuie să afle ora barei');
  assert.match(bot, /yahooQuote\([^)]*lastBarTs\)/, 'și s-o paseze mai departe');
});

// ── MONEDA (v796) ────────────────────────────────────────────────────────────
// Cauza „prețul nu e cel din Trading 212": 1QZ.DE (Coinbase pe XETRA) costă 161.34 EUR,
// iar pagina scria „$161.34" — 13.6% sub prețul real al COIN de pe Nasdaq (186.79 USD).
// Yahoo trimite moneda în `meta.currency`; până acum n-o citea nimeni.
test('yahooQuote întoarce moneda din meta', () => {
  const q = PD.yahooQuote({
    regularMarketPrice: 161.34, chartPreviousClose: 161.20, currency: 'EUR',
    fullExchangeName: 'XETRA'
  }, 161.34, 'rth', true);
  assert.equal(q.cur, 'EUR', 'moneda trebuie să iasă din yahooQuote');
  assert.equal(q.exch, 'XETRA', 'și bursa, ca să se vadă că nu e Nasdaq');
});

test('yahooQuote fără currency în meta → USD implicit (comportament vechi)', () => {
  const q = PD.yahooQuote({ regularMarketPrice: 86.07, chartPreviousClose: 90.07 }, 86.07, 'rth', false);
  assert.equal(q.cur, 'USD');
});

test('curSymbol: simbolul grafic al monedei', () => {
  assert.equal(PD.curSymbol('USD'), '$');
  assert.equal(PD.curSymbol('EUR'), '€');
  assert.equal(PD.curSymbol('GBp'), 'p', 'Londra cotează în pence, nu în lire');
  assert.equal(PD.curSymbol('CHF'), 'CHF');
  assert.equal(PD.curSymbol(null), '$', 'necunoscut → $, ca înainte');
});

test('curFromSuffix: moneda ghicită din sufixul bursei, cât timp n-avem meta', () => {
  assert.equal(PD.curFromSuffix('1QZ.DE'), 'EUR');
  assert.equal(PD.curFromSuffix('MIGA.MU'), 'EUR');
  assert.equal(PD.curFromSuffix('NFC.F'), 'EUR');
  assert.equal(PD.curFromSuffix('VOD.L'), 'GBp');
  assert.equal(PD.curFromSuffix('NESN.SW'), 'CHF');
  assert.equal(PD.curFromSuffix('INTC'), 'USD', 'fără sufix = bursă US');
  assert.equal(PD.curFromSuffix('ONDOUSDT'), 'USD');
});

// ── VECHIMEA COTAȚIEI, NU A FETCH-ULUI (v796) ────────────────────────────────
// MIGA.MU (MicroStrategy pe München) a avut 5 tranzacții într-o zi întreagă: ultima
// la 12:06 UTC, adică acum 3 ore. Fetch-ul reușea la fiecare 30s, deci pagina o
// considera „proaspătă" și picta un Δ de +0.88% lângă MSTR care făcea +5.43% pe Nasdaq.
test('quoteAgeMs: vechimea se măsoară din ts-ul cotației', () => {
  const acum = Date.UTC(2026, 7, 24, 15, 10, 0);
  assert.equal(PD.quoteAgeMs({ ts: acum - 3 * 3600e3 }, acum), 3 * 3600e3);
  assert.equal(PD.quoteAgeMs({ ts: null }, acum), null, 'fără ts nu inventăm vechime');
  assert.equal(PD.quoteAgeMs(null, acum), null);
});

// Gărzi anti-regresie: „$" hardcodat lângă un preț a fost cauza reclamației „nu dă cote
// reale" — 4 din 11 alerte sunt pe burse germane, în EUR. Dacă cineva îl scrie la loc,
// testul cade aici, nu peste două săptămâni în fața lui Marius.
test('pagina /alerts/ nu mai lipește „$" de niciun preț', () => {
  const { readFileSync } = require('node:fs');
  const { fileURLToPath } = require('node:url');
  const { dirname, join } = require('node:path');
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const html = readFileSync(join(root, 'alerts', 'index.html'), 'utf8');
  assert.doesNotMatch(html, /\$\$\{fmtPx\(/, 'preț cu $ hardcodat în template');
  assert.doesNotMatch(html, /'\$' \+ fmtPx\(/, 'preț cu $ hardcodat prin concatenare');
  assert.match(html, /const fmtMoney = \(v, sym\) => curOf\(sym\)/, 'prețul se scrie cu fmtMoney');
  assert.match(html, /if \(p\.cur\) curs\[sym\] = p\.cur;/, 'moneda trebuie luată din cotație');
});

test('botul Telegram trimite prețul cu moneda lui', () => {
  const { readFileSync } = require('node:fs');
  const { fileURLToPath } = require('node:url');
  const { dirname, join } = require('node:path');
  const bot = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'check-alerts.mjs'), 'utf8');
  assert.doesNotMatch(bot, /\$\$\{[^}]*toFixed\(dec\(/, 'mesaj cu $ hardcodat pe un preț');
  assert.match(bot, /const money = \(v, sym\) => cs\(sym\)/, 'botul are formatarea cu monedă');
  assert.match(bot, /cur: out\.cur \|\| 'USD'/, 'moneda trebuie să iasă din fetchPrice');
});
