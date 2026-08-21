// data-inflight.test.mjs — inflight hung peste noapte nu are voie să blocheze poll-ul de dimineață.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ls = new Map();
globalThis.localStorage = {
  getItem: k => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => { ls.set(k, String(v)); },
  removeItem: k => { ls.delete(k); },
  get length() { return ls.size; },
  key: i => [...ls.keys()][i]
};
new Function(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'data.js'), 'utf8'))();
const D = globalThis.D;

test('D.inflightFresh: o promisiune mai veche decât maxAge e moartă', () => {
  assert.equal(typeof D.inflightFresh, 'function');
  assert.equal(D.inflightFresh({ p: Promise.resolve(1), t: 1000 }, 2000, 5000), true);
  assert.equal(D.inflightFresh({ p: Promise.resolve(1), t: 1000 }, 20000, 5000), false);
  assert.equal(D.inflightFresh(null, 2000, 5000), false);
});

test('D.dropInflight există ca resume-ul de dimineață să poată rupe așteptarea', () => {
  assert.equal(typeof D.dropInflight, 'function');
  D.dropInflight();
});
