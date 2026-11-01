// 01.11.2026 — I-793..I-798 pe Piața azi: panoul rămâne la stopul de pe hârtie, lățimea veche nu punctează,
// „azi / mâine” e pe ziua New York, sugestia folosește bara închisă, oprirea lasă butonul de protecție.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function lib(files, extra = {}) {
  const c = { URL, Intl, Date, Math, JSON, Map, Set, Number, String, Array, Object, Promise, console, localStorage: { getItem: () => null, setItem() {} }, ...extra };
  c.window = c; vm.createContext(c);
  for (const f of files) vm.runInContext(readFileSync(f, 'utf8'), c, { filename: f });
  return c;
}
const bare = (n, c0, t0) => Array.from({ length: n }, (_, i) => ({ t: t0 + i * 86400000, h: c0 + 1, l: c0 - 1, c: c0 }));

test('I-793: panoul ține stopul notat și nivelul din plan; ordinul real iese; faraStop rămâne', () => {
  const S = lib(['lib/stop-setter.js']).StopSetter;
  const snap = { positions: [
    { ticker: 'MU_US_EQ', quantity: 2, averagePrice: 10, currentPrice: 11, instrumentCurrency: 'USD' },
    { ticker: 'NVDA_US_EQ', quantity: 1, averagePrice: 20, currentPrice: 21, instrumentCurrency: 'USD' },
    { ticker: 'AAPL_US_EQ', quantity: 1, averagePrice: 30, currentPrice: 31, instrumentCurrency: 'USD' },
    { ticker: 'ZERO_US_EQ', quantity: 0, averagePrice: 1, currentPrice: 1, instrumentCurrency: 'USD' },
  ] };
  const ordine = new Set(['NVDA_US_EQ']);
  const panou = S.pentruPanou(snap, { ordine }).map((p) => p.ticker);
  assert.deepEqual(panou, ['MU_US_EQ', 'AAPL_US_EQ']);
  assert.equal(S.faraStop(snap, new Set(['MU_US_EQ'])).map((p) => p.ticker).join(), 'NVDA_US_EQ,AAPL_US_EQ');
  const html = S.render(S.pentruPanou(snap, { ordine }), { fel: { MU_US_EQ: 'notat', AAPL_US_EQ: 'plan' }, noteBare: { MU_US_EQ: 'Sesiunea de azi e încă deschisă. Sugestia folosește închiderea precedentă.' } });
  assert.match(html, /Stop notat în Portofoliu, fără ordin la broker/);
  assert.match(html, /Nivel în planul Radar, fără ordin la broker/);
  assert.match(html, /fără ordin STOP la broker/);
  assert.match(html, /Sesiunea de azi e încă deschisă/);
  assert.match(html, /data-stop-save/);
  assert.doesNotMatch(html, /NVDA/);
  const vechi = S.render([{ ticker: 'X_US_EQ', quantity: 1, averagePrice: 10, currentPrice: 11, instrumentCurrency: 'USD' }], {});
  assert.match(vechi, /nu are stop/i);
  assert.doesNotMatch(vechi, /Stop notat/);
});

test('I-796: bara deschisă și bara fără oră nu mută ATR-ul; bara închisă rămâne', () => {
  const S = lib(['lib/stop-setter.js']).StopSetter;
  const t0 = Date.parse('2026-06-01T13:30:00Z');
  const list = bare(20, 10, t0);
  const deschisa = list.slice(); deschisa.meta = { quoteAt: list.at(-1).t + 60 * 60000 };
  const inchisa = list.slice(); inchisa.meta = { quoteAt: list.at(-1).t + 6.5 * 3600000 };
  const faraOra = list.slice();
  const a = S.barePentruStop(deschisa), b = S.barePentruStop(inchisa), c = S.barePentruStop(faraOra);
  assert.equal(a.deschisa, true); assert.equal(a.bars.length, 19); assert.equal(a.bars.at(-1).t, list.at(-2).t);
  assert.equal(b.deschisa, false); assert.equal(b.bars.length, 20);
  assert.equal(c.neverificata, true); assert.equal(c.bars.length, 19);
  assert.equal(a.data, '19.06'); assert.equal(b.data, '20.06'); assert.equal(c.data, '19.06');
  assert.equal(S.barePentruStop([]).data, '');
  assert.match(S.notaSesiune(b), /Sugestia pleacă din sesiunea închisă din 20\.06\./);
  assert.match(S.notaSesiune(a), /Sesiunea de azi e încă deschisă/);
  assert.match(S.notaSesiune(a), /închiderea precedentă din 19\.06/);
  assert.match(S.notaSesiune(c), /Ultima bară Yahoo nu are ora de închidere/);
  assert.match(S.notaSesiune(c), /sesiunea dinainte din 19\.06/);
  const htmlData = S.render([{ ticker: 'MU_US_EQ', quantity: 1, averagePrice: 10, currentPrice: 11, instrumentCurrency: 'USD' }], { noteBare: { MU_US_EQ: S.notaSesiune(b) } });
  assert.match(htmlData, /sesiunea închisă din 20\.06/);
  assert.equal(S.atrPct(a.bars) != null, true);
  assert.equal(Object.prototype.hasOwnProperty.call(a.bars, 'meta'), false);
});

test('I-794: participarea veche nu mută verdictul; cea de azi păstrează pragurile 60 și 40', () => {
  const MV = lib(['lib/market-verdict.js']).MarketVerdict;
  const piata = (breadth) => ({ items: [
    { symbol: 'SPY', state: 'ready', price: 120, asOf: '2026-10-16', points: Array.from({ length: 260 }, () => ({ at: 1, value: 100 })), indicators: {} },
    { symbol: 'QQQ', state: 'ready', price: 120, points: Array.from({ length: 260 }, () => ({ at: 1, value: 100 })), indicators: {} },
    { symbol: '^VIX', state: 'ready', price: 13, changePct: 1 },
    { symbol: '^TNX', state: 'ready', price: 4, points: Array.from({ length: 60 }, (_, i) => ({ at: i, value: 4.4 - i * 0.01 })) },
  ], breadth });
  const azi = MV.compute({ market: piata({ state: 'ready', above50: 72, points: [] }) });
  const veche = MV.compute({ market: piata({ state: 'stale', above50: 72, asOf: '2026-10-10', points: [] }) });
  const alta = MV.compute({ market: piata({ state: 'ready', above50: 22, asOf: '2026-10-10', session: '2026-10-16', points: [] }) });
  assert.equal(azi.indicatori.find((x) => x.id === 'participare').score, 1);
  assert.equal(veche.indicatori.find((x) => x.id === 'participare').score, null);
  assert.match(veche.indicatori.find((x) => x.id === 'participare').reading, /10\.10/);
  assert.equal(veche.indicatori.find((x) => x.id === 'participare').why, null);
  assert.equal(alta.indicatori.find((x) => x.id === 'participare').score, null);
  assert.equal(veche.score, azi.score - 1);
  assert.equal(veche.citite, azi.citite - 1);
  assert.equal(MV.compute({ market: piata({ state: 'ready', above50: 40, points: [] }) }).indicatori.find((x) => x.id === 'participare').score, -1);
  assert.equal(MV.compute({ market: piata({ state: 'ready', above50: 50, points: [] }) }).indicatori.find((x) => x.id === 'participare').score, 0);
});

test('I-795: seara în New York, rezultatul de mâine nu se cheamă azi; ziua tipărită rămâne a rezultatului', () => {
  const c = lib(['lib/market-verdict.js', 'lib/today-attention.js']);
  const seara = Date.parse('2026-11-02T03:00:00Z'); // 01.11.2026, 22:00 ora New York (EST)
  const ziua = c.MarketVerdict.compute({
    market: { items: [], breadth: { state: 'loading' } },
    earnings: [{ symbol: 'NVDA', date: '2026-11-02' }],
    positions: [{ symbol: 'NVDA' }],
    now: seara,
  });
  assert.match(c.MarketVerdict.render(ziua, seara), /mâine/);
  assert.doesNotMatch(c.MarketVerdict.render(ziua, seara), />azi</);
  const peZi = Date.parse('2026-11-03T03:00:00Z'); // 02.11.2026, 22:00 ora New York
  const totAzi = c.MarketVerdict.compute({ market: { items: [], breadth: { state: 'loading' } }, earnings: [{ symbol: 'NVDA', date: '2026-11-02' }], positions: [{ symbol: 'NVDA' }], now: peZi });
  assert.match(c.MarketVerdict.render(totAzi, peZi), />azi</);
  const rows = c.TodayAttention.alerte({ positions: [{ ticker: 'NVDA_US_EQ', symbol: 'NVDA', value: 1000 }], earnings: [{ symbol: 'NVDA', date: '2026-11-02' }], now: seara });
  assert.match(rows.map((x) => x.text).join(' '), /mâine \(02\.11\)/);
  const peData = c.TodayAttention.alerte({ positions: [{ ticker: 'NVDA_US_EQ', symbol: 'NVDA', value: 1000 }], earnings: [{ symbol: 'NVDA', date: '2026-10-19' }], now: Date.parse('2026-10-17T10:00:00Z') });
  assert.match(peData.map((x) => x.text).join(' '), /peste 2 zile/);
});

function pagina(extra = {}) {
  const store = new Map(extra.store || []);
  const host = { innerHTML: '', hidden: false, querySelectorAll: () => [], querySelector: () => null, contains: () => false, addEventListener() {} };
  const c = {
    Intl, Date, Math, JSON, Map, Set, Number, String, Array, Object, Promise, console, URL,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    document: { getElementById: (id) => (id === 'stopPanel' ? host : null), activeElement: null, hidden: false },
    CSS: { escape: (s) => s }, Event: class { constructor(t) { this.type = t; } }, dispatchEvent() {}, addEventListener() {},
    setInterval: () => 1, setTimeout: () => 1, clearTimeout() {}, fetch: async () => ({ ok: false, json: async () => ({}) }),
    T212Snapshot: { read: () => ['live-A', { positions: [{ ticker: 'MU_US_EQ', quantity: 1, averagePrice: 10, currentPrice: 11, instrumentCurrency: 'USD' }], summary: { currency: 'EUR' } }] },
    ...extra.ctx,
  };
  c.window = c; vm.createContext(c);
  for (const f of ['lib/holdings-notes.js', 'lib/stop-setter.js', 'lib/today-attention.js', 'today/stop.js']) vm.runInContext(readFileSync(f, 'utf8'), c, { filename: f });
  return { host, c };
}

test('I-793 + I-797: ordinul Radar ascunde rândul; oprirea lasă butonul și spune că tot trimite', async () => {
  const cuOrdin = pagina({ ctx: { __ordineExterne: new Set(['MU_US_EQ']) } });
  assert.equal(cuOrdin.host.hidden, true);
  assert.equal(cuOrdin.host.innerHTML, '');
  const oprit = pagina({
    store: [['tt_governor_oprire_v1', JSON.stringify({ activ: true, la: '2026-11-01T12:00:00Z', motiv: 'pierdere', aparat: 'laptop', ordineAnulate: [] })]],
    ctx: { T212Orders: { disponibil: async () => ({ ok: true }), rezumat() {}, verifica: () => ({ ok: true }), confirmareHtml: () => '' } },
  });
  await new Promise((r) => setImmediate(r));
  assert.match(oprit.host.innerHTML, /Butonul de stop rămâne protecție și tot trimite un ordin STOP de vânzare/);
  assert.match(oprit.host.innerHTML, /data-stop-t212/);
  assert.match(oprit.host.innerHTML, /Trimite STOP \(protecție\)/);
  assert.doesNotMatch(oprit.host.innerHTML, /Pune ordinul în Trading 212|disabled|nu a fost trimis|stopul a fost blocat/);
  assert.match(oprit.host.innerHTML, /Nu are stop/);
  const deschis = pagina({
    ctx: { T212Orders: { disponibil: async () => ({ ok: true }), rezumat() {}, verifica: () => ({ ok: true }), confirmareHtml: () => '' } },
  });
  await new Promise((r) => setImmediate(r));
  assert.match(deschis.host.innerHTML, /Pune ordinul în Trading 212/);
  assert.doesNotMatch(deschis.host.innerHTML, /Trimite STOP \(protecție\)/);
});
