// 16.10.2026: Alerte se instalează ca aplicație separată (iconiță proprie, deschidere directă), aceeași pagină și aceleași date.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pngSize = (f) => { const b = readFileSync(join(ROOT, 'alerts', f)); assert.equal(b.toString('ascii', 1, 4), 'PNG', f + ' nu e PNG'); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('în aplicația Android „Alerte” (TWA) meniul comun al Decision App se ascunde; în browser rămâne', () => {
  const h = readFileSync(join(ROOT, 'alerts/index.html'), 'utf8');
  assert.match(h, /android-app:\\\/\\\/ro\\\.mau\\\.tradingtools\\\.alerte/, 'recunoaște pornirea din aplicația Android');
  assert.match(h, /html\[data-alerte-app\] #tt-dock-wrap/, 'ascunde bara de jos');
  assert.ok(h.indexOf('data-alerte-app') < h.indexOf('<script src="../nav.js'), 'marcajul se pune înainte să se încarce meniul');
});
test('manifestul Alertelor: aplicație proprie, cu scope pe alerts/', () => {
  const m = JSON.parse(readFileSync(join(ROOT, 'alerts/manifest.webmanifest'), 'utf8'));
  assert.equal(m.short_name, 'Alerte');
  assert.equal(m.start_url, './'); assert.equal(m.scope, './');
  assert.equal(m.id, '/premarket_scanner.html/alerts/'); // 17.10: „./” se rezolva la rădăcina domeniului = identitatea Decision App ⇒ „deja instalată”
  assert.equal(m.display, 'standalone');
  const sizes = m.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'), 'iconițele 192 și 512 cerute la instalare');
  for (const i of m.icons) { const [w, h] = pngSize(i.src); assert.equal(w + 'x' + h, i.sizes, i.src); }
});

test('pagina Alerte leagă manifestul și are butonul de instalare ascuns până la invitația browserului', () => {
  const s = readFileSync(join(ROOT, 'alerts/index.html'), 'utf8');
  assert.match(s, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(s, /<link rel="apple-touch-icon" href="icons\/alerte-192\.png">/);
  assert.match(s, /<button class="icon-btn" id="installAlerte"[^>]*\shidden>/);
  assert.match(s, /beforeinstallprompt/);
  // service worker-ul suitei rămâne cel care controlează pagina (scope ../ acoperă alerts/)
  assert.match(s, /serviceWorker\.register\('\.\.\/sw-app\.js/);
});
