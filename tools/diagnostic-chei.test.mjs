// 27.10.2026 (lotul A, auditul A [22]): diagnosticul JSON (lib/operational-checks.js) și explicarea erorii (app/failure-info.js) cunosc TOATE cheile
// sincronizate (KEYS din lib/cloud-sync-model.mjs): pachetele execuțiilor și ale registrului de învățare, cheia Radarului și cheile noi din 27.10.
// Înainte, o eroare pe un pachet de execuții devenea `synchronizationFailure: null` — exact cheile adăugate pe 18–19.10 lipseau.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { KEYS } from '../lib/cloud-sync-model.mjs';

const NOW = Date.parse('2026-10-27T10:00:00Z');
const c = { Date, Uint8Array, setTimeout, clearTimeout, crypto: webcrypto }; vm.createContext(c);
vm.runInContext(readFileSync('app/failure-info.js', 'utf8'), c); vm.runInContext(readFileSync('lib/operational-checks.js', 'utf8'), c);
const F = c.TTCloudFailure, O = c.TTOperationalChecks;
const cloud = (key) => ({ connected: true, ready: true, lastSync: NOW - 1000, conflicts: [], error: 'invalid_value', failure: { code: 'invalid_value', operation: 'write-record', key, httpStatus: 400, at: NOW - 100 }, trading212: { cloud: true } });

test('fiecare cheie sincronizată are nume în explicarea erorii și ajunge în diagnosticul JSON', () => {
  const lipsa = [], fara = [];
  for (const key of KEYS) {
    if (!F.sanitize({ code: 'invalid_value', operation: 'write-record', key, httpStatus: 400, at: NOW - 100 }, NOW)) lipsa.push(key);
    const r = O.report({ cloud: cloud(key), now: NOW });
    if (!r.synchronizationFailure || r.synchronizationFailure.key !== key) fara.push(key);
  }
  assert.deepEqual(lipsa, [], 'failure-info nu cunoaște');
  assert.deepEqual(fara, [], 'diagnosticul pierde');
  assert.match(F.label('tt_trading212_orders_pending_v1'), /Ordinele în așteptare/);
  assert.match(F.label('tt_governor_oprire_v1'), /Oprirea de urgență/);
});

test('o cheie necunoscută rămâne afară din diagnostic (lista albă se păstrează)', () => {
  assert.equal(F.sanitize({ code: 'invalid_value', operation: 'sync', key: 'cheie_straina', httpStatus: null, at: NOW - 100 }, NOW), null);
  assert.equal(O.report({ cloud: cloud('cheie_straina'), now: NOW }).synchronizationFailure, null);
});
