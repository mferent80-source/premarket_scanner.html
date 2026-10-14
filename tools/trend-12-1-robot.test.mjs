// Robotul „Trend 12 luni”, partea a doua (14.10.2026, „fă tot”): I-621 raportările din calendarul Finnhub (secretul din Actions),
// I-615 ieșirile din top 20 %, I-617 mesajul Discord doar la schimbare, I-619 garda de formă a fișierelor publicate,
// I-614 bilanțul probei pe istoric (20/60 z față de SPY și față de restul universului din acea zi).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { raporteazaDinCalendar, iesiri, intrari, mesajDiscord, validareFisiere, bilant, liniaIstoric } from './trend-12-1-lib.mjs';

function serie(n, pantaZi, { pret0 = 100, start = Date.UTC(2025, 0, 1) } = {}) {
  const out = []; let t = start, c = pret0;
  while (out.length < n) { t += 86400000; const zi = new Date(t).getUTCDay(); if (zi === 0 || zi === 6) continue; c = c * (1 + pantaZi); out.push({ t, o: c, h: c * 1.01, l: c * 0.99, c, v: 1e6 }); }
  return out;
}
const zi = (t) => new Date(t).toISOString().slice(0, 10);

test('raporteazaDinCalendar: ziua si ora raportarii pe simbol, zilele numarate de la data clasamentului, fara cele non-US', () => {
  const cal = [{ symbol: 'AAA', date: '2026-10-20', hour: 'amc' }, { symbol: 'BBB', date: '2026-10-15', hour: 'bmo' }, { symbol: 'CCC.HK', date: '2026-10-16' }, { symbol: 'AAA', date: '2027-01-20' }];
  const r = raporteazaDinCalendar(cal, '2026-10-13');
  assert.deepEqual(r.AAA, { d: '2026-10-20', ora: 'amc', zile: 7 }); assert.deepEqual(r.BBB, { d: '2026-10-15', ora: 'bmo', zile: 2 });
  assert.equal(r['CCC.HK'], undefined); assert.equal(Object.keys(r).length, 2, 'prima raportare a simbolului, nu ultima');
});

test('iesiri si intrari fata de ziua dinainte: cazut sub top 20 %, momentum <= 0, lipsa din univers, regim oprit', () => {
  const prev = { d: '2026-10-12', regim: true, top: [['A', 1.2], ['B', 0.9], ['C', 0.8], ['D', 0.7]] };
  const clasat = [{ s: 'A', rang: 0.01, m12: 1.1 }, { s: 'B', rang: 0.35, m12: 0.5 }, { s: 'C', rang: 0.05, m12: -0.1 }, { s: 'E', rang: 0.02, m12: 1.0 }];
  const r = iesiri(prev, clasat, { peste: true });
  assert.deepEqual(r.map((x) => [x.s, x.motiv]), [['B', 'a căzut la top 35,0 %'], ['C', 'momentum 12-1 sub zero'], ['D', 'a ieșit din univers']]);
  assert.deepEqual(intrari(prev, [{ s: 'A' }, { s: 'E' }]).map((x) => x.s), ['E']);
  const ro = iesiri(prev, clasat, { peste: false });
  assert.equal(ro.length, 4); assert.ok(ro.every((x) => x.motiv === 'regimul s-a oprit (SPY sub media pe 200 de zile)'));
  assert.deepEqual(iesiri(null, clasat, { peste: true }), [], 'fără ziua dinainte, nimic de comparat');
});

test('mesajDiscord: gol cand nu s-a schimbat nimic; altfel regim + intrari + iesiri + cine raporteaza, sub 1.900 de caractere', () => {
  assert.equal(mesajDiscord({ dataUltimei: '2026-10-13', regim: { peste: true }, regimPrev: true, intrari: [], iesiri: [], raporteaza: [] }), '');
  const m = mesajDiscord({ dataUltimei: '2026-10-13', regim: { peste: true }, regimPrev: true, intrari: [{ s: 'E', m12: 1.0 }], iesiri: [{ s: 'B', motiv: 'a căzut la top 35,0 %' }], raporteaza: [{ s: 'A', zile: 1, ora: 'amc' }] });
  assert.match(m, /Trend 12 luni · 2026-10-13/); assert.match(m, /regim pornit/); assert.match(m, /intrat: E \(\+100 %\)/); assert.match(m, /ieșit: B — a căzut/); assert.match(m, /raportează: A în 1z/);
  const flip = mesajDiscord({ dataUltimei: '2026-10-13', regim: { peste: false }, regimPrev: true, intrari: [], iesiri: [], raporteaza: [] });
  assert.match(flip, /regim OPRIT/);
  const lung = mesajDiscord({ dataUltimei: '2026-10-13', regim: { peste: true }, regimPrev: true, intrari: Array.from({ length: 200 }, (_, i) => ({ s: 'S' + i, m12: 1 })), iesiri: [], raporteaza: [] });
  assert.ok(lung.length <= 1900);
});

test('validareFisiere: JSON-ul si istoricul publicate au forma ceruta; o stricaciune e numita', () => {
  const bun = { versiune: 1, la: '2026-10-14T06:23:00Z', dataUltimei: '2026-10-13', regim: { inchidere: 778, sma200: 723, peste: true }, univers: { n: 588 }, clasament: [{ s: 'A', pret: 10, m12: 1, m6: 0.5, rang: 0, spark: [1, 2] }] };
  const ist = JSON.stringify({ d: '2026-10-13', regim: true, n: 588, top: [['A', 1]] }) + '\n';
  assert.deepEqual(validareFisiere(bun, ist), []);
  assert.ok(validareFisiere({ ...bun, dataUltimei: '2026-13-40' }, ist).some((p) => /dataUltimei/.test(p)));
  assert.ok(validareFisiere({ ...bun, clasament: [{ s: 'A' }] }, ist).some((p) => /clasament/.test(p)));
  assert.ok(validareFisiere(bun, ist + '{stricat\n').some((p) => /istoric/.test(p)));
  assert.ok(validareFisiere(bun, JSON.stringify({ d: '2026-10-10', top: [] }) + '\n').some((p) => /ultima zi/.test(p)));
  assert.ok(validareFisiere({ ...bun, regim: { peste: 'da' } }, ist).some((p) => /regim/.test(p)));
});

test('fisierele publicate de robot trec garda de forma', () => {
  const j = 'candidate-engine/generated/trend-12-1.json', i = 'candidate-engine/generated/trend-12-1-istoric.jsonl';
  if (!existsSync(j) || !existsSync(i)) return;
  assert.deepEqual(validareFisiere(JSON.parse(readFileSync(j, 'utf8')), readFileSync(i, 'utf8')), []);
});

test('bilant: pe zilele cu 20/60 de zile de bursa dupa ele, excesul primelor 20 fata de SPY si fata de universul zilei; verdict dupa criterii', () => {
  const spy = serie(400, 0.0005), bun = serie(400, 0.003), slab = serie(400, -0.001), mediu = serie(400, 0.0005);
  const preturi = { SPY: spy, BUN: bun, SLAB: slab, MEDIU: mediu };
  const istoric = []; for (let k = 250; k < 400 - 61; k += 5) istoric.push({ d: zi(spy[k].t), regim: true, n: 3, top: [['BUN', 1.5]], univers: ['BUN', 'SLAB', 'MEDIU'] });
  const r = bilant(istoric, preturi, { h: [20, 60] });
  assert.equal(r.zile, istoric.length); assert.ok(r.n20 === istoric.length && r.n60 === istoric.length);
  assert.ok(r.exces20 > 0 && r.exces60 > r.exces20, 'BUN bate SPY, mai mult pe 60 z');
  assert.ok(r.nulB20 < r.exces20, 'media universului (cu SLAB) e sub primele 20');
  assert.ok(r.interval20[0] <= r.exces20 && r.exces20 <= r.interval20[1]);
  assert.equal(r.verdict, 'în probă', 'sub 30 de zile cu rezultat ⇒ încă în probă');
  const mult = []; for (let k = 250; k < 400 - 61; k += 2) mult.push({ d: zi(spy[k].t), regim: true, n: 3, top: [['BUN', 1.5]], univers: ['BUN', 'SLAB', 'MEDIU'] });
  const r2 = bilant(mult, preturi, { h: [20, 60] });
  assert.ok(r2.n20 >= 30); assert.equal(r2.verdict, 'probat față de alte acțiuni');
  const gol = bilant([{ d: zi(spy[399].t), regim: true, n: 3, top: [['BUN', 1]], univers: ['BUN'] }], preturi, { h: [20, 60] });
  assert.equal(gol.n20, 0); assert.equal(gol.verdict, 'în probă');
});

test('liniaIstoric poarta si universul zilei (pentru nulul B de mai tarziu)', () => {
  const rez = { dataUltimei: '2026-10-14', n: 3, clasament: [{ s: 'A', m12: 1 }], clasate: ['A', 'B', 'C'] };
  const l = liniaIstoric(rez, { peste: true });
  assert.deepEqual(l.univers, ['A', 'B', 'C']); assert.equal(l.top.length, 1);
});
