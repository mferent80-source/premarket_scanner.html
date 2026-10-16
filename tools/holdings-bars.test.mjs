import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const c = {}; vm.createContext(c); vm.runInContext(readFileSync('lib/holdings-bars.js', 'utf8'), c); const B = c.HoldingsBars;
const serie = (n, salt) => { let p = 100; return Array.from({ length: n }, (_, i) => { if (salt && salt[i]) p *= salt[i]; else p *= 1.001; return { t: Date.UTC(2022, 0, 3) + i * 86400000, c: p }; }); };
test('I-644: fără salt, barele rămân întregi', () => { const b = serie(900); const r = B.prepare(b); assert.equal(r.bars, b); assert.equal(r.cut, null); });
test('I-644: după ultimul salt peste 25%, doar istoricul de după el; ultima bară păstrată', () => {
  const b = serie(1200, { 100: 0.7, 300: 1.4 }), r = B.prepare(b);
  assert.equal(r.bars.length, 900); assert.equal(r.bars[0], b[300]); assert.equal(r.bars.at(-1), b.at(-1));
  assert.equal(r.cut.dropped, 300); assert.equal(r.cut.kept, 900); assert.ok(Math.abs(r.cut.pct - 40) < 1e-9);
  assert.match(B.note(r.cut), /după un salt de \+40,0% într-o zi \(900 sesiuni; 300 mai vechi lăsate deoparte\)/);
});
test('I-644: salt prea recent ⇒ mesaj clar, nu „istoric invalid”', () => {
  const b = serie(1000, { 950: 0.7 }); assert.throws(() => B.prepare(b), /lasă doar 50 sesiuni după el; modelele cer 510/);
});
test('I-644: un salt de exact 25% nu taie (pragul e „peste”)', () => { const b = serie(900, { 400: 1.25 }); assert.equal(B.prepare(b).cut, null); });
test('I-653: din mesajul de așteptare, sesiunile lipsă și data estimată (doar zile lucrătoare)', () => {
  const vineri = Date.UTC(2026, 9, 16, 22), w = B.waitInfo('Ultimul salt peste 25% (2024-11-06, +31,1%) lasă doar 486 sesiuni după el; modelele cer 510.', vineri);
  assert.equal(w.sessions, 24); assert.equal(w.date, '2026-11-19'); assert.equal(w.label, '19.11');
  assert.equal(B.waitInfo('Istoric invalid'), null);
});
