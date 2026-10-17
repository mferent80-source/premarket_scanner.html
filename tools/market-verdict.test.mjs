// 17.10.2026 — Verdictul pieței (pagina Astăzi): reguli fixe, surse lipsă spuse, nu ghicite.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const c = {}; vm.createContext(c); vm.runInContext(readFileSync('lib/market-verdict.js', 'utf8'), c); const MV = c.MarketVerdict;
const serie = (n, f) => Array.from({ length: n }, (_, i) => ({ at: i, value: f(i) }));
const piata = (sus) => ({ items: [
  { symbol: 'SPY', state: 'ready', price: sus ? 120 : 80, asOf: '2026-10-16', points: serie(260, () => 100), indicators: {} },
  { symbol: 'QQQ', state: 'ready', price: sus ? 120 : 80, points: serie(260, () => 100), indicators: {} },
  { symbol: '^VIX', state: 'ready', price: sus ? 13 : 34, changePct: 2 },
  { symbol: '^TNX', state: 'ready', price: 4, points: serie(60, (i) => (sus ? 4.4 - i * 0.01 : 3.6 + i * 0.01)) }],
  breadth: { state: 'ready', above50: sus ? 72 : 22, points: serie(30, () => (sus ? 60 : 35)) } });
const sect = (def) => (def ? ['Utilities', 'Consumer Defensive', 'Healthcare', 'Technology', 'Energy'] : ['Technology', 'Industrials', 'Financial', 'Utilities', 'Healthcare']).map((name, i) => ({ name, ratio: 0.5 - i * 0.05 }));

test('piață slabă ⇒ Defensiv; piață puternică ⇒ Favorabil; fraza spune motivele', () => {
  const rau = MV.compute({ market: piata(false), sectors: sect(true), now: Date.parse('2026-10-17T08:00:00Z') });
  assert.equal(rau.label.id, 'defensiv'); assert.match(rau.fraza, /VIX e la nivel de panică|participarea e slabă/);
  const bun = MV.compute({ market: piata(true), sectors: sect(false), now: Date.parse('2026-10-17T08:00:00Z') });
  assert.equal(bun.label.id, 'favorabil'); assert.equal(bun.citite, 5); // regimul macro necitit ⇒ nu se numără
  assert.match(bun.indicatori.find((x) => x.id === 'macro').reading, /Necitit/);
});
test('prea puține surse ⇒ „Neconfirmat”, fără planuri noi; HTML-ul nu se strică', () => {
  const v = MV.compute({ market: { items: [], breadth: { state: 'loading' } } });
  assert.equal(v.label.id, 'necunoscut'); assert.match(v.pentruTine[0], /fără planuri noi/);
  assert.match(MV.render(v), /Neconfirmat/);
});
test('ce vine: evenimentele din 7 zile, decizia Fed o singură dată, rezultatele pozițiilor marcate pentru tine', () => {
  const now = Date.parse('2026-11-02T08:00:00Z'), ev = [{ d: new Date('2026-11-04T19:00:00Z'), event: 'FOMC Rate Decision', impact: 'high' }, { d: new Date('2026-11-04T19:30:00Z'), event: 'FOMC Press Conference', impact: 'high' }, { d: new Date('2026-11-20T13:30:00Z'), event: 'CPI YoY + Core CPI', impact: 'high' }];
  const v = MV.compute({ market: piata(true), sectors: sect(false), events: ev, earnings: [{ symbol: 'AAPL', date: '2026-11-03' }], positions: [{ symbol: 'AAPL' }], now });
  assert.equal(JSON.stringify(v.ceVine.map((x) => x.ce)), JSON.stringify(['Rezultatele AAPL', 'Fed — decizia de dobândă']));
  assert.ok(v.pentruTine.some((t) => /AAPL/.test(t)));
});
test('știrile: doar linkuri https; javascript: și adresele cu parolă rămân text', () => {
  const v = MV.compute({ market: piata(true), sectors: sect(false), news: [{ title: 'Rău', url: 'javascript:alert(1)', publishedAt: '2026-10-16T10:00:00Z' }, { title: 'Bun', url: 'https://example.com/a', publishedAt: '2026-10-16T09:00:00Z' }, { title: 'Parolă', url: 'https://u:p@example.com/', publishedAt: '2026-10-16T08:00:00Z' }] });
  const h = MV.render(v); assert.doesNotMatch(h, /javascript:/); assert.match(h, /href="https:\/\/example.com\/a"/); assert.doesNotMatch(h, /u:p@/); assert.match(h, /<span>Rău<\/span>/);
});
