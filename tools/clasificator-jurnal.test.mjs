import test from 'node:test';
import assert from 'node:assert/strict';
import { PRAG, PROBA, regim, ziua, adauga, citeste, incheie, zileDin, bilant, bilantDoua, deScris, incarca, laTimp, integritate, notaIntegritate, nopti, raportVerdict, test as testNW } from './clasificator-jurnal.mjs';
import { motor } from './clasificator-date.mjs';

const dateOf = (t) => new Date(t).toISOString().slice(0, 10);
const zi = (i) => Date.UTC(2026, 0, 1) + i * 86400000;
const vot = (k, p) => ({ algos: { vote: { classIndex: k, support: p } }, state: 'no-edge', close: 100, atrPct: 2, ret5: 0, prior: [0.3, 0.4, 0.3] });
const V = (c = 100) => ({ k: 2, p: [0.1, 0.2, 0.7], c, a: 2, r5: 0, pr: [0.3, 0.4, 0.3] });
const cal = motor('.').ExchangeCalendar;

test('I-643: prima notare a zilei rămâne înghețată pentru fiecare motor; alt motor are linia lui (I-674)', () => {
  const j = { asOf: '2026-01-10', generat: 'x', motor: 'm', entries: { A: vot(2, [0.1, 0.2, 0.7]) } };
  const l1 = adauga([], ziua(j, 'sus')), l2 = adauga(l1, ziua({ ...j, entries: { A: vot(0, [0.7, 0.2, 0.1]) } }, 'sus'));
  assert.equal(l1, l2); assert.equal(l2[0].voturi.A.k, 2); assert.equal(l2[0].regim, 'sus');
  assert.equal(adauga(l2, ziua({ ...j, motor: 'm2' }, 'sus')).length, 2);
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

test('I-671: testul pe toate zilele — la decalaj 0 e testul obișnuit; suprapunerea mărește eroarea', () => {
  const xs = Array.from({ length: 200 }, (_, i) => 0.01 + 0.05 * Math.sin(i / 3)), a = testNW(xs, 0), b = testNW(xs, 5);
  assert.equal(a.n, 200); assert.ok(b.p > a.p, 'zilele suprapuse (autocorelate) cer mai multă prudență');
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
test('I-650: Holm pe două ținte — amândouă la α/2; ținta de 20 cere 252 de zile, decalaj 20', () => {
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
