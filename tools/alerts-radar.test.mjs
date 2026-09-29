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
  assert.match(HTML, /id="verBadge">v138</);
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
// v134 (29.09, botul PUMPFUN): Binance nu cunoaște PUMPFUNUSDT (400), tickerul real e PUMP -> lumânarea zilnică se cere după b.m (poza v101.5)
test('v134: prețul live al botului se cere de la Binance după moneda reală a bursei (b.m), cu rezerva numele botului', () => {
  assert.match(HTML, /String\(b\.m \|\| b\.s \|\| ''\)\.toUpperCase\(\)\.replace\(\/\[\^A-Z0-9\]\/g, ''\)/);
});
// v135 (el, 29.09: „de ce nu se sincronizează pagina alerts cu GitHub?”): tokenul salvat avea doar dreptul „gist” -> GET merge (repo
// public), PUT e refuzat (404/403); auto-sync-ul scria doar in consola, deci ultima urcare reusita era din 08.09 si nimeni nu stia
test('v135: urcarea refuzată spune că tokenul n-are drept de scriere, iar auto-sync-ul eșuat se vede pe ecran (o dată), nu doar în consolă', () => {
  assert.match(HTML, /if \(p\.status === 401 \|\| p\.status === 403 \|\| p\.status === 404\) throw new Error\('tokenul poate citi, dar nu are voie să scrie/);
  assert.match(HTML, /if \(!_syncAvertizat\) \{ _syncAvertizat = true; toast\('☁️ Alertele NU se mai salvează pe GitHub: ' \+ e\.message, 'error'/);
});
// v136 (el, 29.09: „nu găsesc” - tokenul se punea DOAR prin click-dreapta pe ☁️, în meniul ⋯; pe telefon click-dreapta nu există)
test('v136: meniul ⋯ are butonul vizibil „Pune tokenul GitHub”, care deschide pagina GitHub precompletată și apoi urcă lista', () => {
  assert.match(HTML, /<button id="ghTokenBtn"[^>]*>🔑<\/button><span class="hm-lbl">Pune tokenul GitHub<\/span>/);
  assert.match(HTML, /const GH_TOKEN_NOU = 'https:\/\/github\.com\/settings\/personal-access-tokens\/new\?[^']*contents=write/);
  assert.match(HTML, /\$\('ghTokenBtn'\)\.addEventListener\('click'/);
  assert.doesNotMatch(HTML, /click-dreapta pe ☁️'\)/, 'mesajele de eroare nu mai trimit la click-dreapta');
  assert.match(HTML, /⋯ → 🔑 Pune tokenul GitHub/);
});
// v137 (el, 29.09: „am făcut dar nu văd caseta”): tokenul se cerea cu prompt() chiar când GitHub se deschidea în altă filă -
// browserul închide singur dialogul unei file din fundal (prompt -> null). Acum caseta e ÎN pagină și rămâne până la Salvează.
test('v137: tokenul GitHub se pune într-o casetă din pagină (nu prompt), deschisă de 🔑 și de „+ Token”; Salvează urcă lista', () => {
  assert.match(HTML, /<div id="ghTokBox" class="gh-tok-box" hidden>/);
  assert.match(HTML, /<input id="ghTokInput" type="password"/);
  assert.match(HTML, /<button type="button" id="ghTokSave">Salvează și urcă lista<\/button>/);
  assert.match(HTML, /\.gh-tok-box\[hidden\] *\{ *display: *none/, 'hidden nu e bătut de display din CSS');
  assert.match(HTML, /\$\('ghTokenBtn'\)\.addEventListener\('click', \(\) => \{[\s\S]{0,120}ghTokArata\(true\)/);
  assert.match(HTML, /\$\('syncBannerToken'\)\?\.addEventListener\('click', \(\) => \{ ghTokArata\(/);
  const h = HTML.slice(HTML.indexOf("$('ghTokenBtn').addEventListener('click'"), HTML.indexOf("$('ghTokenBtn').addEventListener('click'") + 400);
  assert.doesNotMatch(h, /ghAskToken\(/, '🔑 nu mai folosește prompt()');
});
