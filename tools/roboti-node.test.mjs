// 27.10.2026 (audit E B9): suita rulează pe Node 24 (teste.yml), roboții rulau pe 20 / 22 — o suită verde nu proba runtime-ul lor
// (iar Node 20 a ieșit din suport pe 30.04.2026). Toți roboții care instalează Node folosesc aceeași versiune ca suita.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

test('fiecare workflow care instalează Node folosește versiunea suitei de teste', () => {
  const ver = (t) => [...t.matchAll(/node-version:\s*'?(\d+)'?/g)].map((m) => m[1]);
  const suita = ver(readFileSync('.github/workflows/teste.yml', 'utf8'));
  assert.equal(new Set(suita).size, 1); const v = suita[0];
  const abateri = [];
  for (const f of readdirSync('.github/workflows').filter((x) => x.endsWith('.yml'))) for (const x of ver(readFileSync('.github/workflows/' + f, 'utf8'))) if (x !== v) abateri.push(f + ': ' + x);
  assert.deepEqual(abateri, [], 'versiunea suitei: ' + v);
});
