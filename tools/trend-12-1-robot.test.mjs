// Robotul „Trend 12 luni”, partea a doua (14.10.2026, „fă tot”): I-621 raportările din calendarul Finnhub (secretul din Actions),
// I-615 ieșirile din top 20 %, I-617 mesajul Discord doar la schimbare, I-619 garda de formă a fișierelor publicate,
// I-614 bilanțul probei pe istoric (20/60 z față de SPY și față de restul universului din acea zi).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { raporteazaDinCalendar, iesiri, intrari, mesajDiscord, validareFisiere, bilant, liniaIstoric } from './trend-12-1-lib.mjs';
import { mesajBilant } from './trend-12-1-lib.mjs';

function serie(n, pantaZi, { pret0 = 100, start = Date.UTC(2025, 0, 1) } = {}) {
  const out = []; let t = start, c = pret0;
  while (out.length < n) { t += 86400000; const zi = new Date(t).getUTCDay(); if (zi === 0 || zi === 6) continue; c = c * (1 + pantaZi); out.push({ t, o: c, h: c * 1.01, l: c * 0.99, c, v: 1e6 }); }
  return out;
}
const zi = (t) => new Date(t).toISOString().slice(0, 10);

test('raporteazaDinCalendar: ziua si ora raportarii pe simbol, zilele numarate de la data clasamentului, fara cele non-US', () => {
  const cal = [{ symbol: 'AAA', date: '2026-10-20', hour: 'amc' }, { symbol: 'BBB', date: '2026-10-15', hour: 'bmo' }, { symbol: 'CCC.HK', date: '2026-10-16' }, { symbol: 'AAA', date: '2027-01-20' }];
  const r = raporteazaDinCalendar(cal.concat([{ symbol: 'BRK.B', date: '2026-10-25', hour: 'bmo' }]), '2026-10-13');
  assert.deepEqual(r.AAA, { d: '2026-10-20', ora: 'amc', zile: 7 }); assert.deepEqual(r.BBB, { d: '2026-10-15', ora: 'bmo', zile: 2 });
  assert.equal(r['CCC.HK'], undefined); assert.deepEqual(r['BRK-B'], { d: '2026-10-25', ora: 'bmo', zile: 12 }, 'clasa de actiuni: BRK.B (Finnhub) = BRK-B (Yahoo)');
  assert.equal(Object.keys(r).length, 3, 'prima raportare a simbolului, nu ultima');
});

test('iesiri si intrari fata de ziua dinainte: cazut sub top 20 %, momentum <= 0, lipsa din univers, regim oprit', () => {
  const prev = { d: '2026-10-12', regim: true, top: [['A', 1.2], ['B', 0.9], ['C', 0.8], ['D', 0.7]] };
  const clasat = [{ s: 'A', rang: 0.01, m12: 1.1 }, { s: 'B', rang: 0.35, m12: 0.5 }, { s: 'C', rang: 0.05, m12: -0.1 }, { s: 'E', rang: 0.02, m12: 1.0 }];
  const r = iesiri(prev, clasat, { peste: true });
  assert.deepEqual(r.map((x) => [x.s, x.motiv]), [['B', 'a căzut la top 35,0 %'], ['C', 'momentum 12-1 sub zero'], ['D', 'a ieșit din univers']]);
  assert.deepEqual(intrari(prev, [{ s: 'A' }, { s: 'E' }]).map((x) => x.s), ['E']);
  const ro = iesiri(prev, clasat, { peste: false });
  assert.equal(ro.length, 4); assert.ok(ro.every((x) => x.motiv === 'regimul s-a oprit (SPY sub media pe 200 de zile)'));
  const inca = iesiri({ ...prev, regim: false }, clasat, { peste: false });
  assert.deepEqual(inca.map((x) => x.s), ['B', 'C', 'D'], 'revizie 14.10: cand regimul era DEJA oprit ieri, iesirile sunt cele normale, nu toate 20 in fiecare zi');
  assert.deepEqual(iesiri(null, clasat, { peste: true }), [], 'fără ziua dinainte, nimic de comparat');
});

test('mesajDiscord: gol cand nu s-a schimbat nimic; altfel regim + intrari + iesiri + cine raporteaza, sub 1.900 de caractere', () => {
  assert.equal(mesajDiscord({ dataUltimei: '2026-10-13', regim: { peste: true }, regimPrev: true, intrari: [], iesiri: [], raporteaza: [] }), '');
  const m = mesajDiscord({ dataUltimei: '2026-10-13', regim: { peste: true }, regimPrev: true, intrari: [{ s: 'E', m12: 1.0 }], iesiri: [{ s: 'B', motiv: 'a căzut la top 35,0 %' }], raporteaza: [{ s: 'A', zile: 1, ora: 'amc' }] });
  assert.match(m, /Trend 12 luni · 2026-10-13/); assert.match(m, /regim pornit/); assert.match(m, /intrat: E \(\+100,0 %\)/); assert.match(m, /ieșit: B — a căzut/); assert.match(m, /raportează: A în 1z/);
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
  assert.ok(validareFisiere(bun, ist + '{stricat\n').some((p) => /istoric/.test(p)), 'ultima linie stricată = problemă');
  assert.deepEqual(validareFisiere(bun, '{stricat\n' + ist), [], 'revizie 14.10: o linie veche stricată nu blochează robotul pentru totdeauna');
  assert.ok(validareFisiere(bun, JSON.stringify({ d: '2026-10-10', top: [] }) + '\n').some((p) => /ultima zi/.test(p)));
  assert.ok(validareFisiere({ ...bun, regim: { peste: 'da' } }, ist).some((p) => /regim/.test(p)));
  assert.ok(validareFisiere({ ...bun, clasament: [] }, ist).some((p) => /clasament gol/.test(p)), 'revizie 14.10: un clasament gol nu se publică');
});

test('fisierele publicate de robot trec garda de forma', () => {
  const j = 'candidate-engine/generated/trend-12-1.json', i = 'candidate-engine/generated/trend-12-1-istoric.jsonl';
  if (!existsSync(j) || !existsSync(i)) return;
  assert.deepEqual(validareFisiere(JSON.parse(readFileSync(j, 'utf8')), readFileSync(i, 'utf8')), []);
});

test('bilant: pe zilele cu 20/60 de zile de bursa dupa ele, excesul primelor 20 fata de SPY si fata de universul zilei; verdict pe FERESTRE NESUPRAPUSE (revizie 14.10)', () => {
  const spy = serie(700, 0.0005), bun = serie(700, 0.003), slab = serie(700, -0.001), mediu = serie(700, 0.0005);
  const preturi = { SPY: spy, BUN: bun, SLAB: slab, MEDIU: mediu };
  const istoric = []; for (let k = 250; k < 250 + 90; k += 5) istoric.push({ d: zi(spy[k].t), regim: true, n: 3, top: [['BUN', 1.5]], univers: ['BUN', 'SLAB', 'MEDIU'] });
  const r = bilant(istoric, preturi, { h: [20, 60] });
  assert.equal(r.zile, istoric.length); assert.ok(r.n20 === istoric.length && r.n60 === istoric.length);
  assert.ok(r.exces20 > 0 && r.exces60 > r.exces20, 'BUN bate SPY, mai mult pe 60 z');
  assert.ok(r.nulB20 < r.exces20, 'media universului (cu SLAB) e sub primele 20');
  assert.ok(r.interval20[0] <= r.exces20 && r.exces20 <= r.interval20[1]);
  assert.ok(r.ferestre20 < 12); assert.equal(r.verdict, 'în probă', '90 de zile = 4 ferestre de 20 de zile ⇒ încă în probă, oricât de multe zile suprapuse ar fi');
  const mult = []; for (let k = 250; k < 250 + 300; k += 1) mult.push({ d: zi(spy[k].t), regim: true, n: 3, top: [['BUN', 1.5]], univers: ['BUN', 'SLAB', 'MEDIU'] });
  const r2 = bilant(mult, preturi, { h: [20, 60] });
  assert.ok(r2.ferestre20 >= 12, '300 de zile = 15 ferestre nesuprapuse'); assert.equal(r2.verdict, 'probat față de alte acțiuni');
  const prost = []; for (let k = 250; k < 250 + 300; k += 1) prost.push({ d: zi(spy[k].t), regim: true, n: 3, top: [['SLAB', 1.5]], univers: ['BUN', 'SLAB', 'MEDIU'] });
  assert.equal(bilant(prost, preturi, { h: [20, 60] }).verdict, 'picat față de alte acțiuni');
  const gol = bilant([{ d: zi(spy[699].t), regim: true, n: 3, top: [['BUN', 1]], univers: ['BUN'] }], preturi, { h: [20, 60] });
  assert.equal(gol.n20, 0); assert.equal(gol.verdict, 'în probă');
});

test('liniaIstoric poarta si universul zilei (pentru nulul B de mai tarziu)', () => {
  const rez = { dataUltimei: '2026-10-14', n: 3, clasament: [{ s: 'A', m12: 1 }], clasate: ['A', 'B', 'C'] };
  const l = liniaIstoric(rez, { peste: true });
  assert.deepEqual(l.univers, ['A', 'B', 'C']); assert.equal(l.top.length, 1);
});

test('mesajDiscord: salturile >= 50 % intr-o zi apar ca „verifica seria”; sub 50 % nu', () => {
  const m = mesajDiscord({ dataUltimei: '2026-10-14', regim: { peste: true }, regimPrev: true, intrari: [{ s: 'ATI', m12: 1.35 }], iesiri: [], raporteaza: [], salturi: [{ s: 'MRNA', pct: 1.77, d: '2026-05-12' }, { s: 'MU', pct: 0.07, d: '2026-09-01' }] });
  assert.match(m, /salt într-o zi, verifică seria: MRNA 177 % \(2026-05-12\)/); assert.ok(!/MU/.test(m));
});

test('I-631: mesajul bilantului apare DOAR cand verdictul s-a schimbat; prima rulare (fara bilant dinainte) tace', () => {
  const out = { verdict: 'probat față de alte acțiuni', n20: 260, ferestre20: 13, diferenta20: { medie: 0.86 } };
  assert.equal(mesajBilant(null, out), ''); assert.equal(mesajBilant({ verdict: 'probat față de alte acțiuni' }, out), '');
  const m = mesajBilant({ verdict: 'în probă' }, out);
  assert.match(m, /verdictul s-a schimbat: „în probă” → „probat față de alte acțiuni” \(260 zile cu rezultat, 13 ferestre de 20 z, \+0,9 % față de univers la 20 z\)/);
  assert.equal(mesajBilant({ verdict: 'în probă' }, { verdict: 'picat față de alte acțiuni', n20: 0, ferestre20: 0, diferenta20: { medie: null } }).includes('% față de univers'), false, 'nemăsurat nu e +0,0 %');
});

// 14.10 seara (auditul „probă statistică”, el: „REPARA TOATE”): verdictul pe ferestre NESUPRAPUSE + t > 3,2, abaterea scrisă înainte
test('bilant (14.10 seara): ferestrele nesuprapuse pe calendarul SPY, t > 3,2 cere ≥ 12 ferestre; zgomotul fără avantaj NU iese „probat”', async () => {
  const { ferestreNesuprapuse, T_PRAG } = await import('./trend-12-1-lib.mjs');
  assert.equal(T_PRAG, 3.2);
  assert.deepEqual(ferestreNesuprapuse([[0, 1], [5, 2], [20, 3], [39, 4], [40, 5], [61, 6]], 20), [1, 3, 5, 6], 'câte una la ≥ 20 de zile de bursă');
  assert.deepEqual(ferestreNesuprapuse([[40, 5], [0, 1], [20, 3]], 20), [1, 3, 5], 'ordinea din istoric nu contează');
  // zgomot fără avantaj (mulberry32): BUN și SLAB cu aceeași medie, zgomot zilnic mare ⇒ diferența oscilează în jurul lui 0
  const rnd = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const zgomot = (n, seed) => { const R = rnd(seed), s = serie(n, 0.0005); let c = 100; return s.map((b) => { c *= 1 + 0.0005 + (R() - 0.5) * 0.06; return { ...b, o: c, h: c * 1.01, l: c * 0.99, c }; }); };
  const spy = serie(700, 0.0005), preturi = { SPY: spy, A: zgomot(700, 1), B: zgomot(700, 2), C: zgomot(700, 3) };
  const ist = []; for (let k = 250; k < 250 + 300; k++) ist.push({ d: zi(spy[k].t), regim: true, n: 3, top: [['A', 1]], univers: ['A', 'B', 'C'] });
  const r = bilant(ist, preturi, { h: [20, 60] });
  assert.equal(r.ferestre20, 15, '300 de zile cu 20 de zile după ele ⇒ 15 ferestre nesuprapuse (nu 300 de „observații”)');
  assert.ok(Number.isFinite(r.t20) && Math.abs(r.t20) < T_PRAG, 'fără avantaj ⇒ t sub prag (t = ' + r.t20 + ')');
  assert.equal(r.verdict, 'în probă');
  assert.ok(r.diferenta20.interval[0] < r.diferenta20.medie && r.diferenta20.medie < r.diferenta20.interval[1], 'intervalul ± 2 erori standard pe ferestre');
  assert.match(r.criterii, /t > 3,2/); assert.match(r.criterii, /după un an, cel mai probabil tot „în probă”/);
});

test('pragAbatere: pragurile scrise ÎNAINTE de date (14.10.2026) — sub 3 ferestre nimic, apoi −3,0 / −1,8 / −1,2 / −0,9 %, peste 12 se strânge', async () => {
  const { pragAbatere } = await import('./trend-12-1-lib.mjs');
  assert.equal(pragAbatere(0), null); assert.equal(pragAbatere(2), null);
  assert.equal(pragAbatere(3), -0.0295); assert.equal(pragAbatere(5), -0.0295); assert.equal(pragAbatere(6), -0.018);
  assert.equal(pragAbatere(9), -0.0124); assert.equal(pragAbatere(12), -0.009);
  assert.ok(Math.abs(pragAbatere(13) - (0.0078 - 1.645 * 0.0351 / Math.sqrt(13))) < 1e-12);
  assert.ok(pragAbatere(48) > pragAbatere(13), 'mai multe ferestre ⇒ prag mai aproape de media din istorie');
});

test('bilant: ABATEREA se aprinde când media ferestrelor coboară sub prag; mesajul Discord o anunță o singură dată', () => {
  const spy = serie(700, 0.0005), preturi = { SPY: spy, BUN: serie(700, 0.003), SLAB: serie(700, -0.001), MEDIU: serie(700, 0.0005) };
  const prost = []; for (let k = 250; k < 250 + 120; k++) prost.push({ d: zi(spy[k].t), regim: true, n: 3, top: [['SLAB', 1.5]], univers: ['BUN', 'SLAB', 'MEDIU'] });
  const r = bilant(prost, preturi, { h: [20, 60] });
  assert.equal(r.ferestre20, 6); assert.ok(r.abatere && r.abatere.k === 6 && r.abatere.prag === -0.018);
  assert.equal(r.abatere.atinsa, true, 'SLAB e cu mult sub univers ⇒ abatere');
  const out = { verdict: 'în probă', n20: 120, ferestre20: 6, diferenta20: { medie: -4.2 }, abatere: { k: 6, medie: -4.21, prag: -1.8, atinsa: true } };
  const m = mesajBilant({ verdict: 'în probă', abatere: { atinsa: false } }, out);
  assert.match(m, /ABATERE\*\* · media pe 6 ferestre de 20 z, −4,2 % față de univers, a coborât sub pragul scris înainte \(−1,8 %\)/);
  assert.equal(mesajBilant({ verdict: 'în probă', abatere: { atinsa: true } }, out), '', 'deja anunțată ⇒ tace');
  const bun = []; for (let k = 250; k < 250 + 120; k++) bun.push({ d: zi(spy[k].t), regim: true, n: 3, top: [['BUN', 1.5]], univers: ['BUN', 'SLAB', 'MEDIU'] });
  assert.equal(bilant(bun, preturi, { h: [20, 60] }).abatere.atinsa, false);
  const doua = mesajBilant({ verdict: 'în probă', abatere: { atinsa: false } }, { ...out, verdict: 'picat față de alte acțiuni' });
  assert.equal(doua.split('\n').filter((l) => l.startsWith('**')).length, 2, 'verdict schimbat + abatere nouă ⇒ amândouă');
});

// 27.10.2026 — auditul F (docs/trend-12-1-protocol.md, scris înaintea primei ferestre închise: 0 zile cu rezultat la 20 z)
test('delisted stocks (no data 10 sessions after the horizon) exit at the last close, vs SPY on the same dates; no series ⇒ unjudged with a reason, counted', async () => {
  const spy = serie(400, 0.0005), bun = serie(400, 0.003), oprit = serie(400, 0.003).slice(0, 262), istoric = [{ d: zi(spy[250].t), regim: true, n: 3, top: [['BUN', 1], ['OPRIT', 1], ['LIPSA', 1]], univers: ['BUN', 'OPRIT', 'LIPSA'] }];
  const devreme = bilant(istoric, { SPY: spy.slice(0, 275), BUN: bun, OPRIT: oprit }, { h: [20, 60] });
  assert.equal(devreme.nejudecate[20].n, 0, 'înainte de orizont + 10 sesiuni se mai așteaptă'); assert.equal(devreme.oprite[20], 0);
  const r = bilant(istoric, { SPY: spy, BUN: bun, OPRIT: oprit }, { h: [20, 60] });
  assert.equal(r.oprite[20], 1, 'OPRIT iese la ultima închidere'); assert.equal(r.nejudecate[20].n, 1); assert.deepEqual(r.nejudecate[20].motive, { 'fără serie (delistată sau sursă indisponibilă)': 1 });
  assert.ok(r.exces20 > 0, 'media primelor 20 include acțiunea oprită (la ultima închidere), nu doar BUN');
});
test('SIZE and POWER of the Trend judgment (t > 3.2 looked at after every new window from 12 on), simulated in the repo with mulberry32', async () => {
  const { marimePutereTrend, PUTERE_TREND } = await import('./trend-12-1-lib.mjs');
  const h0 = marimePutereTrend({ efect: 0, ferestre: 60, lumi: 4000 }), h1 = marimePutereTrend({ efect: 0.01, ferestre: 60, lumi: 4000 });
  assert.ok(h0.la[60] <= 0.05, 'fals „probat” în 5 ani: ' + h0.la[60]); assert.ok(h0.la[12] <= h0.la[36] && h0.la[36] <= h0.la[60], 'privirile adună');
  assert.ok(h1.la[60] > h1.la[12]); assert.deepEqual(PUTERE_TREND.laPlus.map((x) => x.pct), [0.5, 1]);
  assert.deepEqual([12, 36, 60].map((k) => Math.round(1000 * h1.la[k]) / 1000), [PUTERE_TREND.laPlus[1].putere, PUTERE_TREND.laPlus[1].la36, PUTERE_TREND.laPlus[1].la60], 'cifrele scrise sunt cele simulate');
  // forma reală a ferestrelor (asimetrie −1,3, auditul 14.10) urcă mărimea: spus în protocol, cu cifrele de aici
  const t = marimePutereTrend({ efect: 0, ferestre: 60, lumi: 4000, coada: true }); assert.ok(t.la[60] > h0.la[60], 'asimetria urcă mărimea: ' + t.la[60]);
  assert.equal(Math.round(1000 * t.la[60]) / 1000, PUTERE_TREND.asimetric.marime.la60); assert.equal(Math.round(1000 * h0.la[60]) / 1000, PUTERE_TREND.marime.la60);
});
test('the Trend bilant file carries putere / primulVerdict / judecata (sequential: unic false) and the judge fingerprint written in the protocol', async () => {
  const { contractTrend, amprentaJudecatorTrend } = await import('./trend-12-1-lib.mjs'), { calendarSUA, dupaSesiuni } = await import('../lib/proba-contract.mjs'), cal = calendarSUA('.');
  const c = contractTrend({ ferestre20: 0, verdict: 'în probă' }, { cal, azi: '2026-10-27', primaZi: '2026-10-13', notate: 10, asteptate: 11 });
  assert.equal(c.primulVerdict.optimist, dupaSesiuni(cal, '2026-10-13', 12 * 20).zi); assert.ok(c.primulVerdict.realist >= c.primulVerdict.optimist);
  assert.deepEqual(c.judecata, { la: 12, data: null, verdict: null, unic: false }); assert.ok(c.putere.laPlus.every((x) => x.putere > 0 && x.putere < 1)); assert.match(c.putere.text, /12 ferestre/);
  assert.match(amprentaJudecatorTrend(), /^jt-[0-9a-f]{12}$/);
  const doc = readFileSync('docs/trend-12-1-protocol.md', 'utf8'); assert.ok(doc.includes('`' + amprentaJudecatorTrend() + '`'), 'amprenta judecătorului e scrisă în protocol');
  const { continutBilant } = await import('./trend-12-1-lib.mjs'), spy = serie(300, 0.0005), ist = [{ d: zi(spy[250].t), regim: true, n: 3, top: [['A', 1]], univers: ['A'] }];
  const f = continutBilant(bilant(ist, { SPY: spy, A: serie(300, 0.001) }, { h: [20, 60] }), ist, { cal, azi: '2026-10-27', la: 'acum' });
  for (const k of ['putere', 'primulVerdict', 'judecata', 'nejudecate', 'oprite', 'starturi20', 'judecator', 'verdict', 'ferestre20', 'pragT']) assert.ok(k in f, 'fișierul are ' + k);
  assert.equal(f.judecator, amprentaJudecatorTrend()); assert.equal(f.pragT, 3.2); assert.deepEqual(f.sesiuni.notate, 1);
});
