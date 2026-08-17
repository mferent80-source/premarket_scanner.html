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

test('maxVisible: 1 pe mobil, 3 pe desktop', () => {
  assert.equal(TS.maxVisible(true), 1);
  assert.equal(TS.maxVisible(false), 3);
});

test('digestInstead pe mobil: 2+ devin un banner', () => {
  assert.equal(TS.digestInstead(1, true), false);
  assert.equal(TS.digestInstead(2, true), true);
  assert.equal(TS.digestInstead(10, true), true);
});

const NOW = Date.parse('2026-08-17T15:00:00+03:00');

test('alreadyShownToday: gol → nu e duplicat', () => {
  assert.equal(TS.alreadyShownToday({ sym: 'ASTS', kind: 'pct', moved: 4 }, [], NOW), false);
});

test('alreadyShownToday: același simbol/kind/direcție azi → duplicat', () => {
  const hist = [{ sym: 'ASTS', kind: 'pct', moved: 3.2, ts: NOW - 3600000 }];
  assert.equal(TS.alreadyShownToday({ sym: 'ASTS', kind: 'pct', moved: 4.1 }, hist, NOW), true);
});

test('alreadyShownToday: ieri nu blochează azi', () => {
  const hist = [{ sym: 'ASTS', kind: 'pct', moved: 3.2, ts: NOW - 86400000 * 1.2 }];
  assert.equal(TS.alreadyShownToday({ sym: 'ASTS', kind: 'pct', moved: 4.1 }, hist, NOW), false);
});

test('alreadyShownToday: pas ref diferit e eveniment nou', () => {
  const hist = [{ sym: 'TSLA', kind: 'ref', step: 1, ts: NOW - 1000 }];
  assert.equal(TS.alreadyShownToday({ sym: 'TSLA', kind: 'ref', step: 2 }, hist, NOW), false);
  assert.equal(TS.alreadyShownToday({ sym: 'TSLA', kind: 'ref', step: 1 }, hist, NOW), true);
});

test('swipeIntent: stanga = delete, dreapta = snooze', () => {
  assert.equal(TS.swipeIntent(-80, 4), 'delete');
  assert.equal(TS.swipeIntent(80, -3), 'snooze');
});

test('swipeIntent: tap sau vertical nu e swipe', () => {
  assert.equal(TS.swipeIntent(-10, 2), null);
  assert.equal(TS.swipeIntent(-80, 90), null);
  assert.equal(TS.swipeIntent(0, 0), null);
});
