// 19.10.2026 — I-700 în Planuri: câmpul de capital pornea cu `tt_ticket_capital || '10000'` — un capital inventat din care se
// dimensiona planul. Acum: ce ai scris tu, altfel capitalul din ACCT.capitalInfo() (când există), altfel gol + mesaj; lângă câmp,
// rândul capitalInfo().text. Demo-ul fictiv își păstrează 10.000.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boot, flush } from './desk-boot.mjs';

const INFO = { value: 5393.4, source: 'trading212', at: Date.parse('2026-10-08T01:15:00Z'), ageHours: 3, synced: true, diverges: true, text: 'Capital folosit: 5.393 $ · Trading 212 · acum 3 h · pe celălalt aparat 12.670 $' };

test('I-700: fără capital scris și fără ACCT, câmpul rămâne gol și tichetul cere capitalul (nu 10.000 inventat)', async () => {
  const b = boot({ demo: false }); await flush();
  assert.equal(b.nodes.ticketCapital.value, '');
  assert.equal(b.nodes.ticketCapitalInfo.hidden, false); assert.match(b.nodes.ticketCapitalInfo.textContent, /Scrie capitalul/);
  b.nodes.focusAction.onclick?.(); assert.equal(b.nodes.ticketSave.disabled, true);
  assert.doesNotMatch(readFileSync('desk/index.html', 'utf8'), /id="ticketCapital"[^>]*value="10000"/);
});
test('I-700: cu ACCT.capitalInfo() câmpul pornește din capitalul contului, iar rândul lui stă lângă câmp', async () => {
  const b = boot({ demo: false, extra: { ACCT: { capitalInfo: () => INFO } } }); await flush();
  assert.equal(b.nodes.ticketCapital.value, '5393');
  assert.equal(b.nodes.ticketCapitalInfo.hidden, false); assert.equal(b.nodes.ticketCapitalInfo.textContent, INFO.text);
});
test('I-700: ce a scris el rămâne; capitalInfo stricat sau aruncând nu oprește pagina', async () => {
  const b = boot({ demo: false, seed: { tt_ticket_capital: '2500' }, extra: { ACCT: { capitalInfo: () => INFO } } }); await flush();
  assert.equal(b.nodes.ticketCapital.value, '2500'); assert.equal(b.nodes.ticketCapitalInfo.textContent, INFO.text);
  const r = boot({ demo: false, extra: { ACCT: { capitalInfo: () => { throw Error('stricat'); } } } }); await flush();
  assert.equal(r.nodes.ticketCapital.value, ''); assert.match(r.nodes.ticketCapitalInfo.textContent, /Scrie capitalul/);
});
test('I-700: demo-ul fictiv păstrează capitalul de 10.000', async () => {
  const b = boot(); await flush(); assert.equal(b.nodes.ticketCapital.value, '10000');
});
