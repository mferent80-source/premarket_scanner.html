// 28.10.2026 (I-765, I-766) — „de ce nu văd TE în Portofoliu, l-am cumpărat aseară?”: poziția era în date, ascunsă de filtrul ținut minte pe aparat
// („De revizuit · tehnic și plan” pe PC), iar lista tăcea. Garda: o poziție NOUĂ care nu e în lista afișată primește un rând cu motivul și „Arată”,
// iar ordinele de CUMPĂRARE în așteptare se spun în Portofoliu (un ordin pus după 22:00 nu e poziție până la execuție).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const NOW = Date.parse('2026-10-28T06:30:00Z'), ZI = 86400000;
/* în acest realm (nu într-un context vm), ca deepEqual să compare valorile, nu prototipurile altui realm */
function lib() { vm.runInThisContext(readFileSync('lib/holdings-ascunse.js', 'utf8'), { filename: 'lib/holdings-ascunse.js' }); return globalThis.HoldingsAscunse; }
const A = lib();
const TE = { ticker: 'TE_US_EQ', quantity: 3 }, MU = { ticker: 'MU_US_EQ', quantity: 5 }, positions = [MU, TE];
const fill = (ticker, side, zileInUrma, extra = {}) => ({ id: ticker + zileInUrma, ticker, side, type: 'TRADE', quantity: 1, price: 10, date: new Date(NOW - zileInUrma * ZI).toISOString(), ...extra });
const istoric = (zile) => ({ version: 1, accounts: { 'live:a': { environment: 'live', days: zile.map(([ago, tickers]) => ({ at: new Date(NOW - ago * ZI).toISOString(), day: 'd' + ago, positions: tickers.map((t) => ({ ticker: t, quantity: 1 })) })) } } });

test('recente: din execuții — prima cumpărare în ultimele 7 zile și nicio execuție mai veche ⇒ nouă, cu data cumpărării', () => {
  const fills = [fill('MU_US_EQ', 'BUY', 40), fill('MU_US_EQ', 'BUY', 2), fill('TE_US_EQ', 'BUY', 0.4)];
  const r = A.recente({ positions, fills, now: NOW });
  assert.deepEqual([...r.keys()], ['TE_US_EQ'], 'MU are execuții vechi ⇒ nu e nouă, chiar dacă a mai cumpărat alaltăieri');
  assert.equal(r.get('TE_US_EQ').sursa, 'executii');
  assert.equal(r.get('TE_US_EQ').de, Date.parse(fill('TE_US_EQ', 'BUY', 0.4).date));
});

test('recente: o cumpărare de acum 8 zile nu mai e nouă; o vânzare recentă fără cumpărare nu face poziția nouă; execuțiile din viitor nu contează', () => {
  assert.equal(A.recente({ positions, fills: [fill('TE_US_EQ', 'BUY', 8)], now: NOW }).size, 0);
  assert.equal(A.recente({ positions, fills: [fill('TE_US_EQ', 'SELL', 1)], now: NOW }).size, 0);
  assert.equal(A.recente({ positions, fills: [fill('TE_US_EQ', 'BUY', -2)], now: NOW }).size, 0, 'data în viitor = date stricate, nu noutate');
});

test('recente: fără execuții pe ticker cade pe istoricul zilnic — absentă din citirile mai vechi de 7 zile ⇒ nouă, cu prima citire', () => {
  const ist = istoric([[10, ['MU_US_EQ']], [9, ['MU_US_EQ']], [1, ['MU_US_EQ', 'TE_US_EQ']], [0.2, ['MU_US_EQ', 'TE_US_EQ']]]);
  const r = A.recente({ positions, fills: [fill('MU_US_EQ', 'BUY', 40)], istoric: ist, scope: 'live:a', now: NOW });
  assert.deepEqual([...r.keys()], ['TE_US_EQ']);
  assert.equal(r.get('TE_US_EQ').sursa, 'istoric');
  assert.equal(r.get('TE_US_EQ').de, NOW - 1 * ZI);
  assert.equal(A.recente({ positions, fills: null, istoric: ist, scope: 'alt-cont', now: NOW }).size, 0, 'istoricul altui cont nu spune nimic ⇒ nu inventăm');
});

test('recente: istoricul care nu acoperă săptămâna (doar citiri de azi) nu poate judeca ⇒ rămâne reperul vizitei, iar fără el nimic', () => {
  const ist = istoric([[0.5, ['MU_US_EQ', 'TE_US_EQ']]]);
  assert.equal(A.recente({ positions, istoric: ist, scope: 'live:a', now: NOW }).size, 0);
  const r = A.recente({ positions, istoric: ist, scope: 'live:a', noi: new Set(['TE_US_EQ']), now: NOW });
  assert.deepEqual([...r.entries()], [['TE_US_EQ', { de: null, sursa: 'vizita' }]]);
});

test('filtre + ascunse: poziția nouă care lipsește din listă primește rândul cu filtrele active; fără filtre active nu există nimic de spus', () => {
  const rec = A.recente({ positions, fills: [fill('TE_US_EQ', 'BUY', 0.4), fill('MU_US_EQ', 'BUY', 30)], now: NOW });
  const f = A.filtre({ state: 'review', favorites: false, changes: true, query: '' });
  assert.deepEqual(f, ['«De revizuit · tehnic și plan»', '«Schimbate de la ultima vizită»']);
  const asc = A.ascunse({ positions, vizibile: new Set(['MU_US_EQ']), recente: rec, filtre: f });
  assert.equal(asc.length, 1); assert.equal(asc[0].ticker, 'TE_US_EQ'); assert.deepEqual(asc[0].filtre, f);
  assert.equal(A.ascunse({ positions, vizibile: new Set(['MU_US_EQ', 'TE_US_EQ']), recente: rec, filtre: f }).length, 0, 'vizibilă ⇒ nimic');
  assert.equal(A.ascunse({ positions, vizibile: new Set(), recente: rec, filtre: A.filtre({ state: 'all' }) }).length, 0, 'fără filtre active ⇒ lista goală nu e „ascunsă de filtru”');
  assert.deepEqual(A.filtre({ state: 'all', favorites: true, query: '  nvda ' }), ['«Doar favorite»', 'căutarea „nvda”']);
});

test('markup: rândul numește simbolul, data cumpărării, filtrul și are butonul „Arată” pe ticker; textul e escapat', () => {
  const rows = [{ ticker: 'TE_US_EQ', de: Date.parse('2026-10-27T19:40:00Z'), sursa: 'executii', filtre: ['«De revizuit · tehnic și plan»'] }, { ticker: '<X>_US_EQ', de: null, sursa: 'vizita', filtre: ['«Doar favorite»', 'căutarea „a”'] }];
  const html = A.markup(rows, { symbol: (t) => t.replace(/_US_EQ$/, '') });
  assert.match(html, /<b>TE<\/b> · poziție nouă \(cumpărată 27\.10\) · ascunsă de filtrul «De revizuit · tehnic și plan» <button type="button" data-arata-ascuns="TE_US_EQ"/);
  assert.match(html, /ascunsă de filtrele «Doar favorite», căutarea „a”/);
  assert.match(html, /poziție nouă față de vizita precedentă/);
  assert.ok(!html.includes('<X>')); assert.ok(html.includes('&lt;X&gt;'));
  assert.equal(A.markup([]), '');
});

test('cumparari: doar ordinele BUY, cu „nu e încă poziție” / „completează poziția”; copia veche se spune; fără citire ⇒ nimic afișat', () => {
  const pending = { fetchedAt: new Date(NOW - 3600000).toISOString(), items: [
    { ticker: 'TE_US_EQ', side: 'BUY', type: 'LIMIT', quantity: 4, limitPrice: 12.5, createdAt: '2026-10-27T20:14:00Z' },
    { ticker: 'MU_US_EQ', side: 'BUY', type: 'MARKET', quantity: 2 },
    { ticker: 'MU_US_EQ', side: 'SELL', type: 'STOP', quantity: 5, stopPrice: 90 }] };
  const r = A.cumparari({ pending, positions: [MU], now: NOW });
  assert.equal(r.stare, 'ok'); assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows.map((o) => o.inPortofoliu), [false, true]);
  const html = A.markupCumparari(r, { symbol: (t) => t.replace(/_US_EQ$/, '') });
  assert.match(html, /<b>2 ordine de cumpărare în așteptare<\/b>/);
  assert.match(html, /<li>TE · 4 buc\. · LIMIT · limită 12,5 · pus 27\.10, 22:14 · nu e încă poziție<\/li>/);
  assert.match(html, /<li>MU · 2 buc\. · MARKET · completează poziția<\/li>/);
  assert.match(html, /data-open-broker/); assert.ok(!html.includes('citire veche'));
  const vechi = A.cumparari({ pending: { ...pending, fetchedAt: new Date(NOW - 7 * 3600000).toISOString() }, positions: [], now: NOW });
  assert.equal(vechi.stare, 'vechi'); assert.match(A.markupCumparari(vechi), /citire veche \(peste 6 h\)/);
  assert.equal(A.markupCumparari(A.cumparari({ pending: null, positions: [] })), '', 'necitit ⇒ nimic (nu „fără ordine”)');
  assert.equal(A.markupCumparari(A.cumparari({ pending: { fetchedAt: pending.fetchedAt, items: [pending.items[2]] }, positions: [MU], now: NOW })), '', 'doar un STOP de vânzare ⇒ nimic');
});

test('pagina: biblioteca și ordinele în așteptare se încarcă înaintea holdings.js, rândurile există, filtrarea cheamă renderAscunse, reperul vizitei expune noi()', () => {
  const html = readFileSync('holdings/index.html', 'utf8'), js = readFileSync('holdings/holdings.js', 'utf8'), roster = readFileSync('holdings/roster.js', 'utf8');
  for (const f of ['../lib/t212-pending.js', '../lib/holdings-ascunse.js', '../lib/trading212-fills-store.js', '../lib/trading212-daily.js']) assert.ok(html.indexOf(f) > 0 && html.indexOf(f) < html.indexOf('src="holdings.js?'), f + ' înaintea holdings.js');
  assert.ok(html.includes('id="holdingAscunse"') && html.indexOf('id="holdingAscunse"') > html.indexOf('id="holdingCount"'), 'rândul stă sub „X / Y dețineri afișate”');
  assert.ok(html.includes('id="holdingCumparari"'));
  const apply = js.slice(js.indexOf('function applyHoldingFilters'), js.indexOf('function saveFilters'));
  assert.ok(apply.includes('renderAscunse(rows)'), 'fiecare filtrare recalculează pozițiile ascunse');
  assert.ok(js.includes('renderCumparari();') && js.slice(js.indexOf('function renderNow'), js.indexOf('function snapshotStatus')).includes('renderCumparari()'), 'ordinele se desenează la fiecare desen al paginii');
  assert.ok(js.includes("data-arata-ascuns") && js.includes('HoldingsLayout.openHolding(b.dataset.arataAscuns'), '„Arată” deschide analiza (openHolding scoate filtrele)');
  assert.ok(roster.includes('noi};') && roster.includes('r.newPosition'), 'HoldingsRosterUI.noi()');
});
