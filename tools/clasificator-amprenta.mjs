// I-661 (17.10.2026) — amprentele motorului Clasificator: a fișierului și a rezultatelor pe serii fixe.
//   node tools/clasificator-amprenta.mjs   afișează amprentele de scris în docs/clasificator-versiuni.md
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { motor, clasifica } from './clasificator-date.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
export const amprentaFisier = (radacina = '.') => sha(readFileSync(radacina + '/lib/holdings-classifier.js', 'utf8').replace(/\r\n/g, '\n'));
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
/** Rândurile registrului: | versiune | data | amprenta fișierului | amprenta rezultatelor | motivul | */
export function registru(text) { return text.split('\n').map((l) => l.trim()).filter((l) => /^\| holdings-clf-/.test(l)).map((l) => { const c = l.split('|').slice(1, -1).map((x) => x.trim().replace(/`/g, '')); return { versiune: c[0], data: c[1], fisier: c[2], rezultate: c[3], motiv: c[4] }; }); }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { const c = motor('.'); console.log(`| ${c.HoldingsClassifier.VERSION} | ${new Date().toISOString().slice(0, 10)} | \`${amprentaFisier()}\` | \`${amprentaRezultate(c)}\` | <motivul> |`); }
