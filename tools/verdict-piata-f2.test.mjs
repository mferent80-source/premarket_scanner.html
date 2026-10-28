// 28.10.2026 — revizia independentă F2 a lotului F, verdictul pieței:
//  🟡2: permutarea pe episoade avea mărimea bună, dar devenea oarbă la etichete persistente (la sta 0,98, în 70 % din lumi p-ul minim
//       trecea de 0,05 ⇒ „nu ajută” prin construcție). Judecătorul e acum ROTAȚIA (decalaj circular) pe zilele separate ale eșantionului fix:
//       etichetele rămân pe loc, șirul căderilor se rotește — ciorchinii SPY și persistența etichetelor rămân întregi. Mesajul de la
//       „nu ajută” spune puterea („nu s-a dovedit”, nu „s-a dovedit că nu”), nu „tratează-l ca descriere”.
//  🟡3: amprenta regulii acoperă și funcțiile robotului care citesc piața: `item` (media de 50 de zile) și `breadthDin` (lățimea pieței).
//  🟡4: zilele separate închise și judecata se îngheață în verdict-piata-inghetat.jsonl (doar crește) — o noapte fără SPY sau un SPY care
//       nu mai acoperă începutul probei nu mai șterge și nu mai schimbă judecata.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { proba, rotatie, amprentaRegulii, amprentaJudecator, lumeVerdict, REGULA, PROBA, PUTERE, INGHETAT, citesteIstoric, AMPRENTE_V21 } from './verdict-piata-robot.mjs';
import { mulberry32, gauss } from '../lib/proba-contract.mjs';
import { BAZA } from './git-baza.mjs';   // 28.10.2026 (revizia F2, 🔵12): commitul de dinaintea push-ului în poartă, altfel HEAD

const ZI = 86400000, T0 = Date.UTC(2027, 0, 4), dateOf = (t) => new Date(t).toISOString().slice(0, 10);
/** Lumea revizorului: SPY GARCH(1,1) α 0,10, β 0,88, inovații t5; etichete Markov (sta = probabilitatea de a păstra eticheta de ieri),
 *  independente de viitor (H0). */
function lumeGarch(seed, { zile = 1600, pRedus = 0.5, sta = 0.98 } = {}) {
  const R = mulberry32(seed), g = gauss(R), t5 = () => { let s = 0; for (let i = 0; i < 5; i++) { const z = g(); s += z * z; } return (g() / Math.sqrt(s / 5)) * Math.sqrt(3 / 5); };
  const a = 0.1, b = 0.88, w = 1e-4 * (1 - a - b); let s2 = 1e-4, p = 100; const spy = [];
  for (let i = 0; i < 300; i++) { const r = Math.sqrt(s2) * t5(); s2 = w + a * r * r + b * s2; }
  for (let i = 0; i < zile; i++) { const r = Math.sqrt(s2) * t5(); p *= 1 + r; s2 = w + a * r * r + b * s2; spy.push({ t: T0 + i * ZI, c: p }); }
  const linii = []; let red = R() < pRedus; for (let i = 0; i < zile - 6; i++) { if (i && R() > sta) red = R() < pRedus; linii.push({ asOf: dateOf(spy[i].t), generat: 'x', regula: REGULA, label: red ? 'prudent' : 'neutru' }); }
  return { spy, linii };
}

test('🟡2 rotația: etichetele pe loc, căderile rotite cu fiecare decalaj; p = partea decalajelor cel puțin la fel de extreme (decalajul 0 inclus)', () => {
  // 20 de zile „redus” la început, cu cele mai mari căderi, apoi 20 „normal”: doar decalajul 0 e atât de extrem ⇒ p = 1/40
  const rows = Array.from({ length: 40 }, (_, i) => ({ grup: i < 20 ? 'redus' : 'normal', dd: i < 20 ? -5 - i * 0.01 : -1 - (i - 20) * 0.01 }));
  const t = rotatie(rows);
  assert.equal(t.decalaje, 40); assert.equal(t.p, 1 / 40); assert.ok(t.statistica < 0);
  assert.equal(rotatie(rows.map((r) => ({ ...r, grup: 'normal' }))), null, 'un singur grup ⇒ fără test');
  assert.equal(rotatie([{ grup: 'redus', dd: -1 }, ...rows.slice(20)]), null, 'sub 2 zile pe grup ⇒ fără test');
  const inv = rotatie(rows.map((r) => ({ ...r, dd: -r.dd })));
  assert.equal(inv.p, 1, 'efectul invers (căderi MAI MICI după „redus”) ⇒ p = 1, nu „ajută” — testul e unilateral');
});

test('🟡2 proba judecă prin rotație: metoda în fișier, p-ul e al rotației pe eșantionul fix, PROBA.test = „rotatie”', () => {
  // o lume neperiodică cu efect mare (+5 pp de cădere după zilele „redus”). Notă: pe date PERFECT periodice (etichete care alternează și un
  // SPY în blocuri egale) rotația cu pas par reface aceeași potrivire ⇒ p 0,5 — limita e scrisă în protocol; etichetele pieței nu alternează așa.
  const { spy, linii } = lumeVerdict(3, { sta: 0.8, pRedus: 0.3, efect: 5, zile: 700 });
  const r = proba(linii, spy, dateOf, null);
  assert.match(r.test.metoda, /rotație/); assert.equal(r.verdict, 'ajuta'); assert.ok(r.p <= PROBA.alfa); assert.equal(r.test.decalaje, r.redus.n + r.normal.n);
  assert.equal(PROBA.test, 'rotatie');
});

test('🟡2 MĂRIMEA sub H0, cazul în care permutarea orbea (GARCH, sta 0,98, 50 % zile „redus”): rotația rămâne în jur de 5 %', () => {
  // revizia F2, 4000 de lumi: 4,8 %; aici 600 de lumi (eroarea standard ~0,9 pp)
  let aj = 0, gata = 0; for (let w = 0; w < 600; w++) { const { spy, linii } = lumeGarch(41000 + w); const r = proba(linii, spy, dateOf, null); if (!r.judecata.verdict) continue; gata++; if (r.verdict === 'ajuta') aj++; }
  assert.ok(gata >= 580, 'aproape toate lumile ajung la judecată: ' + gata); assert.ok(aj / gata <= 0.07, '„ajută” fals: ' + (100 * aj / gata).toFixed(1) + ' %');
});

test('🟡2 PUTEREA nu se mai prăbușește la etichete persistente: sta 0,95, +1 pp după zilele „redus” (permutarea: 24,5 %, rotația ~35 %)', () => {
  let aj = 0, gata = 0; for (let w = 0; w < 600; w++) { const { spy, linii } = lumeVerdict(900000 + w, { sta: 0.95, pRedus: 0.3, efect: 1, zile: 1500 }); const r = proba(linii, spy, dateOf, null); if (!r.judecata.verdict) continue; gata++; if (r.verdict === 'ajuta') aj++; }
  assert.ok(gata >= 580, 'lumi judecate: ' + gata); assert.ok(aj / gata >= 0.28, 'puterea: ' + (100 * aj / gata).toFixed(1) + ' %');
});

test('🟡2 la „nu ajută”, mesajul spune puterea și că nu s-a dovedit — nu „tratează-l ca descriere”', () => {
  let r = null; for (let w = 0; w < 50 && !r; w++) { const { spy, linii } = lumeVerdict(70 + w, { sta: 0.8, pRedus: 0.3, efect: 0, zile: 700 }); const x = proba(linii, spy, dateOf, null); if (x.verdict === 'nu-ajuta') r = x; }
  assert.ok(r, 'o lume fără efect cu „nu ajută”');
  assert.doesNotMatch(r.mesaj, /tratează-l ca descriere/);
  assert.match(r.mesaj, /nu s-a dovedit/); assert.match(r.mesaj, /1 pp/);
  // revizia F3, 🟡2: banda puterii (etichetele reale urmează trendul SPY ⇒ puterea mult sub cea a etichetelor independente), nu un singur număr
  const u = (x) => (x * 100).toFixed(1).replace('.', ','), b = PUTERE.banda;
  assert.ok(r.mesaj.includes('~' + u(b.min) + '–' + u(b.max) + ' %'), 'banda puterii (' + u(b.min) + '–' + u(b.max) + ' %) e în mesaj'); assert.match(r.mesaj, /urmează trendul SPY/);
});

test('🟡4 judecata se îngheață: o noapte fără SPY și un SPY care nu mai acoperă începutul probei nu o mai șterg și nu o mai schimbă', () => {
  let lume = null, r0 = null; for (let w = 0; w < 30 && !r0; w++) { lume = lumeGarch(51000 + w, { zile: 900, pRedus: 0.4, sta: 0.8 }); const x = proba(lume.linii, lume.spy, dateOf, null); if (x.judecata.verdict) r0 = x; }
  assert.ok(r0, 'o lume care ajunge la judecată');
  const J = amprentaJudecator(), noapte1 = proba(lume.linii, lume.spy, dateOf, null, { inghetate: [], judecator: J });
  assert.equal(noapte1.verdict, r0.verdict); assert.equal(noapte1.p, r0.p, 'înghețul nu schimbă judecata din prima noapte');
  const zile = noapte1.deScris.filter((x) => x.tip === 'zi'), jud = noapte1.deScris.filter((x) => x.tip === 'judecata');
  assert.equal(jud.length, 1, 'judecata se scrie o singură dată'); assert.ok(zile.length <= noapte1.zile && noapte1.zile - zile.length <= 3, 'zilele separate definitive se îngheață; cele din ultimele orizont + 10 sesiuni rămân provizorii (revizia F3, 🔵5)');
  for (const z of zile) { assert.equal(z.regula, REGULA); assert.equal(z.h, PROBA.orizont); assert.ok(Number.isFinite(z.dd) && Number.isFinite(z.r)); }
  assert.equal(jud[0].judecator, J); assert.equal(jud[0].verdict, r0.verdict);
  const ing = JSON.parse(JSON.stringify(noapte1.deScris));
  const faraSpy = proba(lume.linii, [], dateOf, null, { inghetate: ing, judecator: J });
  assert.equal(faraSpy.verdict, r0.verdict, 'noaptea fără SPY: judecata rămâne'); assert.equal(faraSpy.p, r0.p); assert.equal(faraSpy.deScris.length, 0, 'nimic nou de scris');
  const scurt = proba(lume.linii, lume.spy.slice(400), dateOf, null, { inghetate: ing, judecator: J });
  assert.equal(scurt.verdict, r0.verdict, 'SPY fără începutul probei: judecata rămâne'); assert.equal(scurt.p, r0.p);
  assert.equal(scurt.abatereJudecata, null);
  const doua = proba(lume.linii, lume.spy, dateOf, null, { inghetate: ing, judecator: J });
  assert.equal(doua.deScris.filter((x) => x.tip === 'judecata').length, 0, 'a doua noapte nu mai scrie judecata');
});

test('🟡4 zilele înghețate ale altei reguli sau ale altui orizont nu se citesc; judecata altui judecător nu se folosește', () => {
  const { spy, linii } = lumeGarch(52000, { zile: 900, pRedus: 0.4, sta: 0.8 }), J = amprentaJudecator();
  const ing = proba(linii, spy, dateOf, null, { inghetate: [], judecator: J }).deScris;
  const alta = ing.map((x) => ({ ...x, regula: 'rv-altceva' })), altH = ing.map((x) => (x.tip === 'zi' ? { ...x, h: 10 } : x));
  assert.equal(proba(linii, [], dateOf, null, { inghetate: alta, judecator: J }).zile, 0, 'altă regulă ⇒ ignorate');
  assert.equal(proba(linii, [], dateOf, null, { inghetate: altH, judecator: J }).zile, 0, 'alt orizont ⇒ zilele ignorate');
  const altJ = proba(linii, spy, dateOf, null, { inghetate: ing.map((x) => (x.tip === 'judecata' ? { ...x, judecator: 'jv-altul', verdict: 'ajuta', p: 0.001 } : x)), judecator: J });
  assert.notEqual(altJ.p, 0.001, 'judecata altui judecător nu se ia drept a celui de acum');
});

test('🟡4 robotul și fluxul: fișierul înghețat se citește, se completează și se salvează (fiecare fișier separat); fișierul doar crește', () => {
  const src = readFileSync('tools/verdict-piata-robot.mjs', 'utf8');
  assert.match(src, /citesteIstoric\(readFileSync\(INGHETAT, 'utf8'\)\)/); assert.match(src, /appendFileSync\(INGHETAT,/);
  assert.equal(INGHETAT, 'candidate-engine/generated/verdict-piata-inghetat.jsonl');
  const y = readFileSync('.github/workflows/verdict-piata.yml', 'utf8');
  assert.match(y, /node tools\/git-add-existente\.mjs[^\n]*verdict-piata-inghetat\.jsonl/);
  let vechi; try { vechi = execFileSync('git', ['show', BAZA + ':' + INGHETAT], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return; }
  const azi = existsSync(INGHETAT) ? readFileSync(INGHETAT, 'utf8') : '';
  assert.ok(azi.replace(/\r\n/g, '\n').startsWith(vechi.replace(/\r\n/g, '\n')), INGHETAT + ' a fost rescris (doar crește)');
  assert.ok(citesteIstoric(azi).length >= citesteIstoric(vechi).length);
});

test('🟡3 amprenta regulii acoperă și `item` (media de 50 de zile) și `breadthDin` (lățimea pieței) din robot', () => {
  const a = amprentaRegulii(), citeste = (f) => readFileSync(f, 'utf8'), cu = (vechi, nou) => (f) => (f.replace(/\\/g, '/').endsWith('tools/verdict-piata-robot.mjs') ? citeste(f).replace(vechi, nou) : citeste(f));
  assert.ok(citeste('tools/verdict-piata-robot.mjs').includes('closes.slice(-50)'));
  assert.notEqual(amprentaRegulii('.', cu('closes.slice(-50)', 'closes.slice(-51)')), a, 'media de 50 schimbată ⇒ altă amprentă');
  assert.notEqual(amprentaRegulii('.', cu('value: p(h.above50)', 'value: p(h.above200)')), a, 'lățimea pieței schimbată ⇒ altă amprentă');
  assert.equal(amprentaRegulii('.', cu('export function mariDin(', 'export function mariDin(/* afișaj */')), a, 'marile companii (afișaj) nu decid eticheta');
  assert.ok(AMPRENTE_V21.includes(a), 'amprenta de azi e recunoscută ca v2.1 (rândul nou din protocol: acoperire, fără efect pe etichetă)');
});

// ── 🔵19: rândul `rv-3e18543febee` din AMPRENTE_V21 („F&G în afara 0–100 ⇒ semn invalid”) e „fără efect” doar dacă API-ul dă 0–100 — o
//    presupunere despre date, acum verificată de robot: o zi cu F&G în afara 0–100 nu contează la v2.1 (linia poartă amprenta ca regulă) ──
test('🔵19 o zi cu Fear & Greed în afara 0–100 nu contează la regula v2.1 (presupunerea „fără efect” verificată noapte de noapte)', async () => {
  const { regulaLiniei, deRegula, linieZi } = await import('./verdict-piata-robot.mjs');
  const rv = amprentaRegulii(), v = { asOf: '2026-10-28', label: { id: 'neutru' }, score: 0, citite: 6, indicatori: [{ id: 'trend', score: 0 }] };
  for (const x of [0, 55, 100]) assert.equal(regulaLiniei({ valoare: x }, rv, REGULA), REGULA, 'F&G ' + x + ' ⇒ v2.1');
  assert.equal(regulaLiniei(null, rv, REGULA), REGULA, 'F&G lipsă: semnul lipsește, regula nu se schimbă');
  for (const x of [-1, 100.5, 150]) {
    const r = regulaLiniei({ valoare: x }, rv, REGULA); assert.equal(r, rv, 'F&G ' + x + ' ⇒ linia poartă amprenta ca regulă');
    assert.equal(deRegula(linieZi(v, '2026-10-29T05:00:00Z', null, r, rv)), false, 'și rămâne în afara probei v2.1');
  }
  const doc = readFileSync('docs/verdict-piata-protocol.md', 'utf8'); assert.match(doc, /rv-3e18543febee[^\n]*presupunere despre date, verificată de robot/);
});

// ── revizia F3 pe verdictul pieței ──
const sesiuniNYSE = async (de, n) => { const { dupaSesiuni } = await import('../lib/proba-contract.mjs'); const out = [de]; while (out.length < n) out.push(dupaSesiuni(null, out[out.length - 1], 1).zi); return out; };
async function lumeNYSE(seed, { n = 900, pRedus = 0.4, sta = 0.8, gol = null } = {}) {
  const zile = await sesiuniNYSE('2027-01-04', n), R = mulberry32(seed), g = gauss(R); let p = 100; const spy = [], linii = []; let red = R() < pRedus;
  for (let i = 0; i < n; i++) { p *= 1 + 0.01 * g(); if (i !== gol) spy.push({ t: Date.parse(zile[i] + 'T21:00:00Z'), c: p }); if (i < n - 6) { if (i && R() > sta) red = R() < pRedus; linii.push({ asOf: zile[i], generat: 'x', regula: REGULA, label: red ? 'prudent' : 'neutru' }); } }
  return { spy, linii, zile };
}
const calNYSE = { next: () => null };   // fără calendarul bursei din aplicație: numărătoarea NYSE calculată (sărbătorile după regulile bursei)
const cuSursa = (fis, v, n) => (f) => { const s = readFileSync(f, 'utf8'); if (!String(f).split(String.fromCharCode(92)).join('/').endsWith(fis)) return s; assert.ok(s.includes(v), fis + ' nu conține ' + v); return s.replace(v, n); };

test('🔵5 F3 o zi separată se îngheață abia după orizont + 10 sesiuni, iar o fereastră cu o sesiune lipsă din SPY nu se măsoară', async () => {
  const { spy, linii } = await lumeNYSE(61000), J = amprentaJudecator(), idx = new Map(spy.map((b, i) => [dateOf(b.t), i]));
  const r = proba(linii, spy, dateOf, calNYSE, { inghetate: [], judecator: J }), zile = r.deScris.filter((x) => x.tip === 'zi');
  assert.ok(zile.length > 40, 'zile înghețate: ' + zile.length);
  for (const z of zile) assert.ok(idx.get(z.asOf) + PROBA.orizont + PROBA.asteptare < spy.length, 'ziua ' + z.asOf + ' e definitivă');
  const ultima = idx.get(zile[zile.length - 1].asOf); assert.ok(ultima + PROBA.orizont + PROBA.asteptare >= spy.length - 5, 'și se îngheață imediat ce devine definitivă');
  const g = await lumeNYSE(61000, { gol: 300 }), zg = g.zile[300], rg = proba(g.linii, g.spy, dateOf, calNYSE, { inghetate: [], judecator: J });
  const fereastra = (d) => { const i = g.zile.indexOf(d); return i < 300 && i + PROBA.orizont >= 300; };
  assert.ok(!rg.deScris.some((x) => x.tip === 'zi' && fereastra(x.asOf)), 'nicio zi a cărei fereastră cuprinde sesiunea lipsă ' + zg);
});

test('🔵6 F3 judecătorul verdictului e închiderea din sursă: o schimbare în funcțiile din contract chemate de judecată schimbă amprenta', async () => {
  const { amprentaJudecator: aj } = await import('./verdict-piata-robot.mjs');
  const a = aj();
  assert.notEqual(aj(cuSursa('lib/proba-contract.mjs', 'return { la, data, verdict, unic }; }', 'return { la, data, verdict, unic: false }; }')), a, 'contractul `judecata`');
  assert.notEqual(aj(cuSursa('tools/verdict-piata-robot.mjs', 'if (nR < 2 || nN < 2) return null;', 'if (nR < 3 || nN < 3) return null;')), a, 'rotația');
  assert.equal(aj(cuSursa('tools/verdict-piata-robot.mjs', 'laPlus: Object.freeze([Object.freeze({ pct: 0.5, putere: 0.146 })', 'laPlus: Object.freeze([Object.freeze({ pct: 0.5, putere: 0.149 })')), a, 'cifrele puterii nu decid judecata');
});

test('🟡3 F3 amprenta regulii acoperă și pregătirea seriilor (VIX9D, HYG, IEF…); dependențele (seriile zilnice, robotul, aducătorul) se notează pe linie (`d`)', async () => {
  const { amprentaDependinteVerdict, linieZi, pregatestePiata } = await import('./verdict-piata-robot.mjs');
  const citeste = (f) => readFileSync(f, 'utf8');
  const a = amprentaRegulii(), d = amprentaDependinteVerdict('.', citeste);
  assert.match(d, /^dep-[0-9a-f]{12}$/);
  assert.notEqual(amprentaRegulii('.', cuSursa('tools/verdict-piata-robot.mjs', 'raw[s].map((b) => ({ t: b.t, c: b.c }))', 'raw[s].slice(0, -1).map((b) => ({ t: b.t, c: b.c }))')), a, 'pregătirea seriilor extra schimbată ⇒ altă amprentă');
  assert.equal(amprentaRegulii('.', cuSursa('lib/daily-series.js', 'b.t>now+60000', 'b.t>now+6000000')), a, 'seriile zilnice nu sunt în regulă…');
  assert.notEqual(amprentaDependinteVerdict('.', cuSursa('lib/daily-series.js', 'b.t>now+60000', 'b.t>now+6000000')), d, '… dar se văd în `d`');
  assert.notEqual(amprentaDependinteVerdict('.', cuSursa('tools/clasificator-date.mjs', "range = '5y'", "range = '1y'")), d, 'intervalul aducătorului se vede în `d`');
  const p = pregatestePiata({ VIX9D: [{ t: 1, c: 2, o: 9 }] }, ['VIX9D', 'HYG'], null, 5);
  assert.deepEqual(p.serii, { VIX9D: [{ t: 1, c: 2 }] }); assert.deepEqual(p.erori, ['HYG']); assert.equal(p.la, 5);
  const v = { asOf: '2026-10-28', label: { id: 'neutru' }, score: 0, citite: 6, indicatori: [{ id: 'trend', score: 0 }] };
  assert.equal(linieZi(v, '2026-10-29T05:00:00Z', null, REGULA, a, d).d, d, 'linia poartă `d`');
  const src = citeste('tools/verdict-piata-robot.mjs'); assert.ok(src.includes('linieZi(v, generat, regim, regulaZi, rv, amprentaDependinteVerdict(radacina))')); assert.ok(src.includes('pregatestePiata(raw, MV.EXTRA, fg, now)'));
  assert.ok(AMPRENTE_V21.includes(a), 'rândul nou (acoperire) e în tabel');
});

test('🟡4 F3 robotul dă probei fișierul înghețat: o noapte prin `ruleaza`, fără SPY, păstrează judecata din fișier și nu mai scrie nimic', async () => {
  const { ruleaza } = await import('./verdict-piata-robot.mjs');
  const J = amprentaJudecator(), zile = await sesiuniNYSE('2027-01-04', 400);
  const ing = []; for (let k = 0; k < 40; k++) ing.push({ tip: 'zi', regula: REGULA, h: PROBA.orizont, asOf: zile[k * 5], grup: k % 2 ? 'normal' : 'redus', dd: -1 - (k % 3) * 0.1, r: 0.1 });
  const tz = rotatie(ing.map((x) => ({ grup: x.grup, dd: x.dd })));
  ing.push({ tip: 'judecata', regula: REGULA, judecator: J, la: 20, data: zile[205], verdict: 'nu-ajuta', p: tz.p, test: { metoda: 'rotație pe zilele separate (decalaj circular)', decalaje: 40 }, zile: ing.map((x) => x.asOf) });
  const bare = () => { const out = Array.from({ length: 30 }, (_, i) => ({ t: Date.parse('2025-07-01T13:30:00Z') + i * 86400000, o: 1, h: 1, l: 1, c: 1, v: 1 })); Object.defineProperty(out, 'meta', { value: { symbol: 'X', regularEnd: null } }); return out; };
  const fetchImpl = async () => ({ ok: true, json: async () => ({ data: [] }) }), now = Date.parse('2028-05-16T12:00:00Z');
  const { j, deScris } = await ruleaza({ sursa: async () => bare(), fetchImpl, now, istoric: [], inghetate: ing });
  assert.equal(j.proba.verdict, 'nu-ajuta', 'judecata vine din fișier'); assert.equal(j.proba.p, tz.p); assert.equal(deScris.length, 0, 'nimic nou de scris');
  const src = readFileSync('tools/verdict-piata-robot.mjs', 'utf8');
  assert.ok(src.includes('await ruleaza({ log: console.log, istoric, inghetate })'), 'main dă fișierul înghețat lui `ruleaza`');
  assert.ok(src.includes("deScris.some((x) => x.tip === 'zi' && ultimaIng && !(x.asOf > ultimaIng))"), 'main verifică: zilele noi sunt după ultima înghețată');
});

test('🔵13 F3 o judecată care nu se mai potrivește cu zilele înghețate se spune în mesajul probei, cu p în format românesc', async () => {
  const J = amprentaJudecator(), zile = await sesiuniNYSE('2027-01-04', 400);
  const ing = []; for (let k = 0; k < 40; k++) ing.push({ tip: 'zi', regula: REGULA, h: PROBA.orizont, asOf: zile[k * 5], grup: k % 2 ? 'normal' : 'redus', dd: k % 2 ? -1 : -3 - k * 0.001, r: 0.1 });
  ing.push({ tip: 'judecata', regula: REGULA, judecator: J, la: 20, data: zile[205], verdict: 'nu-ajuta', p: 0.48387096774, zile: [] });
  const r = proba([], [], dateOf, null, { inghetate: ing, judecator: J });
  assert.ok(r.abatereJudecata, 'abaterea e găsită'); assert.match(r.mesaj, /nu se mai potrivește/); assert.match(r.abatereJudecata, /p 0,484/); assert.doesNotMatch(r.abatereJudecata, /0\.4838/);
});
