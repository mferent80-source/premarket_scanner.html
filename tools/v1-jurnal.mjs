// 18.10.2026 — Robotul probei Reguli V1 (GitHub Actions, zilnic după închiderea SUA). Protocolul: docs/v1-proba-protocol.md.
// Rulează exact motorul din aplicație (lib/independent-scanner.js) pe universul înghețat, notează ziua în
// scanner-verdicts/generated/v1-jurnal.json și scrie evaluarea în scanner-verdicts/generated/v1-proba.json. Fără chei.
import vm from 'node:vm';
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { PROTOCOL, inregistrare, adauga, evalueaza, versiuneV1, contractProba, citesteInghetat, liniiInghetat, baraValida, amprentaDependinteV1 } from '../lib/v1-proba.mjs';
import { istoricDependinte } from '../lib/premarket-proba.mjs';
import { calendarSUA, intervalPentru, simboluriDeReluat, taieLaZi } from '../lib/proba-contract.mjs';

const DIR = 'scanner-verdicts/generated', JURNAL = DIR + '/v1-jurnal.json', PROBA = DIR + '/v1-proba.json';
// 27.10.2026 (revizia F, 🔴2): perioadele închise (cu randamentele lor) și judecata, înghețate — fișierul doar crește (garda: tools/probe-inghetat.test.mjs)
const INGHETAT = DIR + '/v1-inghetat.jsonl';
const z = (ms) => new Promise((r) => setTimeout(r, ms));
export const serii = {}; // simbol → [{ d, c }] din aceleași bare pe care le-a văzut motorul

function dataLocala(t, zone) { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(t)).map((x) => [x.type, x.value])); return p.year + '-' + p.month + '-' + p.day; }
// Aceeași formă ca D.fetchStock din lib/data.js (bare valide + meta), direct de la Yahoo.
export async function fetchStock(symbol, opts = {}) {
  const range = opts.range || '2y', interval = opts.interval || '1d';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&events=div%2Csplits&includeAdjustedClose=true`;
  let j, ultima;
  for (let incercare = 0; incercare < 4 && !j; incercare++) {
    try { const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (trading-tools v1-proba)' }, signal: AbortSignal.timeout(20000) }); if (r.status === 429 || r.status >= 500) throw Error('Yahoo ' + r.status); j = await r.json(); }
    catch (e) { ultima = e; await z(1500 * (incercare + 1)); }
  }
  const res = j?.chart?.result?.[0]; if (!res) throw Error('Yahoo: simbol indisponibil — ' + symbol + (ultima ? ' (' + ultima.message + ')' : ''));
  const ts = res.timestamp || [], q = res.indicators?.quote?.[0] || {}, out = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i], v = q.volume?.[i];
    /* 28.10.2026 (revizia F2, 🟡3): filtrul barelor stă în bibliotecă, în amprenta evaluatorului */ if (baraValida(ts[i], o, h, l, c)) out.push({ t: ts[i] * 1000, o, h, l, c, v: v != null && isFinite(v) ? v : 0 });
  }
  if (!out.length) throw Error('Yahoo: serie goală pentru ' + symbol);
  const m = res.meta || {};
  Object.defineProperty(out, 'meta', { value: Object.freeze({ symbol: m.symbol || null, currency: m.currency || null, exchange: m.exchangeName || null, timezone: m.exchangeTimezoneName || null, regularEnd: Number.isFinite(m.currentTradingPeriod?.regular?.end) ? m.currentTradingPeriod.regular.end * 1000 : null, provider: 'Yahoo Finance', interval, readAt: Date.now() }) });
  if (interval === '1d' && m.exchangeTimezoneName) serii[symbol] = out.map((b) => ({ d: dataLocala(b.t, m.exchangeTimezoneName), c: b.c }));
  return out;
}
function motor() {
  const c = { console, Intl, Date, Math, JSON, Map, Set, URL, Promise, Error, Number, String, Array, Object, AbortController, setTimeout, clearTimeout };
  c.window = c; vm.createContext(c);
  for (const f of ['lib/exchange-calendar.js', 'lib/daily-series.js', 'lib/independent-scanner.js']) vm.runInContext(readFileSync(f, 'utf8'), c);
  c.D = { fetchStock: (s, o) => fetchStock(s, o) };
  return c;
}
/** 27.10.2026 (v1-proba-2, I-743): versiunea probei = amprenta SHA a regulilor V1 + a evaluatorului, nu șirul constant VERSION. */
export function versiuneaDeAzi(radacina = '.') { return versiuneV1(readFileSync(radacina + '/lib/independent-scanner.js', 'utf8')); }
/** Conținutul fișierului v1-proba.json (pur): evaluarea pe orizonturi + câmpurile de contract (putere / primulVerdict / judecata) +
 *  proba precedentă (jurnalul ei rămâne în v1-jurnal.json sub versiunea veche, neatins). */
export function continutProba({ jurnal, V, rec, report, serii: s, sesiuni, cal, azi, inghetate = null }) {
  const zileVersiune = jurnal.zile.filter((zi) => zi.v === V);
  // 27.10.2026 (revizia F, 🔴2): cu `inghetate`, evaluarea stă pe perioadele înghețate; `deScris` = liniile noi (nu intră în fișierul probei)
  const ev = PROTOCOL.orizonturi.map((k) => evalueaza(jurnal, s, { k, versiune: V, sesiuni, inghetate, la: inghetate ? rec.la : null })), deScris = ev.flatMap((o) => o.deScris || []);
  const c = contractProba(ev.map(({ deScris: _, ...o }) => o), { jurnal, versiune: V, cal, azi });
  return { protocol: PROTOCOL.id, scrisLa: PROTOCOL.scrisLa, versiune: V,
    precedent: { ...PROTOCOL.precedent, nota: 'zilele probei ' + PROTOCOL.precedent.id + ' (' + PROTOCOL.precedent.versiune + ') rămân în jurnal sub versiunea veche; nu intră în proba de acum' },
    inceput: zileVersiune[0]?.zi || null, zile: zileVersiune.length, ultimaZi: rec.zi, ultimaRulare: rec.la,
    dependinte: istoricDependinte(jurnal, V),
    azi: { verificate: report.verifiedCount, total: report.items.length, indeplinesc: rec.r.filter((x) => x[1] === 'm').length, sus: rec.r.filter((x) => x[1] !== 'u' && x[2] >= PROTOCOL.pragSus).length },
    orizonturi: c.orizonturi, putere: c.putere, primulVerdict: c.primulVerdict, judecata: c.judecata, sesiuni: c.sesiuni, deScris };
}
/** 27.10.2026 (revizia F, 🔴1): ce se reia înainte de evaluare. Cât 2 ani acoperă prima zi a versiunii + orizontul, doar simbolurile fără
 *  serie (scannerul a adus deja 2 ani de bare pentru acțiuni și repere); după aceea TOATE simbolurile zilelor versiunii + SPY, pe intervalul
 *  lung (5y / 10y) — altfel perioadele vechi ar ieși din fereastră și judecata s-ar face pe o fereastră alunecătoare. */
export function planReluare({ jurnal, V, azi = new Date().toISOString().slice(0, 10), serii: cunoscute = serii }) {
  const prima = (jurnal?.zile || []).filter((z) => z.v === V && z.zi).map((z) => z.zi).sort()[0] || azi, range = intervalPentru(prima, azi), toate = simboluriDeReluat(jurnal, V);
  return { range, simboluri: range === '2y' ? toate.filter((x) => !cunoscute[x]) : toate };
}
/** 28.10.2026 (revizia F2, 🟡5): noaptea după aducerea seriilor, ca funcție pură — fișierul probei, ce e de înghețat și liniile de adăugat,
 *  din jurnal, ziua notată, seriile (tăiate aici la ziua ei) și TEXTUL fișierului înghețat. `main` doar citește și scrie; testată noapte de
 *  noapte (tools/robot-noapte.test.mjs): un robot care n-ar citi fișierul înghețat pierde perioadele când seriile se scurtează. */
export function noapte({ jurnal, V, rec, report, serii: s, cal, azi, inghetatText = '' }) {
  const ev = taieLaZi(s, rec.zi), sesiuni = (ev.SPY || []).map((x) => x.d), inghetate = citesteInghetat(inghetatText);
  const { deScris, ...j } = continutProba({ jurnal, V, rec, report, serii: ev, sesiuni, cal, azi, inghetate });
  return { j, deScris, linii: deScris.length ? liniiInghetat(deScris) : '' };
}
async function main() {
  const c = motor(), V = versiuneaDeAzi('.');
  const report = await c.IndependentScanner.scan({ symbols: [...PROTOCOL.univers], concurrency: 3 });
  const rec = { ...inregistrare(report, Date.now(), V), d: amprentaDependinteV1((f) => readFileSync(f, 'utf8')) };   // 28.10.2026 (revizia F2, 🟡3): amprenta dependențelor pe zi, ca la Top Long
  if (!rec.zi) throw Error('Nicio acțiune verificată azi (' + report.failures.length + ' eșecuri) — jurnalul rămâne neschimbat.');
  mkdirSync(DIR, { recursive: true });
  const vechi = existsSync(JURNAL) ? JSON.parse(readFileSync(JURNAL, 'utf8')) : { zile: [] };
  // 27.10.2026: rularea de rezervă de dimineață (DOAR_LIPSA=1) notează ziua doar dacă lipsește; cea notată seara, la timp, nu se rescrie cu ora de dimineață
  if (process.env.DOAR_LIPSA && (vechi.zile || []).some((z) => z && z.zi === rec.zi && z.v === V)) { console.log('V1 ' + V + ' · ziua ' + rec.zi + ' e deja notată — nimic de făcut (rularea de rezervă).'); return; }
  const jurnal = adauga(vechi, rec);
  // reperele folosite în zilele vechi (EXSA.DE / ^STOXX / IVV…) trebuie să aibă bare și azi
  // 27.10.2026 (revizia F, 🔴1 / 🟡10): seriile acoperă toată proba (planReluare), apoi se taie la ziua notată (fără bare intraday)
  const plan = planReluare({ jurnal, V });
  for (const s of plan.simboluri) { try { await fetchStock(s, { range: plan.range, interval: '1d' }); } catch (e) { console.log('serie ' + s + ' (' + plan.range + '): ' + e.message); } }
  const { j, deScris, linii } = noapte({ jurnal, V, rec, report, serii, cal: calendarSUA('.'), azi: new Date().toISOString().slice(0, 10), inghetatText: existsSync(INGHETAT) ? readFileSync(INGHETAT, 'utf8') : '' });
  writeFileSync(JURNAL, JSON.stringify(jurnal));
  writeFileSync(PROBA, JSON.stringify(j, null, 1));
  if (linii) { appendFileSync(INGHETAT, linii); console.log('  înghețat: ' + deScris.map((x) => x.tip + ' k=' + x.k + ' ' + (x.zi || x.data)).join(', ')); }
  console.log(`V1 ${V} · ziua ${rec.zi} · ${report.verifiedCount}/${report.items.length} verificate · ${j.zile} zile în probă · primul verdict ~${j.primulVerdict?.realist || '—'}`);
  for (const o of j.orizonturi) console.log(`  k=${o.k}: ` + (o.necesare ? `${o.perioade}/${o.necesare} perioade · ${o.verdict}` : `${o.perioade} perioade · doar monitorizare`));
}
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/v1-jurnal.mjs')) main().catch((e) => { console.error(e.message); process.exit(1); });
