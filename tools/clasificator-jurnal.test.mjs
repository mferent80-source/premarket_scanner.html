import test from 'node:test';
import assert from 'node:assert/strict';
import { PRAG, PROBA, regim, ziua, adauga, citeste, incheie, zileDin, bilant, bilantDoua, deScris, incarca, laTimp, integritate, notaIntegritate, nopti, raportVerdict, test as testNW } from './clasificator-jurnal.mjs';
import { motor } from './clasificator-date.mjs';

const dateOf = (t) => new Date(t).toISOString().slice(0, 10);
const zi = (i) => Date.UTC(2026, 0, 1) + i * 86400000;
const vot = (k, p) => ({ algos: { vote: { classIndex: k, support: p } }, state: 'no-edge', close: 100, atrPct: 2, ret5: 0, prior: [0.3, 0.4, 0.3] });
const V = (c = 100) => ({ k: 2, p: [0.1, 0.2, 0.7], c, a: 2, r5: 0, pr: [0.3, 0.4, 0.3] });
const cal = motor('.').ExchangeCalendar;

test('I-643: prima notare a fiecărei acțiuni rămâne înghețată; o rulare ulterioară completează doar ce lipsea; alt motor are linia lui (I-674)', () => {
  const j = { asOf: '2026-01-10', generat: 'x', motor: 'm', entries: { A: vot(2, [0.1, 0.2, 0.7]) } };
  const r1 = adauga([], ziua(j, 'sus')), r2 = adauga(r1.linii, ziua({ ...j, entries: { A: vot(0, [0.7, 0.2, 0.1]) } }, 'sus'));
  assert.equal(r1.nou.length, 1); assert.equal(r2.nou.length, 0); assert.equal(r2.linii[0].voturi.A.k, 2); assert.equal(r2.linii[0].regim, 'sus');
  const r3 = adauga(r2.linii, ziua({ ...j, generat: 'y', entries: { A: vot(0, [0.7, 0.2, 0.1]), B: vot(1, [0.2, 0.6, 0.2]) } }, 'sus'));
  assert.deepEqual(Object.keys(r3.nou[0].voturi), ['B']); assert.equal(r3.nou[0].completare, true); assert.equal(r3.nou[0].generat, 'y');
  assert.equal(adauga(r3.linii, ziua({ ...j, motor: 'm2' }, 'sus')).nou.length, 1);
  // O zi cu completare = o singură zi la judecată (rândurile ambelor linii).
  const rez = [{ m: 'm', asOf: '2026-01-10', h: 5, s: 'A', y: 2, pnl: 1 }, { m: 'm', asOf: '2026-01-10', h: 5, s: 'B', y: 1, pnl: 0 }];
  const z = zileDin(r3.linii, rez); assert.equal(z.length, 1); assert.deepEqual(z[0].rows.map((x) => x.s), ['A', 'B']);
});

test('I-672: rezultatul se îngheață la încheierea orizontului; un split nu-l schimbă; delistata iese la ultima închidere; fără serie ⇒ nejudecat', () => {
  const b = Array.from({ length: 20 }, (_, i) => ({ t: zi(i), o: 100, h: 101, l: 99.5, c: 100, v: 2e6 }));
  b[8].c = 103; // +3% în 5 sesiuni, ATR 2% ⇒ +1,5 ATR ⇒ Long
  const L = [{ motor: PROBA, asOf: dateOf(zi(3)), regim: 'jos', voturi: { A: V(), SPLIT: V(200), DEL: V(), LIPSA: V() } }, { motor: PROBA, asOf: dateOf(zi(17)), voturi: { A: V() } }];
  const split = b.map((x) => ({ ...x, o: x.o, c: x.c })), del = b.slice(0, 6); // DEL: seria s-a oprit după 2 sesiuni
  const serii = { A: b, SPLIT: split, DEL: del };
  // Până la orizont + 10 sesiuni, voturile fără date așteaptă.
  let r = incheie(L, [], serii, dateOf, { sesiuniDupa: () => 6 });
  assert.deepEqual(r.map((x) => x.s).sort(), ['A', 'SPLIT']);
  const a = r.find((x) => x.s === 'A'); assert.equal(a.y, 2); assert.ok(Math.abs(a.pnl - (3 - 0.4)) < 1e-9); assert.equal(a.r, undefined);
  const s = r.find((x) => x.s === 'SPLIT'); assert.equal(s.y, a.y); assert.equal(s.pnl, a.pnl); assert.equal(s.r, 0.5); // prețurile rescalate lasă urmă, nu schimbă rezultatul
  // A doua noapte nu le mai notează o dată; după așteptare, delistata iese la ultima închidere, lipsa e „nejudecată”.
  const r2 = incheie(L, r, serii, dateOf, { sesiuniDupa: (d) => (d === L[0].asOf ? 16 : 1) });
  assert.deepEqual(r2.map((x) => x.s).sort(), ['DEL', 'LIPSA']);
  assert.equal(r2.find((x) => x.s === 'DEL').oprit, dateOf(zi(5))); assert.match(r2.find((x) => x.s === 'LIPSA').nejudecat, /fără serie/);
  // Zilele de judecat iau votul și rezultatul înghețat, fără nejudecate.
  const z = zileDin(L, r.concat(r2)); assert.equal(z.length, 1); assert.deepEqual(z[0].rows.map((x) => x.s).sort(), ['A', 'DEL', 'SPLIT']);
});

test('I-668: notarea contează doar înainte de deschiderea sesiunii următoare', () => {
  assert.equal(laTimp({ asOf: '2026-10-16', generat: '2026-10-17T05:11:00Z' }, cal), true); // sâmbătă dimineața
  assert.equal(laTimp({ asOf: '2026-10-16', generat: '2026-10-19T13:29:00Z' }, cal), true); // luni 09:29 la New York
  assert.equal(laTimp({ asOf: '2026-10-16', generat: '2026-10-19T13:31:00Z' }, cal), false); // după deschidere
  assert.equal(laTimp({ asOf: '2026-10-16', generat: 'x' }, cal), false);
});

test('I-660 + I-668: se judecă doar motorul în probă; versiunile vechi, notările târzii și sesiunile lipsă se numără și se spun', () => {
  const L = [{ motor: 'holdings-clf-v4', asOf: '2026-10-15', generat: '2026-10-15T23:30:00Z', voturi: { A: V() } },
    { motor: PROBA, asOf: '2026-10-16', generat: '2026-10-17T05:11:00Z', voturi: { A: V() } },
    { motor: PROBA, asOf: '2026-10-20', generat: '2026-10-21T14:00:00Z', voturi: { A: V() } }]; // târzie
  const now = Date.parse('2026-10-21T23:30:00Z'), x = integritate(L, [], { cal, now });
  assert.equal(x.din, '2026-10-16'); assert.equal(x.zileAlte, 1); assert.deepEqual(x.alteVersiuni, ['holdings-clf-v4']); assert.equal(x.tarzii, 1);
  assert.deepEqual(x.lipsa, ['2026-10-19', '2026-10-20', '2026-10-21']); // 20.10 e notată, dar târziu ⇒ nu contează
  const t = notaIntegritate(x); assert.match(t, /Numărătoarea pentru holdings-clf-v5 a pornit la 16\.10; 1 zi din holdings-clf-v4 rămâne doar istoric/); assert.match(t, /Sesiuni nenotate: 3/); assert.match(t, /după deschiderea sesiunii următoare/);
  const { b5 } = bilantDoua(L, [], { cal, now }); assert.equal(b5.zileNotate, 1); assert.equal(b5.integritate.motor, PROBA); assert.match(b5.nota, /a pornit la 16\.10/);
  const n = nopti(L, cal, now); assert.equal(n.length, 10); assert.equal(n.at(-1).zi, '2026-10-21'); assert.deepEqual(n.filter((y) => y.notat).map((y) => y.zi), ['2026-10-16', '2026-10-20']); assert.equal(n.find((y) => y.zi === '2026-10-20').laTimp, false);
  assert.equal(integritate(L, [{ m: PROBA, nejudecat: 'x' }, ...Array.from({ length: 9 }, () => ({ m: PROBA, y: 1 }))], { cal, now }).rezerve, true); // 10% nejudecate ⇒ rezerve
});

test('I-662 + I-669: fișiere pe motor și lună; scrierea e doar la coadă; citirea le adună pe toate', () => {
  const noi = { voturi: [{ motor: PROBA, asOf: '2026-10-16', voturi: { A: V() } }, { motor: PROBA, asOf: '2026-11-02', voturi: { A: V() } }], rezultate: [{ m: PROBA, asOf: '2026-10-16', h: 5, s: 'A', y: 1, pnl: 0.1 }] };
  const w = deScris(noi); assert.deepEqual([...w.keys()].sort(), ['candidate-engine/generated/clasificator-jurnal/holdings-clf-v5/rezultate-2026-10.jsonl', 'candidate-engine/generated/clasificator-jurnal/holdings-clf-v5/voturi-2026-10.jsonl', 'candidate-engine/generated/clasificator-jurnal/holdings-clf-v5/voturi-2026-11.jsonl']);
  const fs = new Map([...w.entries()].map(([k, v]) => ['./' + k, v])), mock = { existsSync: (p) => [...fs.keys()].some((k) => k.startsWith(p)), readdirSync: (p) => [...new Set([...fs.keys()].filter((k) => k.startsWith(p + '/')).map((k) => k.slice(p.length + 1).split('/')[0]))], readFileSync: (p) => fs.get(p) };
  const j = incarca(mock, '.'); assert.equal(j.voturi.length, 2); assert.equal(j.rezultate.length, 1); assert.equal(j.voturi[0].asOf, '2026-10-16');
});

test('I-671 (revizia 17.10): testul pe 8 perioade cu pauze — perioade egale, pauzele lăsate deoparte, t cu 7 grade de libertate', async () => {
  const { tcdf, tq } = await import('./clasificator-jurnal.mjs');
  assert.ok(Math.abs(tcdf(1.895, 7) - 0.95) < 1e-3); assert.ok(Math.abs(tq(0.975, 7) - 2.365) < 1e-3);
  const xs = Array.from({ length: 180 }, (_, i) => 0.01 + 0.05 * Math.sin(i / 3)), r = testNW(xs, { pauza: 4 });
  assert.equal(r.grupe, 8); assert.equal(r.zilePeGrupa, Math.floor((180 - 4 * 7) / 8)); assert.ok(r.p > 0 && r.p < 1);
  assert.equal(testNW(xs.slice(0, 20), { pauza: 4 }).p, 1, 'prea puține zile pentru 8 perioade ⇒ nicio concluzie');
});
// 27.10.2026 — auditul F: mărimea testului „simulată înainte” (4,8–5,4 % în protocol) nu era reproductibilă în depozit; acum e, cu sămânță fixă.
test('SIZE (in the repo, 4000 worlds, mulberry32): the 8-period test with h−1 gaps holds ~5 % on overlapping days (with and without persistence)', async () => {
  const { mulberry32, gauss } = await import('../lib/proba-contract.mjs');
  const rata = (h, n, rho, seed) => { const g = gauss(mulberry32(seed)); let fals = 0; const L = 4000;
    for (let w = 0; w < L; w++) { const soc = []; let a = 0; for (let i = 0; i < n + h; i++) { a = rho * a + Math.sqrt(1 - rho * rho) * g(); soc.push(a); }
      const xs = []; for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < h; k++) s += soc[i + k]; xs.push(s / h); } // ziua i vede orizontul i…i+h−1 (zile suprapuse)
      if (testNW(xs, { pauza: h - 1 }).p < 0.05) fals++; }
    return fals / L; };
  for (const [h, n] of [[5, 180], [20, 252]]) for (const rho of [0, 0.3]) { const r = rata(h, n, rho, 1700 + h + Math.round(rho * 10)); assert.ok(r > 0.03 && r < 0.07, `h=${h}, ρ=${rho}: ${(100 * r).toFixed(1)} %`); }
});
test('I-743: the judge fingerprint covers the code that judges (transitive closure of bilantDoua / incheie), not the display text', async () => {
  const { amprentaJudecator, FUNCTII_JUDECATOR } = await import('./clasificator-jurnal.mjs');
  assert.match(amprentaJudecator(), /^jc-[0-9a-f]{12}$/);
  for (const n of ['rezultat', 'incheie', 'zileDin', 'momentum', 'costFor', 'test', 'tcdf', 'judeca', 'clasament', 'bilant', 'bilantDoua', 'laTimp', 'integritate', 'PRAG', 'TINTE']) assert.ok(FUNCTII_JUDECATOR().includes(n), n);
  for (const n of ['notaIntegritate', 'lunar', 'mesajZilnic', 'raportVerdict', 'nopti']) assert.ok(!FUNCTII_JUDECATOR().includes(n), 'afișaj: ' + n);
});
test('contract with the panels (lot D): first verdict = the 180th vote noted on time + h sessions; missed nights push the realistic date; judecata is unique', async () => {
  const { contractClasificator } = await import('./clasificator-jurnal.mjs');
  const zile = []; let d = '2026-10-16'; for (let i = 0; i < 7; i++) { zile.push(d); d = cal.next(d, 'US').day; }
  const linii = zile.map((asOf) => ({ asOf, motor: PROBA, generat: asOf + 'T23:30:00Z', voturi: { A: V() } }));
  const b = { verdict: 'in-proba', zileMinime: 180, integritate: { din: zile[0], lipsaTotal: 0 } }, c = contractClasificator(b, { linii, cal, azi: '2026-10-27', h: 5, minim: 180 });
  let x = zile.at(-1); for (let i = 0; i < 173 + 5; i++) x = cal.next(x, 'US')?.day || x; // 173 de voturi de notat + 5 sesiuni de orizont (dincolo de calendar ⇒ aproximativ)
  assert.ok(Math.abs(Date.parse(c.primulVerdict.optimist) - Date.parse(x)) <= 4 * 86400000, c.primulVerdict.optimist + ' ≈ ' + x); assert.equal(c.primulVerdict.realist, c.primulVerdict.optimist);
  const rau = contractClasificator({ ...b, integritate: { din: zile[0], lipsaTotal: 3 } }, { linii, cal, azi: '2026-10-27', h: 5, minim: 180 }); assert.ok(rau.primulVerdict.realist > rau.primulVerdict.optimist); assert.match(rau.primulVerdict.motiv, /3 nopți/);
  assert.deepEqual(c.judecata, { la: 180, data: null, verdict: null, unic: true }); assert.equal(c.putere.laPlus[0].putere, 0.8); assert.match(c.putere.text, /0,007/);
});
test('verdictul se dă o singură dată, pe primele zile (eșantion fix); zilele de după sunt doar descriptive', () => {
  const rea = zile(180, false), buna = zile(200, true).map((z, i) => ({ ...z, asOf: dateOf(zi(400 + i)) }));
  const r = bilant([], rea.concat(buna)); assert.equal(r.verdict, 'nu-tine'); assert.equal(r.zileTest, 380); assert.deepEqual(r.verdictPe, [rea[0].asOf, rea.at(-1).asOf]);
  assert.equal(r.dupaVerdict.zile, 200); assert.ok(r.dupaVerdict.vsFrecvente > 0, 'zilele bune de după apar, dar nu schimbă verdictul');
});

const zile = (n, bun) => Array.from({ length: n }, (_, i) => ({ asOf: dateOf(zi(i)), regim: i < n / 2 ? 'sus' : 'jos', rows: [0, 1, 2].map((y) => ({ y, p: bun ? [0, 1, 2].map((k) => (k === y ? 0.8 : 0.1)) : [0.3, 0.4, 0.3], pr: [0.3, 0.4, 0.3], mom: [0.1, 0.8, 0.1], k: 2, pnl: 0.5 })) }));
test('I-643: sub numărul minim de zile verdictul e „în probă”, oricât de bune par cifrele', () => {
  const r = bilant([], zile(120, true)); assert.equal(r.zileTest, 120); assert.equal(r.verdict, 'in-proba'); assert.match(r.mesaj, /120 din 180/);
});
test('I-643: „ține” doar când bate AMBELE repere; un vot egal cu frecvențele „nu ține”', () => {
  assert.equal(bilant([], zile(200, true)).verdict, 'tine');
  assert.equal(bilant([], zile(200, false)).verdict, 'nu-tine');
});
test('I-647: regimul din SPY față de media de 200 de zile; feliile au verdictul lor', () => {
  const spy = Array.from({ length: 260 }, (_, i) => ({ t: zi(i), c: 100 + i })); assert.equal(regim(spy, dateOf(zi(250)), dateOf), 'sus'); assert.equal(regim(spy, dateOf(zi(100)), dateOf), null);
  const r = bilant([], zile(400, true)); assert.equal(r.regim.sus.verdict, 'tine'); assert.equal(r.regim.jos.verdict, 'tine');
});
test('I-649: clasamentul — primele 10 după „Long” față de media universului; „ordonează” doar după prag', () => {
  const zi30 = (n, bun) => Array.from({ length: n }, (_, i) => ({ asOf: dateOf(zi(i)), regim: 'sus', rows: Array.from({ length: 25 }, (_, k) => ({ s: 'S' + k, y: 1, p: [0.3, 0.4, 0.3 + k / 100], pr: [0.3, 0.4, 0.3], mom: [0.1, 0.8, 0.1], k: 1, pnl: (bun ? k / 10 : 0) + ((i * 7 + k * 3) % 5) / 10 })) }));
  assert.equal(bilant([], zi30(120, true)).clasament.verdict, 'in-proba');
  assert.equal(bilant([], zi30(200, true)).clasament.verdict, 'ordoneaza');
  assert.equal(bilant([], zi30(200, false)).clasament.verdict, 'nu-ordoneaza');
});
test('I-650: Holm pe două ținte — amândouă la α/2; ținta de 20 cere 252 de zile', () => {
  const r = bilantDoua([], []); assert.equal(r.b5.alfa, 0.025); assert.equal(r.b20.alfa, 0.025); assert.equal(r.b20.verdict, 'in-proba'); assert.equal(r.b20.zileMinime, 252); assert.equal(r.b5.zileMinime, 180);
  assert.equal(r.b5.clasament.alfa, 0.025); assert.equal(r.b20.clasament.alfa, 0.025);
});
test('bilanțul lunar: descriptiv, pe luna votului', async () => {
  const { lunar } = await import('./clasificator-jurnal.mjs');
  const z = [{ asOf: '2026-10-20', rows: [{ s: 'A', y: 2, p: [0.1, 0.1, 0.8], pr: [0.3, 0.4, 0.3], mom: [0.1, 0.8, 0.1], pnl: 1 }] }, { asOf: '2026-11-03', rows: [{ s: 'A', y: 0, p: [0.8, 0.1, 0.1], pr: [0.3, 0.4, 0.3], mom: [0.1, 0.8, 0.1], pnl: -1 }] }];
  const l = lunar(z); assert.deepEqual(l.map((x) => x.luna), ['2026-10', '2026-11']); assert.ok(l[0].vsFrecvente > 0); assert.equal(l[0].clasament, null);
});
test('I-659: costul după lichiditate — praguri scrise dinainte, aceeași regulă ca în motor', async () => {
  const { costFor } = await import('./clasificator-jurnal.mjs');
  const vm = await import('node:vm'), { readFileSync } = await import('node:fs'), c = {}; vm.createContext(c);
  for (const f of ['holdings-neural', 'holdings-neural-evaluation', 'holdings-classifier']) vm.runInContext(readFileSync('lib/' + f + '.js', 'utf8'), c);
  const bars = (dv) => Array.from({ length: 30 }, () => ({ c: 100, v: dv / 100 }));
  for (const [dv, cost] of [[2e9, 0.35], [5e8, 0.4], [5e7, 0.6], [1e6, 1.1]]) { assert.ok(Math.abs(costFor(bars(dv), 25) - cost) < 1e-12, String(dv)); assert.ok(Math.abs(c.HoldingsClassifier.costFor(bars(dv), 25) - cost) < 1e-12, 'motor ' + dv); }
});
test('I-657: rezumatul zilnic tace până la un verdict pozitiv; schimbările de verdict se văd', async () => {
  const { mesajZilnic, schimbari } = await import('./clasificator-jurnal.mjs');
  const j = { asOf: '2027-05-10', jurnal: { verdict: 'in-proba', clasament: { verdict: 'in-proba' } }, jurnal20: { verdict: 'in-proba', clasament: { verdict: 'in-proba' } }, clasament: [{ s: 'A' }, { s: 'B' }], clasament20: [{ s: 'B' }] };
  assert.equal(mesajZilnic(j), null);
  const j2 = { ...j, jurnal: { verdict: 'in-proba', clasament: { verdict: 'ordoneaza' } } };
  assert.match(mesajZilnic(j2), /verdict pozitiv pe: clasamentul pe 5 sesiuni[\s\S]*Primele 10 \(5 sesiuni\): A, B ★/);
  assert.deepEqual(schimbari(j, j2), ['clasamentul pe 5: in-proba → ordoneaza']);
});
test('I-663: raportul la verdict apare doar în noaptea în care o probă iese din „în probă”', () => {
  const baza = { asOf: '2027-06-01', motor: PROBA, jurnal: { verdict: 'in-proba', clasament: { verdict: 'in-proba' } }, jurnal20: { verdict: 'in-proba', clasament: { verdict: 'in-proba' } } };
  assert.equal(raportVerdict(baza, baza), null);
  const j = { ...baza, jurnal: { ...bilant([], zile(200, false)), integritate: { motor: PROBA, din: '2026-10-16', zileAlte: 1, alteVersiuni: ['holdings-clf-v4'], lipsa: [], lipsaTotal: 0, tarzii: 0, nejudecate: 0, rezultate: 100 } } };
  const t = raportVerdict(baza, j); assert.match(t, /^# Clasificatorul — verdict 2027-06-01/); assert.match(t, /\*\*ținta de 5\*\*/); assert.match(t, /Verdict:\*\* nu-tine/); assert.match(t, /a pornit la 16\.10/);
  assert.equal(raportVerdict(j, { ...j }), null); // a doua noapte: nu se rescrie
});
test('citeste: liniile stricate sunt sărite', () => { assert.equal(citeste('{"a":1}\nstricat\n{"b":2}\n').length, 2); });
