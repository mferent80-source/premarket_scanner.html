// trend-12-1-bilant.mjs — bilanțul probei „Trend 12 luni” (I-614, 14.10.2026). Rulat săptămânal de .github/workflows/trend-12-1-bilant.yml
// (și de mână). Citește istoricul zilnic (primele 20 + universul fiecărei zile), ia prețurile de la Yahoo și măsoară, pe zilele care au
// deja 20 / 60 de zile de bursă după ele, randamentul primelor 20 față de SPY și față de universul zilei (alte acțiuni, aceleași zile).
// Scrie candidate-engine/generated/trend-12-1-bilant.json; pagina arată „proba: N zile, +x % vs alte acțiuni”. Verdictul după criteriile
// pre-înregistrate pe 14.10.2026 (vezi `bilant` în trend-12-1-lib.mjs). Nu e nevoie de nicio cheie.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bilant, mesajBilantDiscord, continutBilant, citesteInghetatTrend, amprentaClasamentTrend, liniiInProba } from './trend-12-1-lib.mjs';
import { calendarSUA, intervalPentru } from '../lib/proba-contract.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN = path.join(ROOT, 'candidate-engine', 'generated');
const F_IST = path.join(GEN, 'trend-12-1-istoric.jsonl'), F_OUT = path.join(GEN, 'trend-12-1-bilant.json');
// 27.10.2026 (revizia F, 🔴3): zilele cu orizontul încheiat (+ 10 sesiuni), înghețate cu cifrele lor — fișierul doar crește
// (garda: tools/trend-12-1-inghet.test.mjs); bilanțul nu le mai recalculează din Yahoo
const F_INGHETAT = path.join(GEN, 'trend-12-1-inghetat.jsonl');
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const istoricTot = (fs.existsSync(F_IST) ? fs.readFileSync(F_IST, 'utf8') : '').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
// 28.10.2026 (revizia F2, 🟡3): doar liniile versiunii de acum a clasamentului (o regulă schimbată repornește proba; liniile vechi rămân în istoric)
const V = amprentaClasamentTrend(), istoric = liniiInProba(istoricTot, V);
console.log('clasamentul ' + V + ': ' + istoric.length + ' din ' + istoricTot.length + ' linii în probă');
if (!istoric.length) { console.log('nicio linie a versiunii de acum ⇒ nimic de măsurat'); process.exit(0); }
const simboluri = new Set(['SPY']);
istoric.forEach((l) => { (l.top || []).forEach(([s]) => simboluri.add(s)); (l.univers || []).forEach((s) => simboluri.add(s)); });
const inghetate = fs.existsSync(F_INGHETAT) ? citesteInghetatTrend(fs.readFileSync(F_INGHETAT, 'utf8')) : [];
// 27.10.2026 (revizia F, 🔴3): SPY pe un interval care acoperă prima zi a istoricului (le așază pe toate în calendar); acțiunile doar de la prima
// zi încă neînghețată (2y ⇒ 5y ⇒ 10y) — înainte totul era fix pe 2 ani și ferestrele vechi ieșeau din calcul (fereastră alunecătoare)
const gataZi = new Set(inghetate.filter((x) => x && x.tip === 'zi' && x.h === 20).map((x) => x.d)), gata60 = new Set(inghetate.filter((x) => x && x.tip === 'zi' && x.h === 60).map((x) => x.d));
const primaVie = (istoric.find((l) => !(gataZi.has(l.d) && gata60.has(l.d))) || istoric[istoric.length - 1]).d, azi = new Date().toISOString().slice(0, 10);
const RANGE_SPY = intervalPentru(istoric[0].d, azi), RANGE = intervalPentru(primaVie, azi);
console.log('istoric: ' + istoric.length + ' zile (' + istoric[0].d + ' … ' + istoric[istoric.length - 1].d + ') · simboluri de adus: ' + simboluri.size + ' · înghețate: ' + inghetate.length + ' · interval ' + RANGE + ' (SPY ' + RANGE_SPY + ')');

const preturi = {}, picate = [];
async function adu(s, range = s === 'SPY' ? RANGE_SPY : RANGE) {
  for (let inc = 0; inc < 4; inc++) {
    try {
      const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(s) + '?interval=1d&range=' + range, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
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
const b = bilant(istoric, preturi, { h: [20, 60], inghetate });
// 27.10.2026 (docs/trend-12-1-protocol.md): conținutul fișierului e construit de o funcție pură (testată), cu delistatele, judecătorul și contractul
const out = { ...continutBilant(b, istoric, { cal: calendarSUA(ROOT), azi: new Date().toISOString().slice(0, 10), la: new Date().toISOString() }), versiune: V, liniiAltaVersiune: istoricTot.length - istoric.length };
fs.writeFileSync(F_OUT, JSON.stringify(out));
if (b.deIngheta.length) { fs.appendFileSync(F_INGHETAT, b.deIngheta.map((x) => JSON.stringify(x)).join('\n') + '\n'); console.log('înghețate acum: ' + b.deIngheta.length + ' zile'); }
// I-631: Discord DOAR când verdictul s-a schimbat (în probă → probat / picat); fără webhook, doar în jurnal
const mesaj = mesajBilantDiscord(prev, out);   // 27.10.2026 (I-764): cu eticheta „neverificat de om” la final
if (mesaj && process.env.DISCORD_WEBHOOK) {
  try { const r = await fetch(process.env.DISCORD_WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: mesaj }), signal: AbortSignal.timeout(20000) }); console.log('Discord (verdict schimbat): ' + (r.ok ? 'trimis' : 'HTTP ' + r.status)); } catch (e) { console.error('Discord: ' + (e.message || e)); }
} else console.log('Discord: ' + (mesaj ? 'verdict schimbat, dar fără webhook' : 'verdictul neschimbat, nu trimit'));
console.log('bilanț: ' + b.zile + ' zile în istoric · cu rezultat la 20 z: ' + b.n20 + ', la 60 z: ' + b.n60 + ' · exces 20 z ' + (out.exces20 ?? '—') + ' % vs univers ' + (out.nulB20 ?? '—') + ' % · verdict: ' + b.verdict);
