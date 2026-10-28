// 28.10.2026 (revizia F4, 🔵7): bilanțul Trend avea filtrul barelor copiat din robotul zilnic (`[o, h, l, c].every(v > 0)`), în afara oricărei
// amprente și fără `d` — o schimbare acolo ar fi mutat cifrele bilanțului fără urmă. Acum cheamă `baraTrend` din bibliotecă (același filtru,
// mutat neschimbat); amprenta judecătorului `jt-` nu se schimbă (acoperă funcțiile bibliotecii, nu robotul).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { baraTrend, amprentaJudecatorTrend } from './trend-12-1-lib.mjs';

test('bilanțul filtrează barele prin `baraTrend`, nu printr-o copie; judecătorul rămâne cel scris în protocol', () => {
  const b = readFileSync('tools/trend-12-1-bilant.mjs', 'utf8');
  assert.match(b, /if \(baraTrend\(q\.open\[k\], q\.high\[k\], q\.low\[k\], q\.close\[k\]\)\)/);
  assert.doesNotMatch(b, /\[q\.open\[k\], q\.high\[k\], q\.low\[k\], q\.close\[k\]\]\.every/, 'copia veche a dispărut');
  assert.equal(baraTrend(1, 2, 0.5, 1.5), true); assert.equal(baraTrend(0, 2, 0.5, 1.5), false); assert.equal(baraTrend(1, 2, null, 1.5), false);
  const doc = readFileSync('docs/trend-12-1-protocol.md', 'utf8');
  assert.ok(doc.includes(amprentaJudecatorTrend()), 'amprenta judecătorului de acum e cea din protocol (schimbarea din bilanț n-o atinge)');
});
