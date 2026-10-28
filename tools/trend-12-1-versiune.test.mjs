// 28.10.2026 — revizia independentă F2, 🟡3 (Trend 12 luni): regula de clasament (`clasament`, `curataUnivers`, `regim`,
// `taieBaraPartiala`, `liniaIstoric`) nu avea amprentă, iar liniile istoricului nu purtau versiunea ⇒ o regulă schimbată ar fi intrat
// tăcut în aceeași probă. Acum fiecare linie nouă poartă amprenta clasamentului (`v`), iar bilanțul judecă doar liniile versiunii de acum.
// Liniile vechi, fără `v`: reconstruit din git — amprenta e `tc-86d0c9bbf68a` de la a3bd8443 (15.10.2026, 04:08 UTC) până azi, deci
// liniile cu ziua ≥ 15.10 sunt ale ei; 13.10 și 14.10 au fost scrise sub regula de dinainte (`tc-b7a4179a6e14`) și ies din probă.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { amprentaClasamentTrend, versiuneLinie, liniiInProba, LINII_FARA_V, RADACINI_CLASAMENT } from './trend-12-1-lib.mjs';

const citeste = (f) => readFileSync(f, 'utf8');
const cu = (fisier, vechi, nou) => (f) => { const s = citeste(f); if (f !== fisier) return s; assert.ok(s.includes(vechi), fisier + ' nu mai conține ' + vechi); return s.replace(vechi, nou); };

test('🟡3 Trend: amprenta clasamentului se schimbă cu regula de clasament și cu pragurile robotului; afișajul nu contează', () => {
  const v = amprentaClasamentTrend();
  assert.match(v, /^tc-[0-9a-f]{12}$/);
  assert.equal(v, 'tc-86d0c9bbf68a', 'reconstruit din git: neschimbată de la 15.10.2026 04:08 UTC');
  assert.notEqual(amprentaClasamentTrend(cu('tools/trend-12-1-lib.mjs', 'const top = o.top ?? 40, minPret = o.minPret ?? 5,', 'const top = o.top ?? 40, minPret = o.minPret ?? 6,')), v, 'pragul de preț schimbat ⇒ altă amprentă');
  assert.notEqual(amprentaClasamentTrend(cu('tools/trend-12-1.mjs', 'const MIN_CAP = 2e9, N = 600, TOP = 40,', 'const MIN_CAP = 3e9, N = 600, TOP = 40,')), v, 'pragul de capitalizare din robot schimbat ⇒ altă amprentă');
  assert.equal(amprentaClasamentTrend(cu('tools/trend-12-1-lib.mjs', 'export function mesajDiscord(o) {', 'export function mesajDiscord(o) { /* afișaj */')), v, 'mesajul Discord nu decide clasamentul');
  assert.throws(() => amprentaClasamentTrend(cu('tools/trend-12-1.mjs', 'const MIN_CAP = 2e9, N = 600, TOP = 40,', 'const LIMITA = 2e9, N = 600, TOP = 40,')), /închis la eroare/, 'pragurile negăsite ⇒ eroare, nu o amprentă falsă');
  assert.deepEqual([...RADACINI_CLASAMENT], ['clasament', 'curataUnivers', 'regim', 'taieBaraPartiala', 'liniaIstoric']);
});

test('🟡3 Trend: liniile vechi fără `v` — de la 15.10 ale amprentei de azi, 13–14.10 ale regulii de dinainte (afară din probă)', () => {
  const V = amprentaClasamentTrend();
  assert.equal(LINII_FARA_V.v, V); assert.equal(LINII_FARA_V.deLa, '2026-10-15');
  assert.equal(versiuneLinie({ d: '2026-10-15' }), V); assert.equal(versiuneLinie({ d: '2026-10-27' }), V);
  assert.notEqual(versiuneLinie({ d: '2026-10-14' }), V); assert.notEqual(versiuneLinie({ d: '2026-10-13' }), V);
  assert.equal(versiuneLinie({ d: '2026-11-02', v: 'tc-altceva00000' }), 'tc-altceva00000', 'linia nouă își poartă amprenta');
  const ist = [{ d: '2026-10-13' }, { d: '2026-10-14' }, { d: '2026-10-15' }, { d: '2026-10-16', v: V }, { d: '2026-11-02', v: 'tc-altceva00000' }];
  assert.deepEqual(liniiInProba(ist, V).map((l) => l.d), ['2026-10-15', '2026-10-16']);
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
