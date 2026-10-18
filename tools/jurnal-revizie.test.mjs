// 18.10.2026 (el: „citește toată aplicația și spune-mi unde nu am lucrat” → „toate”): revizia celor 4 file ale Jurnalului
// (Risc & capital, Mișcări de capital, Drafturi, Portofoliu · risc). Ce se vede pe pagina publicată nu are voie să spună mai mult
// decât știe: un Governor NEVERIFICAT nu e „permisiune verificată”, lipsa datelor macro nu e „nicio restricție”, iar o sumă
// implicită (10.000) nu e valoarea contului.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function panou({ hash = '#desk', verdict = 'NEVERIFICAT', reasons = ['Jurnalul manual e gol și Trading 212 nu e conectat — limitele nu pot fi verificate'] } = {}) {
  const host = { dataset: {}, setAttribute() {}, querySelector() { return { value: '', hidden: false }; }, innerHTML: '' };
  const c = { Date, Intl, AbortController, console, location: { origin: 'https://app.test', hash },
    document: { currentScript: { dataset: { decisionModule: 'journal' } }, readyState: 'complete', hidden: false, createElement: () => host, getElementById: () => null, querySelector: () => ({ prepend() {} }) },
    AI: { hasKey: () => false, DEFAULT_MODEL: 'x', complete: () => new Promise(() => {}) }, localStorage: { getItem: () => null, setItem() {} },
    setInterval() {}, addEventListener() {}, GV: { status: () => (verdict ? { verdict, reasons } : null) } };
  c.window = c; c.parent = c; vm.createContext(c);
  for (const f of ['lib/daily-series.js', 'lib/decision-verdict.js', 'lib/decision-insights.js', 'lib/decision-panel.js']) vm.runInContext(readFileSync(f, 'utf8'), c);
  c.TTDecisionPanel.refresh();
  return { r: c.TTDecisionPanel.report(), html: host.innerHTML };
}

test('Risc & capital: an UNVERIFIED Governor is never titled “risk permission verified” — it asks for verification and says why', () => {
  const { r, html } = panou();
  assert.notEqual(r.title, 'Permisiunea de risc verificată'); assert.equal(r.code, 'VERIFY');
  assert.match(html, /Jurnalul manual e gol și Trading 212 nu e conectat/);
  for (const v of ['TRADE', 'CAUTION']) assert.notEqual(panou({ verdict: v }).r.code, 'VERIFY', v + ' rămâne verificat');
  assert.equal(panou({ verdict: 'HALTED', reasons: ['Limita zilnică atinsă'] }).r.code, 'BLOCKED');
  assert.equal(panou({ verdict: null }).r.code, 'VERIFY');
});

// Drafturi (constructorul de setup): pagina Macro e retrasă din 12.10, deci Danger Score nu mai vine. Înainte: lipsa lui devenea 35/100
// inventat — bifa „Danger sub prag” trecea, dimensionarea folosea cifra inventată și verdictul putea ieși GO.
function sb(mctx) { const c = { Date, console, localStorage: { getItem: () => null } }; if (mctx) c.MCTX = mctx; vm.createContext(c); vm.runInContext(readFileSync('lib/setup-builder.js', 'utf8'), c); return c.SB; }
test('Setup: a missing or stale Danger Score is “unverified” — never 35 — and a GO verdict needs a known Danger', () => {
  assert.equal(sb().readDanger().score, null, 'fără sursa macro: necunoscut, nu 35');
  assert.equal(sb({ danger: () => ({ score: 30, stale: true, dateET: '2026-10-10' }) }).readDanger().score, null, 'un scor vechi nu e folosit');
  assert.equal(sb({ danger: () => ({ score: 30, stale: false, mult: '1x' }) }).readDanger().score, 30, 'un scor de azi rămâne');
  const S = sb();
  assert.notEqual(S.computeVerdict(2.5, false, 6, 6, null, null, null).verdict, 'GO', 'fără Danger cunoscut nu e GO');
  assert.equal(S.computeVerdict(2.5, false, 6, 6, 30, null, null).verdict, 'GO');
  assert.equal(S.dangerSizeMult(null), 0.75, 'dimensionarea rămâne prudentă (0,75×), cum era');
});
test('Setup: a missing or stale macro regime does not pass the “regime not against LONG” check by itself', () => {
  assert.equal(sb().readRegime().unknown, true);
  assert.equal(sb({ regime: () => ({ label: 'RISK-ON', composite: 2, stale: true }) }).readRegime().unknown, true);
  assert.equal(sb({ regime: () => ({ label: 'RISK-ON', composite: 2, stale: false }) }).readRegime().unknown, false);
});

// Risc & capital → Macro context: sursa (pagina Macro) e retrasă din 12.10; panoul spunea „Nicio restricție macro acționabilă azi”
// pe date lipsă și trimitea la pagina retrasă. Acum: spune că lipsesc și arată verdictul pieței de azi (robotul zilnic).
function rail(mctx) {
  const host = { innerHTML: '', querySelector: () => null };
  const c = { console, Date, JSON, document: { getElementById: (id) => (id === 'deskMacroRail' ? host : null) }, MCTX: mctx };
  c.window = c; vm.createContext(c); vm.runInContext(readFileSync('lib/desk-macro-rail.js', 'utf8'), c); c.DMR.render(); return { c, host };
}
const mctxGol = { regime: () => ({ label: null, stale: true }), danger: () => ({ score: null, stale: true }), marketTone: () => null, actionLine: () => ({ phrases: [] }), eventsUpcoming: () => [], regimeColor: () => '#999', regimeEmoji: () => '⚪' };
test('Macro context: missing regime / Danger is never “no restriction”, and it no longer links to the retired Macro page', () => {
  const { host } = rail(mctxGol);
  assert.doesNotMatch(host.innerHTML, /Nicio restricție macro/); assert.match(host.innerHTML, /NU înseamnă „nicio restricție”/);
  assert.doesNotMatch(host.innerHTML, /macro-dashboard/); assert.match(host.innerHTML, /data-dmr-verdict-slot/);
});
test('Macro context shows today’s market verdict from the daily robot, marks an old one and says so when it cannot be read', () => {
  const { c } = rail(mctxGol), acum = Date.parse('2026-10-19T08:00:00Z');
  const v = c.DMR.verdictHtml({ asOf: '2026-10-16', label: 'defensiv', score: -3, fraza: 'VIX a sărit cu 21% într-o zi și creditul slăbește.' }, acum);
  assert.match(v, /Verdictul pieței: DEFENSIV \(−3\) · EOD 16\.10\.2026/); assert.match(v, /VIX a sărit/); assert.doesNotMatch(v, /VECHI/); assert.match(v, /Governor decide/);
  assert.match(c.DMR.verdictHtml({ asOf: '2026-10-09', label: 'neutru', score: 0 }, acum), /VECHI/);
  assert.match(c.DMR.verdictHtml(null, acum), /nu s-a putut citi/);
});

// Mișcări de capital / Drafturi / Portofoliu · risc: 10.000 era afișat ca „Simulat / Estimat” și precompletat ca „Cont $” fără niciun cont.
test('the 10,000 starting value is not the account: ACCT.known() is false until a real source exists, and no field ships with 10000', () => {
  const store = new Map(), c = { console, JSON, Date, localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
  c.window = c; vm.createContext(c); vm.runInContext(readFileSync('lib/account.js', 'utf8'), c);
  assert.equal(c.ACCT.get().source, 'default'); assert.equal(c.ACCT.known(), false);
  store.set('tt_account_size_v1', '12670'); assert.equal(c.ACCT.known(), true); assert.equal(c.ACCT.get().value, 12670);
  const h = readFileSync('journal/index.html', 'utf8'); assert.doesNotMatch(h, /id="setupAccount"[^>]*value="10000"/);
  assert.match(readFileSync('lib/journal-workspace.js', 'utf8'), /Nu afișăm o sumă inventată/); assert.match(readFileSync('lib/portfolio-risk.js', 'utf8'), /g\.source === 'default' \? ''/);
});
