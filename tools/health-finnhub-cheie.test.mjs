// Health: cheia Finnhub se poate pune din pagină (câmp + Salvează) și dintr-un link cu fragment `#finnhub=…` (14.10.2026).
// De ce: Nasdaq Scanner (unde se punea) s-a oprit pe 12.10; fără cheie, scannerul Decision Desk nu blochează intrările din ziua
// raportării (lib/earnings.js citește `finnhub_api_key` / `fh_key` din localStorage). Fragmentul (#) nu pleacă niciodată la server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(ROOT, 'health/index.html'), 'utf8').replace(/\r\n/g, '\n');

function functie(nume) {
  const m = new RegExp('\\nfunction ' + nume + '\\(([^)]*)\\)\\s*\\{\\n([\\s\\S]*?)\\n\\}\\n').exec(HTML);
  assert.ok(m, 'funcția ' + nume + ' există în health/index.html');
  return m;
}

test('salveazaFinnhub scrie ambele chei din localStorage (unificate ca în lib/finnhub-key.js) si refuza golul', () => {
  const m = functie('salveazaFinnhub'), store = new Map();
  const fn = new Function('localStorage', 'return function(' + m[1] + '){\n' + m[2] + '\n};')({ setItem: (k, v) => store.set(k, v), getItem: (k) => store.get(k) ?? null });
  assert.equal(fn('  abc123XYZ  '), true);
  assert.equal(store.get('finnhub_api_key'), 'abc123XYZ'); assert.equal(store.get('fh_key'), 'abc123XYZ');
  assert.equal(fn(''), false); assert.equal(fn('   '), false); assert.equal(store.get('finnhub_api_key'), 'abc123XYZ', 'golul nu șterge cheia');
});

test('cheieDinLink citeste doar fragmentul #finnhub=… (nu query-ul) si il decodeaza', () => {
  const m = functie('cheieDinLink');
  const fn = new Function('return function(' + m[1] + '){\n' + m[2] + '\n};')();
  assert.equal(fn('#finnhub=abc%2Fdef'), 'abc/def');
  assert.equal(fn('#x=1&finnhub=k9'), 'k9');
  assert.equal(fn('#finnhub='), ''); assert.equal(fn(''), ''); assert.equal(fn('#altceva=1'), '');
});

test('pagina: campul + butonul Salveaza exista, iar la pornire cheia din link se salveaza si linkul se curata', () => {
  assert.match(HTML, /id="inpFinnhub"/); assert.match(HTML, /data-run="finnhubSalveaza"/);
  assert.match(HTML, /finnhubSalveaza:/, 'runner-ul e înregistrat');
  const boot = /cheieDinLink\(location\.hash\)[\s\S]{0,400}history\.replaceState\(/.test(HTML);
  assert.ok(boot, 'la pornire: cheieDinLink(location.hash) ⇒ salvare ⇒ history.replaceState (fragmentul nu rămâne în bară)');
  assert.ok(!/finnhub_api_key/.test(HTML.slice(0, HTML.indexOf('<script'))), 'cheia nu apare în HTML-ul static');
});
