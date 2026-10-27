// 27.10.2026 — lotul F al auditului: contractul comun al probelor (câmpurile `putere`, `primulVerdict`, `judecata` din JSON-urile
// roboților, citite de panourile „cât mai durează și ce poate vedea”), calendarul NYSE pentru data primului verdict și amprentele
// din text (funcțiile care JUDECĂ intră și ele în versiunea probei — I-743).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mulberry32, gauss, calendarSUA, dupaSesiuni, sesiuniIntre, primulVerdict, judecata, functieDinText, amprentaText, declaratii, inchidere } from '../lib/proba-contract.mjs';

test('inchidere: din rădăcini, toate declarațiile de nivel superior folosite (tranzitiv), fără cele de afișaj; comentariile și șirurile nu trag nume', () => {
  const src = ['(function () {', "  var TOATE = ['A', 'B'];", '  var state = { x: 1 };', '  function pct(a, b) { return (b - a) / a * 100; }', '  function fmt(v) { return String(v); }',
    '  function ajutor(c) { return pct(c[0], c[1]); }', '  // ajutorMort apare doar în comentariu', '  function ajutorMort() { return 0; }',
    "  function scor(f) { var s = ajutor(f.c); return { s: s, text: fmt(s) + ' state' }; }", '  function analiza(sym) { return { scor: scor(sym), u: TOATE.length, r: render() }; }', '  function render() { return state.x; }', '})();', ''].join('\r\n');
  assert.deepEqual(declaratii(src), ['TOATE', 'state', 'pct', 'fmt', 'ajutor', 'ajutorMort', 'scor', 'analiza', 'render']);
  assert.deepEqual(inchidere(src, ['analiza'], { exclude: ['fmt', 'render'] }), ['TOATE', 'ajutor', 'analiza', 'pct', 'scor']);
  assert.ok(inchidere(src, ['analiza']).includes('state'), 'fără excluderi, render ⇒ state intră');
  assert.ok(!inchidere(src, ['scor'], { exclude: ['fmt'] }).includes('state'), '„state” din șir nu trage declarația');
  assert.throws(() => inchidere(src, ['lipsa']), /lipsa/);
});
test('inchidere pe motoarele reale: Top Long (engine.js) prinde funcțiile apelate din analyze; Reguli V1 prinde verificările; textele extrase sunt întregi', () => {
  const eng = readFileSync('candidate-engine/engine.js', 'utf8'), cut = eng.lastIndexOf('  validateDeps(); bind();'), s = eng.slice(0, cut);
  const tl = inchidere(s, ['momentumScore', 'analyze', 'capSectors', 'benchmarkReturns', 'rankResults'], { exclude: ['fmt', 'signed', 'procente', 'fapteCandidat', 'sparkValues'] });
  for (const n of ['earningsInfo', 'gardaEarnings', 'avgDollarVol', 'daysSinceLow', 'retAt', 'regionOf', 'closes', 'lastValue', 'mean', 'pct', 'clamp', 'BENCHMARKS', 'EU_CORE', 'zileNY', 'safeNum']) assert.ok(tl.includes(n), 'Top Long: ' + n);
  for (const n of ['fmt', 'fapteCandidat', 'render', 'renderDetail', 'scan', 'loadTrend']) assert.ok(!tl.includes(n), 'nu intră: ' + n);
  const v1 = readFileSync('lib/independent-scanner.js', 'utf8'), r = inchidere(v1, ['evaluate', 'benchmarkSource'], { exclude: ['LABELS', 'rule', 'VERSION', 'DEFAULT_UNIVERSE'] });
  for (const n of ['RULES', 'IDS', 'empty', 'check', 'finish', 'verifiedSource', 'verifiedIndex', 'regionOf', 'ema', 'rsi', 'atr']) assert.ok(r.includes(n), 'V1: ' + n);
  for (const [src, nume] of [[s, tl], [v1, r]]) for (const n of nume) { const t = functieDinText(src, n); assert.ok(src.replace(/\r\n?/g, '\n').includes(t), n); assert.ok(/[;})\]]$/.test(t), n + ' se termină ciudat: …' + t.slice(-40)); }
});

test('mulberry32: același seed ⇒ aceeași serie; uniformă pe [0, 1) (decilele ±2 pp); gauss are media 0 și abaterea 1', () => {
  const a = mulberry32(7), b = mulberry32(7);
  assert.equal(a(), b()); assert.notEqual(mulberry32(8)(), mulberry32(7)());
  const r = mulberry32(2710), n = 20000, dec = new Array(10).fill(0); let s = 0;
  for (let i = 0; i < n; i++) { const x = r(); assert.ok(x >= 0 && x < 1); dec[Math.floor(x * 10)]++; s += x; }
  assert.ok(Math.abs(s / n - 0.5) < 0.01); for (const d of dec) assert.ok(Math.abs(d / n - 0.1) < 0.02, 'decila ' + d / n);
  const g = gauss(mulberry32(3)); let m = 0, q = 0; for (let i = 0; i < n; i++) { const x = g(); m += x; q += x * x; }
  assert.ok(Math.abs(m / n) < 0.03); assert.ok(Math.abs(Math.sqrt(q / n - (m / n) ** 2) - 1) < 0.03);
});

test('calendarul NYSE: n sesiuni după o zi (sărbătorile sărite); dincolo de calendarul oficial se numără zilele lucrătoare și se spune „aproximativ”', () => {
  const cal = calendarSUA('.');
  assert.deepEqual(dupaSesiuni(cal, '2026-10-16', 1), { zi: '2026-10-19', aproximativ: false });
  assert.deepEqual(dupaSesiuni(cal, '2026-10-16', 5), { zi: '2026-10-23', aproximativ: false });
  assert.equal(dupaSesiuni(cal, '2026-11-25', 1).zi, '2026-11-27', 'Ziua Recunoștinței (26.11.2026) e sărită');
  assert.equal(sesiuniIntre(cal, '2026-10-16', '2026-10-23'), 5);
  const departe = dupaSesiuni(cal, '2026-10-16', 1500);
  assert.equal(departe.aproximativ, true); assert.ok(departe.zi > '2032-01-01' && departe.zi < '2033-06-01');
  assert.ok(![0, 6].includes(new Date(departe.zi + 'T12:00:00Z').getUTCDay()), 'nu cade în weekend');
});

test('primulVerdict: optimist = N perioade de k sesiuni de la primul start (sau de azi), realist = plus alunecarea zilelor pierdute; motivul e scris', () => {
  const cal = calendarSUA('.');
  // nicio zi notată încă: pornește de azi
  const gol = primulVerdict({ cal, azi: '2026-10-27', starturi: [], k: 5, perioade: 8, notate: 0, asteptate: 0 });
  assert.equal(gol.optimist, dupaSesiuni(cal, '2026-10-27', 8 * 5).zi); assert.equal(gol.realist, gol.optimist, 'fără zile pierdute știute, realist = optimist');
  assert.match(gol.motiv, /8 perioade/); assert.match(gol.motiv, /5 sesiuni/);
  // 2 starturi deja (din 8): mai trebuie 6 starturi la câte k sesiuni + k pentru ca ultima perioadă să se închidă
  const doi = primulVerdict({ cal, azi: '2026-10-27', starturi: ['2026-10-16', '2026-10-23'], k: 5, perioade: 8, notate: 7, asteptate: 7 });
  assert.equal(doi.optimist, dupaSesiuni(cal, '2026-10-23', 6 * 5 + 5).zi);
  // 5 din 7 sesiuni pierdute ⇒ fiecare perioadă alunecă în medie cu r/(1−r) = 2,5 sesiuni ⇒ realist mai târziu decât optimist
  const rau = primulVerdict({ cal, azi: '2026-10-27', starturi: ['2026-10-16'], k: 5, perioade: 8, notate: 2, asteptate: 7 });
  assert.ok(rau.realist > rau.optimist, rau.realist + ' > ' + rau.optimist); assert.match(rau.motiv, /5 din 7 sesiuni/);
  // fără nicio perioadă închisă, dar cu prima zi notată: se numără de la ea (nu de azi); o zi din viitor sau invalidă ⇒ de azi
  const inc = primulVerdict({ cal, azi: '2026-10-27', inceput: '2026-10-20', starturi: [], k: 5, perioade: 8 });
  assert.equal(inc.optimist, dupaSesiuni(cal, '2026-10-20', 8 * 5).zi); assert.match(inc.motiv, /20\.10\.2026/);
  assert.equal(primulVerdict({ cal, azi: '2026-10-27', inceput: 'nu', starturi: [], k: 5, perioade: 8 }).optimist, gol.optimist);
  // toate starturile există: optimist = ultimul start cerut + k
  const gata = primulVerdict({ cal, azi: '2027-03-01', starturi: Array.from({ length: 9 }, (_, i) => dupaSesiuni(cal, '2026-10-16', i * 5).zi), k: 5, perioade: 8, notate: 40, asteptate: 40 });
  assert.equal(gata.optimist, dupaSesiuni(cal, dupaSesiuni(cal, '2026-10-16', 7 * 5).zi, 5).zi);
  for (const x of [gol, doi, rau, gata]) { assert.match(x.optimist, /^\d{4}-\d{2}-\d{2}$/); assert.match(x.realist, /^\d{4}-\d{2}-\d{2}$/); assert.ok(x.realist >= x.optimist); }
});

test('judecata: forma din contract (la, data, verdict, unic) — null până la judecată', () => {
  assert.deepEqual(judecata({ la: 8 }), { la: 8, data: null, verdict: null, unic: true });
  assert.deepEqual(judecata({ la: 20, data: '2027-06-01', verdict: 'ajuta', unic: false }), { la: 20, data: '2027-06-01', verdict: 'ajuta', unic: false });
});

test('functieDinText: scoate textul unei funcții (declarație, export, arrow cu acolade, arrow pe un rând, obiect înghețat); lipsa e o eroare', () => {
  const src = ['export function a(x) {', '  return { y: x };', '}', 'const b = (r, s) => { if (r) { return s; } return 0; };', 'const c = (q) => q * 2;', 'export const R = Object.freeze({ k: 1, z: { w: [1, 2] } });', 'function d() {}', ''].join('\r\n');
  assert.equal(functieDinText(src, 'a'), 'function a(x) {\n  return { y: x };\n}');
  assert.equal(functieDinText(src, 'b'), 'const b = (r, s) => { if (r) { return s; } return 0; }');
  assert.equal(functieDinText(src, 'c'), 'const c = (q) => q * 2;');
  assert.equal(functieDinText(src, 'R'), 'const R = Object.freeze({ k: 1, z: { w: [1, 2] } })');
  assert.equal(functieDinText(src, 'd'), 'function d() {}');
  assert.throws(() => functieDinText(src, 'nu'), /nu/);
  assert.throws(() => functieDinText(src, 'dd'), /dd/, 'numele se potrivește întreg, nu ca prefix');
});

test('amprentaText: SHA pe numele + textele funcțiilor cerute (CRLF = LF); o schimbare într-una le schimbă; textul în plus intră și el', () => {
  const src = 'function a() { return 1; }\nfunction b() { return 2; }\n', src2 = src.replace('return 2', 'return 3');
  const h = amprentaText(src, ['a', 'b']);
  assert.match(h, /^[0-9a-f]{12}$/);
  assert.equal(amprentaText(src.replace(/\n/g, '\r\n'), ['a', 'b']), h, 'CRLF și LF dau aceeași amprentă');
  assert.notEqual(amprentaText(src2, ['a', 'b']), h); assert.equal(amprentaText(src2, ['a']), amprentaText(src, ['a']));
  assert.notEqual(amprentaText(src, ['a', 'b'], 'extra'), h);
});
