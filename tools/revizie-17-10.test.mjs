// 17.10.2026 — revizia independentă a codului cu bani (Bilanțul tău, Verdictul pieței, alertele pe poziții): un test pe fiecare defect reparat.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const load = (files) => { const c = { Intl, Date, Math, JSON, Map, Set, URL, String, Number, Array, Object }; c.window = c; vm.createContext(c); for (const f of files) vm.runInContext(readFileSync(f, 'utf8'), c); return c; };
const c = load(['lib/journal-review.js', 'lib/market-verdict.js']), J = c.JournalReview, MV = c.MarketVerdict;
const zi = (d) => Date.parse(d + 'T21:00:00Z');

test('(1) datele pieței nu mai îngheață: ttl în SECUNDE peste tot unde codul nou cere serii (D.fetchStock socotește în secunde)', () => {
  for (const f of ['lib/market-verdict.js', 'journal/review.js', 'today/view.js', 'lib/journal-review.js', 'lib/today-attention.js']) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /ttl:\s*\d+\s*\*\s*\d{4,}/, f + ': ttl în milisecunde');
  }
});
test('(2) fără privit în viitor: intrarea din timpul sesiunii vede sesiunea de ieri; după 16:00 la New York vede și ziua ei', () => {
  const ist = [{ asOf: '2026-10-12', label: 'neutru' }, { asOf: '2026-10-13', label: 'defensiv' }];
  assert.equal(J.verdictLa(Date.parse('2026-10-13T15:00:00Z'), ist, null).label, 'neutru');   // 11:00 NY
  assert.equal(J.verdictLa(Date.parse('2026-10-13T20:30:00Z'), ist, null).label, 'defensiv'); // 16:30 NY
  // verdictul parțial: o prăbușire în CHIAR ziua intrării (după ora intrării) nu intră în calcul
  const bare = (f) => Array.from({ length: 400 }, (_, i) => ({ t: Date.UTC(2025, 0, 1, 21) + i * 86400000, c: f(i) }));
  const ultima = 399, dUlt = new Date(Date.UTC(2025, 0, 1, 21) + ultima * 86400000).toISOString().slice(0, 10);
  const serii = { SPY: bare(() => 100), QQQ: bare(() => 100), '^VIX': bare((i) => (i === ultima ? 45 : 14)) };
  assert.equal(J.partial(J.cunoscutLa(Date.parse(dUlt + 'T15:00:00Z')), serii).label, 'favorabil', 'VIX 45 de la închiderea zilei intrării nu se vedea la 11:00');
  assert.equal(J.partial(J.cunoscutLa(Date.parse(dUlt + 'T21:00:00Z')), serii).label, 'defensiv', 'după închidere (17:00 NY) VIX 45 se vede: −2');
});
test('(3) raportul fiscal: cursul mediu anual = media cursurilor zilnice ale anului; anul încheiat nu mai e provizoriu', () => {
  const curs = {}; for (let i = 0; i < 250; i++) { const d = new Date(Date.UTC(2025, 0, 2) + i * 1.45 * 86400000).toISOString().slice(0, 10); curs[d] = { USD: i % 2 ? 4.4 : 4.6 }; }
  curs['2025-12-30'] = { USD: 4.5 };
  const m = J.cursMediu(curs, 'USD', 2025); assert.ok(Math.abs(m.r - 4.5) < 0.01); assert.equal(m.provizoriu, false); assert.equal(J.cursMediu(curs, 'RON', 2025).r, 1); assert.equal(J.cursMediu(curs, 'CHF', 2025), null);
});
test('(4) robotul păstrează anii vechi ai cursului BNR (raportul pe 2025 trebuie să meargă și în 2027)', () => {
  assert.match(readFileSync('tools/verdict-piata-robot.mjs', 'utf8'), /curs = existsSync\(CURS\)[^\n]*JSON\.parse\(readFileSync\(CURS/);
});
test('(5) monede diferite: fără clasament al vânzărilor și fără medie / total adunate', () => {
  const data = { accounts: { a: { environment: 'live', items: [
    { id: 1, ticker: 'AAPL_US_EQ', side: 'SELL', date: '2026-10-13T15:00:00Z', quantity: 1, price: 1, realized: 50, currency: 'USD' },
    { id: 2, ticker: 'SAP_DE_EQ', side: 'SELL', date: '2026-10-14T15:00:00Z', quantity: 1, price: 1, realized: -30, currency: 'EUR' }] } } };
  const s = J.saptamana(J.tranzactii(data, 'a'), { now: Date.parse('2026-10-17T10:00:00Z') });
  assert.equal(s.total, null); assert.equal(s.cea_mai_buna, null); assert.equal(s.monedeAmestecate, true);
  const html = J.render({ sapt: s, vt: { rows: [{}], normal: { n: 2, total: 20, medie: 10, castigatoare: 1 }, redus: { n: 0, total: 0, medie: null, castigatoare: 0 }, moneda: null, monedeAmestecate: true, dinRobot: 0 } });
  assert.match(html, /monede diferite/); assert.doesNotMatch(html, /\+20,00/); assert.doesNotMatch(html, /\+10,00/);
});
test('(6) rotunjire simetrică: SPY în trend + QQQ amestecat = +1, SPY ieșit + QQQ amestecat = −1 (înainte: 0)', () => {
  const m = (sus) => { const pts = Array.from({ length: 220 }, (_, i) => ({ value: 100 + (sus ? i : -i) * 0.1 })); return { symbol: '', state: 'ready', points: pts, price: pts.at(-1).value }; };
  const amestecat = () => { const pts = Array.from({ length: 220 }, (_, i) => ({ value: i < 210 ? 100 + i * 0.1 : 121 - (i - 209) * 0.6 })); return { symbol: 'QQQ', state: 'ready', points: pts, price: pts.at(-1).value }; }; // peste media de 200, sub cea de 50
  const r = (spySus) => MV.compute({ market: { items: [{ ...m(spySus), symbol: 'SPY' }, amestecat()] } }).indicatori.find((x) => x.id === 'trend').score;
  assert.equal(r(true), 1); assert.equal(r(false), -1);
});
test('(7) corelația afișată e media perechilor din grupul fiecăruia', () => {
  const b = (f) => Array.from({ length: 130 }, (_, i) => ({ t: Date.UTC(2026, 0, 1) + i * 86400000, c: 100 * (1 + 0.03 * f(i)) }));
  const serii = { A: b((i) => Math.sin(i / 2)), B: b((i) => Math.sin(i / 2 + 0.02)), C: b((i) => Math.cos(i * 1.7)), D: b((i) => Math.cos(i * 1.7) + 0.6 * Math.sin(i * 0.9)) };
  const g = MV.corelatii(serii, ['A', 'B', 'C', 'D'].map((s) => ({ s, value: 100 })), 400);
  assert.equal(g.length, 2); assert.ok(g.find((x) => x.simboluri.includes('A')).corelatie > g.find((x) => x.simboluri.includes('C')).corelatie);
});
test('(8) HYG / IEF aliniate pe dată; expirarea mutată pe joi în Vinerea Mare și la Juneteenth; doar execuțiile de tip TRADE', () => {
  const t0 = Date.UTC(2026, 0, 1, 21), h = Array.from({ length: 80 }, (_, i) => ({ t: t0 + i * 86400000, c: 80 })), f = h.filter((_, i) => i !== 10).map((x) => ({ t: x.t, c: 100 }));
  const ind = MV.compute({ market: { items: [{ symbol: '^TNX', state: 'ready', points: Array.from({ length: 30 }, () => ({ value: 4 })), price: 4 }] }, extra: { serii: { HYG: h, IEF: f } } }).indicatori.find((x) => x.id === 'dobanda');
  assert.match(ind.reading, /\+0(,0)?% față de media de 50 de zile|0,0% față/); // raportul constant 0,8 ⇒ abatere 0, deși IEF are o zi lipsă
  const zileOpex = (now) => MV.expirari(now, 40).map((x) => new Date(x.t).toISOString().slice(0, 10));
  assert.ok(zileOpex(Date.UTC(2025, 3, 1)).includes('2025-04-17'), 'aprilie 2025: Vinerea Mare ⇒ joi 17');
  assert.ok(zileOpex(Date.UTC(2026, 5, 1)).includes('2026-06-18'), 'iunie 2026: Juneteenth ⇒ joi 18');
  assert.ok(zileOpex(Date.UTC(2026, 9, 1)).includes('2026-10-16'), 'octombrie 2026: vineri normală');
  const tx = J.tranzactii({ accounts: { a: { environment: 'live', items: [{ id: 1, type: 'STOCK_SPLIT', ticker: 'X_US_EQ', side: 'BUY', date: '2026-01-02T15:00:00Z', quantity: 1, price: 1 }, { id: 2, type: 'TRADE', ticker: 'X_US_EQ', side: 'BUY', date: '2026-01-03T15:00:00Z', quantity: 1, price: 1 }] } } }, 'a');
  assert.equal(tx.length, 1); assert.equal(tx[0].id, '2');
});
