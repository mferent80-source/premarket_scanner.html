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
