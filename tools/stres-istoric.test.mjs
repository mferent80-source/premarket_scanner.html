// 20.10.2026 (I-730): stresul istoric — cele mai proaste 5 ferestre de 5 sesiuni ale SPY (fără suprapunere) × beta pozițiilor (1 an / 6 luni, interval)
// ⇒ pierderea estimată față de bugetul săptămânii și plafonul DD; tot ce lipsește e spus (fără beta, fără cont), nu zero.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function S() { const c = { console, Date, Intl, Math, Map }; c.window = c; vm.createContext(c); vm.runInContext(readFileSync('lib/stres-istoric.js', 'utf8'), c); return c.StresIstoric; }
const DAY = 86400000, T0 = Date.parse('2016-01-04T14:30:00Z');
// SPY sintetic: 2.600 sesiuni cu mișcare zilnică mică și variată (altfel varianța e zero și beta nu există), cu 3 prăbușiri de 5 zile (−12 %, −8 %, −6 %) la poziții știute, ultima în ultimele 6 luni
function spy() { const out = []; let c = 100; for (let i = 0; i < 2600; i++) { const crash = i >= 1000 && i < 1005 ? -0.0252 : i >= 1800 && i < 1805 ? -0.0165 : i >= 2500 && i < 2505 ? -0.0123 : 0.0003 + 0.002 * Math.sin(i); c *= 1 + crash; out.push({ t: T0 + i * DAY, c }); } return out; }
// o poziție cu beta ≈ 2 (randamentul SPY × 2) și una cu beta ≈ 0,5, pe ultimul an
function pozitie(spyBars, k) { const tail = spyBars.slice(-300); const out = []; let c = 50; for (let i = 0; i < tail.length; i++) { if (i) c *= 1 + k * (tail[i].c / tail[i - 1].c - 1); out.push({ t: tail[i].t, c }); } return out; }

test('ferestrele: cele mai proaste 5 de 5 sesiuni, fără suprapunere, cea mai rea prima', () => {
  const St = S(), sp = spy(), f = St.ferestre(sp);
  assert.equal(f.length, 5); assert.ok(f[0].ret < f[1].ret && f[1].ret < f[2].ret);
  assert.ok(Math.abs(f[0].ret - (Math.pow(1 - 0.0252, 5) - 1)) < 1e-9, 'prăbușirea de −12 %');
  for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) assert.ok(f[i].la < f[j].de || f[j].la < f[i].de, 'fără suprapunere');
  assert.equal(St.ferestre([]).length, 0);
});

test('beta pe 1 an și pe 6 luni; sub 40 de sesiuni comune ⇒ null', () => {
  const St = S(), sp = spy(), p2 = pozitie(sp, 2), p05 = pozitie(sp, 0.5);
  assert.ok(Math.abs(St.beta(p2, sp, 252) - 2) < 0.05); assert.ok(Math.abs(St.beta(p05, sp, 126) - 0.5) < 0.05);
  assert.equal(St.beta(p2.slice(-20), sp, 252), null);
});

test('calculeaza: pierderea estimată = interval beta × cea mai rea fereastră; verdictul față de bugetul săptămânii și plafonul DD; lipsurile spuse', () => {
  const St = S(), sp = spy(), r = St.calculeaza({ spy: sp, pozitii: [{ sym: 'AAA', value: 6000, bars: pozitie(sp, 2) }, { sym: 'BBB', value: 4000, bars: pozitie(sp, 0.5) }, { sym: 'CCC', value: 1000, bars: [] }], cont: 20000, plafonDdPct: 10, bugetSaptPct: 3 });
  assert.equal(r.ok, true); assert.equal(r.scenarii.length, 5); assert.deepEqual(JSON.parse(JSON.stringify(r.necunoscute)), ['CCC']); assert.equal(r.acoperit, 10000);
  assert.ok(r.betaLo > 1.3 && r.betaHi < 1.5, 'beta portofoliu ≈ (2×6000 + 0,5×4000)/10000 = 1,4');
  const asteptat = -(Math.pow(1 - 0.0252, 5) - 1) * 1.4 * 10000; assert.ok(Math.abs(r.pierdereMax - asteptat) / asteptat < 0.05, 'pierderea ≈ 12 % × 1,4 × 10.000');
  assert.ok(Math.abs(r.pctMax - r.pierdereMax / 200) < 1e-9); assert.equal(r.verdict, 'peste-sapt', '≈ 8,4 % din cont: peste bugetul săptămânii (3 %), sub plafonul DD (10 %)');
  assert.equal(St.calculeaza({ spy: sp, pozitii: [{ sym: 'AAA', value: 6000, bars: pozitie(sp, 2) }], cont: 20000, plafonDdPct: 5, bugetSaptPct: 3 }).verdict, 'peste-dd');
  assert.equal(St.calculeaza({ spy: sp, pozitii: [{ sym: 'BBB', value: 1000, bars: pozitie(sp, 0.5) }], cont: 20000, plafonDdPct: 10, bugetSaptPct: 3 }).verdict, 'sub');
  assert.equal(St.calculeaza({ spy: sp, pozitii: [{ sym: 'AAA', value: 6000, bars: pozitie(sp, 2) }], cont: null, plafonDdPct: 10, bugetSaptPct: 3 }).verdict, 'necunoscut');
  assert.equal(St.calculeaza({ spy: [], pozitii: [] }).ok, false); assert.equal(St.calculeaza({ spy: sp, pozitii: [{ sym: 'CCC', value: 1000, bars: [] }] }).ok, false);
  const html = St.html(r, 'EUR'); assert.match(html, /cele mai proaste 5 săptămâni/); assert.match(html, /bugetul săptămânii \(3,0 %\)/); assert.match(html, /interval, nu cifră/); assert.match(html, /fără beta: CCC/);
});
