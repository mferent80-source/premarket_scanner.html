// 18.10.2026 — Robotul probei Premarket Scanner, Top Long (GitHub Actions, zilnic după închiderea SUA, după robotul V1).
// Protocolul: docs/premarket-proba-protocol.md. Rulează EXACT codul paginii (candidate-engine/engine.js) pe universul Core înghețat,
// cu Governor = TRADE, fără raportări, cu harta de sectoare de bază; notează ziua în scanner-verdicts/generated/premarket-jurnal.json
// și scrie evaluarea în scanner-verdicts/generated/premarket-proba.json. Fără chei.
import vm from 'node:vm';
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { fetchStock, serii } from './v1-jurnal.mjs';
import { adauga, contractProba, citesteInghetat, liniiInghetat } from '../lib/v1-proba.mjs';
import { PROTOCOL, versiune, inregistrare, evalueaza, amprentaDependinte, istoricDependinte } from '../lib/premarket-proba.mjs';
import { calendarSUA, intervalPentru, simboluriDeReluat, taieLaZi } from '../lib/proba-contract.mjs';
import { pasUmbra, versiune as versiuneUmbra, bareZilnice, PROTOCOL as UMBRA } from '../lib/reversal-umbra.mjs';

const DIR = 'scanner-verdicts/generated', JURNAL = DIR + '/premarket-jurnal.json', PROBA = DIR + '/premarket-proba.json';
// 27.10.2026 (revizia F, 🔴2): perioadele închise și judecata Top Long, înghețate — fișierul doar crește (garda: tools/probe-inghetat.test.mjs)
const INGHETAT = DIR + '/premarket-inghetat.jsonl';
// 19.10.2026 — I-716: jurnalul SEPARAT al stopului Early Reversal „în umbră” (docs/reversal-stop-umbra-protocol.md)
const UMBRA_JURNAL = DIR + '/reversal-umbra-jurnal.json', UMBRA_PROBA = DIR + '/reversal-umbra-proba.json';
const MARCAJ = '  validateDeps(); bind();';

/** Motorul paginii într-un context izolat: aceleași biblioteci ca pagina, un DOM minim, `?fundal=1` (o scanare, fără ceas). */
/** 19.10.2026 — I-720: calendarul Finnhub pentru robot, cu cheia din secretele Actions (FINNHUB_API_KEY), DOAR dacă protocolul probei
    îl cere (`calendar: true`). Oprit ⇒ nicio cerere. Pornit, dar fără cheie sau cu un răspuns care nu e calendar ⇒ eroare (robotul se
    oprește; o zi judecată cu alte reguli decât restul probei ar amesteca proba). Aceleași tickere ca garda paginii (lib/earnings.js, `toate`). */
export async function calendarPentruProba(protocol = PROTOCOL, env = process.env, fetchFn = fetch, azi = new Date().toISOString().slice(0, 10)) {
  if (protocol.calendar !== true) return { folosit: false, motiv: 'calendarul e oprit în protocolul ' + protocol.id + ' (penalizarea „neverificat” pentru toate)' };
  const cheie = env.FINNHUB_API_KEY;
  if (!cheie) throw Error('Protocolul ' + protocol.id + ' cere calendarul, dar FINNHUB_API_KEY lipsește din secretele Actions.');
  const pana = new Date(Date.parse(azi + 'T12:00:00Z') + 14 * 86400000).toISOString().slice(0, 10);
  const r = await fetchFn('https://finnhub.io/api/v1/calendar/earnings?from=' + azi + '&to=' + pana + '&token=' + encodeURIComponent(cheie), { signal: AbortSignal.timeout(30000) });
  if (!r || !r.ok) throw Error('Calendarul Finnhub n-a răspuns (HTTP ' + (r ? r.status : '—') + ').');
  const j = await r.json();
  if (!j || !Array.isArray(j.earningsCalendar)) throw Error('Răspunsul Finnhub nu e un calendar de raportări.');
  const items = j.earningsCalendar.filter((e) => e && typeof e.symbol === 'string' && /^[A-Z][A-Z0-9]{0,4}(\.[A-Z])?$/.test(e.symbol) && e.date)
    .map((e) => (e.symbol.includes('.') ? { ...e, symbol: e.symbol.replace('.', '-') } : e))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { folosit: true, items, n: items.length };
}
/* 19.10.2026 — I-720: `calendar` (din calendarPentruProba) ajunge în motor ca EARN.calendar, exact cum îl primește pagina; fără el,
   motorul rămâne „earnings neverificat” pentru toate, cum cere protocolul probei de acum. */
export function motor(fetchSerie = fetchStock, { calendar } = {}) {
  const nodes = {}, store = new Map();
  const node = (id) => nodes[id] || (nodes[id] = { value: '', checked: false, innerHTML: '', textContent: '', disabled: false, hidden: false, dataset: {}, style: {}, options: [], classList: { toggle() {}, add() {}, remove() {} }, scrollIntoView() {} });
  const c = { console, Intl, Date, Math, JSON, Map, Set, URL, URLSearchParams, Promise, Error, Number, String, Array, Object, AbortController, setTimeout: () => 0, clearTimeout() {},
    location: { search: '?fundal=1', origin: 'https://robot.local' }, document: { getElementById: node, querySelectorAll: () => [], addEventListener() {}, hidden: false },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }, addEventListener() {}, matchMedia: () => ({ matches: false }) };
  c.window = c; c.parent = c; vm.createContext(c);
  for (const f of ['lib/exchange-calendar.js', 'lib/daily-series.js', 'lib/indicators.js', 'lib/me-early-bird.js', 'lib/early-long.js', 'lib/decision-verdict.js']) vm.runInContext(readFileSync(f, 'utf8'), c);
  if (c.EL) c.EL.enrichSectorsYahoo = undefined;   // protocol: harta de sectoare de bază, fără completarea de la Yahoo
  c.D = { fetchStock: (s, o) => fetchSerie(s, o) }; c.WL = { get: () => [] };
  c.GV = { status: () => ({ verdict: 'TRADE', reasons: ['robot: proba judecă clasamentul tehnic, nu limitele contului'] }) };
  if (calendar && calendar.folosit) c.EARN = { calendar: async () => ({ ok: true, items: calendar.items, motiv: '' }) };
  const src = readFileSync('candidate-engine/engine.js', 'utf8'), cut = src.lastIndexOf(MARCAJ);
  if (cut < 0) throw Error('Marcajul de pornire din candidate-engine/engine.js s-a schimbat — robotul nu mai poate rula motorul.');
  /* 19.10.2026 — I-716: și reversalScore, pentru amprenta umbrei (versiunea Top Long se calculează tot doar pe PROTOCOL.functii) */
  vm.runInContext(src.slice(0, cut) + 'bind();window.hooks={state,scan,earningsInfo,reversalScore,' + PROTOCOL.functii.join(',') + '};})();', c);
  node('universe').value = 'core';
  return c;
}
// 19.10.2026 (audit Long & Reversal): motorul citește acțiunile pe 1 an ⇒ peste un an primele perioade ar ieși din fereastră și verdictul
// s-ar calcula pe o fereastră alunecătoare, nu pe toate zilele din jurnal, cum cere protocolul. Înainte de evaluare se reiau TOATE
// simbolurile din jurnal (acțiuni + repere) pe un interval care acoperă prima zi a jurnalului plus orizontul cel mai lung.
// 27.10.2026 (revizia F, 🔴1): cele două funcții s-au mutat în lib/proba-contract.mjs (le folosesc și V1, și Trend); aici rămân reexportate.
export { intervalPentru, simboluriDeReluat };
// 19.10.2026 — I-716: barele zilnice OHLC ale fiecărei cereri (aceleași pe care le vede motorul), pentru stopurile umbrei
const bare = {};
async function fetchCuBare(sym, o) { const out = await fetchStock(sym, o); if (!o || o.interval === '1d') { const b = bareZilnice(out); if (b) bare[sym] = b; } return out; }
/** Pasul umbrei după ce ziua Top Long e scrisă; o eroare a umbrei nu atinge proba Top Long. Barele de după ziua scanării (o sesiune
    neînchisă, la o rulare de mână) se taie. */
function umbra(h, s, zi, sesiuni, cal = null, azi = null) {
  try {
    const taiate = Object.fromEntries(Object.entries(bare).map(([k, v]) => [k, v.filter((b) => b.d <= zi)]));
    const vechi = existsSync(UMBRA_JURNAL) ? JSON.parse(readFileSync(UMBRA_JURNAL, 'utf8')) : { zile: [] };
    const { jurnal, proba, rec } = pasUmbra(vechi, s, versiuneUmbra(h), zi, taiate, sesiuni, Date.now(), { cal, azi });
    writeFileSync(UMBRA_JURNAL, JSON.stringify(jurnal)); writeFileSync(UMBRA_PROBA, JSON.stringify(proba, null, 1));
    const e = proba.evaluare;
    console.log(`Umbra Reversal ${proba.versiune} · ${rec.r.length} candidați azi · ${proba.zile} zile · ${e.perioade}/${e.necesare} perioade · ${e.verdict}`);
  } catch (e) { console.log('umbra Reversal (' + UMBRA.id + '): ' + (e.message || e) + ' — ziua Top Long e salvată oricum'); }
}
/** 27.10.2026 (premarket-proba-2): conținutul fișierului premarket-proba.json (pur) — evaluarea, istoricul dependențelor, proba precedentă
 *  (jurnalul ei rămâne sub `pm-cb956aef5680`) și câmpurile de contract cu puterea Top Long. */
export function continutProba({ jurnal, V, rec, s, serii: sr, sesiuni, cal, azi, inghetate = null }) {
  const zileVersiune = jurnal.zile.filter((zi) => zi.v === V);
  // 27.10.2026 (revizia F, 🔴2): cu `inghetate`, pe perioadele înghețate; `deScris` = liniile noi (nu intră în fișierul probei)
  const ev = PROTOCOL.orizonturi.map((k) => evalueaza(jurnal, sr, { k, versiune: V, sesiuni, inghetate, la: inghetate ? rec.la : null })), deScris = ev.flatMap((o) => o.deScris || []);
  const c = contractProba(ev.map(({ deScris: _, ...o }) => o), { jurnal, versiune: V, cal, azi, putere: PROTOCOL.putere });
  return { protocol: PROTOCOL.id, scrisLa: PROTOCOL.scrisLa, versiune: V, calendar: PROTOCOL.calendar,
    precedent: { ...PROTOCOL.precedent, nota: 'zilele probei ' + PROTOCOL.precedent.id + ' (' + PROTOCOL.precedent.versiune + ') rămân în jurnal sub versiunea veche; nu intră în proba de acum' },
    inceput: zileVersiune[0]?.zi || null, zile: zileVersiune.length, ultimaZi: rec.zi, ultimaRulare: rec.la,
    dependinte: istoricDependinte(jurnal, V),
    azi: { verificate: s.verified, total: s.scanned, topLong: rec.r.filter((x) => x[1] === 'm').length, reversal: rec.r.filter((x) => x[5] === 'r').length, repere: s.benchmarks },
    orizonturi: c.orizonturi, putere: c.putere, primulVerdict: c.primulVerdict, judecata: c.judecata, sesiuni: c.sesiuni, deScris };
}
/** 28.10.2026 (revizia F2, 🟡5): noaptea după aducerea seriilor, ca funcție pură (ca la V1) — fișierul probei, ce e de înghețat și liniile de
 *  adăugat, din jurnal, ziua notată, starea scannerului, seriile (tăiate aici la ziua ei) și TEXTUL fișierului înghețat. */
export function noapte({ jurnal, V, rec, s, serii: sr, cal, azi, inghetatText = '' }) {
  const ev = taieLaZi(sr, rec.zi), sesiuni = (ev.SPY || []).map((x) => x.d), inghetate = citesteInghetat(inghetatText);
  const { deScris, ...j } = continutProba({ jurnal, V, rec, s, serii: ev, sesiuni, cal, azi, inghetate });
  return { j, deScris, linii: deScris.length ? liniiInghetat(deScris) : '', sesiuni };
}
async function main() {
  const cal = await calendarPentruProba(PROTOCOL);   /* 19.10.2026 — I-720: oprit pentru premarket-proba-1; 27.10: și pentru premarket-proba-2 */
  console.log('calendar: ' + (cal.folosit ? cal.n + ' raportări din Finnhub' : cal.motiv));
  const c = motor(fetchCuBare, { calendar: cal }), h = c.hooks, V = versiune(h);
  await h.scan();
  const s = h.state;
  if (!s.verified) throw Error('Nicio acțiune verificată azi (' + s.failures.length + ' eșecuri) — jurnalul rămâne neschimbat.');
  if (s.scanned !== PROTOCOL.univers.length) throw Error('Universul scanat (' + s.scanned + ') nu e lista înghețată de ' + PROTOCOL.univers.length + '.');
  const rec = { ...inregistrare(s, V), d: amprentaDependinte((f) => readFileSync(f, 'utf8'), h) };   // 19.10.2026: amprenta dependențelor pe zi
  mkdirSync(DIR, { recursive: true });
  const vechi = existsSync(JURNAL) ? JSON.parse(readFileSync(JURNAL, 'utf8')) : { zile: [] };
  // 27.10.2026 (revizia F, 🟡9): rularea de rezervă de dimineață (DOAR_LIPSA=1) notează ziua doar dacă lipsește; cea notată seara nu se rescrie
  // (volumele revizuite ar muta RVOL, deci scorul) — nici Top Long, nici umbra stopului (același pas)
  if (process.env.DOAR_LIPSA && (vechi.zile || []).some((z) => z && z.zi === rec.zi && z.v === V)) { console.log('Premarket ' + V + ' · ziua ' + rec.zi + ' e deja notată — nimic de făcut (rularea de rezervă).'); return; }
  const jurnal = { ...adauga(vechi, rec), protocol: PROTOCOL.id };
  // motorul cere acțiunile pe 1 an și reperele pe 6 luni; evaluarea are nevoie de tot intervalul jurnalului ⇒ toate se reiau (19.10.2026)
  // 27.10.2026 (revizia F): doar zilele versiunii de acum (zilele probei precedente nu se mai evaluează)
  const range = intervalPentru(jurnal.zile.find((z) => z.v === V)?.zi || rec.zi);
  for (const sym of simboluriDeReluat(jurnal, V)) { try { await fetchCuBare(sym, { range, interval: '1d' }); } catch (e) { console.log('serie ' + sym + ': ' + e.message); } }
  // 27.10.2026 (revizia F, 🟡10): seriile de evaluare se taie la ziua notată (o rulare de dimineață vede bursele UE deschise)
  const calNY = calendarSUA('.'), azi = new Date().toISOString().slice(0, 10);
  const { j, deScris, linii, sesiuni } = noapte({ jurnal, V, rec, s, serii, cal: calNY, azi, inghetatText: existsSync(INGHETAT) ? readFileSync(INGHETAT, 'utf8') : '' });
  writeFileSync(JURNAL, JSON.stringify(jurnal));
  writeFileSync(PROBA, JSON.stringify(j, null, 1));
  if (linii) { appendFileSync(INGHETAT, linii); console.log('  înghețat: ' + deScris.map((x) => x.tip + ' k=' + x.k + ' ' + (x.zi || x.data)).join(', ')); }
  console.log(`Premarket ${V} · ziua ${rec.zi} · ${s.verified}/${s.scanned} verificate · Top Long ${j.azi.topLong} · ${j.zile} zile în probă · primul verdict ~${j.primulVerdict?.realist || '—'}`);
  for (const o of j.orizonturi) console.log(`  k=${o.k}: ` + (o.necesare ? `${o.perioade}/${o.necesare} perioade · ${o.verdict}` : `${o.perioade} perioade · doar monitorizare`));
  umbra(h, s, rec.zi, sesiuni, calNY, azi);   /* 19.10.2026 — I-716; 27.10: + calendarul pentru câmpurile de contract */
}
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/premarket-jurnal.mjs')) main().catch((e) => { console.error(e.message); process.exit(1); });
