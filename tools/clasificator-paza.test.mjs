import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, BOT } from './clasificator-paza.mjs';

const dupa = Date.parse('2026-10-16T12:00:00Z');
test('I-667: câinele de pază pornește robotul o singură dată pe sesiune, doar când lipsește și nimic nu rulează', () => {
  assert.equal(decide({ asOf: '2026-10-16', asteptata: '2026-10-16', dupa }), 'ok');
  assert.equal(decide({ asOf: '2026-10-15', asteptata: '2026-10-16', dupa, rulari: [{ status: 'completed', event: 'schedule', conclusion: 'failure', created_at: '2026-10-17T01:20:05Z' }] }), 'porneste');
  assert.equal(decide({ asOf: '2026-10-15', asteptata: '2026-10-16', dupa, rulari: [{ status: 'in_progress', event: 'workflow_dispatch', created_at: '2026-10-17T05:11:10Z' }] }), 'ruleaza');
  const a = { status: 'completed', event: 'workflow_dispatch', conclusion: 'failure', created_at: '2026-10-17T05:11:10Z', triggering_actor: { login: BOT } };
  assert.equal(decide({ asOf: '2026-10-15', asteptata: '2026-10-16', dupa, rulari: [a] }), 'deja');
  // O pornire manuală (de om) sau a câinelui pentru sesiunea de ieri nu blochează pornirea de azi.
  assert.equal(decide({ asOf: '2026-10-15', asteptata: '2026-10-16', dupa, rulari: [{ ...a, triggering_actor: { login: 'mferent80-source' } }, { ...a, created_at: '2026-10-16T05:10:00Z' }] }), 'porneste');
});
