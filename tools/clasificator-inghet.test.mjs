// I-661 + I-673 (17.10.2026) — motorul și regulile probei, înghețate cât durează proba înainte.
// Motorul: amprenta fișierului lib/holdings-classifier.js și amprenta rezultatelor lui pe serii fixe trebuie să stea în
// docs/clasificator-versiuni.md, pe rândul versiunii curente. Rezultate diferite ⇒ versiune nouă (numărătoarea repornește);
// același rezultat cu fișier schimbat (comentarii, ordine) ⇒ ajunge un rând nou pe aceeași versiune.
// Regulile: pragurile din tools/clasificator-jurnal.mjs (PRAG, PROBA) trebuie să fie cele din docs/clasificator-protocol.md.
// Testul nu rulează în robotul de noapte (o diferență de platformă nu are voie să oprească notarea); îl rulează suita locală.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { motor } from './clasificator-date.mjs';
import { amprentaFisier, amprentaRezultate, registru } from './clasificator-amprenta.mjs';
import { PRAG, PROBA } from './clasificator-jurnal.mjs';

test('I-661: motorul e cel din registru (versiune + amprenta fișierului + amprenta rezultatelor)', () => {
  const c = motor('.'), V = c.HoldingsClassifier.VERSION, rows = registru(readFileSync('docs/clasificator-versiuni.md', 'utf8')).filter((r) => r.versiune === V);
  assert.ok(rows.length, `Versiunea ${V} nu e în docs/clasificator-versiuni.md — scrie rândul (data, amprentele, motivul).`);
  const f = amprentaFisier(), r = amprentaRezultate(c);
  for (const x of rows) assert.equal(x.rezultate, r, `Rezultatele motorului s-au schimbat față de registru (${x.rezultate} → ${r}) fără versiune nouă. Urcă VERSION în lib/holdings-classifier.js și scrie rândul nou: proba pornește de la zero pentru noua versiune (sau ține-o pe cea veche în tools/motoare/, I-674).`);
  assert.ok(rows.some((x) => x.fisier === f), `Fișierul motorului s-a schimbat (amprenta ${f}) cu aceleași rezultate: adaugă un rând pe versiunea ${V} cu noua amprentă și motivul.`);
});
test('I-674: dacă pagina are alt motor decât cel în probă, motorul în probă rulează ca al doilea (tools/motoare/)', () => {
  const V = motor('.').HoldingsClassifier.VERSION; if (V === PROBA) return;
  const f = `tools/motoare/${PROBA}/holdings-classifier.js`; assert.ok(existsSync(f), `Motorul în probă (${PROBA}) nu mai rulează: copiază-l în ${f}.`);
  assert.match(readFileSync(f, 'utf8'), new RegExp(`VERSION='${PROBA}'`));
});
test('I-673: regulile de judecată din cod sunt cele din protocol', () => {
  const t = readFileSync('docs/clasificator-protocol.md', 'utf8'), m = /<!-- reguli -->\s*```json\s*([\s\S]*?)```/.exec(t);
  assert.ok(m, 'Blocul de reguli lipsește din docs/clasificator-protocol.md.');
  assert.deepEqual(JSON.parse(m[1]), { PROBA, PRAG: { ...PRAG } }, 'PRAG / PROBA diferă de protocol: o schimbare de regulă se scrie întâi în protocol (data, motivul), cu proba încă fără rezultate.');
});
