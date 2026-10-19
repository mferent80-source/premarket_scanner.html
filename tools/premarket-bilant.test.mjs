// 19.10.2026 — I-717: bilanțul săptămânal al probei Top Long pe Discord + alarma de abatere scrisă ÎNAINTE de date
// (docs/premarket-proba-protocol.md, Anexa A). Alarma nu schimbă verdictul probei: aici se verifică și asta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { pragAbatere, SIGMA_PERIOADA, mesaj, decide } from './premarket-bilant.mjs';

const ACUM = Date.parse('2026-12-12T07:45:00Z');
/** Fișierul probei, cum îl scrie robotul zilnic (tools/premarket-jurnal.mjs). */
function proba({ n20 = 3, m20 = 0.004, n5 = 9, m5 = -0.002, v5 = 'fara-avantaj', v20 = 'astept', p20 = 0.5, ultima20 = '2026-11-20', ultimaRulare = '2026-12-11T21:50:00Z' } = {}) {
  return { protocol: 'premarket-proba-1', versiune: 'pm-cb956aef5680', ultimaZi: '2026-12-11', ultimaRulare, orizonturi: [
    { k: 5, principal: false, perioade: n5, necesare: 8, pozitive: 4, p: 0.7, medieDif: n5 ? m5 : null, verdict: v5, ultimaPerioada: n5 ? { zi: '2026-12-04', dif: 0.01, sus: 9, jos: 70 } : null },
    { k: 20, principal: true, perioade: n20, necesare: 8, pozitive: 2, p: p20, medieDif: n20 ? m20 : null, verdict: v20, ultimaPerioada: n20 ? { zi: ultima20, dif: 0.003, sus: 10, jos: 70 } : null }] };
}

test('the deviation threshold was written before the data: −1.645 × 3.4 % / √k from 3 periods on (no edge as reference)', () => {
  assert.equal(SIGMA_PERIOADA, 0.034);
  assert.equal(pragAbatere(2), null);
  assert.equal(+(pragAbatere(3) * 100).toFixed(1), -3.2); assert.equal(+(pragAbatere(6) * 100).toFixed(1), -2.3);
  assert.equal(+(pragAbatere(9) * 100).toFixed(1), -1.9); assert.equal(+(pragAbatere(12) * 100).toFixed(1), -1.6);
});

test('the weekly message: N/8, mean UP − DOWN so far with one decimal, the secondary horizon, “nothing to decide yet”', () => {
  const t = mesaj(proba(), ACUM);
  assert.match(t, /Top Long în probă · 3\/8/); assert.match(t, /SUS − JOS până acum \+0,4 %/); assert.match(t, /nimic de hotărât încă/);
  assert.match(t, /5 sesiuni: 9\/8 · −0,2 % · nu s-a văzut un avantaj/);
  assert.doesNotMatch(t, /ABATERE/); assert.doesNotMatch(t, /0,40/);
});

test('the alarm appears below the threshold and says it is an alarm, not a verdict; the probe rules do not change', () => {
  const t = mesaj(proba({ n20: 3, m20: -0.035 }), ACUM);
  assert.match(t, /ABATERE/); assert.match(t, /−3,5 %/); assert.match(t, /−3,2 %/); assert.match(t, /alarmă, nu verdict/); assert.match(t, /nimic de hotărât încă/);
  assert.doesNotMatch(mesaj(proba({ n20: 3, m20: -0.031 }), ACUM), /ABATERE/, 'peste prag ⇒ fără alarmă');
  assert.doesNotMatch(mesaj(proba({ n20: 2, m20: -0.2 }), ACUM), /ABATERE/, 'sub 3 perioade nu există prag');
});

test('after 8 periods the message gives the protocol verdict instead of “nothing to decide”', () => {
  assert.match(mesaj(proba({ n20: 8, m20: 0.006, v20: 'ajuta', p20: 0.035 }), ACUM), /verdict: Top Long ajută \(p = 0,035\)/);
  const f = mesaj(proba({ n20: 9, m20: -0.001, v20: 'fara-avantaj', p20: 0.75 }), ACUM);
  assert.match(f, /nu s-a văzut un avantaj/); assert.match(f, /NU înseamnă/); assert.doesNotMatch(f, /nimic de hotărât/);
});

test('nothing new (same periods) ⇒ no message; a new period ⇒ message; no period at all ⇒ nothing to say', () => {
  const p = proba(), d1 = decide(p, null, ACUM);
  assert.equal(d1.trimite, true); assert.ok(d1.stare.cheie);
  assert.equal(decide(p, d1.stare, ACUM + 7 * 864e5).trimite, false, 'aceeași perioadă ⇒ nu trimite');
  assert.equal(decide(proba({ n5: 10 }), d1.stare, ACUM).trimite, true, 'o perioadă nouă de 5 sesiuni');
  assert.equal(decide(proba({ n20: 4, ultima20: '2026-12-01' }), d1.stare, ACUM).trimite, true, 'o perioadă nouă de 20 de sesiuni');
  assert.equal(decide(proba({ n20: 0, n5: 0 }), null, ACUM).trimite, false);
  assert.equal(decide(null, null, ACUM).trimite, false, 'fără fișierul probei');
});

test('a daily robot that stopped writing is said out loud', () => {
  assert.match(mesaj(proba({ ultimaRulare: '2026-12-03T21:50:00Z' }), ACUM), /robotul zilnic n-a mai notat din 2026-12-03/);
  assert.doesNotMatch(mesaj(proba(), ACUM), /n-a mai notat/);
});

test('the Saturday workflow runs the tests, sends with DISCORD_WEBHOOK and saves what it sent', () => {
  const f = '.github/workflows/premarket-bilant.yml'; assert.ok(existsSync(f));
  const y = readFileSync(f, 'utf8');
  assert.match(y, /cron: '\d+ \d+ \* \* 6'/); assert.match(y, /secrets\.DISCORD_WEBHOOK/); assert.match(y, /node tools\/premarket-bilant\.mjs/);
  assert.match(y, /tools\/premarket-bilant\.test\.mjs/); assert.match(y, /premarket-bilant\.json/); assert.match(y, /trading-tools-v1-proba/);
});

test('the protocol annex: written now, monitoring only — the hypothesis, the test and the verdicts stay exactly as on 18.10', () => {
  const doc = readFileSync('docs/premarket-proba-protocol.md', 'utf8');
  assert.match(doc, /## Anexa A/); assert.match(doc, /19\.10\.2026/); assert.match(doc, /NU schimbă/); assert.match(doc, /−3,2 %/);
  for (const r of ['**„Top Long ajută”** — cel puțin 8 perioade, media diferenței > 0 și p ≤ 0,05.', '**Minimum 8 perioade** pentru orice verdict.', '**Testul semnelor**, unilateral, pe diferența medie SUS − JOS a fiecărei perioade.'])
    assert.ok(doc.includes(r), 'regula din 18.10 rămâne: ' + r);
});
