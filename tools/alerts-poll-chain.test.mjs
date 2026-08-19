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
  assert.ok(/pollDataStale\(\)\)\s*\{[\s\S]{0,400}?px-sess closed/.test(HTML),
    'chip-ul de sesiune trebuie să arate vechimea în loc de RTH/PRE când datele sunt vechi');
});
