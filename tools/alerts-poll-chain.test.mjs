// alerts-poll-chain.test.mjs — regresie pentru „pagina arată procentele de IERI".
//
// 19.08.2026: lanțul de poll din alerts/index.html se re-arma DIN INTERIORUL callback-ului:
//     setTimeout(async () => { await pollPrices(); schedulePoll(); }, POLL_INTERVAL_MS)
// iar pollPrices() avea `try { … } finally { … }` fără `catch`. O singură excepție
// tranzitorie ⇒ `schedulePoll()` nu se mai executa ⇒ polling MORT definitiv, tăcut.
// Pagina rămânea cu prețurile ultimei runde reușite (dimineața: close-ul și Δ-ul de IERI
// pe stocks US), în timp ce chip-ul de sesiune, recalculat la fiecare render, arăta „RTH".
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HTML = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'alerts', 'index.html'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Lanț de poll ca în pagină. `guarded` = varianta cu try/catch (cea reparată). */
function makeChain({ guarded, failOn }) {
  const state = { ticks: 0, timer: null, stopped: false };
  const poll = async () => { state.ticks++; if (state.ticks === failOn) throw new Error('eroare tranzitorie'); };
  const schedule = () => {
    if (state.timer) clearTimeout(state.timer);
    if (state.stopped) return;
    state.timer = setTimeout(() => {
      // `p.catch` de mai jos ține doar test runner-ul liniștit; NU repară nimic —
      // în varianta nepăzită `schedule()` rămâne tot inaccesibil după excepție,
      // exact ca în browser, unde rejection-ul ajunge doar în consolă.
      const p = (async () => {
        if (guarded) { try { await poll(); } catch (e) { /* înghițită */ } }
        else { await poll(); }
        schedule();
      })();
      p.catch(() => {});
    }, 10);
  };
  state.stop = () => { state.stopped = true; if (state.timer) clearTimeout(state.timer); };
  schedule();
  return state;
}

test('lanțul NEPĂZIT moare la prima excepție (bug-ul original)', async () => {
  const c = makeChain({ guarded: false, failOn: 3 });
  await sleep(200);
  c.stop();
  assert.strictEqual(c.ticks, 3, 'fără try/catch lanțul se oprește exact la runda care aruncă');
});

test('lanțul PĂZIT supraviețuiește excepției și continuă', async () => {
  const c = makeChain({ guarded: true, failOn: 3 });
  await sleep(200);
  c.stop();
  assert.ok(c.ticks > 6, `lanțul păzit trebuie să treacă peste eroare (a făcut ${c.ticks} runde)`);
});

test('pagina re-armează poll-ul chiar dacă ciclul aruncă', () => {
  assert.match(HTML, /try\s*\{\s*await pollPrices\(\);\s*\}\s*catch/,
    'schedulePoll trebuie să apeleze pollPrices în try/catch');
});

test('pagina are watchdog care repornește un lanț mort', () => {
  assert.ok(/POLL_STALE_MS/.test(HTML) && /watchdog/i.test(HTML),
    'trebuie să existe un watchdog independent de lanțul de poll');
  assert.match(HTML, /function pollDataStale\(\)/, 'trebuie să existe verificarea de prospețime');
});

test('revenirea pe tab re-armează lanțul, nu doar un poll unic', () => {
  const vis = HTML.slice(HTML.indexOf("addEventListener('visibilitychange'"));
  const bloc = vis.slice(0, 600);
  assert.ok(bloc.includes('schedulePoll()'),
    'la visibilitychange trebuie re-armat timerul (altfel pagina reîngheață după un singur refresh)');
});

test('UI-ul nu mai scrie „LIVE" peste date vechi', () => {
  assert.match(HTML, /DATE VECHI/, 'pill-ul de status trebuie să semnaleze datele înghețate');
  assert.ok(/if \(stale\) \{[\s\S]{0,400}?px-sess closed/.test(HTML),
    'chip-ul de sesiune trebuie să arate vechimea în loc de RTH/PRE când datele sunt vechi');
});

// ── v97: prospețime PER SIMBOL ──────────────────────────────────────────────
// Marcajul global din v96 nu prindea cazul „ciclul se încheie cu succes, dar fetch-ul
// pică fix pe stocks-urile US": `_lastChange[sym]` păstra Δ-ul de ieri la nesfârșit,
// iar chip-ul arăta „RTH". De aici „arată date de ieri, dar doar pe stocks".

test('pagina ține minte ultima reușită a FIECĂRUI simbol', () => {
  assert.match(HTML, /const _lastOkTs = \{\}/, 'trebuie să existe registrul per simbol');
  assert.match(HTML, /_lastOkTs\[sym\] = Date\.now\(\)/, 'se scrie când simbolul chiar primește preț');
  assert.match(HTML, /function symStale\(sym\)/, 'trebuie să existe verificarea per simbol');
});

test('chip-ul de sesiune se uită la vechimea simbolului, nu doar la cea globală', () => {
  const fn = HTML.slice(HTML.indexOf('function daySessChip'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.ok(body.includes('symStale(sym)'), 'daySessChip trebuie să întrebe symStale');
  assert.ok(body.indexOf('symStale') < body.indexOf('isCrypto(u)) return'),
    'verificarea de vechime trebuie făcută ÎNAINTE de ieșirile scurte (crypto/EU)');
});

test('hidratarea din cache păstrează vechimea reală, nu „acum"', () => {
  assert.match(HTML, /_lastOkTs\[sym\] = e\.ts \|\| 0/,
    'un preț pictat din cache nu are voie să pară proaspăt');
});

test('bara de refresh spune CARE simboluri n-au primit preț', () => {
  assert.match(HTML, /fără preț: \$\{det\}/, 'trebuie listate numele, nu doar numărul');
  assert.ok(/const miss = unique\.filter\(s => prices\[s\] == null\)/.test(HTML));
});

test('pill-ul semnalează și „ciclul merge, dar N simboluri sunt înghețate"', () => {
  assert.match(HTML, /_staleSyms/, 'pill-ul trebuie să numere simbolurile vechi');
  assert.ok(/simbol\$\{_staleSyms\.length > 1 \? 'uri' : ''\} vechi/.test(HTML));
});

// ── v98: Δ-ul își declară ZIUA ───────────────────────────────────────────────
// Două găuri prin care un Δ vechi ajungea pe ecran nemarcat, cu poll-ul funcțional:
//  (a) prețul se actualiza dar `changes` nu se scria (prev invalid) => preț de azi lângă
//      procent de ieri, pe care v97 îl considera proaspăt fiindcă prețul intrase;
//  (b) cu piața US închisă, Yahoo întoarce legitim sesiunea PRECEDENTĂ — corect ca dată,
//      dar afișat drept „Δ azi" lângă chip-ul de sesiune curentă.
const PD = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'price-day.js'), 'utf8');

test('price-day întoarce momentul real al cotației', () => {
  assert.match(PD, /ts: ts/, 'yahooQuote trebuie să întoarcă ts');
  assert.match(PD, /m\.regularMarketTime \* 1000/, 'ts vine din regularMarketTime');
  assert.match(PD, /q\.ts = lt \* 1000/, 'fallback pe ultima bară când meta n-are ora');
});

test('Δ are prospețimea LUI, separată de a prețului', () => {
  assert.match(HTML, /const _lastChgTs = \{\}/, 'trebuie să existe registrul de vechime a Δ');
  assert.match(HTML, /_lastChgTs\[sym\] = quoteTs\[U\] \|\| Date\.now\(\)/,
    'Δ se ștampilează cu momentul COTAȚIEI, nu al fetch-ului');
});

test('Δ dintr-o sesiune precedentă e marcat „IERI", nu prezentat ca Δ azi', () => {
  assert.match(HTML, /function chgFromPrevDay\(sym\)/);
  assert.ok(/chgFromPrevDay\(sym\)\)\s*\{[\s\S]{0,400}?>IERI</.test(HTML),
    'chip-ul trebuie să scrie IERI când cotația nu e din ziua ET curentă');
});

test('cache-ul păstrează momentul cotației, nu doar pe cel al salvării', () => {
  assert.match(HTML, /q: Number\.isFinite\(qts\) \? qts : now/, 'se salvează ts-ul cotației');
  assert.match(HTML, /sameEtDay\(e\.q \|\| e\.ts\)/,
    'la hidratare se compară ziua COTAȚIEI — altfel un Δ de ieri salvat azi trecea drept „azi"');
});

test('logica de zi: o cotație de ieri nu e „azi"', () => {
  const etDayKey = ts => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
  const sameEtDay = ts => etDayKey(ts) === etDayKey(Date.now());
  assert.ok(sameEtDay(Date.now()), 'acum = ziua curentă');
  assert.ok(!sameEtDay(Date.now() - 30 * 3600 * 1000), 'acum 30h = altă zi de bursă');
});

// ── v98b: bucla de update a SW-ului ─────────────────────────────────────────
// `sw-app.js` se inregistreaza ca `sw-app.js?v=<versiune>`, iar versiunea venea din
// lib/suite-version.js — fisier din PRECACHE, servit de SW-ul VECHI prin assetSWR
// (`ignoreSearch:true`, deci pana si `?v=` era ignorat). Versiunea veche decidea ce
// versiune se instaleaza => SW-ul vechi se auto-perpetua. Simptom: pagina livrata la
// tt-v773, dar badge-ul suitei ramanea tt-v771 si fix-urile nu ajungeau la om.
const SWAPP = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'sw-app.js'), 'utf8');
const SUITEV = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'suite-version.js'), 'utf8');
const verOf = s => (s.match(/tt-v\d+-\d{4}-\d{2}-\d{2}/) || [])[0];

test('sw-app.js si lib/suite-version.js sunt pe ACEEASI versiune', () => {
  assert.ok(verOf(SWAPP), 'sw-app.js trebuie sa aiba CACHE_VERSION');
  assert.strictEqual(verOf(SUITEV), verOf(SWAPP),
    'desincronizate: badge-ul suitei si cheia de inregistrare a SW-ului ar arata versiuni diferite');
});

test('alerts inregistreaza SW-ul cu o versiune din HTML, nu din fisierul cache-uit', () => {
  const m = HTML.match(/const SW_VER_INLINE = '(tt-v\d+)'/);
  assert.ok(m, 'trebuie sa existe constanta inline (HTML-ul e network-first, deci mereu proaspat)');
  assert.ok(verOf(SWAPP).startsWith(m[1] + '-'),
    `SW_VER_INLINE (${m[1]}) trebuie sa fie versiunea curenta din sw-app.js (${verOf(SWAPP)})`);
  assert.match(HTML, /SW_VER_INLINE \|\| window\.SUITE_VERSION_SHORT/,
    'constanta inline trebuie sa aiba prioritate fata de fisierul din cache');
});

test('SW-ul nu mai serveste fisierul de versiune din cache', () => {
  // prima aparitie e in PRECACHE; ne intereseaza cea din handler-ul fetch
  const i = SWAPP.lastIndexOf('suite-version');
  assert.ok(i > 0, 'sw-app.js trebuie sa trateze explicit suite-version.js');
  assert.ok(SWAPP.slice(Math.max(0, i - 200), i + 200).includes('htmlNetworkFirst'),
    'lib/suite-version.js trebuie servit network-first, nu prin assetSWR');
});

test('pagina cere predarea stafetei daca SW-ul activ e mai vechi', () => {
  assert.match(HTML, /reg\.waiting\.postMessage\(\{ type: 'SKIP_WAITING' \}\)/);
  assert.match(HTML, /reg\.update\(\)/);
});
