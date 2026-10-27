// 27.10.2026 (lotul A, I-747 / I-748 + contractele lotului 2): Health arată, DOAR CITIND: ultima probă de ecran după publicare
// (health/generated/proba-ecran.json), ultima reconciliere aplicație ⇆ broker (tt_reconciliere_v1, scrisă de pagina contului), starea opririi de
// urgență (tt_governor_oprire_v1) și starea de securitate a sincronizării (allowlist Google, sesiuni, ultimul login) + „doi cititori Trading 212”.
// Ce nu se poate citi sau are altă formă se spune (nu trece drept verde); orice text venit din date trece prin esc().
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const ctx = { Date, JSON, Number, Math, Object, String, Array, Intl, RegExp }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(readFileSync('health/decision-stare.js', 'utf8'), ctx, { filename: 'health/decision-stare.js' });
const H = ctx.TTHealthDecision, NOW = Date.parse('2026-10-27T20:30:00Z'), XSS = '<img src=x onerror=alert(1)>';

const proba = (over = {}) => ({ versiune: 'proba-ecran-v1', la: '2026-10-27T20:10:00.000Z', durataMs: 151234, browser: 'Chrome/130', versiunePublicata: '26.10.27.2100', suitaPublicata: 'tt-v986-2026-10-27', verdict: 'verde', nMotive: 0, motive: [], nAvertismente: 2, avertismente: [], pagini: [{ id: 'today', nume: 'Astăzi', ok: true, continut1: 1234, continut2: 800 }], rulare: 'https://github.com/x/y/actions/runs/9', commit: 'abcdef12', ...over });

test('proba de ecran: verde la zi ⇒ ok, cu versiunea, durata (o zecimală), paginile și rularea', () => {
  const r = H.probaEcran(proba(), '26.10.27.2100', NOW);
  assert.equal(r.cls, 'ok'); assert.match(r.html, /VERDE/); assert.match(r.html, /26\.10\.27\.2100/); assert.match(r.html, /durata 151,2 s/);
  assert.match(r.html, /✓ Astăzi 1: 1,2 s · 2: 0,8 s/); assert.match(r.html, /href="https:\/\/github\.com\/x\/y\/actions\/runs\/9"/);
});

test('proba de ecran: roșie ⇒ err cu motivele (escapate); pentru altă versiune decât cea publicată ⇒ cel puțin warn; lipsă ⇒ warn, nu verde', () => {
  const r = H.probaEcran(proba({ verdict: 'rosu', nMotive: 3, motive: ['Astăzi · prima: excepție JS — ' + XSS], pagini: [{ id: 'today', nume: XSS, ok: false, continut1: null, continut2: null }] }), '26.10.27.2100', NOW);
  assert.equal(r.cls, 'err'); assert.match(r.html, /ROȘU — 3 motive/); assert.ok(!r.html.includes('<img'), 'textul din date e escapat'); assert.match(r.html, /&lt;img/);
  const v = H.probaEcran(proba(), '26.10.28.0900', NOW);
  assert.equal(v.cls, 'warn'); assert.match(v.html, /proba e pentru 26\.10\.27\.2100; publicată acum 26\.10\.28\.0900/);
  assert.equal(H.probaEcran(null, '26.10.27.2100', NOW).cls, 'warn'); assert.match(H.probaEcran(null, null, NOW).html, /Nicio probă de ecran automată/);
  assert.equal(H.probaEcran({ versiune: 'alta' }, null, NOW).cls, 'warn');
  assert.ok(!/href="javascript/.test(H.probaEcran(proba({ rulare: 'javascript:alert(1)' }), null, NOW).html), 'doar legături https');
});

const rec = (over = {}) => JSON.stringify({ la: '2026-10-27T20:00:00Z', scope: 'live:abc', ok: true, diferente: [], ...over });
test('reconcilierea: ok la zi ⇒ ok; diferențe ⇒ err cu lista (o zecimală, escapată); veche ⇒ warn; lipsă / formă necunoscută ⇒ spus', () => {
  assert.equal(H.reconciliere(rec(), NOW).cls, 'ok'); assert.match(H.reconciliere(rec(), NOW).html, /Copiile aplicației = brokerul/);
  const d = H.reconciliere(rec({ ok: false, diferente: [{ tip: 'pozitie', ticker: 'MU_US_EQ', app: 4, broker: 3.25, text: 'cantitate diferită ' + XSS }, { tip: 'numerar', ticker: null, app: 1000.04, broker: 990, text: '' }] }), NOW);
  assert.equal(d.cls, 'err'); assert.match(d.html, /Diferențe între aplicație și broker: 2/); assert.match(d.html, /MU · aplicație 4,0 · broker 3,3/); assert.match(d.html, /numerar · aplicație 1\.000,0 · broker 990,0/);
  assert.ok(!d.html.includes('<img'));
  assert.equal(H.reconciliere(rec({ la: '2026-10-25T20:00:00Z' }), NOW).cls, 'warn');
  assert.equal(H.reconciliere(null, NOW).cls, 'warn'); assert.match(H.reconciliere(null, NOW).html, /Nicio reconciliere/);
  for (const rau of ['{stricat', JSON.stringify({ la: 'ieri', ok: true, diferente: [] }), JSON.stringify({ la: '2026-10-27T20:00:00Z', ok: 'da', diferente: [] }), JSON.stringify([])]) assert.equal(H.reconciliere(rau, NOW).cls, 'err', rau);
});

const opr = (over = {}) => JSON.stringify({ activ: true, la: '2026-10-27T19:00:00Z', motiv: 'piața cade ' + XSS, aparat: 'telefon-abc123', ordineAnulate: [{ id: '1', ticker: 'MU_US_EQ', stopPrice: 90 }], rearmatLa: null, rearmatMotiv: null, ...over });
test('oprirea de urgență (doar citire): OPRIT ⇒ err cu motivul și ordinele anulate; re-armat ⇒ ok; nefolosită ⇒ ok; formă necunoscută ⇒ err', () => {
  const o = H.oprire(opr());
  assert.equal(o.cls, 'err'); assert.match(o.html, /OPRIT/); assert.match(o.html, /telefon-abc123/); assert.match(o.html, /1 ordin anulat: MU/); assert.ok(!o.html.includes('<img')); assert.match(o.html, /formularul Governor/);
  const a = H.oprire(opr({ activ: false, rearmatLa: '2026-10-27T20:00:00Z', rearmatMotiv: 'verificat' }));
  assert.equal(a.cls, 'ok'); assert.match(a.html, /Armat/); assert.match(a.html, /re-armat/); assert.match(a.html, /verificat/);
  assert.equal(H.oprire(null).cls, 'ok'); assert.match(H.oprire(null).html, /nu a fost folosit/);
  assert.equal(H.oprire('{stricat').cls, 'err'); assert.equal(H.oprire(JSON.stringify({ activ: 'da' })).cls, 'err');
});

test('securitatea sincronizării: allowlist LIPSĂ ⇒ err; sesiunile și ultimul login la vedere; fără stare ⇒ nimic inventat', () => {
  const s = H.securitate({ ready: true, connected: true, setup: { database: true }, security: { allowlist: true, sessions: 2, lastLogin: Date.parse('2026-10-26T08:00:00Z') } });
  assert.equal(s.cls, 'ok'); assert.match(s.html, /Allowlist Google: <span class="ok">activ<\/span>/); assert.match(s.html, /Sesiuni active: 2/); assert.match(s.html, /ultimul login/);
  const f = H.securitate({ ready: true, connected: false, setup: { database: true }, security: { allowlist: false, sessions: null, lastLogin: null } });
  assert.equal(f.cls, 'err'); assert.match(f.html, /LIPSĂ/); assert.match(f.html, /GOOGLE_ALLOWED_SUB/);
  assert.equal(H.securitate(null).html, ''); assert.equal(H.securitate({ ready: false, setup: null }).cls, 'warn');
});

test('Health încarcă scriptul și are cardurile: proba de ecran, reconcilierea, oprirea; sincronizarea arată securitatea și „doi cititori”', () => {
  const html = readFileSync('health/index.html', 'utf8');
  assert.match(html, /<script src="decision-stare\.js\?v=[^"]+"><\/script>/);
  assert.match(html, /<script src="\.\.\/lib\/t212-reader\.js\?v=[^"]+"><\/script>/);
  for (const id of ['cDProba', 'cDRecon', 'cDOprire']) assert.match(html, new RegExp('id="' + id + '"'));
  assert.match(html, /generated\/proba-ecran\.json/); assert.match(html, /tt_reconciliere_v1/); assert.match(html, /tt_governor_oprire_v1/);
  assert.match(html, /TTHealthDecision\.securitate/); assert.match(html, /doiCititori/);
  assert.match(html, /\['Decision · proba de ecran',checkProbaEcran\]/);
});
