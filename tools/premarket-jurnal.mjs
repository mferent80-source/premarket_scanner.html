// 18.10.2026 — Robotul probei Premarket Scanner, Top Long (GitHub Actions, zilnic după închiderea SUA, după robotul V1).
// Protocolul: docs/premarket-proba-protocol.md. Rulează EXACT codul paginii (candidate-engine/engine.js) pe universul Core înghețat,
// cu Governor = TRADE, fără raportări, cu harta de sectoare de bază; notează ziua în scanner-verdicts/generated/premarket-jurnal.json
// și scrie evaluarea în scanner-verdicts/generated/premarket-proba.json. Fără chei.
import vm from 'node:vm';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fetchStock, serii } from './v1-jurnal.mjs';
import { adauga } from '../lib/v1-proba.mjs';
import { PROTOCOL, versiune, inregistrare, evalueaza } from '../lib/premarket-proba.mjs';

const DIR = 'scanner-verdicts/generated', JURNAL = DIR + '/premarket-jurnal.json', PROBA = DIR + '/premarket-proba.json';
const MARCAJ = '  validateDeps(); bind();';

/** Motorul paginii într-un context izolat: aceleași biblioteci ca pagina, un DOM minim, `?fundal=1` (o scanare, fără ceas). */
export function motor(fetchSerie = fetchStock) {
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
  const src = readFileSync('candidate-engine/engine.js', 'utf8'), cut = src.lastIndexOf(MARCAJ);
  if (cut < 0) throw Error('Marcajul de pornire din candidate-engine/engine.js s-a schimbat — robotul nu mai poate rula motorul.');
  vm.runInContext(src.slice(0, cut) + 'bind();window.hooks={state,scan,' + PROTOCOL.functii.join(',') + '};})();', c);
  node('universe').value = 'core';
  return c;
}
async function main() {
  const c = motor(), h = c.hooks, V = versiune(h);
  await h.scan();
  const s = h.state;
  if (!s.verified) throw Error('Nicio acțiune verificată azi (' + s.failures.length + ' eșecuri) — jurnalul rămâne neschimbat.');
  if (s.scanned !== PROTOCOL.univers.length) throw Error('Universul scanat (' + s.scanned + ') nu e lista înghețată de ' + PROTOCOL.univers.length + '.');
  const rec = inregistrare(s, V);
  mkdirSync(DIR, { recursive: true });
  const vechi = existsSync(JURNAL) ? JSON.parse(readFileSync(JURNAL, 'utf8')) : { zile: [] };
  const jurnal = { ...adauga(vechi, rec), protocol: PROTOCOL.id };
  // motorul cere reperele pe 6 luni; evaluarea are nevoie de tot intervalul jurnalului ⇒ reperele (și SPY, calendarul) se reiau pe 2 ani
  const repere = [...new Set(jurnal.zile.flatMap((zi) => zi.r.map((x) => x[4]).filter(Boolean)).concat('SPY'))];
  for (const sym of repere) { try { await fetchStock(sym, { range: '2y', interval: '1d' }); } catch (e) { console.log('reper ' + sym + ': ' + e.message); } }
  const sesiuni = (serii.SPY || []).map((x) => x.d);
  const orizonturi = PROTOCOL.orizonturi.map((k) => evalueaza(jurnal, serii, { k, versiune: V, sesiuni }));
  const zileVersiune = jurnal.zile.filter((zi) => zi.v === V);
  writeFileSync(JURNAL, JSON.stringify(jurnal));
  writeFileSync(PROBA, JSON.stringify({ protocol: PROTOCOL.id, scrisLa: PROTOCOL.scrisLa, versiune: V, inceput: zileVersiune[0]?.zi || null, zile: zileVersiune.length, ultimaZi: rec.zi, ultimaRulare: rec.la,
    azi: { verificate: s.verified, total: s.scanned, topLong: rec.r.filter((x) => x[1] === 'm').length, reversal: rec.r.filter((x) => x[5] === 'r').length, repere: s.benchmarks },
    orizonturi }, null, 1));
  console.log(`Premarket ${V} · ziua ${rec.zi} · ${s.verified}/${s.scanned} verificate · Top Long ${rec.r.filter((x) => x[1] === 'm').length} · ${zileVersiune.length} zile în probă`);
  for (const o of orizonturi) console.log(`  k=${o.k}: ${o.perioade}/${o.necesare} perioade · ${o.verdict}`);
}
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/premarket-jurnal.mjs')) main().catch((e) => { console.error(e.message); process.exit(1); });
