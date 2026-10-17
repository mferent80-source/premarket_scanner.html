// 17.10.2026 — fiecare aplicație instalabilă are identitate proprie. Chrome rezolvă „id” față de ORIGINEA lui start_url
// (nu față de dosarul manifestului): „./” în /alerts/ și în /app/ dădea aceeași identitate ⇒ Alerte apărea „deja instalată”.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ORIGINE = 'https://mferent80-source.github.io', BAZA = ORIGINE + '/premarket_scanner.html/';
const MANIFESTE = ['manifest.webmanifest', 'app/manifest.webmanifest', 'alerts/manifest.webmanifest'];
const idChrome = (f) => { const j = JSON.parse(readFileSync(f, 'utf8')), man = new URL(f, BAZA), start = new URL(j.start_url || '.', man); return new URL(j.id ?? start.pathname, start.origin + '/').href; };

test('manifestele au identități distincte, așa cum le calculează Chrome', () => {
  const ids = MANIFESTE.map(idChrome);
  assert.equal(new Set(ids).size, ids.length, 'identități repetate: ' + ids.join(' · '));
  assert.equal(idChrome('alerts/manifest.webmanifest'), BAZA + 'alerts/');
});
test('identitatea Decision App rămâne cea instalată deja pe telefoane (schimbarea ei ar crea altă aplicație)', () => {
  assert.equal(idChrome('app/manifest.webmanifest'), ORIGINE + '/');
});
