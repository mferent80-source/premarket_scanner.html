// 28.10.2026 (revizia F2, 🔵12): gărzile „doar crește” comparau fișierul de pe disc cu HEAD. În poarta de la push testele rulează DUPĂ commit,
// deci HEAD = discul și un commit care rescrie un fișier înghețat trecea. Acum baza e commitul de dinaintea push-ului (`github.event.before`,
// în DOAR_CRESTE_BAZA), iar local rămâne HEAD.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const baza = (v) => execFileSync(process.execPath, ['-e', "import('./tools/git-baza.mjs').then((m) => process.stdout.write(m.BAZA))"], { encoding: 'utf8', env: { ...process.env, DOAR_CRESTE_BAZA: v } });
test('baza gărzilor: commitul de dinaintea push-ului când e dat (40 de cifre hex), altfel HEAD (și la o ramură nouă, 000…0)', () => {
  const sha = 'a'.repeat(40);
  assert.equal(baza(sha), sha); assert.equal(baza(''), 'HEAD'); assert.equal(baza('0'.repeat(40)), 'HEAD', 'ramură nouă: nu există „înainte”');
  assert.equal(baza('HEAD~1; rm -rf /'), 'HEAD', 'doar un SHA, nimic altceva nu ajunge în comanda git');
});
test('poarta de teste dă baza, iar toate gărzile „doar crește” o folosesc (nu HEAD scris de mână)', () => {
  assert.match(readFileSync('.github/workflows/teste.yml', 'utf8'), /DOAR_CRESTE_BAZA: \$\{\{ github\.event\.before \}\}/);
  for (const f of readdirSync('tools').filter((n) => n.endsWith('.test.mjs') && n !== 'git-baza.test.mjs')) {
    const s = readFileSync('tools/' + f, 'utf8');
    assert.doesNotMatch(s, /\['show', 'HEAD:/, f + ': garda compară cu HEAD scris de mână');
    if (/\['show', BAZA \+ ':'/.test(s)) assert.match(s, /import \{ BAZA \} from '\.\/git-baza\.mjs';/, f);
  }
});

// 28.10.2026 (revizia F3, 🔵12): gărzile ieșeau tăcute când baza lipsea (force-push), iar poarta sărea commiturile doar cu generated/ sau docs/
test('🔵12 F3 în poartă, baza dată există în istoric — altfel roșu, nu „sar”', () => {
  const v = String(process.env.DOAR_CRESTE_BAZA || '').trim();
  if (!/^[0-9a-f]{40}$/.test(v) || /^0+$/.test(v)) return;   // local / ramură nouă: baza e HEAD
  let ok = true; try { execFileSync('git', ['cat-file', '-e', v + '^{commit}'], { stdio: 'ignore' }); } catch { ok = false; }
  assert.ok(ok, 'baza ' + v + ' lipsește din istoric — gărzile „doar crește” n-ar avea cu ce compara');
});
test('🔵12 F3 poarta rulează și la commiturile care ating doar fișierele generate (înghețate) sau documentele (tabelele de amprente); roboții își sar CI-ul', () => {
  const y = readFileSync('.github/workflows/teste.yml', 'utf8'), ign = (y.replace(/\r\n/g, '\n').match(/paths-ignore:\n((?:[ \t]+- [^\n]*\n)+)/) || [, ''])[1];
  assert.ok(/paths-ignore:/.test(y) ? ign.length > 0 : true, 'lista căilor ignorate se citește');
  assert.doesNotMatch(ign, /generated/, 'fișierele înghețate stau în generated/'); assert.doesNotMatch(ign, /docs\//, 'tabelele de amprente stau în docs/');
  for (const f of readdirSync('.github/workflows').filter((n) => n.endsWith('.yml'))) for (const l of readFileSync('.github/workflows/' + f, 'utf8').split(/\r?\n/)) if (/git commit -m/.test(l)) assert.match(l, /skip ci/, f + ': commitul robotului trebuie să sară CI-ul (altfel poarta ar rula la fiecare noapte)');
});
