// 19.10.2026 (I-713 / punctul 6) — istoricul tezelor (cheia sincronizată tt_holdings_theses_v1) avea creștere fără limită.
// Plafon: ultimele 50 de versiuni întregi; din cele mai vechi rămân doar reperele (stop / țintă) la fiecare schimbare, ca să nu se
// piardă istoricul stopurilor citit de StopSetter.istoric (Raportul din Jurnal), StopSetter.stopLa (Astăzi) și traseul deciziei.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const c = { Date, JSON, Math, Number, String, Array, Object, Intl }; c.window = c; vm.createContext(c);
for (const f of ['lib/holdings-notes.js', 'lib/stop-setter.js']) vm.runInContext(readFileSync(f, 'utf8'), c, { filename: f });
const N = c.HoldingsNotes, S = c.StopSetter, T0 = Date.parse('2026-01-05T10:00:00Z'), at = (i) => new Date(T0 + i * 3600000).toISOString();

function scrie(n) {
  let t = {}; const repere = [];
  for (let i = 0; i < n; i++) {
    const patch = { text: 'teza v' + i };
    if (i === 10) Object.assign(patch, { stop: 90, stopCurrency: 'USD' });
    if (i === 30) Object.assign(patch, { targetPrice: 140, targetCurrency: 'USD' });
    if (i === 60) patch.stop = '95';
    if (i === 70) patch.stop = '';
    if (i === 75) patch.stop = 97;
    t = N.change(t, patch, at(i)); repere.push({ at: at(i), stop: t.stop, targetPrice: t.targetPrice });
  }
  return { t, repere };
}
const stareLa = (hist, ms) => { const h = hist.filter((x) => Date.parse(x.at) <= ms).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1); return h ? { stop: Number(h.stop) > 0 ? Number(h.stop) : null, tinta: Number(h.targetPrice) > 0 ? Number(h.targetPrice) : null } : null; };

test('istoricul tezei are plafon: ultimele 50 de versiuni întregi + reperele de stop / țintă din urmă', () => {
  const { t } = scrie(200);
  assert.ok(t.history.length <= 50 + 6, 'plafon: ' + t.history.length + ' versiuni păstrate');
  assert.equal(t.history.at(-1).text, 'teza v199'); assert.equal(t.history.length - t.history.filter((h) => h.compact).length, 50);
  assert.ok(t.history.filter((h) => h.compact).every((h) => !('text' in h) || h.text === undefined), 'reperele vechi nu mai poartă textul');
  assert.equal(t.initialText, 'teza v0', 'motivul inițial rămâne');
});

test('plafonul NU pierde istoricul stopurilor: StopSetter.istoric, stopLa și starea la orice moment rămân aceleași', () => {
  const { t, repere } = scrie(200), mic = scrie(40).t; // sub plafon: nimic compactat
  assert.equal(mic.history.length, 40);
  assert.deepEqual(JSON.parse(JSON.stringify(S.istoric({ 'A|X': t }, 'A'))), { X: [{ at: Date.parse(at(10)), stop: 90, tinta: null }, { at: Date.parse(at(60)), stop: 95, tinta: 140 }, { at: Date.parse(at(75)), stop: 97, tinta: 140 }] });
  assert.equal(S.stopLa(t), Date.parse(at(75)));
  for (let i = 0; i < 200; i += 7) { const r = repere[i]; assert.deepEqual(stareLa(t.history, Date.parse(at(i)) + 1000), { stop: Number(r.stop) > 0 ? Number(r.stop) : null, tinta: Number(r.targetPrice) > 0 ? Number(r.targetPrice) : null }, 'starea la versiunea ' + i); }
  // stopul unei poziții deschise DUPĂ ultimul stop nu e valid nici după compactare (revizia 18.10)
  assert.equal(S.stopuriValide({ 'A|X': t }, 'A', [{ ticker: 'X', openedAt: at(300) }]).size, 0);
  assert.equal(S.stopuriValide({ 'A|X': t }, 'A', [{ ticker: 'X', openedAt: at(74) }]).size, 1);
});

test('compactarea e stabilă: o teză deja compactată rămâne la plafon la salvările următoare', () => {
  let { t } = scrie(200);
  for (let i = 200; i < 260; i++) t = N.change(t, { text: 'teza v' + i }, at(i));
  assert.ok(t.history.length <= 56); assert.equal(S.stopLa(t), Date.parse(at(75)));
});
