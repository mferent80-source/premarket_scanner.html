// 27.10.2026 — lotul D al auditului (Planuri, scanner): lanțul planului închis la capete (I-752), gărzile închise la eroare (I-753),
// oprirea de urgență citită din tt_governor_oprire_v1, bifele LUI salvate cu planul (I-763), riscul afișat cu sens (auditul D 🟡/🔵).
// Desk-ul rulează în modul real (fără demo) când garda e despre date reale; în demo când e despre afișaj.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { boot, flush } from './desk-boot.mjs';

// mulberry32 (regula casei: niciodată LCG) — serii deterministe
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const T0 = Date.UTC(2026, 3, 1, 13, 30);
function serie(seed, n = 130) { const r = mulberry32(seed); let c = 100; return Array.from({ length: n }, (_, i) => { c *= 1 + (r() - 0.5) * 0.05; return { t: T0 + i * 86400000, o: c, h: c * 1.01, l: c * 0.99, c, v: 1e6 }; }); }

const ACUM = Date.parse('2026-10-08T15:00:00Z'); // joi, 11:00 la New York
const ticks = async (n = 6) => { for (let i = 0; i < n; i++) await flush(); };
function planBackup() { let record = null; return { get record() { return record; }, read: async () => structuredClone(record), update: async (fn) => { const r = fn(structuredClone(record)); record = structuredClone(r.record); return r.value; } }; }
const NEUTRU = () => ({ label: 'neutru', mult: 1, go: true, asOf: '2026-10-07', nota: '' });
function candidat(c, over = {}) {
  const sourceDate = c.DailySeries.expected(ACUM, 'America/New_York', 960);
  const x = { symbol: 'NVDA', mode: 'momentum', currency: 'USD', region: 'US', actionable: true, state: 'ARMED', ts: ACUM, sourceDate, sourceTimezone: 'America/New_York', sourceCloseMinutes: 960, entryLow: 100, entryHigh: 102, stop: 95, target: 116, score: 80, sector: 'Tech', reason: 'test', dayChg: 2, price: 101, rvol: 1.4, rsi: 58, rs: 3, atr: 2, ...over };
  x.trend = c.TTDecisionVerdict.trend(Array.from({ length: 240 }, (_, i) => { const p = x.price - 11.95 + i * 0.05; return { t: i + 1, o: p, h: p + 0.3, l: p - 0.2, c: p, v: 1e6 }; }));
  return x;
}
/* Planuri în modul real: un candidat NVDA actual (Top Long ⇒ plafonul probei 0,25 %), Governor TRADE, capital 10.000 */
function real({ files = ['lib/pret-viu.js', 'lib/caldura-portofoliu.js', 'lib/desk-proba.js'], regula = NEUTRU, market = true, pret = { stare: 'in-zona', text: 'prețul de acum 101,00 e în zona de intrare' }, D = null, gv = {}, seed = {}, plans = null, before = null } = {}) {
  const durable = planBackup(), cfg = { maxOpenPositions: 4, maxHeatPct: 4 };
  const GV = { cfg, status: () => ({ verdict: 'TRADE', reasons: [], openCount: 0, budgetLeftUsd: 200, maxLossWeekUsd: 300, weekPnl: 0, cfg, broker: null, ...gv }) };
  const extra = { GV, ...(market ? { MarketVerdict: { regula: (...a) => regula(...a), robotFile: async () => ({ label: 'neutru' }) } } : {}), ...(D ? { D } : {}) };
  const b = boot({ demo: false, now: ACUM, seed: { tt_ticket_capital: '10000', ...seed }, files, extra, before: (c) => {
    const create = c.TTPlanStore.create; c.TTPlanStore.create = (s, o) => create(s, { ...o, durable });
    const x = candidat(c); c.localStorage.setItem('ce_results_v2', JSON.stringify({ momentum: [x], reversal: [], analyses: [], updatedAt: ACUM }));
    if (plans) c.localStorage.setItem('tt_trade_plans_v1', JSON.stringify(plans(c, x)));
    if (c.TTPretViu) c.TTPretViu.verifica = async (s) => (pret ? { ...pret, symbol: s.symbol } : null);
    if (before) before(c, x);
  } });
  return { ...b, durable, GV, cfg };
}
async function deschide(b) { await ticks(); b.rows().find((r) => r.dataset.symbol === 'NVDA').onclick(); b.nodes.focusAction.onclick(); await ticks(); }
function clic(b, attr, id, valori = []) {
  const inputs = valori.map((value) => ({ value, disabled: false }));
  const el = { dataset: { [attr]: id }, disabled: false, closest: (q) => (q === '.qactions' ? { querySelectorAll: () => inputs } : null) };
  return b.nodes.queueRows.onclick({ target: { closest: () => el } });
}
const salvate = (b) => JSON.parse(b.durable.record.raw);

// ───────────── I-752: prețul de acum SUB stop blochează și candidatul scannerului ─────────────
test('I-752: prețul de acum sub stop ⇒ salvarea planului candidatului e refuzată cu motivul (nu doar text lângă „PLAN VALIDABIL”)', async () => {
  const b = real({ pret: { stare: 'sub-stop', text: 'prețul de acum 94,10 e SUB stop (95,00) — planul nu mai e valabil' } }); await deschide(b);
  assert.match(b.nodes.ticketVerdict.textContent, /SUB stop/); assert.doesNotMatch(b.nodes.ticketVerdict.textContent, /PLAN VALIDABIL/);
  assert.equal(b.nodes.ticketSave.disabled, true);
  const ok = real(); await deschide(ok);
  assert.match(ok.nodes.ticketVerdict.textContent, /PLAN VALIDABIL/); assert.equal(ok.nodes.ticketSave.disabled, false);
});

// ───────────── I-753: modulele-gardă declarate; lipsa unuia ⇒ tichet blocat ─────────────
test('I-753: un modul-gardă care nu s-a încărcat (căldura, verdictul pieței, prețul de acum) blochează tichetul cu numele lui', async () => {
  const fara = real({ files: ['lib/pret-viu.js', 'lib/desk-proba.js'] }); await deschide(fara);
  assert.match(fara.nodes.ticketVerdict.textContent, /nu s-a încărcat/); assert.match(fara.nodes.ticketVerdict.textContent, /căldur/); assert.equal(fara.nodes.ticketSave.disabled, true);
  const piata = real({ market: false }); await deschide(piata);
  assert.match(piata.nodes.ticketVerdict.textContent, /verdictul pieței.*nu s-a încărcat|nu s-a încărcat.*verdictul pieței/); assert.equal(piata.nodes.ticketSave.disabled, true);
  const pret = real({ files: ['lib/caldura-portofoliu.js', 'lib/desk-proba.js'] }); await deschide(pret);
  assert.match(pret.nodes.ticketVerdict.textContent, /prețul de acum.*nu s-a încărcat|nu s-a încărcat.*prețul de acum/); assert.equal(pret.nodes.ticketSave.disabled, true);
  const h = readFileSync('desk/index.html', 'utf8'); assert.match(h, /var GARZI=\[/);
});

// ───────────── I-753: corelația neverificată ⇒ etichetă + ×0,75; eroarea ⇒ blocat, reîncercare după 30 s ─────────────
const KO = (c, x) => [c.TradePlans.create({ ...x, symbol: 'KO', entryLow: 100, entryHigh: 100, stop: 90, target: 130 }, 100000, 0.05, { now: ACUM, id: 'ko' })];
test('I-753: o poziție deschisă fără serie zilnică ⇒ „corelație neverificată cu KO” în tichet și riscul planului ×0,75 (3 ⇒ 2 unități)', async () => {
  const D = { fetchStock: async (sym) => (sym === 'KO' ? [] : serie(7)) };
  const b = real({ D, plans: KO }); await deschide(b);
  assert.match(b.nodes.ticketCaldura.textContent, /corelație neverificată cu KO/); assert.match(b.nodes.ticketCaldura.textContent, /×0,75/);
  assert.match(b.nodes.ticketVerdict.textContent, /PLAN VALIDABIL/); assert.equal(b.nodes.ticketShares.textContent, '2 unități');
  assert.equal(b.nodes.ticketRiskPct.value, '0,19%');
  await b.nodes.ticketSave.onclick();
  const p = salvate(b).find((x) => x.symbol === 'NVDA'); assert.equal(p.shares, 2, 'planul salvat are mărimea din tichet, nu cea fără ×0,75'); assert.equal(p.riskPct, 0.1875);
  const cuSerie = real({ D: { fetchStock: async (sym) => serie(sym === 'KO' ? 99 : 7) }, plans: KO }); await deschide(cuSerie);
  assert.equal(cuSerie.nodes.ticketShares.textContent, '3 unități'); assert.doesNotMatch(cuSerie.nodes.ticketCaldura.textContent, /neverificată/);
});
test('I-753: corelația care aruncă eroare ⇒ tichet blocat (nu „verifică singur”), iar după 30 s se reîncearcă singură', async () => {
  let pica = true;
  const b = real({ D: { fetchStock: async () => serie(7) }, plans: KO, before: (c) => { const grup = c.TTCaldura.grup; c.TTCaldura.grup = (...a) => (pica ? Promise.reject(Error('rețea')) : grup(...a)); } });
  await deschide(b);
  assert.match(b.nodes.ticketVerdict.textContent, /corelația nu s-a putut calcula/); assert.equal(b.nodes.ticketSave.disabled, true);
  pica = false; b.nodes.ticketCapital.oninput.call(b.nodes.ticketCapital); await ticks();
  assert.match(b.nodes.ticketVerdict.textContent, /corelația nu s-a putut calcula/, 'înainte de 30 s nu se bate rețeaua la fiecare tastă');
  b.ceas.now += 31000; b.nodes.ticketCapital.oninput.call(b.nodes.ticketCapital); await ticks();
  assert.match(b.nodes.ticketVerdict.textContent, /PLAN VALIDABIL/);
});

// ───────────── I-752: la SIMULEAZĂ se re-rulează aceleași gărzi ca la salvare ─────────────
test('I-752: SIMULEAZĂ re-rulează gărzile salvării — căldura plină între timp ⇒ simularea refuzată cu motivul; planul rămâne PLANNED', async () => {
  const b = real(); await deschide(b); await b.nodes.ticketSave.onclick();
  const p = salvate(b)[0]; assert.equal(p.status, 'PLANNED'); assert.equal(p.shares, 3);
  b.cfg.maxHeatPct = 0.1; await clic(b, 'trigger', p.id, ['101']); await ticks();
  assert.match(b.nodes.queueStatus.textContent, /SIMULEAZĂ respins/); assert.match(b.nodes.queueStatus.textContent, /plafon|căldur|loc/i);
  assert.equal(salvate(b)[0].status, 'PLANNED');
  b.cfg.maxHeatPct = 4; await clic(b, 'trigger', p.id, ['101']); await ticks();
  assert.equal(salvate(b)[0].status, 'TRIGGERED', 'cu loc sub plafon simularea trece');
});

// ───────────── Oprirea de urgență (contractul tt_governor_oprire_v1, scris de lotul E) ─────────────
test('OPRIT: tt_governor_oprire_v1 activ ⇒ Planuri arată „OPRIT (motiv, ora)”, nu lasă plan nou și nici SIMULEAZĂ; re-armat ⇒ ca înainte', async () => {
  const oprit = { activ: true, la: '2026-10-08T14:32:00Z', motiv: 'piață haotică', aparat: 'PC acasă', ordineAnulate: [], rearmatLa: null, rearmatMotiv: null };
  const b = real({ seed: { tt_governor_oprire_v1: oprit }, plans: (c, x) => [c.TradePlans.create(x, 10000, 0.25, { now: ACUM, id: 'nv' })] }); await deschide(b);
  assert.match(b.nodes.ticketVerdict.textContent, /OPRIT/); assert.match(b.nodes.ticketVerdict.textContent, /piață haotică/); assert.match(b.nodes.ticketVerdict.textContent, /08\.10/);
  assert.equal(b.nodes.ticketSave.disabled, true);
  assert.equal(b.nodes.guardVerdict.textContent, 'OPRIT'); assert.match(b.nodes.guardText.textContent, /piață haotică/);
  await clic(b, 'trigger', 'nv', ['101']); await ticks();
  assert.match(b.nodes.queueStatus.textContent, /OPRIT/);
  b.memory.set('tt_governor_oprire_v1', JSON.stringify({ ...oprit, activ: false, rearmatLa: '2026-10-08T14:50:00Z', rearmatMotiv: 'verificat' }));
  b.emit('tt-oprire', { detail: {} }); await ticks();
  assert.match(b.nodes.ticketVerdict.textContent, /Există deja un plan activ|PLAN VALIDABIL/); assert.notEqual(b.nodes.guardVerdict.textContent, 'OPRIT');
  const stricat = real({ seed: { tt_governor_oprire_v1: '{nu e json' } }); await deschide(stricat);
  assert.match(stricat.nodes.ticketVerdict.textContent, /OPRIT/, 'starea opririi ilizibilă ⇒ închis la eroare');
  const h = readFileSync('desk/index.html', 'utf8'); assert.match(h, /'tt_governor_oprire_v1'/); assert.match(h, /addEventListener\('tt-oprire'/);
});

// ───────────── I-752: planurile PLANNED expiră după 2 sesiuni ─────────────
test('I-752: un plan PLANNED neexecutat de 2 sesiuni se anulează singur, cu motivul în listă, fără RESTABILEȘTE', async () => {
  const b = boot(); await ticks();
  assert.match(b.nodes.queueRows.innerHTML, /data-trigger="demo-a"/);
  b.ceas.now = Date.parse('2026-10-12T15:00:00Z'); // luni: vineri 09.10 și luni 12.10 ⇒ 2 sesiuni după joi 08.10
  b.intervals.findLast((i) => i.ms === 30000).fn(); await ticks();
  assert.match(b.nodes.queueRows.innerHTML, /expirat: 2 sesiuni/); assert.doesNotMatch(b.nodes.queueRows.innerHTML, /data-restore="demo-a"/); assert.doesNotMatch(b.nodes.queueRows.innerHTML, /data-trigger="demo-a"/);
});

// ───────────── I-763 (partea tichet): bifele LUI se salvează cu planul ─────────────
test('I-763: tichetul are 3–5 bife ale lui; se salvează în plan ca bife:[{id,text,da}] (și la ideea proprie)', async () => {
  const h = readFileSync('desk/index.html', 'utf8'), ids = [...h.matchAll(/<input type="checkbox" id="bifa-([a-z-]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 3 && ids.length <= 5, 'bife: ' + ids.join(','));
  const b = real(); await deschide(b);
  b.node('bifa-' + ids[0]).checked = true; b.node('bifa-' + ids[1]).checked = false;
  await b.nodes.ticketSave.onclick(); assert.match(b.nodes.ticketVerdict.textContent, /PLAN SALVAT/);
  const bife = salvate(b)[0].bife; assert.equal(bife.length, ids.length); assert.deepEqual(bife.map((x) => x.id), ids);
  assert.equal(bife[0].da, true); assert.equal(bife[1].da, false); assert.ok(bife.every((x) => typeof x.text === 'string' && x.text.length > 5));
  for (const x of bife) assert.ok(h.includes('id="bifa-' + x.id + '"> ' + x.text + '</label>'), 'textul salvat = eticheta din dialog: ' + x.id);
  assert.match(h, /function bifeTichet\(\)/); assert.match(h, /salveazaIdee[^\n]*bife:bifeTichet\(\)/);
});

// ───────────── auditul D 🟡/🔵: riscul afișat cu sens ─────────────
test('audit D: riscul plafonat × piața prudentă se scrie „0,25 % × 0,75 (piața prudentă) = 0,19 %”, nu „0,1875 %”; etichetele Guardrail știu de ×0,75; R:R cu o zecimală', async () => {
  const PROBA = JSON.parse(readFileSync('scanner-verdicts/generated/premarket-proba.json', 'utf8'));
  const prudent = () => ({ label: 'prudent', mult: 0.75, go: true, asOf: '2026-10-07', nota: 'Verdictul pieței PRUDENT (după sesiunea 07.10): risc ×0,75 — regula din Drafturi.' });
  const b = boot({ files: ['lib/desk-proba.js'], extra: { MarketVerdict: { regula: prudent, robotFile: async () => ({ label: 'prudent' }) } }, before: (c) => { c.TTProbaTopLong.set(PROBA); const d = c.T212Capital.demo; c.T212Capital.demo = (...a) => ({ ...d(...a), verdict: 'TRADE', reasons: [] }); } });
  await ticks(); b.rows().find((r) => r.dataset.symbol === 'FICTIV-A').onclick(); b.nodes.focusAction.onclick();
  assert.equal(b.nodes.ticketRiskPct.value, '0,19%');
  assert.match(b.nodes.ticketVerdict.textContent, /0,25 % × 0,75 \(piața prudentă\) = 0,19 %/); assert.doesNotMatch(b.nodes.ticketVerdict.textContent + b.nodes.guardRule.textContent, /0,1875/);
  assert.match(b.nodes.guardRule.textContent, /Top Long în probă: 0,25 % × 0,75 \(piața prudentă\) = 0,19 %/); assert.equal(b.nodes.guardExposure.textContent, 'REDUSĂ');
  assert.match(b.nodes.ticketRR.textContent, /^\d+,\dR/);
  b.ceas.now += 31 * 60000; b.intervals.findLast((i) => i.ms === 30000).fn(); await ticks();
  assert.equal(b.nodes.guardRisk.textContent, '0,00%', 'separatorul zecimal ro-RO și când datele sunt STALE');
  const h = readFileSync('desk/index.html', 'utf8');
  assert.match(h, /id="ticketRiskPct" type="text" value="0,50%"/); assert.doesNotMatch(h, /jumătate din riscul obișnuit/);
  assert.doesNotMatch(h, /informativ,\r?\n\s*\/\/ regula Guardrail \/ Governor nu se schimbă aici/);
});

// ───────────── Scannerul: motivul real al gărzii de raportări; fereastra volumului revizuit ─────────────
function scanner() {
  const nodes = {}, node = (id) => nodes[id] || (nodes[id] = { value: '', checked: false, innerHTML: '', textContent: '', disabled: false, hidden: false, dataset: {}, style: {}, classList: { toggle() {}, add() {}, remove() {} }, scrollIntoView() {} });
  const ctx = { Date, Intl, console, URLSearchParams, location: { search: '', origin: 'https://example.test' }, document: { getElementById: node, querySelectorAll: () => [], addEventListener() {}, hidden: false }, localStorage: { getItem: () => null, setItem() {} }, setTimeout: () => 0, clearTimeout() {}, addEventListener() {},
    D: { fetchStock: async () => { throw Error('fără rețea'); } }, MEB: { computeEarlyBird: () => ({}) }, WL: { get: () => [] }, GV: { status: () => ({ verdict: 'TRADE', reasons: [] }) }, TTDecisionPanel: { set() {} }, EL: { sectorOf: () => 'Technology' }, matchMedia: () => ({ matches: false }) };
  ctx.window = ctx; ctx.parent = ctx; vm.createContext(ctx);
  for (const f of ['lib/indicators.js', 'lib/daily-series.js', 'lib/decision-verdict.js', 'lib/candidate-plan-handoff.js', 'lib/desk-proba.js']) vm.runInContext(readFileSync(f, 'utf8'), ctx);
  const src = readFileSync('candidate-engine/engine.js', 'utf8'); vm.runInContext(src.slice(0, src.lastIndexOf('  validateDeps(); bind();')) + 'bind();window.hooks={state,render,earningsGate,earningsInfo,gardaEarnings,fereastraVolum};})();', ctx);
  return { ctx, node };
}
test('audit D 🟡: Finnhub căzut nu mai e „fără cheia Finnhub” — motivul real al calendarului stă în gardă (tot închisă la eroare)', async () => {
  const s = scanner(), h = s.ctx.hooks;
  s.ctx.EARN = { calendar: async () => ({ ok: false, motiv: 'Finnhub nu a răspuns (custom:timeout)' }) };
  await h.earningsGate();
  const e = h.earningsInfo('NVDA'); assert.equal(e.unverified, true);
  const g = h.gardaEarnings(e); assert.match(g, /Finnhub nu a răspuns \(custom:timeout\)/); assert.doesNotMatch(g, /fără cheia Finnhub/); assert.match(g, /nu se construiește plan/);
  s.ctx.EARN = undefined; await h.earningsGate(); assert.match(h.gardaEarnings(h.earningsInfo('NVDA')), /nu s-a încărcat/);
});
test('audit D 🔵: între 16:15 și 18:00 la New York (zi lucrătoare) scannerul spune că volumul zilei încă se revizuiește', () => {
  const f = scanner().ctx.hooks.fereastraVolum;
  assert.equal(f(Date.parse('2026-10-27T20:30:00Z')), true, '16:30 ET');
  assert.equal(f(Date.parse('2026-10-27T22:05:00Z')), false, '18:05 ET');
  assert.equal(f(Date.parse('2026-10-27T19:00:00Z')), false, '15:00 ET');
  assert.equal(f(Date.parse('2026-10-24T20:30:00Z')), false, 'sâmbătă');
  assert.match(readFileSync('candidate-engine/engine.js', 'utf8'), /se stabilizează după 18:00 ET/);
});
test('I-744 scanner: nota probei Top Long spune și când poate veni primul verdict (lib/proba-termen.js încărcat înaintea probei, ca în pagină)', () => {
  const s = scanner(), PROBA = JSON.parse(readFileSync('scanner-verdicts/generated/premarket-proba.json', 'utf8'));
  vm.runInContext(readFileSync('lib/proba-termen.js', 'utf8'), s.ctx); s.ctx.TTProbaTopLong.set(PROBA);
  s.ctx.hooks.state.momentum = []; s.ctx.hooks.render();
  assert.match(s.node('probaNota').textContent, /Top Long e în proba în timp: 0 din 8/); assert.match(s.node('probaNota').textContent, /Primul verdict posibil: ~\S+ 2027 \(8 perioade de 20 de sesiuni/); assert.match(s.node('probaNota').textContent, /putere nescrisă/);
  const h = readFileSync('candidate-engine/index.html', 'utf8'); assert.ok(h.indexOf('proba-termen.js?v=') > 0 && h.indexOf('proba-termen.js?v=') < h.indexOf('desk-proba.js?v='));
});
test('audit D 🟡: lângă verdictul pieței (care aplică regula) macro-rail-ul nu mai spune „Informativ — nu blochează execuțiile”', () => {
  const m = readFileSync('lib/desk-macro-rail.js', 'utf8');
  assert.doesNotMatch(m, /Informativ — nu blochează execuțiile/); assert.match(m, /verdictul pieței/);
});

// ───────────── Shadow Book: poarta de capital estimată la riscul unui plan, evaluările neverificabile spuse ─────────────
test('audit D 🔵: Shadow Book estimează poarta la 0,5 % din cont (riscul unui plan), nu 1 %; evaluarea neverificabilă (split) se vede în tabel', () => {
  const h = readFileSync('shadow-book/index.html', 'utf8');
  assert.match(h, /b\.account \* 0\.005/); assert.doesNotMatch(h, /b\.account \* 0\.01\b/);
  assert.match(h, /e\.neverificabil\?/);
});

// ───────────── Politica lotului D ─────────────
test('lotul D: politica adăugirilor e scrisă (plafonul Early Reversal, expirarea în sesiuni, ×0,75 la corelație neverificată, modulele-gardă, OPRIT)', () => {
  const p = readFileSync('docs/politica-adaugiri-D.md', 'utf8');
  for (const r of [/Early Reversal/, /0,25 %/, /2 sesiuni/, /×0,75/, /modul/i, /OPRIT/, /tt_governor_oprire_v1/, /bife/, /split/]) assert.match(p, r);
});
