// 17.10.2026 — Jurnal → Raport, ideile I-690..I-695: etichete, planul față de execuție, limita lunară care oprește, încrederea, S&P, „ce-ar fi fost dacă”.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const c = { Intl, Date, Math, JSON, Map, Set, URL, String, Number, Array, Object, WeakMap, Float64Array }; c.window = c; c.localStorage = mem(); vm.createContext(c);
for (const f of ['lib/execution-review.js', 'lib/journal-report.js', 'lib/monthly-limit.js']) vm.runInContext(readFileSync(f, 'utf8'), c);
const J = c.JournalReport, ML = c.MonthlyLimit, DAY = 86400000;

test('I-692 — limita lunară: rezultatul lunii din execuții (ziua de bursă New York — I-751, 27.10), stările, textul pentru Astăzi / Planuri; cheia veche se mută în setările sincronizate', () => {
  const s = mem(), now = Date.parse('2026-10-17T12:00:00Z');
  s.setItem('tt_journal_limita_luna_v1', '1000'); assert.equal(ML.limita(s), 1000); assert.equal(s.getItem('tt_journal_limita_luna_v1'), null); assert.equal(JSON.parse(s.getItem('tt_journal_settings_v1')).limitaLuna, 1000);
  assert.equal(ML.stare({ storage: s, now }).stare, 'neverificat');
  const items = [{ side: 'SELL', type: 'TRADE', realized: -500, currency: 'RON', date: '2026-10-05T12:00:00Z' }, { side: 'SELL', type: 'TRADE', realized: -320, currency: 'RON', date: '2026-10-16T12:00:00Z' },
    { side: 'SELL', type: 'TRADE', realized: -9000, currency: 'RON', date: '2026-09-30T21:30:00Z' }]; // 1 oct. 00:30 ora României, dar 30 sept. 17:30 New York ⇒ în SEPTEMBRIE (ceasul unic NY, I-751)
  const l = ML.dinExecutii(items, { now }); assert.equal(l.n, 2); assert.equal(l.rez, -820);
  assert.equal(ML.dinExecutii(items, { now: Date.parse('2026-09-30T23:00:00Z') }).n, 1, 'la 19:00 NY pe 30 sept. luna e încă septembrie: vânzarea de la 21:30Z intră');
  ML.salveazaLuna(ML.dinExecutii(items.slice(0, 2), { now }), s); const st = ML.stare({ storage: s, now });
  assert.equal(JSON.parse(s.getItem('tt_journal_settings_v1')).t212Luna, undefined, 'rezultatul lunii NU intră în setările sincronizate (conflict la fiecare rescriere)'); assert.ok(s.getItem('tt_journal_luna_t212_v1')); assert.equal(st.stare, 'aproape'); assert.ok(Math.abs(st.folosit - 82) < 1e-9);
  assert.match(ML.text(st, now).text, /Ai pierdut 820,0 lei din 1\.000,0 lei în octombrie/);
  ML.puneLimita(700, s); assert.equal(ML.stare({ storage: s, now }).stare, 'depasit'); assert.match(ML.text(ML.stare({ storage: s, now }), now).text, /Pauză de la intrări noi până pe 1 noiembrie/);
  ML.puneLimita(5000, s); assert.equal(ML.text(ML.stare({ storage: s, now }), now), null, 'sub 75%: nimic de spus');
  const vechi = ML.stare({ storage: s, now: now + 4 * DAY }); assert.equal(vechi.vechi, true);
  assert.equal(ML.stare({ storage: s, now: Date.parse('2026-11-02T12:00:00Z') }).stare, 'neverificat', 'luna nouă: rezultatul vechi nu se mai folosește');
});
test('I-690 — etichetele: doar cele cunoscute, tabelul pe etichetă cu totalul / R, numărul celor neetichetate', () => {
  const tr = J.cuEtichete([{ id: 'a', rez: -100, R: -1 }, { id: 'b', rez: -50, R: -0.5 }, { id: 'c', rez: 80 }], { a: ['revenge', 'nimic'], b: { e: ['revenge', 'fomo'] } }); // forma nouă (listă) și cea veche ({e})
  assert.equal(JSON.stringify(tr[0].etichete), '["revenge"]');
  const p = J.peEticheta(tr), rev = p.randuri.find((x) => x.k === 'revenge'); assert.equal(rev.n, 2); assert.equal(rev.v, -150); assert.equal(p.fara, 1); assert.equal(p.randuri[0].k, 'revenge', 'cea mai scumpă prima');
});
test('I-691 — planul față de execuție: la țintă / manual / la stop / sub stop; doar analizele salvate cu stop + țintă', () => {
  const b = { stopSursa: 'analiza', entry: 100, stop: 95, tinta: 110, rez: 1 };
  const G = J.planVsExecutie([{ ...b, exit: 111 }, { ...b, exit: 104 }, { ...b, exit: 94.8 }, { ...b, exit: 90 }, { ...b, exit: 104, stopSursa: 'portofoliu' }, { ...b, exit: 104, tinta: null }]);
  assert.equal(G.tinta.length, 1); assert.equal(G.manual.length, 1); assert.equal(G.stop.length, 1); assert.equal(G.subStop.length, 1); assert.ok(Math.abs(G.manual[0].drum - 0.4) < 1e-9);
});
test('I-694 — S&P în aceleași zile, fără privit în viitor: intrarea din timpul sesiunii pornește de la închiderea de ieri', () => {
  const spy = Array.from({ length: 30 }, (_, i) => ({ t: Date.UTC(2026, 2, 2, 20, 0) + i * DAY, c: 100 + i }));
  const row = { ticker: 'AAPL_US_EQ', intrare: Date.parse('2026-03-05T15:00:00Z'), iesire: Date.parse('2026-03-10T21:30:00Z'), pct: 10, cost: 1000, rez: 100 };
  const f = J.fataDeSpy(row, spy); assert.ok(Math.abs(f.spy - ((108 / 102 - 1) * 100)) < 1e-9, 'de la închiderea din 4 martie (102) la cea din 10 martie (108)'); assert.ok(Math.abs(f.peste - (10 - f.spy)) < 1e-9); assert.ok(Math.abs(f.lei - (100 - 1000 * f.spy / 100)) < 1e-9);
  assert.equal(J.fataDeSpy({ ...row, ticker: 'SAP_DE_EQ' }, spy), null);
});
test('I-693 — încrederea: aceleași cifre la fiecare desen, intervalul cuprinde media, sub 10 tranzacții nimic', () => {
  const tr = Array.from({ length: 40 }, (_, i) => ({ rez: i % 3 === 0 ? -100 : 80 }));
  const a = J.incredere(tr), b = J.incredere(tr); assert.equal(JSON.stringify(a), JSON.stringify(b)); assert.ok(a.lo <= a.medie && a.medie <= a.hi); assert.ok(a.dd95 >= a.ddMed); assert.ok(a.pNeg >= 0 && a.pNeg <= 100);
  assert.equal(J.incredere(tr.slice(0, 9)), null);
  const pierdere = J.incredere(Array.from({ length: 30 }, () => ({ rez: -10 }))); assert.equal(pierdere.trebuie, null);
});
test('I-695 — reguli pe bare: stopul la −1 R (cu salt la deschidere), pragul după +3%, ieșirea după 5 sesiuni; ziua intrării nu contează', () => {
  const bar = (o, h, l, c2) => ({ t: 0, o, h, l, c: c2 });
  const bars = [bar(100, 99, 80, 100), bar(100, 101, 98, 100), bar(96, 97, 93, 95), bar(95, 96, 94, 95)];   // ziua 0 (intrare) are minim 80: ignorat
  const r = J.dacaReguli({ entry: 100, stop: 97, stopSursa: 'analiza', pct: -5 }, bars, 0, 3);
  assert.equal(J.dacaReguli({ entry: 100, stop: 97, stopSursa: 'portofoliu', pct: -5 }, bars, 0, 3).stop1R, null, 'stopul de AZI din Portofoliu nu se folosește (privit în viitor)'); assert.ok(Math.abs(r.stop1R - -4) < 1e-9, 'salt sub stop la deschidere: iese la 96');
  const b2 = [bar(100, 100, 100, 100), bar(101, 104, 100.5, 103), bar(103, 103, 99, 100), bar(100, 112, 100, 110)];
  assert.equal(J.dacaReguli({ entry: 100, stop: null, pct: 10 }, b2, 0, 3).prag3, 0, 'armat la +4%, apoi minim 99 ⇒ ieșire pe prag');
  assert.equal(J.dacaReguli({ entry: 100, stop: null, pct: 10 }, b2, 0, 3).stop1R, null, 'fără stop cunoscut, fără regula R');
  const b3 = Array.from({ length: 9 }, (_, i) => bar(100 + i, 101 + i, 99 + i, 100 + i)); assert.ok(Math.abs(J.dacaReguli({ entry: 100, pct: 8 }, b3, 0, 8).zile5 - 5) < 1e-9);
});
test('raportul cu ideile: secțiunile noi la vedere, butonul de etichete, coloana S&P; editorul de etichete deschis pe rândul ales; CSV cu etichete', () => {
  const now = Date.parse('2026-10-17T12:00:00Z'), tr = J.cuEtichete(Array.from({ length: 12 }, (_, i) => ({ id: 's' + i, ticker: 'AAPL_US_EQ', sym: 'AAPL', intrare: now - (40 - i) * DAY, iesire: now - (38 - i) * DAY, zile: 2, entry: 100, exit: 100 + (i % 3) - 1, pct: (i % 3) - 1, cost: 1000, fees: 1, rez: ((i % 3) - 1) * 10, stopSursa: null })), { s1: { e: ['fomo'] } });
  const html = J.render({ tr, toate: tr, moneda: 'RON', perioada: 0, now, editez: 's1', toateRandurile: true });
  for (const t of ['Cât de sigur e rezultatul tău', 'Ce te-a costat fiecare greșeală', 'Planul față de execuție', 'Ce-ar fi fost dacă', 'Tu față de S&amp;P', 'Față de S&amp;P', 'data-jrr-et-ed="s1"', 'data-jrr-et="revenge" data-jrr-id="s1"']) assert.ok(html.includes(t), 'lipsește: ' + t);
  assert.doesNotMatch(html, /NaN|undefined|Infinity/); assert.match(J.csv(tr, 'RON'), /;"FOMO"/);
});
