#!/usr/bin/env node
// I-638 (16.10.2026) — robotul de noapte al Clasificatorului Long / Hold / Short.
// Clasifică universul scannerului (US_CORE din candidate-engine/engine.js) cu ACELAȘI motor ca pagina și scrie
// candidate-engine/generated/clasificator.json; Planuri îl citește întâi și calculează pe telefon doar ce lipsește.
// Rezumatul pe simbol e făcut de aceeași funcție ca în pagină (TTDeskClassifier.compact), deci forma e identică.
//   node tools/clasificator-robot.mjs            scrie fișierul
//   node tools/clasificator-robot.mjs --uscat    doar afișează rezumatul
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { motor, adu, aduCache, universScanner, clasifica } from './clasificator-date.mjs';
import { univers } from './clasificator-univers.mjs';

export const FISIER = 'candidate-engine/generated/clasificator.json', VERSIUNE = 'clasificator-robot-v1';

export async function ruleaza({ c = motor('.', ['lib/desk-classifier.js']), simboluri = universScanner('.'), sursa, now = Date.now(), log = () => {}, comun = true } = {}) {
  const C = c.HoldingsClassifier, D = c.TTDeskClassifier, entries = {}, picate = [], serii = {};
  for (const [k, s] of simboluri.entries()) {
    try {
      const src = sursa ? await sursa(s) : c.DailySeries.read(await adu(s), s, now);
      entries[s] = D.compact(s, src, clasifica(c, src.bars, { now }), now); serii[s] = { bars: c.HoldingsBars.prepare(src.bars).bars };
      log(`${k + 1}/${simboluri.length} ${s} ${entries[s].state}`);
    } catch (e) { picate.push({ simbol: s, motiv: String(e && e.message || e).slice(0, 120) }); log(`${k + 1}/${simboluri.length} ${s} ✗ ${e && e.message}`); }
  }
  const zile = {}; for (const e of Object.values(entries)) zile[e.asOf] = (zile[e.asOf] || 0) + 1;
  const asOf = Object.entries(zile).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0]?.[0] || null;
  // I-641: modelul comun pe toate simbolurile clasificate, cu dovada pe zile; dacă pică, fișierul rămâne valabil fără el.
  let comunRez = null;
  if (comun) { try { comunRez = univers(c, serii, { now, log }); } catch (e) { comunRez = { eroare: String(e && e.message || e).slice(0, 160) }; log('model comun ✗ ' + comunRez.eroare); } }
  return { version: VERSIUNE, motor: C.VERSION, generat: new Date(now).toISOString(), asOf, simboluri: simboluri.length, entries, picate, univers: comunRez };
}

/** Garda de formă a fișierului publicat; întoarce lista problemelor (goală = bun). */
export function valideaza(j, motorVersiune) {
  const p = [], fin = Number.isFinite, prob = (x) => Array.isArray(x) && x.length === 3 && x.every((v) => fin(v) && v >= 0 && v <= 1) && Math.abs(x.reduce((a, b) => a + b, 0) - 1) < 1e-6;
  if (!j || j.version !== VERSIUNE) p.push('versiune'); if (motorVersiune && j?.motor !== motorVersiune) p.push('motor diferit de pagină');
  if (!j?.entries || typeof j.entries !== 'object') return p.concat('fără intrări');
  if (!Number.isInteger(j.simboluri) || Object.keys(j.entries).length + (j.picate || []).length !== j.simboluri) p.push('numărătoare');
  for (const [s, e] of Object.entries(j.entries)) {
    if (e.symbol !== s || !/^\d{4}-\d{2}-\d{2}$/.test(e.asOf) || typeof e.timezone !== 'string' || !fin(e.closeMinutes) || !fin(e.trainedAt)) { p.push(s + ': identitate'); continue; }
    for (const id of ['boost', 'forest', 'svm', 'vote']) { const a = e.algos?.[id]; if (!a || !prob(a.support) || ![0, 1, 2].includes(a.classIndex) || !fin(a.loss) || !fin(a.p)) p.push(s + ': ' + id); }
    if (!['drift', 'uncertain', 'no-edge', 'fragile', 'research'].includes(e.state)) p.push(s + ': stare');
    if (!['long', 'short', 'always'].every((k) => Number.isInteger(e.money?.[k]?.n))) p.push(s + ': bani');
  }
  const u = j.univers;
  if (u && !u.eroare) {
    if (!['research', 'fragile', 'no-edge'].includes(u.state) || typeof u.message !== 'string' || !u.algos?.vote || !u.curent) p.push('model comun: formă');
    else for (const [s, x] of Object.entries(u.curent)) if (!prob(x.vote?.support)) p.push('model comun: ' + s);
  }
  return p;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--cache'), dir = i > 0 ? process.argv[i + 1] : null; // doar pentru rulări locale repetate
  const c = motor('.', ['lib/desk-classifier.js']), j = await ruleaza({ c, log: console.log, ...(dir ? { sursa: async (s) => c.DailySeries.read(await aduCache(s, dir), s) } : {}) }), probleme = valideaza(j, c.HoldingsClassifier.VERSION), n = Object.keys(j.entries).length;
  console.log(`\n${n} din ${j.simboluri} clasificate · EOD ${j.asOf} · picate ${j.picate.length} · experimentale ${Object.values(j.entries).filter((e) => e.state === 'research').length}`);
  if (probleme.length) { console.error('Fișier respins: ' + probleme.slice(0, 10).join(' · ')); process.exit(1); }
  // Prea puține ⇒ rețea / Yahoo picat: nu înlocuiesc fișierul bun de ieri cu unul aproape gol.
  if (n < Math.ceil(j.simboluri * 0.5)) { console.error('Prea puține simboluri clasificate; fișierul vechi rămâne.'); process.exit(1); }
  if (!process.argv.includes('--uscat')) writeFileSync(FISIER, JSON.stringify(j) + '\n');
}
