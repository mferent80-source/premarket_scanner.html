// 17.10.2026 — robotul Verdictului pieței (I-676 / I-677 / I-681).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ruleaza, proba, mariDin, breadthDin, adaugaLinie, citesteIstoric, motorVerdict, linieZi, deRegula, contractVerdict, amprentaJudecator, rataAjuta, PUTERE, FISIER, ISTORIC, VERSIUNE, REGULA } from './verdict-piata-robot.mjs';

const zi = (i) => Date.UTC(2026, 0, 5) + i * 86400000, dateOf = (t) => new Date(t).toISOString().slice(0, 10);
test('I-681: marile companii — primele 15 după capitalizare, cu ziua și momentul raportării', () => {
  const zile = [['2026-10-20', [{ symbol: 'GE', marketCap: '$323,719,496,000', time: 'time-pre-market' }, { symbol: 'MIC', marketCap: '$1,000,000', time: 'time-after-hours' }]], ['2026-10-21', [{ symbol: 'META', marketCap: '$1,800,000,000,000', time: 'time-after-hours' }, { symbol: 'X', marketCap: 'N/A' }]]];
  const m = mariDin(zile, 2); assert.equal(JSON.stringify(m.map((x) => x.symbol)), JSON.stringify(['GE', 'META'])); assert.equal(m[0].cand, 'înainte de deschidere');
});
test('I-676: prima notare a zilei rămâne; zilele neconfirmate nu se notează', () => {
  const l = [{ asOf: '2026-10-16', label: 'prudent' }];
  assert.equal(adaugaLinie(l, { asOf: '2026-10-16', label: 'defensiv' }), null); assert.equal(adaugaLinie(l, { asOf: '2026-10-19', label: 'necunoscut' }), null);
  assert.equal(adaugaLinie(l, { asOf: '2026-10-19', label: 'neutru' }).label, 'neutru');
});
test('I-677: proba — „în probă” sub minim; „ajută” când zilele Prudent / Defensiv au căderi mai mari pe zile separate', () => {
  const spy = []; let p = 100; for (let i = 0; i < 700; i++) { const rau = Math.floor(i / 5) % 2 === 0; p *= rau ? 0.995 + (i % 3) * 0.0005 : 1.003 - (i % 3) * 0.0005; spy.push({ t: zi(i), c: p }); }
  const linii = spy.slice(0, 690).filter((_, i) => i % 5 === 0).map((b, k) => ({ asOf: dateOf(b.t), generat: 'x', regula: REGULA, label: k % 2 === 0 ? 'prudent' : 'neutru' }));
  assert.equal(proba(linii.slice(0, 10), spy, dateOf, null).verdict, 'in-proba');
  const r = proba(linii, spy, dateOf, null); assert.equal(r.verdict, 'ajuta'); assert.ok(r.redus.cadere < r.normal.cadere); assert.ok(r.redus.n >= 20 && r.normal.n >= 20);
  const inv = proba(linii.map((l) => ({ ...l, label: l.label === 'prudent' ? 'neutru' : 'prudent' })), spy, dateOf, null); assert.equal(inv.verdict, 'nu-ajuta');
});
// 27.10.2026 — I-743 + judecata unică (protocolul, § „Schimbări” din 27.10, scris înaintea oricărui verdict: 1 zi „redus”, 0 „normal”)
const spyH0 = (seed, n) => { let a = seed; const r = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); const spy = []; let p = 100; for (let i = 0; i < n; i++) { p *= 1 + 0.01 * g(); spy.push({ t: zi(i), c: p }); } return { spy, r }; };
test('I-743: each new history line carries the rule version; the probe counts only lines of the current rule (16.10, before the 17.10 revision, stays history)', () => {
  assert.equal(REGULA, 'v2.1');
  const v = { asOf: '2026-10-27', label: { id: 'neutru' }, score: 0, citite: 6, indicatori: [{ id: 'trend', score: 0 }] };
  assert.equal(linieZi(v, '2026-10-28T05:00:00Z', null).regula, 'v2.1');
  assert.equal(deRegula({ generat: '2026-10-17T10:25:37.241Z' }), false, '16.10, notat înainte de revizia din 17.10'); assert.equal(deRegula({ generat: '2026-10-20T05:25:31Z' }), true);
  assert.equal(deRegula({ regula: 'v2.1', generat: 'x' }), true); assert.equal(deRegula({ regula: 'v9', generat: '2026-11-01T05:00:00Z' }), false); assert.equal(deRegula({ generat: 'x' }), false, 'fără regulă și fără oră ⇒ nu se poate ști');
  const { spy } = spyH0(3, 60), linii = [{ asOf: dateOf(spy[0].t), generat: '2026-10-17T10:00:00Z', label: 'defensiv' }, { asOf: dateOf(spy[10].t), generat: '2026-10-20T05:00:00Z', label: 'neutru' }];
  const p = proba(linii, spy, dateOf, null); assert.equal(p.redus.n + p.normal.n, 1); assert.deepEqual(p.excluse, { n: 1, zile: [dateOf(spy[0].t)], motiv: 'notate sub altă regulă decât v2.1' });
});
test('one judgment (fixed sample): the verdict is given when BOTH groups first reach 20 separated days and never changes after; later days are monitoring only', () => {
  // primele 40 de zile separate: căderi egale (nu ajută); apoi zilele „redus” cad mult (ar ieși „ajută” dacă s-ar rejudeca)
  const spy = []; let p = 100; for (let i = 0; i < 900; i++) { const bloc = Math.floor(i / 5), rau = bloc % 2 === 0 && bloc >= 40; p *= rau ? 0.99 : 1 + ((i % 3) - 1) * 0.004; spy.push({ t: zi(i), c: p }); }
  const linii = spy.slice(0, 890).filter((_, i) => i % 5 === 0).map((b, k) => ({ asOf: dateOf(b.t), generat: 'x', regula: REGULA, label: k % 2 === 0 ? 'prudent' : 'neutru' }));
  const r = proba(linii, spy, dateOf, null);
  assert.equal(r.verdict, 'nu-ajuta'); assert.deepEqual([r.redus.n, r.normal.n], [20, 20], 'judecata pe eșantionul fix');
  assert.equal(r.judecata.unic, true); assert.equal(r.judecata.la, 20); assert.equal(r.judecata.verdict, 'nu-ajuta'); assert.match(r.judecata.data, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(r.monitorizare.redus.n > 20 && r.monitorizare.redus.cadere < r.monitorizare.normal.cadere, 'după judecată se vede doar ca monitorizare');
  assert.match(r.mesaj, /o singură dată/);
});
test('SIZE (written before, 2000 worlds, mulberry32): with labels unrelated to the future, the one-time Welch judgment says “ajută” in ≤ 6 %; nightly re-judging would say it far more often', () => {
  let fix = 0, oric = 0; const L = 2000;
  for (let w = 0; w < L; w++) {
    const { spy, r } = spyH0(9000 + w, 506); let red = r() < 0.3; const linii = [];
    for (let i = 0; i < 500; i++) { if (i && r() > 0.8) red = r() < 0.3; linii.push({ asOf: dateOf(spy[i].t), generat: 'x', regula: REGULA, label: red ? 'prudent' : 'neutru' }); }
    const p = proba(linii, spy, dateOf, null); if (p.verdict === 'ajuta') fix++; if (p.monitorizare.ajutaOricand) oric++;
  }
  assert.ok(fix / L <= 0.06, 'judecata unică: ' + (100 * fix / L).toFixed(1) + ' %'); assert.ok(oric / L > fix / L + 0.02, 'rejudecarea zilnică minte mai des: ' + (100 * oric / L).toFixed(1) + ' %');
});
test('contract with the panels (lot D): putere / primulVerdict / judecata in the verdict file; the judge fingerprint is written', () => {
  const { spy } = spyH0(5, 40), linii = spy.slice(0, 30).filter((_, i) => i % 5 === 0).map((b, k) => ({ asOf: dateOf(b.t), generat: 'x', regula: REGULA, label: k % 3 ? 'neutru' : 'prudent' }));
  const c = contractVerdict(proba(linii, spy, dateOf, null), { cal: motorVerdict('.').ExchangeCalendar, azi: '2026-10-27' });
  assert.ok(Array.isArray(c.putere.laPlus) && c.putere.laPlus.length === 2 && c.putere.laPlus.every((x) => x.putere > 0 && x.putere <= 1)); assert.match(c.putere.unitate, /cădere/);
  assert.match(c.primulVerdict.optimist, /^\d{4}-\d{2}-\d{2}$/); assert.ok(c.primulVerdict.realist >= c.primulVerdict.optimist); assert.match(c.primulVerdict.motiv, /20 de zile separate/);
  assert.deepEqual(c.judecata, { la: 20, data: null, verdict: null, unic: true });
  assert.match(amprentaJudecator(), /^jv-[0-9a-f]{12}$/);
});
test('the written power is the one the real judge gives (2000 worlds, fixed seed): +1 pp extra drop after “redus” days; size 4 %', () => {
  assert.equal(Math.round(1000 * rataAjuta({ lumi: 2000, efect: 1 })) / 1000, PUTERE.laPlus[1].putere);
  assert.equal(Math.round(1000 * rataAjuta({ lumi: 2000, efect: 0 })) / 1000, PUTERE.marime);
});
test('lățimea pieței din raportul publicat: participarea, peste media de 200, sectoarele și rândurile motorului', () => {
  if (!existsSync('market-breadth/data/latest.json')) return;
  const { breadth, raport } = breadthDin(JSON.parse(readFileSync('market-breadth/data/latest.json', 'utf8')));
  assert.equal(breadth.state, 'ready'); assert.ok(Number.isFinite(breadth.above50) && Number.isFinite(breadth.above200)); assert.ok(Array.isArray(raport.sectors));
});
test('robotul cap-coadă pe date controlate: verdict, linie de istoric, fișier cu forma bună (fără rețea)', async () => {
  const c = motorVerdict('.'), N = 320, bare = (f) => { const out = Array.from({ length: N }, (_, i) => ({ t: Date.parse('2025-07-01T13:30:00Z') + i * 86400000, o: f(i), h: f(i) * 1.01, l: f(i) * 0.99, c: f(i), v: 1e6 })); Object.defineProperty(out, 'meta', { value: { symbol: 'X', exchange: 'NMS', timezone: 'America/New_York', regularEnd: null, provider: 'Yahoo Finance', currency: 'USD', interval: '1d' } }); return out; };
  const sursa = async (s) => bare((i) => (s === '^VIX' ? 18 : s === '^TNX' ? 4 : 100 + i * 0.1));
  const fetchImpl = async () => ({ ok: true, json: async () => ({ data: [] }) });
  const { j, linie } = await ruleaza({ sursa, fetchImpl, now: Date.parse('2026-05-16T12:00:00Z') });
  assert.equal(j.version, VERSIUNE); assert.ok(['favorabil', 'neutru', 'prudent', 'defensiv', 'necunoscut'].includes(j.label)); assert.ok(Array.isArray(j.indicatori) && j.indicatori.length === 6);
  assert.ok(c.MarketVerdict); if (linie) { assert.equal(linie.asOf, j.asOf); assert.equal(linie.regula, REGULA); }
  assert.equal(j.regula, REGULA); assert.equal(j.judecator, amprentaJudecator()); assert.ok(j.putere && j.primulVerdict && j.judecata && j.judecata.unic === true); // contractul cu lotul D
});
test('garda: fișierul publicat (dacă există) are forma bună; istoricul doar crește față de ultimul commit', () => {
  if (existsSync(FISIER)) { const j = JSON.parse(readFileSync(FISIER, 'utf8')); assert.equal(j.version, VERSIUNE); assert.ok(Array.isArray(j.indicatori) && Array.isArray(j.istoric) && j.proba && typeof j.proba.mesaj === 'string'); }
  let vechi = null; try { vechi = execFileSync('git', ['show', 'HEAD:' + ISTORIC], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).replace(/\r\n/g, '\n'); } catch { return; } // 27.10: buffer peste 1 MiB (lecția clasificatorului)
  const azi = existsSync(ISTORIC) ? readFileSync(ISTORIC, 'utf8').replace(/\r\n/g, '\n') : ''; assert.ok(azi.startsWith(vechi), 'istoricul verdictului a fost rescris, nu doar crescut');
  assert.ok(citesteIstoric(azi).every((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.asOf)));
});
test('I-686: cursul BNR din fișierul anual — lei pentru o unitate, multiplicatorul împărțit', async () => {
  const { cursDin } = await import('./verdict-piata-robot.mjs');
  const x = cursDin('<DataSet><Body><Cube date="2026-10-16"><Rate currency="EUR">5.3368</Rate><Rate currency="USD">4.7430</Rate><Rate currency="HUF" multiplier="100">1.3</Rate></Cube></Body></DataSet>');
  assert.equal(x['2026-10-16'].EUR, 5.3368); assert.equal(x['2026-10-16'].USD, 4.743); assert.equal(x['2026-10-16'].HUF, undefined);
});
