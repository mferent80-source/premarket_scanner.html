// 27.10.2026 (lotul 2 al auditului, lot B — Astăzi + Portofoliu): 🔵/🟡 rămase din raportul B, fiecare cu testul lui.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const citeste = (p) => readFileSync(p, 'utf8');
function ctx(fisiere, extra = {}) { const c = { console, Date, Intl, Map, Set, JSON, Math, Number, ...extra }; c.window = c; vm.createContext(c); for (const f of fisiere) vm.runInContext(citeste(f), c); return c; }
const TA = (cuCalendar = false) => ctx([...(cuCalendar ? ['lib/exchange-calendar.js'] : []), 'lib/today-attention.js']).TodayAttention;
const memorie = (date = {}) => { const m = new Map(Object.entries(date)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

// ---- 🔵 [1] `pp` folosit înaintea declarării (TDZ) ----
test('🔵 [1] ordinul STOP parțial pe o poziție fără cantitate în model ia cantitatea din copia contului, fără ReferenceError', () => {
  const A = TA(), preturi = new Map([['MU_US_EQ', { ticker: 'MU_US_EQ', quantity: 10, currentPrice: 100 }]]);
  const a = A.alerte({ positions: [{ ticker: 'MU_US_EQ', value: 1000 }], stops: new Set(['MU_US_EQ']), preturi, ordineBroker: { citit: true, pozitii: new Map([['MU_US_EQ', { stare: 'partial', ordin: { quantity: 4 } }]]) } });
  assert.ok(a.some((x) => /acoperă doar 4,00 din 10,00 acțiuni/.test(x.text)), JSON.stringify(a));
});

// ---- 🔵 [2] `inAfaraOrelor` știe de sărbători și de zilele scurte (ExchangeCalendar) ----
test('🔵 [2] în afara orelor: sărbătoarea bursei (Thanksgiving) e închisă toată ziua, ziua scurtă se închide la 13:00, fără calendar ca înainte', () => {
  const A = TA(true), B = TA(false);
  assert.equal(A.inAfaraOrelor(Date.parse('2026-11-26T16:30:00Z')), true, 'joi 26.11, 11:30 NY: bursa e închisă');
  assert.equal(B.inAfaraOrelor(Date.parse('2026-11-26T16:30:00Z')), false, 'fără calendar: doar weekday + ore');
  assert.equal(A.inAfaraOrelor(Date.parse('2026-11-27T18:30:00Z')), true, 'vineri 27.11, 13:30 NY: după închiderea scurtă');
  assert.equal(A.inAfaraOrelor(Date.parse('2026-11-27T17:00:00Z')), false, 'vineri 27.11, 12:00 NY: încă deschis');
  assert.equal(A.inAfaraOrelor(Date.parse('2026-11-25T16:30:00Z')), false, 'miercuri 25.11, 11:30 NY: zi obișnuită');
  assert.equal(A.inAfaraOrelor(Date.parse('2026-11-25T22:00:00Z')), true, 'miercuri 25.11, 17:00 NY');
});

// ---- 🟡 [2] I-731: bara Yahoo trebuie să fie închisă (cotația de după 16:00 ET), nu prețul din cache-ul de la prânz ----
test('🟡 [2] I-731: abaterea T212 / Yahoo se compară doar când ultima bară e închisă (meta.quoteAt după închidere); cache de la prânz sau fără oră ⇒ nimic', () => {
  const A = TA(), ZI = Date.parse('2026-10-20T13:30:00Z'), SEARA = Date.parse('2026-10-20T22:30:00Z');
  const bare = (meta) => { const b = [{ t: ZI - 86400000, c: 99 }, { t: ZI, c: 100 }]; if (meta) Object.defineProperty(b, 'meta', { value: meta }); return b; };
  const baza = { positions: [{ ticker: 'MU_US_EQ', quantity: 10, value: 1000 }], stops: new Set(['MU_US_EQ']), preturi: new Map([['MU_US_EQ', { ticker: 'MU_US_EQ', currentPrice: 103, instrumentCurrency: 'USD' }]]), contLa: SEARA - 60000, now: SEARA };
  const are = (serie) => A.alerte({ ...baza, serii: { MU: serie } }).some((x) => /nu se potrivesc între surse/.test(x.text));
  assert.equal(are(bare({ quoteAt: ZI + 6.5 * 3600000 + 2000 })), true, 'cotația de la închidere ⇒ se compară');
  assert.equal(are(bare({ quoteAt: ZI + 4 * 3600000 })), false, 'cotația de la 13:30 ET (cache) ⇒ bara nu e închisă');
  assert.equal(are(bare({ quoteAt: null })), false, 'fără ora cotației ⇒ nu se poate verifica');
  assert.equal(are(bare(null)), false, 'serie fără meta ⇒ nu se poate verifica');
});

// ---- 🔵 [2] verificările pe serii lipsesc pentru unele poziții ⇒ se spune ----
test('🔵 [2] pozițiile fără serie (pe Astăzi: în afara primelor 8 după valoare) primesc UN rând care le numește; fără serii citite deloc ⇒ nimic', () => {
  const A = TA(), poz = [{ ticker: 'AAA_US_EQ', value: 900 }, { ticker: 'BBB_US_EQ', value: 50 }, { ticker: 'CCC_US_EQ', value: 40 }];
  const a = A.alerte({ positions: poz, stops: new Set(poz.map((p) => p.ticker)), serii: { AAA: [{ t: 1, c: 1 }, { t: 2, c: 1 }] }, faraSeriiMotiv: 'pe Astăzi se citesc primele 8 poziții după valoare' });
  const r = a.filter((x) => /verificările pe istoric/i.test(x.text));
  assert.equal(r.length, 1); assert.match(r[0].text, /BBB, CCC/); assert.match(r[0].text, /primele 8 poziții/); assert.equal(r[0].grav, 1);
  assert.equal(A.alerte({ positions: poz, stops: new Set(poz.map((p) => p.ticker)), serii: null }).some((x) => /verificările pe istoric/i.test(x.text)), false);
});

// ---- 🟡 [6] pragul de concentrare: o singură definiție (Governor maxInstrumentPct, implicit 20) pe Astăzi și în Portofoliu ----
test('🟡 [6] HoldingsConcentrare.prag citește maxInstrumentPct exact ca Governor.cfg() (implicit 20, invalid ⇒ 20)', () => {
  for (const cfg of [null, '{}', '{"maxInstrumentPct":15}', '{"maxInstrumentPct":35.5}', '{"maxInstrumentPct":0}', '{"maxInstrumentPct":150}', '{"maxInstrumentPct":"30"}', '{"maxInstrumentPct":-5}', 'nu e json', '[1,2]']) {
    const s = memorie(cfg === null ? {} : { tt_governor_cfg_v1: cfg });
    const H = ctx(['lib/holdings-concentrare.js']).HoldingsConcentrare, G = ctx(['lib/governor.js'], { localStorage: s }).GV;
    assert.equal(H.prag(s), G.cfg().maxInstrumentPct, 'cfg ' + cfg);
  }
  assert.equal(ctx(['lib/holdings-concentrare.js']).HoldingsConcentrare.prag({ getItem() { throw Error('blocat'); } }), 20, 'stocare blocată ⇒ implicit');
});
test('🟡 [6] Astăzi: concentrarea se dă la pragul din Governor (implicit 20 %), cu limita în text; Portofoliul la fel', () => {
  const A = TA(), poz = [{ ticker: 'AAPL_US_EQ', value: 2200, weight: 22 }];
  const rand = (o) => A.alerte({ positions: poz, stops: new Set(['AAPL_US_EQ']), ...o }).find((x) => /din cont/.test(x.text));
  assert.match(rand({}).text, /AAPL e 22% din cont \(limita ta pe instrument: 20 %\)/, 'implicit 20 %');
  assert.equal(rand({ pragConcentrare: 25 }), undefined, 'la 25 % nu');
  assert.ok(rand({ pragConcentrare: 15 }));
  const W = ctx(['lib/daily-series.js', 'lib/holdings-events.js', 'lib/holdings-workspace.js'], { URL, setTimeout, clearTimeout }).HoldingsWorkspace;
  const att = (prag) => W.attention([{ ticker: 'A', value: 220, currency: 'USD' }], { A: null }, {}, {}, 1000, 'USD', () => 'A', true, Date.now(), null, prag)[0].reasons.join(' ');
  assert.match(att(undefined), /Concentrare pe instrument ≥20% din cont/); assert.doesNotMatch(att(25), /Concentrare/); assert.match(att(15), /≥15%/);
  const h = citeste('holdings/holdings.js'); assert.doesNotMatch(h, /weight>=20/, 'fără prag fix în Portofoliu'); assert.match(h, /HoldingsConcentrare/);
  assert.match(citeste('today/view.js'), /pragConcentrare:/);
  for (const p of ['today/index.html', 'holdings/index.html']) assert.match(citeste(p), /lib\/holdings-concentrare\.js\?v=\d{2}\.\d{2}\.\d{2}\.\d{4}/, p);
  assert.ok(citeste('holdings/index.html').indexOf('holdings-concentrare.js') < citeste('holdings/index.html').indexOf('src="holdings.js'), 'înaintea paginii');
});

// ---- 🔵 [6] pastila „Citit / De actualizat” din Portofoliul pe scurt: 5 minute, ca Astăzi ----
test('🔵 [6] Portofoliul pe scurt: „Citit” doar sub 5 minute (ca Astăzi), nu pe ziua calendaristică a aparatului', () => {
  const B = ctx(['holdings/brief.js']).HoldingsBrief, now = Date.parse('2026-10-15T21:30:00Z');
  const m = (at) => B.markup({ positions: [{ ticker: 'A_US_EQ', currency: 'USD', value: 100, unrealized: 1 }], models: [null], snapshot: { fetchedAt: at, summary: { currency: 'USD', totalValue: 100 } }, now });
  assert.match(m(new Date(now - 4 * 60000).toISOString()), /Citit /);
  assert.match(m(new Date(now - 6 * 60000).toISOString()), /De actualizat · /, 'aceeași zi, dar peste 5 minute');
  assert.match(m('2026-10-15T06:00:00Z'), /De actualizat · /, 'dimineața aceleiași zile');
});

// ---- 🔵 [6] ATR-ul propunerii de stop = Wilder, ca Portofoliul (TI.calcATR) ----
test('🔵 [6] StopSetter.atrPct = TI.calcATR (Wilder) / ultima închidere, pe aceleași bare', () => {
  const c = ctx(['lib/indicators.js', 'lib/stop-setter.js'], { localStorage: memorie() }), S = c.StopSetter, TI = c.TI;
  let x = 100, s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const bars = Array.from({ length: 63 }, () => { const o = x; x *= 1 + (r() - .5) * .06; return { o, h: Math.max(o, x) * (1 + r() * .02), l: Math.min(o, x) * (1 - r() * .02), c: x }; });
  const w = TI.calcATR(bars.map((b) => b.h), bars.map((b) => b.l), bars.map((b) => b.c), 14) / bars.at(-1).c * 100;
  assert.ok(Math.abs(S.atrPct(bars) - w) < 1e-9, S.atrPct(bars) + ' vs ' + w);
  assert.equal(S.atrPct(bars.slice(0, 14)), null);
});

// ---- 🟡 [6] corelația din Portofoliu = TTCaldura.corelatie (aceeași ca în Planuri) ----
test('🟡 [6] Portofoliu: perechile corelate se calculează cu TTCaldura.corelatie (log, aliniat pe dată, minim 60 de zile) când e încărcată', () => {
  const c = ctx(['lib/caldura-portofoliu.js', 'lib/holdings-intelligence.js']), I = c.HoldingsIntelligence, K = c.TTCaldura;
  let a = 100, b = 50, s = 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647 - .5);
  const t0 = Date.parse('2026-06-01T13:30:00Z'), A = [], B = [];
  for (let i = 0; i < 90; i++) { const z = r(); a *= 1 + z * .04; b *= 1 + (z * .9 + r() * .2) * .04; A.push({ t: t0 + i * 86400000, c: a }); B.push({ t: t0 + i * 86400000, c: b }); }
  const out = I.correlation({ bars: A }, { bars: B }), k = K.corelatie(A, B);
  assert.ok(out && k); assert.ok(Math.abs(out.value - k.r) < 1e-12); assert.equal(out.sessions, k.n);
  assert.equal(I.correlation({ bars: A.slice(-40) }, { bars: B.slice(-40) }), null, 'sub 60 de zile comune ⇒ necunoscut, ca în Planuri');
  assert.match(citeste('holdings/index.html'), /lib\/caldura-portofoliu\.js/);
});

// ---- 🔵 [8] Portofoliul arată aceleași reguli ca Astăzi („Încă N … în Portofoliu” duce undeva) ----
test('🔵 [8] TodayAttention.pentruPortofoliu: aceleași reguli din intrările Portofoliului (barele modelelor, calendarul, stopurile valide)', () => {
  const A = TA(), now = Date.parse('2026-10-17T10:00:00Z'), t0 = Date.parse('2026-07-01T13:30:00Z');
  const scade = Array.from({ length: 60 }, (_, i) => ({ t: t0 + i * 86400000, c: 400 - i }));
  const rows = A.pentruPortofoliu({
    positions: [{ ticker: 'AAPL_US_EQ', value: 3000, currency: 'USD', unrealized: -600 }, { ticker: 'NVDA_US_EQ', value: 1000, currency: 'USD', unrealized: 50 }],
    symbol: (p) => p.ticker.split('_')[0], total: 4000, currency: 'USD', models: { AAPL_US_EQ: { bars: scade } }, stopuri: new Set(['NVDA_US_EQ']),
    calendar: [{ ticker: 'NVDA_US_EQ', type: 'Earnings', date: '2026-10-19' }, { ticker: 'NVDA_US_EQ', type: 'Ex-dividend', date: '2026-10-18' }], prag: 20, now,
  });
  const t = rows.map((x) => x.text).join(' | ');
  assert.match(t, /AAPL: fără stop pus/); assert.match(t, /NVDA raportează rezultatele peste 2 zile/); assert.match(t, /AAPL: −16,7% de la intrare, sub media de 50 de zile/);
  assert.match(t, /AAPL e 75% din cont/); assert.match(t, /NVDA e 25% din cont/); assert.match(t, /verificările pe istoric.*NVDA/i);
  assert.equal(rows[0].sever, true);
  const w = citeste('holdings/workbench.js'); assert.match(w, /g\.TodayAttention/); assert.match(w, /\.pentruPortofoliu\(/); assert.match(w, /stopuriValide/); assert.match(w, /Aceleași reguli ca pe Astăzi/); assert.match(w, /esc\(a\.text\)/, 'textul trece prin esc()');
  assert.match(citeste('holdings/index.html'), /lib\/today-attention\.js/);
});

// ---- 🔵 [9] cod mort și rezerve ----
test('🔵 [9] HoldingsWorkspace.stress (fără apelanți) a dispărut; rezervele „are stop” sunt marcate ca rezervă', () => {
  const W = ctx(['lib/daily-series.js', 'lib/holdings-events.js', 'lib/holdings-workspace.js'], { URL, setTimeout, clearTimeout }).HoldingsWorkspace;
  assert.equal('stress' in W, false);
  assert.match(citeste('lib/today-attention.js'), /doar rezervă[^\n]*\n\s*function stopuri\(/);
  assert.match(citeste('lib/stop-setter.js'), /doar rezervă[^\n]*\n\s*function cuStop\(/);
});

// ---- 🔵 [7] rândul „ordin la broker, nenotat în Portofoliu” trimite la Portofoliu, nu la #stopPanel (care poate fi ascuns) ----
test('🔵 [7] ordinul STOP de la broker nenotat ⇒ rândul are ruta Portofoliului și eticheta lui; „fără stop” rămâne pe panoul de mai jos', () => {
  const A = TA(), ob = { citit: true, pozitii: new Map([['AAPL_US_EQ', { stare: 'da', sursa: 'broker', ordin: { stopPrice: 150.25, quantity: 2 } }]]) };
  const a = A.alerte({ positions: [{ ticker: 'AAPL_US_EQ', value: 1000 }, { ticker: 'MU_US_EQ', value: 1000 }], stops: new Set(), ordineBroker: ob });
  const nenotat = a.find((x) => x.ticker === 'AAPL_US_EQ' && x.grav === 4), fara = a.find((x) => x.ticker === 'MU_US_EQ' && x.grav === 5);
  assert.equal(nenotat.ruta, 'holdings/'); assert.match(nenotat.eticheta, /Portofoliu/); assert.match(nenotat.text, /notează-l în Portofoliu/); assert.doesNotMatch(nenotat.text, /mai jos/);
  assert.equal(fara.ruta, undefined, 'fără stop ⇒ panoul „Pune stopul acum” de pe Astăzi');
  assert.match(citeste('today/view.js'), /a\.sever&&!a\.ruta\?'#stopPanel'/, 'view.js folosește ruta rândului sever');
});
