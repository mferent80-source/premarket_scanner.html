// Teste pentru lib/toast-stack.js — cap stivă + digest + hover-pause.
// Rulează: node --test tools/alerts-toast-stack.test.mjs
import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const TS = require('../lib/toast-stack.js');

test('plan: sub plafon nu scoate nimic', () => {
  const p = TS.plan(1, 3);
  assert.equal(p.removeOldest, 0);
  assert.equal(p.visibleAfter, 2);
});

test('plan: la al 4-lea toast scoate cel mai vechi', () => {
  const p = TS.plan(3, 3);
  assert.equal(p.removeOldest, 1);
  assert.equal(p.visibleAfter, 3);
  assert.equal(p.showDismissAll, true);
});

test('digestInstead: 1-2 rămân individuale, 3+ devin un singur toast', () => {
  assert.equal(TS.digestInstead(1), false);
  assert.equal(TS.digestInstead(2), false);
  assert.equal(TS.digestInstead(3), true);
  assert.equal(TS.digestInstead(10), true);
});

test('pauseOnHover: doar pointer fin (mouse), nu touch', () => {
  assert.equal(TS.pauseOnHover(true), true);
  assert.equal(TS.pauseOnHover(false), false);
});
