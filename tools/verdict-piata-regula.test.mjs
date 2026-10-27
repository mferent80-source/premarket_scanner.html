// 20.10.2026 (I-727): verdictul pieței are O SINGURĂ regulă în toată aplicația (MarketVerdict.regula, docs/setup-filtru-piata.md v2.1):
// Drafturi (lib/setup-builder.js) și Planuri (desk/index.html) o aplică la fel — prudent ×0,75, defensiv fără GO / fără plan nou,
// lipsă sau mai vechi de 4 zile ⇒ „neverificat” ×0,75 fără GO. Testul ține cele două locuri lipite de aceeași regulă.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function MV() {
  const ctx = { console, Date, Intl, Math, JSON };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(readFileSync('lib/market-verdict.js', 'utf8'), ctx);
  return ctx.MarketVerdict;
}
const NOW = Date.parse('2026-10-20T10:00:00Z'), fisier = (label, asOf = '2026-10-19', score = 0) => ({ version: 'verdict-piata-v1', label, asOf, score });

test('regula: favorabil / neutru ×1 cu GO, prudent ×0,75 cu GO, defensiv ×0,5 fără GO (nota spune „fără plan nou”)', () => {
  const M = MV();
  for (const [label, mult, go] of [['favorabil', 1, true], ['neutru', 1, true], ['prudent', 0.75, true], ['defensiv', 0.5, false]]) {
    const r = M.regula(fisier(label, '2026-10-19', -1), NOW);
    assert.equal(r.label, label); assert.equal(r.mult, mult); assert.equal(r.go, go); assert.equal(r.asOf, '2026-10-19'); assert.equal(r.score, -1); assert.equal(r.vechi, false);
  }
  assert.match(M.regula(fisier('defensiv'), NOW).nota, /DEFENSIV .*fără plan nou/); assert.match(M.regula(fisier('prudent'), NOW).nota, /PRUDENT .*×0,75/);
  assert.equal(M.regula(fisier('favorabil'), NOW).nota, null);
});

test('regula: fișier lipsă, etichetă necunoscută sau mai vechi de 4 zile ⇒ neverificat ×0,75 fără GO, cu motivul', () => {
  const M = MV();
  for (const j of [null, undefined, {}, fisier('necunoscut'), fisier('prudent', '2026-10-15'), fisier('favorabil', 'ieri')]) {
    const r = M.regula(j, NOW); assert.equal(r.label, 'neverificat'); assert.equal(r.mult, 0.75); assert.equal(r.go, false); assert.ok(r.nota && /neverificat/.test(r.nota));
  }
  assert.equal(M.regula(fisier('prudent', '2026-10-15'), NOW).vechi, true); assert.match(M.regula(fisier('prudent', '2026-10-15'), NOW).motiv, /mai vechi de 4 zile/);
  assert.equal(M.regula(fisier('prudent', '2026-10-16'), NOW).label, 'prudent', 'exact 4 zile (de la închiderea sesiunii) mai e valabil');
  assert.equal(M.ZILE_VALABIL, 4);
});

test('Drafturi (setup-builder) folosește același tabel și aceeași vechime de 4 zile ca MarketVerdict.regula', () => {
  const M = MV(), src = readFileSync('lib/setup-builder.js', 'utf8');
  const m = /const VERDICT_TABLE = (\{[^\n]+\});/.exec(src); assert.ok(m, 'tabelul din Drafturi există');
  const tabel = vm.runInNewContext('(' + m[1] + ')');
  assert.deepEqual(JSON.parse(JSON.stringify(tabel)), { favorabil: { mult: 1, go: true }, neutru: { mult: 1, go: true }, prudent: { mult: 0.75, go: true }, defensiv: { mult: 0.5, go: false } });
  assert.deepEqual(JSON.parse(JSON.stringify(tabel)), JSON.parse(JSON.stringify(M.REGULA)));
  assert.match(src, /T21:00:00Z'\)\) \/ 86400000 <= 4;/, 'vechimea de 4 zile, de la închiderea sesiunii');
  assert.match(src, /if \(score == null\) return 0\.75;/, 'neverificat ⇒ ×0,75');
});

test('Planuri (desk) aplică regula: allowedRisk × mult, defensiv ⇒ 0 și blocaj în garziComune, nota în tichet; nu mai e „informativ”', () => {
  const html = readFileSync('desk/index.html', 'utf8');
  assert.match(html, /function allowedRisk\(x\)\{[^\n]*var mr=regulaPiata\(\);if\(mr&&mr\.label==='defensiv'\)return 0;[^\n]*mr&&mr\.mult<1\?Math\.round\(baza\*mr\.mult\*10000\)\/10000:baza;\}/);
  assert.match(html, /function garziComune\([^\n]*var mr=regulaPiata\(\);if\(mr&&mr\.label==='defensiv'\)return\{ok:false,message:'Verdictul pieței e DEFENSIV/);
  assert.match(html, /function ticketNote\([^\n]*var mr=regulaPiata\(\);if\(mr&&mr\.nota\)out\+=' · '\+mr\.nota;return out;\}/);
  assert.match(html, /incarcaVerdictPiata\(\)\.then\(/, 'fișierul robotului se citește la pornire');
  assert.doesNotMatch(html, /Guardrail nu blochează|Informativ: mărimea de mai sus/);
});

test('🔵 21: cu MarketVerdict încărcat, Drafturile citesc tabelul de la el (o singură sursă la rulare); copia rămâne doar rezervă', () => {
  const c = { Date, console, localStorage: { getItem: () => null }, MarketVerdict: { REGULA: { prudent: { mult: 0.6, go: false } } } };
  vm.createContext(c); vm.runInContext(readFileSync('lib/setup-builder.js', 'utf8'), c);
  c.SB.setVerdict({ label: 'prudent', score: -1, asOf: new Date().toISOString().slice(0, 10) });
  const d = c.SB.readDanger();
  assert.deepEqual([d.mult, d.go], [0.6, false], 'tabelul vine din MarketVerdict.REGULA, nu din copia locală');
});
