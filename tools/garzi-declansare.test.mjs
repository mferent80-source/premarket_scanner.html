// 27.10.2026 (I-760): testele de DECLANȘARE — câte unul pe fiecare gardă din Governor și din contul Trading 212. Fiecare pornește de la o stare
// curată, strică un singur lucru și cere ca garda să apară în motive, cu efectul ei (HALTED / CAUTION / NEVERIFICAT). Eticheta «modul · fragment»
// din nume leagă testul de gardă în docs/inventar-modele.md (tools/inventar-garzi.mjs); o gardă fără test aici face testul de acoperire roșu.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const NOW = Date.parse('2026-10-29T15:00:00Z'), H = 3600000, D = 24 * H, iso = (t) => new Date(t).toISOString(); // joi, 11:00 New York
function lume(seed = {}, extra = {}, fisiere) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
  const c = { console, JSON, Math, Number, Intl, Date: Clock, localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }, ...extra };
  c.window = c; vm.createContext(c);
  for (const f of fisiere) vm.runInContext(readFileSync(f, 'utf8'), c);
  return c;
}
function declanseaza(r, fragment, efect) {
  const motive = r.reasons.join(' | ');
  assert.ok(r.reasons.some((x) => x.includes(fragment)), 'motivul „' + fragment + '” lipsește: ' + motive);
  if (efect === 'HALTED' || efect === 'NEVERIFICAT') assert.equal(r.verdict, efect, motive);
  else if (efect === 'CAUTION') assert.notEqual(r.verdict, 'TRADE', 'o gardă CAUTION nu lasă TRADE: ' + motive);
}

// ---------- Governor (jurnalul manual + verdictul comun) ----------
const gv = (seed = {}, extra = {}) => lume(seed, extra, ['lib/governor.js']).GV.status();
const intrare = (id, o = {}) => ({ id, sym: 'AAPL', dir: 'long', entry: 100, size: 10, openTs: NOW - 3 * D, ...o });
const inchisa = (id, exit, closeTs, o = {}) => intrare(id, { exit, closeTs, status: 'closed', ...o });
const deschisa = [intrare('o1')];
const eq = (dd) => ({ EQ: { drawdownStats: () => (typeof dd === 'function' ? dd() : { currentDdPct: dd }) } });
const luna = (rez, la = NOW) => ({ tt_journal_v1: deschisa, tt_journal_settings_v1: { limitaLuna: 500 }, tt_journal_luna_t212_v1: { luna: '2026-10', rez, la, moneda: 'EUR' } });

test('gardă «governor · Limite Governor invalide» — o limită negativă nu dă TRADE', () => declanseaza(gv({ tt_governor_cfg_v1: { maxLossPctDay: -2 }, tt_journal_v1: deschisa }), 'Limite Governor invalide', 'HALTED'));
test('gardă «governor · Jurnal neverificat» — ID-uri duplicate în jurnal', () => declanseaza(gv({ tt_journal_v1: [intrare('a'), intrare('a')] }), 'Jurnal neverificat', 'HALTED'));
test('gardă «governor · Capital necunoscut» — bugetele pe valoarea de pornire se spun', () => declanseaza(gv({ tt_journal_v1: deschisa }, { ACCT: { get: () => ({ value: 10000, source: 'default' }), known: () => false } }), 'Capital necunoscut', 'CAUTION'));
test('gardă «governor · Pierdere zilnică» — −300 $ azi față de bugetul de 200 $', () => declanseaza(gv({ tt_journal_v1: [inchisa('z', 70, NOW - H)] }), 'Pierdere zilnică', 'HALTED'));
test('gardă «governor · Buget zilnic consumat» — 80 % din bugetul zilei', () => declanseaza(gv({ tt_journal_v1: [inchisa('z', 84, NOW - H)] }), 'Buget zilnic consumat', 'CAUTION'));
test('gardă «governor · Pierdere săptămână» — −350 $ marți față de bugetul de 300 $', () => declanseaza(gv({ tt_journal_v1: [inchisa('s', 65, NOW - 2 * D + H)] }), 'Pierdere săptămână', 'HALTED'));
test('gardă «governor · Buget săptămână consumat» — 80 % din bugetul săptămânii', () => declanseaza(gv({ tt_journal_v1: [inchisa('s', 76, NOW - 2 * D + H)] }), 'Buget săptămână consumat', 'CAUTION'));
const azi = (n) => Array.from({ length: n }, (_, i) => inchisa('t' + i, 100.1, NOW - H + i, { openTs: NOW - 2 * H + i, size: 1 }));
test('gardă «governor · max trade-uri/zi atins» — a 5-a intrare de azi', () => declanseaza(gv({ tt_journal_v1: azi(5) }), 'max trade-uri/zi atins', 'HALTED'));
test('gardă «governor · ultimul permis» — a 4-a intrare de azi', () => declanseaza(gv({ tt_journal_v1: azi(4) }), 'ultimul permis', 'CAUTION'));
test('gardă «governor · Poziții deschise» — 4 poziții deschise', () => declanseaza(gv({ tt_journal_v1: ['a', 'b', 'c', 'd'].map((id) => intrare(id)) }), 'Poziții deschise', 'HALTED'));
test('gardă «governor · cooldown activ» — 3 pierderi la rând în 48 h', () => declanseaza(gv({ tt_journal_v1: [1, 2, 3].map((k) => inchisa('p' + k, 99, NOW - D + k * H)) }), 'cooldown activ', 'HALTED'));
test('gardă «governor · Drawdown rolling nu poate fi verificat» — curba aruncă eroare', () => declanseaza(gv({ tt_journal_v1: deschisa }, eq(() => { throw Error('curba'); })), 'Drawdown rolling nu poate fi verificat', 'HALTED'));
test('gardă «governor · Drawdown rolling invalid» — DD nenumeric', () => declanseaza(gv({ tt_journal_v1: deschisa }, eq(NaN)), 'Drawdown rolling invalid', 'HALTED'));
test('gardă «governor · % ≥ prag» — DD rolling 12 % peste pragul de 10 %', () => declanseaza(gv({ tt_journal_v1: deschisa }, eq(12)), '≥ prag', 'HALTED'));
test('gardă «governor · aproape de prag» — DD rolling 8 % (≥ 75 % din prag)', () => declanseaza(gv({ tt_journal_v1: deschisa }, eq(8)), 'aproape de prag', 'CAUTION'));
test('gardă «governor · monedă/FX incomplete» — o execuție în EUR fără curs', () => declanseaza(gv({ tt_journal_v1: [inchisa('fx', 101, NOW - D, { quoteCurrency: 'EUR' })] }), 'monedă/FX incomplete', 'HALTED'));
test('gardă «governor · Limita lunară depășită» — −600 € față de limita de 500 €', () => declanseaza(gv(luna(-600)), 'Limita lunară depășită', 'HALTED'));
test('gardă «governor · % consumat» — 80 % din limita lunară', () => declanseaza(gv(luna(-400)), '% consumat', 'CAUTION'));
test('gardă «governor · rezultatul lunii nu e citit» — limita pusă, luna necitită', () => declanseaza(gv({ tt_journal_v1: deschisa, tt_journal_settings_v1: { limitaLuna: 500 } }), 'rezultatul lunii nu e citit', 'CAUTION'));
test('gardă «governor · mai vechi de 3 zile» — rezultatul lunii citit acum 4 zile', () => declanseaza(gv(luna(-10, NOW - 4 * D)), 'mai vechi de 3 zile', 'CAUTION'));
test('gardă «governor · Oprire de urgență» — „Oprește tot” activ', () => declanseaza(gv({ tt_journal_v1: deschisa, tt_governor_oprire_v1: { activ: true, la: iso(NOW - H), motiv: 'test', aparat: 'PC', ordineAnulate: [] } }), 'Oprire de urgență', 'HALTED'));
test('gardă «governor · Reconciliere:» — o diferență față de broker, fără broker citit pe aparat', () => declanseaza(gv({ tt_journal_v1: deschisa, tt_reconciliere_v1: { la: iso(NOW - H), scope: 'x', ok: false, diferente: [{ tip: 'pozitie', ticker: 'AAPL_US_EQ', app: 1, broker: 2, text: 'AAPL: 1 în aplicație, 2 la broker' }] } }), 'Reconciliere:', 'CAUTION'));
test('gardă «governor · Jurnalul manual e gol» — nimic de verificat', () => declanseaza(gv({}), 'Jurnalul manual e gol', 'NEVERIFICAT'));
test('gardă «governor · nu are curs BCE verificat» — bugetul brokerului în EUR fără curs (notă, verdictul rămâne)', () => {
  const broker = { state: 'ready', verdict: 'TRADE', reasons: [], notes: [], currency: 'EUR', budgetLeft: 100, weekBudgetLeft: 100, totalStopRisk: 0, stopBudgetLeft: 100, positions: 0 };
  const r = gv({ tt_journal_v1: deschisa }, { T212Capital: { read: () => broker } });
  declanseaza(r, 'nu are curs BCE verificat', 'notă'); assert.equal(r.verdict, 'TRADE');
});

// ---------- Contul Trading 212 (T212Capital.build) ----------
const R = lume({}, {}, ['lib/trading212-snapshot.js', 'lib/trading212-performance.js', 'lib/trading212-capital.js']).T212Capital;
const at = iso(NOW);
function cont(f = (x) => x) {
  const x = { scope: 'active', snapshot: { environment: 'live', fetchedAt: at, summary: { currency: 'EUR', totalValue: 10000, available: 9000, reserved: 0, invested: 1000 }, positions: [{ ticker: 'TEST_US_EQ', quantity: 10, currentPrice: 100, instrumentCurrency: 'EUR', currency: 'EUR', value: 1000 }] },
    notes: { TEST_US_EQ: { stop: 95, stopCurrency: 'EUR' } }, history: { scope: 'active', currency: 'EUR', rows: [], complete: true, stale: false, state: 'ready' }, now: NOW, cfg: {} };
  f(x); return R.build(x);
}
const fill = (id, realized, o = {}) => ({ id, orderId: id, ticker: 'TEST_US_EQ', type: 'TRADE', side: 'SELL', currency: 'EUR', date: iso(NOW - 1000), realized, ...o });
const istoric = (obs) => (x) => { x.daily = obs.map(([t, total]) => ({ at: iso(t), total, currency: 'EUR' })); x.cash = { transactions: { items: [], fetchedAt: at } }; };

test('curat: starea de pornire a testelor contului e TRADE (fiecare test de mai jos strică un singur lucru)', () => assert.equal(cont().verdict, 'TRADE'));
test('gardă «trading212-capital · Snapshot Invest cu timp invalid» — citirea e din viitor', () => declanseaza(cont((x) => { x.snapshot.fetchedAt = iso(NOW + 120000); }), 'Snapshot Invest cu timp invalid', 'HALTED'));
test('gardă «trading212-capital · Copia contului are» — aparatul pasiv cu o copie de 16 min', () => declanseaza(cont((x) => { x.snapshot.fetchedAt = iso(NOW - 16 * 60000); x.reader = { citeste: false }; }), 'Copia contului are', 'HALTED'));
test('gardă «trading212-capital · Snapshot Invest expirat» — aparatul care citește, copie de 8 min', () => declanseaza(cont((x) => { x.snapshot.fetchedAt = iso(NOW - 8 * 60000); }), 'Snapshot Invest expirat', 'HALTED'));
test('gardă «trading212-capital · nu sunt complete în aceeași monedă» — sold negativ', () => declanseaza(cont((x) => { x.snapshot.summary.available = -1; }), 'nu sunt complete în aceeași monedă', 'HALTED'));
test('gardă «trading212-capital · Lista completă a pozițiilor» — pozițiile lipsesc', () => declanseaza(cont((x) => { x.snapshot.positions = null; }), 'Lista completă a pozițiilor', 'HALTED'));
test('gardă «trading212-capital · Limitele contului sunt invalide» — poziții maxime fracționare', () => declanseaza(cont((x) => { x.cfg = { maxOpenPositions: 2.5 }; }), 'Limitele contului sunt invalide', 'HALTED'));
test('gardă «trading212-capital · Poziție invalidă sau duplicată» — aceeași poziție de două ori', () => declanseaza(cont((x) => { x.snapshot.positions.push({ ...x.snapshot.positions[0] }); }), 'Poziție invalidă sau duplicată', 'HALTED'));
test('gardă «trading212-capital · Cantitate zero cu valoare neverificată» — 0 acțiuni cu valoare', () => declanseaza(cont((x) => { x.snapshot.positions.push({ ticker: 'ZERO_US_EQ', quantity: 0, value: 5 }); }), 'Cantitate zero cu valoare neverificată', 'HALTED'));
test('gardă «trading212-capital · Preț, valoare sau monedă neverificată» — poziția în altă monedă decât contul', () => declanseaza(cont((x) => { x.snapshot.positions[0].currency = 'USD'; }), 'Preț, valoare sau monedă neverificată', 'HALTED'));
test('gardă «trading212-capital · Valoarea poziției nu se reconciliază» — valoarea nu e cantitate × preț', () => declanseaza(cont((x) => { x.snapshot.positions[0].value = 500; }), 'Valoarea poziției nu se reconciliază', 'HALTED'));
test('gardă «trading212-capital · stop sau conversie neverificată» — poziție fără stop documentat', () => declanseaza(cont((x) => { x.notes = {}; }), 'stop sau conversie neverificată', 'CAUTION'));
test('gardă «trading212-capital · Stopul documentat a fost atins» — stopul peste preț', () => declanseaza(cont((x) => { x.notes.TEST_US_EQ.stop = 101; }), 'Stopul documentat a fost atins', 'HALTED'));
test('gardă «trading212-capital · Agregatele nu sunt calculabile» — valori care depășesc numerele finite', () => declanseaza(cont((x) => { x.snapshot.positions = ['A_US_EQ', 'B_US_EQ'].map((ticker) => ({ ticker, quantity: 10, currentPrice: 100, instrumentCurrency: 'EUR', currency: 'EUR', value: 1e308 })); }), 'Agregatele nu sunt calculabile', 'HALTED'));
test('gardă «trading212-capital · Pozițiile nu corespund investițiilor raportate» — investițiile raportate ≠ suma pozițiilor', () => declanseaza(cont((x) => { x.snapshot.summary.invested = 2000; x.snapshot.summary.available = 8000; }), 'Pozițiile nu corespund investițiilor raportate', 'HALTED'));
test('gardă «trading212-capital · Soldul și investițiile depășesc capitalul raportat» — sold + investiții > total', () => declanseaza(cont((x) => { x.snapshot.summary.available = 9500; }), 'Soldul și investițiile depășesc capitalul raportat', 'HALTED'));
test('gardă «trading212-capital · Istoricul complet și actual» — istoric incomplet', () => declanseaza(cont((x) => { x.history.complete = false; }), 'Istoricul complet și actual', 'HALTED'));
test('gardă «trading212-capital · dată invalidă sau viitoare» — o execuție din viitor', () => declanseaza(cont((x) => { x.history.rows = [fill('v', 5, { date: iso(NOW + D) })]; }), 'dată invalidă sau viitoare', 'HALTED'));
test('gardă «trading212-capital · vânzări fără P&L raportat» — vânzare fără rezultat', () => declanseaza(cont((x) => { x.history.rows = [fill('s', null)]; }), 'vânzări fără P&L raportat', 'HALTED'));
test('gardă «trading212-capital · monedă de cont neverificată» — execuție în USD pe un cont EUR', () => declanseaza(cont((x) => { x.history.rows = [fill('u', 5, { currency: 'USD' })]; }), 'monedă de cont neverificată', 'HALTED'));
test('gardă «trading212-capital · Bugetele nu sunt calculabile» — rezultate care depășesc numerele finite', () => declanseaza(cont((x) => { x.history.rows = [fill('a', 1e308), fill('b', 1e308)]; }), 'Bugetele nu sunt calculabile', 'HALTED'));
test('gardă «trading212-capital · Bugetul de pierdere zilnic este epuizat la valoarea de piață» — contul −300 € față de ieri, fără vânzări', () => declanseaza(cont(istoric([[NOW - D, 10300]])), 'Bugetul de pierdere zilnic este epuizat la valoarea de piață', 'HALTED'));
test('gardă «trading212-capital · 75% din bugetul zilnic e consumat la valoarea de piață» — −160 € față de ieri', () => declanseaza(cont(istoric([[NOW - D, 10160]])), '75% din bugetul zilnic e consumat la valoarea de piață', 'CAUTION'));
test('gardă «trading212-capital · Bugetul de pierdere săptămânal este epuizat la valoarea de piață» — −400 € față de vinerea trecută', () => declanseaza(cont(istoric([[NOW - 6 * D, 10400], [NOW - D, 10000]])), 'Bugetul de pierdere săptămânal este epuizat la valoarea de piață', 'HALTED'));
test('gardă «trading212-capital · 75% din bugetul săptămânal e consumat la valoarea de piață» — −240 € față de vinerea trecută', () => declanseaza(cont(istoric([[NOW - 6 * D, 10240], [NOW - D, 10000]])), '75% din bugetul săptămânal e consumat la valoarea de piață', 'CAUTION'));
test('gardă «trading212-capital · Riscul total până la stop nu este acoperit» — ordine rezervate', () => declanseaza(cont((x) => { x.snapshot.summary.available = 8900; x.snapshot.summary.reserved = 100; }), 'Riscul total până la stop nu este acoperit', 'HALTED'));
test('gardă «trading212-capital · Limita de poziții reale este atinsă» — limita 1, o poziție', () => declanseaza(cont((x) => { x.cfg = { maxOpenPositions: 1 }; }), 'Limita de poziții reale este atinsă', 'HALTED'));
test('gardă «trading212-capital · Nu există sold disponibil» — sold zero', () => declanseaza(cont((x) => { x.snapshot.summary.available = 0; }), 'Nu există sold disponibil', 'HALTED'));
test('gardă «trading212-capital · Bugetul de pierdere zilnic sau săptămânal este epuizat» — −250 € realizat azi', () => declanseaza(cont((x) => { x.history.rows = [fill('s', -250)]; }), 'Bugetul de pierdere zilnic sau săptămânal este epuizat', 'HALTED'));
test('gardă «trading212-capital · Bugetul total până la stop este epuizat» — riscul la stop = 5 % din cont', () => declanseaza(cont((x) => { x.notes.TEST_US_EQ.stop = 50; }), 'Bugetul total până la stop este epuizat', 'HALTED'));
const buys = (n) => (x) => { x.history.rows = Array.from({ length: n }, (_, i) => fill('b' + i, null, { side: 'BUY' })); };
test('gardă «trading212-capital · Limita intrărilor BUY» — a 5-a cumpărare de azi', () => declanseaza(cont(buys(5)), 'Limita intrărilor BUY', 'HALTED'));
test('gardă «trading212-capital · următoarea e ultima permisă» — a 4-a cumpărare de azi', () => declanseaza(cont(buys(4)), 'următoarea e ultima permisă', 'CAUTION'));
test('gardă «trading212-capital · ordine de ieșire consecutive cu pierdere» — 3 ieșiri pe pierdere', () => declanseaza(cont((x) => { x.history.rows = [1, 2, 3].map((k) => fill('l' + k, -10, { date: iso(NOW - k * 1000) })); }), 'ordine de ieșire consecutive cu pierdere', 'HALTED'));
test('gardă «trading212-capital · Concentrare peste limita» — 10 % pe un instrument față de limita de 5 %', () => declanseaza(cont((x) => { x.cfg = { maxInstrumentPct: 5 }; }), 'Concentrare peste limita', 'CAUTION'));
test('gardă «trading212-capital · FX estimat din valoarea poziției» — acțiune în USD pe un cont EUR', () => declanseaza(cont((x) => { Object.assign(x.snapshot.positions[0], { instrumentCurrency: 'USD', currentPrice: 125 }); x.notes.TEST_US_EQ = { stop: 120, stopCurrency: 'USD' }; }), 'FX estimat din valoarea poziției', 'CAUTION'));
test('gardă «trading212-capital · Reconciliere:» — o diferență față de broker', () => declanseaza(cont((x) => { x.reconciliere = { la: at, scope: 'active', ok: false, diferente: [{ tip: 'numerar', ticker: null, app: 9000, broker: 8990, text: 'numerar: 9.000 în aplicație, 8.990 la broker' }] }; }), 'Reconciliere:', 'CAUTION'));
test('gardă «trading212-capital · 75% dintr-un buget de pierdere este consumat» — −160 € realizat azi', () => declanseaza(cont((x) => { x.history.rows = [fill('s', -160)]; }), '75% dintr-un buget de pierdere este consumat', 'CAUTION'));
