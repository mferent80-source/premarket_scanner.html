// trend-12-1.mjs — robotul zilnic „Trend 12 luni” (14.10.2026). Rulat de .github/workflows/trend-12-1.yml după închiderea US
// (și de mână: `node tools/trend-12-1.mjs`). Scrie în candidate-engine/generated/:
//   univers-sua.json          lista de acțiuni (screenerul Nasdaq, ca în Radar) — reîmprospătată când screenerul răspunde; altfel cea salvată
//   trend-12-1.json           clasamentul zilei (primele 40 cu mom > 0), regimul, universul, raportările (I-621), ieșirile/intrările (I-615),
//                             sectoarele primelor 20 (I-616), eticheta cinstită — îl citește Candidate Engine
//   trend-12-1-istoric.jsonl  o linie pe zi de date (primele 20 + universul zilei) — bilanțul probei (I-614) și testul de peste 6–12 luni
// Discord (I-617): mesaj DOAR când s-a schimbat ceva (regim, intrări, ieșiri), cu DISCORD_WEBHOOK din secretele Actions.
// Raportările (I-621): FINNHUB_API_KEY din secretele Actions (același ca price-alerts); fără el, câmpul lipsește și pagina spune „neverificat”.
// Nu publică nimic dacă SPY lipsește sau dacă au venit sub 70 % din serii (un clasament pe jumătate minte).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { amprentaClasamentTrend, baraTrend, RANGE_CLASAMENT, curataUnivers, instantaneuUnivers, caleArhivaUnivers, clasament, regim, liniaIstoric, adaugaIstoric, taieBaraPartiala, raporteazaDinCalendar, iesiri, intrari, mesajDiscord, validareFisiere, decizieDateVechi } from './trend-12-1-lib.mjs';
import zlib from 'node:zlib';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN = path.join(ROOT, 'candidate-engine', 'generated');
fs.mkdirSync(GEN, { recursive: true });
const F_UNIV = path.join(GEN, 'univers-sua.json'), F_OUT = path.join(GEN, 'trend-12-1.json'), F_IST = path.join(GEN, 'trend-12-1-istoric.jsonl');
const MIN_CAP = 2e9, N = 600, TOP = 40, PARALEL = 5;
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { 'user-agent': 'Mozilla/5.0' };

// 1. universul
let univers, sursa = 'screener', screenerLa = new Date().toISOString();
try {
  const r = await fetch('https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&download=true', { headers: { ...UA, accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
  const j = r.ok ? await r.json().catch(() => null) : null, rows = j && j.data && Array.isArray(j.data.rows) ? j.data.rows : null;
  if (!rows || rows.length < 1000) throw new Error('screener: ' + (rows ? rows.length + ' rânduri' : 'HTTP ' + r.status));
  univers = curataUnivers(rows, { minCap: MIN_CAP, n: N });
  fs.writeFileSync(F_UNIV, JSON.stringify({ la: screenerLa, minCap: MIN_CAP, n: univers.length, dinScreener: rows.length, l: univers }));
  // I-715 (19.10.2026): arhiva zilnică a universului (toate ≥ 2 mld., datată, comprimată) — fără supraviețuitori pentru cercetarea viitoare
  try {
    const inst = instantaneuUnivers(rows, screenerLa, MIN_CAP), f = path.join(GEN, caleArhivaUnivers(inst.d));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(inst)));
    console.log('arhiva universului: ' + inst.n + ' acțiuni ⇒ ' + path.relative(GEN, f));
  } catch (e) { console.error('arhiva universului n-a putut fi scrisă: ' + (e.message || e)); }
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
      const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(s) + '?interval=1d&range=' + RANGE_CLASAMENT, { headers: UA, signal: AbortSignal.timeout(20000) });   // 28.10.2026 (revizia F3, 🔵8): intervalul din bibliotecă, în amprentă
      if (r.status === 429) { await w(3000 * (inc + 1)); continue; }
      if (!r.ok) { picate.push(s + ' ' + r.status); return; }
      const j = await r.json(), x = j.chart && j.chart.result && j.chart.result[0]; if (!x) { picate.push(s + ' gol'); return; }
      const q = x.indicators.quote[0], out = [];
      (x.timestamp || []).forEach((t, k) => { if (baraTrend(q.open[k], q.high[k], q.low[k], q.close[k])) out.push({ t: t * 1000, o: q.open[k], h: q.high[k], l: q.low[k], c: q.close[k], v: q.volume[k] || 0 }); });
      serii[s] = out; return;
    } catch (e) { if (inc === 3) picate.push(s + ' ' + String(e.message || 'eroare').slice(0, 40)); else await w(1500); }
  }
  picate.push(s + ' 429 (4 încercări)');   // revizie 14.10: după 4×429 simbolul nu ajungea în jurnal
}
await adu('SPY');
let spy = serii.SPY; delete serii.SPY;
if (!spy || spy.length < 260) { console.error('SPY lipsește ⇒ nu public nimic'); process.exit(1); }
const coada = univers.map((x) => x.s);
await Promise.all(Array.from({ length: PARALEL }, async () => { while (coada.length) await adu(coada.shift()); }));
// audit 14.10: rulat de mână în timpul sesiunii, ultima bară e neînchisă — se taie, altfel „EOD azi” ar fi o minciună
const partial = taieBaraPartiala(serii, spy);
if (partial.taiat) { console.log('sesiunea New York e deschisă ⇒ bara de azi (neînchisă) tăiată din toate seriile'); Object.assign(serii, partial.serii); spy = partial.spy; }
const aduse = Object.keys(serii).length;
console.log('serii: ' + aduse + ' din ' + univers.length + ' · picate ' + picate.length + (picate.length ? ' (' + picate.slice(0, 8).join(', ') + (picate.length > 8 ? '…' : '') + ')' : ''));
if (aduse < univers.length * 0.7) { console.error('au venit sub 70 % din serii ⇒ nu public un clasament pe jumătate'); process.exit(1); }

// 3. clasamentul + regimul
const rez = clasament(serii, spy, { top: TOP }), rg = regim(spy), info = Object.fromEntries(univers.map((x) => [x.s, x]));
// revizie 14.10: garda de 70 % pe CLASATE, nu pe aduse (o zi cu 500 de serii „vechi” dădea un clasament din 100); clasament gol = nu public
if (rez.n < 0.7 * Math.max(1, aduse - rez.excluse.scurt) || !rez.clasament.length) { console.error('clasate ' + rez.n + ' din ' + aduse + ' aduse (scurte ' + rez.excluse.scurt + ', vechi ' + rez.excluse.vechi + ') ⇒ sub 70 % sau clasament gol — nu public'); process.exit(1); }
// 15.10.2026: date VECHI (2+ zile) peste 5 % ⇒ prima încercare (22:40 UTC) nu publică, a doua (03:10 UTC) reîncearcă; a doua tot peste ⇒ pică
// (pasul „Discord la eșec”, I-629). O zi de întârziere nu mai contează aici: acțiunea se clasează pe ultima ei zi (clasament → intarziat).
const decizie = decizieDateVechi({ vechi: rez.excluse.vechi, baza: aduse - rez.excluse.scurt, incercare: process.env.INCERCARE });
console.log('date: ' + rez.intarziate + ' cu o zi de întârziere (clasate pe ultima lor zi) · ' + rez.excluse.vechi + ' vechi (2+ zile) din ' + (aduse - rez.excluse.scurt) + ' · încercarea ' + (process.env.INCERCARE || 'prima') + ' ⇒ ' + decizie);
if (decizie === 'reincerc') { console.log('peste 5 % date vechi ⇒ nu public acum; a doua încercare la 03:10 UTC'); process.exit(0); }
if (decizie === 'pica') { console.error('și a doua încercare: peste 5 % date vechi ⇒ nu public'); process.exit(1); }
const top20 = rez.clasament.slice(0, 20);

// 4. raportările (I-621) — cheia din secretele Actions; fără ea, câmpul lipsește
let raportari = { sursa: 'lipsă', la: null }, harta = {};
if (process.env.FINNHUB_API_KEY) {
  try {
    const pana = new Date(Date.parse(rez.dataUltimei + 'T12:00:00Z') + 14 * 86400000).toISOString().slice(0, 10);
    const r = await fetch('https://finnhub.io/api/v1/calendar/earnings?from=' + rez.dataUltimei + '&to=' + pana + '&token=' + encodeURIComponent(process.env.FINNHUB_API_KEY), { headers: UA, signal: AbortSignal.timeout(30000) });
    const j = r.ok ? await r.json() : null;
    if (!j || !Array.isArray(j.earningsCalendar)) throw new Error('HTTP ' + r.status);
    harta = raporteazaDinCalendar(j.earningsCalendar, rez.dataUltimei);
    raportari = { sursa: 'finnhub', la: new Date().toISOString(), fereastraZile: 14, n: Object.keys(harta).length };
  } catch (e) { console.error('calendarul Finnhub n-a răspuns (' + (e.message || e) + ') ⇒ fără raportări'); raportari = { sursa: 'eroare', la: new Date().toISOString(), motiv: String(e.message || e).slice(0, 80) }; }
} else console.log('FINNHUB_API_KEY lipsește ⇒ fără raportări în JSON (pagina spune „neverificat”)');

// 5. ieșiri / intrări față de ziua dinainte (I-615), sectoarele primelor 20 (I-616)
const ist = fs.existsSync(F_IST) ? fs.readFileSync(F_IST, 'utf8') : '';
const liniiIst = ist.split('\n').filter(Boolean);
let prev = null, rerulare = false; try { prev = liniiIst.length ? JSON.parse(liniiIst[liniiIst.length - 1]) : null; } catch { prev = null; }
if (prev && prev.d === rez.dataUltimei) { rerulare = true; try { prev = liniiIst.length > 1 ? JSON.parse(liniiIst[liniiIst.length - 2]) : null; } catch { prev = null; } }   // aceeași zi de date (re-rulare, sărbătoare US): nu e o zi nouă
// 15.10: fără date azi (vechi 2+ zile sau neaduse) ≠ ieșire din trend — nu intră la ieșiri și nu pleacă pe Discord
const faraDate = new Set(rez.faraDate.concat(picate.map((x) => String(x).split(' ')[0])));
const faraDateTop = prev && Array.isArray(prev.top) ? prev.top.map(([s]) => s).filter((s) => faraDate.has(s)) : [];
if (faraDateTop.length) console.log('din topul de ieri, fără date azi (nu le trec la ieșiri): ' + faraDateTop.join(', '));
const ies = iesiri(prev, rez.toate, rg, faraDate), intr = prev ? intrari(prev, top20) : [];   // prima zi din istoric nu e „20 de intrări”
const sectoare = {}; top20.forEach((x) => { const s = info[x.s] && info[x.s].sector || 'Necunoscut'; sectoare[s] = (sectoare[s] || 0) + 1; });

// 6. fișierele
const out = {
  versiune: 1, la: new Date().toISOString(), dataUltimei: rez.dataUltimei, regim: rg,
  univers: { n: rez.n, cerute: univers.length, aduse, minCap: MIN_CAP, sursa, screenerLa, excluse: rez.excluse, intarziate: rez.intarziate },
  faraDateTop,   /* 15.10: din topul de ieri, fără date azi — nu sunt ieșiri */
  metoda: 'primele 20 % după randamentul pe lunile 2–12 (ultima lună sărită), momentum pozitiv, acțiuni SUA ≥ 2 mld. $, preț ≥ 5 $, ≥ 10 mil. $/zi; regim = SPY peste media pe 200 de zile',
  eticheta: 'indiciu față de acțiunile din aceeași zi (5 ani: +0,8 % pe 20 de zile, t ≈ 1,5 pe ferestre independente — sub pragul de „probat”); neprobat pe listă istorică; în probă — nu e un buton de cumpărat',
  raportari, sectoare, ziuaDinainte: prev ? prev.d : null,
  iesiri: ies.map((x) => ({ ...x, nume: info[x.s] ? info[x.s].nume : x.s, sector: info[x.s] && info[x.s].sector || 'Necunoscut' })),
  intrari: intr.map((x) => x.s),
  clasament: rez.clasament.map((x) => ({ ...x, nume: info[x.s] ? info[x.s].nume : x.s, sector: info[x.s] && info[x.s].sector || 'Necunoscut', cap: info[x.s] ? info[x.s].cap : null, spark: serii[x.s].slice(-45).map((b) => +b.c.toFixed(4)), ...(harta[x.s] ? { raporteaza: harta[x.s] } : {}) })),
};
const istNou = adaugaIstoric(ist, { ...liniaIstoric(rez, rg), v: amprentaClasamentTrend() });   // 28.10.2026 (revizia F2, 🟡3): amprenta clasamentului pe linie
const probleme = validareFisiere(out, istNou);
if (probleme.length) { console.error('garda de formă a picat: ' + probleme.join('; ') + ' ⇒ nu public'); process.exit(1); }
fs.writeFileSync(F_OUT, JSON.stringify(out));
fs.writeFileSync(F_IST, istNou);
console.log('clasament ' + rez.dataUltimei + ': ' + rez.clasament.length + ' din ' + rez.n + ' clasate (excluse ' + JSON.stringify(rez.excluse) + ') · regim ' + (rg.peste ? 'PORNIT' : 'OPRIT') + ' (SPY ' + rg.inchidere.toFixed(2) + ' vs SMA200 ' + (rg.sma200 || 0).toFixed(2) + ') · primele 5: ' + rez.clasament.slice(0, 5).map((x) => x.s + ' ' + (x.m12 * 100).toFixed(0) + '%').join(', '));
console.log('raportări: ' + raportari.sursa + (raportari.n != null ? ' (' + raportari.n + ' în 14 zile, ' + top20.filter((x) => harta[x.s]).length + ' din primele 20)' : '') + ' · ieșiri ' + ies.length + ' · intrări ' + intr.length + ' · sectoare ' + JSON.stringify(sectoare));

const salturi = top20.filter((x) => x.salt && x.salt.pct >= 0.5).map((x) => ({ s: x.s, ...x.salt }));
console.log('salt ≥ 50 % într-o zi în primele 20 (verifică seria): ' + (salturi.length ? salturi.map((x) => x.s + ' ' + Math.round(x.pct * 100) + ' % ' + x.d).join(', ') : 'niciunul'));

// 7. Discord — doar la schimbare
const mesaj = mesajDiscord({ dataUltimei: rez.dataUltimei, regim: rg, regimPrev: prev ? prev.regim : null, intrari: intr, iesiri: ies, raporteaza: top20.filter((x) => harta[x.s]).map((x) => ({ s: x.s, ...harta[x.s] })), salturi });
if (mesaj && rerulare) console.log('Discord: aceeași zi de date ca ultima linie (re-rulare / sărbătoare) ⇒ nu retrimit');
else if (mesaj && process.env.DISCORD_WEBHOOK) {
  try {
    const r = await fetch(process.env.DISCORD_WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: mesaj }), signal: AbortSignal.timeout(20000) });
    console.log('Discord: ' + (r.ok ? 'trimis' : 'HTTP ' + r.status));
  } catch (e) { console.error('Discord: ' + (e.message || e)); }
} else console.log('Discord: ' + (mesaj ? 'fără webhook' : 'nimic schimbat, nu trimit'));
