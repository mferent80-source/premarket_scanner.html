#!/usr/bin/env node
// 28.10.2026 (revizia F2, 🟡1): `git add a b 2>/dev/null || true` nu adaugă NIMIC dacă lipsește unul din fișiere — git iese cu 128 înainte
// să adauge ceva, iar `|| true` ascunde eroarea. Fluxurile probelor își salvau așa fișierele înghețate ⇒ înghețul se pierdea pe tăcute.
// Aici fiecare fișier se adaugă SEPARAT, doar dacă există; cel lipsă se spune în jurnal. O eroare reală a lui git oprește pasul (închis la eroare).
// Folosire (din rădăcina depozitului): node tools/git-add-existente.mjs <cale> [<cale> ...]
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const cai = process.argv.slice(2);
if (!cai.length) { console.error('git-add-existente: nicio cale dată'); process.exit(2); }
const adaugate = [];
for (const cale of cai) {
  if (!existsSync(cale)) { console.log('lipsește (încă), nu se adaugă: ' + cale); continue; }
  execFileSync('git', ['add', '--', cale], { stdio: 'inherit' });
  adaugate.push(cale);
}
console.log('adăugate: ' + (adaugate.length ? adaugate.join(', ') : 'niciunul'));
