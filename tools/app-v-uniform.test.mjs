// 27.10.2026 (lotul A, auditul A [19]): în paginile carcasei (app/index.html și app/*/index.html) același fișier se cere cu ACELAȘI `?v=`.
// sw-app.js și app/sw.js țin cache-ul exact pe `?v=` ⇒ două valori = două copii ale aceluiași fișier, iar la o schimbare de API o pagină rulează
// copia veche lângă carcasa nouă. Testul nu fixează valoarea (o urcă coordonatorul la publicare), doar cere să fie una singură.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { posix } from 'node:path';

export function cereri(paginiHtml) {
  const map = new Map();
  for (const [pagina, html] of paginiHtml) {
    for (const m of html.matchAll(/<(?:script|link)\b[^>]*\s(?:src|href)="([^"]+\.(?:js|mjs|css))(\?[^"]*)?"/g)) {
      if (/^[a-z]+:\/\//i.test(m[1])) continue;
      const fisier = posix.normalize(posix.join(posix.dirname(pagina), m[1])), q = (m[2] || '').match(/[?&]v=([^&]*)/);
      if (!map.has(fisier)) map.set(fisier, new Map());
      const v = q ? q[1] : '(fără ?v=)';
      if (!map.get(fisier).has(v)) map.get(fisier).set(v, []);
      map.get(fisier).get(v).push(pagina);
    }
  }
  return map;
}
const pagini = ['app/index.html', ...readdirSync('app').filter((d) => existsSync('app/' + d + '/index.html')).map((d) => 'app/' + d + '/index.html')];

test('garda vede diferențele (pe exemple construite)', () => {
  const m = cereri([['app/index.html', '<script src="../lib/a.js?v=1"></script><link rel="stylesheet" href="layout.css?v=2">'], ['app/x/index.html', '<script src="../../lib/a.js?v=3"></script><script src="../../lib/b.js"></script>']]);
  assert.deepEqual([...m.get('lib/a.js').keys()], ['1', '3']);
  assert.deepEqual([...m.get('lib/b.js').keys()], ['(fără ?v=)']);
  assert.deepEqual([...m.get('app/layout.css').keys()], ['2']);
});

test('[19] paginile carcasei cer fiecare fișier cu un singur `?v=`', () => {
  const m = cereri(pagini.map((p) => [p, readFileSync(p, 'utf8')]));
  assert.ok(m.size > 20, 'garda a citit cererile paginilor (' + m.size + ')');
  const diferite = [...m].filter(([, v]) => v.size > 1).map(([f, v]) => f + ': ' + [...v].map(([q, ps]) => q + ' în ' + ps.join(', ')).join(' | '));
  assert.deepEqual(diferite, []);
});
