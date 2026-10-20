// 18.10.2026 (el: „optimizăm pagina Planuri” → „fă A”): Planuri pornește singură scanarea Premarket când copia lipsește sau are peste
// 30 de minute — așteaptă scanarea din fundal a aplicației dacă rulează, altfel un cadru ascuns candidate-engine/?fundal=1.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const T0 = Date.parse('2026-10-19T14:00:00Z');
function lume({ salvat = 0, demo = false, ascuns = false, offline = false, shell = false } = {}) {
  let acum = T0, shellRuleaza = shell; const store = new Map(), cadre = [], stari = [], intervale = [];
  if (salvat) store.set('ce_results_v2', JSON.stringify({ updatedAt: salvat }));
  const doc = { hidden: ascuns, body: { appendChild: (f) => cadre.push(f) }, createElement: () => { const f = { hidden: false, src: '', removed: false, remove() { this.removed = true; }, contentDocument: { getElementById: (id) => (id === 'ctxScanned' ? { textContent: '40 / 85' } : null) } }; return f; } };
  const c = { console, JSON, Math, Date: class extends Date { constructor(...a) { super(...(a.length ? a : [acum])); } static now() { return acum; } } };
  c.window = c; c.parent = shell !== null ? { ttBackgroundScan: { state: () => ({ running: shellRuleaza }) } } : c; c.navigator = { onLine: !offline }; c.document = doc;
  vm.createContext(c); vm.runInContext(readFileSync('desk/auto-scan.js', 'utf8'), c);
  const a = c.TTDeskAutoScan.create({ storage: { getItem: (k) => store.get(k) ?? null }, demo, onState: (s) => stari.push(s), setInterval: (fn) => { intervale.push(fn); return intervale.length; }, clearInterval() {} });
  return { a, store, cadre, stari, tic: () => intervale.at(-1)?.(), treci: (ms) => { acum += ms; }, salveaza: () => store.set('ce_results_v2', JSON.stringify({ updatedAt: acum })), opresteShell: () => { shellRuleaza = false; } };
}

test('no saved scan: a hidden scanner frame starts once, progress is reported, and it is removed when the new copy is saved', () => {
  const w = lume();
  assert.equal(w.a.start(), true); assert.equal(w.cadre.length, 1); assert.match(w.cadre[0].src, /candidate-engine\/\?fundal=1/); assert.equal(w.cadre[0].hidden, true);
  assert.equal(w.a.start(), false, 'nu pornește a doua oară cât rulează');
  w.treci(3000); w.tic(); assert.equal(w.stari.at(-1).faza, 'scanez'); assert.equal(w.stari.at(-1).progres, '40 / 85');
  w.treci(5000); w.salveaza(); w.tic(); assert.equal(w.stari.at(-1).faza, 'gata'); assert.equal(w.cadre[0].removed, true);
});
test('a fresh copy (under 30 minutes) starts nothing; an old one (over 30 minutes) does', () => {
  assert.equal(lume({ salvat: T0 - 10 * 60000 }).a.start(), false);
  assert.equal(lume({ salvat: T0 - 31 * 60000 }).a.start(), true);
});
test('never in demo, on a hidden page or offline', () => {
  for (const o of [{ demo: true }, { ascuns: true }, { offline: true }]) { const w = lume(o); assert.equal(w.a.start(), false, JSON.stringify(o)); assert.equal(w.cadre.length, 0); }
});
test('the app’s own background scan is awaited instead of a second full scan; if it stops without a copy, the frame starts', () => {
  const w = lume({ shell: true });
  assert.equal(w.a.start(), true); assert.equal(w.cadre.length, 0); assert.equal(w.stari.at(-1).faza, 'astept');
  w.treci(2000); w.opresteShell(); w.tic(); assert.equal(w.cadre.length, 1, 'scanarea aplicației s-a oprit fără copie ⇒ cadrul propriu');
  const v = lume({ shell: true }); v.a.start(); v.treci(4000); v.salveaza(); v.tic(); assert.equal(v.stari.at(-1).faza, 'gata'); assert.equal(v.cadre.length, 0);
});
test('a scan that does not finish in 6 minutes ends with an error state and the frame is removed; retries alone only after 5 minutes', () => {
  const w = lume(); w.a.start(); w.treci(6 * 60000 + 1000); w.tic();
  assert.equal(w.stari.at(-1).faza, 'eroare'); assert.equal(w.cadre[0].removed, true);
  assert.equal(w.a.start(), false, 'fără buclă: nu reîncearcă singur imediat'); w.treci(5 * 60000 + 1000); assert.equal(w.a.start(), true, 'peste 5 minute reîncearcă'); assert.equal(lume().a.start(true), true);
});
test('the Planuri page loads the module before its script, starts it after the first load and retries on the 30-second refresh; the new layout CSS loads last', () => {
  const h = readFileSync('desk/index.html', 'utf8');
  assert.ok(h.indexOf('auto-scan.js?v=') > 0 && h.indexOf('auto-scan.js?v=') < h.indexOf('var CANDIDATE_FRESH_MS'));
  assert.match(h, /load\(\);loadBreadth\(\);incarcaVerdictPiata\(\).*?;startAutoScan\(\);/, 'I-727 (20.10.2026): verdictul pieței se citește la pornire, înaintea scanării'); assert.match(h, /render\(\);if\(autoScan\)autoScan\.start\(\);\},30000\)/);
  assert.match(h, /function startAutoScan\(\)\{if\(demoMode\|\|!window\.TTDeskAutoScan\)return;/, 'niciodată în demo');
  const css = [...h.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]); assert.match(css.at(-1), /^compact\.css\?v=/);
  assert.ok(h.indexOf('<section class="panel plan-queue">') < h.indexOf('<section class="panel breadth-ideas"'), 'Planuri & simulări înaintea ideilor Breadth');
});
