// 19.10.2026 (I-703 a, c) — rapoartele modelelor (Neural, HMM, Isolation, cuantile, KNN, GARCH, Clasificator) erau „folosibile” 30 de
// minute ⇒ holdings/learning.js le reantrena la fiecare deschidere (~8 s CPU pe poziție). Acum valabilitatea e legată de sesiunea EOD
// (asOf + închiderea) și de amprenta datelor: aceleași bare ⇒ același rezultat, deci raportul rămâne valabil toată ziua de bursă.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { motor, clasifica } from './clasificator-date.mjs';

const NOW = Date.parse('2026-10-05T18:00:00Z'), ASOF = '2026-10-02', T = Date.parse('2026-10-02T20:00:00Z'), ORE3 = 3 * 3600000;
const felie = (src, start) => { const i = src.indexOf(start); assert.ok(i >= 0, start); const j = src.indexOf('\nfunction ', i + 1); return src.slice(i, j < 0 ? undefined : j); };

test('cele șase interfețe de model: raportul de acum 3 ore pe aceeași sesiune și aceleași bare e folosibil; altă sesiune / altă amprentă nu', () => {
  for (const [f, lib] of [['holdings/garch.js', 'G'], ['holdings/knn.js', 'Q'], ['holdings/quantile.js', 'Q'], ['holdings/hmm.js', 'R'], ['holdings/isolation.js', 'R'], ['holdings/classifier.js', 'Q']]) {
    const c = { Number, Math, Date, context: { symbol: () => 'TEST', demo: false }, equal: (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b)), [lib]: { valid: () => true } };
    c.g = { DailySeries: { date: () => ASOF } }; c.DailySeries = c.g.DailySeries; vm.createContext(c); vm.runInContext(felie(readFileSync(f, 'utf8'), 'function usable('), c);
    const m = { currency: 'USD', asOf: ASOF, price: 100, sourceFingerprint: 'ohlcv-v1:A' };
    const r = { symbol: 'TEST', currency: 'USD', asOf: ASOF, kind: 'market', sourceTime: T, sourceClose: 100, timezone: 'America/New_York', sourceFingerprint: 'ohlcv-v1:A', trainedAt: NOW - ORE3, result: { current: { t: T, close: 100 } } };
    assert.equal(c.usable(r, {}, m, NOW), true, f + ': raport de acum 3 ore, aceeași sesiune');
    assert.equal(c.usable({ ...r, asOf: '2026-10-01' }, {}, m, NOW), false, f + ': altă sesiune');
    assert.equal(c.usable({ ...r, sourceFingerprint: 'ohlcv-v1:B' }, {}, m, NOW), false, f + ': alte bare');
    assert.equal(c.usable(r, {}, { ...m, sourceFingerprint: undefined }, NOW), true, f + ': amprenta necunoscută în pagină ⇒ sesiunea + închiderea decid');
    assert.equal(c.usable({ ...r, trainedAt: NOW + 120000 }, {}, m, NOW), false, f + ': moment din viitor');
  }
});

test('Neural (lib/holdings-neural.js assess): raportul de acum 3 ore pe aceeași sesiune nu mai e „expirat”', () => {
  const c = { Number, Math, finite: Number.isFinite, valid: () => true }; vm.createContext(c);
  vm.runInContext(felie(readFileSync('lib/holdings-neural.js', 'utf8'), 'function assess('), c);
  const rec = { symbol: 'TEST', currency: 'USD', kind: 'market', trainedAt: NOW - ORE3, asOf: ASOF, result: { maxZ: 1, disagreement: { votes: [3, 0, 0], spread: 0.1 }, advantage: true, walk: { consistent: true } } };
  const o = { symbol: 'TEST', currency: 'USD', asOf: ASOF, demo: false, now: NOW };
  assert.equal(c.assess(rec, o).state, 'research');
  assert.equal(c.assess(rec, { ...o, asOf: '2026-10-05' }).state, 'stale', 'sesiune nouă ⇒ expirat');
  assert.equal(c.assess({ ...rec, trainedAt: NOW + 120000 }, o).state, 'stale', 'moment din viitor');
});

test('Verdictul (lib/holdings-verdict.js): raport vechi de 3 ore, aceeași amprentă ⇒ acceptat; altă amprentă ⇒ „istoric schimbat”', () => {
  const core = { HoldingsKNN: { valid: () => true } }; vm.createContext(core); vm.runInContext(readFileSync('lib/holdings-verdict.js', 'utf8'), core);
  const e = { symbol: 'TEST', currency: 'USD', asOf: ASOF, kind: 'market', t: T, close: 100, timezone: 'America/New_York', closeMinutes: 960, fingerprint: 'ohlcv-v1:A' };
  const s = { usable: true, assessment: { state: 'research', message: 'ok' }, record: { ...e, sourceTime: T, sourceFingerprint: 'ohlcv-v1:A', sourceClose: 100, trainedAt: NOW - ORE3, result: { version: 'holdings-knn-v1', model: { k: 5 }, current: { t: T, close: 100, classIndex: 2, support: [0.1, 0.2, 0.7], distance: 0.5 } } } };
  assert.equal(core.HoldingsVerdict.accepted('knn', s, e, NOW), true);
  assert.equal(core.HoldingsVerdict.accepted('knn', s, { ...e, fingerprint: 'ohlcv-v1:B' }, NOW), false);
});

test('Sinteza și istoricul sintezelor păstrează rapoartele de acum 3 ore din aceeași sesiune', () => {
  const core = {}; vm.createContext(core); for (const f of ['lib/holdings-model-summary.js', 'lib/holdings-model-history.js']) vm.runInContext(readFileSync(f, 'utf8'), core);
  const expected = { symbol: 'TEST', currency: 'USD', asOf: ASOF, demo: false }, rec = (result) => ({ ...expected, kind: 'market', trainedAt: NOW - ORE3, result });
  const s = core.HoldingsModelSummary.build({ expected, now: NOW, neural: { usable: true, record: rec({ version: 'holdings-mlp-v3', classIndex: 2, comparison: { status: 'evaluated', boosting: { version: 'holdings-gbt-v1', classIndex: 2 } } }), assessment: { state: 'research', message: 'ok' }, comparison: { state: 'research', message: 'ok' } }, hmm: { usable: true, record: rec({ version: 'holdings-hmm-v1', current: { state: 0 }, profiles: [{ label: 'Ascendent' }] }), assessment: { state: 'descriptive', message: 'ok' } }, isolation: { usable: true, record: rec({ version: 'holdings-isolation-v1', current: { score: 0.4, votes: 0 }, threshold: 0.6 }), assessment: { state: 'ordinary', message: 'ok' } } });
  assert.equal(s.available, 4, 'toate cele 4 carduri disponibile');
  const w = new Map(), store = core.HoldingsModelHistory.createStore({ getItem: (k) => w.get(k) || null, setItem: (k, v) => w.set(k, v) });
  assert.equal(store.save(s, { scope: 'a', symbol: 'TEST', currency: 'USD', kind: 'market' }, NOW).status, 'saved');
});

test('Registrul estimărilor: o estimare deja păstrată pe sesiune nu mai dă eroare când raportul refolosit e mai vechi de 30 de minute', () => {
  const c = { Date, JSON, Math, Number, String, Array, Object, Intl }; c.window = c; vm.createContext(c);
  for (const f of ['lib/daily-series.js', 'lib/holdings-forecast.js']) vm.runInContext(readFileSync(f, 'utf8'), c);
  const F = c.HoldingsForecast, e = { scope: 'a', ticker: 'TEST_US_EQ', symbol: 'TEST', currency: 'USD', kind: 'market' }, w = new Map(), store = F.createStore({ getItem: (k) => w.get(k) ?? null, setItem: (k, v) => w.set(k, v), removeItem: (k) => w.delete(k) });
  const t = Date.parse('2026-10-02T20:00:00Z'), cap = Date.parse('2026-10-02T21:00:00Z');
  const input = { model: 'quantile', modelVersion: F.VERSIONS.quantile, trainedAt: cap - 60000, state: 'research', source: { t, asOf: '2026-10-02', timezone: 'America/New_York', closeMinutes: 960, close: 100, atrPct: 2 }, estimate: { prices: [90, 100, 110], baselinePrices: [91, 100, 109] } };
  const first = store.save(input, e, cap); assert.equal(first.saved, true, JSON.stringify(first));
  const again = store.save(input, e, cap + 2 * 3600000); // același raport, refolosit după 2 ore (încă înainte de deschiderea următoare)
  assert.equal(again.ok, true, again.error); assert.equal(again.duplicate, true);
});

test('Clasificatorul: aceleași bare ⇒ exact același raport, oricând în zi (de aceea se antrenează o dată pe zi de bursă)', () => {
  const c = motor('.'), now = Date.parse('2026-10-07T22:00:00Z'); let a = 11;
  const rnd = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let p = 100; const bars = []; for (let i = 0; i < 900; i++) { const o = p, r = (rnd() - 0.5) * 0.04; p = Math.max(1, p * (1 + r)); bars.push({ t: now - (900 - i) * 86400000, o, h: Math.max(o, p) * (1 + rnd() * 0.01), l: Math.min(o, p) * (1 - rnd() * 0.01), c: p, v: 1e6 + Math.floor(rnd() * 1e6) }); }
  const x = clasifica(c, structuredClone(bars), { now }), y = clasifica(c, structuredClone(bars), { now: now + 9 * 3600000 });
  assert.equal(JSON.stringify(y), JSON.stringify(x));
  const src = readFileSync('holdings/classifier.js', 'utf8');
  assert.doesNotMatch(felie(src, 'function auto('), /1800000/, 'pornirea automată nu mai are tranșă de 30 de minute');
});
