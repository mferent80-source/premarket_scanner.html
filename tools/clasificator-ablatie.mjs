#!/usr/bin/env node
// I-640 (16.10.2026) — „Aduc ceva indicatorii noi?”: același clasificator cu toți cei 18 indicatori, cu doar cei 10 vechi
// și cu fiecare familie nouă scoasă pe rând, pe universul scannerului, pe aceleași ferestre.
// Scoaterea = indicatorul pus pe 0 pentru toate zilele (arborii nu despart pe o constantă, SVM îl standardizează la 0);
// singura urmă: pădurea alege tot 4 din 18 la fiecare nod, deci are puțin mai puține alegeri utile.
// ATENȚIE: simbolurile au aceleași zile ⇒ nu sunt dovezi independente; comparația e descriptivă, iar numărul de variante e scris.
//   node tools/clasificator-ablatie.mjs [--simboluri AAPL,MSFT] [--iesire docs/clasificator-ablatie]
import { writeFileSync } from 'node:fs';
import { motor, aduCache, universScanner, clasifica, contextSpy } from './clasificator-date.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const VARIANTE = [
  { id: 'toate18', nume: 'Toți cei 18', ascunde: [] },
  { id: 'doar10', nume: 'Doar cei 10 vechi', ascunde: [10, 11, 12, 13, 14, 15, 16, 17] },
  { id: 'faraMACD', nume: 'Fără MACD', ascunde: [10, 11] },
  { id: 'faraSMA', nume: 'Fără SMA20 / SMA50', ascunde: [12, 13] },
  { id: 'faraSR', nume: 'Fără suport / rezistență', ascunde: [14, 15, 16, 17] },
  // I-651 (regula scrisă înaintea probei): contextul SPY rămâne doar dacă mediana scade loss-ul cu ≥0,005 ȘI ajută la ≥60% din acțiuni.
  { id: 'cuContext', nume: 'Cu contextul pieței (SPY)', ascunde: [], context: true },
];
const c = motor('.'), C = c.HoldingsClassifier, simboluri = (arg('--simboluri') || universScanner('.').join(',')).split(',').filter(Boolean), iesire = arg('--iesire', 'docs/clasificator-ablatie-' + new Date().toISOString().slice(0, 10));
const rezultate = {}, picate = [], cache = arg('--cache', null), acum = Number(arg('--acum', Date.now())), alese = arg('--variante', null);
if (alese) { const ids = alese.split(','); for (let i = VARIANTE.length - 1; i >= 0; i--) if (!ids.includes(VARIANTE[i].id)) VARIANTE.splice(i, 1); }
const dateOf = (t) => c.DailySeries.date(t, 'America/New_York'), ctx = VARIANTE.some((v) => v.context) ? contextSpy(await aduCache('SPY', cache), dateOf) : null;
for (const [k, s] of simboluri.entries()) {
  try {
    const serie = c.DailySeries.read(await aduCache(s, cache), s, acum), rand = { asOf: serie.asOf, variante: {} };
    for (const v of VARIANTE) {
      const r = clasifica(c, serie.bars, { now: acum, mascheaza: v.ascunde, spec: v.context ? { context: ctx, dateOf } : {} }), w = r.walk, vote = w.summary ? w.summary.vote : null;
      rand.variante[v.id] = { loss: vote ? vote.nonOverlap.test.loss : r.algos.vote.nonOverlap.loss, frecvente: vote ? vote.nonOverlap.constant.loss : r.references.nonOverlap.constant.loss, n: vote ? vote.nonOverlap.test.n : r.algos.vote.nonOverlap.n, ferestre: vote ? vote.wins : 0, stare: C.assess(r).state, bani: w.money.vote.long };
    }
    rezultate[s] = rand; // doar după ce toate variantele au mers
    process.stdout.write(`${k + 1}/${simboluri.length} ${s} ✓\n`);
  } catch (e) { picate.push(s + ': ' + String(e.message).slice(0, 80)); process.stdout.write(`${k + 1}/${simboluri.length} ${s} ✗ ${e.message}\n`); }
}
const ok = Object.keys(rezultate), med = (xs) => { const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const rez = VARIANTE.map((v) => {
  const d = ok.map((s) => rezultate[s].variante[v.id].loss - rezultate[s].variante.toate18.loss), fr = ok.map((s) => rezultate[s].variante[v.id].loss - rezultate[s].variante[v.id].frecvente);
  const bani = ok.map((s) => rezultate[s].variante[v.id].bani).filter((b) => b.n);
  return { id: v.id, nume: v.nume, simboluri: ok.length, fataDe18: { mediana: med(d), maiBun: d.filter((x) => x < -1e-9).length, maiRau: d.filter((x) => x > 1e-9).length },
    fataDeFrecvente: { mediana: med(fr), bat: fr.filter((x) => x < -0.02).length }, experimental: ok.filter((s) => rezultate[s].variante[v.id].stare === 'research').length,
    baniLong: { simboluri: bani.length, zile: bani.reduce((a, b) => a + b.n, 0), medieMediilor: bani.length ? bani.reduce((a, b) => a + b.mean, 0) / bani.length : null } };
});
const f = (x, d = 3) => (x == null ? '—' : (x > 0 ? '+' : '') + x.toLocaleString('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d }));
const md = [`# Clasificator — aduc ceva indicatorii noi? (I-640, ${new Date().toISOString().slice(0, 10)})`, '',
  `Universul scannerului: ${simboluri.length} simboluri, ${ok.length} calculate${picate.length ? ', ' + picate.length + ' picate' : ''}. Votul celor trei algoritmi, eroarea (log loss) pe orizonturi separate, adunată pe cele 3 ferestre. Mai mic = mai bun.`, '',
  `**Încercări: ${VARIANTE.length} variante** (toate sunt raportate, inclusiv cele care ies mai rău). Simbolurile au aceleași zile, deci NU sunt ${ok.length} dovezi independente: tabelul descrie, nu dovedește.`, '',
  '| Variantă | Față de 18: mediana diferenței | mai bun / mai rău (simboluri) | Față de frecvențe: mediana | bat frecvențele cu 0,02 | „experimental” | Long în bani: medie pe simbol (simboluri, zile) |', '|---|---|---|---|---|---|---|',
  ...rez.map((r) => `| ${r.nume} | ${r.id === 'toate18' ? '—' : f(r.fataDe18.mediana, 4)} | ${r.id === 'toate18' ? '—' : r.fataDe18.maiBun + ' / ' + r.fataDe18.maiRau} | ${f(r.fataDeFrecvente.mediana, 4)} | ${r.fataDeFrecvente.bat} din ${r.simboluri} | ${r.experimental} | ${f(r.baniLong.medieMediilor, 1)}% (${r.baniLong.simboluri}, ${r.baniLong.zile}) |`),
  '', ...Object.entries(picate.reduce((a, x) => { const [s, ...m] = x.split(': '); (a[m.join(': ')] = a[m.join(': ')] || []).push(s); return a; }, {})).map(([m, ss]) => `**Picate (${ss.length}) — ${m}** ${ss.join(', ')}`), ''];
writeFileSync(iesire + '.json', JSON.stringify({ data: new Date().toISOString(), variante: VARIANTE, rezumat: rez, rezultate, picate }, null, 1));
writeFileSync(iesire + '.md', md.join('\n'));
console.log(md.join('\n'));
