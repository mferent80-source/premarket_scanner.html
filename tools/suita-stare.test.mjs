// 20.10.2026 (I-724): citirea jurnalelor suitei (node:test + unittest) pentru health/generated/suita.json — verde doar când ambele au rulat și n-au picat.
import test from 'node:test';
import assert from 'node:assert/strict';
import { citesteNode, citestePython, stare } from './suita-stare.mjs';

const NODE_VERDE = ['✔ ceva trece (1.2ms)', 'ℹ tests 2442', 'ℹ suites 0', 'ℹ pass 2440', 'ℹ fail 0', 'ℹ cancelled 0', 'ℹ skipped 2', 'ℹ todo 0', 'ℹ duration_ms 81671.0125'].join('\n');
const NODE_ROSU = ['✖ Drafturi folosește același tabel (3.8ms)', 'ℹ tests 13', 'ℹ suites 0', 'ℹ pass 12', 'ℹ fail 1', 'ℹ cancelled 0', 'ℹ skipped 0', 'ℹ todo 0', 'ℹ duration_ms 120.5', '', '✖ failing tests:', '', 'test at tools/x.test.mjs:30:1', '✖ Drafturi folosește același tabel (3.8ms)', '  AssertionError: nu', '✖ al doilea test picat (0.4ms)'].join('\n');
const PY_OK = 'Ran 9 tests in 0.321s\n\nOK\n', PY_ROSU = 'FAIL: test_x (tools.test_y.T)\n...\nRan 9 tests in 0.4s\n\nFAILED (failures=1, errors=1)\n';

test('jurnalul node verde: cifrele citite, niciun test picat, ok', () => {
  const n = citesteNode(NODE_VERDE, 'success');
  assert.deepEqual({ ...n }, { rulat: true, tests: 2442, pass: 2440, fail: 0, skipped: 2, durataMs: 81671.0125, picate: [], ok: true });
});
test('jurnalul node roșu: testele picate după „✖ failing tests:”, fără dubluri, fără durata din paranteză; ok false', () => {
  const n = citesteNode(NODE_ROSU, 'failure');
  assert.equal(n.fail, 1); assert.equal(n.ok, false);
  assert.deepEqual(n.picate, ['Drafturi folosește același tabel', 'al doilea test picat']);
});
test('jurnal gol sau întrerupt (fără rezumat): verde doar dacă pasul a reușit; altfel roșu', () => {
  assert.equal(citesteNode('', 'success').ok, true); assert.equal(citesteNode('', 'failure').ok, false); assert.equal(citesteNode('', null).ok, false);
  assert.equal(citesteNode(NODE_VERDE, 'failure').ok, false, 'pasul picat (ex. crash după rezumat) nu e verde');
});
test('unittest: Ran N + OK ⇒ ok; FAILED ⇒ detaliul; fără „Ran” ⇒ după outcome', () => {
  assert.deepEqual(citestePython(PY_OK, 'success'), { rulat: true, tests: 9, ok: true, detaliu: null });
  const r = citestePython(PY_ROSU, 'failure'); assert.equal(r.ok, false); assert.equal(r.detaliu, 'failures=1, errors=1');
  assert.equal(citestePython('', 'failure').ok, false);
});
test('starea întreagă: verde doar cu ambele ok; commit, rularea și ora', () => {
  const s = stare({ nodeLog: NODE_VERDE, pythonLog: PY_OK, nodeOutcome: 'success', pythonOutcome: 'success', commit: 'abc123', run: 'https://x/run/1', now: Date.parse('2026-10-20T08:00:00Z') });
  assert.equal(s.version, 'suita-v1'); assert.equal(s.verde, true); assert.equal(s.commit, 'abc123'); assert.equal(s.la, '2026-10-20T08:00:00.000Z');
  assert.equal(stare({ nodeLog: NODE_VERDE, pythonLog: PY_ROSU, nodeOutcome: 'success', pythonOutcome: 'failure' }).verde, false);
  assert.equal(stare({ nodeLog: NODE_ROSU, pythonLog: PY_OK, nodeOutcome: 'failure', pythonOutcome: 'success' }).verde, false);
});
