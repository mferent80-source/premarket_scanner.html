#!/usr/bin/env node
// sync-suite-version.mjs — o SINGURĂ sursă de adevăr pentru versiunea suitei.
//
// De ce există: paginile înregistrau `sw-app.js?v=<versiune>`, iar versiunea o citeau din
// `window.SUITE_VERSION_SHORT`, adică din lib/suite-version.js — fișier aflat în PRECACHE și
// servit de SW-ul VECHI prin assetSWR (`ignoreSearch:true`, deci ignoră până și `?v=`).
// Versiunea veche decidea ce versiune se instalează ⇒ SW-ul vechi se auto-perpetua și
// fix-urile nu mai ajungeau la om (livrat tt-v773, pe ecran tt-v771).
//
// Regula pe care o impune scriptul: versiunea cu care se înregistrează SW-ul trebuie să fie
// un LITERAL în HTML. HTML-ul e network-first la orice SW, deci e mereu proaspăt — singurul
// loc din care cheia de invalidare nu poate fi otrăvită de cache-ul pe care îl invalidează.
//
//   node tools/sync-suite-version.mjs           propagă versiunea din sw-app.js peste tot
//   node tools/sync-suite-version.mjs --check   nu scrie nimic; iese 1 dacă ceva e desincronizat
//
// Sursa de adevăr = CACHE_VERSION din sw-app.js.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const GUARD_START = '<!-- tt:sw-guard:start -->';
const GUARD_END = '<!-- tt:sw-guard:end -->';

// Normalizare LF la citire ȘI la scriere. Pe Windows `core.autocrlf` pune CRLF pe disc,
// dar în git fișierele sunt LF; blocul de gardă se genera din template-uri, iar comparația
// „html !== before" ieșea mereu adevărată din simplă diferență de sfârșit de linie.
// Efect: `--check` pica permanent local (verde doar pe CI) — adică exact garda care
// trebuie să prindă „fix livrat, dar SW-ul vechi îl ține departe de om" devenea zgomot
// ignorabil. Comparația trebuie să fie despre VERSIUNE, nu despre CRLF.
const lf = s => s.replace(/\r\n/g, '\n');
const read = p => lf(readFileSync(p, 'utf8'));
const write = (p, s) => writeFileSync(p, lf(s));
const problems = [];
const fixed = [];

// ── sursa de adevăr ────────────────────────────────────────────────────────
const swAppPath = join(ROOT, 'sw-app.js');
const full = (read(swAppPath).match(/CACHE_VERSION\s*=\s*'(tt-v\d+-\d{4}-\d{2}-\d{2})'/) || [])[1];
if (!full) {
  console.error('✖ nu găsesc CACHE_VERSION în sw-app.js');
  process.exit(2);
}
const short = full.split('-').slice(0, 2).join('-');   // tt-v774

// ── 1. lib/suite-version.js ────────────────────────────────────────────────
const svPath = join(ROOT, 'lib', 'suite-version.js');
let sv = read(svPath);
const svBefore = sv;
sv = sv.replace(/SUITE_VERSION\s*=\s*'[^']*'/, `SUITE_VERSION = '${full}'`)
       .replace(/SUITE_VERSION_SHORT\s*=\s*'[^']*'/, `SUITE_VERSION_SHORT = '${short}'`);
if (sv !== svBefore) {
  if (CHECK) problems.push(`lib/suite-version.js nu e pe ${full}`);
  else { write(svPath, sv); fixed.push('lib/suite-version.js'); }
}

// ── 2. paginile care înregistrează SW-ul ───────────────────────────────────
function htmlFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === '.claude') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) htmlFiles(p, acc);
    else if (name.endsWith('.html')) acc.push(p);
  }
  return acc;
}

/** Blocul de auto-vindecare: dacă SW-ul activ e pe altă versiune, îl forțează și reîncarcă O DATĂ. */
function guardBlock(rel) {
  return `${GUARD_START}
<script>
/* GENERAT de tools/sync-suite-version.mjs — nu edita manual. */
(function () {
  var PAGE_VER = '${short}';
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('${rel}sw-app.js?v=' + PAGE_VER, { scope: '${rel}', updateViaCache: 'none' })
    .then(function (reg) {
      try { reg.update(); } catch (e) {}
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }).catch(function () {});
  var sw = navigator.serviceWorker.controller;
  if (!sw) return;                       // prima vizită: nu există SW vechi de corectat
  var ch = new MessageChannel();
  ch.port1.onmessage = function (e) {
    var v = (e.data && e.data.version) || '';
    if (v.indexOf(PAGE_VER + '-') === 0 || v === PAGE_VER) return;   // la zi
    var K = 'tt_swfix_' + PAGE_VER;      // o singură reîncărcare per versiune
    if (sessionStorage.getItem(K)) { console.warn('[sw-guard] SW vechi persistent:', v, '!=', PAGE_VER); return; }
    sessionStorage.setItem(K, '1');
    console.warn('[sw-guard] SW ' + v + ' != pagina ' + PAGE_VER + ' - fortez actualizarea');
    navigator.serviceWorker.addEventListener('controllerchange', function () { location.reload(); });
    navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg) return;
      try { reg.update(); } catch (e2) {}
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }).catch(function () {});
  };
  try { sw.postMessage({ type: 'GET_VERSION' }, [ch.port2]); } catch (e) {}
})();
</script>
${GUARD_END}`;
}

for (const file of htmlFiles(ROOT)) {
  const relPath = relative(ROOT, file).split(sep).join('/');
  let html = read(file);
  if (!/serviceWorker\.register\([^)]*sw-app\.js/.test(html)) continue;   // pagini pe sw.js legacy: nu le atingem
  const before = html;

  // (a) versiunea de înregistrare devine LITERAL — nu mai vine din fișierul cache-uit
  html = html.replace(/window\.SUITE_VERSION_SHORT\s*\|\|\s*'tt-v\d+'/g, `'${short}'`);
  html = html.replace(/(const|var|let)\s+(swVer|ver)\s*=\s*'tt-v\d+'\s*;/g, `$1 $2 = '${short}';`);
  html = html.replace(/const SW_VER_INLINE = 'tt-v\d+'/g, `const SW_VER_INLINE = '${short}'`);

  // (b) cache-bust real pe scriptul de versiune (fusese înghețat la ?v=756)
  html = html.replace(/(suite-version\.js\?v=)\d+/g, `$1${short.replace('tt-v', '')}`);

  // (c) blocul de auto-vindecare, actualizat sau inserat înainte de </body>
  const rel = /\/sw-app\.js/.test(html) && html.includes("'./sw-app.js") ? './' : '../';
  const block = guardBlock(rel);
  const gi = html.indexOf(GUARD_START);
  if (gi >= 0) {
    const ge = html.indexOf(GUARD_END, gi);
    if (ge > gi) html = html.slice(0, gi) + block + html.slice(ge + GUARD_END.length);
  } else {
    const bi = html.lastIndexOf('</body>');
    if (bi >= 0) html = html.slice(0, bi) + block + '\n' + html.slice(bi);
    else problems.push(`${relPath}: nu are </body>, blocul de gardă nu a putut fi inserat`);
  }

  if (html !== before) {
    if (CHECK) problems.push(`${relPath} nu e pe ${short}`);
    else { write(file, html); fixed.push(relPath); }
  }
}

// ── 3. cache-bust pe lib-urile din PRECACHE (data / poll-wake / price-day) ──
// Fără ?v= la CACHE_VERSION, SW-ul (ignoreSearch) ține data.js vechi — D.dropInflight
// lipsea pe Pages după tt-v779 pentru că HTML-ul cerea încă data.js?v=710.
const nnn = short.replace(/^tt-v/, '');
const LIB_SRC_RE = /src=(["'])([^"']*lib\/(?:data|poll-wake|price-day)\.js)(\?v=\d+)?\1/g;
for (const file of htmlFiles(ROOT)) {
  const relPath = relative(ROOT, file).split(sep).join('/');
  let html = read(file);
  const before = html;
  LIB_SRC_RE.lastIndex = 0;
  html = html.replace(LIB_SRC_RE, (_, q, path) => `src=${q}${path}?v=${nnn}${q}`);
  if (html !== before) {
    if (CHECK) problems.push(`${relPath} lib ?v= nu e pe ${nnn}`);
    else { write(file, html); if (!fixed.includes(relPath)) fixed.push(relPath); }
  }
}

// ── raport ─────────────────────────────────────────────────────────────────
if (CHECK) {
  if (problems.length) {
    console.error(`✖ versiuni desincronizate (sursa: sw-app.js = ${full}):`);
    problems.forEach(p => console.error('   · ' + p));
    console.error('\n  Rulează: node tools/sync-suite-version.mjs');
    process.exit(1);
  }
  console.log(`✅ toată suita e pe ${full}`);
} else {
  console.log(`versiune sursă: ${full} (${short})`);
  if (fixed.length) { console.log(`actualizate ${fixed.length}:`); fixed.forEach(f => console.log('   · ' + f)); }
  else console.log('nimic de actualizat — deja sincronizat');
  if (problems.length) { problems.forEach(p => console.error('⚠ ' + p)); process.exit(1); }
}
