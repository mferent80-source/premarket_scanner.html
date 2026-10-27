// 27.10.2026 (audit C 🟡 8, partea a doua): pe un aparat care a pornit cu valoarea de pornire (10.000, tt_account_default_v1 = 1) și a primit
// apoi prin sincronizare capitalul adevărat (tt_pf_account, scris de celălalt aparat), ACCT.get() dădea tot 10.000 — cheia locală scrisă de
// migrate() avea prioritate. Acum capitalul sincronizat trece înaintea valorii de pornire, e „știut” (known) și Governor nu mai dă CAUTION.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function lume(seed = {}) {
  const store = new Map(Object.entries(seed));
  const c = { console, Date, Intl, JSON, Math, Number, navigator: { userAgent: 'test' },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
  c.window = c; vm.createContext(c);
  for (const f of ['lib/account.js', 'lib/governor.js']) vm.runInContext(readFileSync(f, 'utf8'), c);
  return { c, store };
}
const rand = [{ id: 'a1', sym: 'AAPL', dir: 'long', entry: 100, exit: 105, size: 1, openTs: Date.now() - 86400000 * 3, closeTs: Date.now() - 86400000 * 2, status: 'closed' }];

test('capitalul sincronizat (tt_pf_account) bate valoarea de pornire scrisă local; e „știut”; Governor fără CAUTION pe capital necunoscut', () => {
  const { c } = lume({ tt_account_default_v1: '1', tt_account_size_v1: '10000', tt_pf_account: '5393.45', tt_journal_v1: JSON.stringify(rand) });
  const g = c.ACCT.get();
  assert.equal(g.value, 5393.45); assert.equal(g.source, 'synced');
  assert.equal(c.ACCT.known(), true);
  const i = c.ACCT.capitalInfo(); assert.equal(i.value, 5393.45); assert.equal(i.source, 'synced'); assert.match(i.text, /sincronizat de pe celălalt aparat/);
  const s = c.GV.status(); assert.equal(s.verdict, 'TRADE'); assert.doesNotMatch(s.reasons.join(' '), /Capital necunoscut/); assert.equal(s.cfg.accountSize, 5393.45);
  // migrate() la deschidere nu o strică: valoarea sincronizată rămâne cea folosită
  c.ACCT.migrate(); assert.equal(c.ACCT.get().value, 5393.45); assert.equal(c.ACCT.known(), true);
});

test('fără capital sincronizat rămâne ca înainte: valoarea de pornire e „necunoscută” ⇒ CAUTION; un capital local adevărat are prioritate față de cel sincronizat', () => {
  const nec = lume({ tt_account_default_v1: '1', tt_account_size_v1: '10000', tt_journal_v1: JSON.stringify(rand) });
  assert.equal(nec.c.ACCT.get().source, 'account'); assert.equal(nec.c.ACCT.known(), false); assert.equal(nec.c.GV.status().verdict, 'CAUTION');
  const local = lume({ tt_account_size_v1: '12670', tt_pf_account: '5393.45', tt_journal_v1: JSON.stringify(rand) });
  assert.equal(local.c.ACCT.get().value, 12670); assert.equal(local.c.ACCT.get().source, 'account');
  const stricat = lume({ tt_account_default_v1: '1', tt_account_size_v1: '10000', tt_pf_account: 'abc' });
  assert.equal(stricat.c.ACCT.get().source, 'account', 'o valoare sincronizată ilizibilă nu e capital');
});
