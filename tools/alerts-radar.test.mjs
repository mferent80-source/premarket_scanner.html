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
test('versiunea paginii e v116; workflow-ul nu mai verifica praguri, dar News Watch isi pastreaza cronul', () => {
  assert.match(HTML, /id="verBadge">v125</);
  const wf = readFileSync(join(ROOT, '.github/workflows/price-alerts.yml'), 'utf8');
  assert.ok(/^\s*schedule:/m.test(wf) && /cron:/.test(wf), 'cronul ramane pentru News Watch (alertele de stiri cu laptopul inchis)');
  assert.ok(!/run:\s*node tools\/check-alerts\.mjs/.test(wf), 'pasul cu pragurile de pret a disparut (comentariul de sus poate sa-l mai pomeneasca)');
  assert.ok(/run:\s*node tools\/check-news-watch\.mjs/.test(wf), 'News Watch ramane');
});
test('I-464: curatenia dupa praguri - fara bara de selectie in lot, fara modalul de editare, fara CSS-ul listei vechi', () => {
  for (const id of ['bulkBar', 'editModal', 'viewTools', 'pulseBar', 'almostRail']) assert.ok(!HTML.includes('id="' + id + '"'), id + ' trebuie sa dispara');
  for (const fn of ['function updateBulkBar(', 'function closeEditModal(', 'function saveEditModal(', 'function bulkSnooze', 'function bulkDelete']) assert.ok(!HTML.includes(fn), fn + ' trebuie sa dispara');
  const style = HTML.slice(HTML.indexOf('<style>'), HTML.indexOf('</style>'));
  for (const sel of ['.almost-rail', '.pulse-bar', '.filter-bar', '.al-desk', '.al-kpi', '.view-tools', '.add-opts', '.al-bot', '.bulk-bar', '.edit-modal', '.bulk-cb']) assert.ok(!style.includes(sel), 'CSS mort: ' + sel);
  assert.ok(style.includes('.alert-row'), 'Istoricul foloseste inca .alert-row - ramane');
});
test('sincronizarea cu GitHub vorbeste limba noua: lista de pe server se migreaza, semnatura e pe forma watch, alerts.json e migrat', () => {
  const i = HTML.indexOf('function serverToMap');
  assert.match(HTML.slice(i, i + 400), /migreazaListaLaSimboluri\(/, 'serverToMap trece prin migrare (altfel ⬇️ manual readuce praguri)');
  const j = HTML.indexOf('function alertsSig');
  const sig = HTML.slice(j, j + 500);
  assert.ok(!/ref\|/.test(sig) && /watch/.test(sig), 'semnatura e pe forma watch (simbol + notita), nu pe praguri');
  const json = JSON.parse(readFileSync(join(ROOT, 'tools/alerts.json'), 'utf8'));
  assert.ok(Array.isArray(json.alerts) && json.alerts.length > 0 && json.alerts.every(a => a.kind === 'watch' && !('level' in a) && !('pct' in a)), 'tools/alerts.json e in forma watch');
});
