// 27.10.2026 — gardă pentru capcana „comentariu `//` la MIJLOCUL rândului înghite codul de după el” (a 7-a oară: candidate-engine/engine.js:675,
// panoul „DE CE ESTE ÎN TOP” nu se mai scria). O gardă care citește cod vede ce SPUNE codul, dar aici exact asta trebuie: un `//` urmat, pe același
// rând, de ceva care arată a cod viu (atribuire pe element, scriere în localStorage, ascultător, apel pe `$('…')`) e aproape sigur o greșeală.
// Șirurile și șabloanele sunt scoase înainte (ca `https://` din URL-uri să nu fie luat drept comentariu); regex-urile cu `//` nu apar în cod.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DOSARE = ['lib', 'candidate-engine', 'desk', 'today', 'holdings', 'journal', 'broker', 'app', 'europe-stocks', 'shadow-book', 'scanner-verdicts', 'health', 'alerts'];
const COD_VIU = /(\$\(['"][\w-]+['"]\)(\s*&&\s*\$\(['"][\w-]+['"]\))?\.\w+\s*=[^=]|\.(textContent|innerHTML|value|hidden|disabled|className)\s*=\s*[^=]|\b(localStorage|sessionStorage)\.(setItem|removeItem)\(|\.addEventListener\(\s*['"]|\bwindow\.dispatchEvent\()/;

function fisiere(d, out = []) {
  for (const f of readdirSync(d)) { const p = join(d, f); if (f === 'node_modules' || f.startsWith('.')) continue; if (statSync(p).isDirectory()) fisiere(p, out); else if (/\.(js|mjs|html)$/.test(f) && !/\.test\.mjs$/.test(f) && !/\.min\.js$/.test(f)) out.push(p); }
  return out;
}
const faraSiruri = (l) => l.replace(/`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, '""');
/** Rândurile în care, după un `//` (în afara șirurilor), urmează cod viu. */
export function suspecte(text) {
  const out = [];
  text.split(/\r?\n/).forEach((linie, i) => {
    if (/^\s*\/\//.test(linie)) return; // comentariu pe rând întreg: nu înghite nimic
    const curat = faraSiruri(linie), k = curat.indexOf('//');
    if (k < 0 || curat.charAt(k - 1) === ':' || curat.charAt(k - 1) === '\\' || curat.charAt(k - 1) === '*') return; // `*//*` = două comentarii bloc lipite, nu `//`
    const dupa = curat.slice(k + 2);
    if (COD_VIU.test(dupa)) out.push({ rand: i + 1, text: linie.trim().slice(0, 160) });
  });
  return out;
}

test('niciun `//` la mijlocul rândului nu înghite cod viu (atribuiri pe elemente, localStorage, ascultători)', () => {
  const gasite = [];
  for (const f of DOSARE.flatMap((d) => fisiere(d))) for (const s of suspecte(readFileSync(f, 'utf8'))) gasite.push(f.replace(/\\/g, '/') + ':' + s.rand + '  ' + s.text);
  assert.deepEqual(gasite, [], 'Comentariu `//` urmat de cod pe același rând — codul de după e MORT. Mută comentariul la capăt sau folosește /* */:\n' + gasite.join('\n'));
});

test('garda prinde exemplul real și tace la URL-uri și la comentariile de la capătul rândului', () => {
  assert.equal(suspecte("$('dFresh').textContent = 'EOD';   // 19.10: data sesiunii $('dReason').textContent = x.reason;").length, 1);
  assert.equal(suspecte("const u = 'https://a.b/c'; $('x').textContent = u; // la capăt").length, 0);
  assert.equal(suspecte("// $('x').textContent = 'tot rândul e comentariu';").length, 0);
  assert.equal(suspecte("el.innerHTML = `<a href=\"https://x.y//z\">${esc(t)}</a>`; // ok").length, 0);
});
