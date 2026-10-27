// 27.10.2026 — I-743 („amprenta judecătorului”, lotul F al auditului): amprenta de azi a regulilor și a codului care JUDECĂ fiecare probă
// trebuie să fie cea scrisă în protocolul ei. O schimbare (în motor sau în evaluator) fără protocol nou pică aici, în suita locală și în
// poarta de teste de la push — NU în fluxurile roboților (o diferență acolo oprește notarea doar prin gărzile din fișierele lor).
// Ce faci când pică: dacă schimbarea e o regulă nouă ⇒ protocol nou (versiune nouă, scrisă înainte; jurnalul vechi rămâne sub versiunea
// veche); dacă nu atinge judecata ⇒ înapoi la codul vechi sau, unde protocolul o permite, un rând nou cu motivul.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { versiuneV1 } from '../lib/v1-proba.mjs';
import { versiune as versiunePm } from '../lib/premarket-proba.mjs';
import { amprentaJudecator as judecatorUmbra } from '../lib/reversal-umbra.mjs';
import { motor } from './premarket-jurnal.mjs';

const scris = (f, re) => { const m = re.exec(readFileSync(f, 'utf8')); assert.ok(m, f + ' nu scrie amprenta (' + re + ')'); return m[1]; };

test('Reguli V1: amprenta regulilor + a evaluatorului = cea de la pornirea v2 din docs/v1-proba-protocol.md', () => {
  assert.equal(versiuneV1(readFileSync('lib/independent-scanner.js', 'utf8')), scris('docs/v1-proba-protocol.md', /Amprenta la pornirea v2: `(v1-[0-9a-f]{12})`/),
    'regulile V1 (lib/independent-scanner.js) sau evaluatorul (lib/v1-proba.mjs) s-au schimbat față de protocolul v2');
});
test('Top Long: amprenta clasamentului (cu ajutoarele din engine.js) + a evaluatorului = cea de la pornirea v2 din docs/premarket-proba-protocol.md', () => {
  assert.equal(versiunePm(motor(async () => { throw Error('fără rețea'); }).hooks), scris('docs/premarket-proba-protocol.md', /Amprenta la pornirea v2: `(pm-[0-9a-f]{12})`/),
    'regulile Top Long (candidate-engine/engine.js: funcțiile de clasament sau ajutoarele lor) sau evaluatorul s-au schimbat față de protocolul v2');
});
test('Umbra stopului Reversal: judecătorul = cel scris în docs/reversal-stop-umbra-protocol.md', () => {
  assert.equal(judecatorUmbra(), scris('docs/reversal-stop-umbra-protocol.md', /Amprenta judecătorului: `(ju-[0-9a-f]{12})`/), 'codul care măsoară / judecă umbra (lib/reversal-umbra.mjs) s-a schimbat');
});
