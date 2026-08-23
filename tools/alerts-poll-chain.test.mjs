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
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const HTML = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'alerts', 'index.html'), 'utf8');
const PW = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'poll-wake.js'), 'utf8');
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
  assert.match(HTML, /PollWake\.bind/, 'alerts trezește poll-ul prin helperul comun');
  assert.match(PW, /visibilitychange/, 'lib/poll-wake.js re-armează la visibilitychange');
});

test('watchlist și nasdaq trezesc scan-ul prin PollWake', () => {
  const wlm = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'watchlist-monitor', 'index.html'), 'utf8');
  const nq = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'nasdaq-scanner', 'index.html'), 'utf8');
  assert.match(wlm, /poll-wake\.js/);
  assert.match(wlm, /PollWake\.bind/);
  assert.match(nq, /poll-wake\.js/);
  assert.match(nq, /PollWake\.bind/);
});

test('pump-radar și market-events trezesc poll-ul prin PollWake', () => {
  const pr = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'pump-radar', 'index.html'), 'utf8');
  const me = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'market-events', 'index.html'), 'utf8');
  assert.match(pr, /poll-wake\.js/);
  assert.match(pr, /PollWake\.bind/);
  assert.match(me, /poll-wake\.js/);
  assert.match(me, /PollWake\.bind/);
});

test('DATE VECHI pe pill sună o dată, nu la fiecare tick', () => {
  const fn = HTML.slice(HTML.indexOf('function paintPollHeartbeat'));
  const body = fn.slice(0, fn.indexOf('\nsetInterval'));
  assert.match(HTML, /let _staleBeeped/);
  assert.match(body, /_staleBeeped/);
  assert.match(body, /playBeep\(/);
});

test('pill-ul arată vârsta ultimului poll, nu intervalul 30s', () => {
  assert.match(HTML, /function paintPollHeartbeat/);
  assert.match(HTML, /LIVE · '\s*\+\s*ageTxt/, 'LIVE · 8s = vârsta poll-ului, nu cadența');
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
  assert.match(HTML, /staleSyms/, 'pill-ul trebuie să numere simbolurile vechi');
  assert.ok(/staleSyms\.length/.test(HTML) && /vechi/.test(HTML));
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

// ── v99: noaptea, ⏳ de 2 min acoperă IERI ───────────────────────────────────
// nyseClosed throttle = 10 min pe stocks US. symStale = 4×30s = 2 min.
// După primul poll reușit, chip-ul trecea pe ⏳ 4m și IERI (cotația de ieri, legitimă)
// dispărea — exact „procente de ieri pe stocks, EU/crypto par live".
test('IERI bate vechimea: un Δ din sesiunea precedentă nu e marcat ⏳', () => {
  const fn = HTML.slice(HTML.indexOf('function daySessChip'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  const iieri = body.indexOf('chgFromPrevDay');
  const istale = body.indexOf('symStale');
  assert.ok(iieri >= 0 && istale >= 0, 'daySessChip trebuie să aibă și IERI și stale');
  assert.ok(iieri < istale,
    'IERI trebuie ÎNAINTE de ⏳: noaptea poll-ul US e la 10min, stale e 2min, altfel IERI dispare');
});

test('banner unic pentru Δ de ieri pe stocks US, nu IERI pe fiecare rând', () => {
  assert.match(HTML, /id="usDayBanner"/, 'trebuie să existe bannerul deasupra listei Stocks');
  assert.match(HTML, /function renderUsDayBanner/);
  const fn = HTML.slice(HTML.indexOf('function daySessChip'), HTML.indexOf('function renderUsDayBanner'));
  assert.ok(/!isCrypto\(u\) && !u\.includes\('\.'\)\) return ''/.test(fn),
    'pe US, IERI se scoate de pe rând — rămâne bannerul');
});

test('noaptea, stocks US fără preț rămân în poll (throttle-ul 10min nu le sare)', () => {
  const i = HTML.indexOf('usStocks.length && nyseClosed()');
  assert.ok(i > 0, 'trebuie să existe ramura nyseClosed');
  const bloc = HTML.slice(i, i + 500);
  assert.ok(/_lastPrice/.test(bloc),
    'filter-ul de throttle trebuie să păstreze simbolurile US care n-au încă preț');
});

test('revenirea pe tab forțează trezirea poll-ului, nu un poll pe latch ocupat', () => {
  assert.match(HTML, /function resumePolling\(/, 'trebuie un resumePolling care rupe latch-ul hung');
  assert.match(HTML, /PollWake\.bind/, 'trezirea trece prin helper, nu prin pollPrices pe latch ocupat');
  assert.match(PW, /addEventListener\('pageshow'/,
    'pageshow (bfcache după sleep) trebuie să repornească lanțul — visibilitychange nu e suficient');
});

test('watchdog-ul eliberează latch-ul hung și când tab-ul e hidden', () => {
  const busyRel = PW.indexOf('setBusy(false)');
  const hiddenRet = PW.indexOf('document.hidden');
  assert.ok(busyRel >= 0, 'watchdog trebuie să elibereze latch-ul');
  assert.ok(hiddenRet >= 0 && busyRel < hiddenRet,
    'eliberarea latch-ului hung trebuie ÎNAINTE de return-ul pe document.hidden');
});

test('un ciclu cu fire-uri deja văzute tot marchează poll-ul ca reușit', () => {
  const i = HTML.indexOf('if (!fresh.length)');
  assert.ok(i > 0);
  const bloc = HTML.slice(i, i + 450);
  assert.ok(/_lastPollOkTs\s*=\s*Date\.now\(\)/.test(bloc),
    'return-ul early pe alreadyShownToday nu are voie să lase watchdog-ul să creadă că lanțul e mort');
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

// ── garda permanenta de versiune ────────────────────────────────────────────
// tools/sync-suite-version.mjs --check pica daca vreo pagina a ramas in urma. Rulat aici,
// desincronizarea devine un test rosu, nu un bug descoperit peste zile pe ecranul lui Marius.
test('toata suita e pe aceeasi versiune (sync-suite-version --check)', () => {
  const r = spawnSync('node', ['tools/sync-suite-version.mjs', '--check'],
    { cwd: join(dirname(fileURLToPath(import.meta.url)), '..'), encoding: 'utf8' });
  assert.strictEqual(r.status, 0,
    'versiuni desincronizate — ruleaza `node tools/sync-suite-version.mjs`:\n' + (r.stderr || r.stdout));
});

test('fiecare pagina cu SW isi ia versiunea dintr-un LITERAL, nu din fisierul cache-uit', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const guilty = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (name === '.git' || name === '.claude' || name === 'node_modules') continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.html')) {
        const h = readFileSync(p, 'utf8');
        // variabila cu care se inregistreaza efectiv SW-ul
        const reg = h.match(/register\((?:'|")[^'"]*sw-app\.js\?v=(?:'|")\s*\+\s*(\w+)/);
        if (!reg) continue;
        const v = reg[1];
        // ...si cum e definita: daca vine din SUITE_VERSION_SHORT, e in bucla
        const def = new RegExp('(?:const|var|let)\\s+' + v + '\\s*=\\s*([^;]+);');
        const d = h.match(def);
        if (d && /SUITE_VERSION_SHORT/.test(d[1]) && !/SW_VER_INLINE/.test(d[1])) {
          guilty.push(relative(root, p).split(sep).join('/'));
        }
      }
    }
  })(root);
  assert.deepStrictEqual(guilty, [],
    'aceste pagini isi iau versiunea de inregistrare din lib/suite-version.js, servit din cache de SW-ul VECHI');
});

test('sync-suite-version bustuiește data.js, poll-wake.js și price-day.js', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'sync-suite-version.mjs'), 'utf8');
  assert.match(src, /data\|poll-wake\|price-day/,
    'scriptul trebuie să rescrie ?v= pe data.js / poll-wake.js / price-day.js, nu doar pe suite-version.js');
});

test('toate src-urile lib/data.js|poll-wake.js|price-day.js au ?v= la CACHE_VERSION', () => {
  const nnn = (verOf(SWAPP).match(/tt-v(\d+)/) || [])[1];
  assert.ok(nnn, 'CACHE_VERSION trebuie să aibă număr');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const bad = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (name === '.git' || name === '.claude' || name === 'node_modules') continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.html')) {
        const h = readFileSync(p, 'utf8');
        const re = /src=["']([^"']*lib\/(?:data|poll-wake|price-day)\.js(?:\?v=\d+)?)["']/g;
        let m;
        while ((m = re.exec(h))) {
          if (!m[1].includes('?v=' + nnn)) {
            bad.push(relative(root, p).split(sep).join('/') + ' → ' + m[1]);
          }
        }
      }
    }
  })(root);
  assert.deepStrictEqual(bad, [],
    'aceste pagini servesc un lib cu ?v= înghețat — SW-ul păstrează inflight-ul vechi:\n' + bad.join('\n'));
});

test('fiecare pagina cu SW are blocul de auto-vindecare', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const missing = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (name === '.git' || name === '.claude' || name === 'node_modules') continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.html')) {
        const h = readFileSync(p, 'utf8');
        if (/serviceWorker\.register\([^)]*sw-app\.js/.test(h) && !h.includes('tt:sw-guard:start')) {
          missing.push(relative(root, p).split(sep).join('/'));
        }
      }
    }
  })(root);
  assert.deepStrictEqual(missing, [],
    'aceste pagini nu detecteaza un SW vechi si nu se pot repara singure');
});

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT 23.08.2026 — „feature scris, dar fără buton".
// batchAddAlerts + listWlSyms + listOpenJournalSyms existau întregi și nu le chema
// NIMIC: adăugarea în masă nu ajungea la om. Garda de mai jos cere ca fiecare funcție
// de acțiune să aibă un drum real până la un buton din pagină — „există în cod" nu e
// suficient, exact ca la butonul mort din feedback_buton_legat_inainte_sa_existe.
// ─────────────────────────────────────────────────────────────────────────────
const ALERTS_HTML = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'alerts', 'index.html'), 'utf8');

test('adaugarea in masa are buton in pagina, nu doar functie', () => {
  for (const id of ['btnBulkWl', 'btnBulkJournal']) {
    assert.ok(new RegExp(`<button[^>]*id="${id}"`).test(ALERTS_HTML),
      `${id} nu exista ca buton in HTML`);
    assert.ok(ALERTS_HTML.includes(`$('${id}')?.addEventListener`)
           || ALERTS_HTML.includes(`$('${id}').addEventListener`),
      `${id} exista dar nu e legat de niciun handler — buton mort`);
  }
  assert.match(ALERTS_HTML, /btnBulkWl[\s\S]{0,400}listWlSyms/,
    'butonul din watchlist trebuie sa cheme listWlSyms');
  assert.match(ALERTS_HTML, /btnBulkJournal[\s\S]{0,400}listOpenJournalSyms/,
    'butonul din jurnal trebuie sa cheme listOpenJournalSyms');
});

test('nicio functie de actiune nu ramane orfana in /alerts/', () => {
  const funcs = [...ALERTS_HTML.matchAll(/(?:async )?function (\w+)\s*\(/g)].map(m => m[1]);
  const orphans = [...new Set(funcs)].filter(f => {
    const uses = ALERTS_HTML.match(new RegExp('\\b' + f + '\\b', 'g')) || [];
    if (uses.length > 1) return false;
    return !ALERTS_HTML.includes(`(function ${f}(`);   // IIFE = se auto-executa
  });
  assert.deepStrictEqual(orphans, [],
    'functii definite si nechemate de nimeni (cod care nu ajunge la om):\n' + orphans.join('\n'));
});

test('adaugarea in masa nu raporteaza succes cand n-a adaugat nimic', () => {
  const i = ALERTS_HTML.indexOf('function batchAddAlerts');
  const body = ALERTS_HTML.slice(i, i + 1600);
  assert.match(body, /if \(!n\)/, 'cazul „zero adaugate" trebuie tratat separat');
  assert.ok(/if \(!n\)[\s\S]{0,300}return;/.test(body),
    'la zero adaugate nu trebuie sa persiste si sa sincronizeze degeaba');
  assert.ok(body.indexOf('if (!n)') < body.indexOf("'success'"),
    'toast-ul de succes trebuie sa vina DUPA iesirea pe zero — altfel „✅ 0 alerte adaugate"');
});

test('adaugarea in masa nu dubleaza o alerta care exista deja', () => {
  const i = ALERTS_HTML.indexOf('function bulkRefFactory');
  const body = ALERTS_HTML.slice(i, i + 500);
  assert.match(body, /kind === 'ref'/, 'factory trebuie sa se uite la referintele existente');
  assert.match(body, /return null/, 'si sa refuze simbolul deja urmarit');
});

test('scrierile de preferinte nu pot rupe UI-ul cand localStorage e plin', () => {
  const risky = [];
  const lines = ALERTS_HTML.split('\n');
  lines.forEach((l, i) => {
    if (!/localStorage\.setItem/.test(l)) return;
    if (/try\s*\{/.test(l)) return;                          // protejat pe aceeasi linie
    // sau intr-un bloc try deschis mai sus si inca neinchis (retry dupa curatare de quota)
    let open = false;
    for (let k = Math.max(0, i - 6); k < i; k++) {
      if (/try\s*\{/.test(lines[k])) open = true;
      else if (/^\s*\}\s*catch/.test(lines[k])) open = false;
    }
    if (open) return;
    risky.push(`L${i + 1}: ${l.trim().slice(0, 80)}`);
  });
  assert.deepStrictEqual(risky, [],
    'QuotaExceededError aici sare peste render()/toast() si butonul pare mort:\n' + risky.join('\n'));
});
