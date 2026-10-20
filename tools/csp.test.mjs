// tools/csp.test.mjs — 20.10.2026 (I-732): Content-Security-Policy pe paginile Decision App, din tools/csp-politica.mjs.
// (a) fiecare pagină are exact UN meta CSP, primul după <meta charset>, cu textul din politica();
// (b) fiecare gazdă scrisă în pagină sau în scripturile locale pe care le încarcă (recursiv: <script src>, CSS, workeri, module,
//     încărcări dinamice, configurările *-config.json) e ori permisă de politică, ori trecută conștient în NEAPELATE / BLOCATE;
// (c) politica are object-src 'none', base-uri 'self', form-action 'self', fără * singur și fără 'unsafe-eval';
// (d) niciun fișier HTML al rutelor active (lib/app-routes.js) și nicio pagină deschisă în iframe nu rămâne fără politică.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync, existsSync} from 'node:fs';
import {PAGINI, ORIGINEA, SURSE, NEAPELATE, BLOCATE, politica, aplica} from './csp-politica.mjs';

const BAZA = 'https://site.test/';
const cache = new Map();
const citeste = f => { if (!cache.has(f)) cache.set(f, readFileSync(f, 'utf8')); return cache.get(f); };
const local = href => { const u = new URL(href); if (u.origin + '/' !== BAZA) return null; let p = decodeURIComponent(u.pathname.slice(1)); if (p === '' || p.endsWith('/')) p += 'index.html'; return p; };
const META = /<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi;
const CHARSET = /<meta\s+charset\s*=\s*["']?[\w-]+["']?\s*\/?>/i;

// Fișierele locale pe care le încarcă o pagină. Literalii locali care se termină în .js/.mjs/.css sau -config.json și există pe disc
// prind și încărcările dinamice (createElement('script'), new Worker, serviceWorker.register, fetch pe configurări).
function inchidere(pagina) {
  const doc = BAZA + pagina, vazute = new Set(), coada = [pagina];
  while (coada.length) {
    const f = coada.shift();
    if (vazute.has(f) || !existsSync(f)) continue;
    vazute.add(f);
    const t = citeste(f), aici = BAZA + f, html = f.endsWith('.html'), refs = [];
    const adauga = (u, baza) => {
      if (!u || /^(data:|blob:|mailto:|tel:|javascript:|about:|#)/i.test(u) || u.includes('${')) return;
      try { const l = local(new URL(u.replace(/&amp;/g, '&'), baza).href); if (l) refs.push(l); } catch {}
    };
    if (html) {
      for (const m of t.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) adauga(m[1], aici);
      for (const m of t.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)) adauga(m[1], aici);
    }
    if (f.endsWith('.css')) for (const m of t.matchAll(/@import\s+(?:url\()?\s*["']?([^"')\s;]+)/g)) adauga(m[1], aici);
    if (html || /\.m?js$/.test(f)) {
      for (const m of t.matchAll(/importScripts\(([^)]*)\)/g)) for (const s of m[1].matchAll(/['"`]([^'"`]+)['"`]/g)) adauga(s[1], aici);
      for (const m of t.matchAll(/\bimport\s+(?:[\w*{}\s,$]+\s+from\s+)?['"]([^'"]+)['"]/g)) adauga(m[1], html ? doc : aici);
      for (const m of t.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) adauga(m[1], html ? doc : aici);
      for (const m of t.matchAll(/['"`]((?:\.{1,2}\/)?[\w\-./]+\.(?:m?js|css)|(?:\.{1,2}\/)?[\w\-./]*-config\.json)(?:\?[^'"`]*)?['"`]/g)) adauga(m[1], doc);
    }
    for (const r of refs) if (!vazute.has(r) && (/\.(m?js|css)$/.test(r) || /-config\.json$/.test(r))) coada.push(r);
  }
  return [...vazute];
}

const LITERAL = /\b((?:https?|wss?):\/\/[A-Za-z0-9.*_-]+(?::\d+)?)([^\s"'`<>)\\,;]*)/g;
const APEL = /(?:\bfetch|fetchJSON|fetchT|directJSON|getJSON|cuTermen|importScripts|sendBeacon|EventSource|WebSocket)\s*\(\s*['"`]$|\.src\s*=\s*['"`]$/;
function literali(f) {
  const t = citeste(f), out = [];
  for (const m of t.matchAll(LITERAL)) {
    let u; try { u = new URL(m[1] + (m[2].startsWith('/') ? m[2] : '/')); } catch { continue; }
    if (!/[a-z0-9]/i.test(u.hostname.replace(/\./g, '')) || /^\.|\.\./.test(u.hostname)) continue;   // „https://...” din placeholder-e
    out.push({u, origine: u.protocol + '//' + u.host, unde: f + ':' + (t.slice(0, m.index).split('\n').length), inApel: APEL.test(t.slice(Math.max(0, m.index - 40), m.index))});
  }
  return out;
}

// O sursă CSP (Level 3, cât folosim): 'self', scheme (data:, blob:), gazdă cu *. în față, port (:443 implicit, :n, :*), cale (prefix dacă se termină în /).
function potriveste(sursa, u) {
  if (sursa === "'self'") return u.origin === ORIGINEA;
  if (sursa.startsWith("'")) return false;
  if (/^[a-z][a-z\d+.-]*:$/i.test(sursa)) return u.protocol === sursa.toLowerCase();
  const m = /^(?:([a-z][a-z\d+.-]*):\/\/)?(\*|(?:\*\.)?[a-z\d.-]+)(?::(\d+|\*))?(\/\S*)?$/i.exec(sursa);
  assert.ok(m, 'sursă CSP pe care testul nu o înțelege: ' + sursa);
  const [, schema, gazda, port, cale] = m, h = u.hostname.toLowerCase(), g = gazda.toLowerCase();
  if (schema ? u.protocol !== schema.toLowerCase() + ':' : !['http:', 'https:'].includes(u.protocol)) return false;
  if (g.startsWith('*.') ? !h.endsWith(g.slice(1)) : g !== '*' && h !== g) return false;
  if (port !== '*' && (u.port || '') !== (port || '')) return false;
  if (cale && (cale.endsWith('/') ? !u.pathname.startsWith(cale) : u.pathname !== cale)) return false;
  return true;
}
const CERERI = ['connect-src', 'script-src', 'style-src', 'img-src', 'font-src', 'frame-src', 'worker-src', 'manifest-src'];
const permisa = u => CERERI.some(d => SURSE[d].some(s => potriveste(s.sursa, u)));
const NEAP = new Map(NEAPELATE.map(x => [x.gazda, x])), BLOC = new Map(BLOCATE.map(x => [x.gazda, x]));
const directive = () => Object.fromEntries(politica().split(';').map(x => x.trim().split(/\s+/)).map(([d, ...s]) => [d, s]));

test('(a) fiecare pagină are exact un meta CSP, primul după <meta charset>, cu textul din politica()', () => {
  const text = politica();
  for (const p of PAGINI) {
    const html = citeste(p), metas = [...html.matchAll(META)];
    assert.equal(metas.length, 1, p + ': ' + metas.length + ' meta CSP (trebuie exact unul) — rulează node tools/csp-politica.mjs --scrie');
    const m = metas[0], cap = html.search(/<head[\s>]/i), sfarsit = html.search(/<\/head>/i), cs = CHARSET.exec(html);
    assert.ok(cap >= 0 && m.index > cap && m.index < sfarsit, p + ': meta-ul CSP nu e în <head>');
    assert.ok(cs && cs.index > cap && cs.index < m.index, p + ': <meta charset> lipsește sau stă după CSP');
    assert.match(html.slice(cs.index + cs[0].length, m.index), /^\s*$/, p + ': între <meta charset> și CSP mai e ceva');
    assert.doesNotMatch(html.slice(cap, m.index), /<(script|link|style|base)\b/i, p + ': o resursă se încarcă înaintea politicii');
    assert.equal((/\bcontent\s*=\s*"([^"]*)"/i.exec(m[0]) || [])[1], text, p + ': textul politicii diferă de politica()');
    assert.equal(aplica(html), html, p + ': --scrie ar mai schimba pagina');
  }
});

test('(b) fiecare gazdă din pagini și din scripturile lor e permisă de politică sau clasificată conștient', () => {
  const lipsa = [], vazute = new Set();
  for (const p of PAGINI) for (const f of inchidere(p)) {
    if (!/\.(m?js|css|html)$|-config\.json$/.test(f)) continue;
    for (const l of literali(f)) {
      vazute.add(l.origine);
      if (NEAP.has(l.origine)) { if (l.inApel) lipsa.push(p + ': ' + l.origine + ' e trecută ca doar-link, dar ' + l.unde + ' o cere direct'); continue; }
      if (BLOC.has(l.origine)) continue;
      if (!permisa(l.u)) lipsa.push(p + ': ' + l.origine + ' (' + l.unde + ') nu e nici în politică, nici în NEAPELATE / BLOCATE din tools/csp-politica.mjs');
    }
  }
  assert.deepEqual([...new Set(lipsa)], []);
  // listele nu țin intrări moarte: fiecare gazdă de acolo apare încă în codul încărcat de pagini
  for (const g of [...NEAP.keys(), ...BLOC.keys()]) assert.ok(vazute.has(g), g + ' nu mai apare în codul paginilor — scoate-o din tools/csp-politica.mjs');
  for (const g of NEAP.keys()) assert.ok(!permisa(new URL(g)), g + ' e permisă oricum — nu are ce căuta în NEAPELATE');
  for (const g of BLOC.keys()) assert.ok(!permisa(new URL(g + '/')), g + ' e în BLOCATE, dar politica o permite');
});

test('(c) politica: object-src none, base-uri self, form-action self, fără * singur, fără unsafe-eval, nimic ignorat de meta', () => {
  const p = politica(), d = directive();
  assert.deepEqual(d['object-src'], ["'none'"]);
  assert.deepEqual(d['base-uri'], ["'self'"]);
  assert.deepEqual(d['form-action'], ["'self'"]);
  assert.deepEqual(d['default-src'], ["'self'"]);
  for (const s of d['connect-src']) assert.ok(!['*', 'https:', 'http:', 'wss:', 'ws:', 'data:', 'blob:'].includes(s), 'connect-src prea larg: ' + s);
  // un wildcard stă doar sub un subdomeniu al LUI (*.mferent80.workers.dev, *.tail9144fe.ts.net), nu sub un sufix public (*.workers.dev, *.ts.net)
  for (const surse of Object.values(d)) for (const s of surse) if (s.includes('*.')) assert.ok(/\*\.[a-z\d-]+\.[a-z\d-]+\.[a-z\d-]+(:|\/|$)/i.test(s), 'wildcard prea larg: ' + s);
  assert.ok(!p.includes("'unsafe-eval'") && !p.includes("'unsafe-hashes'"), 'fără unsafe-eval');
  assert.doesNotMatch(p, /frame-ancestors|report-uri|report-to|sandbox/, 'directive ignorate într-un <meta>');
  assert.doesNotMatch(p, /["<>&]/, 'textul trebuie să stea neescapat într-un atribut');
  assert.equal(new Set(Object.keys(SURSE)).size, Object.keys(d).length);
});

test('(c) niciun script încărcat de pagini nu are nevoie de unsafe-eval (eval, new Function, setTimeout cu text)', () => {
  for (const p of PAGINI) for (const f of inchidere(p)) if (/\.(m?js|html)$/.test(f)) {
    const m = /\beval\s*\(|\bnew\s+Function\s*\(|\bset(?:Timeout|Interval)\s*\(\s*['"`]/.exec(citeste(f));
    assert.equal(m, null, p + ': ' + f + ' folosește ' + (m && m[0]) + ' — politica nu are unsafe-eval');
  }
});

function rutele() {
  const c = {URL, URLSearchParams, document: {currentScript: {src: BAZA + 'lib/app-routes.js'}}, location: {href: BAZA + 'app/'}};
  c.window = c; vm.runInNewContext(citeste('lib/app-routes.js'), c);
  return c.TTAppRoutes;
}

test('(d) niciun fișier HTML al rutelor active și nicio pagină din iframe-urile lor nu rămâne fără politică', () => {
  const fisiere = new Set(['app/index.html']);
  for (const x of rutele().all) fisiere.add(x.u.split('#')[0] + 'index.html');
  for (const f of [...fisiere]) {
    for (const m of citeste(f).matchAll(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) { const l = local(new URL(m[1].replace(/&amp;/g, '&'), BAZA + f).href); if (l) fisiere.add(l); }
    // iframe-urile create din JS (desk/auto-scan.js, scanner-verdicts/view.js, carcasa): `.src = '../x/?…'`
    for (const s of inchidere(f)) if (/\.m?js$|\.html$/.test(s)) for (const m of citeste(s).matchAll(/\.src\s*=\s*['"`](\.\.?\/[\w\-/]*\/)(?:\?[^'"`]*)?['"`]/g)) {
      const l = local(new URL(m[1], BAZA + f).href); if (l && existsSync(l)) fisiere.add(l);
    }
  }
  assert.deepEqual([...fisiere].sort(), [...PAGINI].sort(), 'PAGINI din tools/csp-politica.mjs trebuie să fie exact paginile active');
  for (const f of fisiere) assert.ok(/http-equiv\s*=\s*["']?content-security-policy/i.test(citeste(f)), f + ' nu are meta CSP');
});
