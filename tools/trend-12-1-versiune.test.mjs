// 28.10.2026 — revizia independentă F2, 🟡3 (Trend 12 luni): regula de clasament (`clasament`, `curataUnivers`, `regim`,
// `taieBaraPartiala`, `liniaIstoric`) nu avea amprentă, iar liniile istoricului nu purtau versiunea ⇒ o regulă schimbată ar fi intrat
// tăcut în aceeași probă. Acum fiecare linie nouă poartă amprenta clasamentului (`v`), iar bilanțul judecă doar liniile versiunii de acum.
// Liniile vechi, fără `v`: reconstruit din git — amprenta e `tc-86d0c9bbf68a` de la a3bd8443 (15.10.2026, 04:08 UTC) până azi, deci
// liniile cu ziua ≥ 15.10 sunt ale ei; 13.10 și 14.10 au fost scrise sub regula de dinainte (`tc-b7a4179a6e14`) și ies din probă.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { amprentaClasamentTrend, versiuneLinie, liniiInProba, LINII_FARA_V, RADACINI_CLASAMENT, TC_ECHIVALENTE } from './trend-12-1-lib.mjs';

const citeste = (f) => readFileSync(f, 'utf8');
const cu = (fisier, vechi, nou) => (f) => { const s = citeste(f); if (f !== fisier) return s; assert.ok(s.includes(vechi), fisier + ' nu mai conține ' + vechi); return s.replace(vechi, nou); };

test('🟡3 Trend: amprenta clasamentului se schimbă cu regula de clasament și cu pragurile robotului; afișajul nu contează', () => {
  const v = amprentaClasamentTrend();
  assert.match(v, /^tc-[0-9a-f]{12}$/);
  // revizia F3, 🔵8: filtrul barelor și intervalul mutate din robot în bibliotecă (neschimbate) ⇒ amprenta nouă, echivalentă cu cea reconstruită din git
  assert.equal(TC_ECHIVALENTE[0], 'tc-86d0c9bbf68a', 'reconstruit din git: neschimbată de la 15.10.2026 04:08 UTC'); assert.equal(TC_ECHIVALENTE.at(-1), v, 'amprenta de acum e ultima echivalentă');
  assert.notEqual(amprentaClasamentTrend(cu('tools/trend-12-1-lib.mjs', 'export function baraTrend(o, h, l, c) { return [o, h, l, c].every((v) => v > 0); }', 'export function baraTrend(o, h, l, c) { return [o, h, l, c].every((v) => v > 1); }')), v, 'filtrul barelor schimbat ⇒ altă amprentă');
  assert.notEqual(amprentaClasamentTrend(cu('tools/trend-12-1-lib.mjs', "export const RANGE_CLASAMENT = '2y';", "export const RANGE_CLASAMENT = '1y';")), v, 'intervalul schimbat ⇒ altă amprentă');
  assert.notEqual(amprentaClasamentTrend(cu('tools/trend-12-1-lib.mjs', 'const top = o.top ?? 40, minPret = o.minPret ?? 5,', 'const top = o.top ?? 40, minPret = o.minPret ?? 6,')), v, 'pragul de preț schimbat ⇒ altă amprentă');
  assert.notEqual(amprentaClasamentTrend(cu('tools/trend-12-1.mjs', 'const MIN_CAP = 2e9, N = 600, TOP = 40,', 'const MIN_CAP = 3e9, N = 600, TOP = 40,')), v, 'pragul de capitalizare din robot schimbat ⇒ altă amprentă');
  assert.equal(amprentaClasamentTrend(cu('tools/trend-12-1-lib.mjs', 'export function mesajDiscord(o) {', 'export function mesajDiscord(o) { /* afișaj */')), v, 'mesajul Discord nu decide clasamentul');
  assert.throws(() => amprentaClasamentTrend(cu('tools/trend-12-1.mjs', 'const MIN_CAP = 2e9, N = 600, TOP = 40,', 'const LIMITA = 2e9, N = 600, TOP = 40,')), /închis la eroare/, 'pragurile negăsite ⇒ eroare, nu o amprentă falsă');
  assert.deepEqual([...RADACINI_CLASAMENT], ['clasament', 'curataUnivers', 'regim', 'taieBaraPartiala', 'liniaIstoric', 'baraTrend', 'RANGE_CLASAMENT']);
  const r = citeste('tools/trend-12-1.mjs'); assert.match(r, /baraTrend\(q\.open\[k\], q\.high\[k\], q\.low\[k\], q\.close\[k\]\)/); assert.match(r, /range=' \+ RANGE_CLASAMENT/); assert.doesNotMatch(r, /range=2y/);
});

test('🟡3 Trend: liniile vechi fără `v` — de la 15.10 ale amprentei de azi, 13–14.10 ale regulii de dinainte (afară din probă)', () => {
  const V = amprentaClasamentTrend(), V0 = TC_ECHIVALENTE[0];
  assert.equal(LINII_FARA_V.v, V0); assert.equal(LINII_FARA_V.deLa, '2026-10-15');
  assert.equal(versiuneLinie({ d: '2026-10-15' }), V0); assert.equal(versiuneLinie({ d: '2026-10-27' }), V0);
  assert.notEqual(versiuneLinie({ d: '2026-10-14' }), V0); assert.notEqual(versiuneLinie({ d: '2026-10-13' }), V0);
  assert.equal(versiuneLinie({ d: '2026-11-02', v: 'tc-altceva00000' }), 'tc-altceva00000', 'linia nouă își poartă amprenta');
  const ist = [{ d: '2026-10-13' }, { d: '2026-10-14' }, { d: '2026-10-15' }, { d: '2026-10-16', v: V0 }, { d: '2026-10-29', v: V }, { d: '2026-11-02', v: 'tc-altceva00000' }];
  assert.deepEqual(liniiInProba(ist, V).map((l) => l.d), ['2026-10-15', '2026-10-16', '2026-10-29'], 'amprentele echivalente sunt aceeași probă; alta nu');
});

test('🟡3 Trend: robotul scrie `v` pe linia nouă, bilanțul judecă doar liniile versiunii de acum și o spune în fișier', () => {
  const r = citeste('tools/trend-12-1.mjs'), b = citeste('tools/trend-12-1-bilant.mjs');
  assert.match(r, /adaugaIstoric\(ist, \{ \.\.\.liniaIstoric\(rez, rg\), v: amprentaClasamentTrend\(\) \}\)/);
  assert.match(b, /liniiInProba\(istoricTot, V\)/); assert.match(b, /versiune: V/);
});

test('🟡3 Trend: amprenta clasamentului de acum e scrisă în protocol (tabel care doar crește)', () => {
  const doc = citeste('docs/trend-12-1-protocol.md');
  assert.match(doc, /## Amprentele clasamentului/);
  const r = [...doc.replace(/\r\n/g, '\n').matchAll(/^\| [^|\n]+ \| `(tc-[0-9a-f]{12})` \|.*$/gm)].map((m) => m[1]);
  assert.ok(r.length >= 2, 'tabelul are regula veche și pe cea de acum'); assert.equal(r.at(-1), amprentaClasamentTrend(), 'rândul de jos = amprenta de acum');
});

// ── 🔵14: promisiunea din protocol („la 60 de ferestre fără verdict, pragul pentru privirile de după se rescrie ÎNAINTE”), acum în cod;
//    verdictul = PRIMA privire care trece pragul (exact ce numără mărimea scrisă: orice trecere e un „probat” anunțat) ──
test('🔵14 Trend: verdictul vine la prima trecere a pragului și rămâne; după 60 de ferestre fără verdict ⇒ „prag de rescris”, nu „probat” cu pragul vechi', async () => {
  const { verdictSecvential, FERESTRE_MAX, T_PRAG, contractTrend } = await import('./trend-12-1-lib.mjs');
  const tPe = (a) => { const n = a.length, m = a.reduce((x, y) => x + y, 0) / n, s = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (n - 1)); return m / (s / Math.sqrt(n)); };
  assert.equal(FERESTRE_MAX, 60);
  const sus = Array.from({ length: 14 }, (_, i) => 0.05 + (i % 3) * 0.002), jos = Array.from({ length: 40 }, (_, i) => -0.05 - (i % 3) * 0.002);
  const a = verdictSecvential(sus.concat(jos));
  assert.equal(a.verdict, 'probat față de alte acțiuni'); assert.equal(a.laFereastra, 12, 'prima privire posibilă (12 ferestre)');
  assert.ok(tPe(sus.concat(jos)) < 0, 'controlul: pe toate ferestrele t ar fi negativ — verdictul nu se mai întoarce');
  const zgomot = (n) => Array.from({ length: n }, (_, i) => (i % 2 ? 0.01 : -0.01) + (i % 7) * 0.0001);
  assert.equal(verdictSecvential(zgomot(59)).verdict, 'în probă'); assert.equal(verdictSecvential(zgomot(11)).verdict, 'în probă');
  const tarziu = zgomot(60).concat(Array.from({ length: 40 }, () => 0.05));
  assert.ok(tPe(tarziu) > T_PRAG, 'controlul: cu pragul vechi, după 60 ar ieși „probat”');
  const t = verdictSecvential(tarziu); assert.match(t.verdict, /^prag de rescris/); assert.equal(t.laFereastra, null);
  const c = contractTrend({ verdict: t.verdict, laFereastra: null, starturi20: [] }, { cal: null, azi: '2031-01-01' });
  assert.equal(c.judecata.verdict, null, '„prag de rescris” nu e o judecată');
  const c2 = contractTrend({ verdict: a.verdict, laFereastra: 12, starturi20: Array.from({ length: 54 }, (_, i) => '2027-' + String(1 + Math.floor(i / 5)).padStart(2, '0') + '-0' + (1 + (i % 5))) }, { cal: null, azi: '2031-01-01' });
  assert.equal(c2.judecata.verdict, a.verdict);
});

// ── revizia F3, 🔵9: „odată dat, rămâne” e adevărat doar pe ferestrele ÎNGHEȚATE — judecata le folosește doar pe ele; data judecății testată ──
test('🔵9 F3 Trend: judecata stă doar pe ferestrele înghețate (orizont + 10 sesiuni); o fereastră provizorie nu dă „probat”', async () => {
  const { bilant, verdictSecvential } = await import('./trend-12-1-lib.mjs');
  const T0 = Date.parse('2024-01-02T14:30:00Z'), n = 245, zi = (i) => new Date(T0 + i * 86400000).toISOString().slice(0, 10);
  const serie = (pas) => { const out = []; let p = 50; for (let i = 0; i < n; i++) { const o = p; p = o * (1 + pas(i)); out.push({ t: T0 + i * 86400000, o, h: Math.max(o, p) * 1.01, l: Math.min(o, p) * 0.99, c: p, v: 1e6 }); } return out; };
  const preturi = { SPY: serie(() => 0) }, simb = Array.from({ length: 20 }, (_, i) => 'A' + i);
  simb.forEach((s, k) => { preturi[s] = serie((i) => (k < 8 ? 0.005 + ((i * 7 + k) % 5) * 0.0004 : ((i * 3 + k) % 7 - 3) * 0.001)); });
  const istoric = Array.from({ length: n - 1 }, (_, i) => ({ d: zi(i), regim: true, n: 20, top: simb.slice(0, 8).map((s) => [s, 0.1]), univers: simb }));
  const b = bilant(istoric, preturi, { h: [20, 60] });
  assert.equal(b.ferestre20, 12, '12 ferestre cu valoare'); assert.equal(b.ferestreJudecate, 11, 'dar doar 11 înghețate');
  assert.equal(b.verdict, 'în probă', 'fereastra a 12-a e provizorie: nu dă verdictul');
  assert.ok(b.t20 > 3.2, 'controlul: pe toate cele 12 ferestre t ar trece pragul (' + b.t20 + ')');
});
test('🔵9 F3 Trend: data judecății = închiderea ferestrei care a trecut pragul (cu calendarul NYSE), nu a ultimei', async () => {
  const { contractTrend } = await import('./trend-12-1-lib.mjs');
  const { calendarSUA, dupaSesiuni } = await import('../lib/proba-contract.mjs');
  const cal = calendarSUA('.'), st = []; let d = '2026-11-02'; for (let i = 0; i < 20; i++) { st.push(d); d = dupaSesiuni(cal, d, 20).zi; }
  const c = contractTrend({ verdict: 'probat față de alte acțiuni', laFereastra: 12, starturi20: st }, { cal, azi: '2028-01-03' });
  assert.equal(c.judecata.data, dupaSesiuni(cal, st[11], 20).zi); assert.notEqual(c.judecata.data, dupaSesiuni(cal, st[19], 20).zi);
});
