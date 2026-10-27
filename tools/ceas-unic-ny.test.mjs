// 27.10.2026 (audit C 🔵 12 / I-751): UN SINGUR ceas pentru limitele contului — ziua, săptămâna ȘI luna pe sesiunea New York (CT.ziNY / CT.lunaNY).
// Înainte: ziua pe NY în Governor și T212Capital, luna pe Europe/Bucharest în limita lunară și în Raport, „Azi” din filtrul Închise pe miezul
// nopții local ⇒ o vânzare la 19:30 NY pe 31.10 intra în luna următoare și ieșea din „Azi”. Și (🟡 10) cifrele din motivele Governor / contului
// cu o singură zecimală (regula din 03.10), nu „−123.46$”.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// vineri 31.10.2026, 23:30 UTC = 19:30 New York (încă 31.10, DST SUA până pe 01.11) = 00:30 România pe 01.11 (DST UE s-a încheiat pe 25.10)
const NOW = Date.parse('2026-10-31T23:30:00Z');
function lume(seed = {}, files = ['lib/capital-time.js', 'lib/monthly-limit.js', 'lib/journal.js', 'lib/governor.js']) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
  const c = { console, Date: Clock, Intl, JSON, Math, Number, Map, Set, WeakMap, Float64Array, navigator: { userAgent: 'test' },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
  c.window = c; vm.createContext(c);
  for (const f of files) vm.runInContext(readFileSync(f, 'utf8'), c);
  return { c, store };
}

test('CT.ziNY / CT.lunaNY: 19:30 New York pe 31.10 e ziua 2026-10-31 și luna 2026-10, oricare ar fi fusul aparatului', () => {
  const { c } = lume();
  assert.equal(c.CT.ziNY(NOW), '2026-10-31'); assert.equal(c.CT.ziNY(), '2026-10-31'); assert.equal(c.CT.lunaNY(NOW), '2026-10');
  assert.equal(c.CT.ziNY(NOW + 5 * 3600000), '2026-11-01', 'după miezul nopții NY începe ziua următoare');
  assert.equal(c.CT.lunaNY(NOW + 5 * 3600000), '2026-11');
});

test('Governor, limita lunară și Raportul folosesc același ceas: vânzarea din 31.10 la 19:30 NY rămâne în octombrie', () => {
  const { c } = lume({ tt_journal_settings_v1: { limitaLuna: 500 }, tt_journal_luna_t212_v1: { luna: '2026-10', rez: -400, n: 2, moneda: 'EUR', la: NOW - 60000 } });
  assert.equal(c.GV.etDay(), '2026-10-31');
  assert.equal(c.MonthlyLimit.lunaDe(NOW), '2026-10');
  assert.equal(c.MonthlyLimit.stare().stare, 'aproape', 'rezultatul lunii 2026-10 e al lunii de acum (NY), nu „neverificat” ca pe luna RO 2026-11');
  assert.equal(c.GV.status().monthly.stare, 'aproape');
  const fara = lume({ tt_journal_settings_v1: { limitaLuna: 500 }, tt_journal_luna_t212_v1: { luna: '2026-10', rez: -400, n: 2, moneda: 'EUR', la: NOW - 60000 } }, ['lib/capital-time.js', 'lib/governor.js']);
  assert.equal(fara.c.GV.monthlyState().stare, 'aproape', 'copia din Governor (fără modul) pe același ceas');
  const r = lume({}, ['lib/capital-time.js', 'lib/execution-review.js', 'lib/journal-report.js']).c.JournalReport;
  const lim = r.limitaLuna([{ iesire: NOW, rez: -100 }, { iesire: NOW + 5 * 3600000, rez: -50 }], 1000, NOW);
  assert.equal(lim.luna, '2026-10'); assert.equal(lim.n, 1, 'doar vânzarea de dinaintea miezului nopții NY e în octombrie');
});

test('„Azi” din Închise e ziua New York: o închidere la 14:30 NY e azi chiar dacă aparatul e deja pe 01.11', () => {
  const inchisa = (id, t) => ({ id, sym: 'AAPL', dir: 'long', entry: 100, exit: 101, size: 1, openTs: t - 3600000, closeTs: t, status: 'closed' });
  const { c } = lume({ tt_journal_v1: [inchisa('a', NOW - 5 * 3600000), inchisa('b', NOW - 30 * 3600000)] });
  const azi = c.JR.listClosed({ today: true }).map((e) => e.id);
  assert.deepEqual(azi, ['a']);
});

test('🟡 10: motivele Governor și ale contului Trading 212 arată banii cu o singură zecimală', () => {
  const t = NOW - 2 * 3600000, jurnal = [{ id: 'p1', sym: 'AAPL', dir: 'long', entry: 100, exit: 87.6544, size: 10, openTs: t - 3600000, closeTs: t, status: 'closed' }];
  const { c } = lume({ tt_journal_v1: jurnal, tt_account_size_v1: '5000' }, ['lib/capital-time.js', 'lib/account.js', 'lib/governor.js']);
  const s = c.GV.status(), txt = s.reasons.join(' | ');
  assert.equal(s.verdict, 'HALTED'); assert.match(txt, /Pierdere zilnică −123,5 \$ ≥ buget −100,0 \$/);
  assert.doesNotMatch(txt, /\d\.\d\d\$/, 'fără două zecimale cu punct');
  // contul Trading 212: pierderea la valoarea de piață în motiv, cu o zecimală
  const w = lume({}, ['lib/trading212-snapshot.js', 'lib/trading212-performance.js', 'lib/trading212-capital.js']);
  const at = new Date(NOW).toISOString();
  const r = w.c.T212Capital.build({ scope: 'a', snapshot: { environment: 'live', fetchedAt: at, summary: { currency: 'EUR', totalValue: 9750.2, available: 8750.2, reserved: 0, invested: 1000 }, positions: [{ ticker: 'T_US_EQ', quantity: 10, currentPrice: 100, instrumentCurrency: 'EUR', currency: 'EUR', value: 1000 }] },
    notes: { T_US_EQ: { stop: 95, stopCurrency: 'EUR' } }, history: { scope: 'a', currency: 'EUR', rows: [], complete: true, stale: false, state: 'ready' }, now: NOW,
    daily: [{ at: '2026-10-30T20:30:00Z', total: 10000.3, currency: 'EUR' }], cash: { environment: 'live', transactions: { items: [], fetchedAt: at, complete: true, nextCursor: null, error: null } } });
  assert.match(r.reasons.join(' '), /250,1 EUR/); assert.doesNotMatch(r.reasons.join(' '), /250\.1\d/);
});

test('pagina Jurnal: PnL-ul zilei și rândurile de azi din Risc & capital nu mai folosesc două zecimale; data formularului e ziua NY; nota snapshot-ului e escapată', () => {
  const src = readFileSync('journal/index.html', 'utf8'), are = (re) => re.test(src);
  assert.equal(are(/todayPnl\.toFixed\(2\)/), false, 'PnL azi cu două zecimale'); assert.equal(are(/'\$'\+p\.toFixed\(2\)/), false, 'rândurile de azi cu două zecimale');
  assert.equal(are(/maximumFractionDigits: Math\.abs\(v\) < 1 \? 4 : 1/), true, 'fmt$ cu o zecimală');
  assert.equal(are(/\$\('fDate'\)\.value = new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/), false, 'data implicită pe ziua NY, nu UTC');
  assert.equal(are(/new Date\(e\.closeTs\)\.toISOString\(\)\.slice\(0, 10\)/), false, 'data la editare pe ziua NY, nu UTC');
  assert.equal(are(/esc\(base\.note\)/), true, '🔵 18: nota snapshot-ului de bază trece prin esc()');
});
