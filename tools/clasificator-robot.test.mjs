import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { motor } from './clasificator-date.mjs';
import { ruleaza, valideaza, FISIER } from './clasificator-robot.mjs';

const now = Date.parse('2026-10-07T22:00:00Z');
test('I-638: robotul clasifică, rezumă ca pagina și pune pe listă ce pică', async () => {
  const c = motor('.', ['lib/desk-classifier.js']), N = c.HoldingsNeural;
  const sursa = async (s) => { if (s === 'RAU') throw new Error('Salt zilnic peste 25%'); const bars = N.demoBars(s === 'B' ? 2 : 0, now); return { asOf: '2026-10-07', timezone: 'America/New_York', closeMinutes: 960, bars }; };
  const j = await ruleaza({ c, simboluri: ['A', 'B', 'RAU'], sursa, now });
  assert.match(j.univers.eroare, /Prea puține simboluri/); // sub 10 simboluri modelul comun nu se antrenează, fișierul rămâne valabil
  assert.deepEqual(valideaza(j, c.HoldingsClassifier.VERSION), []);
  assert.equal(Object.keys(j.entries).length, 2); assert.equal(j.picate[0].simbol, 'RAU'); assert.equal(j.asOf, '2026-10-07');
  // Pagina acceptă fișierul doar pe sesiunea așteptată și cu același motor.
  c.DailySeries.expected = () => '2026-10-07';
  assert.equal(c.TTDeskClassifier.acceptRobot(JSON.parse(JSON.stringify(j))), 2); assert.equal(c.TTDeskClassifier.get('A').source, 'robot');
  assert.equal(c.TTDeskClassifier.acceptRobot({ ...j, motor: 'holdings-clf-v1' }), 0);
  const stricat = JSON.parse(JSON.stringify(j)); stricat.entries.A.algos.vote.support = [1, 1, 1]; assert.notDeepEqual(valideaza(stricat), []);
});

// Înainte de generare (și în suita locală) doar forma; motorul paginii se cere doar DUPĂ generare (GARDA_FISIER=1 în workflow),
// altfel o urcare de versiune a motorului ar opri robotul înainte să refacă fișierul.
test('garda: fișierul publicat (dacă există) are forma bună (și, după generare, motorul paginii)', () => {
  if (!existsSync(FISIER)) return;
  const c = motor('.'); assert.deepEqual(valideaza(JSON.parse(readFileSync(FISIER, 'utf8')), process.env.GARDA_FISIER ? c.HoldingsClassifier.VERSION : undefined), []);
});
test('I-658: universul lărgit — rezumatele complete doar pentru scanner; clasamentul și jurnalul pe tot universul; limita de timp', async () => {
  const c = motor('.', ['lib/desk-classifier.js']), N = c.HoldingsNeural;
  const sursa = async (s) => ({ asOf: '2026-10-07', timezone: 'America/New_York', closeMinutes: 960, bars: N.demoBars(s.charCodeAt(0) % 5, now) });
  const j = await ruleaza({ c, simboluri: ['A', 'B', 'C'], scanner: new Set(['A']), sursa, now, comun: false });
  assert.deepEqual(Object.keys(j.entries), ['A']); assert.equal(j.clasificate, 3); assert.equal(j.clasament.length, 3);
  assert.deepEqual(valideaza(j, c.HoldingsClassifier.VERSION), []);
  assert.equal(Object.keys(JSON.parse(j.istoricText.trim()).voturi).length, 3); // jurnalul are toate voturile
  const t = await ruleaza({ c, simboluri: ['A', 'B'], sursa, now, comun: false, minute: -1 });
  assert.equal(t.clasificate, 0); assert.match(t.picate[0].motiv, /Timp depășit/);
});
