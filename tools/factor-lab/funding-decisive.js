/* Testul decisiv: functia de funding prezice randamentul, sau doar marcheaza
 * o piata care scade? Comparam DOUA GRUPURI DIN ACEEASI PIATA (t-test Welch),
 * asa efectul de regim se anuleaza — ambele grupuri traiesc aceleasi zile. */
const fs = require('fs');
const [KD, FD] = process.argv.slice(2, 4), H = +(process.argv[4] || 10);
const rows = [];
fs.readdirSync(KD).filter(f => f.endsWith('.json')).forEach(f => {
  let bars, fr;
  try { bars = JSON.parse(fs.readFileSync(KD + '/' + f, 'utf8')).map(k => ({ c: +k[4], t: +k[0] })); } catch (e) { return; }
  try { const d = JSON.parse(fs.readFileSync(FD + '/' + f, 'utf8')); fr = Array.isArray(d) ? d.map(x => ({ t: +x.fundingTime, r: +x.fundingRate })) : null; } catch (e) { return; }
  if (!bars || bars.length < 300 || !fr || fr.length < 50) return;
  let fi = 0; const seen = [];
  for (let i = 200; i < bars.length - H; i++) {
    while (fi < fr.length && fr[fi].t <= bars[i].t) { seen.push(fr[fi].r); fi++; }
    if (seen.length < 30) continue;
    rows.push({ t: bars[i].t, ret: bars[i + H].c / bars[i].c - 1,
                f3: seen.slice(-9).reduce((a, b) => a + b, 0), fr: seen[seen.length - 1] });
  }
});
const st = a => { const n = a.length, m = a.reduce((x, y) => x + y, 0) / n;
  const v = a.reduce((x, y) => x + (y - m) ** 2, 0) / n; return { n, m, v, sd: Math.sqrt(v) }; };
function welch(A, B) { const a = st(A), b = st(B);
  const se = Math.sqrt(a.v / a.n + b.v / b.n);
  return { d: (a.m - b.m) * 100, t: se > 0 ? (a.m - b.m) / se : 0, nA: a.n, nB: b.n, mA: a.m * 100, mB: b.m * 100 }; }

console.log('TESTUL DECISIV · ' + rows.length + ' observatii · orizont ' + H + ' bare\n');
console.log('Compara randamentul VIITOR intre grupuri care traiesc ACEEASI perioada.');
console.log('Daca funding-ul e doar un proxy pentru "piata scade", diferenta dispare.\n');

const cases = [
  ['funding 3 zile POZITIV vs NEGATIV', r => r.f3 > 0, r => r.f3 < 0],
  ['funding ultimul POZITIV vs NEGATIV', r => r.fr > 0, r => r.fr < 0],
  ['funding 3z > 0.05% vs restul', r => r.f3 > 0.0005, r => r.f3 <= 0.0005],
  ['funding 3z > 0.10% vs restul', r => r.f3 > 0.001, r => r.f3 <= 0.001]
];
cases.forEach(([n, fa, fb]) => {
  const A = rows.filter(fa).map(r => r.ret), B = rows.filter(fb).map(r => r.ret);
  if (A.length < 50 || B.length < 50) { console.log('  ' + n + ': prea putine cazuri'); return; }
  const w = welch(A, B);
  console.log('  ' + n);
  console.log('    grup A (n=' + w.nA + '): ' + w.mA.toFixed(3) + '%   grup B (n=' + w.nB + '): ' + w.mB.toFixed(3) + '%');
  console.log('    diferenta: ' + (w.d >= 0 ? '+' : '') + w.d.toFixed(3) + '%   t=' + w.t.toFixed(2) +
              (Math.abs(w.t) >= 3 ? '   *** REAL' : Math.abs(w.t) >= 2 ? '   ** slab' : '   — zgomot'));
});

// split temporal pe testul principal
console.log('\n── acelasi test, pe jumatati de timp ──');
const ts = rows.map(r => r.t).sort((a, b) => a - b), mid = ts[Math.floor(ts.length / 2)];
[['prima jumatate', r => r.t < mid], ['a doua jumatate', r => r.t >= mid]].forEach(([n, f]) => {
  const s = rows.filter(f);
  const A = s.filter(r => r.f3 > 0).map(r => r.ret), B = s.filter(r => r.f3 < 0).map(r => r.ret);
  if (A.length < 50 || B.length < 50) { console.log('  ' + n + ': prea putine cazuri'); return; }
  const w = welch(A, B);
  console.log('  ' + n.padEnd(16) + 'A=' + w.mA.toFixed(3) + '% (n=' + w.nA + ')  B=' + w.mB.toFixed(3) + '% (n=' + w.nB + ')  dif=' +
    (w.d >= 0 ? '+' : '') + w.d.toFixed(3) + '%  t=' + w.t.toFixed(2));
});
