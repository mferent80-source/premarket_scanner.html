// Audit 14.10.2026 (🟡): EARN.calendar() păstra doar raportările cu estimări (filtrul hubului) ⇒ 198 din 1.039 raportări din
// următoarele 14 zile (măsurat pe 14.10) erau invizibile gardei scannerului. Opțiunea `toate:true` ține orice raportare programată.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function setup() {
  const store = new Map([['finnhub_api_key', 'cheie-test']]), cereri = [];
  const ctx = {
    console, Date, Promise, localStorage: { getItem: (k) => store.get(k) ?? null },
    D: { fetchJSON: async (url, opts) => { cereri.push({ url, opts }); return { earningsCalendar: [
      { symbol: 'AAA', date: '2026-10-20', hour: 'amc', epsEstimate: 1.2 },
      { symbol: 'BBB', date: '2026-10-21', hour: 'bmo', epsEstimate: null, revenueEstimate: null, epsActual: null },
      { symbol: 'CCC.HK', date: '2026-10-21', hour: 'bmo', epsEstimate: 2 },
      { symbol: 'BRK.B', date: '2026-10-25', hour: 'bmo', epsEstimate: 3 },
    ] }; } },
  };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(readFileSync('lib/earnings.js', 'utf8'), ctx);
  return { ctx, cereri };
}

test('implicit: doar raportarile cu estimari (ca pana acum, pentru hub)', async () => {
  const f = setup(); const r = await f.ctx.EARN.calendar({ zile: 14 });
  assert.equal(r.ok, true); assert.deepEqual(r.items.map((e) => e.symbol), ['AAA']);
});

test('toate:true: orice raportare programata US, fara cele non-US, pentru garda scannerului; clasele de actiuni (BRK.B) devin BRK-B (ca la Yahoo)', async () => {
  const f = setup(); const r = await f.ctx.EARN.calendar({ zile: 14, toate: true });
  assert.equal(r.ok, true); assert.deepEqual(r.items.map((e) => e.symbol), ['AAA', 'BBB', 'BRK-B']);
  assert.match(f.cereri[0].opts.cacheKey, /toate/, 'cache separat de lista hubului');
});
