// 19.10.2026 — audit Long & Reversal: robotul probei Top Long evalua acțiunile pe seriile de 1 an ale motorului ⇒ peste un an
// primele perioade ar fi ieșit din fereastră. Acum toate simbolurile din jurnal (acțiuni + repere) se reiau pe un interval care
// acoperă prima zi a jurnalului; fluxul are a doua încercare și anunț pe Discord.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {intervalPentru, simboluriDeReluat} from './premarket-jurnal.mjs';

test('intervalul acoperă prima zi a jurnalului + orizontul', () => {
  assert.equal(intervalPentru('2026-10-16', '2026-10-19'), '2y');
  assert.equal(intervalPentru('2026-10-16', '2028-06-01'), '2y', 'la 20 de luni, 2 ani încă acoperă prima zi');
  assert.equal(intervalPentru('2026-10-16', '2028-12-01'), '5y', 'după ~2 ani nu mai ajung 2 ani');
  assert.equal(intervalPentru('2026-10-16', '2031-12-01'), '10y');
});
test('se reiau acțiunile ȘI reperele din toate zilele, plus SPY, fără dubluri', () => {
  const jurnal = {zile: [{zi: '2026-10-16', r: [['AAPL', 'm', 80, '2026-10-16', 'SPY', ''], ['SAP.DE', 'n', 40, '2026-10-16', '^STOXX', 'r']]}, {zi: '2026-10-19', r: [['AAPL', 'n', 50, '2026-10-19', 'IVV', '']]}]};
  assert.deepEqual(simboluriDeReluat(jurnal).sort(), ['AAPL', 'IVV', 'SAP.DE', 'SPY', '^STOXX'].sort());
});
test('fluxul: a doua încercare și anunț pe Discord când pică de două ori', () => {
  const y = readFileSync(new URL('../.github/workflows/v1-proba.yml', import.meta.url), 'utf8');
  assert.match(y, /node tools\/premarket-jurnal\.mjs \|\| \(sleep 180 && node tools\/premarket-jurnal\.mjs\)/);
  assert.match(y, /if: steps\.premarket\.outcome == 'failure'/);
  assert.match(y, /DISCORD_WEBHOOK: \$\{\{ secrets\.DISCORD_WEBHOOK \}\}/);
});
test('amprenta dependențelor: notată pe zi, separată de versiune; istoricul arată schimbările', async () => {
  const {amprentaDependinte, istoricDependinte, versiune} = await import('../lib/premarket-proba.mjs');
  const {motor} = await import('./premarket-jurnal.mjs');
  const h = motor().hooks, citeste = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  const d1 = amprentaDependinte(citeste, h);
  assert.match(d1, /^dep-[0-9a-f]{12}$/);
  assert.notEqual(amprentaDependinte((f) => citeste(f) + (f === 'lib/indicators.js' ? '\n// schimbat' : ''), h), d1, 'o schimbare în indicatori se vede');
  assert.equal(versiune(h), 'pm-cb956aef5680', 'versiunea probei rămâne aceeași (proba nu repornește)');
  const ist = istoricDependinte({zile: [{zi: '2026-10-16', v: 'pm-x'}, {zi: '2026-10-19', v: 'pm-x', d: 'dep-a'}, {zi: '2026-10-20', v: 'pm-x', d: 'dep-a'}, {zi: '2026-10-21', v: 'pm-x', d: 'dep-b'}]}, 'pm-x');
  assert.deepEqual(ist.map((x) => [x.de, x.pana, x.d]), [['2026-10-16', '2026-10-16', null], ['2026-10-19', '2026-10-20', 'dep-a'], ['2026-10-21', '2026-10-21', 'dep-b']]);
});
