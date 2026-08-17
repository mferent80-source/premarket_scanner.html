// Teste pentru lib/price-day.js — baseline variația zilei Yahoo.
// Rulează: node --test tools/price-day.test.mjs
import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const PD = require('../lib/price-day.js');

test('RTH fără changePercent: last = regularMarketPrice, prev = chartPreviousClose', () => {
  const q = PD.yahooQuote({
    regularMarketPrice: 96.01,
    chartPreviousClose: 95.56,
    previousClose: 95.56
  }, 95.49, 'rth', false);
  assert.equal(q.last, 96.01);
  assert.equal(q.prev, 95.56);
  const chg = (q.last - q.prev) / q.prev * 100;
  assert.ok(chg > 0.4 && chg < 0.5, 'azi ~+0.47, nu bara 1m');
});

test('RTH cu changePercent oficial', () => {
  const q = PD.yahooQuote({
    regularMarketPrice: 96.01,
    regularMarketChangePercent: 0.47,
    chartPreviousClose: 95.56
  }, 95.49, 'rth', false);
  assert.equal(q.last, 96.01);
  const implied = 96.01 / (1 + 0.47 / 100);
  assert.ok(Math.abs(q.prev - implied) < 1e-6);
});

test('premarket: prev = regularMarketPrice (close ieri)', () => {
  const q = PD.yahooQuote({
    regularMarketPrice: 95.56,
    chartPreviousClose: 94.00
  }, 96.10, 'pre', false);
  assert.equal(q.last, 96.10);
  assert.equal(q.prev, 95.56);
});

test('busOk: doar surse de zi (alerts/yahoo), nu nasdaq-ext/finnhub', () => {
  assert.equal(PD.busOk('alerts'), true);
  assert.equal(PD.busOk('yahoo-rth'), true);
  assert.equal(PD.busOk('nasdaq-ext'), false);
  assert.equal(PD.busOk('nasdaq-fh'), false);
  assert.equal(PD.busOk('hub-market'), false);
  assert.equal(PD.busOk(''), false);
  assert.equal(PD.busOk(undefined), false);
});
