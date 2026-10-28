// 28.10.2026 (I-776) — „se încarcă foarte greu paginile în app” (Marius). Portofoliul executa la fiecare deschidere ≈630 KB de modele AI (55 de
// scripturi) ÎNAINTE să deseneze lista. Acum lista se desenează întâi; modelele vin după primul cadru (învățarea automată și fereastra de notare
// rămân) sau pe loc la o atingere pe „Analiză” / „Modele AI” / „Calculează verdict AI” / „Rapoarte”. Pagina cheamă doar HoldingsNeuralUI și
// HoldingsVerdictUI înainte de încărcare ⇒ locțiitori în lib/holdings-modele-la-cerere.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const HTML = readFileSync('holdings/index.html', 'utf8');
const scripturi = [...HTML.matchAll(/<script\b([^>]*)>/g)].map((m) => ({ src: /src="([^"?]+)/.exec(m[1])?.[1] || null, laCerere: /type="text\/x-la-cerere"/.test(m[1]), grup: /data-grup="([^"]+)"/.exec(m[1])?.[1] || null }));
// rămân la deschidere: lib/holdings-verdict.js (scan() — amprenta barelor; lib/holding-roster.js) și registrul prospectiv (forecast, -storage, -monitor,
// decision-validation; ≈47 KB), pe care panoul de decizie din <head> (decision-panel.js + decision-verdict.js) îl citește la PRIMA desenare (`peekCandidate`)
const EAGER_IN_BLOC = ['../lib/holdings-verdict.js', '../lib/holdings-forecast.js', '../lib/holdings-forecast-storage.js', '../lib/holdings-forecast-monitor.js', '../lib/decision-validation.js'];

test('pagina: tot blocul de modele (de la lib/holdings-neural.js la performance.js) e `type="text/x-la-cerere" data-grup="modele"`, în afara celor cerute la deschidere; nucleul paginii rămâne executabil', () => {
  const srcs = scripturi.map((s) => s.src), de = srcs.indexOf('../lib/holdings-neural.js'), pana = srcs.indexOf('performance.js');
  assert.ok(de > 0 && pana > de, 'blocul există în pagină, în aceeași ordine');
  const bloc = scripturi.slice(de, pana + 1);
  assert.ok(bloc.length >= 50, 'blocul are ~53 de scripturi: ' + bloc.length);
  for (const s of bloc) {
    if (EAGER_IN_BLOC.includes(s.src)) assert.equal(s.laCerere, false, s.src + ' se execută la deschidere');
    else { assert.equal(s.laCerere, true, s.src + ' trebuie încărcat la cerere'); assert.equal(s.grup, 'modele', s.src); }
  }
  for (const s of scripturi) if (!bloc.includes(s)) assert.equal(s.laCerere, false, 'în afara blocului nimic nu e la cerere: ' + s.src);
  const laCerere = scripturi.filter((s) => s.laCerere).map((s) => s.src);
  for (const f of ['../lib/holdings-neural.js', 'hmm.js', 'garch.js', 'knn.js', 'classifier.js', 'quantile.js', 'isolation.js', 'forecast.js', 'neural.js', 'verdict.js', 'learning.js', 'performance.js', 'strategy.js', 'account-risk.js', 'forecast-monitor.js', '../lib/holdings-model-runner.js', '../lib/holdings-verdict-diagnostics.js']) assert.ok(laCerere.includes(f), f + ' la cerere');
  for (const f of ['holdings.js', 'roster.js', 'layout.js', 'brief.js', 'workbench.js', 'management.js', 'regimes.js', '../lib/holdings-notes.js', '../lib/stop-setter.js', '../lib/analysis-vault.js', '../lib/holdings-asociere.js', ...EAGER_IN_BLOC]) assert.ok(srcs.includes(f) && !laCerere.includes(f), f + ' rămâne la deschidere');
});

test('pagina: încărcătorul și locțiitorii stau înaintea blocului și înaintea paginii; fișierele atinse au `?v=` nou', () => {
  const i = (s) => HTML.indexOf('src="' + s);
  assert.ok(i('../lib/scripturi-la-cerere.js') > 0 && i('../lib/scripturi-la-cerere.js') < i('../lib/holdings-modele-la-cerere.js'));
  assert.ok(i('../lib/holdings-modele-la-cerere.js') < i('../lib/holdings-neural.js'), 'locțiitorii înaintea blocului');
  assert.ok(i('../lib/holdings-modele-la-cerere.js') < i('roster.js') && i('../lib/holdings-modele-la-cerere.js') < i('holdings.js?'), 'înaintea paginii');
  const v = /src="holdings\.js\?v=([^"]+)"/.exec(HTML)[1];
  assert.ok(v > '26.10.28.1136', 'holdings.js are versiune nouă: ' + v);
  assert.match(HTML, /src="\.\.\/lib\/scripturi-la-cerere\.js\?v=\d{2}\.\d{2}\.\d{2}\.\d{4}"/); assert.match(HTML, /src="\.\.\/lib\/holdings-modele-la-cerere\.js\?v=\d{2}\.\d{2}\.\d{2}\.\d{4}"/);
});

// ── locțiitorii, pe lib/holdings-modele-la-cerere.js REAL ──────────────────────────────────────────────────────────────────────────────────
function mediu({ esueaza = false } = {}) {
  const ascultatori = [], hosts = [], apeluri = { incarca: 0, raf: 0 };
  const realN = { setContext: [], bind: 0, run: [] }, realV = { open: [], setContext: [] };
  const ctx = {
    console, Promise, Error, Array, Object, String, setTimeout,
    requestAnimationFrame(fn) { apeluri.raf++; setTimeout(fn, 0); },
    document: { addEventListener(tip, fn, capture) { ascultatori.push({ tip, fn, capture }); }, querySelectorAll(sel) { return sel === '[data-neural-host]' ? hosts : []; } },
    ScripturiLaCerere: { incarca(grup) { assert.equal(grup, 'modele'); apeluri.incarca++; return new Promise((res, rej) => setTimeout(() => {
      if (esueaza) return rej(new Error('Scriptul nu s-a încărcat: hmm.js?v=1'));
      // ca neural.js / verdict.js reale: redefinesc globalele
      ctx.HoldingsNeuralUI = { setContext: (c) => realN.setContext.push(c), bind: () => realN.bind++, refresh() {}, inspect: () => ({ usable: true }), busy: () => false, run: (p, o) => { realN.run.push([p, o]); return Promise.resolve({ state: 'ready' }); } };
      ctx.HoldingsVerdictUI = { setContext: (c) => realV.setContext.push(c), open: (t) => realV.open.push(t), busy: () => false, refresh() {} };
      res(['a.js']);
    }, 2)); } },
  };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(readFileSync('lib/holdings-modele-la-cerere.js', 'utf8'), ctx, { filename: 'lib/holdings-modele-la-cerere.js' });
  const click = (atribute) => { const el = { getAttribute: (k) => atribute[k] ?? null, hasAttribute: (k) => k in atribute }; const tinta = { closest: (sel) => (sel.split(',').some((s) => { const m = /\[([a-z-]+)(?:="([^"]+)")?\]/.exec(s.trim()); return m && m[1] in atribute && (m[2] == null || atribute[m[1]] === m[2]); }) ? el : null) }; for (const a of ascultatori.filter((a) => a.tip === 'click')) a.fn({ target: tinta }); };
  const asteapta = (ms = 10) => new Promise((r) => setTimeout(r, ms));
  return { ctx, ascultatori, hosts, apeluri, realN, realV, click, asteapta };
}

test('înainte de încărcare: HoldingsNeuralUI.card dă gazda cu „se încarcă”, inspect/busy/bind/refresh sunt inofensive; HoldingsVerdictUI există', () => {
  const { ctx } = mediu();
  const N = ctx.HoldingsNeuralUI, V = ctx.HoldingsVerdictUI;
  assert.ok(N && V && ctx.HoldingsModeleLaCerere, 'locțiitorii și intrarea publică există');
  assert.match(N.card({ ticker: 'TE' }, 3), /^<div data-neural-host="3">.*Modelele AI se încarcă…/);
  assert.deepEqual(N.inspect({}).usable, false); assert.equal(N.busy(), false); assert.equal(V.busy(), false);
  N.bind(); N.refresh(); V.refresh(); V.close();
  assert.equal(ctx.HoldingsModeleLaCerere.incarcat(), false);
});

test('setContext(c) programează încărcarea după primul cadru (rAF + setTimeout 0), o singură dată; după încărcare: contextul ultim merge la modelele reale, bind(), apoi c.refresh()', async () => {
  const { ctx, apeluri, realN, asteapta } = mediu();
  let refresh = 0; const c1 = { positions: [{ ticker: 'TE' }], refresh: () => refresh++ }, c2 = { positions: [{ ticker: 'TE' }, { ticker: 'MU' }], refresh: () => refresh++ };
  ctx.HoldingsNeuralUI.setContext(c1); ctx.HoldingsNeuralUI.setContext(c2);
  assert.equal(apeluri.incarca, 0, 'nu în același tick: lista se desenează întâi');
  await asteapta(20);
  assert.equal(apeluri.raf, 1); assert.equal(apeluri.incarca, 1, 'o singură încărcare');
  assert.equal(ctx.HoldingsModeleLaCerere.incarcat(), true);
  assert.deepEqual(realN.setContext, [c2], 'modelele reale primesc ULTIMUL context'); assert.equal(realN.bind, 1); assert.equal(refresh, 1, 'pagina se redesenează o dată (lista: coloana de probabilități)');
});

test('o atingere pe „Modele AI” / grupul „Analiză” / „Rapoarte” încarcă pe loc; „Calculează verdict AI” înainte de încărcare deschide verdictul DUPĂ ce modelele sunt gata, cu contextul deja dat', async () => {
  for (const atribute of [{ 'data-holding-tab': 'neural' }, { 'data-holding-group': 'analysis' }, { 'data-workspace-tab': 'reports' }]) {
    const { apeluri, click } = mediu(); click(atribute); assert.equal(apeluri.incarca, 1, JSON.stringify(atribute));
  }
  const { ctx, apeluri, realN, realV, click, asteapta } = mediu();
  const c = { positions: [{ ticker: 'TE' }], refresh() {} }; ctx.HoldingsNeuralUI.setContext(c);
  click({ 'data-verdict-open': 'TE' }); click({ 'data-verdict-open': 'TE' });
  assert.equal(apeluri.incarca, 1); assert.deepEqual(realV.open, []);
  await asteapta(20);
  assert.deepEqual(realN.setContext, [c], 'întâi contextul'); assert.deepEqual(realV.open, ['TE'], 'apoi o singură deschidere');
  const { apeluri: a2, click: c2 } = mediu(); c2({ 'data-holding-tab': 'summary' }); c2({ 'data-pick-holding': 'TE' }); assert.equal(a2.incarca, 0, 'alte atingeri nu încarcă');
});

test('HoldingsNeuralUI.run înainte de încărcare așteaptă modelele și rulează pe cele reale (învățarea automată nu pierde apelul)', async () => {
  const { ctx, realN } = mediu();
  const r = await ctx.HoldingsNeuralUI.run({ ticker: 'TE' }, { managed: true });
  assert.deepEqual(r, { state: 'ready' }); assert.equal(realN.run.length, 1);
});

test('eșec la încărcare (offline la prima deschidere): gazdele spun ce s-a întâmplat, cu „Reîncearcă”; reîncercarea reia încărcarea', async () => {
  const { ctx, hosts, apeluri, click, asteapta } = mediu({ esueaza: true });
  const host = { innerHTML: '', getAttribute: () => '0' }; hosts.push(host);
  ctx.HoldingsNeuralUI.setContext({ positions: [], refresh() {} });
  await asteapta(20);
  assert.equal(ctx.HoldingsModeleLaCerere.incarcat(), false);
  assert.match(host.innerHTML, /Modelele AI nu s-au încărcat: Scriptul nu s-a încărcat: hmm\.js\?v=1/); assert.match(host.innerHTML, /<button type="button" data-modele-reincearca>Reîncearcă<\/button>/);
  assert.match(ctx.HoldingsNeuralUI.card({}, 1), /nu s-au încărcat/, 'cardurile desenate după eșec arată tot eroarea');
  click({ 'data-modele-reincearca': '' }); assert.equal(apeluri.incarca, 2); assert.match(host.innerHTML, /se încarcă…/);
});

test('holdings.js: demo-ul (lumânări din HoldingsNeural.demoBars) așteaptă modelele înainte de scanare; locțiitorii nu sunt redefiniți dacă modelele s-au încărcat deja', () => {
  const js = readFileSync('holdings/holdings.js', 'utf8'), lib = readFileSync('lib/holdings-modele-la-cerere.js', 'utf8');
  assert.match(js, /if\(isDemo&&globalThis\.HoldingsModeleLaCerere\)\{busy=true;try\{await globalThis\.HoldingsModeleLaCerere\.incarca\(\);\}catch\(_\)\{\}finally\{busy=false;\}\}/);
  assert.match(lib, /if \(!g\.HoldingsNeuralUI\) g\.HoldingsNeuralUI = /); assert.match(lib, /if \(!g\.HoldingsVerdictUI\) g\.HoldingsVerdictUI = /);
  assert.match(readFileSync('holdings/neural.js', 'utf8'), /g\.HoldingsVerdictUI\?\.setContext\(c\)/, 'lanțul real de context ajunge la verdict');
});

test('niciun script rămas la deschidere nu prinde la încărcare (const/let/var la începutul liniei) o globală definită de grupul la cerere — regresia prinsă în browser pe 28.10: lib/decision-validation.js pus în grup prindea HoldingsForecast', () => {
  const laCerere = scripturi.filter((s) => s.laCerere).map((s) => 'holdings/' + s.src.replace(/^\.\.\//, '../'));
  const definite = new Set();
  for (const f of laCerere) for (const m of readFileSync(f.replace('holdings/../', ''), 'utf8').matchAll(/\bg\.([A-Z][A-Za-z0-9]+) ?=[^=]/g)) definite.add(m[1]);
  assert.ok(definite.has('HoldingsNeural') && definite.has('HoldingsLearning') && definite.has('HoldingsNeuralUI') && !definite.has('HoldingsForecast'), 'globalele grupului: ' + definite.size);
  const eager = scripturi.filter((s) => s.src && !s.laCerere && !/^https?:/.test(s.src)).map((s) => s.src.startsWith('../') ? s.src.slice(3) : 'holdings/' + s.src);
  const vinovati = [];
  for (const f of eager) for (const linie of readFileSync(f, 'utf8').split('\n')) {
    if (!/^(const|let|var) /.test(linie)) continue;
    for (const m of linie.matchAll(/= ?g\.([A-Z][A-Za-z0-9]+)\b/g)) if (definite.has(m[1])) vinovati.push(f + ': ' + m[1]);
  }
  assert.deepEqual(vinovati, [], 'capturi la încărcare ale unor globale care vin mai târziu');
  assert.ok(eager.includes('lib/holdings-verdict.js') && eager.length > 40, 'verificarea a trecut peste scripturile rămase: ' + eager.length);
});
