// trend-12-1.mjs — robotul zilnic „Trend 12 luni” (14.10.2026). Rulat de .github/workflows/trend-12-1.yml după închiderea US
// (și de mână: `node tools/trend-12-1.mjs`). Scrie în candidate-engine/generated/:
//   univers-sua.json        lista de acțiuni (screenerul Nasdaq, ca în Radar) — reîmprospătată când screenerul răspunde; altfel cea salvată
//   trend-12-1.json         clasamentul zilei (primele 40 cu mom > 0), regimul, universul, eticheta cinstită — îl citește Candidate Engine
//   trend-12-1-istoric.jsonl  o linie pe zi de date (primele 20) — testul adevărat, peste 6–12 luni, pe date nevăzute
// Nu publică nimic dacă SPY lipsește sau dacă au venit sub 70 % din serii (un clasament pe jumătate minte).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { curataUnivers, clasament, regim, liniaIstoric, adaugaIstoric } from './trend-12-1-lib.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN = path.join(ROOT, 'candidate-engine', 'generated');
fs.mkdirSync(GEN, { recursive: true });
const F_UNIV = path.join(GEN, 'univers-sua.json'), F_OUT = path.join(GEN, 'trend-12-1.json'), F_IST = path.join(GEN, 'trend-12-1-istoric.jsonl');
const MIN_CAP = 2e9, N = 600, TOP = 40, PARALEL = 5;
const w = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. universul
let univers, sursa = 'screener', screenerLa = new Date().toISOString();
try {
  const r = await fetch('https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&download=true', { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
  const j = r.ok ? await r.json().catch(() => null) : null, rows = j && j.data && Array.isArray(j.data.rows) ? j.data.rows : null;
  if (!rows || rows.length < 1000) throw new Error('screener: ' + (rows ? rows.length + ' rânduri' : 'HTTP ' + r.status));
  univers = curataUnivers(rows, { minCap: MIN_CAP, n: N });
  fs.writeFileSync(F_UNIV, JSON.stringify({ la: screenerLa, minCap: MIN_CAP, n: univers.length, dinScreener: rows.length, l: univers }));
} catch (e) {
  console.error('screenerul Nasdaq n-a răspuns (' + (e.message || e) + ') ⇒ lista salvată');
  const s = JSON.parse(fs.readFileSync(F_UNIV, 'utf8'));
  univers = s.l; sursa = 'salvat'; screenerLa = s.la;
}
console.log('univers: ' + univers.length + ' acțiuni (' + sursa + ', ' + screenerLa.slice(0, 10) + ')');

// 2. barele zilnice pe 2 ani (12-1 cere ≥ 253 de bare)
const serii = {}, picate = [];
async function adu(s) {
  for (let inc = 0; inc < 4; inc++) {
    try {
      const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(s) + '?interval=1d&range=2y', { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
      if (r.status === 429) { await w(3000 * (inc + 1)); continue; }
      if (!r.ok) { picate.push(s + ' ' + r.status); return; }
      const j = await r.json(), x = j.chart && j.chart.result && j.chart.result[0]; if (!x) { picate.push(s + ' gol'); return; }
      const q = x.indicators.quote[0], out = [];
      (x.timestamp || []).forEach((t, k) => { if ([q.open[k], q.high[k], q.low[k], q.close[k]].every((v) => v > 0)) out.push({ t: t * 1000, o: q.open[k], h: q.high[k], l: q.low[k], c: q.close[k], v: q.volume[k] || 0 }); });
      serii[s] = out; return;
    } catch (e) { if (inc === 3) picate.push(s + ' ' + String(e.message || 'eroare').slice(0, 40)); else await w(1500); }
  }
}
await adu('SPY');
const spy = serii.SPY; delete serii.SPY;
if (!spy || spy.length < 260) { console.error('SPY lipsește ⇒ nu public nimic'); process.exit(1); }
const coada = univers.map((x) => x.s);
await Promise.all(Array.from({ length: PARALEL }, async () => { while (coada.length) await adu(coada.shift()); }));
const aduse = Object.keys(serii).length;
console.log('serii: ' + aduse + ' din ' + univers.length + ' · picate ' + picate.length + (picate.length ? ' (' + picate.slice(0, 8).join(', ') + (picate.length > 8 ? '…' : '') + ')' : ''));
if (aduse < univers.length * 0.7) { console.error('au venit sub 70 % din serii ⇒ nu public un clasament pe jumătate'); process.exit(1); }

// 3. clasamentul + regimul + fișierele
const rez = clasament(serii, spy, { top: TOP }), rg = regim(spy), info = Object.fromEntries(univers.map((x) => [x.s, x]));
const out = {
  versiune: 1, la: new Date().toISOString(), dataUltimei: rez.dataUltimei, regim: rg,
  univers: { n: rez.n, cerute: univers.length, aduse, minCap: MIN_CAP, sursa, screenerLa, excluse: rez.excluse },
  metoda: 'primele 20 % după randamentul pe lunile 2–12 (ultima lună sărită), momentum pozitiv, acțiuni SUA ≥ 2 mld. $, preț ≥ 5 $, ≥ 10 mil. $/zi; regim = SPY peste media pe 200 de zile',
  eticheta: 'selecție probată față de acțiunile din aceeași zi (14.10.2026: +0,9 % pe 20 de zile, +3,4 % pe 60, în ambele jumătăți); neprobată pe listă istorică; în probă — nu e un buton de cumpărat',
  clasament: rez.clasament.map((x) => ({ ...x, nume: info[x.s] ? info[x.s].nume : x.s, sector: info[x.s] && info[x.s].sector || 'Necunoscut', cap: info[x.s] ? info[x.s].cap : null, spark: serii[x.s].slice(-45).map((b) => +b.c.toFixed(4)) })),
};
fs.writeFileSync(F_OUT, JSON.stringify(out));
const ist = fs.existsSync(F_IST) ? fs.readFileSync(F_IST, 'utf8') : '';
fs.writeFileSync(F_IST, adaugaIstoric(ist, liniaIstoric(rez, rg)));
console.log('clasament ' + rez.dataUltimei + ': ' + rez.clasament.length + ' din ' + rez.n + ' clasate (excluse ' + JSON.stringify(rez.excluse) + ') · regim ' + (rg.peste ? 'PORNIT' : 'OPRIT') + ' (SPY ' + rg.inchidere.toFixed(2) + ' vs SMA200 ' + (rg.sma200 || 0).toFixed(2) + ') · primele 5: ' + rez.clasament.slice(0, 5).map((x) => x.s + ' ' + (x.m12 * 100).toFixed(0) + '%').join(', '));
