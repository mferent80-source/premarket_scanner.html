// 18.10.2026 — Proba în timp a Reguli V1 (docs/v1-proba-protocol.md). Mărimea testului e verificată pe prețuri ALEATORII înainte de
// orice verdict (lecția 17.10: Newey-West dădea 9–12% „dovezi” false la 5%); puterea, pe un avantaj plantat.
// 27.10.2026 — v2 (I-741 / I-743): judecata UNICĂ la perioadele cerute (eșantion fix), puterea scrisă în protocol, versiunea = SHA pe regulile
// V1 + evaluator, delistatele ies la ultima închidere, nejudecatele se numără; câmpurile de contract (putere / primulVerdict / judecata).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { PROTOCOL, inregistrare, adauga, excese, pSemne, starturi, evalueaza, judeca, simuleaza, perioadeDin, versiuneV1, amprentaEvaluator, FUNCTII_V1, FUNCTII_EVALUATOR, contract, contractProba, putere, marimeSemneAR } from '../lib/v1-proba.mjs';
import { calendarSUA, amprentaScrisa } from '../lib/proba-contract.mjs';

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function zile(n) { const out = []; let d = Date.parse('2026-01-05T12:00:00Z'); while (out.length < n) { const x = new Date(d); if (x.getUTCDay() % 6) out.push(x.toISOString().slice(0, 10)); d += 86400000; } return out; }
const V = 'experimental-1.0.0';
/** Lume sintetică: 40 de acțiuni, reperul SPY; în fiecare zi fiecare acțiune primește la întâmplare 3–8 verificări trecute.
    avantaj = randament în plus pe sesiune pentru grupul SUS, în sesiunile de după ziua notată. */
function lume(seed, { sesiuni = 8 * 5 + 6, k = 5, avantaj = 0, nAct = 40 } = {}) {
  const rnd = mulberry32(seed), d = zile(sesiuni), gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const spy = [{ d: d[0], c: 100 }]; for (let i = 1; i < sesiuni; i++) spy.push({ d: d[i], c: spy[i - 1].c * (1 + 0.01 * gauss()) });
  const serii = { SPY: spy }, jurnal = { zile: [] }, simboluri = Array.from({ length: nAct }, (_, i) => 'S' + i);
  const trecute = d.map(() => simboluri.map(() => 3 + Math.floor(rnd() * 6)));
  for (const [j, s] of simboluri.entries()) { const a = [{ d: d[0], c: 50 }]; for (let i = 1; i < sesiuni; i++) { const start = Math.floor((i - 1) / k) * k, bonus = trecute[start][j] >= PROTOCOL.pragSus ? avantaj : 0; a.push({ d: d[i], c: a[i - 1].c * (1 + (spy[i].c / spy[i - 1].c - 1) + 0.02 * gauss() + bonus) }); } serii[s] = a; }
  for (let i = 0; i < sesiuni; i++) jurnal.zile.push({ zi: d[i], v: V, la: d[i] + 'T22:00:00Z', r: simboluri.map((s, j) => [s, trecute[i][j] === 8 ? 'm' : 'n', trecute[i][j], d[i], 'SPY']) });
  return { jurnal, serii, sesiuni: d };
}
const ev = (w, k = 5, o = {}) => evalueaza(w.jurnal, w.serii, { k, versiune: V, sesiuni: w.sesiuni, judecaLa: 8, ...o });

test('the day record keeps verdict, checks passed, EOD date and benchmark; the same day is replaced, never duplicated; v2 takes the SHA version', () => {
  const rep = { version: V, items: [{ symbol: 'AAPL', verdict: 'rules_not_met', passed: 6, sourceDate: '2026-10-16', metrics: { benchmarkSymbol: 'SPY' } }, { symbol: 'SAP.DE', verdict: 'research_match', passed: 8, sourceDate: '2026-10-16', metrics: { benchmarkSymbol: '^STOXX' } }, { symbol: 'X', verdict: 'unverifiable', passed: 0, sourceDate: null, metrics: {} }] };
  const r = inregistrare(rep, Date.parse('2026-10-16T22:00:00Z'));
  assert.equal(r.zi, '2026-10-16'); assert.deepEqual(r.r[1], ['SAP.DE', 'm', 8, '2026-10-16', '^STOXX']); assert.equal(r.r[2][1], 'u'); assert.equal(r.v, V);
  assert.equal(inregistrare(rep, Date.now(), 'v1-abc').v, 'v1-abc', 'v2: amprenta SHA înlocuiește șirul constant');
  let j = adauga({ zile: [] }, r); j = adauga(j, { ...r, la: 'altă rulare' }); assert.equal(j.zile.length, 1); assert.equal(j.zile[0].la, 'altă rulare');
  j = adauga(j, { ...r, v: 'v1-abc' }); assert.equal(j.zile.length, 2, 'altă versiune = altă probă (jurnalul v1 rămâne sub versiunea veche)');
  assert.equal(j.protocol, 'v1-proba-2');
  assert.equal(inregistrare({ version: V, items: [{ symbol: 'X', verdict: 'unverifiable' }] }).zi, null);
});
test('excess return uses the stock’s own k sessions and the benchmark on the same dates (last price ≤ date for another calendar)', () => {
  const serii = { A: [{ d: '2026-01-05', c: 100 }, { d: '2026-01-06', c: 101 }, { d: '2026-01-07', c: 110 }], B: [{ d: '2026-01-05', c: 50 }, { d: '2026-01-06', c: 51 }] };
  const jurnal = { zile: [{ zi: '2026-01-05', v: V, r: [['A', 'n', 6, '2026-01-05', 'B'], ['A', 'u', 0, '2026-01-05', 'B']] }, { zi: '2026-01-06', v: 'alta', r: [['A', 'n', 6, '2026-01-06', 'B']] }] };
  const e = excese(jurnal, serii, 2, V); assert.equal(e.length, 1); assert.ok(Math.abs(e[0].ex - (0.10 - 0.02)) < 1e-12);
  assert.equal(excese(jurnal, serii, 3, V).length, 0, 'fără k sesiuni după ziua notată nu se calculează nimic');
});
test('v2: delisted stocks (no data after horizon + 10 sessions) exit at the last known close and are marked; no series at all ⇒ unjudged with a reason, counted', () => {
  const s = zile(40), spy = s.map((d, i) => ({ d, c: 100 + i }));
  const A = spy.map((x) => ({ d: x.d, c: 50 + 0.5 * (x.c - 100) })), DEL = A.slice(0, 3), ZI = A.slice(0, 1);
  const jurnal = { zile: [{ zi: s[0], v: V, r: [['A', 'n', 7, s[0], 'SPY'], ['DEL', 'n', 7, s[0], 'SPY'], ['LIPSA', 'n', 3, s[0], 'SPY'], ['ZI', 'n', 3, s[0], 'SPY']] }] };
  const fara = excese(jurnal, { SPY: spy, A, DEL, ZI }, 5, V); assert.deepEqual(fara.map((x) => x.sym), ['A'], 'fără calendar: doar ce are k sesiuni (ca înainte)');
  const scurt = excese(jurnal, { SPY: spy, A, DEL, ZI }, 5, V, { sesiuni: s.slice(0, 10) }); assert.deepEqual(scurt.map((x) => x.sym), ['A'], 'înainte de orizont + 10 sesiuni se mai așteaptă');
  const e = excese(jurnal, { SPY: spy, A, DEL, ZI }, 5, V, { sesiuni: s });
  const del = e.find((x) => x.sym === 'DEL'); assert.equal(del.oprit, s[2]); assert.ok(Number.isFinite(del.ex), 'delistata iese la ultima închidere');
  assert.match(e.find((x) => x.sym === 'LIPSA').nejudecat, /fără serie/); assert.equal(e.find((x) => x.sym === 'LIPSA').ex, null);
  assert.match(e.find((x) => x.sym === 'ZI').nejudecat, /oprit în ziua notată/);
  const o = evalueaza(jurnal, { SPY: spy, A, DEL, ZI }, { k: 5, versiune: V, sesiuni: s, inSus: () => true, judecaLa: 8 });
  assert.equal(o.descriptiv.nejudecate.n, 2); assert.equal(o.descriptiv.oprite, 1); assert.ok(o.descriptiv.nejudecate.motive['fără serie (delistată sau sursă indisponibilă)'] === 1);
});
test('only non-overlapping periods count, and the exact sign test matches the binomial', () => {
  const s = zile(30); assert.deepEqual(starturi([s[0], s[1], s[4], s[5], s[10]], s, 5), [s[0], s[5], s[10]]);
  assert.equal(pSemne(8, 8), 1 / 256); assert.equal(pSemne(7, 8), 9 / 256); assert.equal(pSemne(0, 8), 1); assert.equal(pSemne(0, 0), 1);
});
test('no verdict before the required periods: one logged day is “wait”; the protocol requires more than 8 at the principal horizon (power)', () => {
  const w = lume(1, { sesiuni: 6 }), o = ev(w);
  assert.equal(o.verdict, 'astept'); assert.equal(o.necesare, 8); assert.ok(o.perioade < 8); assert.deepEqual(o.judecata, { la: 8, data: null, verdict: null, unic: true });
  const implicit = evalueaza(w.jurnal, w.serii, { k: 20, versiune: V, sesiuni: w.sesiuni });
  assert.equal(implicit.necesare, PROTOCOL.perioadeCerute[20]); assert.ok(PROTOCOL.perioadeCerute[20] > 8 && PROTOCOL.perioadeCerute[5] > 8, 'v2: puterea la 8 perioade e sub 50 % ⇒ se cer mai multe');
});
test('v2: the verdict is given ONCE, on the first N periods; later periods only feed the monitoring and never change it', () => {
  const w = lume(21, { sesiuni: 14 * 5 + 6, avantaj: 0.004 }), o = ev(w);
  assert.ok(o.perioade >= 12, 'lumea are peste 8 perioade: ' + o.perioade); assert.equal(o.necesare, 8); assert.equal(o.judecata.la, 8); assert.equal(o.judecata.unic, true);
  assert.equal(o.judecata.verdict, o.verdict); assert.equal(o.judecata.data, w.sesiuni[w.sesiuni.indexOf(o.starturi[7]) + 5], 'data judecății = închiderea perioadei a 8-a');
  assert.equal(o.monitorizare.perioade, o.perioade); assert.equal(o.monitorizare.dupaJudecata, o.perioade - 8);
  // aceleași prime 8 perioade ⇒ același verdict, oricât ar urma după (eșantion fix): jurnalul tăiat după a 8-a perioadă dă aceeași judecată
  const taiat = { zile: w.jurnal.zile.filter((z) => z.zi <= o.starturi[7]) }, o8 = evalueaza(taiat, w.serii, { k: 5, versiune: V, sesiuni: w.sesiuni, judecaLa: 8 });
  assert.equal(o8.perioade, 8); assert.equal(o8.verdict, o.verdict); assert.equal(o8.pozitive, o.pozitive); assert.equal(o8.p, o.p);
  const r = judeca([{ dif: 1 }, { dif: 1 }, { dif: -1 }], 8); assert.equal(r.verdict, 'astept'); assert.equal(r.gata, false);
  assert.equal(judeca(Array.from({ length: 8 }, () => ({ dif: 0.01 })), 8).verdict, 'ajuta'); assert.equal(judeca(Array.from({ length: 8 }, (_, i) => ({ dif: i < 5 ? 0.01 : -0.01 })), 8).verdict, 'fara-avantaj');
  assert.equal(judeca(Array.from({ length: 9 }, (_, i) => ({ dif: i === 8 ? -5 : 0.01 })), 8).verdict, 'ajuta', 'a 9-a perioadă nu intră în judecată');
  // persistența (scrisă înainte): autocorelarea de ordinul 1 a celor N diferențe; de la 0,2 un „ajută” are rezerve (mărimea ar fi ~6–7 %)
  const sir = judeca([0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08].map((dif) => ({ dif })), 8), alt = judeca([0.01, 0.03, 0.01, 0.03, 0.01, 0.03, 0.01, 0.03].map((dif) => ({ dif })), 8);
  assert.ok(sir.persistenta > 0.2 && /persistență/.test(sir.rezerve), 'un șir crescător are persistență: ' + sir.persistenta); assert.ok(alt.persistenta < 0 && alt.rezerve === null);
  assert.equal(judeca([{ dif: 1 }], 8).persistenta, null, 'fără judecată, fără persistență');
});
test('SIZE: on random prices with no edge, “V1 helps” appears in at most 5% of worlds (fixed sample of 8)', () => {
  let fals = 0, cu8 = 0; const N = 600;
  for (let s = 1; s <= N; s++) { const w = lume(1000 + s), o = ev(w); if (o.perioade >= 8) cu8++; if (o.verdict === 'ajuta') fals++; }
  assert.ok(cu8 > N * 0.9, 'lumea sintetică produce 8 perioade: ' + cu8); assert.ok(fals / N <= 0.05, 'dovezi false: ' + (100 * fals / N).toFixed(1) + '%');
});
test('POWER (sanity): a large planted edge for the ≥6/8 group is found most of the time; a negative edge never becomes “helps”', () => {
  let gasit = 0; const N = 200;
  for (let s = 1; s <= N; s++) { const w = lume(5000 + s, { avantaj: 0.004 }), o = ev(w); if (o.verdict === 'ajuta') gasit++; }
  assert.ok(gasit / N >= 0.7, 'găsit în ' + (100 * gasit / N).toFixed(0) + '% din lumi');
  const w = lume(77, { avantaj: -0.004 }), o = ev(w);
  assert.equal(o.verdict, 'fara-avantaj'); assert.ok(o.medieDif < 0);
});
test('POWER (I-741, written before): the simulated worlds have daily records and real groups; at +1 %/period the required N reaches ≥ 50 %, at 8 it does not; the written numbers come from ≥ 2000 worlds', () => {
  const lumeS = simuleaza(3, { k: 5, perioade: 10, avantaj: 0.01, verificate: 65, sus: 16 });
  assert.equal(lumeS.jurnal.zile.length, 10 * 5 + 5 + 1, 'o înregistrare pe FIECARE sesiune, ca jurnalul real'); assert.equal(lumeS.jurnal.zile[0].r.length, 65);
  assert.equal(lumeS.jurnal.zile[0].r.filter((r) => r[2] >= PROTOCOL.pragSus).length, 16, 'grupul SUS ca în jurnal (16 din 65)');
  // lumea are perioade·k + k + 1 sesiuni ⇒ se închid perioade + 1 perioade (ultima e rezerva grilei; judecata ia doar primele N)
  const { perioade } = perioadeDin(lumeS.jurnal, lumeS.serii, { k: 5, versiune: lumeS.versiune, sesiuni: lumeS.sesiuni }); assert.equal(perioade.length, 11);
  const r = putere({ k: 5, lumi: 60, grila: [8, PROTOCOL.perioadeCerute[5]], verificate: 65, sus: 16 });
  assert.ok(r.rezultate[8]['0'] <= 0.1 && r.rezultate[PROTOCOL.perioadeCerute[5]]['0'] <= 0.1, 'fals pozitiv mic');
  assert.ok(r.rezultate[PROTOCOL.perioadeCerute[5]]['1'] > r.rezultate[8]['1'], 'mai multe perioade ⇒ mai multă putere');
  assert.ok(r.rezultate[PROTOCOL.perioadeCerute[5]]['1'] >= 0.35, 'la N cerut, +1 % se vede în cel puțin ~jumătate din lumi (60 de lumi: ' + r.rezultate[PROTOCOL.perioadeCerute[5]]['1'] + ')');
  const f = 'docs/proba-putere-2026-10-27.json'; assert.ok(existsSync(f), 'cifrele scrise înainte: ' + f);
  const doc = JSON.parse(readFileSync(f, 'utf8'));
  for (const k of [5, 20]) { const x = doc.v1[k]; assert.ok(x.lumi >= 2000); assert.equal(x.cerute.laPlus1, PROTOCOL.perioadeCerute[k], 'perioadele cerute pentru k=' + k + ' sunt cele din simulare'); assert.ok(x.rezultate[8]['1'] < 0.5, 'la 8 perioade puterea e sub 50 %'); }
  assert.deepEqual(PROTOCOL.putere.rezultate, Object.fromEntries([5, 20].map((k) => [k, { '0.5': doc.v1[k].rezultate[PROTOCOL.perioadeCerute[k]]['0.5'], '1': doc.v1[k].rezultate[PROTOCOL.perioadeCerute[k]]['1'] }])), 'PROTOCOL.putere.rezultate = cifrele din fișier la N cerut');
});
test('I-743: the version is a SHA on the V1 rules (independent-scanner.js, transitive closure) AND on the evaluator; display texts are not rules', () => {
  const src = readFileSync('lib/independent-scanner.js', 'utf8'), v = versiuneV1(src);
  assert.match(v, /^v1-[0-9a-f]{12}$/); assert.equal(versiuneV1(src.replace(/\r\n/g, '\n')), v, 'CRLF = LF');
  assert.notEqual(versiuneV1(src.replace('rsiMin: 45', 'rsiMin: 46')), v, 'o regulă schimbată ⇒ altă versiune (proba repornește)');
  assert.notEqual(versiuneV1(src.replace('function ema(xs, n) {', 'function ema(xs, n) { n = n + 0;')), v, 'un indicator schimbat ⇒ altă versiune');
  assert.equal(versiuneV1(src.replace("VERSION = 'experimental-1.0.0'", "VERSION = 'experimental-9'")), v, 'șirul de afișaj nu e regulă');
  assert.equal(versiuneV1(src.replace("data: 'Date și identitate verificate'", "data: 'Date verificate'")), v, 'eticheta unei verificări nu e regulă');
  for (const n of ['RULES', 'IDS', 'evaluate', 'check', 'finish', 'verifiedSource', 'verifiedIndex', 'benchmarkSource', 'regionOf', 'ema', 'rsi', 'atr']) assert.ok(FUNCTII_V1(src).includes(n), n);
  for (const n of ['LABELS', 'rule', 'VERSION', 'scan']) assert.ok(!FUNCTII_V1(src).includes(n), 'nu e regulă: ' + n);
  assert.match(amprentaEvaluator(), /^[0-9a-f]{12}$/);
  for (const n of ['excesRec', 'indexLa', 'laData', 'excese', 'pSemne', 'starturi', 'perioadeDin', 'judeca', 'evalueaza', 'medie']) assert.ok(FUNCTII_EVALUATOR.includes(n), 'evaluatorul acoperă ' + n);
});
test('SIZE with persistence (written before): the fixed-sample sign test at the required N is exact when periods are independent; positive autocorrelation inflates it — the numbers go in the protocol', () => {
  const r0 = marimeSemneAR({ rho: 0, N: 16, lumi: 4000, samanta: 5 }), r3 = marimeSemneAR({ rho: 0.3, N: 16, lumi: 4000, samanta: 5 });
  assert.ok(Math.abs(r0 - pSemne(12, 16)) < 0.012, 'ρ = 0 ⇒ coada binomială exactă (' + r0 + ' față de ' + pSemne(12, 16) + ')');
  assert.ok(r3 > r0, 'persistența umflă mărimea: ' + r3 + ' > ' + r0);
  const doc = JSON.parse(readFileSync('docs/proba-putere-2026-10-27.json', 'utf8'));
  for (const k of [5, 20]) { const m = doc.marime?.[k]; assert.ok(m && m.lumi >= 4000, 'mărimea la k=' + k + ' scrisă cu ≥ 4000 de lumi'); assert.equal(m.N, PROTOCOL.perioadeCerute[k]); assert.ok(m.rho['0'] <= 0.05, 'fără persistență ≤ 5 %'); }
});
test('the contract with the panels: putere.laPlus, primulVerdict from the NYSE calendar, judecata', () => {
  const cal = calendarSUA('.'), w = lume(5, { sesiuni: 12 }), o = ev(w), c = contract(o, { cal, azi: '2026-10-27', notate: 2, asteptate: 7 });
  assert.deepEqual(c.putere.laPlus.map((x) => x.pct), [0.5, 1]); assert.ok(c.putere.laPlus.every((x) => x.putere === null || (x.putere >= 0 && x.putere <= 1)));
  assert.match(c.primulVerdict.optimist, /^\d{4}-\d{2}-\d{2}$/); assert.ok(c.primulVerdict.realist >= c.primulVerdict.optimist); assert.match(c.primulVerdict.motiv, /8 perioade de 5 sesiuni/);
  assert.deepEqual(c.judecata, o.judecata);
});
test('the robot JSON (contract with lot D): every horizon and the top level carry putere / primulVerdict / judecata; missed sessions push the realistic date', () => {
  const cal = calendarSUA('.'), w = lume(5, { sesiuni: 12 }), V2 = V;
  const or = [5, 20].map((k) => evalueaza(w.jurnal, w.serii, { k, versiune: V2, sesiuni: w.sesiuni }));
  // jurnalul are 12 zile la rând ⇒ nicio sesiune pierdută; tăiem 3 zile din mijloc ⇒ 3 pierdute din cele așteptate
  const toate = contractProba(or, { jurnal: w.jurnal, versiune: V2, cal, azi: '2026-10-27' }), lipsa = contractProba(or, { jurnal: { zile: w.jurnal.zile.filter((_, i) => i < 4 || i > 6) }, versiune: V2, cal, azi: '2026-10-27' });
  for (const x of [toate, lipsa]) {
    for (const o of x.orizonturi) { assert.ok(o.putere && Array.isArray(o.putere.laPlus) && o.primulVerdict && o.judecata); assert.equal(o.judecata.unic, true); assert.equal(o.judecata.la, PROTOCOL.perioadeCerute[o.k]); }
    const p = x.orizonturi.find((o) => o.principal); assert.deepEqual(x.putere, p.putere); assert.deepEqual(x.primulVerdict, p.primulVerdict); assert.deepEqual(x.judecata, p.judecata);
    assert.match(x.primulVerdict.optimist, /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.equal(toate.primulVerdict.realist, toate.primulVerdict.optimist); assert.ok(lipsa.primulVerdict.realist > lipsa.primulVerdict.optimist, 'sesiunile pierdute împing data realistă');
  assert.match(lipsa.primulVerdict.motiv, /pierdut \d+ din \d+ sesiuni/);
  // lumea de test notează zile lucrătoare; calendarul NYSE sare 19.01.2026 (Martin Luther King) ⇒ 11 sesiuni așteptate
  assert.deepEqual(toate.sesiuni, { notate: 12, asteptate: 11 }); assert.deepEqual(lipsa.sesiuni, { notate: 9, asteptate: 11 });
});
test('the V1 robot writes the SHA version, the precedent probe and the contract fields (pure builder, no network)', async () => {
  const { continutProba, versiuneaDeAzi } = await import('./v1-jurnal.mjs');
  assert.equal(versiuneaDeAzi('.'), versiuneV1(readFileSync('lib/independent-scanner.js', 'utf8')));
  const w = lume(5, { sesiuni: 12 }), cal = calendarSUA('.'), rec = { zi: w.sesiuni.at(-1), la: '2026-01-21T22:00:00Z', r: [['A', 'n', 7, w.sesiuni.at(-1), 'SPY'], ['B', 'm', 8, w.sesiuni.at(-1), 'SPY'], ['C', 'u', 0, null, null]] };
  const j = continutProba({ jurnal: w.jurnal, V, rec, report: { verifiedCount: 2, items: [1, 2, 3] }, serii: w.serii, sesiuni: w.sesiuni, cal, azi: '2026-10-27' });
  assert.equal(j.protocol, 'v1-proba-2'); assert.equal(j.versiune, V); assert.equal(j.precedent.id, 'v1-proba-1'); assert.match(j.precedent.nota, /rămân/);
  assert.equal(j.zile, 12); assert.deepEqual(j.azi, { verificate: 2, total: 3, indeplinesc: 1, sus: 2 });
  assert.ok(j.putere && j.primulVerdict && j.judecata && j.sesiuni); assert.equal(j.orizonturi.length, 2); assert.ok(j.orizonturi.every((o) => o.putere && o.primulVerdict && o.judecata));
});
test('I-743 in the robot flow: the V1 rules of today are the ones of the running probe (until the first v2 run, the file is still the precedent)', async () => {
  const { versiuneaDeAzi } = await import('./v1-jurnal.mjs'), f = 'scanner-verdicts/generated/v1-proba.json'; if (!existsSync(f)) return;
  const j = JSON.parse(readFileSync(f, 'utf8'));
  // 27.10.2026 (revizia F, 🟡5): până la prima rulare v2, amprenta de azi trebuie să fie cea scrisă în protocol (tabelul „Amprentele v2”)
  if (j.protocol === PROTOCOL.precedent.id) { assert.equal(j.versiune, PROTOCOL.precedent.versiune); assert.equal(versiuneaDeAzi('.'), amprentaScrisa(readFileSync('docs/v1-proba-protocol.md', 'utf8'), 'v1'), 'amprenta V1 de azi nu e cea scrisă în protocolul v2'); return; }
  assert.equal(j.protocol, PROTOCOL.id); assert.equal(versiuneaDeAzi('.'), j.versiune, 'regulile V1 sau evaluatorul s-au schimbat fără protocol nou: o regulă nouă cere o probă nouă (scrie-o întâi în docs/v1-proba-protocol.md)');
});
test('the frozen universe is the 85-symbol Core list of the original scanner', async () => {
  const src = readFileSync('candidate-engine/engine.js', 'utf8');
  const lista = (n) => [...src.match(new RegExp('var ' + n + ' = \\[([\\s\\S]*?)\\];'))[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...PROTOCOL.univers], [...lista('US_CORE'), ...lista('EU_CORE')]); assert.equal(PROTOCOL.univers.length, 85);
});
