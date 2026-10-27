// 27.10.2026 (I-756, audit E Y3 / Y4 / Y6 / B12): pagina Alerte fără token GitHub în browser — starea (lista + News Watch) se urcă și se
// citește prin releul deck-relay; Discord pentru News îl trimite robotul cât rulează (pagina doar arată); pragurile moarte și promisiunile
// despre „alerte server-side” ies din pagină.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HTML = readFileSync('alerts/index.html', 'utf8');
test('nicio scriere directă pe GitHub din browser: fără token salvat, fără api.github.com; tokenul vechi e scos din localStorage o dată', () => {
  assert.doesNotMatch(HTML, /api\.github\.com\/repos/, 'pagina nu mai cheamă Contents API');
  assert.doesNotMatch(HTML, /localStorage\.setItem\(GH_TOKEN/);
  assert.doesNotMatch(HTML, /function ghAskToken/);
  assert.match(HTML, /GH_TOKEN_VECHI = 'gh_repo_token'/); assert.match(HTML, /localStorage\.removeItem\(GH_TOKEN_VECHI\)/);
  assert.match(HTML, /releuCerere\('POST', 'alerts', \{ alerts \}\)/); assert.match(HTML, /releuCerere\('POST', 'news-watch', nwPayloadForServer\(\)\)/);
  assert.match(HTML, /releuCerere\('GET', 'alerts'\)/); assert.match(HTML, /releuCerere\('GET', 'news-watch'\)/);
  assert.match(HTML, /'X-Alerte-Cheie': c\.cheie/); assert.match(HTML, /\/alerte\/stare/);
  assert.match(HTML, /<input id="ghRelUrl"/); assert.doesNotMatch(HTML, /id="ghTokLink"/);
});
test('News pe Discord: cât robotul rulează (ultima rulare < 6 h) pagina nu mai trimite fazele de rezultate și știrile mari; ce trimite poartă eticheta', () => {
  assert.match(HTML, /function nwBotActiv\(\) \{[^\n]*lastRun[^\n]*6 \* 3600e3/);
  const unu = HTML.slice(HTML.indexOf('async function nwCheckOne('), HTML.indexOf('async function nwCheckAll('));
  assert.equal((unu.match(/TG\.send\(/g) || []).length, 2); assert.equal((unu.match(/!nwBotActiv\(\)/g) || []).length, 2, 'ambele trimiteri sunt păzite');
  assert.equal((unu.match(/neverificat de om/g) || []).length, 2);
  assert.match(HTML, /await nwReimprospateazaServer\(\)/, 'starea robotului și ce a văzut el se citesc înaintea verificărilor');
});
test('codul mort și promisiunile vechi au ieșit: evaluarea pragurilor, „cron */5”, exportul care promitea Telegram la 15 min, istoricul „local + server”', () => {
  const poll = HTML.slice(HTML.indexOf('async function pollPrices('), HTML.indexOf('function resumePolling('));
  assert.ok(poll.length > 100, 'pollPrices găsit');
  for (const re of [/a\.kind === 'anchor'/, /a\.kind === 'ref'/, /fired\.push/, /REARM_HYST/]) assert.doesNotMatch(poll, re);
  assert.doesNotMatch(HTML, /cron \*\/5/); assert.doesNotMatch(HTML, /le verifică la 15 min și trimite pe Telegram/); assert.doesNotMatch(HTML, /merg 24\/7, server-side/);
  assert.doesNotMatch(HTML, /merg și cu laptopul închis/); assert.doesNotMatch(HTML, /ultimele 50 · local \+ server/);
});
