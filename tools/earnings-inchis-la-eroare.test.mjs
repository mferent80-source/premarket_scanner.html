// I-698 (19.10.2026, 🔴 verificat): când Finnhub nu răspundea, D.fetchJSON întorcea null, iar EARN.calendar întorcea
// { ok:true, items:[] } ⇒ candidate-engine credea că a verificat și scria „fără earnings în 14z” pe un candidat cumpărabil.
// Acum: răspuns fără `earningsCalendar` (null, formă greșită) ⇒ ok:false cu motiv. La fel EARN.istoric.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function setup(raspuns) {
  const store = new Map([['finnhub_api_key', 'cheie-test']]), cereri = [];
  const ctx = {
    console, Date, Promise, localStorage: { getItem: (k) => store.get(k) ?? null },
    D: {
      fetchJSON: async (url, opts) => { cereri.push({ url, opts }); if (opts && opts.validate && raspuns != null && /finnhub/.test(url) && !opts.validate(raspuns)) return null; return /finnhub/.test(url) ? raspuns : null; },
      lastFail: () => ({ at: Date.now(), tries: ['direct:429'] }),
    },
  };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(readFileSync('lib/earnings.js', 'utf8'), ctx);
  return { EARN: ctx.EARN, cereri };
}

for (const [nume, raspuns] of [['null (Finnhub nu a răspuns)', null], ['obiect fără earningsCalendar', {}], ['earningsCalendar de formă greșită', { earningsCalendar: 'x' }], ['eroarea Finnhub {error}', { error: 'API limit reached' }]]) {
  test('calendar: ' + nume + ' ⇒ ok:false cu motiv (nu „nimeni nu raportează”)', async () => {
    const { EARN } = setup(raspuns);
    for (const opts of [{ zile: 14 }, { zile: 14, toate: true }]) {
      const r = await EARN.calendar(opts);
      assert.equal(r.ok, false, JSON.stringify(r));
      assert.ok(r.motiv && r.motiv.length > 3, 'motivul e spus pe față: ' + r.motiv);
      assert.equal(r.items.length, 0);
    }
  });
  test('istoric: ' + nume + ' ⇒ ok:false cu motiv', async () => {
    const { EARN } = setup(raspuns);
    const r = await EARN.istoric('AAPL', { ani: 1 });
    assert.equal(r.ok, false, JSON.stringify(r));
    assert.ok(r.motiv && r.motiv.length > 3);
  });
}

test('calendar: un calendar GOL dar valid rămâne ok:true (chiar nu raportează nimeni)', async () => {
  const { EARN } = setup({ earningsCalendar: [] });
  const r = await EARN.calendar({ zile: 14, toate: true });
  assert.equal(r.ok, true); assert.equal(r.items.length, 0);
});

test('calendar și istoric cer validarea formei ⇒ un răspuns stricat nu intră 30 de minute în cache', async () => {
  const { EARN, cereri } = setup({ earningsCalendar: [] });
  await EARN.calendar({ zile: 14 }); await EARN.istoric('AAPL');
  const fh = cereri.filter((c) => /finnhub/.test(c.url));
  assert.equal(fh.length, 2);
  for (const c of fh) {
    assert.equal(typeof c.opts.validate, 'function', 'validate lipsește pentru ' + c.url.replace(/token=.*/, ''));
    assert.equal(!!c.opts.validate({}), false); assert.equal(!!c.opts.validate(null), false);
    assert.equal(!!c.opts.validate({ earningsCalendar: [] }), true);
  }
});

test('istoric: o raportare reală rămâne ok:true chiar fără prețuri (reacția e „nu știu”, nu zero)', async () => {
  const { EARN } = setup({ earningsCalendar: [{ symbol: 'AAPL', date: '2026-07-30', hour: 'amc', epsActual: 1.5, epsEstimate: 1.4 }] });
  const r = await EARN.istoric('AAPL');
  assert.equal(r.ok, true); assert.equal(r.items.length, 1); assert.equal(r.items[0].reactie, null);
});
