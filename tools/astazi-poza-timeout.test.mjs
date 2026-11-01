// 01.11.2026: poza Radar de pe Astăzi are termen. La tăcere rămân stopurile din aplicație și se spune că poza n-a venit.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function pagina({ fetch, cheie = 'cheie-de-proba' } = {}) {
  const timers = [], store = new Map(cheie ? [['radar_cheie', cheie]] : []);
  let seq = 1;
  const host = { innerHTML: '', hidden: false, querySelectorAll: () => [], querySelector: () => null, contains: () => false, addEventListener() {} };
  const calls = [];
  const c = {
    Intl, Date, Math, JSON, Map, Set, Number, String, Array, Object, Promise, console, URL, AbortController,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    document: { getElementById: (id) => (id === 'stopPanel' ? host : null), activeElement: null, hidden: false },
    CSS: { escape: (s) => s }, Event: class { constructor(t) { this.type = t; } }, dispatchEvent() {}, addEventListener() {},
    setInterval: () => 1,
    setTimeout: (fn, ms) => { const id = seq++; timers.push({ id, fn, ms }); return id; },
    clearTimeout: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    fetch: async (url, opts = {}) => { calls.push({ url: String(url), opts }); return fetch(url, opts); },
    T212Snapshot: { read: () => ['live-A', { positions: [{ ticker: 'MU_US_EQ', quantity: 1, averagePrice: 10, currentPrice: 11, instrumentCurrency: 'USD' }], summary: { currency: 'EUR' } }] }
  };
  c.window = c; vm.createContext(c);
  for (const f of ['lib/holdings-notes.js', 'lib/stop-setter.js', 'today/stop.js']) vm.runInContext(readFileSync(f, 'utf8'), c, { filename: f });
  return { host, calls, timers, c };
}

test('poza Radar care tace 8 secunde nu lasă cererea agățată și spune că stopurile din aplicație rămân', async () => {
  const p = pagina({
    fetch: (url, opts) => new Promise((_, reject) => { opts.signal.addEventListener('abort', () => reject(Object.assign(Error('aborted'), { name: 'AbortError' }))); })
  });
  const t = p.timers.find((x) => x.ms === 8000);
  assert.ok(t, 'cererea are termen de 8 secunde');
  assert.equal(p.calls.length, 1); assert.match(p.calls[0].url, /^https:\/\/paznic-radar\.mferent80\.workers\.dev\/poza$/);
  t.fn();
  await new Promise((r) => setImmediate(r));
  assert.match(p.host.innerHTML, /Poza Radar n-a venit în 8 secunde/);
  assert.match(p.host.innerHTML, /Stopurile din aplicație rămân/);
});

test('poza Radar primită la timp nu spune că a lipsit și aduce stopul extern', async () => {
  const p = pagina({
    fetch: async () => ({ ok: true, json: async () => ({ t212: [{ t212: 'MU_US_EQ', stopT212: 9 }] }) })
  });
  await new Promise((r) => setImmediate(r));
  assert.doesNotMatch(p.host.innerHTML, /Poza Radar n-a venit/);
  assert.equal([...p.c.window.__stopuriExterne].join(), 'MU_US_EQ');
});
