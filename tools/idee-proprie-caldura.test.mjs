// 19.10.2026 — I-718 (calculatorul de risc pentru ideile LUI, orice simbol USD) și I-719 (căldura portofoliului: riscul deschis
// până la stopuri ≤ plafon, cel mult 2 poziții din același grup de corelație). Fără semnal: doar risc, aceleași gărzi ca la scanner.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { boot, flush } from './desk-boot.mjs';

const load = (files, extra = {}) => { const c = { console, Number, Date, Math, JSON, Map, Set, Array, Promise, Intl, ...extra }; c.window = c; c.globalThis = c; vm.createContext(c); for (const f of [].concat(files)) vm.runInContext(readFileSync(f, 'utf8'), c, { filename: f }); return c; };

// mulberry32 (regula casei: niciodată LCG) — serii deterministe
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const T0 = Date.UTC(2026, 3, 1, 13, 30);
function serie(randamente, start = 100) { let c = start; return randamente.map((r, i) => { c *= 1 + r; return { t: T0 + i * 86400000, o: c, h: c * 1.01, l: c * 0.99, c, v: 1e6 }; }); }
function randamente(seed, n = 130, sd = 0.015) { const r = mulberry32(seed); return Array.from({ length: n }, () => (r() - 0.5) * 2 * sd * 1.7); }
const BAZA = randamente(11), ZGOMOT = randamente(22, 130, 0.004), INDEP = randamente(33);
const corelat = (k) => serie(BAZA.map((x, i) => x + ZGOMOT[(i + k * 7) % ZGOMOT.length]), 150 + k);
const independent = () => serie(INDEP, 80);

// ───────────── TradePlans: sursa „manual” ─────────────
test('I-718: TradePlans creează și validează un plan cu sursa „manual” (idee proprie); tranzițiile merg; un plan scanner rămâne la fel', () => {
  const T = load('lib/trade-plans.js').TradePlans, now = Date.now();
  const cand = { symbol: 'MSFT', mode: 'manual', source: 'manual', currency: 'USD', actionable: true, ts: now, entryLow: 200, entryHigh: 200, stop: 194, target: 212, sourceDate: '2026-10-19', reason: 'idee proprie' };
  const p = T.create(cand, 10000, 0.5, { now });
  assert.ok(p, 'planul manual se creează'); assert.equal(p.source, 'manual'); assert.equal(p.mode, 'manual');
  assert.equal(T.validate(p, now).ok, true);
  const t = T.transition(p, 'trigger', { now, allowed: true, fillEntry: 199 }); assert.ok(t); assert.equal(t.status, 'TRIGGERED');
  assert.equal(T.exposure([t]).ok, true);
  assert.equal(T.validate({ ...p, source: undefined }, now).ok, false, 'modul „manual” fără sursa „manual” nu trece');
  assert.equal(T.create({ ...cand, source: undefined }, 10000, 0.5, { now }), null);
  const s = T.create({ ...cand, mode: 'momentum', source: undefined, score: 80 }, 10000, 0.5, { now });
  assert.ok(s); assert.equal(s.source, undefined, 'planurile scannerului nu primesc câmp nou');
});

// ───────────── TTIdeeProprie: niveluri, ATR, earnings, USD ─────────────
test('I-718: nivelurile ideii — stop scris sau ATR × k, intrarea = prețul de acum dacă nu e scrisă, ținta implicită 2R doar pentru calcul', () => {
  const I = load('lib/idee-proprie.js').TTIdeeProprie;
  const a = I.nivele({ pret: 100, atrK: 1.5, atr: 2 });
  assert.equal(a.ok, true); assert.equal(a.entry, 100); assert.equal(a.stop, 97); assert.equal(a.target, 106); assert.equal(a.metoda, 'atr'); assert.equal(a.tintaImplicita, true);
  const b = I.nivele({ pret: 100, intrare: 98, stop: 95, tinta: 110 });
  assert.equal(b.entry, 98); assert.equal(b.stop, 95); assert.equal(b.target, 110); assert.equal(b.metoda, 'scris'); assert.equal(b.tintaImplicita, false);
  assert.match(I.nivele({ pret: 100 }).mesaj, /stop/i);
  assert.match(I.nivele({ pret: 100, stop: 101 }).mesaj, /sub intrare/);
  assert.match(I.nivele({ stop: 90 }).mesaj, /prețul de acum/i);
  assert.match(I.nivele({ pret: 100, atrK: 1.5, atr: null }).mesaj, /ATR/);
});

test('I-718: ATR(14) Wilder identic cu TI.calcATR; doar acțiuni SUA (USD) — altfel mesaj clar', () => {
  const I = load('lib/idee-proprie.js').TTIdeeProprie, TI = load('lib/indicators.js').TI, b = corelat(1);
  const ref = TI.calcATR(b.map((x) => x.h), b.map((x) => x.l), b.map((x) => x.c), 14);
  assert.ok(Math.abs(I.atr(b, 14) - ref) < 1e-9);
  assert.equal(I.simbolUS(' aapl '), 'AAPL'); assert.equal(I.simbolUS('brk.b'), 'BRK-B'); assert.equal(I.simbolUS('SAP.DE'), null); assert.equal(I.simbolUS('VUSA.L'), null);
});

test('I-718: earnings închis la eroare — calendar necitit ⇒ blocat; raportare în 14 zile ⇒ blocat (ca la scanner); fără raportare ⇒ liber', () => {
  const I = load('lib/idee-proprie.js').TTIdeeProprie, now = Date.parse('2026-10-08T15:00:00Z');
  assert.equal(I.earnings(null, 'MSFT', now).blocat, true);
  assert.match(I.earnings({ ok: false, motiv: 'fără cheie', items: [] }, 'MSFT', now).text, /earnings neverificat/);
  const r = I.earnings({ ok: true, items: [{ symbol: 'MSFT', date: '2026-10-15' }] }, 'MSFT', now);
  assert.equal(r.blocat, true); assert.match(r.text, /raportează în 7 zile/);
  const ok = I.earnings({ ok: true, items: [{ symbol: 'AAPL', date: '2026-10-15' }] }, 'MSFT', now);
  assert.equal(ok.blocat, false); assert.match(ok.text, /fără raportări/);
});

test('I-718: pregătirea citește seria zilnică (ATR, moneda), prețul de acum și calendarul; acțiune în EUR ⇒ refuzată cu motiv', async () => {
  const daily = corelat(2); daily.meta = { currency: 'USD' };
  const eur = corelat(3); eur.meta = { currency: 'EUR' };
  const c = load(['lib/pret-viu.js', 'lib/idee-proprie.js'], {
    D: { fetchStock: async (sym, o) => { if (o.interval === '1m') { const m = [{ t: Date.now(), c: 210 }]; m.meta = { quoteAt: Date.now() }; return m; } return sym === 'SAPX' ? eur : daily; } },
    EARN: { calendar: async () => ({ ok: true, items: [] }) }
  });
  const a = await c.TTIdeeProprie.pregateste('MSFT');
  assert.equal(a.ok, true); assert.equal(a.pret, 210); assert.ok(a.atr > 0); assert.equal(a.earnings.blocat, false);
  const e = await c.TTIdeeProprie.pregateste('SAPX');
  assert.equal(e.ok, false); assert.match(e.mesaj, /EUR/); assert.match(e.mesaj, /doar acțiuni în USD/);
});

// ───────────── TTCaldura: riscul deschis până la stopuri ─────────────
test('I-719: căldura = stopurile reale + planurile Shadow deschise; poziție fără stop = risc necunoscut (nu 0) ⇒ blocat; loc rămas până la plafon', () => {
  const T = load('lib/trade-plans.js').TradePlans, K = load('lib/caldura-portofoliu.js').TTCaldura, now = Date.now();
  const plan = T.create({ symbol: 'NVDA', mode: 'momentum', currency: 'USD', actionable: true, ts: now, entryLow: 100, entryHigh: 100, stop: 90, target: 130, score: 80 }, 100000, 0.1, { now });
  assert.equal(plan.risk, 100);
  const broker = { rows: [{ ticker: 'AAPL_US_EQ', stopRisk: 92 }, { ticker: 'KO_US_EQ', stopRisk: 46 }] };
  const r = K.riscDeschis({ broker, rate: 0.92, plans: [plan], contUsd: 10000, plafonPct: 4 });
  assert.equal(r.ok, true); assert.equal(Math.round(r.realUsd), 150); assert.equal(r.planuriUsd, 100); assert.equal(Math.round(r.locUsd), 150); assert.equal(r.plafonUsd, 400);
  assert.match(r.text, /4 %/);
  const fara = K.riscDeschis({ broker: { rows: [{ ticker: 'AAPL_US_EQ', stopRisk: null }] }, rate: 1, plans: [], contUsd: 10000, plafonPct: 4 });
  assert.equal(fara.ok, false); assert.deepEqual([...fara.necunoscute], ['AAPL_US_EQ']); assert.match(fara.text, /necunoscut/);
  const plin = K.riscDeschis({ broker: null, plans: [plan, { ...plan, id: 'b' }, { ...plan, id: 'c' }, { ...plan, id: 'd' }], contUsd: 10000, plafonPct: 4 });
  assert.equal(plin.ok, false); assert.match(plin.text, /fără loc/);
  const anulat = K.riscDeschis({ broker: null, plans: [{ ...plan, status: 'CANCELLED' }], contUsd: 10000, plafonPct: 4 });
  assert.equal(anulat.planuriUsd, 0, 'doar planurile deschise (PLANNED / TRIGGERED)');
});

test('I-719: corelația pe 90 de zile (randamente zilnice) — serii legate ≥ 0,7, independente sub; a 3-a din același grup ⇒ blocată', () => {
  const K = load('lib/caldura-portofoliu.js').TTCaldura;
  const r = K.corelatie(corelat(1), corelat(2)); assert.ok(r && r.r >= 0.7, 'legate: ' + (r && r.r)); assert.equal(r.n, 90);
  const z = K.corelatie(corelat(1), independent()); assert.ok(z && Math.abs(z.r) < 0.5, 'independente: ' + (z && z.r));
  assert.equal(K.corelatie(corelat(1).slice(-30), corelat(2)), null, 'sub 60 de zile comune ⇒ necunoscut');
  const serii = new Map([['AVGO', corelat(3)], ['NVDA', corelat(1)], ['AMD', corelat(2)], ['KO', independent()]]);
  const g = K.evalueazaGrup('AVGO', serii, ['NVDA', 'AMD', 'KO']);
  assert.equal(g.blocat, true); assert.match(g.text, /NVDA/); assert.match(g.text, /AMD/); assert.match(g.text, /0,7/);
  const unu = K.evalueazaGrup('AVGO', serii, ['NVDA', 'KO']); assert.equal(unu.blocat, false);
  const nec = K.evalueazaGrup('AVGO', new Map([['AVGO', corelat(3)], ['NVDA', corelat(1)], ['XYZ', null]]), ['NVDA', 'XYZ']);
  assert.equal(nec.blocat, false); assert.deepEqual([...nec.necunoscute], ['XYZ']); assert.match(nec.text, /neverificată/);
  assert.equal(K.simbolDinTicker('NVDA_US_EQ'), 'NVDA'); assert.equal(K.simbolDinTicker('VUSAl_EQ'), null);
});

test('I-719: Governor are plafonul căldurii (implicit 4 %), editabil și salvat în tt_governor_cfg_v1; pagina Jurnal îl arată', () => {
  const store = new Map(), c = load('lib/governor.js', { localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) } });
  assert.equal(c.GV.DEFAULTS.maxHeatPct, 4); assert.equal(c.GV.cfg().maxHeatPct, 4);
  assert.ok(c.GV.saveCfg({ maxHeatPct: 3 })); assert.equal(JSON.parse(store.get('tt_governor_cfg_v1')).maxHeatPct, 3); assert.equal(c.GV.cfg().maxHeatPct, 3);
  assert.equal(c.GV.saveCfg({ maxHeatPct: 0 }), null, 'plafon invalid refuzat');
  const j = readFileSync('journal/index.html', 'utf8');
  assert.match(j, /id="cHeat"/); assert.match(j, /maxHeatPct:\+\$\('cHeat'\)\.value/); assert.match(j, /\$\('cHeat'\)\.value = c\.maxHeatPct/);
});

// ───────────── Planuri (desk): tichetul ideii proprii + căldura ─────────────
const ACUM = Date.parse('2026-10-08T15:00:00Z');
function planBackup() { let record = null; return { get record() { return record; }, read: async () => structuredClone(record), update: async (fn) => { const r = fn(structuredClone(record)); record = structuredClone(r.record); return r.value; } }; }
function desk({ earnings = { ok: true, items: [] }, seedPlans = null, serii = {}, gv = {} } = {}) {
  const durable = planBackup(), cereri = [];
  const D = { fetchStock: async (sym, o) => { cereri.push(sym + ':' + o.interval); if (o.interval === '1m') { const m = [{ t: ACUM, c: 200 }]; m.meta = { quoteAt: ACUM }; return m; } const s = (serii[sym] || (() => corelat(9)))(); s.meta = { currency: sym === 'SAPX' ? 'EUR' : 'USD' }; return s; } };
  const GV = { status: () => ({ verdict: 'TRADE', reasons: [], openCount: 0, budgetLeftUsd: 200, maxLossWeekUsd: 300, weekPnl: 0, cfg: { maxOpenPositions: 4, maxHeatPct: 4 }, broker: null, ...gv }) };
  const seed = { tt_ticket_capital: '10000' }; if (seedPlans) seed.tt_trade_plans_v1 = seedPlans;
  const b = boot({ demo: false, now: ACUM, seed, files: ['lib/pret-viu.js', 'lib/idee-proprie.js', 'lib/caldura-portofoliu.js'], extra: { D, GV, EARN: { calendar: async () => earnings } }, before: (c) => { const create = c.TTPlanStore.create; c.TTPlanStore.create = (s, o) => create(s, { ...o, durable }); } });
  return { ...b, durable, cereri };
}
async function idee(b, { sym = 'MSFT', k = '1.5', stop = '' } = {}) {
  await flush(); b.nodes.queueIdee.onclick(); b.nodes.ideeSimbol.value = sym; b.nodes.ideeAtrK.value = k; b.nodes.ideeStop.value = stop;
  b.nodes.ideeCalc.onclick(); for (let i = 0; i < 6; i++) await flush();
}

test('I-718 Planuri: „idee proprie” — simbol + ATR × k ⇒ aceeași dimensionare, textul spune că e calculul riscului, nu o recomandare; planul se salvează cu sursa „manual”', async () => {
  const b = desk(); await idee(b);
  assert.equal(b.nodes.ticketWrap.open, true); assert.equal(b.nodes.ticketIdee.hidden, false);
  assert.match(b.nodes.ticketSetup.textContent, /IDEE PROPRIE/);
  assert.match(b.nodes.ticketVerdict.textContent, /PLAN VALIDABIL/); assert.match(b.nodes.ticketVerdict.textContent, /nu o recomandare/);
  assert.equal(b.nodes.ticketRiskPct.value, '0,50%');
  assert.equal(b.nodes.ticketSave.disabled, false);
  await b.nodes.ticketSave.onclick();
  assert.match(b.nodes.ticketVerdict.textContent, /PLAN SALVAT/);
  const saved = JSON.parse(b.durable.record.raw); assert.equal(saved.length, 1); assert.equal(saved[0].source, 'manual'); assert.equal(saved[0].symbol, 'MSFT');
  assert.match(b.nodes.queueRows.innerHTML, /IDEE PROPRIE/);
});

test('I-718 Planuri: raportare în 14 zile sau calendar necitit ⇒ blocat; acțiune în altă monedă ⇒ mesaj clar; Governor HALTED ⇒ blocat', async () => {
  let b = desk({ earnings: { ok: true, items: [{ symbol: 'MSFT', date: '2026-10-12' }] } }); await idee(b);
  assert.match(b.nodes.ticketVerdict.textContent, /raportează în 4 zile/); assert.equal(b.nodes.ticketSave.disabled, true);
  b = desk({ earnings: { ok: false, motiv: 'fără cheie', items: [] } }); await idee(b);
  assert.match(b.nodes.ticketVerdict.textContent, /earnings neverificat/); assert.equal(b.nodes.ticketSave.disabled, true);
  b = desk(); await idee(b, { sym: 'SAP.DE' });
  assert.match(b.nodes.ticketVerdict.textContent, /Doar acțiuni SUA/); assert.equal(b.nodes.ticketSave.disabled, true);
  b = desk(); await idee(b, { sym: 'SAPX' });
  assert.match(b.nodes.ticketVerdict.textContent, /EUR/); assert.equal(b.nodes.ticketSave.disabled, true);
  b = desk({ gv: { verdict: 'HALTED' } }); await idee(b);
  assert.match(b.nodes.ticketVerdict.textContent, /Governor nu permite/); assert.equal(b.nodes.ticketSave.disabled, true);
});

function planuri(T, simboluri, riscPct, now) {
  return simboluri.map((s, i) => T.create({ symbol: s, mode: 'momentum', currency: 'USD', actionable: true, ts: now, entryLow: 100, entryHigh: 100, stop: 90, target: 130, score: 80 }, 100000, riscPct, { now, id: 'p' + i }));
}
test('I-719 Planuri: căldura aproape de plafon ⇒ mărime redusă la cât încape, cu motivul la vedere; plafonul plin ⇒ blocat', async () => {
  const T = load('lib/trade-plans.js', { Date: class extends Date { static now() { return ACUM; } } }).TradePlans;
  let b = desk({ seedPlans: planuri(T, ['KO'], 0.38, ACUM), serii: { KO: independent } }); await idee(b);
  assert.match(b.nodes.ticketVerdict.textContent, /PLAN VALIDABIL/); assert.match(b.nodes.ticketCaldura.textContent, /redus/);
  assert.equal(b.nodes.ticketCaldura.hidden, false);
  const unitati = Number(b.nodes.ticketShares.textContent.split(' ')[0]), risc = Number(b.nodes.ticketMoneyRisk.textContent.replace(' USD', '').replace(/\./g, '').replace(',', '.'));
  assert.ok(unitati >= 1 && risc > 0 && risc <= 20 + 1e-9, 'redus la locul rămas (400 − 380 = 20 USD): ' + unitati + ' unități, ' + risc + ' USD');
  assert.match(b.nodes.ticketCaldura.textContent, new RegExp('la ' + unitati + ' unități'));
  b = desk({ seedPlans: planuri(T, ['KO'], 0.4, ACUM), serii: { KO: independent } }); await idee(b);
  assert.match(b.nodes.ticketVerdict.textContent, /fără loc/); assert.equal(b.nodes.ticketSave.disabled, true);
});

test('I-719 Planuri: a 3-a poziție din același grup de corelație (≥ 0,7 pe 90 de zile) ⇒ blocată; și pentru candidații scannerului se aplică', async () => {
  const T = load('lib/trade-plans.js', { Date: class extends Date { static now() { return ACUM; } } }).TradePlans;
  const b = desk({ seedPlans: planuri(T, ['NVDA', 'AMD'], 0.05, ACUM), serii: { NVDA: () => corelat(1), AMD: () => corelat(2), AVGO: () => corelat(3) } });
  await idee(b, { sym: 'AVGO' });
  assert.match(b.nodes.ticketVerdict.textContent, /corelat/); assert.match(b.nodes.ticketVerdict.textContent, /NVDA/); assert.equal(b.nodes.ticketSave.disabled, true);
  const h = readFileSync('desk/index.html', 'utf8');
  assert.match(h, /function garziComune\(x,rows,capital,riskPct\)/); assert.match(h, /return garziComune\(x,rows,capital,allowedRisk\(x\)\);/);
  assert.match(h, /lib\/caldura-portofoliu\.js\?v=[\d.]+/); assert.match(h, /lib\/idee-proprie\.js\?v=[\d.]+/); assert.match(h, /lib\/earnings\.js\?v=[\d.]+/);
});

// ───────────── 27.10.2026 — I-752 / I-753 (auditul D): gărzile deschise la eroare se închid ─────────────
test('I-753: corelația cu serii lipsă NU trece tăcut — perechile neverificate sunt numite în text și riscul se înmulțește cu 0,75', () => {
  const K = load('lib/caldura-portofoliu.js').TTCaldura;
  const nec = K.evalueazaGrup('AVGO', new Map([['AVGO', corelat(3)], ['NVDA', corelat(1)], ['XYZ', null]]), ['NVDA', 'XYZ']);
  assert.equal(nec.blocat, false); assert.equal(nec.neverificat, true); assert.equal(nec.mult, 0.75);
  assert.match(nec.text, /corelație neverificată cu XYZ/); assert.match(nec.text, /×0,75/);
  const ok = K.evalueazaGrup('AVGO', new Map([['AVGO', corelat(3)], ['KO', independent()]]), ['KO']);
  assert.equal(ok.neverificat, false); assert.equal(ok.mult, 1);
  const gol = K.evalueazaGrup('AVGO', new Map([['AVGO', corelat(3)]]), []); assert.equal(gol.neverificat, false); assert.equal(gol.mult, 1);
  assert.equal(K.MULT_NEVERIFICAT, 0.75);
});

test('I-752: ADV necunoscut (sub 20 de sesiuni cu volum) blochează ideea proprie cu motiv — închis la eroare, nu „trece”', async () => {
  const scurta = corelat(2).slice(-12); scurta.meta = { currency: 'USD' };
  const c = load(['lib/pret-viu.js', 'lib/idee-proprie.js'], { D: { fetchStock: async (sym, o) => (o.interval === '1m' ? [{ t: Date.now(), c: 210 }] : scurta) }, EARN: { calendar: async () => ({ ok: true, items: [] }) } });
  const a = await c.TTIdeeProprie.pregateste('NOU');
  assert.equal(a.ok, false); assert.match(a.mesaj, /lichiditatea nu se poate verifica/); assert.match(a.mesaj, /20 de sesiuni/);
  assert.equal(c.TTIdeeProprie.advUsd(corelat(2).slice(-12), 20), null);
  const faraVolum = corelat(2); faraVolum[faraVolum.length - 3].v = undefined; assert.equal(c.TTIdeeProprie.advUsd(faraVolum, 20), null);
});

test('audit D (🔵): ATR-ul și ADV-ul ideii proprii se calculează pe sesiuni ÎNCHEIATE (DailySeries.read) — bara parțială a zilei nu strânge stopul; seria fără identitate ⇒ seria brută, cu nota la vedere', async () => {
  const NOW = Date.parse('2026-10-27T15:00:00Z'); // marți, 11:00 la New York — ședința e deschisă, ultima sesiune încheiată e luni 26.10
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
  const c = load(['lib/exchange-calendar.js', 'lib/daily-series.js', 'lib/pret-viu.js', 'lib/idee-proprie.js'], { Date: Clock, EARN: { calendar: async () => ({ ok: true, items: [] }) }, D: {} });
  const asOf = c.DailySeries.expected(NOW, 'America/New_York', 960); assert.equal(asOf, '2026-10-26');
  const zile = []; let d = asOf; while (zile.length < 140) { if (c.ExchangeCalendar.session('US', d).state === 'open') zile.unshift(d); d = c.ExchangeCalendar.add(d, -1); }
  const r = mulberry32(7), incheiate = zile.map((zi) => { const p = 100 + (r() - 0.5) * 4; return { t: Date.parse(zi + 'T13:30:00Z'), o: p, h: p + 1, l: p - 1, c: p, v: 2e6 }; });
  const partiala = { t: Date.parse('2026-10-27T13:30:00Z'), o: 100, h: 140, l: 60, c: 100, v: 1e5 }; // TR uriaș, volum mic: ar strica ATR și ADV
  const meta = { symbol: 'MSFT', currency: 'USD', timezone: 'America/New_York', exchange: 'NMS', regularEnd: Date.parse('2026-10-27T20:00:00Z'), interval: '1d' };
  const cuIdentitate = incheiate.concat([partiala]); cuIdentitate.meta = meta;
  c.D.fetchStock = async (sym, o) => (o.interval === '1m' ? [{ t: NOW, c: 100 }] : cuIdentitate);
  const a = await c.TTIdeeProprie.pregateste('MSFT');
  assert.equal(a.ok, true); assert.ok(Math.abs(a.atr - c.TTIdeeProprie.atr(incheiate, 14)) < 1e-9, 'ATR pe sesiunile încheiate, fără bara zilei'); assert.equal(a.nota, null);
  const bruta = incheiate.concat([partiala]); bruta.meta = { currency: 'USD' };
  c.D.fetchStock = async (sym, o) => (o.interval === '1m' ? [{ t: NOW, c: 100 }] : bruta);
  const b = await c.TTIdeeProprie.pregateste('MSFT');
  assert.equal(b.ok, true); assert.match(b.nota, /sesiunilor încheiate/); assert.ok(b.atr > a.atr, 'pe seria brută bara parțială intră în ATR — de aceea se spune');
});
