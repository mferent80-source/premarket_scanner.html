// 19.10.2026 (I-705): pornirea aplicației în două trepte — carcasa din cache pe semnal slab, bibliotecile amânate,
// brokerul și scanarea ascunsă după primul ecran, căutarea cu pauză între taste.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (p) => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf8');
const SW = read('app/sw.js');
const scope = 'https://example.test/premarket_scanner.html/app/';

function worker({ network }) {
  const handlers = {}, timers = [], calls = { cacheMatch: [], cachePut: [] };
  const context = {
    URL, Response,
    setTimeout: (fn, ms) => { timers.push({ fn, ms, cleared: false }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; },
    self: { location: { origin: new URL(scope).origin }, registration: { scope }, addEventListener: (n, h) => { handlers[n] = h; } },
    fetch: () => network(),
    caches: {
      open: async () => ({ put: async (request) => { calls.cachePut.push(typeof request === 'string' ? request : request.url); } }),
      match: async (request) => { calls.cacheMatch.push(typeof request === 'string' ? request : request.url); return new Response('CARCASA DIN CACHE'); },
    },
  };
  vm.createContext(context);
  vm.runInContext(SW, context, { filename: 'app/sw.js' });
  function serve(path) {
    let pending; const waits = [];
    handlers.fetch({ request: { url: new URL(path, scope).href, method: 'GET', mode: 'navigate' }, respondWith: (p) => { pending = p; }, waitUntil: (p) => { waits.push(p); } });
    return { pending, waits };
  }
  return { serve, timers, calls };
}
const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('fără răspuns în ' + ms + ' ms')), ms))]);

test('I-705a: rețeaua care doar întârzie nu mai ține carcasa albă — după 3,5 s vine copia din cache, rețeaua o actualizează în fundal', async () => {
  let release;
  const { serve, timers, calls } = worker({ network: () => new Promise((r) => { release = r; }) });
  const { pending, waits } = serve('./?module=holdings%2F');
  const t = timers.find((x) => x.ms === 3500);
  assert.ok(t, 'navigarea carcasei are un prag de 3,5 s');
  t.fn();
  const response = await within(pending, 1000);
  assert.equal(await response.text(), 'CARCASA DIN CACHE');
  release(new Response('CARCASA NOUĂ', { status: 200 }));
  await within(Promise.all(waits), 1000);
  assert.deepEqual(calls.cachePut, [new URL('./?module=holdings%2F', scope).href], 'răspunsul întârziat al rețelei intră în cache pentru data viitoare');
});

test('I-705a: rețeaua rapidă câștigă și pragul se oprește; fără rețea deloc rămâne ecranul „Ești offline”', async () => {
  const fast = worker({ network: async () => new Response('CARCASA NOUĂ') });
  const a = fast.serve('./');
  assert.equal(await (await within(a.pending, 1000)).text(), 'CARCASA NOUĂ');
  assert.ok(fast.timers.every((x) => x.cleared), 'pragul se anulează când răspunde rețeaua');
  const off = worker({ network: async () => { throw new Error('offline'); } });
  const b = off.serve('./');
  assert.match(await (await within(b.pending, 1000)).text(), /Ești offline/);
  assert.equal(off.calls.cacheMatch.length, 0);
});

// ── carcasa (app/index.html) într-un DOM fals, cu cronometre și requestIdleCallback controlate ──
const HTML = read('app/index.html');
const MAIN = [...HTML.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].find((m) => m[2].includes('var GROUPS='))[2];
function boot({ saved = null, readyState = 'interactive', stored = {} } = {}) {
  const elements = {}, docEvents = {}, winEvents = {}, timers = [], idle = [], reads = [], appended = [];
  const storage = new Map(Object.entries(stored)); if (saved) storage.set('tt_app_active_v1', saved);
  const classes = () => { const set = new Set(); return { add: (k) => set.add(k), remove: (k) => set.delete(k), contains: (k) => set.has(k), toggle: (k, on) => { const v = on === undefined ? !set.has(k) : !!on; if (v) set.add(k); else set.delete(k); return v; } }; };
  const child = { postMessage() {} };
  const node = () => ({ value: '', hidden: false, src: '', dataset: {}, contentWindow: child, contains: () => false, querySelectorAll: () => [], querySelector: () => null, getAttribute(k) { return this[k] || null; }, setAttribute(k, v) { this[k] = v; }, removeAttribute(k) { delete this[k]; }, classList: classes(), parentNode: { insertBefore() {} }, remove() { this.removed = true; }, focus() {}, blur() {} });
  const el = (id) => elements[id] || (elements[id] = node());
  const document = { readyState, hidden: false, documentElement: { dataset: { appVersion: 'release-test' } }, getElementById: el, body: { appendChild: (x) => appended.push(x) },
    addEventListener: (n, f) => { (docEvents[n] ||= []).push(f); }, createElement: node };
  const location = { origin: 'https://example.test', href: 'https://example.test/project/app/', search: '' };
  const ctx = { document, location, history: { state: null, replaceState() {}, pushState() {} }, navigator: { onLine: true },
    localStorage: { getItem: (k) => { reads.push(k); return storage.has(k) ? storage.get(k) : null; }, setItem: (k, v) => storage.set(k, String(v)) },
    addEventListener: (n, f) => { winEvents[n] = f; }, Intl, Date, URLSearchParams, URL,
    setTimeout: (fn, ms) => { timers.push({ fn, ms, done: false }); return timers.length; }, clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].done = true; },
    setInterval: () => 0, clearInterval() {}, requestIdleCallback: (fn) => { idle.push(fn); } };
  ctx.window = ctx;
  vm.runInNewContext(read('lib/app-routes.js'), ctx);
  vm.runInNewContext(read('lib/app-search.js'), ctx);
  vm.runInNewContext(MAIN, ctx);
  const runIdle = () => { while (idle.length) idle.shift()(); };
  const fire = (pred) => { for (const t of timers.slice()) if (!t.done && pred(t)) { t.done = true; t.fn(); } };
  const loadModule = () => { const f = elements.frame; f.contentDocument = { createElement: () => ({}), head: { appendChild() {} }, querySelectorAll: () => [], addEventListener() {} }; f.onload.call(f); };
  return { ctx, elements, docEvents, timers, idle, runIdle, fire, reads, appended, loadModule };
}

test('I-705b: înaintea meniului rămân sincrone doar bibliotecile citite de meniu; restul sunt amânate (defer), în ordinea veche', () => {
  const head = HTML.slice(0, HTML.indexOf(MAIN));
  const sync = [...head.matchAll(/<script(?![^>]*\b(?:defer|async|type="module")\b)[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1].split('?')[0]);
  assert.deepEqual(sync.sort(), ['../lib/app-routes.js', '../lib/app-search.js', '../lib/candidate-plan-handoff.js', '../lib/holding-handoff.js', '../lib/theme.js', 'failure-info.js'].sort());
  const deferred = [...HTML.matchAll(/<script defer src="([^"?]+)/g)].map((m) => m[1]);
  assert.ok(deferred.length >= 24, 'bibliotecile Portofoliului, jurnalului și dovezilor sunt amânate');
  const order = (a, b) => assert.ok(deferred.indexOf(a) >= 0 && deferred.indexOf(a) < deferred.indexOf(b), a + ' înaintea lui ' + b);
  order('../lib/exchange-calendar.js', '../lib/daily-series.js'); order('../lib/decision-verdict.js', '../lib/decision-bridge.js');
  order('../lib/trade-evidence-schema.js', '../lib/evidence-vault.js'); order('../lib/trade-evidence.js', '../lib/trade-evidence-auto.js');
  order('../lib/trading212-vault.js', '../lib/cloud-sync-store.js');
  assert.ok(HTML.indexOf('cloud-sync-store.js') < HTML.indexOf('type="module" src="cloud-sync.js'), 'cloud-sync (modul) rulează după seif și magazin');
  assert.match(HTML, /document\.addEventListener\('DOMContentLoaded',function\(\)\{setTimeout\(function\(\)\{try\{var m=window\.HoldingsModelStorage/, 'mutarea rapoartelor așteaptă bibliotecile amânate');
});

test('I-705b: paginile care pornesc odată cu meniul nu citesc la încărcare bibliotecile amânate ale carcasei', () => {
  const list = /var EARLY_START=(\[[^\]]*\])/.exec(MAIN);
  assert.ok(list, 'lista paginilor cu pornire imediată există');
  const early = JSON.parse(list[1].replace(/'/g, '"'));
  assert.ok(early.includes('today/'), 'Astăzi (pagina implicită) pornește imediat');
  const risky = /decision-verdict\.js|decision-panel\.js|trade-evidence-auto\.js/;
  const parentLib = /parent\??\.(TTDecision\w*|TTEntryAuto|TradeEvidence\w*|TTJournal\w*|Holdings\w*|Governor\w*|TTPlanStore|TTEvidenceVault|TTStorage\w*|T212\w*|DailySeries|ExchangeCalendar|TTTradePlan\w*)/;
  for (const route of early) {
    const dir = route.replace(/#.*/, ''), page = read(dir + 'index.html');
    assert.doesNotMatch(page, risky, route + ' nu include biblioteci care citesc carcasa la încărcare');
    const scripts = [...page.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1].split(/[?#]/)[0]).filter((u) => !/^(https?:)?\/\//.test(u));
    for (const s of scripts) { const text = read(new URL(s, 'file:///r/' + dir).pathname.slice(3)); assert.doesNotMatch(text, parentLib, route + ' → ' + s); }
    assert.doesNotMatch(page, parentLib, route + ' (scripturile din pagină)');
  }
});

test('I-705b: Astăzi pornește odată cu meniul; Jurnalul (citește verdictul din carcasă) așteaptă bibliotecile', () => {
  const today = boot({ readyState: 'loading' });
  assert.ok(today.elements.nav.innerHTML.includes('Astăzi'), 'meniul e desenat');
  assert.match(today.elements.frame.src, /^\.\.\/today\/\?app=/, 'Astăzi pornește imediat');
  const journal = boot({ readyState: 'loading', saved: 'journal/#exec' });
  assert.ok(journal.elements.nav.innerHTML.includes('Jurnal'), 'meniul e desenat chiar dacă modulul așteaptă');
  assert.equal(journal.elements.frame.src, '', 'Jurnalul nu pornește înaintea bibliotecilor amânate');
  assert.equal(journal.elements.pageName.textContent, 'Jurnal');
  journal.docEvents.DOMContentLoaded.forEach((f) => f());
  assert.match(journal.elements.frame.src, /^\.\.\/journal\/\?app=/);
});

test('I-705c: brokerul ascuns și scanarea ascunsă pornesc după primul modul, la un moment liber', () => {
  const b = boot({ stored: { ce_results_v2: JSON.stringify({ updatedAt: Date.now() - 2 * 3600e3, momentum: [] }) } });
  assert.equal(b.elements.brokerFrame.src, '', 'brokerul nu pornește în timpul primului ecran');
  assert.ok(!b.timers.some((t) => t.ms === 8000 && !t.done), 'scanarea ascunsă nu se programează înaintea primului modul');
  b.loadModule();
  assert.equal(b.elements.brokerFrame.src, '', 'nici imediat după: așteaptă un moment liber');
  b.runIdle();
  assert.equal(b.elements.brokerFrame.src, '../broker/?app=decision-mobile-v2&v=release-test');
  b.fire((t) => t.ms <= 8000 && t.ms !== 150); b.runIdle();
  assert.equal(b.appended.filter((x) => x.dataset.ttBackground === 'candidate-engine').length, 1, 'scanarea ascunsă pornește după primul ecran');
  const slow = boot();
  slow.fire((t) => t.ms === 15000); slow.runIdle();
  assert.match(slow.elements.brokerFrame.src, /broker/, 'plasa: modulul care nu se încarcă nu ține brokerul oprit peste 15 s');
});

test('I-705d: căutarea citește cheile mari o dată și redesenează după o pauză între taste; Enter folosește textul curent', () => {
  const b = boot();
  b.elements.search.onfocus();
  const afterFocus = b.reads.filter((k) => k === 'ce_results_v2').length;
  for (const v of ['A', 'AA', 'AAP', 'AAPL']) { b.elements.search.value = v; b.elements.search.oninput(); }
  assert.equal(b.reads.filter((k) => k === 'ce_results_v2').length, afterFocus, 'tastele nu mai recitesc scanarea');
  const pending = b.timers.filter((t) => !t.done && t.ms === 150);
  assert.equal(pending.length, 1, 'o singură redesenare programată, la 150 ms după ultima tastă');
  b.elements.search.value = 'Jurnal'; b.elements.search.oninput();
  b.elements.search.onkeydown({ key: 'Enter', preventDefault() {} });
  assert.match(b.elements.palette.innerHTML, /Jurnal/, 'Enter redesenează imediat pe textul curent');
});
