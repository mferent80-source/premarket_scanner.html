// 27.10.2026 (I-760): testul de ACOPERIRE al inventarului gărzilor. Roșu când: o gardă din Governor / contul Trading 212 n-are un test care
// o declanșează (eticheta «modul · fragment» din tools/garzi-declansare.test.mjs), o etichetă nu mai prinde nicio gardă sau prinde două,
// un model trimite la un fișier șters, sau docs/inventar-modele.md nu mai e cel generat din cod (node tools/inventar-garzi.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { genereaza, garzi, acoperire, teste, etichete, bucatiFixe, SURSE, DOC, fara_validare } from './inventar-garzi.mjs';

test('fiecare gardă din Governor și din contul Trading 212 are un test care o declanșează; nicio etichetă orfană sau ambiguă', () => {
  const r = genereaza();
  assert.ok(r.garzi.length >= 50, 'gărzile găsite în cod: ' + r.garzi.length);
  assert.deepEqual(r.fara.map((g) => g.fisier + ':' + g.linie + ' ' + g.mesaj.slice(0, 60)), [], 'gărzi fără test de declanșare');
  assert.deepEqual(r.orfane.map((e) => e.modul + ' · ' + e.fragment), [], 'etichete care nu mai prind nicio gardă (motivul s-a schimbat?)');
  assert.deepEqual(r.ambigue.map((e) => e.modul + ' · ' + e.fragment), [], 'etichete care prind mai multe gărzi');
});

test('docs/inventar-modele.md e cel generat din cod (în afară de data ultimei validări)', () => {
  const pe_disc = readFileSync(DOC, 'utf8').replace(/\r\n/g, '\n'), acum = genereaza().md.replace(/\r\n/g, '\n');
  assert.equal(fara_validare(pe_disc), fara_validare(acum), 'rulează: node tools/inventar-garzi.mjs');
});

test('măsurat prin stricare: o gardă nouă fără test apare „fără test”, iar o etichetă greșită apare orfană / ambiguă', () => {
  const gov = SURSE.find((s) => s.fisier === 'lib/governor.js'), src = readFileSync(gov.fisier, 'utf8');
  const stricat = src.replace("const opr = oprire();", "if (todayTrades > 99) { verdict = 'HALTED'; reasons.push('Gardă nouă de probă, fără test'); }\n    const opr = oprire();");
  assert.notEqual(stricat, src, 'locul de inserție există');
  const lista = garzi(stricat, gov), noua = lista.find((g) => g.mesaj.includes('Gardă nouă de probă'));
  assert.ok(noua, 'garda nouă e găsită în cod'); assert.equal(noua.efect, 'HALTED');
  const ac = acoperire(lista, teste());
  assert.deepEqual(ac.find((g) => g.mesaj.includes('Gardă nouă de probă')).teste, [], 'fără test ⇒ FĂRĂ TEST în inventar');
  const t212 = SURSE.find((s) => s.fisier === 'lib/trading212-capital.js'), l2 = garzi(readFileSync(t212.fisier, 'utf8'), t212);
  const fals = [{ fisier: 'tools/x.test.mjs', nume: ['gardă «governor · Motiv care nu există nicăieri»', 'gardă «trading212-capital · Bugetul»'] }];
  const ac2 = acoperire(lista.concat(l2), fals);
  assert.equal(ac2.orfane.length, 1); assert.equal(ac2.ambigue.length, 1);
});

test('citirea codului: bucățile fixe din șiruri și șabloane; etichetele din numele testelor', () => {
  assert.deepEqual(bucatiFixe("'Pierdere ' + x + ' ≥ buget'"), ['Pierdere ', ' ≥ buget']);
  assert.deepEqual(bucatiFixe('`DD rolling ${a.toFixed(1)}% ≥ prag ${b}%`'), ['DD rolling ', '% ≥ prag ', '%']);
  assert.deepEqual(etichete([{ fisier: 'f', nume: ['gardă «governor · Pierdere zilnică» — x'] }]).map((e) => [e.modul, e.fragment]), [['governor', 'Pierdere zilnică']]);
});
