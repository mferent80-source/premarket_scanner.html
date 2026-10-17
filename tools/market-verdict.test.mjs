// 17.10.2026 — Verdictul pieței (pagina Astăzi): reguli fixe, surse lipsă spuse, nu ghicite.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const c = { URL }; vm.createContext(c); vm.runInContext(readFileSync('lib/market-verdict.js', 'utf8'), c); const MV = c.MarketVerdict;
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
  assert.match(bun.indicatori.find((x) => x.id === 'macro').reading, /Se calculează/); // fără seriile în plus, regimul încă se calculează
});
test('prea puține surse ⇒ „Neconfirmat”, fără planuri noi; HTML-ul nu se strică', () => {
  const v = MV.compute({ market: { items: [], breadth: { state: 'loading' } } });
  assert.equal(v.label.id, 'necunoscut'); assert.match(v.pentruTine[0], /fără planuri noi/);
  assert.match(MV.render(v), /Neconfirmat/);
});
test('ce vine: evenimentele din 7 zile, decizia Fed o singură dată, rezultatele pozițiilor marcate pentru tine', () => {
  const now = Date.parse('2026-11-02T08:00:00Z'), ev = [{ d: new Date('2026-11-04T19:00:00Z'), event: 'FOMC Rate Decision', impact: 'high' }, { d: new Date('2026-11-04T19:30:00Z'), event: 'FOMC Press Conference', impact: 'high' }, { d: new Date('2026-11-20T13:30:00Z'), event: 'CPI YoY + Core CPI', impact: 'high' }];
  const v = MV.compute({ market: piata(true), sectors: sect(false), events: ev, earnings: [{ symbol: 'AAPL', date: '2026-11-03' }], positions: [{ symbol: 'AAPL' }], now });
  assert.equal(JSON.stringify(v.ceVine.map((x) => x.ce)), JSON.stringify(['Rezultatele AAPL (poziția ta)', 'Fed — decizia de dobândă']));
  assert.ok(v.pentruTine.some((t) => /AAPL/.test(t)));
});
test('știrile: doar linkuri https; javascript: și adresele cu parolă rămân text', () => {
  const v = MV.compute({ market: piata(true), sectors: sect(false), news: [{ title: 'Rău', url: 'javascript:alert(1)', publishedAt: '2026-10-16T10:00:00Z' }, { title: 'Bun', url: 'https://example.com/a', publishedAt: '2026-10-16T09:00:00Z' }, { title: 'Parolă', url: 'https://u:p@example.com/', publishedAt: '2026-10-16T08:00:00Z' }] });
  const h = MV.render(v); assert.doesNotMatch(h, /javascript:/); assert.match(h, /href="https:\/\/example.com\/a"/); assert.doesNotMatch(h, /u:p@/); assert.match(h, /<span>Rău<\/span>/);
});
// 17.10.2026 — I-676..I-681
const bare = (n, f) => Array.from({ length: n }, (_, i) => ({ t: Date.UTC(2026, 0, 1) + i * 86400000, c: f(i) }));
test('I-679: VIX pe 9 zile peste cel pe 3 luni = stres imediat (galben), plus mișcarea tipică pe zi', () => {
  const m = piata(true); m.items[2].price = 14; m.items[2].changePct = 1; // calm
  const fara = MV.compute({ market: m, extra: { serii: { '^VIX9D': bare(5, () => 13), '^VIX3M': bare(5, () => 16) } } }).indicatori.find((x) => x.id === 'vix');
  const cu = MV.compute({ market: m, extra: { serii: { '^VIX9D': bare(5, () => 18), '^VIX3M': bare(5, () => 16) } } }).indicatori.find((x) => x.id === 'vix');
  assert.equal(fara.score, 1); assert.equal(cu.score, -1); assert.match(cu.reading, /inversată/); assert.match(fara.note, /±0,9% \/ zi/);
});
test('I-680: creditul cu peste 1% sub media de 50 de zile coboară „Dobânzi și credit”', () => {
  const m = piata(true), slab = { serii: { HYG: bare(80, (i) => (i < 70 ? 80 : 76)), IEF: bare(80, () => 90) } }, bun = { serii: { HYG: bare(80, () => 80), IEF: bare(80, () => 90) } };
  assert.equal(MV.compute({ market: m, extra: slab }).indicatori.find((x) => x.id === 'dobanda').score, -1);
  assert.equal(MV.compute({ market: m, extra: bun }).indicatori.find((x) => x.id === 'dobanda').score, 0); // dobânda stabilă, creditul liniștit
});
test('I-681: expirarea opțiunilor din reguli (a treia vineri; quad witching trimestrial)', () => {
  const x = MV.expirari(Date.parse('2026-12-01T12:00:00Z'), 30); assert.equal(new Date(x[0].t).toISOString().slice(0, 10), '2026-12-18'); assert.equal(x[0].impact, 'high');
  const y = MV.expirari(Date.parse('2026-11-02T12:00:00Z'), 30); assert.equal(new Date(y[0].t).toISOString().slice(0, 10), '2026-11-20'); assert.match(y[0].ce, /lunară/);
});
test('regimul macro calculat singur intră în verdict; ziua din robot dă „ieri → azi” și „de câte sesiuni”', () => {
  const regime = { treapta: { cod: 'prudent', text: 'prudent' }, scor: -3, valide: 5, partial: false, semne: [{ cod: 'vix', ok: true, text: 'prudență' }] };
  const robot = { istoric: [{ asOf: '2026-10-14', label: 'neutru', score: 0, indicatori: { vix: 0 } }, { asOf: '2026-10-15', label: 'neutru', score: 1, indicatori: { vix: 0, macro: 0 } }], rezultateMari: [{ symbol: 'META', date: '2026-10-21' }], proba: { mesaj: 'În probă: 0 zile.' } };
  const v = MV.compute({ market: piata(false), sectors: sect(true), regime, robot, now: Date.parse('2026-10-17T08:00:00Z') });
  assert.equal(v.indicatori.find((x) => x.id === 'macro').score, -1); assert.equal(v.ieri.label, 'neutru'); assert.ok(v.ieri.schimbate.some((t) => /VIX/.test(t)));
  assert.ok(v.ceVine.some((x) => /Rezultate mari: META/.test(x.ce))); assert.match(MV.render(v), /Sesiunea precedentă: <b>Neutru<\/b>/); assert.match(MV.render(v), /În probă: 0 zile/);
});
test('I-678: beta portofoliului și pierderea estimată la −2% pe S&P; pozițiile Trading 212 se recunosc după ticker', () => {
  const spy = bare(130, (i) => 100 * (1 + 0.01 * Math.sin(i))).map((b) => ({ at: b.t, value: b.c })), poz = bare(130, (i) => 50 * (1 + 0.02 * Math.sin(i)));
  const e = MV.beta({ AAPL: poz }, spy, [{ ticker: 'AAPL_US_EQ', value: 1000 }, { ticker: 'SAP_DE_EQ', value: 500 }], 1500, 'USD');
  assert.equal(MV.symbolOf({ ticker: 'AAPL_US_EQ' }), 'AAPL'); assert.ok(Math.abs(e.beta - 2) < 0.05, String(e.beta)); assert.equal(e.poz, 1); assert.ok(Math.abs(e.pierdere2 - 40) < 1);
  assert.match(MV.compute({ market: piata(true), expunere: e, positions: [{ ticker: 'AAPL_US_EQ' }] }).pentruTine.join(' '), /~2,0× S&P/);
});
test('futures doar înainte de deschidere (sâmbăta nu sunt „acum”)', () => {
  const x = { serii: { 'ES=F': bare(3, (i) => 100 + i), 'NQ=F': bare(3, () => 100) } };
  assert.equal(MV.compute({ market: piata(true), extra: x, now: Date.parse('2026-10-17T12:00:00Z') }).futures, null); // sâmbătă
  assert.ok(MV.compute({ market: piata(true), extra: x, now: Date.parse('2026-10-19T12:00:00Z') }).futures.es > 0); // luni 08:00 la New York
});
test('datele rezultatelor rămân pe ziua lor (nu trec în ziua următoare la ora României)', () => {
  const v = MV.compute({ market: piata(true), robot: { rezultateMari: [{ symbol: 'GE', date: '2026-10-20' }, { symbol: 'AXP', date: '2026-10-23' }] }, now: Date.parse('2026-10-17T08:00:00Z') });
  const h = MV.render(v, Date.parse('2026-10-17T08:00:00Z')); assert.match(h, /mar 20\.10<\/b><\/time><span>Rezultate mari: GE/); assert.match(h, /vin 23\.10<\/b><\/time><span>Rezultate mari: AXP/);
});
