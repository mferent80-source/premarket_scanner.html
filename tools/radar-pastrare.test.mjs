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
  return { RP: c.RadarPoza, store, cereri, istoric, ctx: c };
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
test('a key the worker accepts is marked verified (only verified keys go to the account); a rejected key loses the mark', async () => {
  const p = pagina('https://mferent80-source.github.io/premarket_scanner.html/alerts/'), K = 'CheieFalsaDeProba0123456789abcdef';
  p.store.set('radar_cheie', K); let status = 200;
  const ctx = p.ctx; ctx.fetch = async () => ({ status, ok: status === 200, json: async () => ({ la: Date.now() }), headers: { get: () => null } });
  await p.RP.citeste({ fortat: true, acum: Date.parse('2026-10-19T10:00:00Z') }); assert.equal(p.store.get('radar_cheie_ok'), K.slice(0, 8));
  status = 401; await p.RP.citeste({ fortat: true, acum: Date.parse('2026-10-19T10:10:00Z') }); assert.equal(p.store.has('radar_cheie_ok'), false);
});
test('the Decision app shell also asks for persistent storage before anything else loads', () => {
  const html = readFileSync('app/index.html', 'utf8'); assert.match(html, /navigator\.storage\.persist\(\)/);
});
// 18.10.2026 (el: „în aplicația Alerte, când pun parola Radarului se șterge și cheia”). Cauza: „Pune parola” deschidea caseta cu
// cursorul în câmpul CHEII; parola scrisă acolo intra ca cheie peste cea bună, iar parola rămânea nepusă.
const ecran = () => { const c = { console, JSON, Math, Date, Intl }; c.window = c; vm.createContext(c); vm.runInContext(readFileSync('lib/radar-ecran.js', 'utf8') + ';window.RadarEcran=RadarEcran;', c); return c.RadarEcran; };
test('“Put the password” opens the box with the cursor in the PASSWORD field; “Put the key” keeps it in the key field', () => {
  const RE = ecran(), asc = {}, campuri = { radCaseta: { hidden: true }, radCheie: { focus() { focus.push('cheie'); } }, radParola: { focus() { focus.push('parola'); } } }, focus = [];
  const el = { innerHTML: '', dataset: {}, addEventListener(t, f) { asc[t] = f; }, dispatchEvent() {}, querySelector(s) { const m = /^#(\w+)$/.exec(s); return m ? campuri[m[1]] || null : null; }, querySelectorAll() { return []; } };
  RE.randeaza(el, { la: Date.now(), t212: [], boti: [], simboluri: [] }, { simboluri: [], preturiLive: {}, acum: Date.now(), cheie: true, parolaRadar: false, prospetime: { stare: 'viu', text: '' } });
  assert.match(el.innerHTML, /data-fac="parola"[^>]*>Pune parola/, 'butonul parolei are rolul lui');
  const buton = (fac) => { const b = { getAttribute: (a) => (a === 'data-fac' ? fac : null), closest: (s) => (s === '[data-fac]' ? b : null) }; return b; };
  asc.click({ target: buton('parola') }); assert.equal(campuri.radCaseta.hidden, false); assert.deepEqual(focus, ['parola']);
  campuri.radCaseta.hidden = true; asc.click({ target: buton('cheie') }); assert.deepEqual(focus, ['parola', 'cheie']);
  // caseta deja deschisă (cheia „nu e bună”): „Pune parola” n-o închide, mută cursorul; a doua atingere pe același buton o închide
  asc.click({ target: buton('parola') }); assert.equal(campuri.radCaseta.hidden, false); assert.deepEqual(focus, ['parola', 'cheie', 'parola']);
  asc.click({ target: buton('parola') }); assert.equal(campuri.radCaseta.hidden, true);
});
test('saving the box never puts a password into the key slot: text that is not a read key goes to the password, the good key stays', () => {
  const p = pagina('https://mferent80-source.github.io/premarket_scanner.html/alerts/'), K = 'CheieFalsaDeProba0123456789abcdef';
  p.store.set('radar_cheie', K);
  let r = p.RP.salveazaCaseta({ cheie: '1908Jager.', parola: '' });
  assert.equal(p.store.get('radar_cheie'), K, 'cheia bună rămâne'); assert.equal(p.store.get('radar_parola'), '1908Jager.', 'textul scris greșit în câmpul cheii devine parola'); assert.equal(r.cheie, 'neschimbata'); assert.equal(r.parola, 'pusa'); assert.equal(r.mutata, true);
  r = p.RP.salveazaCaseta({ cheie: '', parola: 'Alta.Parola' }); assert.equal(p.store.get('radar_cheie'), K); assert.equal(p.store.get('radar_parola'), 'Alta.Parola'); assert.equal(r.cheie, 'neschimbata');
  r = p.RP.salveazaCaseta({ cheie: 'NUe-o-cheie bună', parola: 'P' }); assert.equal(p.store.get('radar_cheie'), K, 'un text care nu e cheie nu înlocuiește cheia'); assert.equal(r.cheie, 'respinsa');
  r = p.RP.salveazaCaseta({ cheie: 'CheieNouaDeProba9876543210zyxwvu', parola: '' }); assert.equal(p.store.get('radar_cheie'), 'CheieNouaDeProba9876543210zyxwvu'); assert.equal(r.cheie, 'pusa');
  r = p.RP.salveazaCaseta({ cheie: '', parola: '' }); assert.equal(p.store.get('radar_cheie'), 'CheieNouaDeProba9876543210zyxwvu', 'Salvează cu câmpurile goale nu mai șterge nimic'); assert.equal(r.cheie, 'neschimbata');
});
test('the Alerts page saves the box through RadarPoza.salveazaCaseta (no direct puneCheie on the raw field)', () => {
  const h = readFileSync('alerts/index.html', 'utf8'), i = h.indexOf("addEventListener('radar:cheie'"), bloc = h.slice(i, i + 900);
  assert.ok(i > 0); assert.match(bloc, /RadarPoza\.salveazaCaseta\(/); assert.doesNotMatch(bloc, /RadarPoza\.puneCheie\(d\.cheie\)/);
});
