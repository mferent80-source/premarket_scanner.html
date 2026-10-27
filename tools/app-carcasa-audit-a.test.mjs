// 27.10.2026 (lotul A, auditul A 🔵 [17], [18], [23]–[26], [28]): carcasa Decision App — accesibilitatea (încărcarea anunțată, paleta ca listă,
// fără anunțuri la fiecare trecere de sincronizare), ținte de atingere de 44 px pe telefon, culoarea barei de sistem = fundalul aprobat, o singură
// paletă în layout.css, cel mult 3 cadre vii pe telefoanele cu memorie mică, curățenia spațiului local în timpul liber al browserului.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('app/index.html', 'utf8'), css = fs.readFileSync('app/layout.css', 'utf8'), manifest = JSON.parse(fs.readFileSync('app/manifest.webmanifest', 'utf8'));
const script = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].find((m) => m[2].includes('var GROUPS='))[2];
const tag = (id) => (html.match(new RegExp('<[a-z]+\\b[^>]*\\sid="' + id + '"[^>]*>')) || [''])[0];

function boot({ phone = false, deviceMemory } = {}) {
  const elements = {}, events = {}, child = { postMessage() {} }, storage = new Map();
  const mk = () => ({ value: '', hidden: false, dataset: {}, contentWindow: child, contains: () => false, querySelectorAll: () => [], querySelector: () => null, getAttribute(k) { return this[k] || null; }, setAttribute(k, v) { this[k] = v; }, removeAttribute(k) { delete this[k]; }, classList: { add() {}, remove() {}, contains: () => false, toggle() {} }, parentNode: { insertBefore() {} }, remove() {}, focus() {}, blur() {} });
  const document = { documentElement: { dataset: { appVersion: 'release-test' } }, getElementById: (id) => elements[id] || (elements[id] = mk()), addEventListener() {}, createElement: mk };
  const location = { origin: 'https://example.test', href: 'https://example.test/project/app/', search: '' };
  const ctx = { document, location, history: { state: null, replaceState() {}, pushState() {} }, localStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) }, navigator: { onLine: true, ...(deviceMemory ? { deviceMemory } : {}) }, addEventListener: (n, f) => { events[n] = f; }, matchMedia: (q) => ({ matches: phone && /max-width: 760px/.test(q) }), Intl, Date, URLSearchParams, URL };
  ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync('lib/app-routes.js', 'utf8'), ctx); vm.runInNewContext(fs.readFileSync('lib/app-search.js', 'utf8'), ctx); vm.runInNewContext(script, ctx);
  return { elements, events, ctx };
}

test('[24] încărcarea modulului e anunțată (role=status); paleta e o listă de opțiuni legată de câmpul de căutare (combobox)', () => {
  assert.match(tag('loading'), /role="status"/);
  assert.match(tag('palette'), /role="listbox"/); assert.match(tag('palette'), /aria-label="[^"]+"/);
  assert.match(tag('search'), /role="combobox"/); assert.match(tag('search'), /aria-autocomplete="list"/); assert.match(tag('search'), /aria-controls="palette"/);
  const b = boot(); b.elements.search.value = 'Jurnal'; b.elements.search.oninput?.(); b.elements.search.onkeydown?.({ key: 'Enter', preventDefault() {} });
  assert.match(b.elements.palette.innerHTML, /<button role="option"/, 'rândurile paletei sunt opțiuni');
});

test('[26] bara de sus nu mai anunță la fiecare trecere de sincronizare: o singură zonă vie, scrisă doar când se schimbă felul stării', () => {
  assert.doesNotMatch(tag('googleAccountLabel'), /aria-live/); assert.doesNotMatch(tag('syncStatus'), /aria-live/);
  assert.match(tag('syncAnnounce'), /role="status"/); assert.match(tag('syncAnnounce'), /class="[^"]*sr-only/);
  assert.match(css, /\.sr-only\{[^}]*clip/);
  const b = boot(), st = (d) => b.events['tt-cloud-state']({ detail: d });
  st({ ready: true, connected: true, lastSync: Date.now() }); const prima = b.elements.syncAnnounce.textContent;
  assert.match(prima, /Sincronizat/);
  b.elements.syncAnnounce.textContent = '';
  st({ ready: true, connected: true, busy: true, lastSync: Date.now() }); st({ ready: true, connected: true, lastSync: Date.now() + 60000 });
  assert.match(b.elements.syncStatus.textContent, /Sincronizat la/, 'bara vizibilă se actualizează');
  assert.equal(b.elements.syncAnnounce.textContent, '', 'busy ⇄ confirmat nu se anunță la fiecare trecere');
  st({ ready: true, connected: true, error: 'cloud_unavailable', lastSync: Date.now() });
  assert.match(b.elements.syncAnnounce.textContent, /Eroare de sincronizare/, 'schimbarea de fel (eroare) se anunță');
});

test('[25] pe telefon butoanele Google / sincronizare au ținta de 44 px', () => {
  const mobil = css.slice(css.indexOf('@media(max-width:760px)'));
  assert.match(mobil, /\.topbar \.account-state \.google-account,\.topbar \.account-state \.sync-state\{[^}]*width:44px[^}]*min-height:44px/);
  assert.doesNotMatch(mobil, /\.sync-state\{[^}]*width:36px/);
});

test('[23] bara de sistem Android și ecranul de pornire au fundalul aprobat al carcasei', () => {
  const aprobat = [...css.matchAll(/:root\{--bg:(#[0-9a-f]{6})/g)].map((m) => m[1]);
  assert.deepEqual(aprobat, ['#0b1017'], '[28] o singură paletă întunecată în layout.css');
  assert.match(html, /<meta name="theme-color" content="#0b1017">/);
  assert.equal(manifest.theme_color, '#0b1017'); assert.equal(manifest.background_color, '#0b1017');
});

test('[28] layout.css fără paleta suprascrisă și fără regulile moarte (.nav-details, .system i)', () => {
  assert.equal((css.match(/:root\[data-theme="light"\]\{--bg:/g) || []).length, 1);
  assert.doesNotMatch(css, /\.nav-details/); assert.doesNotMatch(css, /\.system i\{/);
  assert.ok(!/nav-details/.test(html));
});

test('[18] pe telefoanele cu memorie mică (≤ 4 GB) carcasa ține cel mult 3 cadre vii; altfel 4 pe telefon, 6 pe PC', () => {
  assert.match(script, /deviceMemory/);
  const limita = (o) => { const m = script.match(/FRAME_LIMIT=([^,;]+(?:\?[^,;]+:[^,;]+)?)[,;]/); assert.ok(m, 'FRAME_LIMIT'); const f = new Function('window', 'matchMedia', 'navigator', 'return ' + m[1] + ';'); return f({ matchMedia: o.matchMedia }, o.matchMedia, o.navigator); };
  const tel = (q) => ({ matches: /max-width: 760px/.test(q) }), pc = () => ({ matches: false });
  assert.equal(limita({ matchMedia: tel, navigator: { deviceMemory: 4 } }), 3);
  assert.equal(limita({ matchMedia: tel, navigator: { deviceMemory: 8 } }), 4);
  assert.equal(limita({ matchMedia: tel, navigator: {} }), 4, 'fără informația de memorie: ca înainte');
  assert.equal(limita({ matchMedia: pc, navigator: { deviceMemory: 2 } }), 6);
});

test('[17] mutarea rapoartelor și curățenia spațiului local rulează în timpul liber al browserului (requestIdleCallback), nu pe firul ocupat', () => {
  const s = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((x) => x.includes('migrateAll'));
  assert.ok(s); assert.match(s, /requestIdleCallback/); assert.match(s, /timeout:/);
});
