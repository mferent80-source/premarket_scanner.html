import test from 'node:test';
import assert from 'node:assert/strict';
import { motor } from './clasificator-date.mjs';
import { univers } from './clasificator-univers.mjs';

const now = Date.parse('2026-10-07T22:00:00Z');
function randomWalk(seed) {
  let a = seed >>> 0; const r = () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }, gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, r()))) * Math.cos(2 * Math.PI * r());
  const days = []; for (let d = new Date(now - 86400000); days.length < 1100; d.setUTCDate(d.getUTCDate() - 1)) if (d.getUTCDay() > 0 && d.getUTCDay() < 6) days.unshift(d.getTime());
  let p = 100; return days.map((t) => { const o = p; p *= Math.exp(0.015 * gauss()); return { t, o, h: Math.max(o, p) * (1 + 0.006 * r()), l: Math.min(o, p) * (1 - 0.006 * r()), c: p, v: 1e6 * (0.6 + r()) }; });
}
test('I-641: modelul comun pe 10 mersuri aleatoare — împărțire pe date, dovada pe zile, fără „experimental”', () => {
  const c = motor('.'), serii = {}; for (let i = 0; i < 10; i++) serii['S' + i] = { bars: randomWalk(100 + i) };
  const r = univers(c, serii, { now });
  assert.equal(r.simboluri, 10); assert.ok(r.zile >= 600); assert.notEqual(r.state, 'research');
  assert.equal(r.ferestre.length, 3); for (let i = 1; i < 3; i++) assert.ok(r.ferestre[i].de > r.ferestre[i - 1].pana, 'ferestrele de test nu se ating');
  for (const id of ['boost', 'forest', 'svm', 'vote']) { assert.ok(r.algos[id].p >= 0 && r.algos[id].p <= 1); assert.equal(r.algos[id].consistent, false); }
  for (const s of Object.keys(serii)) { const v = r.curent[s].vote; assert.equal(v.support.length, 3); assert.ok(Math.abs(v.support.reduce((a, b) => a + b, 0) - 1) < 1e-9); }
  assert.ok(r.ferestre.every((f) => f.zileSeparate >= 15), 'zilele separate (o dovadă pe zi)');
});
test('I-641: control pozitiv — pe serii care se pot ghici (sinusoidele demo, faze diferite) modelul comun găsește avantajul', () => {
  const c = motor('.'), serii = {}; for (let i = 0; i < 10; i++) serii['D' + i] = { bars: c.HoldingsNeural.demoBars(i, now) };
  const r = univers(c, serii, { now });
  assert.equal(r.state, 'research'); assert.equal(r.algos.vote.wins, 3); assert.equal(r.algos.vote.holmPass, true);
});
