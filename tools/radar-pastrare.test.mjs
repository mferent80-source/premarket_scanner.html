// 18.10.2026 (el: „verifică alerts că se tot șterge cheia, la fel și parola Radarului — pune-le tu direct și să rămână”).
// Codul paginii nu le șterge singur; ce le poate pierde e stocarea site-ului (golită de browser / alt browser). De aceea:
// stocare permanentă cerută la pornire, linkul care le pune pe amândouă dintr-o atingere, și copia din cont (tools/cloud-sync-devices.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function pagina(href) {
  const store = new Map(), cereri = { persist: 0 }, istoric = [];
  const c = { console, JSON, Math, Date, Promise, setInterval: () => 1, clearInterval() {}, document: { hidden: true, addEventListener() {} }, location: { href },
    history: { replaceState: (a, b, u) => istoric.push(u) }, navigator: { storage: { persist: async () => { cereri.persist++; return true; } } },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
  c.window = c; vm.createContext(c); vm.runInContext(readFileSync('lib/radar-poza.js', 'utf8') + ';window.RadarPoza=RadarPoza;', c);
  return { RP: c.RadarPoza, store, cereri, istoric };
}
test('starting the Radar card asks the browser for persistent storage, so a low-space phone does not wipe the key', () => {
  const p = pagina('https://mferent80-source.github.io/premarket_scanner.html/alerts/'); p.RP.porneste({});
  assert.equal(p.cereri.persist, 1);
});
test('one tap on the setup link stores the read key AND the Radar password (dot included) and removes both from the address bar', () => {
  const p = pagina('https://mferent80-source.github.io/premarket_scanner.html/alerts/#cheie=CheieFalsaDeProba0123456789abcdef&parola=1908Proba%2E');
  p.RP.porneste({});
  assert.equal(p.store.get('radar_cheie'), 'CheieFalsaDeProba0123456789abcdef'); assert.equal(p.store.get('radar_parola'), '1908Proba.');
  assert.ok(p.istoric.length && !/cheie=|parola=/.test(p.istoric.at(-1)), 'nu rămân în bara de adrese');
});
test('the Decision app shell also asks for persistent storage before anything else loads', () => {
  const html = readFileSync('app/index.html', 'utf8'); assert.match(html, /navigator\.storage\.persist\(\)/);
});
