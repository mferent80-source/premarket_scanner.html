// alerts-radar.test.mjs — pagina alerts (v116): fara praguri, cu modulele Radar legate, versiunile sincronizate.
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(ROOT, 'alerts/index.html'), 'utf8'), SW = readFileSync(join(ROOT, 'sw-app.js'), 'utf8');

test('pragurile au disparut din formular si din randuri', () => {
  for (const id of ['inpThr', 'inpKind', 'inpTarget', 'inpStop', 'inpDir', 'btnAdv', 'wrapKind', 'wrapDir']) assert.ok(!HTML.includes('id="' + id + '"'), id + ' trebuie sa dispara');
  assert.ok(!/function rowHtml\(/.test(HTML), 'randul vechi cu prag nu se mai randeaza');
  assert.ok(!/renderAlmostRail\(|renderPulse\(/.test(HTML), 'railul "aproape de prag" si pulsul pragurilor au disparut');
  assert.ok(HTML.includes('id="inpSym"') && HTML.includes('id="inpNote"') && HTML.includes('id="btnAdd"'), 'adaugarea ramane: simbol + notita');
});
test('modulele Radar sunt legate, cu cache-bust pe versiunea suitei', () => {
  const v = (SW.match(/CACHE_VERSION = 'tt-v(\d+)/) || [])[1];
  assert.ok(v, 'CACHE_VERSION in sw-app.js');
  for (const f of ['lib/radar-ui.css', 'lib/radar-poza.js', 'lib/radar-ecran.js']) { assert.ok(HTML.includes('../' + f + '?v=' + v), f + ' legat cu ?v=' + v); assert.ok(SW.includes("'./" + f + "'"), f + ' in precache'); }
  assert.ok(HTML.includes('id="rad"'), 'containerul .rad exista'); assert.ok(HTML.includes('class="rad"'));
});
test('lista se migreaza la simboluri (kind watch) si sincronizarea scrie doar simbol + notita', () => {
  assert.match(HTML, /function migreazaListaLaSimboluri\(/); assert.match(HTML, /kind:\s*'watch'/);
  const i = HTML.indexOf('function alertToJson');
  assert.ok(i > 0, 'alertToJson exista');
  const corp = HTML.slice(i, i + 800);
  assert.match(corp, /kind:\s*'watch'/, 'alertToJson scrie kind watch');
  assert.ok(!/level:\s*a\.lvl/.test(corp), 'fara nivel de prag in JSON');
});
test('polling-ul ramane (gardile vechi) dar nu mai evalueaza praguri', () => {
  assert.match(HTML, /function pollPrices\(/); assert.match(HTML, /try\s*\{\s*await pollPrices\(\);\s*\}\s*catch/);
  assert.ok(!/function evaluateAlert\(|function checkTrigger\(|fireAlert\(/.test(HTML), 'evaluarea pragurilor a fost scoasa');
});
test('versiunea paginii e v116 si workflow-ul pragurilor e oprit', () => {
  assert.match(HTML, /id="verBadge">v116</);
  const wf = readFileSync(join(ROOT, '.github/workflows/price-alerts.yml'), 'utf8');
  assert.ok(!/^\s*schedule:/m.test(wf) && /workflow_dispatch/.test(wf), 'price-alerts.yml: fara cron, doar pornire manuala');
});
