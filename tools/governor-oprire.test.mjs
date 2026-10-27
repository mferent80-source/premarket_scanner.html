// 27.10.2026 (planul lotului 2, contractele cu lotul E): Governor citește kill switch-ul (`tt_governor_oprire_v1`, scris de „Oprește tot”)
// ⇒ HALTED cu motivul cât `activ` e true; re-armarea se face DOAR din formularul Governor, cu motiv obligatoriu (scrie activ:false, rearmatLa,
// rearmatMotiv). Reconcilierea zilnică (`tt_reconciliere_v1`, scrisă de pagina contului după fiecare citire) cu ok=false ⇒ CAUTION cu lista,
// și pe calea brokerului (T212Capital) și direct în Governor când brokerul nu e conectat pe aparat.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const NOW = Date.parse('2026-10-27T14:00:00Z');
function lume(seed = {}, files = ['lib/governor.js']) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
  const asc = {};
  const c = { console, Date: Clock, Intl, JSON, Math, Number, navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0)' }, addEventListener: (k, f) => { asc[k] = f; },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
  c.window = c; vm.createContext(c);
  for (const f of files) vm.runInContext(readFileSync(f, 'utf8'), c);
  return { c, store, asc };
}
const rand = [{ id: 'a1', sym: 'AAPL', dir: 'long', entry: 100, exit: 105, size: 1, openTs: NOW - 86400000 * 3, closeTs: NOW - 86400000 * 2, status: 'closed' }];
const oprire = (extra = {}) => ({ activ: true, la: '2026-10-27T13:40:00Z', motiv: 'ordin greșit pe NVDA', aparat: 'PC', ordineAnulate: [{ id: 'o1', ticker: 'NVDA_US_EQ', stopPrice: 180 }, { id: 'o2', ticker: 'AAPL_US_EQ', stopPrice: 210 }], rearmatLa: null, rearmatMotiv: null, ...extra });

test('kill switch activ ⇒ HALTED cu motivul, aparatul, ora și ordinele anulate; GV.oprire() dă starea', () => {
  const { c } = lume({ tt_journal_v1: rand, tt_account_size_v1: '12670', tt_governor_oprire_v1: oprire() });
  const st = c.GV.status();
  assert.equal(st.verdict, 'HALTED'); assert.equal(c.GV.canTrade(), false);
  const txt = st.reasons.join(' | ');
  assert.match(txt, /Oprire de urgență/); assert.match(txt, /ordin greșit pe NVDA/); assert.match(txt, /PC/); assert.match(txt, /2 ordine anulate/); assert.match(txt, /re-armare/i);
  assert.equal(c.GV.oprire().activ, true); assert.equal(st.oprire.activ, true);
});

test('re-armarea cere motiv; scrie activ:false, rearmatLa, rearmatMotiv și păstrează restul; Governor revine; nota re-armării rămâne 24 h', () => {
  const { c, store } = lume({ tt_journal_v1: rand, tt_account_size_v1: '12670', tt_governor_oprire_v1: oprire() });
  assert.equal(c.GV.rearmeaza(''), false); assert.equal(c.GV.rearmeaza('   '), false); assert.equal(c.GV.status().verdict, 'HALTED', 'fără motiv nu se re-armează');
  assert.equal(c.GV.rearmeaza('am verificat pozițiile și am refăcut stopurile'), true);
  const k = JSON.parse(store.get('tt_governor_oprire_v1'));
  assert.equal(k.activ, false); assert.equal(k.rearmatLa, new Date(NOW).toISOString()); assert.equal(k.rearmatMotiv, 'am verificat pozițiile și am refăcut stopurile');
  assert.equal(k.motiv, 'ordin greșit pe NVDA'); assert.equal(k.ordineAnulate.length, 2, 'istoria opririi rămâne scrisă');
  const st = c.GV.status(); assert.equal(st.verdict, 'TRADE'); assert.match(st.reasons.join(' '), /re-armat/i);
  assert.equal(c.GV.rearmeaza('din nou'), false, 'nimic de re-armat când nu e activă');
  const veche = lume({ tt_journal_v1: rand, tt_account_size_v1: '12670', tt_governor_oprire_v1: oprire({ activ: false, rearmatLa: '2026-10-25T10:00:00Z', rearmatMotiv: 'x' }) }).c.GV.status();
  assert.doesNotMatch(veche.reasons.join(' '), /re-armat/i, 'o re-armare mai veche de 24 h nu mai e notă');
  // cheia stricată: ca „activ” necunoscut nu blochează (închis la eroare e pe conținut, nu pe absență), dar nu aruncă
  const stricat = lume({ tt_journal_v1: rand, tt_account_size_v1: '12670', tt_governor_oprire_v1: '{nu e json' }).c.GV.status(); assert.equal(stricat.verdict, 'TRADE');
});

test('reconcilierea cu diferențe ⇒ CAUTION cu lista: în Governor fără broker pe aparat și pe calea brokerului (T212Capital)', () => {
  const rec = { la: '2026-10-27T13:50:00Z', scope: 'live', ok: false, diferente: [{ tip: 'pozitie', ticker: 'AAPL_US_EQ', app: 10, broker: 12, text: 'AAPL: 10 în copie, 12 la broker' }, { tip: 'numerar', ticker: null, app: 1000, broker: 950.5, text: 'numerar: 1.000,0 în copie, 950,5 la broker' }] };
  const { c } = lume({ tt_journal_v1: rand, tt_account_size_v1: '12670', tt_reconciliere_v1: rec });
  const st = c.GV.status(); assert.equal(st.verdict, 'CAUTION'); assert.match(st.reasons.join(' '), /Reconciliere.*2 diferențe/); assert.match(st.reasons.join(' '), /AAPL: 10 în copie, 12 la broker/); assert.match(st.reasons.join(' '), /950,5/);
  assert.equal(lume({ tt_journal_v1: rand, tt_account_size_v1: '12670', tt_reconciliere_v1: { ...rec, ok: true, diferente: [] } }).c.GV.status().verdict, 'TRADE');
  // calea brokerului: T212Capital.build primește reconcilierea și o pune în motive (CAUTION), Governor o preia cu prefixul „Invest:” o singură dată
  const w = lume({}, ['lib/trading212-snapshot.js', 'lib/trading212-performance.js', 'lib/trading212-capital.js']);
  const at = new Date(NOW).toISOString();
  const r = w.c.T212Capital.build({ scope: 'live', snapshot: { environment: 'live', fetchedAt: at, summary: { currency: 'EUR', totalValue: 10000, available: 9000, reserved: 0, invested: 1000 }, positions: [{ ticker: 'T_US_EQ', quantity: 10, currentPrice: 100, instrumentCurrency: 'EUR', currency: 'EUR', value: 1000 }] },
    notes: { T_US_EQ: { stop: 95, stopCurrency: 'EUR' } }, history: { scope: 'live', currency: 'EUR', rows: [], complete: true, stale: false, state: 'ready' }, now: NOW, reconciliere: rec });
  assert.equal(r.verdict, 'CAUTION'); assert.match(r.reasons.join(' '), /Reconciliere.*2 diferențe/); assert.match(r.reasons.join(' '), /AAPL: 10 în copie/);
  const seed = { tt_trading212_portfolio_v1: { live: { environment: 'live', active: true, fetchedAt: at, summary: { currency: 'EUR', totalValue: 10000, available: 9000, reserved: 0, invested: 1000 }, positions: [{ ticker: 'T_US_EQ', quantity: 10, currentPrice: 100, instrumentCurrency: 'EUR', currency: 'EUR', value: 1000 }] } },
    tt_trading212_fills_v1: { accounts: { live: { environment: 'live', items: [], complete: true, fetchedAt: at } } }, tt_holdings_theses_v1: { 'live|T_US_EQ': { stop: 95, stopCurrency: 'EUR' } }, tt_reconciliere_v1: rec, tt_account_size_v1: '12670', tt_journal_v1: rand };
  const g = lume(seed, ['lib/trading212-snapshot.js', 'lib/trading212-performance.js', 'lib/trading212-capital.js', 'lib/governor.js']).c.GV.status();
  assert.equal(g.verdict, 'CAUTION'); assert.equal(g.reasons.filter((x) => /Reconciliere/.test(x)).length, 1, 'o singură dată, prin broker'); assert.match(g.reasons.join(' '), /Invest: Reconciliere/);
});
