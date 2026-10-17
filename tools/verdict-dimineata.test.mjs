// 17.10.2026 — I-684: rezumatul de dimineață pe Discord.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mesaj } from './verdict-dimineata.mjs';

test('rezumatul: verdictul și schimbarea de ieri, futures, evenimentele zilei, marile companii de azi și mâine', () => {
  const j = { label: 'defensiv', score: -3, asOf: '2026-10-19', fraza: 'VIX a sărit și creditul slăbește.', istoric: [{ asOf: '2026-10-16', label: 'prudent' }, { asOf: '2026-10-19', label: 'defensiv' }], rezultateMari: [{ symbol: 'NFLX', date: '2026-10-20', cand: 'după închidere' }, { symbol: 'META', date: '2026-10-21' }, { symbol: 'PG', date: '2026-10-23' }] };
  const m = mesaj(j, { zi: '2026-10-20', ev: [{ d: new Date('2026-10-20T12:30:00Z'), event: 'Retail Sales MoM', impact: 'med' }], fut: { es: -0.4, nq: 0.62 }, oraRO: () => '15:30' });
  assert.match(m, /Prudent → \*\*Defensiv\*\* · scor −3/); assert.match(m, /Futures acum: S&P −0,4% · Nasdaq \+0,6%/); assert.match(m, /Azi: Vânzările cu amănuntul la 15:30/);
  assert.match(m, /Rezultate mari: NFLX \(după închidere\), META \(mâine\)/); assert.doesNotMatch(m, /PG/); assert.ok(m.length <= 1900);
  assert.equal(mesaj(null, { zi: '2026-10-20' }), null);
});
