// 27.10.2026 (lotul A, I-747): proba de ecran (I-725) rulează AUTOMAT după fiecare publicare pe GitHub Pages: pe runnerul Linux (Chromium /
// Google Chrome, nu Edge), cu rezultatul scurt în health/generated/proba-ecran.json, Discord la roșu, Health îl arată. Aici: alegerea browserului,
// argumentele noi, așteptarea versiunii publicate (site-ul care servește încă versiunea veche ⇒ roșu, nu verde pe vechi), rezumatul pentru Health
// și forma workflow-ului.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { alegeBrowser, CANDIDATI_BROWSER, citesteArgumente, evalueaza, rezumatHealth, EDGE } from './proba-ecran-decizie.mjs';

const VER = '26.01.02.0304';
const pagina = (over = {}) => ({ id: 'today', ruta: 'today/', nume: 'Astăzi', continutMs: 1200, gataMs: 4100, plafon: false, plafonMs: 60000, erori: [], consoleErori: [], refuzuri: [], cereriEsuate: [], logErori: [], dialoguri: [], avertismente: [], elemente: [{ nume: 'x', selector: '#x', ok: true }], versiune: { carcasa: VER, publicata: VER }, ...over });
const raport = (over = {}) => ({ baza: 'https://exemplu.test/premarket_scanner.html/', pornit: '2026-10-27T20:00:00.000Z', durataMs: 151000, browser: 'Chrome/130.0', deschideri: [{ eticheta: 'prima', versiunePublicata: VER, suitaPublicata: 'tt-v985-2026-10-27', pagini: [pagina()] }, { eticheta: 'a doua', swAsteptat: true, versiunePublicata: VER, suitaPublicata: 'tt-v985-2026-10-27', pagini: [pagina({ continutMs: 800 })] }], ...over });

test('browserul: Edge pe Windows, altfel Chrome / Chromium din locurile obișnuite; calea dată (--browser / BROWSER) are întâietate și trebuie să existe', () => {
  assert.equal(CANDIDATI_BROWSER[0], EDGE, 'pe PC-ul lui rămâne Edge, ca până acum');
  assert.ok(CANDIDATI_BROWSER.includes('/usr/bin/google-chrome') && CANDIDATI_BROWSER.includes('/usr/bin/chromium'), 'runnerul GitHub (Ubuntu) are Google Chrome');
  assert.equal(alegeBrowser(null, (p) => p === EDGE), EDGE);
  assert.equal(alegeBrowser(null, (p) => p === '/usr/bin/google-chrome'), '/usr/bin/google-chrome');
  assert.equal(alegeBrowser('/opt/chrome/chrome', (p) => p === '/opt/chrome/chrome' || p === EDGE), '/opt/chrome/chrome');
  assert.throws(() => alegeBrowser('/nu/exista', () => false), /browserul dat nu există: \/nu\/exista/);
  assert.throws(() => alegeBrowser(null, () => false), /niciun Edge \/ Chrome \/ Chromium/);
});

test('argumentele noi: --browser, BROWSER din mediu, --fara-sandbox (runnerul CI), --rezumat, --asteapta-versiune', () => {
  const o = citesteArgumente([], {});
  assert.equal(o.browser, null); assert.equal(o.faraSandbox, false); assert.equal(o.rezumat, null); assert.equal(o.asteaptaVersiune, null);
  assert.equal(citesteArgumente([], { BROWSER: '/usr/bin/chromium' }).browser, '/usr/bin/chromium');
  const x = citesteArgumente(['--browser', '/usr/bin/google-chrome', '--fara-sandbox', '--rezumat=health/generated/proba-ecran.json', '--asteapta-versiune', '26.10.27.2100'], {});
  assert.equal(x.browser, '/usr/bin/google-chrome'); assert.equal(x.faraSandbox, true); assert.equal(x.rezumat, 'health/generated/proba-ecran.json'); assert.equal(x.asteaptaVersiune, '26.10.27.2100');
  assert.throws(() => citesteArgumente(['--asteapta-versiune', 'mâine'], {}), /--asteapta-versiune/);
});

test('site-ul care servește încă versiunea veche după așteptare ⇒ ROȘU (proba nu e „verde” pe versiunea de dinainte)', () => {
  assert.equal(evalueaza(raport({ asteptare: { ceruta: '26.10.27.2100', gasita: '26.10.27.2100', ms: 40000 } })).verdict, 'verde');
  const e = evalueaza(raport({ asteptare: { ceruta: '26.10.27.2100', gasita: VER, ms: 600000 } }));
  assert.equal(e.verdict, 'rosu'); assert.match(e.motive.join('\n'), /site-ul nu servește versiunea 26\.10\.27\.2100 după 10,0 min \(servește 26\.01\.02\.0304\)/);
});

test('rezumatul pentru Health: verdictul, versiunea, durata, paginile cu timpii celor două deschideri, motivele (plafonate), rularea', () => {
  const r = raport(), ev = evalueaza(r), s = rezumatHealth(r, ev, { rulare: 'https://github.com/x/y/actions/runs/1', commit: 'abcdef1234567890' });
  assert.equal(s.versiune, 'proba-ecran-v1'); assert.equal(s.verdict, 'verde'); assert.equal(s.la, '2026-10-27T20:00:00.000Z'); assert.equal(s.durataMs, 151000);
  assert.equal(s.versiunePublicata, VER); assert.equal(s.suitaPublicata, 'tt-v985-2026-10-27'); assert.equal(s.browser, 'Chrome/130.0');
  assert.deepEqual(s.pagini, [{ id: 'today', nume: 'Astăzi', ok: true, continut1: 1200, continut2: 800 }]);
  assert.equal(s.rulare, 'https://github.com/x/y/actions/runs/1'); assert.equal(s.commit, 'abcdef12');
  const rosu = raport({ deschideri: [{ eticheta: 'prima', versiunePublicata: VER, pagini: Array.from({ length: 60 }, (_, i) => pagina({ id: 'p' + i, nume: 'P' + i, erori: [{ mesaj: 'boom ' + i }] })) }] });
  const sr = rezumatHealth(rosu, evalueaza(rosu));
  assert.equal(sr.verdict, 'rosu'); assert.equal(sr.nMotive, 60); assert.equal(sr.motive.length, 20, 'fișierul publicat rămâne mic');
  assert.ok(JSON.stringify(sr).length < 20000);
  assert.ok(!/token=|apikey=/i.test(JSON.stringify(rezumatHealth(raport({ eroareProba: 'x' }), evalueaza(raport({ eroareProba: 'x' }))))));
});

test('workflow-ul proba-ecran.yml: după publicarea Pages (și la cerere), Chrome pe Ubuntu, doar la o versiune nouă, rezultatul în health/generated, Discord la roșu', () => {
  const y = readFileSync('.github/workflows/proba-ecran.yml', 'utf8');
  assert.match(y, /workflow_run:\s*\n\s*workflows: \["pages-build-deployment"\]\s*\n\s*types: \[completed\]/);
  assert.match(y, /workflow_dispatch:/);
  assert.match(y, /runs-on: ubuntu-latest/);
  assert.match(y, /node tools\/proba-ecran-decizie\.mjs[^\n]*--fara-sandbox[^\n]*--rezumat health\/generated\/proba-ecran\.json/);
  assert.match(y, /--asteapta-versiune/);
  assert.match(y, /git add health\/generated\/proba-ecran\.json/);
  assert.match(y, /DISCORD_WEBHOOK: \$\{\{ secrets\.DISCORD_WEBHOOK \}\}/);
  assert.match(y, /node-version: '24'/, 'proba folosește WebSocket-ul din Node ≥ 22');
  for (const m of y.matchAll(/uses: ([^\s]+)/g)) assert.match(m[1], /@[0-9a-f]{40}$/, 'acțiunile fixate pe SHA, ca în celelalte workflow-uri: ' + m[1]);
  assert.match(y, /concurrency:/);
  assert.ok(!/echo[^\n]*secrets\./.test(y), 'secretele nu se tipăresc');
});
