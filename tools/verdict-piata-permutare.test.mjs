// 27.10.2026 — revizia independentă a lotului F (🔴4): testul Welch al verdictului pieței trata zilele separate ca independente; cu SPY cu
// volatilitate în ciorchini (GARCH, cum e în realitate) și etichete persistente, „ajută” fals urca la 5,7–7,7 % (revizia, 4000 de lumi).
// Acum: test de permutare pe EPISOADE de etichetă (blocurile de zile separate consecutive cu aceeași etichetă rămân întregi; se permută care
// episoade sunt „redus”), cu mărimea simulată sub H0 cu GARCH ÎNAINTE de prima zi „redus” măsurată (scrisă în docs/verdict-piata-protocol.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { proba, permutareEpisoade, lumeVerdict, PROBA, PUTERE, rataAjuta, REGULA } from './verdict-piata-robot.mjs';
import { mulberry32, gauss } from '../lib/proba-contract.mjs';

const zi = (i) => Date.UTC(2026, 0, 5) + i * 86400000, dateOf = (t) => new Date(t).toISOString().slice(0, 10);
const rand = (grup, dd) => ({ grup, dd });

/** Oracolul independent: t-ul Welch calculat direct pe zile, pentru o atribuire a episoadelor. */
function tWelch(A, B) { const m = (x) => x.reduce((s, v) => s + v, 0) / x.length, v = (x, mu) => (x.length > 1 ? x.reduce((s, y) => s + (y - mu) ** 2, 0) / (x.length - 1) : 0); const ma = m(A), mb = m(B), se = Math.sqrt(v(A, ma) / A.length + v(B, mb) / B.length); return (ma - mb) / se; }
test('permutarea pe episoade, exactă pe un caz mic: episoadele rămân întregi, statistica e t-ul Welch, p = partea aranjamentelor cel puțin la fel de extreme', () => {
  // episoade: R(−3, −2,5) · N(−1) · R(−2) · N(0, −0,5) ⇒ 4 episoade, 2 „redus”: C(4, 2) = 6 aranjamente ale episoadelor
  const rows = [rand('redus', -3), rand('redus', -2.5), rand('normal', -1), rand('redus', -2), rand('normal', 0), rand('normal', -0.5)];
  const t = permutareEpisoade(rows); assert.equal(t.exact, true); assert.equal(t.aranjamente, 6); assert.deepEqual(t.episoade, { redus: 2, normal: 2 });
  const ep = [[-3, -2.5], [-1], [-2], [0, -0.5]], perechi = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
  const ts = perechi.map(([a, b]) => tWelch(ep[a].concat(ep[b]), ep.filter((_, i) => i !== a && i !== b).flat())), obs = tWelch([-3, -2.5, -2], [-1, 0, -0.5]);
  assert.ok(Math.abs(t.statistica - obs) < 1e-9, 'statistica = t-ul Welch observat'); assert.ok(Math.abs(t.p - ts.filter((x) => x <= obs + 1e-9).length / 6) < 1e-12, 'p = ' + t.p);
  assert.ok(t.p < 0.5, 'atribuirea observată e printre cele mai extreme');
  assert.equal(permutareEpisoade([rand('redus', -1), rand('redus', -2)]), null, 'un singur grup ⇒ nu se poate testa');
});
test('peste PERMUTARI de aranjamente: Monte Carlo mulberry32 cu sămânță fixă, p = (1 + #) / (1 + B), reproductibil', () => {
  const r = mulberry32(5), rows = []; let g = 'redus'; for (let i = 0; i < 60; i++) { if (r() < 0.4) g = g === 'redus' ? 'normal' : 'redus'; rows.push(rand(g, -2 * r())); }
  const a = permutareEpisoade(rows), b = permutareEpisoade(rows); assert.equal(a.exact, false); assert.equal(a.p, b.p); assert.ok(a.p > 0 && a.p <= 1);
  assert.equal(Math.round(a.p * (1 + PROBA.permutari)) >= 1, true);
});
// 28.10.2026 (revizia F2, 🟡2): judecătorul e acum ROTAȚIA (tools/verdict-piata-f2.test.mjs); permutarea pe episoade rămâne funcție de
// comparație (testele ei de mai sus) — la etichete persistente rămâneau prea puține episoade și testul devenea orb.
test('proba judecă prin rotație: nici Welch, nici permutarea pe episoade nu mai decid judecata', () => {
  const corp = readFileSync('tools/verdict-piata-robot.mjs', 'utf8').split('export function proba(')[1].split('export function amprentaJudecator')[0];
  assert.ok(!/welch\(A, B\)/.test(corp.replace(/ajutaOricand[\s\S]*?;/g, '')), 'judecata nu cheamă Welch');
  assert.ok(!/permutareEpisoade\(/.test(corp), 'judecata nu mai cheamă permutarea pe episoade'); assert.match(corp, /rotatie\(fix\)/);
  assert.equal(PROBA.test, 'rotatie'); assert.equal(typeof PROBA.permutari, 'number');
});
/** SPY cu volatilitate în ciorchini: GARCH(1,1) α 0,10, β 0,88 (persistență 0,98), inovații t5 — lumea revizorului; etichete persistente,
 *  independente de viitor (H0). Aceeași funcție `proba` ca robotul. */
function lumeGarch(seed, { zile = 1500, pRedus, sta }) {
  const R = mulberry32(seed), g = gauss(R), t5 = () => { let s = 0; for (let i = 0; i < 5; i++) { const z = g(); s += z * z; } return (g() / Math.sqrt(s / 5)) * Math.sqrt(3 / 5); };
  const a = 0.1, b = 0.88, w = 1e-4 * (1 - a - b); let s2 = 1e-4, p = 100; const spy = [];
  for (let i = 0; i < zile + 6; i++) { const r = Math.sqrt(s2) * t5(); p *= 1 + r; s2 = w + a * r * r + b * s2; spy.push({ t: zi(i), c: p }); }
  const linii = []; let red = R() < pRedus; for (let i = 0; i < zile; i++) { if (i && R() > sta) red = R() < pRedus; linii.push({ asOf: dateOf(spy[i].t), generat: 'x', regula: REGULA, label: red ? 'prudent' : 'neutru' }); }
  return { spy, linii };
}
test('MĂRIMEA sub H0 cu volatilitate în ciorchini (GARCH, cozi t5) și etichete persistente: permutarea pe episoade rămâne ≤ 5 % în cazul cel mai rău al reviziei', () => {
  // sta 0,95, 50 % zile „redus”: Welch dădea 7,7 % (revizia); 800 de lumi aici (cifrele complete, 4000 de lumi, sunt în protocol)
  let aj = 0, gata = 0; for (let w = 0; w < 800; w++) { const { spy, linii } = lumeGarch(31000 + w, { pRedus: 0.5, sta: 0.95 }); const r = proba(linii, spy, dateOf, null); if (r.judecata.verdict) gata++; if (r.verdict === 'ajuta') aj++; }
  assert.ok(gata >= 780, 'aproape toate lumile ajung la judecată: ' + gata); assert.ok(aj / gata <= 0.05, '„ajută” fals: ' + (100 * aj / gata).toFixed(1) + ' %');
});
test('mărimea și puterea scrise (PUTERE) sunt cele pe care le dă judecătorul de acum (2000 de lumi, sămânța fixă), iar protocolul are tabelul GARCH', () => {
  assert.equal(Math.round(1000 * rataAjuta({ lumi: 2000, efect: 0 })) / 1000, PUTERE.marime);
  assert.equal(Math.round(1000 * rataAjuta({ lumi: 2000, efect: 1 })) / 1000, PUTERE.laPlus[1].putere);
  const doc = readFileSync('docs/verdict-piata-protocol.md', 'utf8'); assert.match(doc, /permutare pe episoade/); assert.match(doc, /GARCH/);
  assert.ok(lumeVerdict(1).spy.length > 0);
});
