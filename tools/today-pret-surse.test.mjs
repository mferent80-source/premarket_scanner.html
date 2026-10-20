// 20.10.2026 (I-731, după revizia Opus): a doua sursă de preț pe Astăzi — prețul Trading 212 (din instantaneul contului, pentru că pozițiile
// modelului n-au preț) față de închiderea Yahoo, doar în afara orelor NY și cu contul citit după închidere; splitul de după stop ⇒ „refă-l”.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function TA() { const c = { console, Date, Intl, Map, Set }; c.window = c; vm.createContext(c); vm.runInContext(readFileSync('lib/today-attention.js', 'utf8'), c); return c.TodayAttention; }
const SEARA = Date.parse('2026-10-20T22:30:00Z'), IN_PIATA = Date.parse('2026-10-20T15:30:00Z'); // 18:30 NY (după închidere) / 11:30 NY
const ZI = Date.parse('2026-10-20T13:30:00Z'); // bara zilei (deschiderea), închisă la 20:00Z
const poz = [{ ticker: 'MU_US_EQ', quantity: 10, value: 1000 }]; // ca în TodayDashboardModel: fără currentPrice / instrumentCurrency
const snapshot = new Map([['MU_US_EQ', { ticker: 'MU_US_EQ', quantity: 10, currentPrice: 103, instrumentCurrency: 'USD' }]]);
const bare = (c, meta = null) => { const b = [{ t: ZI - 86400000, c: 99 }, { t: ZI, c }]; if (meta) Object.defineProperty(b, 'meta', { value: meta }); return b; };

test('în afara orelor, cu contul citit după închidere: abatere > 1 % între T212 și Yahoo ⇒ alertă (grav 2); sub 1 % ⇒ nimic', () => {
  const A = TA();
  const a = A.alerte({ positions: poz, stops: new Set(['MU_US_EQ']), serii: { MU: bare(100) }, preturi: snapshot, contLa: SEARA - 60000, now: SEARA });
  assert.ok(a.some((x) => x.grav === 2 && /prețul din Trading 212 \(103,00\) diferă de închiderea Yahoo \(100,00\) cu 3,0%/.test(x.text)));
  const b = A.alerte({ positions: poz, stops: new Set(['MU_US_EQ']), serii: { MU: bare(102.5) }, preturi: snapshot, contLa: SEARA - 60000, now: SEARA });
  assert.equal(b.some((x) => /nu se potrivesc între surse/.test(x.text)), false, '0,5 % e sub prag');
});
test('nu se compară în timpul ședinței, fără ora citirii contului, cu contul citit înaintea închiderii sau fără instantaneu', () => {
  const A = TA(), baza = { positions: poz, stops: new Set(['MU_US_EQ']), serii: { MU: bare(100) } };
  for (const extra of [{ preturi: snapshot, contLa: IN_PIATA - 60000, now: IN_PIATA }, { preturi: snapshot, contLa: null, now: SEARA }, { preturi: snapshot, contLa: ZI + 3600000, now: SEARA }, { preturi: null, now: SEARA, contLa: SEARA }])
    assert.equal(A.alerte({ ...baza, ...extra }).some((x) => /nu se potrivesc/.test(x.text)), false, JSON.stringify(Object.keys(extra)));
  assert.equal(A.inAfaraOrelor(IN_PIATA), false); assert.equal(A.inAfaraOrelor(SEARA), true); assert.equal(A.PRAG_SURSE, 1);
});
test('split după ce ai pus stopul ⇒ „refă-l” (grav 3); split de dinainte de stop ⇒ nimic', () => {
  const A = TA(), stopLa = SEARA - 10 * 86400000, split = { type: 'splits', at: Date.parse('2026-10-17T12:00:00Z'), numerator: 10, denominator: 1 }; // la amiază UTC: aceeași zi (17.10) în orice fus al mașinii
  const a = A.alerte({ positions: poz, stops: new Set(['MU_US_EQ']), serii: { MU: bare(100, { corporateEvents: [split] }) }, stopuriLa: new Map([['MU_US_EQ', { stop: 950, la: stopLa }]]), now: SEARA });
  assert.ok(a.some((x) => x.grav === 3 && /split 10:1 pe 17\.10, după ce ai pus stopul \(950,00\)/.test(x.text) && /refă-l/.test(x.text)));
  const b = A.alerte({ positions: poz, stops: new Set(['MU_US_EQ']), serii: { MU: bare(100, { corporateEvents: [split] }) }, stopuriLa: new Map([['MU_US_EQ', { stop: 95, la: SEARA - 86400000 }]]), now: SEARA });
  assert.equal(b.some((x) => /split/.test(x.text)), false);
});
test('ordinul STOP parțial la broker ⇒ rândul lui (grav 3), cu cantitățile', () => {
  const A = TA();
  const a = A.alerte({ positions: poz, stops: new Set(['MU_US_EQ']), ordineBroker: { citit: true, pozitii: new Map([['MU_US_EQ', { stare: 'partial', sursa: 'broker', ordin: { stopPrice: 95, quantity: 4 } }]]) }, now: SEARA });
  assert.ok(a.some((x) => x.grav === 3 && /acoperă doar 4,00 din 10,00 acțiuni/.test(x.text)));
});
