/* deriv-scan.js — funding rate si open interest ca factori.
 * Aliniere fara lookahead: pentru bara de la timpul T folosim ULTIMUL funding /
 * OI publicat la un moment <= T. Randamentul se masoara la T+H bare.
 * Ruleaza: node deriv-scan.js <dir_klines> <dir_funding> <dir_oi> <H>
 */
const fs = require('fs');
const [KD, FD, OD] = process.argv.slice(2, 5);
const H = +(process.argv[5] || 10);

function load(dir, f, map) {
  try { const d = JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8')); return Array.isArray(d) ? d.map(map) : null; }
  catch (e) { return null; }
}
const stat = a => { const n = a.length; if (!n) return { n: 0, avg: 0, t: 0, hit: 0 };
  const m = a.reduce((x, y) => x + y, 0) / n;
  const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / n);
  return { n, avg: m * 100, t: sd > 0 ? m / (sd / Math.sqrt(n)) : 0, hit: a.filter(x => x > 0).length / n * 100 }; };
const pc = (arr, q) => { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b);
  return s[Math.max(0, Math.min(s.length - 1, Math.floor(s.length * q)))]; };

// ── incarcare + aliniere ────────────────────────────────────────────────────
const rows = [];   // {sym, t, ret, fr, frPct, frSum3, oi, oiChg, pxChg}
fs.readdirSync(KD).filter(f => f.endsWith('.json')).forEach(f => {
  const sym = f.replace('.json', '');
  const bars = load(KD, f, k => ({ h: +k[2], l: +k[3], c: +k[4], v: +k[5], t: +k[0] }));
  if (!bars || bars.length < 300) return;
  const fr = load(FD, f, x => ({ t: +x.fundingTime, r: +x.fundingRate }));
  const oi = load(OD, f, x => ({ t: +x.timestamp, oi: +x.sumOpenInterest }));

  // istoricul de funding al simbolului, pentru percentile — DOAR ce s-a vazut pana la bara curenta
  let fi = 0, oiI = 0;
  const seenFr = [];
  for (let i = 200; i < bars.length - H; i++) {
    const T = bars[i].t;
    const ret = bars[i + H].c / bars[i].c - 1;
    const row = { sym, t: T, ret };

    if (fr) {
      while (fi < fr.length && fr[fi].t <= T) { seenFr.push(fr[fi].r); fi++; }
      if (seenFr.length >= 30) {
        row.fr = seenFr[seenFr.length - 1];
        const lo = pc(seenFr, 0.10), hi = pc(seenFr, 0.90);
        row.frLow = row.fr <= lo; row.frHigh = row.fr >= hi;
        row.frNeg = row.fr < 0;
        row.frSum3 = seenFr.slice(-9).reduce((a, b) => a + b, 0);   // 9 x 8h = 3 zile
      }
    }
    if (oi) {
      while (oiI < oi.length && oi[oiI].t <= T) oiI++;
      const j = oiI - 1;
      if (j >= 6) {
        row.oiChg = oi[j].oi / oi[j - 6].oi - 1;                     // 6 x 4h = 24h
        row.pxChg = bars[i].c / bars[i - 6].c - 1;
      }
    }
    rows.push(row);
  }
});

// ── factori ─────────────────────────────────────────────────────────────────
const F = {
  // CONTROL: short pe orice bara. Perioada testata a fost descendenta, deci
  // orice factor "short" pare bun. Un factor real trebuie sa BATA controlul asta.
  'CONTROL: short mereu':           r => -1,
  'CONTROL: long mereu':            r => 1,
  'funding NEGATIV -> long':        r => r.frNeg === true ? 1 : 0,
  'funding percentila<10 -> long':  r => r.frLow === true ? 1 : 0,
  'funding percentila>90 -> short': r => r.frHigh === true ? -1 : 0,
  'funding percentila>90 -> long':  r => r.frHigh === true ? 1 : 0,
  'funding 3 zile negativ -> long': r => r.frSum3 != null && r.frSum3 < 0 ? 1 : 0,
  'funding 3 zile pozitiv -> short':r => r.frSum3 != null && r.frSum3 > 0 ? -1 : 0,
  'OI creste + pret creste':        r => r.oiChg > 0.02 && r.pxChg > 0 ? 1 : 0,
  'OI creste + pret scade':         r => r.oiChg > 0.02 && r.pxChg < 0 ? -1 : 0,
  'OI scade + pret creste':         r => r.oiChg < -0.02 && r.pxChg > 0 ? 1 : 0,
  'OI scade + pret scade -> long':  r => r.oiChg < -0.02 && r.pxChg < 0 ? 1 : 0,
  'OI spike >5% in 24h':            r => r.oiChg > 0.05 ? (r.pxChg > 0 ? 1 : -1) : 0,
  'funding neg + OI creste':        r => (r.frNeg === true && r.oiChg > 0.02) ? 1 : 0
};

const base = stat(rows.map(r => r.ret));
console.log('FUNDING + OPEN INTEREST · ' + new Set(rows.map(r => r.sym)).size + ' perpetuals · 4h · orizont ' + H + ' bare');
console.log('baseline (orice bara): ' + base.avg.toFixed(3) + '% pe ' + base.n + ' observatii');
const withOi = rows.filter(r => r.oiChg != null).length;
console.log('observatii cu funding: ' + rows.filter(r => r.fr != null).length + ' | cu OI: ' + withOi + '  (OI = doar ~31 zile, limita Binance)\n');
console.log('  factor                            n      medie     edge    hit       t');
const out = Object.keys(F).map(k => {
  const a = [];
  rows.forEach(r => { const d = F[k](r); if (d) a.push(d * r.ret); });
  const s = stat(a); return { k, ...s, edge: s.avg - base.avg };
}).sort((a, b) => b.t - a.t);
out.forEach(r => {
  if (!r.n) { console.log('  ' + r.k.padEnd(32) + '  (fara semnale)'); return; }
  const flag = Math.abs(r.t) >= 3 ? '  ***' : Math.abs(r.t) >= 2 ? '  **' : '';
  console.log('  ' + r.k.padEnd(32) + String(r.n).padStart(7) +
    ((r.avg >= 0 ? '+' : '') + r.avg.toFixed(3) + '%').padStart(10) +
    ((r.edge >= 0 ? '+' : '') + r.edge.toFixed(3) + '%').padStart(9) +
    (r.hit.toFixed(0) + '%').padStart(6) + r.t.toFixed(2).padStart(8) + flag);
});
console.log('\n  ** = |t|>2   *** = |t|>3   (cere |t|>3; compara MEREU cu controlul short-mereu)');

// split temporal pentru cei mai buni
console.log('\n── SPLIT TEMPORAL (prima jumatate / a doua) ──');
const mid = rows.length ? rows.map(r => r.t).sort((a, b) => a - b)[Math.floor(rows.length / 2)] : 0;
out.filter(r => Math.abs(r.t) >= 2).forEach(f => {
  const a1 = [], a2 = [], b1 = [], b2 = [];
  rows.forEach(r => { const d = F[f.k](r);
    (r.t < mid ? b1 : b2).push(r.ret);
    if (d) (r.t < mid ? a1 : a2).push(d * r.ret); });
  const s1 = stat(a1), s2 = stat(a2), q1 = stat(b1), q2 = stat(b2);
  const e1 = s1.avg - q1.avg, e2 = s2.avg - q2.avg;
  console.log('  ' + f.k);
  console.log('    veche: n=' + String(s1.n).padStart(5) + ' edge ' + (e1 >= 0 ? '+' : '') + e1.toFixed(3) + '% t=' + s1.t.toFixed(2) +
              '   noua: n=' + String(s2.n).padStart(5) + ' edge ' + (e2 >= 0 ? '+' : '') + e2.toFixed(3) + '% t=' + s2.t.toFixed(2) +
              '   -> ' + (e1 * e2 > 0 ? 'ACELASI SEMN' : 'SEMN DIFERIT (instabil)'));
});
if (!out.some(r => Math.abs(r.t) >= 2)) console.log('  (niciun factor peste |t|=2, nimic de validat)');
