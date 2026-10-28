// 28.10.2026 (I-776) — scripturi încărcate la cerere. Eticheta `<script type="text/x-la-cerere" data-grup="…" src="…">` e un bloc de date pentru
// browser (nu se descarcă, nu se execută); `ScripturiLaCerere.incarca(grup)` descarcă TOATE fișierele grupului în paralel și abia apoi le execută,
// în ordinea din pagină, ca scripturi inline cu `//# sourceURL=`; tot sau nimic; o singură dată pe grup. Testat pe lib/scripturi-la-cerere.js REAL,
// cu document și fetch simulate.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function pagina(etichete, { esueaza = null, http = null, inversat = false } = {}) {
  const executate = [], cereri = [];
  const document = {
    baseURI: 'https://mferent80-source.github.io/premarket_scanner.html/holdings/',
    head: { appendChild(s) { executate.push(s); } },
    createElement(tag) { assert.equal(tag, 'script'); return { text: null, atribute: {}, setAttribute(k, v) { this.atribute[k] = v; } }; },
    querySelectorAll(sel) { const m = /^script\[type="([^"]+)"\]\[data-grup="([^"]+)"\]$/.exec(sel); assert.ok(m, 'selectorul: ' + sel); return etichete.filter((t) => t.type === m[1] && t.grup === m[2]).map((t) => ({ getAttribute: (k) => (k === 'src' ? t.src : null) })); },
  };
  const fetch = (src) => { cereri.push(src); const i = cereri.length; return new Promise((res, rej) => setTimeout(() => {
    if (esueaza === src) rej(new TypeError('Failed to fetch'));
    else if (http === src) res({ ok: false, status: 404, text: async () => 'nu' });
    else res({ ok: true, status: 200, text: async () => 'CORP(' + src + ')' });
  }, inversat ? 30 - i * 5 : i * 2)); };
  const ctx = { document, fetch, setTimeout, Promise, Error, TypeError, Array, URL, console, performance };
  vm.createContext(ctx); vm.runInContext(readFileSync('lib/scripturi-la-cerere.js', 'utf8'), ctx, { filename: 'lib/scripturi-la-cerere.js' });
  return { L: ctx.ScripturiLaCerere, executate, cereri };
}
const ET = [
  { type: 'text/x-la-cerere', grup: 'modele', src: '../lib/holdings-neural.js?v=26.10.19.1845' },
  { type: 'text/x-la-cerere', grup: 'altul', src: 'x.js' },
  { type: 'text/x-la-cerere', grup: 'modele', src: 'hmm.js?v=26.10.19.1845' },
  { type: 'text/x-la-cerere', grup: 'modele', src: 'neural.js?v=26.10.19.1845' },
];

test('incarca(grup): descarcă doar fișierele grupului, în paralel, cu `?v=` păstrat; le execută în ordinea din pagină chiar dacă sosesc invers, inline, cu sourceURL absolut și numele fișierului pe etichetă', async () => {
  const { L, executate, cereri } = pagina(ET, { inversat: true });
  assert.equal(L.TIP, 'text/x-la-cerere');
  const p = L.incarca('modele');
  assert.equal(cereri.length, 3, 'toate cererile pleacă deodată');
  const surse = await p;
  assert.deepEqual(surse, ['../lib/holdings-neural.js?v=26.10.19.1845', 'hmm.js?v=26.10.19.1845', 'neural.js?v=26.10.19.1845']);
  assert.deepEqual(executate.map((s) => s.atribute['data-la-cerere']), surse, 'ordinea din pagină, nu a sosirii');
  assert.equal(executate[1].text, 'CORP(hmm.js?v=26.10.19.1845)\n//# sourceURL=https://mferent80-source.github.io/premarket_scanner.html/holdings/hmm.js?v=26.10.19.1845');
  assert.match(executate[0].text, /sourceURL=https:\/\/mferent80-source\.github\.io\/premarket_scanner\.html\/lib\/holdings-neural\.js\?v=/, '`../lib/` se rezolvă față de pagină');
});

test('o singură dată pe grup: a doua cerere întoarce aceeași promisiune, fără alte cereri; grupul gol se rezolvă cu []', async () => {
  const { L, cereri, executate } = pagina(ET);
  const a = L.incarca('modele'), b = L.incarca('modele');
  assert.equal(a, b); await a; assert.equal(cereri.length, 3); assert.equal(executate.length, 3);
  assert.equal(L.pornit('modele'), true); assert.equal(L.pornit('altul'), false);
  assert.deepEqual(await L.incarca('inexistent'), []);
});

test('tot sau nimic: un fișier care nu se descarcă (offline) sau răspunde 404 ⇒ NIMIC executat, respingere cu numele fișierului, în română; grupul se poate reîncerca', async () => {
  const { L, executate, cereri } = pagina(ET, { esueaza: 'hmm.js?v=26.10.19.1845' });
  await assert.rejects(L.incarca('modele'), /^Error: Scriptul nu s-a încărcat: hmm\.js\?v=26\.10\.19\.1845 \(Failed to fetch\)$/);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(executate.length, 0, 'fișierele sosite nu se execută fără cel lipsă (altfel verdictul ar rămâne fără HMM)');
  assert.equal(L.pornit('modele'), false, 'după eșec grupul nu rămâne „pornit”');
  const n = cereri.length; L.incarca('modele').catch(() => {}); assert.ok(cereri.length > n, 'reîncercarea descarcă din nou');
  const h = pagina(ET, { http: 'neural.js?v=26.10.19.1845' });
  await assert.rejects(h.L.incarca('modele'), /Scriptul nu s-a încărcat: neural\.js\?v=26\.10\.19\.1845 \(HTTP 404\)/); assert.equal(h.executate.length, 0);
});
