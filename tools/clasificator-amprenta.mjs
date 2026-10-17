// I-661 (17.10.2026) — amprentele motorului Clasificator: a fișierului și a rezultatelor pe serii fixe.
//   node tools/clasificator-amprenta.mjs   afișează amprentele de scris în docs/clasificator-versiuni.md
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { motor, clasifica } from './clasificator-date.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
/** Fișierele care pot schimba voturile (citirea seriei, tăietura după salt, indicatorii, evaluarea, motorul). */
export const FISIERE = ['lib/daily-series.js', 'lib/holdings-bars.js', 'lib/holdings-neural.js', 'lib/holdings-neural-evaluation.js', 'lib/holdings-classifier.js'];
/** Amprenta textului lor (CRLF = LF), cu înlocuirile motorului al doilea (tools/motoare/<versiune>/<fișier>). Deterministă pe orice platformă. */
export const amprentaFisier = (radacina = '.', inlocuiri = {}) => sha(FISIERE.map((f) => f + '\n' + readFileSync(radacina + '/' + (inlocuiri[f] || f), 'utf8').replace(/\r\n/g, '\n')).join('\n'));
/** Rezultatele motorului pe trei serii fixe (sinusoida demo și două mersuri aleatoare cu generator fix), ambele ținte. */
export function amprentaRezultate(c = motor('.')) {
  const now = Date.parse('2026-10-07T22:00:00Z'), N = c.HoldingsNeural, serii = [N.demoBars(1, now)];
  for (const seed of [7, 11]) { // mulberry32 (generatorul casei)
    let a = seed; const rnd = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    let p = 100; const bars = []; for (let i = 0; i < 900; i++) { const o = p, r = (rnd() - 0.5) * 0.04; p = Math.max(1, p * (1 + r)); bars.push({ t: now - (900 - i) * 86400000, o, h: Math.max(o, p) * (1 + rnd() * 0.01), l: Math.min(o, p) * (1 - rnd() * 0.01), c: p, v: 1e6 + Math.floor(rnd() * 1e6) }); }
    serii.push(bars);
  }
  const r4 = (v) => Math.round(v * 1e4) / 1e4, out = [];
  for (const bars of serii) for (const spec of [undefined, { horizon: 20, atr: 2 }]) { try { const x = clasifica(c, bars, { now, spec }); out.push(x.state, ...['boost', 'forest', 'svm', 'vote'].flatMap((k) => x.algos[k].support.map(r4))); } catch (e) { out.push('eroare: ' + (e && e.message)); } } // și refuzul e un rezultat
  return sha(JSON.stringify(out));
}
/** Înlocuirile pentru o copie înghețată a motorului: fiecare fișier din FISIERE aflat în dosar îl înlocuiește pe cel curent. */
export function inlocuiriDin(radacina, dosar) { const o = {}; for (const f of FISIERE) { const x = dosar + '/' + f.split('/').pop(); if (existsSync(radacina + '/' + x)) o[f] = x; } return o; }
/** I-661: robotul notează în jurnal doar cu un motor înregistrat (versiunea + amprenta fișierelor în docs/clasificator-versiuni.md). */
export function inregistrat(radacina, versiune, amprenta) { try { return registru(readFileSync(radacina + '/docs/clasificator-versiuni.md', 'utf8')).some((r) => r.versiune === versiune && r.fisier === amprenta); } catch { return false; } }
/** Rândurile registrului: | versiune | data | amprenta fișierului | amprenta rezultatelor | motivul | */
export function registru(text) { return text.split('\n').map((l) => l.trim()).filter((l) => /^\| holdings-clf-/.test(l)).map((l) => { const c = l.split('|').slice(1, -1).map((x) => x.trim().replace(/`/g, '')); return { versiune: c[0], data: c[1], fisier: c[2], rezultate: c[3], motiv: c[4] }; }); }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { const c = motor('.'); console.log(`| ${c.HoldingsClassifier.VERSION} | ${new Date().toISOString().slice(0, 10)} | \`${amprentaFisier()}\` | \`${amprentaRezultate(c)}\` | <motivul> |`); }
