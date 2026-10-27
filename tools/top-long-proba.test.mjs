// 19.10.2026 — I-709 (prudență, nu avantaj dovedit): Top Long are 0 din 8 perioade în proba în timp, dar primea FIRE verde și
// „PLAN VALIDABIL” cu riscul obișnuit de 0,5 %, în timp ce Trend 12 luni (t ≈ 1,5) e blocat. Acum: eticheta „în probă · N/8” lângă
// stare (citită din fișierul probei), riscul unui plan Top Long plafonat la 0,25 % până la verdict, scannerul scrie că e în probă.
// Regulile de clasament NU se schimbă: amprenta motorului rămâne cea din jurnalul probei.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { boot, flush } from './desk-boot.mjs';
import { versiune, PROTOCOL } from '../lib/premarket-proba.mjs';
import { motor } from './premarket-jurnal.mjs';

const PROBA = JSON.parse(readFileSync('scanner-verdicts/generated/premarket-proba.json', 'utf8'));
// 27.10.2026 (premarket-proba-2): perioadele cerute vin din fișierul probei (16 / 60 în v2, 8 în v1), nu se mai fixează aici — testul
// rulează în fluxul robotului ÎNAINTE de robot; un „0/8” fix l-ar fi oprit a doua zi după prima rulare v2.
const P0 = PROBA.orizonturi.find((o) => o.principal), NN = P0.perioade + '/' + P0.necesare, DIN = P0.perioade + ' din ' + P0.necesare;
function modul() { const c = { console }; c.window = c; vm.createContext(c); vm.runInContext(readFileSync('lib/desk-proba.js', 'utf8'), c); return c.TTProbaTopLong; }
const ajuta = (j) => ({ ...j, orizonturi: j.orizonturi.map((o) => (o.principal ? { ...o, perioade: 9, verdict: 'ajuta' } : o)) });

test('I-709: eticheta și plafonul vin din fișierul probei; fără fișier plafonul rămâne (închis la eroare); Early Reversal neatins', () => {
  const P = modul(), long = { mode: 'momentum' }, rev = { mode: 'reversal' };
  assert.equal(P.cap(0.5, long), 0.25, 'fără fișier citit: plafonat');
  P.set(PROBA);
  assert.equal(P.tag(long), 'în probă · ' + NN); assert.equal(P.cap(0.5, long), 0.25); assert.equal(P.cap(0.25, long), 0.25);
  assert.equal(P.cap(0.5, rev), 0.5); assert.equal(P.tag(rev), '');
  assert.match(P.state().text, new RegExp(DIN + ' perioade'));
  P.set(ajuta(PROBA)); assert.equal(P.cap(0.5, long), 0.5); assert.equal(P.tag(long), '');
  P.set({ orizonturi: [{ k: 20, principal: true, perioade: 8, necesare: 8, verdict: 'fara-avantaj' }] }); assert.equal(P.cap(0.5, long), 0.25); assert.match(P.tag(long), /fără avantaj/);
  P.set(null); assert.equal(P.cap(0.5, long), 0.25); assert.match(P.tag(long), /în probă/);
});

// demo cu Governor TRADE (demo-ul brokerului e CAUTION ⇒ riscul de bază ar fi deja 0,25 % și plafonul n-ar avea ce arăta)
function deskCuProba(json = PROBA) { return boot({ files: ['lib/desk-proba.js'], before: (c) => { c.TTProbaTopLong.set(json); const d = c.T212Capital.demo; c.T212Capital.demo = (...a) => ({ ...d(...a), verdict: 'TRADE', reasons: [] }); } }); }
test('I-709 Planuri: un plan Top Long are riscul plafonat la 0,25 % și tichetul spune că e în probă; Early Reversal păstrează 0,5 %', async () => {
  const b = deskCuProba(); await flush();
  b.rows().find((r) => r.dataset.symbol === 'FICTIV-A').onclick(); b.nodes.focusAction.onclick();
  assert.equal(b.nodes.ticketRiskPct.value, '0,25%');
  assert.match(b.nodes.ticketVerdict.textContent, /PLAN VALIDABIL/); assert.ok(b.nodes.ticketVerdict.textContent.includes('în probă · ' + NN)); assert.match(b.nodes.ticketVerdict.textContent, /0,25 %/);
  assert.ok(b.nodes.signalRows.innerHTML.includes('class="proba-tag">în probă · ' + NN + '<'));
  assert.equal(b.nodes.guardRisk.textContent, '0,25%');
  b.modes[1].onclick(); b.nodes.focusAction.onclick();
  assert.equal(b.nodes.ticketRiskPct.value, '0,50%'); assert.doesNotMatch(b.nodes.ticketVerdict.textContent, /în probă/);
});
test('I-709 Planuri: după verdictul „Top Long ajută” plafonul se ridică singur', async () => {
  const b = deskCuProba(ajuta(PROBA)); await flush();
  b.rows().find((r) => r.dataset.symbol === 'FICTIV-A').onclick(); b.nodes.focusAction.onclick();
  assert.equal(b.nodes.ticketRiskPct.value, '0,50%'); assert.doesNotMatch(b.nodes.signalRows.innerHTML, /în probă/);
});
// 20.10.2026 (I-727): verdictul pieței nu mai e informativ în Planuri — aceeași regulă ca în Drafturi (MarketVerdict.regula): defensiv ⇒ fără plan nou (blocaj cu motivul), prudent ⇒ risc ×0,75 cu nota în tichet.
test('I-727 Planuri: verdictul pieței „defensiv” BLOCHEAZĂ planul nou cu motivul; „prudent” lasă planul cu risc ×0,75 și nota în tichet', async () => {
  const regula = (label) => ({ label, mult: label === 'defensiv' ? 0.5 : 0.75, go: label !== 'defensiv', asOf: '2026-10-07', score: -2, vechi: false, motiv: null, nota: label === 'defensiv' ? 'Verdictul pieței DEFENSIV (după sesiunea 07.10): fără plan nou — regula din Drafturi.' : 'Verdictul pieței PRUDENT (după sesiunea 07.10): risc ×0,75 — regula din Drafturi.' });
  const cuVerdict = (label) => boot({ files: ['lib/desk-proba.js'], extra: { MarketVerdict: { regula: () => regula(label), robotFile: async () => ({ version: 'verdict-piata-v1', label, asOf: '2026-10-07', score: -2 }) } }, before: (c) => { c.TTProbaTopLong.set(PROBA); const d = c.T212Capital.demo; c.T212Capital.demo = (...a) => ({ ...d(...a), verdict: 'TRADE', reasons: [] }); } });
  const b = cuVerdict('defensiv'); await flush();
  b.modes[1].onclick(); b.nodes.focusAction.onclick(); b.nodes.ticketCapital.oninput.call(b.nodes.ticketCapital);
  assert.match(b.nodes.ticketVerdict.textContent, /Verdictul pieței e DEFENSIV/); assert.match(b.nodes.ticketVerdict.textContent, /fără plan nou/); assert.doesNotMatch(b.nodes.ticketVerdict.textContent, /PLAN VALIDABIL/);
  const p = cuVerdict('prudent'); await flush();
  p.modes[1].onclick(); p.nodes.focusAction.onclick(); p.nodes.ticketCapital.oninput.call(p.nodes.ticketCapital);
  assert.match(p.nodes.ticketVerdict.textContent, /PLAN VALIDABIL/); assert.match(p.nodes.ticketVerdict.textContent, /PRUDENT .*risc ×0,75/);
  const h = readFileSync('desk/index.html', 'utf8'); assert.match(h, /\.ticket-risk\[data-verdict="defensiv"\]\{/);
});

// Scannerul (candidate-engine): eticheta lângă FIRE și nota „Top Long e în probă”.
function scanner() {
  const nodes = {}, node = (id) => nodes[id] || (nodes[id] = { value: '', checked: false, innerHTML: '', textContent: '', disabled: false, hidden: false, dataset: {}, style: {}, classList: { toggle() {}, add() {}, remove() {} }, scrollIntoView() {} });
  const ctx = { Date, Intl, console, URLSearchParams, location: { search: '', origin: 'https://example.test' }, document: { getElementById: node, querySelectorAll: () => [], addEventListener() {}, hidden: false }, localStorage: { getItem: () => null, setItem() {} }, setTimeout: () => 0, clearTimeout() {}, addEventListener() {},
    D: { fetchStock: async () => { throw Error('fără rețea'); } }, MEB: { computeEarlyBird: () => ({}) }, WL: { get: () => [] }, GV: { status: () => ({ verdict: 'TRADE', reasons: [] }) }, TTDecisionPanel: { set() {} }, EL: { sectorOf: () => 'Technology' }, matchMedia: () => ({ matches: false }) };
  ctx.window = ctx; ctx.parent = ctx; vm.createContext(ctx);
  for (const f of ['lib/indicators.js', 'lib/daily-series.js', 'lib/decision-verdict.js', 'lib/candidate-plan-handoff.js', 'lib/desk-proba.js']) vm.runInContext(readFileSync(f, 'utf8'), ctx);
  const src = readFileSync('candidate-engine/engine.js', 'utf8'); vm.runInContext(src.slice(0, src.lastIndexOf('  validateDeps(); bind();')) + 'bind();window.hooks={state,render};})();', ctx);
  return { ctx, node };
}
const fire = { symbol: 'NVDA', region: 'US', sector: 'Technology', mode: 'momentum', state: 'FIRE', score: 88, dayChg: 2, rvol: 1.6, rs: 3, metricA: 9, metricB: 2, reason: 'test', fapte: [], entryLow: 100, entryHigh: 101, stop: 95, target: 112, ts: Date.now(), eligible: true, actionable: true };
test('I-709 scanner: lângă FIRE scrie „în probă · 0/8”, iar pagina spune că Top Long e în probă (doar în Top Long)', () => {
  const s = scanner(); s.ctx.TTProbaTopLong.set(PROBA); s.ctx.hooks.state.momentum = [fire]; s.ctx.hooks.state.reversal = [{ ...fire, symbol: 'AMD', mode: 'reversal' }]; s.ctx.hooks.render();
  assert.ok(s.node('rows').innerHTML.includes('FIRE<small class="ce-proba-tag">în probă · ' + NN + '</small>'));
  assert.equal(s.node('probaNota').hidden, false); assert.ok(s.node('probaNota').textContent.includes('Top Long e în proba în timp: ' + DIN));
  s.ctx.hooks.state.mode = 'reversal'; s.ctx.hooks.render();
  assert.doesNotMatch(s.node('rows').innerHTML, /în probă/); assert.equal(s.node('probaNota').hidden, true);
  const h = readFileSync('candidate-engine/index.html', 'utf8'); assert.match(h, /id="probaNota"/); assert.ok(h.indexOf('desk-proba.js?v=') > 0 && h.indexOf('desk-proba.js?v=') < h.indexOf('engine.js?v='));
});
test('I-709: amprenta regulilor Top Long rămâne cea din jurnalul probei (clasamentul nu s-a schimbat)', () => {
  // 27.10.2026: până la prima rulare v2 fișierul e încă al probei premarket-proba-1 (amprenta veche, păstrată în protocol ca precedent);
  // după ea, amprenta motorului de azi trebuie să fie cea din fișier — altfel regulile s-au schimbat fără protocol nou
  if (PROBA.protocol === PROTOCOL.precedent.id) { assert.equal(PROBA.versiune, PROTOCOL.precedent.versiune); return; }
  assert.equal(PROBA.protocol, PROTOCOL.id);
  assert.equal(versiune(motor(async () => { throw Error('fără rețea'); }).hooks), PROBA.versiune);
});
