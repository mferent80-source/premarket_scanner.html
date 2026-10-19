// 19.10.2026 — I-696: profilul V8 pe datele lui (Edge, CPU×4) arăta `parts` din lib/daily-series.js = 7,1 s din 15,3 s la deschiderea
// Portofoliului — un Intl.DateTimeFormat nou la fiecare bară. Acum formatorul e ținut minte pe fus orar. Proba: aceleași rezultate ca
// versiunea veche (din git) pe mii de momente și fusuri, și timpul pe 50.000 de apeluri sub o limită pe care codul vechi n-o atingea.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const load = (src) => { const c = {Intl, Date, Number, Object, Math, JSON, Error, Map, Set, Array, String, console}; c.window = c; c.globalThis = c; vm.createContext(c); vm.runInContext(src, c); return c; };
const vechi = (f) => execFileSync('git', ['show', 'd89bee4b:' + f], {encoding: 'utf8'});
const nou = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const ZONE = ['America/New_York', 'Europe/Berlin', 'Europe/London', 'Europe/Zurich', 'Europe/Vienna', 'Europe/Copenhagen', 'Europe/Bucharest', 'Asia/Tokyo'];
let s = 7; const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const momente = Array.from({length: 3000}, () => Date.UTC(2020, 0, 1) + Math.floor(rnd() * 7 * 365 * 86400000));
// trecerile la ora de vară/iarnă, unde un formator greșit s-ar vedea
for (const d of ['2026-03-08T06:59:59Z', '2026-03-08T07:00:00Z', '2026-03-29T00:59:59Z', '2026-03-29T01:00:00Z', '2026-10-25T00:59:59Z', '2026-10-25T01:00:00Z', '2026-11-01T05:59:59Z', '2026-11-01T06:00:00Z']) momente.push(Date.parse(d));

test('ExchangeCalendar.date dă aceleași zile ca înainte, pe toate fusurile', () => {
  const a = load(vechi('lib/exchange-calendar.js')).ExchangeCalendar, b = load(nou('lib/exchange-calendar.js')).ExchangeCalendar;
  for (const z of ZONE) for (const t of momente) assert.equal(b.date(t, z), a.date(t, z), z + ' ' + new Date(t).toISOString());
  assert.throws(() => b.date(0, 'Nu/Exista'), RangeError, 'un fus greșit tot aruncă');
});

test('DailySeries.read dă aceeași serie ca înainte și e de cel puțin 10× mai rapidă', () => {
  const cal = nou('lib/exchange-calendar.js');
  const A = load(cal + '\n' + vechi('lib/daily-series.js')), B = load(cal + '\n' + nou('lib/daily-series.js'));
  const now = Date.parse('2026-10-16T21:30:00Z'), bars = [];
  for (let d = Date.parse('2024-10-16T20:00:00Z'); d <= Date.parse('2026-10-16T20:00:00Z'); d += 86400000) { const w = new Date(d).getUTCDay(); if (w === 0 || w === 6) continue; const c = 100 + rnd() * 10; bars.push({t: d, o: c, h: c + 1, l: c - 1, c}); }
  const serie = Object.assign(bars.slice(), {meta: {symbol: 'AAPL', timezone: 'America/New_York', regularEnd: Date.parse('2026-10-16T20:00:00Z'), currency: 'USD'}});
  const ra = A.DailySeries.read(serie, 'AAPL', now), rb = B.DailySeries.read(serie, 'AAPL', now);
  assert.equal(JSON.stringify(rb), JSON.stringify(ra));
  const timp = (D) => { const t0 = performance.now(); for (let i = 0; i < 20; i++) D.DailySeries.read(serie, 'AAPL', now); return performance.now() - t0; };
  timp(B); const tv = timp(A), tn = timp(B);
  assert.ok(tn * 10 < tv, `nou ${tn.toFixed(0)} ms vs vechi ${tv.toFixed(0)} ms`);
});

test('ziua din jurnalul Trading 212 și ora New York din analiză: același formator, construit o singură dată', () => {
  for (const [f, re] of [['lib/trading212-daily.js', /new Intl\.DateTimeFormat\('sv-SE',\{timeZone:'Europe\/Bucharest'[^)]*\)/], ['lib/holdings-analysis.js', /new Intl\.DateTimeFormat\('en-CA',\{timeZone:'America\/New_York'[^)]*\)/]]) {
    const a = vechi(f).match(re), b = nou(f).match(new RegExp(re.source, 'g'));
    assert.ok(a && b && b.length === 1, f + ': un singur formator');
    assert.equal(b[0], a[0], f + ': aceleași opțiuni');
    assert.match(nou(f), /^const (DAY_FMT|NY_FMT)=new Intl/m, f + ': construit la încărcare, nu în funcție');
  }
});
