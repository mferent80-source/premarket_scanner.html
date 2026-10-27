// 27.10.2026 (lotul A, I-748 + auditul A [7], [8]): „un singur aparat citește Trading 212” se poate verifica. Fiecare citire reușită notează
// aparatul în cheia sincronizată tt_t212_cititori_v1 ({aparat: {la, env}}, cel mult o scriere la 2 min); dacă două aparate au citit același mediu
// în ultimele 5 minute, Setările și Health spun „doi cititori”. Un ceas decalat cu până la 15 minute nu mai face din celălalt aparat un cititor tăcut.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { validateValue } from '../lib/cloud-sync-model.mjs';

function load(extra = {}) { const ctx = { Date, JSON, Number, Math, Object, String, Array, ...extra }; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(readFileSync('lib/t212-reader.js', 'utf8'), ctx); return ctx.TTT212Reader; }
function store(init = {}) { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m }; }
const NOW = Date.parse('2026-10-27T12:00:00Z'), MIN = 60000;

test('[7] un ceas decalat cu 6–15 minute nu mai blochează preluarea și nici nu face citirea celuilalt „din viitor”', () => {
  const R = load();
  const d = R.decide({ reader: false, latestAt: NOW + 10 * MIN, ownAt: 0, now: NOW, wokeAt: NOW - 10 * MIN, visible: false });
  assert.equal(d.otherAt, NOW + 10 * MIN, 'citirea celuilalt aparat (ceasul lui e cu 10 min înainte) e recunoscută');
  assert.equal(d.read, false, 'celălalt aparat citește ⇒ acesta nu mai citește și el');
  assert.equal(R.decide({ reader: false, latestAt: NOW + 2 * 3600e3, ownAt: 0, now: NOW, wokeAt: NOW - 10 * MIN }).read, true, 'peste 15 min în viitor rămâne „ceas greșit” ⇒ preluare');
});

test('aparatul are un nume stabil pe acest dispozitiv (telefon / PC + sufix), nesincronizat', () => {
  const R = load({ navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile' } }), s = store();
  const a = R.aparat(s); assert.match(a, /^telefon-[0-9a-z]{6}$/); assert.equal(R.aparat(s), a, 'același nume la a doua citire');
  assert.match(load({ navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0)' } }).aparat(store()), /^PC-[0-9a-z]{6}$/);
});

test('fiecare citire reușită notează aparatul în tt_t212_cititori_v1 (forma validată de sincronizare), cel mult o dată la 2 minute', () => {
  const R = load(), s = store({ tt_aparat_v1: 'PC-abc123' });
  R.markOwn(s, 'live', NOW);
  const v = JSON.parse(s.getItem('tt_t212_cititori_v1'));
  assert.deepEqual(v, { 'PC-abc123': { la: new Date(NOW).toISOString(), env: 'live' } });
  assert.equal(validateValue('tt_t212_cititori_v1', v), true);
  R.markOwn(s, 'live', NOW + 60000); assert.equal(JSON.parse(s.getItem('tt_t212_cititori_v1'))['PC-abc123'].la, new Date(NOW).toISOString(), 'la 1 min nu se rescrie (fără o scriere în cont la fiecare citire)');
  R.markOwn(s, 'live', NOW + 2 * MIN + 1); assert.equal(JSON.parse(s.getItem('tt_t212_cititori_v1'))['PC-abc123'].la, new Date(NOW + 2 * MIN + 1).toISOString());
  assert.equal(R.own(s, 'live'), NOW + 2 * MIN + 1, 'citirea proprie (I-713) se ține ca înainte');
  // aparatele tăcute de peste 30 de zile ies; cel mult 20 de aparate
  const vechi = {}; for (let i = 0; i < 25; i++) vechi['x' + i] = { la: new Date(NOW - (i < 3 ? 40 : 1) * 86400000).toISOString(), env: 'live' };
  const t = store({ tt_aparat_v1: 'PC-abc123', tt_t212_cititori_v1: JSON.stringify(vechi) }); R.markOwn(t, 'live', NOW);
  const dupa = JSON.parse(t.getItem('tt_t212_cititori_v1')); assert.ok(Object.keys(dupa).length <= 20); assert.ok(!dupa.x0 && dupa['PC-abc123']); assert.equal(validateValue('tt_t212_cititori_v1', dupa), true);
});

test('doi cititori: două aparate au citit ACELAȘI mediu în ultimele 5 minute ⇒ avertismentul, cu aparatele și vechimea; altfel nimic', () => {
  const R = load();
  const s = store({ tt_aparat_v1: 'PC-abc123', tt_t212_cititori_v1: JSON.stringify({ 'PC-abc123': { la: new Date(NOW - MIN).toISOString(), env: 'live' }, 'telefon-def456': { la: new Date(NOW - 3 * MIN).toISOString(), env: 'live' }, 'telefon-demo01': { la: new Date(NOW - MIN).toISOString(), env: 'demo' } }) });
  const d = R.doiCititori(s, 'live', NOW);
  assert.ok(d); assert.deepEqual(d.aparate.map((x) => x.aparat), ['PC-abc123', 'telefon-def456']); assert.equal(d.aparate[0].eu, true);
  assert.match(d.text, /Două aparate citesc Trading 212: PC-abc123 \(acesta, acum 1 min\) și telefon-def456 \(acum 3 min\)/);
  assert.match(d.text, /debifează „Acest aparat citește Trading 212” pe unul dintre ele/);
  assert.equal(R.doiCititori(s, 'live', NOW + 10 * MIN), null, 'după 5 minute fără citiri ale celuilalt aparat, nimic');
  assert.equal(R.doiCititori(store(), 'live', NOW), null);
  assert.equal(R.doiCititori(store({ tt_t212_cititori_v1: '{stricat' }), 'live', NOW), null);
});

test('Setările arată avertismentul „doi cititori” lângă bifa cititorului', () => {
  const html = readFileSync('app/settings/index.html', 'utf8'), js = readFileSync('app/workspace.js', 'utf8');
  assert.match(html, /id="t212Readers"/); assert.match(js, /doiCititori/);
});
