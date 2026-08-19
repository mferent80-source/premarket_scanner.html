/* factor-validate.js — testele care omoara descoperirile false.
 *   1. split temporal: prima jumatate vs a doua (out-of-sample in timp)
 *   2. per-simbol: cate coinuri sustin factorul (nu 3 care trag media)
 *   3. leave-one-out pe cele mai mari (dominatie BTC/ETH)
 * Ruleaza: node factor-validate.js <dir> <H>
 */
const fs = require('fs');
const DIR = process.argv[2], H = +(process.argv[3] || 10);

const sma = (v, n) => { const o = []; let s = 0;
  for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= n) s -= v[i - n]; o[i] = i >= n - 1 ? s / n : null; } return o; };
function atr(b, n) { const tr = b.map((x, i) => i ? Math.max(x.h - x.l, Math.abs(x.h - b[i-1].c), Math.abs(x.l - b[i-1].c)) : x.h - x.l);
  return sma(tr, n); }

const SYM = {};
fs.readdirSync(DIR).filter(f => f.endsWith('.json')).forEach(f => {
  const b = JSON.parse(fs.readFileSync(DIR + '/' + f, 'utf8'))
    .map(k => ({ o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5], t: +k[0] }))
    .filter(x => [x.o, x.h, x.l, x.c].every(y => isFinite(y) && y > 0) && x.h >= x.l);
  if (b.length > 300) SYM[f.replace('USDT.json', '')] = b;
});

const F = {
  'squeeze ATR': (b) => { const a = atr(b, 14); return b.map((x, i) => { if (i < 60 || a[i] == null) return 0;
      let s = 0, n = 0; for (let k = i - 50; k <= i; k++) if (a[k] != null) { s += a[k]; n++; }
      return n && a[i] < 0.7 * (s / n) ? 1 : 0; }); },
  'ROC 30 pozitiv': (b) => b.map((x, i) => i < 30 ? 0 : x.c > b[i-30].c ? 1 : -1)
};

const stat = a => { const n = a.length; if (!n) return { n: 0, avg: 0, t: 0, hit: 0 };
  const m = a.reduce((x, y) => x + y, 0) / n;
  const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / n);
  return { n, avg: m * 100, t: sd > 0 ? m / (sd / Math.sqrt(n)) : 0, hit: a.filter(x => x > 0).length / n * 100 }; };

const p = x => (x >= 0 ? '+' : '') + x.toFixed(3) + '%';

console.log('VALIDARE FACTORI · ' + Object.keys(SYM).length + ' cripto · 4h · orizont ' + H + ' bare\n');

Object.keys(F).forEach(name => {
  const half1 = [], half2 = [], perSym = {}, base1 = [], base2 = [];
  Object.keys(SYM).forEach(s => {
    const b = SYM[s], sig = F[name](b), mid = Math.floor(b.length / 2);
    perSym[s] = [];
    for (let i = 200; i < b.length - H; i++) {
      const r = b[i + H].c / b[i].c - 1;
      (i < mid ? base1 : base2).push(r);
      const d = sig[i]; if (!d) continue;
      (i < mid ? half1 : half2).push(d * r);
      perSym[s].push(d * r);
    }
  });
  const s1 = stat(half1), s2 = stat(half2), b1 = stat(base1), b2 = stat(base2);
  const syms = Object.keys(perSym).filter(s => perSym[s].length >= 20);
  const pos = syms.filter(s => stat(perSym[s]).avg > 0).length;
  const beat = syms.filter(s => { const r = stat(perSym[s]); return r.avg > 0; });
  // cele mai bune 3 simboluri scoase, sa vedem daca factorul supravietuieste
  const sorted = syms.map(s => ({ s, a: stat(perSym[s]).avg })).sort((x, y) => y.a - x.a);
  const woTop3 = [];
  syms.filter(s => !sorted.slice(0, 3).map(x => x.s).includes(s)).forEach(s => woTop3.push(...perSym[s]));
  const sw = stat(woTop3);

  console.log('── ' + name + ' ──');
  console.log('  prima jumatate (mai vechi) : n=' + String(s1.n).padStart(5) + '  medie ' + p(s1.avg) + '  edge ' + p(s1.avg - b1.avg) + '  t=' + s1.t.toFixed(2));
  console.log('  a doua jumatate (mai nou)  : n=' + String(s2.n).padStart(5) + '  medie ' + p(s2.avg) + '  edge ' + p(s2.avg - b2.avg) + '  t=' + s2.t.toFixed(2));
  console.log('  acelasi semn in ambele?    : ' + ((s1.avg - b1.avg) * (s2.avg - b2.avg) > 0 ? 'DA' : 'NU — factorul nu e stabil in timp'));
  console.log('  simboluri cu medie > 0     : ' + pos + '/' + syms.length + ' (' + (pos / syms.length * 100).toFixed(0) + '%)');
  console.log('  fara cele mai bune 3       : n=' + String(sw.n).padStart(5) + '  medie ' + p(sw.avg) + '  t=' + sw.t.toFixed(2) +
              '   (top3: ' + sorted.slice(0, 3).map(x => x.s).join(', ') + ')');
  console.log('');
});
