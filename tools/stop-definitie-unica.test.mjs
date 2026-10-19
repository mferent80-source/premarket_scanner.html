// 19.10.2026 (punctul 5) — o singură definiție „are stop” peste tot: StopSetter.stopValabil (stopul pus / schimbat DUPĂ deschiderea
// poziției de acum, revizia 18.10). Înainte: Astăzi o folosea, dar Portofoliul (HoldingsPulse, HoldingsIntelligence) și Risc & capital
// (T212Capital) socoteau orice stop din teză, inclusiv al unei poziții VÂNDUTE. Plus riscul până la stop pe acțiunile în altă monedă
// decât contul: cu cursul implicit valoare / (cantitate × preț), ca în Risc & capital (înainte erau excluse în Portofoliu).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const NOW = Date.parse('2026-10-19T14:00:00Z');
function ctx(files) { const c = { Date, JSON, Math, Number, String, Array, Object, Intl, Set, Map }; c.window = c; vm.createContext(c); for (const f of files) vm.runInContext(readFileSync(f, 'utf8'), c, { filename: f }); return c; }
const tot = () => ctx(['lib/holdings-notes.js', 'lib/stop-setter.js', 'lib/holdings-pulse.js', 'lib/holdings-intelligence.js', 'lib/trading212-capital.js']);
const tezaVanduta = { stop: 90, stopCurrency: 'USD', updatedAt: '2026-01-10T10:00:00Z', history: [{ at: '2026-01-10T10:00:00Z', stop: 90, stopCurrency: 'USD' }] };
const tezaNoua = { stop: 90, stopCurrency: 'USD', updatedAt: '2026-10-15T10:00:00Z', history: [{ at: '2026-10-15T10:00:00Z', stop: 90, stopCurrency: 'USD' }] };
const poz = { ticker: 'MU_US_EQ', quantity: 4, currentPrice: 100, averagePrice: 95, instrumentCurrency: 'USD', currency: 'EUR', value: 340, openedAt: '2026-10-14T15:00:00Z' };
const snap = (positions) => ({ environment: 'live', fetchedAt: new Date(NOW - 60000).toISOString(), summary: { currency: 'EUR', totalValue: 10000, available: 9660, reserved: 0, invested: 340 }, positions });

test('stopul rămas de la o poziție VÂNDUTĂ nu mai contează nici în Portofoliu, nici în Risc & capital', () => {
  const c = tot();
  assert.equal(c.StopSetter.stopValabil(tezaVanduta, poz), false);
  assert.equal(c.HoldingsPulse.stop(poz, tezaVanduta, null, { at: new Date(NOW - 60000).toISOString(), now: NOW }).state, 'missing');
  assert.match(c.HoldingsPulse.stop(poz, tezaVanduta, null, { at: new Date(NOW - 60000).toISOString(), now: NOW }).reason, /poziți[ea] anterioar/);
  assert.equal(c.HoldingsIntelligence.risk([poz], 10000, 'EUR', {}, { MU_US_EQ: tezaVanduta }, NOW).stopCoverage, 0);
  const r = c.T212Capital.build({ scope: 'A', snapshot: snap([poz]), notes: { 'A|MU_US_EQ': tezaVanduta }, now: NOW });
  assert.equal(r.stopCoverage, 0); assert.equal(r.rows[0].stop, null);
});

test('stopul pus DUPĂ deschidere contează la fel în toate trei; poziția fără openedAt (copie veche) păstrează stopul', () => {
  const c = tot(), at = new Date(NOW - 60000).toISOString();
  assert.equal(c.StopSetter.stopValabil(tezaNoua, poz), true);
  assert.equal(c.HoldingsPulse.stop(poz, tezaNoua, null, { at, now: NOW }).state, 'safe');
  assert.equal(c.HoldingsIntelligence.risk([poz], 10000, 'EUR', {}, { MU_US_EQ: tezaNoua }, NOW).stopCoverage, 1);
  assert.equal(c.T212Capital.build({ scope: 'A', snapshot: snap([poz]), notes: { 'A|MU_US_EQ': tezaNoua }, now: NOW }).stopCoverage, 1);
  const vechi = { ...poz, openedAt: undefined };
  assert.equal(c.StopSetter.stopValabil(tezaVanduta, vechi), true);
  assert.equal(c.T212Capital.build({ scope: 'A', snapshot: snap([vechi]), notes: { 'A|MU_US_EQ': tezaVanduta }, now: NOW }).stopCoverage, 1);
});

test('Risc & capital fără StopSetter încărcat (desk, aplicația) dă exact aceeași definiție', () => {
  const singur = ctx(['lib/trading212-capital.js']), c = tot();
  const cazuri = [];
  for (const opened of [undefined, 'nu-e-data', '2026-01-01T00:00:00Z', '2026-10-14T15:00:00Z', '2026-10-15T10:30:00Z', '2026-10-15T11:30:00Z'])
    for (const t of [null, {}, { stop: 0 }, { stop: '90' }, { stop: 90, updatedAt: '2026-10-15T10:00:00Z' }, tezaVanduta, tezaNoua, { ...tezaNoua, history: [...tezaVanduta.history, { at: '2026-10-15T10:00:00Z', stop: 90 }] }, { ...tezaNoua, history: [...tezaVanduta.history, { at: '2026-10-15T10:00:00Z', stop: 91 }] }, { stop: 90, history: [{ at: 'x', stop: 90 }] }])
      cazuri.push([t, { ticker: 'X', openedAt: opened }]);
  for (const [t, p] of cazuri) { assert.equal(singur.T212Capital.stopValabil(t, p), c.StopSetter.stopValabil(t, p), JSON.stringify([t, p])); assert.equal(c.T212Capital.stopValabil(t, p), c.StopSetter.stopValabil(t, p)); }
});

test('riscul până la stop pe o acțiune în USD într-un cont în EUR intră cu cursul implicit, ca în Risc & capital', () => {
  const c = tot(), r = c.HoldingsIntelligence.risk([poz], 10000, 'EUR', {}, { MU_US_EQ: tezaNoua }, NOW), k = c.T212Capital.build({ scope: 'A', snapshot: snap([poz]), notes: { 'A|MU_US_EQ': tezaNoua }, now: NOW });
  const asteptat = (100 - 90) * 4 * (340 / (4 * 100));
  assert.ok(Math.abs(r.knownStopRisk - asteptat) < 1e-9, 'Portofoliu: ' + r.knownStopRisk);
  assert.ok(Math.abs(k.rows[0].stopRisk - asteptat) < 1e-9, 'Risc & capital: ' + k.rows[0].stopRisk);
  assert.equal(r.rows[0].implicitFX, true);
  const fara = c.HoldingsIntelligence.risk([{ ...poz, value: null }], 10000, 'EUR', {}, { MU_US_EQ: tezaNoua }, NOW);
  assert.equal(fara.stopCoverage, 0, 'fără valoarea poziției în moneda contului cursul nu se poate verifica');
});

test('Portofoliul încarcă lib/stop-setter.js, deci HoldingsPulse / HoldingsIntelligence folosesc definiția comună acolo', () => {
  const html = readFileSync('holdings/index.html', 'utf8');
  assert.match(html, /<script src="\.\.\/lib\/stop-setter\.js\?v=[^"]+"><\/script>/);
  assert.match(readFileSync('broker/index.html', 'utf8'), /lib\/stop-setter\.js/, 'pagina contului (HoldingsPulse) îl are deja');
});
