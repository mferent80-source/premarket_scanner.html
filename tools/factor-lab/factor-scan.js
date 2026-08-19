/* factor-scan.js — ce factori au edge pe 50 de cripto, 4h.
 * Fiecare factor e o conditie pe bara i; masuram randamentul la i+H.
 * Baseline = randamentul mediu al TUTUROR barelor (ce ai fi luat oricum).
 * edge = medie(factor) - baseline.  t = semnificatia statistica a mediei.
 * Ruleaza: node factor-scan.js <dir_klines> [H]
 */
const fs = require('fs');
const DIR = process.argv[2], H = +(process.argv[3] || 5);

// ── indicatori ──────────────────────────────────────────────────────────────
const ema = (v, n) => { const k = 2 / (n + 1), o = []; let a = 0;
  for (let i = 0; i < v.length; i++) { if (i < n) { a += v[i]; o[i] = i === n - 1 ? a / n : null; }
    else o[i] = v[i] * k + o[i - 1] * (1 - k); } return o; };
const sma = (v, n) => { const o = []; let s = 0;
  for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= n) s -= v[i - n]; o[i] = i >= n - 1 ? s / n : null; } return o; };
function rsi(c, n) { const o = new Array(c.length).fill(null); let g = 0, l = 0;
  for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1];
    if (i <= n) { g += Math.max(d, 0); l += Math.max(-d, 0); if (i === n) { g /= n; l /= n; o[i] = 100 - 100 / (1 + g / (l || 1e-9)); } }
    else { g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; o[i] = 100 - 100 / (1 + g / (l || 1e-9)); } }
  return o; }
function atr(b, n) { const tr = b.map((x, i) => i ? Math.max(x.h - x.l, Math.abs(x.h - b[i-1].c), Math.abs(x.l - b[i-1].c)) : x.h - x.l);
  return sma(tr, n); }
function adx(b, n) { const p = [], m = [], tr = [];
  for (let i = 1; i < b.length; i++) { const up = b[i].h - b[i-1].h, dn = b[i-1].l - b[i].l;
    p.push(up > dn && up > 0 ? up : 0); m.push(dn > up && dn > 0 ? dn : 0);
    tr.push(Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i-1].c), Math.abs(b[i].l - b[i-1].c))); }
  const sp = sma(p, n), sm = sma(m, n), st = sma(tr, n);
  const di = [null], dx = [null];
  for (let i = 0; i < sp.length; i++) { if (st[i] == null || st[i] === 0) { di.push(null); dx.push(null); continue; }
    const dp = 100 * sp[i] / st[i], dm = 100 * sm[i] / st[i];
    di.push({ p: dp, m: dm }); dx.push(dp + dm ? 100 * Math.abs(dp - dm) / (dp + dm) : null); }
  const a = sma(dx.map(x => x == null ? 0 : x), n);
  return { di, adx: a }; }

// ── incarcare ───────────────────────────────────────────────────────────────
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json'));
const SYM = {};
files.forEach(f => { const b = JSON.parse(fs.readFileSync(DIR + '/' + f, 'utf8'))
    .map(k => ({ o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5], t: +k[0] }))
    .filter(x => [x.o, x.h, x.l, x.c].every(y => isFinite(y) && y > 0) && x.h >= x.l);
  if (b.length > 300) SYM[f.replace('.json', '')] = b; });

// serie de referinta pentru forta relativa
const REF = SYM['BTCUSDT'];
const refRet = {}; if (REF) REF.forEach((b, i) => { if (i >= 30) refRet[b.t] = b.c / REF[i - 30].c - 1; });

// ── factori ─────────────────────────────────────────────────────────────────
// fiecare: (bars, pre) => array de +1 (long) / -1 (short) / 0
const FACTORS = {
  'EMA 20>50 (trend)':            (b, p) => b.map((_, i) => p.e20[i] == null || p.e50[i] == null ? 0 : p.e20[i] > p.e50[i] ? 1 : -1),
  'pret > EMA200':                (b, p) => b.map((x, i) => p.e200[i] == null ? 0 : x.c > p.e200[i] ? 1 : -1),
  'EMA50 in urcare':              (b, p) => b.map((_, i) => i < 5 || p.e50[i] == null || p.e50[i-5] == null ? 0 : p.e50[i] > p.e50[i-5] ? 1 : -1),
  'ADX>25 + DI aliniat':          (b, p) => b.map((_, i) => { const a = p.adx.adx[i], d = p.adx.di[i];
                                        return a == null || d == null || a < 25 ? 0 : d.p > d.m ? 1 : -1; }),
  'RSI>55 (momentum)':            (b, p) => b.map((_, i) => p.rsi[i] == null ? 0 : p.rsi[i] > 55 ? 1 : p.rsi[i] < 45 ? -1 : 0),
  'RSI<30 (reversal long)':       (b, p) => b.map((_, i) => p.rsi[i] == null ? 0 : p.rsi[i] < 30 ? 1 : 0),
  'RSI>70 (reversal short)':      (b, p) => b.map((_, i) => p.rsi[i] == null ? 0 : p.rsi[i] > 70 ? -1 : 0),
  'ROC 30 pozitiv':               (b) => b.map((x, i) => i < 30 ? 0 : x.c > b[i-30].c ? 1 : -1),
  'volum > 2x media':             (b, p) => b.map((x, i) => p.vma[i] == null || !p.vma[i] ? 0 : x.v > 2 * p.vma[i] ? (x.c > x.o ? 1 : -1) : 0),
  'breakout max 20 bare':         (b) => b.map((x, i) => { if (i < 21) return 0;
                                        let m = -Infinity; for (let k = i - 20; k < i; k++) m = Math.max(m, b[k].h);
                                        return x.c > m ? 1 : 0; }),
  'breakdown min 20 bare':        (b) => b.map((x, i) => { if (i < 21) return 0;
                                        let m = Infinity; for (let k = i - 20; k < i; k++) m = Math.min(m, b[k].l);
                                        return x.c < m ? -1 : 0; }),
  'squeeze ATR (vol mica)':       (b, p) => b.map((x, i) => { if (i < 60 || p.atr[i] == null) return 0;
                                        let s = 0, n = 0; for (let k = i - 50; k <= i; k++) if (p.atr[k] != null) { s += p.atr[k]; n++; }
                                        return n && p.atr[i] < 0.7 * (s / n) ? 1 : 0; }),
  'forta relativa vs BTC':        (b) => b.map((x, i) => { if (i < 30) return 0; const r = refRet[x.t];
                                        if (r == null) return 0; return (x.c / b[i-30].c - 1) > r ? 1 : -1; }),
  'trend+volum (EMA + vol>1.5x)': (b, p) => b.map((x, i) => { if (p.e20[i] == null || p.e50[i] == null || !p.vma[i]) return 0;
                                        if (x.v < 1.5 * p.vma[i]) return 0; return p.e20[i] > p.e50[i] ? 1 : -1; }),
  'trend+ADX+volum (toate 3)':    (b, p) => b.map((x, i) => { const a = p.adx.adx[i];
                                        if (p.e20[i] == null || p.e50[i] == null || !p.vma[i] || a == null) return 0;
                                        if (a < 25 || x.v < 1.5 * p.vma[i]) return 0; return p.e20[i] > p.e50[i] ? 1 : -1; })
};

// ── evaluare ────────────────────────────────────────────────────────────────
const res = {}, baseAll = [];
Object.keys(FACTORS).forEach(k => res[k] = []);

Object.keys(SYM).forEach(s => {
  const b = SYM[s], c = b.map(x => x.c), v = b.map(x => x.v);
  const pre = { e20: ema(c, 20), e50: ema(c, 50), e200: ema(c, 200), rsi: rsi(c, 14),
                atr: atr(b, 14), vma: sma(v, 20), adx: adx(b, 14) };
  for (let i = 200; i < b.length - H; i++) baseAll.push(b[i + H].c / b[i].c - 1);
  Object.keys(FACTORS).forEach(k => {
    const sig = FACTORS[k](b, pre);
    for (let i = 200; i < b.length - H; i++) {
      const d = sig[i]; if (!d) continue;
      res[k].push(d * (b[i + H].c / b[i].c - 1));
    }
  });
});

const stat = a => { const n = a.length; if (!n) return { n: 0 };
  const m = a.reduce((x, y) => x + y, 0) / n;
  const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / n);
  return { n, avg: m * 100, t: sd > 0 ? m / (sd / Math.sqrt(n)) : 0, hit: a.filter(x => x > 0).length / n * 100 }; };

const base = stat(baseAll);
const rows = Object.keys(FACTORS).map(k => { const r = stat(res[k]); return { k, ...r, edge: r.avg - base.avg }; })
  .sort((a, b) => b.t - a.t);

console.log('SCAN DE FACTORI · ' + Object.keys(SYM).length + ' cripto · 4h · orizont ' + H + ' bare');
console.log('baseline (orice bara): ' + base.avg.toFixed(3) + '% pe ' + base.n + ' observatii\n');
console.log('  factor                            n      medie     edge    hit       t');
rows.forEach(r => {
  if (!r.n) { console.log('  ' + r.k.padEnd(32) + '  (fara semnale)'); return; }
  const flag = Math.abs(r.t) >= 3 ? '  ***' : Math.abs(r.t) >= 2 ? '  **' : '';
  console.log('  ' + r.k.padEnd(32) + String(r.n).padStart(7) +
    ((r.avg >= 0 ? '+' : '') + r.avg.toFixed(3) + '%').padStart(10) +
    ((r.edge >= 0 ? '+' : '') + r.edge.toFixed(3) + '%').padStart(9) +
    (r.hit.toFixed(0) + '%').padStart(6) + r.t.toFixed(2).padStart(8) + flag);
});
console.log('\n  ** = |t|>2   *** = |t|>3   (cu 15 factori testati, cere |t|>3 ca sa fie credibil)');
