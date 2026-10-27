// 27.10.2026 (audit C 🟡): formularul „Execuție nouă” din Jurnal punea closeTs = ziua aleasă la 16:00 local; cu data implicită (azi) asta era
// „în viitor” toată dimineața, iar JR.validateEntry respingea orice execuție manuală nouă („Dată invalidă sau în viitor: closeTs”) — și pe cele
// încă deschise, care nu au ce căuta cu closeTs. Acum: cel mult „acum”, iar execuția deschisă n-are closeTs.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function JR() {
  const store = new Map();
  const c = { console, Date, Math, JSON, Intl, Number, String, Array, Object, localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
  c.window = c; vm.createContext(c); vm.runInContext(readFileSync('lib/journal.js', 'utf8'), c);
  return c.JR;
}
const J = JR(), NOW = new Date('2026-10-27T11:00:00').getTime(), azi = '2026-10-27';

test('execuție închisă azi, înainte de 16:00 ⇒ closeTs = acum (nu 16:00, care ar fi în viitor); validateEntry o acceptă', () => {
  const ts = J.closeTsDin(azi, false, NOW); assert.equal(ts, NOW);
  assert.equal(J.validateEntry({ sym: 'MU', dir: 'long', entry: 100, exit: 105, size: 1, closeTs: ts }).ok, true);
  const vechi = J.closeTsDin(azi, false, new Date('2026-10-27T18:30:00').getTime()); assert.equal(vechi, new Date('2026-10-27T16:00:00').getTime(), 'după 16:00 rămâne 16:00');
});
test('zi din trecut ⇒ 16:00 a zilei aceleia; fără dată ⇒ acum; execuție deschisă ⇒ fără closeTs', () => {
  assert.equal(J.closeTsDin('2026-10-20', false, NOW), new Date('2026-10-20T16:00:00').getTime());
  assert.equal(J.closeTsDin('', false, NOW), NOW);
  assert.equal(J.closeTsDin(azi, true, NOW), null);
  assert.equal(J.closeTsDin('nu-e-data', false, NOW), NOW, 'dată ilizibilă ⇒ acum, nu NaN');
});
test('pagina Jurnal folosește JR.closeTsDin la salvare (nu mai calculează 16:00 fix)', () => {
  const html = readFileSync('journal/index.html', 'utf8');
  assert.match(html, /JR\.closeTsDin\(\$\('fDate'\)\.value, \$\('fExit'\)\.value === ''\)/);
});
