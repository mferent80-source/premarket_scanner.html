// 18.10.2026 — „Setările jurnalului” (tt_journal_settings_v1) poartă acum etichetele tranzacțiilor (t212Etichete) și limita lunară (limitaLuna):
// unirea între telefon și PC (lib/cloud-sync-model.mjs mergeRecord) trebuie să le păstreze pe amândouă, fără conflicte false.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRecord, validateValue, KEYS } from '../lib/cloud-sync-model.mjs';

const K = 'tt_journal_settings_v1';
test('cheia setărilor jurnalului e sincronizată și acceptă câmpurile noi', () => {
  assert.ok(KEYS.includes(K));
  assert.equal(validateValue(K, { limitaLuna: 1000, t212Etichete: { s1: ['fomo', 'revenge'] }, ddAlertAll: 0 }), true);
});
test('etichete puse pe dispozitive diferite pe tranzacții diferite ⇒ se unesc, fără conflict', () => {
  const base = { limitaLuna: 1000, t212Etichete: {} };
  const m = mergeRecord(K, base, { ...base, t212Etichete: { s1: ['fomo'] } }, { ...base, t212Etichete: { s2: ['revenge'] } });
  assert.deepEqual(m.value.t212Etichete, { s1: ['fomo'], s2: ['revenge'] }); assert.equal(m.conflicts.length, 0);
});
test('aceeași tranzacție etichetată diferit pe două dispozitive ⇒ etichetele se adună (listă de texte), fără conflict', () => {
  const base = { t212Etichete: { s1: ['fomo'] } };
  const m = mergeRecord(K, base, { t212Etichete: { s1: ['fomo', 'early-exit'] } }, { t212Etichete: { s1: ['fomo', 'revenge'] } });
  assert.deepEqual([...m.value.t212Etichete.s1].sort(), ['early-exit', 'fomo', 'revenge']); assert.equal(m.conflicts.length, 0);
});
test('limita schimbată pe un singur dispozitiv ⇒ trece; schimbată diferit pe amândouă ⇒ conflict vizibil (nu se pierde tăcut)', () => {
  const base = { limitaLuna: 1000 };
  assert.equal(mergeRecord(K, base, { limitaLuna: 1500 }, base).value.limitaLuna, 1500);
  assert.ok(mergeRecord(K, base, { limitaLuna: 1500 }, { limitaLuna: 800 }).conflicts.length > 0);
});
