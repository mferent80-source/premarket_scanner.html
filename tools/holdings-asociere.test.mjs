// 28.10.2026 (I-771 … I-774): „Salvează asocierea și analizează” pentru TE — butonul mergea, dar omul nu vedea nimic (mesajul sus, în afara
// ecranului; analiza pe altă filă; câmpul precompletat ⇒ „FREYTE”; asocierea îngropată; poziția fără simbol sărită tăcut).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function lib() { vm.runInThisContext(readFileSync('lib/holdings-asociere.js', 'utf8'), { filename: 'lib/holdings-asociere.js' }); return globalThis.HoldingsAsociere; }
const A = lib();

test('stare: fără simbol ⇒ „lipsa”; eroare pe exact simbolul de acum, fără model ⇒ „refuzat”; altfel ok', () => {
  assert.equal(A.stare({ symbol: null }).cod, 'lipsa');
  assert.equal(A.stare({ symbol: 'FREY', result: { symbol: 'FREY', error: 'Yahoo: simbol invalid sau indisponibil — FREY' } }).cod, 'refuzat');
  assert.match(A.stare({ symbol: 'FREY', result: { symbol: 'FREY', error: 'Yahoo: simbol invalid sau indisponibil — FREY' } }).text, /FREY/);
  assert.equal(A.stare({ symbol: 'TE', result: { symbol: 'FREY', error: 'x' } }).cod, 'ok', 'eroarea veche e pe alt simbol ⇒ nu e refuz');
  assert.equal(A.stare({ symbol: 'TE', result: { symbol: 'TE', error: 'DATE STALE', model: { price: 10 } } }).cod, 'ok', 'cu model există analiză, chiar veche');
  assert.equal(A.stare({ symbol: 'TE' }).cod, 'ok');
});

test('propunere după ISIN: prima acțiune / ETF cu simbol valid din căutarea Yahoo; fără cotații ⇒ null; moneda vine din seria de prețuri', () => {
  const j = { quotes: [{ symbol: 'TE', shortname: 'T1 Energy Inc.', longname: 'T1 Energy Inc.', exchange: 'NYQ', exchDisp: 'NYSE', quoteType: 'EQUITY', isYahooFinance: true }] };
  const p = A.propunere(j, 'US88023B1035');
  assert.deepEqual(p, { symbol: 'TE', nume: 'T1 Energy Inc.', bursa: 'NYSE', moneda: null, isin: 'US88023B1035' });
  assert.equal(A.propunere({ quotes: [] }, 'X'), null); assert.equal(A.propunere(null, 'X'), null);
  assert.equal(A.propunere({ quotes: [{ symbol: 'TE260117C00010000', quoteType: 'OPTION' }, { symbol: 'TE=F', quoteType: 'FUTURE' }] }, 'X'), null, 'opțiuni / futures nu sunt propuneri');
  assert.equal(A.propunere({ quotes: [{ symbol: 'ABC', quoteType: 'EQUITY', isYahooFinance: false }, { symbol: 'VUSA.L', quoteType: 'ETF', exchDisp: 'LSE' }] }, 'X').symbol, 'VUSA.L', 'cotațiile care nu sunt pe Yahoo sunt sărite; ETF-urile intră');
  const bare = []; Object.defineProperty(bare, 'meta', { value: { currency: 'USD', exchange: 'NYQ' } });
  assert.deepEqual(A.cuMeta(p, bare), { ...p, moneda: 'USD', bursa: 'NYQ' });
  assert.deepEqual(A.cuMeta(p, null), p);
});

test('caseta: titlu după stare, câmp GOL cu indiciul „acum: FREY”, propunerea doar afișată cu identitatea și butonul „Folosește”, status lângă buton; textul e escapat', () => {
  const st = A.stare({ symbol: 'FREY', result: { symbol: 'FREY', error: 'Yahoo: simbol invalid sau indisponibil — FREY' } });
  const h = A.caseta({ i: 3, ticker: 'FREY_US_EQ', stare: st, isin: 'US88023B1035', cautare: { stare: 'gata', prop: { symbol: 'TE', nume: 'T1 Energy <Inc.>', bursa: 'NYSE', moneda: 'USD' } }, status: 'Salvat · analizez TE…' });
  assert.match(h, /data-asociere="summary"/); assert.match(h, /refuzat de Yahoo/); assert.match(h, /„Yahoo: simbol invalid sau indisponibil — FREY”/);
  assert.match(h, /<input data-symbol="3" value="" placeholder="acum: FREY · scrie simbolul nou"/, 'câmpul e gol: tastarea nu mai lipește TE după FREY');
  assert.match(h, /Propunere după ISIN US88023B1035: <b>TE<\/b> · T1 Energy &lt;Inc\.&gt; · NYSE · USD <button type="button" data-map-propune="3" data-simbol="TE">Folosește TE<\/button>/);
  assert.match(h, /Nu schimba listarea doar pentru că numele seamănă/);
  assert.match(h, /<button type="button" data-map="3">Salvează asocierea și analizează<\/button><p class="asociere-status" data-map-status="3" role="status" aria-live="polite">Salvat · analizez TE…<\/p>/);
  const lipsa = A.caseta({ i: 0, ticker: 'MUl_US_EQ', stare: A.stare({ symbol: null }), isin: null, cautare: null, status: '' });
  assert.match(lipsa, /Simbol de piață lipsă/); assert.match(lipsa, /placeholder="Ex\.: TE"/); assert.match(lipsa, /n-a dat ISIN-ul/);
  assert.match(A.caseta({ i: 0, ticker: 'X', stare: A.stare({ symbol: null }), isin: 'US1', cautare: { stare: 'in-curs' } }), /Caut pe Yahoo după ISIN US1/);
  assert.match(A.caseta({ i: 0, ticker: 'X', stare: A.stare({ symbol: null }), isin: 'US1', cautare: { stare: 'nimic', motiv: 'rețea' } }), /Nicio propunere găsită[^<]*US1 \(rețea\)/);
});

test('mesajele de lângă buton: salvat ⇒ „Salvat · analizez TE…”; gata cu data EOD și trimiterea la filă; eroarea exactă; invalid; ocupat', () => {
  assert.equal(A.mesaj('salvat', { simbol: 'TE' }), 'Salvat · analizez TE…');
  assert.equal(A.mesaj('gata', { asOf: '2026-10-27' }), 'Gata · analiză EOD din 2026-10-27 — vezi „Poziție & direcție”.');
  assert.equal(A.mesaj('eroare', { text: 'Yahoo: simbol invalid sau indisponibil — FREYTE' }), 'Eroare: Yahoo: simbol invalid sau indisponibil — FREYTE');
  assert.match(A.mesaj('invalid'), /^Simbol de piață invalid/); assert.match(A.mesaj('ocupat'), /rulează deja/);
});

test('pagina: biblioteca înaintea holdings.js; butonul citește câmpul din aceeași casetă, scrie statusul lângă el, așteaptă analiza și deschide „Poziție & direcție”; câmpul se selectează la focus; lista spune „Simbol lipsă”', () => {
  const html = readFileSync('holdings/index.html', 'utf8'), js = readFileSync('holdings/holdings.js', 'utf8'), lay = readFileSync('holdings/layout.js', 'utf8'), css = readFileSync('holdings/holdings.css', 'utf8');
  assert.ok(html.indexOf('../lib/holdings-asociere.js') > 0 && html.indexOf('../lib/holdings-asociere.js') < html.indexOf('src="holdings.js?'));
  assert.match(js, /async function salveazaAsocierea\(b\)/);
  assert.match(js, /b\.closest\('\[data-asociere\]'\)/, 'câmpul și statusul se caută în caseta butonului apăsat (cea de pe „Poziție & direcție” sau cea din „Planul meu”)');
  assert.match(js, /await scan\(\)/, 'butonul așteaptă analiza');
  assert.match(js, /HoldingsLayout\.openHolding\(p\.ticker, ?\{ ?tab: ?'summary'/, 'la reușită, mutarea pe „Poziție & direcție”');
  assert.match(js, /scrieStatus\(id,null,'gata',\{asOf:m\.asOf\}\)/); assert.match(js, /scrieStatus\(id,null,'eroare',\{text:r\?\.error\|\|/); assert.match(js, /scrieStatus\(id,root,'ocupat'\)/); assert.match(js, /scrieStatus\(id,root,'salvat',\{simbol:value\}\)/);
  assert.match(js, /const text=HoldingsAsociere\.mesaj\(stadiu,info\)/, 'textele vin din bibliotecă');
  assert.match(js, /\[data-map-propune\]/, 'propunerea se aplică la o atingere, prin același drum');
  assert.match(js, /onfocus=\(\)=>el\.select\(\)/, 'textul câmpului se selectează tot la focus');
  assert.match(js, /HoldingsAsociere\.caseta\(/, 'caseta stă în panoul „Poziție & direcție”');
  assert.match(js, /'Simbol lipsă'/, 'eticheta cardului'); assert.match(lay, /Simbol lipsă · asociază/, 'rândul din listă');
  assert.match(js, /finance\/search\?q='\+encodeURIComponent\(isin\)/, 'căutarea Yahoo după ISIN merge prin D.fetchJSON (calea aplicației)');
  assert.doesNotMatch(js, /\$\('status'\)\.textContent='Simbol de piață invalid\.'/, 'mesajele nu mai pleacă în bara de sus');
  assert.match(css, /\.asociere-caseta\{/);
});

test('proba de ecran: pagina „Portofoliu · asocierea simbolului” are contul sintetic cu ticker nestandard, pașii cu atingeri și răspunsul de lângă buton ca element-cheie', async () => {
  const { PAGINI, CONT_SINTETIC } = await import('./proba-ecran-decizie.mjs');
  const p = PAGINI.find((x) => x.id === 'holdings-asociere');
  assert.ok(p, 'pagina există'); assert.equal(p.ruta, 'holdings/'); assert.equal(p.pasi, 'asociere'); assert.ok(p.sintetic);
  const cont = Object.values(CONT_SINTETIC)[0];
  assert.equal(cont.environment, 'live'); assert.ok(cont.positions.some((x) => x.ticker === 'MUl_US_EQ' && x.isin), 'poziția pe ticker nestandard, cu ISIN');
  assert.ok(!/^[A-Z0-9.-]+_US_EQ$/.test('MUl_US_EQ'), 'tickerul nu are forma cunoscută ⇒ simbol lipsă');
  assert.ok(p.elemente.some((e) => /data-map-status/.test(e.selector) && e.text === 'Gata|Eroare'), 'răspunsul de lângă buton: Gata sau eroarea exactă, dar nu „nimic”');
  assert.ok(p.elemente.some((e) => /data-asociere="summary"/.test(e.selector)), 'caseta pe „Poziție & direcție”');
  const src = readFileSync('tools/proba-ecran-decizie.mjs', 'utf8');
  assert.match(src, /Input\.dispatchTouchEvent/, 'atingeri reale'); assert.match(src, /Input\.insertText/, 'tastare');
  assert.match(src, /Page\.addScriptToEvaluateOnNewDocument/, 'contul sintetic intră înainte de încărcare'); assert.match(src, /localStorage\.removeItem\('tt_trading212_portfolio_v1'\)/, 'și se curăță după');
});
