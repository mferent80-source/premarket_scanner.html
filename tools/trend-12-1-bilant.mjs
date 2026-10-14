// trend-12-1-bilant.mjs — bilanțul probei „Trend 12 luni” (I-614, 14.10.2026). Rulat săptămânal de .github/workflows/trend-12-1-bilant.yml
// (și de mână). Citește istoricul zilnic (primele 20 + universul fiecărei zile), ia prețurile de la Yahoo și măsoară, pe zilele care au
// deja 20 / 60 de zile de bursă după ele, randamentul primelor 20 față de SPY și față de universul zilei (alte acțiuni, aceleași zile).
// Scrie candidate-engine/generated/trend-12-1-bilant.json; pagina arată „proba: N zile, +x % vs alte acțiuni”. Verdictul după criteriile
// pre-înregistrate pe 14.10.2026 (vezi `bilant` în trend-12-1-lib.mjs). Nu e nevoie de nicio cheie.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bilant, mesajBilant } from './trend-12-1-lib.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN = path.join(ROOT, 'candidate-engine', 'generated');
const F_IST = path.join(GEN, 'trend-12-1-istoric.jsonl'), F_OUT = path.join(GEN, 'trend-12-1-bilant.json');
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const istoric = (fs.existsSync(F_IST) ? fs.readFileSync(F_IST, 'utf8') : '').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
if (!istoric.length) { console.log('istoric gol ⇒ nimic de măsurat'); process.exit(0); }
const simboluri = new Set(['SPY']);
istoric.forEach((l) => { (l.top || []).forEach(([s]) => simboluri.add(s)); (l.univers || []).forEach((s) => simboluri.add(s)); });
console.log('istoric: ' + istoric.length + ' zile (' + istoric[0].d + ' … ' + istoric[istoric.length - 1].d + ') · simboluri de adus: ' + simboluri.size);

const preturi = {}, picate = [];
async function adu(s) {
  for (let inc = 0; inc < 4; inc++) {
    try {
      const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(s) + '?interval=1d&range=2y', { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
      if (r.status === 429) { await w(3000 * (inc + 1)); continue; }
      if (!r.ok) { picate.push(s); return; }
      const j = await r.json(), x = j.chart && j.chart.result && j.chart.result[0]; if (!x) { picate.push(s); return; }
      const q = x.indicators.quote[0], out = [];
      (x.timestamp || []).forEach((t, k) => { if ([q.open[k], q.high[k], q.low[k], q.close[k]].every((v) => v > 0)) out.push({ t: t * 1000, o: q.open[k], h: q.high[k], l: q.low[k], c: q.close[k], v: q.volume[k] || 0 }); });
      preturi[s] = out; return;
    } catch (e) { if (inc === 3) picate.push(s); else await w(1500); }
  }
}
const coada = [...simboluri];
await Promise.all(Array.from({ length: 5 }, async () => { while (coada.length) await adu(coada.shift()); }));
if (!preturi.SPY) { console.error('SPY lipsește ⇒ nu pot măsura'); process.exit(1); }
console.log('prețuri: ' + Object.keys(preturi).length + ' serii · picate ' + picate.length);

let prev = null; try { prev = JSON.parse(fs.readFileSync(F_OUT, 'utf8')); } catch { prev = null; }   // I-631: verdictul dinainte
const b = bilant(istoric, preturi, { h: [20, 60] });
const pc = (v) => v == null ? null : +(v * 100).toFixed(2);
const out = {
  versiune: 1, la: new Date().toISOString(), de: istoric[0].d, pana: istoric[istoric.length - 1].d, zile: b.zile, n20: b.n20, n60: b.n60,
  exces20: pc(b.exces20), exces60: pc(b.exces60), nulB20: pc(b.nulB20), nulB60: pc(b.nulB60),
  interval20: b.interval20.map(pc), diferenta20: { medie: pc(b.diferenta20.medie), interval: b.diferenta20.interval.map(pc) }, diferenta60: { medie: pc(b.diferenta60.medie), interval: b.diferenta60.interval.map(pc) },
  ferestre20: b.ferestre20,
  verdict: b.verdict, criterii: b.criterii, cost: 0.3, nota: 'randamente în %, față de SPY, intrare la deschiderea zilei următoare; „alte acțiuni” = universul clasat în aceeași zi',
};
fs.writeFileSync(F_OUT, JSON.stringify(out));
// I-631: Discord DOAR când verdictul s-a schimbat (în probă → probat / picat); fără webhook, doar în jurnal
const mesaj = mesajBilant(prev, out);
if (mesaj && process.env.DISCORD_WEBHOOK) {
  try { const r = await fetch(process.env.DISCORD_WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: mesaj }), signal: AbortSignal.timeout(20000) }); console.log('Discord (verdict schimbat): ' + (r.ok ? 'trimis' : 'HTTP ' + r.status)); } catch (e) { console.error('Discord: ' + (e.message || e)); }
} else console.log('Discord: ' + (mesaj ? 'verdict schimbat, dar fără webhook' : 'verdictul neschimbat, nu trimit'));
console.log('bilanț: ' + b.zile + ' zile în istoric · cu rezultat la 20 z: ' + b.n20 + ', la 60 z: ' + b.n60 + ' · exces 20 z ' + (out.exces20 ?? '—') + ' % vs univers ' + (out.nulB20 ?? '—') + ' % · verdict: ' + b.verdict);
