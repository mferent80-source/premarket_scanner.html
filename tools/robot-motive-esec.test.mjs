// 28.10.2026 (revizia F4, lotul F): roboții V1 / Top Long picau cu „Nicio acțiune verificată azi (85 eșecuri)” și nimic mai mult — 5 din 7
// sesiuni pierdute (20–23.10, 26–27.10) fără să se știe de ce (DATE STALE la 00:07–00:48 UTC? 429? altceva?). Acum mesajul de eroare
// (și, prin el, jurnalul rulării și alarma Discord) spune motivele, grupate, cu numărul lor. Textul robotului intră doar în `d` (dependențele
// notate pe zi), nu în versiunea probei — nimic nu repornește.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rezumatEsecuri } from './v1-jurnal.mjs';

test('rezumatul eșecurilor: motivele grupate, cele mai dese întâi, cu numărul lor; textul lung se taie; fără motive ⇒ text cinstit', () => {
  const f = [];
  for (let i = 0; i < 80; i++) f.push({ symbol: 'S' + i, reason: 'DATE STALE: 2026-10-24; sesiune așteptată 2026-10-27. Verifică disponibilitatea sursei și calendarul pieței.' });
  for (let i = 0; i < 4; i++) f.push({ symbol: 'T' + i, reason: 'Yahoo 429' });
  f.push({ symbol: 'U', reason: 'Yahoo: serie goală pentru U' });
  const r = rezumatEsecuri(f);
  assert.match(r, /^DATE STALE: 2026-10-24; sesiune așteptată 2026-10-27/); assert.match(r, /×80/); assert.match(r, /Yahoo 429 ×4/);
  assert.ok(r.indexOf('×80') < r.indexOf('×4'), 'cele mai dese întâi');
  assert.ok(!r.includes('calendarul pieței'), 'motivul lung e tăiat');
  assert.equal(rezumatEsecuri([]), 'fără motive raportate');
  assert.equal(rezumatEsecuri([{ symbol: 'A' }, { reason: '' }, null]), 'fără motive raportate');
  assert.match(rezumatEsecuri(Array.from({ length: 6 }, (_, i) => ({ reason: 'motiv ' + i }))), / · încă 3 motive$/, 'peste 3 motive distincte: „încă N motive”');
});

test('ambii roboți spun motivele când nicio acțiune nu e verificată (V1 din report.failures, Top Long din state.failures)', () => {
  const v1 = readFileSync('tools/v1-jurnal.mjs', 'utf8'), tl = readFileSync('tools/premarket-jurnal.mjs', 'utf8');
  assert.match(v1, /Nicio acțiune verificată azi \(' \+ report\.failures\.length \+ ' eșecuri: ' \+ rezumatEsecuri\(report\.failures\) \+ '\)/);
  assert.match(tl, /Nicio acțiune verificată azi \(' \+ s\.failures\.length \+ ' eșecuri: ' \+ rezumatEsecuri\(s\.failures\) \+ '\)/);
  assert.match(tl, /import \{ fetchStock, serii, rezumatEsecuri \} from '\.\/v1-jurnal\.mjs'/);
});
