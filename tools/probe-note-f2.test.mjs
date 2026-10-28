// 28.10.2026 — revizia independentă F2, notele 🔵 reparate:
//  🔵10: pagina Verdicte arăta „Top Long ajută” fără „cu rezerve” (Planurile și Discord-ul spuneau rezerva; protocolul cere „în clar”).
//  🔵11: Planurile nu citeau `abatereJudecata` — o judecată scrisă care nu se mai potrivește cu perioadele înghețate (fișier atins) rămânea
//        „ajută” și ridica plafonul. Închis la eroare: cu abatere, plafonul rămâne 0,25 %.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function modulPlanuri() { const c = { console }; c.window = c; vm.createContext(c); vm.runInContext(readFileSync('lib/desk-proba.js', 'utf8'), c); return c.TTProbaTopLong; }
const principal = (o) => ({ orizonturi: [{ k: 5, principal: true, perioade: 30, necesare: 30, pozitive: 22, p: 0.008, ...o }] });

test('🔵11 Planuri: o judecată „ajută” care nu se mai potrivește cu perioadele înghețate NU ridică plafonul și spune de ce', () => {
  const P = modulPlanuri(), long = { mode: 'momentum' };
  P.set(principal({ verdict: 'ajuta' })); assert.equal(P.cap(0.5, long), 0.5, 'controlul: „ajută” curat ridică plafonul');
  P.set(principal({ verdict: 'ajuta', abatereJudecata: { verdict: 'fara-avantaj', p: 0.41 } }));
  assert.equal(P.cap(0.5, long), 0.25, 'cu abatere: plafonat'); assert.equal(P.state().dovedit, false);
  assert.match(P.tag(long), /nu se mai potrivește/); assert.match(P.state().text, /nu se mai potrivește/); assert.match(P.state().text, /0,25 %/);
});

function documentStub() {
  const nodes = new Map(), document = { activeElement: null, hidden: false, addEventListener() {} };
  const node = (id) => { if (!nodes.has(id)) nodes.set(id, { id, value: id === 'universeMode' ? 'shared' : id === 'primaryMode' ? 'all' : id === 'independentFilter' ? 'all' : '', hidden: false, disabled: false, textContent: '', className: '', innerHTML: '', dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, addEventListener() {}, setAttribute() {}, removeAttribute() {}, appendChild() {}, querySelector: () => null, querySelectorAll: () => [], closest: () => null, focus() {}, checked: false }); return nodes.get(id); };
  document.getElementById = node; document.querySelectorAll = () => []; document.querySelector = () => null; return { node, document };
}
async function paginaVerdicte(json) {
  const now = Date.parse('2026-10-28T10:00:00Z');
  const Clock = class extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } };
  const values = new Map(), dom = documentStub(), listeners = {};
  const fetch = async (u) => (String(u).startsWith('generated/premarket-proba.json') ? { ok: true, json: async () => json } : { ok: false, json: async () => null });
  const c = { localStorage: { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) }, console, Intl, Date: Clock, URLSearchParams, AbortController, setInterval() { return 0; }, clearInterval() {}, setTimeout: (f) => { f(); return 0; }, clearTimeout() {}, fetch, location: { origin: 'https://example.test', search: '', href: '' }, document: dom.document, addEventListener: (n, f) => (listeners[n] || (listeners[n] = [])).push(f) };
  c.window = c; c.parent = c; vm.createContext(c);
  for (const f of ['lib/exchange-calendar.js', 'lib/daily-series.js', 'lib/independent-scanner.js', 'lib/scanner-results.js', 'lib/shell-visibility.js', 'lib/proba-termen.js']) vm.runInContext(readFileSync(f, 'utf8'), c);
  vm.runInContext(readFileSync('scanner-verdicts/view.js', 'utf8'), c);
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  return dom.node('pmProbaBody').innerHTML;
}

test('🔵10 pagina Verdicte: „ajută” cu rezerve se vede „cu rezerve”, cu rezerva scrisă; o judecată care nu se mai potrivește se vede ca problemă', async () => {
  const baza = { ultimaRulare: '2026-10-28T09:00:00Z', inceput: '2026-10-28', ultimaZi: '2027-06-21', zile: 160, azi: { verificate: 85, total: 85, topLong: 9 } };
  const curat = await paginaVerdicte({ ...baza, ...principal({ verdict: 'ajuta' }) });
  assert.match(curat, /Top Long ajută/); assert.doesNotMatch(curat, /cu rezerve/);
  const rez = await paginaVerdicte({ ...baza, ...principal({ verdict: 'ajuta', rezerve: 'perioadele au persistență (ρ = 0,3): „ajută” cu rezerve' }) });
  assert.match(rez, /Top Long ajută · cu rezerve/); assert.match(rez, /persistență \(ρ = 0,3\)/); assert.match(rez, /badge warning/, 'nu verde');
  const ab = await paginaVerdicte({ ...baza, ...principal({ verdict: 'ajuta', abatereJudecata: { verdict: 'fara-avantaj', p: 0.41 } }) });
  assert.match(ab, /nu se mai potrivește/);
});

// ── 🔵7: puterea afișată ca bandă pe regim (abaterea fiecărui an din 2022–2026, măsurată de revizia F2), nu un singur număr ──
test('🔵7 puterea la +1 %/perioadă e afișată ca bandă pe ani (și pe 2026); banda e recalculabilă din abaterea scrisă pe fiecare an', async () => {
  const { contract, PROTOCOL: V1 } = await import('../lib/v1-proba.mjs');
  const { PROTOCOL: PM } = await import('../lib/premarket-proba.mjs');
  const { calendarSUA } = await import('../lib/proba-contract.mjs');
  const erf = (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
  const Phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2)), C = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
  const ge = (n, p, c) => { let s = 0; for (let k = c; k <= n; k++) s += C(n, k) * p ** k * (1 - p) ** (n - k); return s; };
  const cal = calendarSUA('.'), o = { k: 5, necesare: 30, starturi: [], judecata: { la: 30, data: null, verdict: null, unic: true } };
  for (const [nume, P, min, max, an] of [['V1', V1, '40,6', '73,7', '40,6'], ['Top Long', PM, '37,5', '72,5', '49,4']]) {
    const b = P.putere.banda[5]; assert.equal(b.pct, 1);
    const put = Object.fromEntries(Object.entries(b.sigmaPeAn).map(([y, s]) => [y, ge(30, Phi(b.pct / 100 / s), 20)]));
    assert.ok(Math.abs(Math.min(...Object.values(put)) - b.min) < 0.001 && Math.abs(Math.max(...Object.values(put)) - b.max) < 0.001, nume + ': banda = puterea pe abaterea fiecărui an');
    assert.ok(Math.abs(put[String(b.an)] - b.laAn) < 0.001, nume + ': puterea pe ' + b.an);
    const t = contract(o, { cal, azi: '2026-10-28', putere: P.putere }).putere.text;
    assert.ok(t.includes('între ' + min + ' % și ' + max + ' %'), nume + ': ' + t); assert.ok(t.includes('pe ' + b.an + ', ' + an + ' %'), nume + ': ' + t);
  }
});

// ── revizia F3, 🔵11: banda puterii era doar în fișier; panoul (lib/proba-termen.js, folosit de Verdicte și Planuri) arăta tot „55 %” ──
test('🔵11 F3 panoul probei arată banda puterii (o zecimală, cu anul de acum), nu un singur număr; fără bandă, textul vechi', () => {
  const c = { console }; c.window = c; vm.createContext(c); vm.runInContext(readFileSync('lib/proba-termen.js', 'utf8'), c);
  const j = (putere) => ({ orizonturi: [{ k: 5, principal: true, perioade: 3, necesare: 30 }], inceput: '2026-10-28', putere, primulVerdict: { optimist: '2027-06-21', realist: '2027-06-21' } });
  const cu = c.TTProbaTermen.linie(j({ laPlus: [{ pct: 0.5, putere: 0.22 }, { pct: 1, putere: 0.549 }], banda: { pct: 1, min: 0.406, max: 0.737, an: 2026, laAn: 0.406 } }));
  assert.match(cu, /40,6–73,7 % din cazuri/); assert.match(cu, /pe 2026: 40,6 %/); assert.doesNotMatch(cu, /55 %/);
  const fara = c.TTProbaTermen.linie(j({ laPlus: [{ pct: 0.5, putere: 0.22 }, { pct: 1, putere: 0.549 }] }));
  assert.match(fara, /doar în 55 % din cazuri/, 'fără bandă: textul de dinainte');
});
