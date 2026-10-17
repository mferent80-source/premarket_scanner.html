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
// 17.10.2026: „Tools” (manifestul de la rădăcină, instalat pe telefon) avea scope pe tot site-ul ⇒ acoperea /alerts/ și Android
// refuza deschiderea aplicației Alerte („nu poate fi deschisă”). Nicio aplicație nu are voie să acopere scope-ul alteia, în afară de app/.
test('scope-ul Alerte nu e acoperit de nicio altă aplicație instalabilă', () => {
  const scope = (f) => { const j = JSON.parse(readFileSync(f, 'utf8')); return new URL(j.scope || '.', new URL(f, BAZA)).href; };
  const a = scope('alerts/manifest.webmanifest');
  for (const f of MANIFESTE.filter((x) => !x.startsWith('alerts/'))) assert.ok(!a.startsWith(scope(f)), f + ' acoperă Alerte (' + scope(f) + ')');
  assert.equal(scope('manifest.webmanifest'), BAZA + 'app/');
});
test('identitatea Decision App rămâne cea instalată deja pe telefoane (schimbarea ei ar crea altă aplicație)', () => {
  assert.equal(idChrome('app/manifest.webmanifest'), ORIGINE + '/');
});
