// 19.10.2026 — performanța Jurnalului (audit Decision App): verificarea Governorului rula de 17–30 ori în 20 s — panoul de verdict
// refăcut la 10 s fără schimbare (build() înaintea ieșirii timpurii), STATE_KEY scris la fiecare apel (⇒ `storage` în celelalte pagini ⇒
// alt apel acolo), ceasurile mergeau și cu pagina parcată, iar Raportul (SPY 5 ani + 40 de simboluri + bootstrap 2000) se calcula pe orice filă.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const ACUM = Date.parse('2026-10-19T15:00:00Z');
function governor() {
  const store = new Map([['tt_journal_v1', JSON.stringify([{ id: 'a1', sym: 'AAPL', dir: 'long', entry: 100, exit: 105, size: 1, openTs: ACUM - 3 * 86400000, closeTs: ACUM - 2 * 86400000, status: 'closed' }])]]);
  let now = ACUM, writes = 0, reads = 0;
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const broker = { verdict: 'TRADE', reasons: [], state: 'ready', currency: 'USD', positions: 0, budgetLeft: 100, weekBudgetLeft: 300, totalStopRisk: 0, stopBudgetLeft: 100 };
  const c = { console, JSON, Math, Intl, Date: Clock, T212Capital: { read: () => { reads++; return broker; } },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { if (k === 'tt_governor_state_v1') writes++; store.set(k, String(v)); } } };
  c.window = c; vm.createContext(c); vm.runInContext(readFileSync('lib/governor.js', 'utf8'), c);
  return { GV: c.GV, store, tick: (ms) => { now += ms; }, reads: () => reads, writes: () => writes };
}

test('Governor: aceleași intrări ⇒ fără recalcul și fără o nouă scriere a stării (care trezea celelalte pagini)', () => {
  const g = governor();
  const a = g.GV.status(), b = g.GV.status(), c = g.GV.status();
  assert.equal(g.reads(), 1, 'contul Trading 212 recitit la fiecare apel');
  assert.equal(g.writes(), 1, 'starea scrisă la fiecare apel');
  assert.equal(b.verdict, a.verdict); assert.equal(JSON.stringify(c.reasons), JSON.stringify(a.reasons));
  b.reasons.push('modificat de un apelant'); assert.equal(g.GV.status().reasons.length, a.reasons.length, 'rezultatul ținut minte nu poate fi stricat de apelant');
  // după 30 s se reverifică (pragurile de timp: 5 min pentru Trading 212, ziua, 48 h), dar starea identică nu se rescrie
  g.tick(31000); g.GV.status(); assert.equal(g.reads(), 2); assert.equal(g.writes(), 1);
  // o execuție nouă ⇒ recalcul imediat
  const j = JSON.parse(g.store.get('tt_journal_v1')); j.push({ id: 'a2', sym: 'MSFT', dir: 'long', entry: 100, size: 1, openTs: ACUM, status: 'open' });
  g.store.set('tt_journal_v1', JSON.stringify(j));
  assert.equal(g.GV.status().openCount, 0, 'brokerul dă numărul de poziții'); assert.equal(g.reads(), 3); assert.equal(g.writes(), 2);
});

function panou({ vizibil = true } = {}) {
  let calls = 0, now = ACUM; const timers = [], events = {}, timeouts = [];
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const host = { dataset: {}, setAttribute() {}, querySelector() { return { value: '', hidden: false }; }, innerHTML: '' };
  const shellSubs = [];
  const c = { Date: Clock, Intl, AbortController, console, location: { origin: 'https://app.test', hash: '#desk' },
    document: { currentScript: { dataset: { decisionModule: 'journal' } }, readyState: 'complete', hidden: false, createElement: () => host, getElementById: () => null, querySelector: () => ({ prepend() {} }) },
    AI: { hasKey: () => false, DEFAULT_MODEL: 'x' }, localStorage: { getItem: () => null, setItem() {} },
    setInterval: (f) => { timers.push(f); }, setTimeout: (f) => { timeouts.push(f); return timeouts.length; }, addEventListener: (n, f) => { events[n] = f; },
    TTShell: { visible: () => vizibil, onChange: (f) => { shellSubs.push(f); } },
    GV: { status: () => { calls++; return { verdict: 'TRADE', reasons: [] }; } } };
  c.window = c; c.parent = c; vm.createContext(c);
  for (const f of ['lib/daily-series.js', 'lib/decision-verdict.js', 'lib/decision-insights.js', 'lib/decision-panel.js']) vm.runInContext(readFileSync(f, 'utf8'), c);
  return { calls: () => calls, timers, events, timeouts, tick: (ms) => { now += ms; }, show: (v) => { vizibil = v; shellSubs.forEach((f) => f(v)); } };
}

test('Panoul de verdict: ceasul de 10 s nu mai reface nimic fără schimbare; evenimentele se adună; nimic cât pagina e parcată', () => {
  const p = panou();
  const start = p.calls();
  for (let i = 0; i < 5; i++) { p.tick(10000); p.timers[0](); }
  assert.equal(p.calls(), start, 'Governor verificat la fiecare 10 s fără nicio schimbare');
  p.tick(20000); p.timers[0](); assert.equal(p.calls(), start + 1, 'la 60 s o reverificare (expirarea surselor)');
  // trei evenimente storage la rând ⇒ o singură refacere
  p.events.storage({ key: 'x' }); p.events.storage({ key: 'y' }); p.events.storage({ key: 'z' });
  assert.equal(p.timeouts.length, 1); p.timeouts[0](); assert.equal(p.calls(), start + 2);
  // parcată în aplicație: nici ceasul, nici evenimentele; la revenire, o dată
  const q = panou({ vizibil: false }), s = q.calls();
  q.tick(120000); q.timers[0](); q.events.storage({ key: 'x' });
  assert.equal(q.calls(), s); assert.equal(q.timeouts.length, 0);
  q.show(true); assert.equal(q.calls(), s + 1);
});

function raport({ fila = 'desk', vizibil = true } = {}) {
  let citiri = 0, luna = 0;
  const el = (id) => ({ id, hidden: false, innerHTML: '', textContent: '', className: '', addEventListener() {}, querySelector: () => null, appendChild() {}, scrollIntoView() {} });
  const host = el('jrrRaport'), pane = { ...el('jpaneRaport'), hidden: fila !== 'raport' }, subs = [];
  const c = { console, JSON, Math, Date, Intl, Promise, Set, Map, localStorage: { getItem: () => null, setItem() {} },
    document: { getElementById: (id) => (id === 'jrrRaport' ? host : id === 'jpaneRaport' ? pane : null), createElement: () => ({ ...el('tip'), style: {} }), body: { appendChild() {} }, addEventListener() {}, hidden: false },
    addEventListener() {}, TTShell: { visible: () => vizibil, onChange: (f) => { subs.push(f); } },
    JournalReport: { render: () => '<p>raport</p>', cuEtichete: (r) => r, calatorii: (rows) => ({ rows, moneda: 'EUR' }), stopuriR: (r) => r },
    MonthlyLimit: { limita: () => null, text: () => null, stare: () => ({}), setari: () => ({}), reimprospateaza: async () => { luna++; return null; }, salveazaLuna() {}, dinExecutii: () => ({}) },
    T212Performance: { read: () => { citiri++; return { rows: [], currency: 'EUR', state: 'ok' }; } } };
  c.window = c; vm.createContext(c); vm.runInContext(readFileSync('journal/report.js', 'utf8'), c);
  return { c, pane, citiri: () => citiri, luna: () => luna, arata: (v) => { vizibil = v; subs.forEach((f) => f(v)); } };
}
const asteapta = () => new Promise((r) => setTimeout(r, 10));

test('Raportul se calculează doar cu fila Raport deschisă; altfel doar rezultatul lunii (pentru limita lunară din Astăzi)', async () => {
  const r = raport({ fila: 'desk' });
  await asteapta();
  assert.equal(r.citiri(), 0, 'raportul complet s-a calculat pe fila Risc & capital');
  assert.equal(r.luna(), 1, 'rezultatul lunii rămâne calculat');
  r.pane.hidden = false; r.c.JournalReportUI.activeaza(); await asteapta();
  assert.equal(r.citiri(), 1);
  const p = raport({ fila: 'raport', vizibil: false }); await asteapta();
  assert.equal(p.citiri(), 0, 'pagina parcată în aplicație'); p.arata(true); await asteapta(); assert.equal(p.citiri(), 1);
});

test('bootstrap-ul de 2000 de extrageri nu se reface la fiecare desen pe aceleași rezultate', () => {
  const c = { console, Intl, Math, Date, JSON }; c.window = c; vm.createContext(c);
  vm.runInContext(readFileSync('lib/journal-report.js', 'utf8'), c);
  const tr = Array.from({ length: 30 }, (_, i) => ({ rez: (i % 3) - 0.8 }));
  const a = c.JournalReport.incredere(tr), b = c.JournalReport.incredere(tr.map((x) => ({ ...x })));
  assert.equal(a, b, 'recalculat la fiecare desen');
  assert.notEqual(c.JournalReport.incredere(tr.slice(1)), a, 'rezultate noi ⇒ calcul nou');
});

test('Jurnalul: ceasurile trec prin TTShell (pagina parcată nu lucrează), modulul e încărcat înaintea panoului de verdict', () => {
  const html = readFileSync('journal/index.html', 'utf8');
  const shell = html.indexOf('lib/shell-visibility.js?v='), panel = html.indexOf('lib/decision-panel.js?v=');
  assert.ok(shell > 0 && shell < panel, 'shell-visibility.js lipsește sau vine după decision-panel.js');
  assert.doesNotMatch(html, /setInterval\(renderDesk/); assert.doesNotMatch(html, /setInterval\(checkWeeklyReport/);
  assert.match(html, /TTShell\.every/);
  assert.match(readFileSync('lib/setup-builder.js', 'utf8'), /TTShell\.every\(renderFreezeBanner/);
});
