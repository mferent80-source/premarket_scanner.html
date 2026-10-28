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
// 28.10.2026 (audit Radar, I-791): cheia de SCRIERE - cu ea pleacă lista de simboluri, cererile Salt și lista „cu stop”; Paznicul (v100.263)
// o cere doar când secretul CHEIE_SCRIERE e pus; până atunci, și fără ea aici, scrierile merg cu cheia de citire. Stă doar pe dispozitiv.
test('I-791: caseta primește cheia de scriere (aceeași formă ca cea de citire); textul fără formă e respins; gol = neschimbată; cheia de citire nu e atinsă', () => {
  const p = pagina('https://mferent80-source.github.io/premarket_scanner.html/alerts/'), K = 'CheieFalsaDeProba0123456789abcdef', S = 'CheieDeScriereProba0123456789abcd';
  p.store.set('radar_cheie', K);
  let r = p.RP.salveazaCaseta({ cheie: '', parola: '', scriere: S }); assert.equal(r.scriere, 'pusa'); assert.equal(p.store.get('radar_cheie_scriere'), S); assert.equal(p.store.get('radar_cheie'), K);
  assert.equal(p.RP.cheieScriere(), S, 'pusă ⇒ ea pleacă'); assert.equal(p.RP.areCheieScriere(), true);
  r = p.RP.salveazaCaseta({ cheie: '', parola: '', scriere: 'nu e cheie' }); assert.equal(r.scriere, 'respinsa'); assert.equal(p.store.get('radar_cheie_scriere'), S);
  r = p.RP.salveazaCaseta({ cheie: '', parola: 'Par.1', scriere: '' }); assert.equal(r.scriere, 'neschimbata'); assert.equal(r.parola, 'pusa');
  p.store.delete('radar_cheie_scriere'); assert.equal(p.RP.cheieScriere(), K, 'fără cheie de scriere pleacă cea de citire (tranziția)'); assert.equal(p.RP.areCheieScriere(), false);
});
test('I-791: linkul dintr-o atingere pune și cheia de scriere (#scriere=…), doar din #, și o scoate din adresă', () => {
  const p = pagina('https://mferent80-source.github.io/premarket_scanner.html/alerts/#cheie=CheieFalsaDeProba0123456789abcdef&scriere=CheieDeScriereProba0123456789abcd&parola=P');
  p.RP.porneste({});
  assert.equal(p.store.get('radar_cheie_scriere'), 'CheieDeScriereProba0123456789abcd'); assert.equal(p.store.get('radar_cheie'), 'CheieFalsaDeProba0123456789abcdef'); assert.equal(p.store.get('radar_parola'), 'P');
  assert.ok(p.istoric.length && !/cheie=|scriere=|parola=/.test(p.istoric.at(-1)), 'nu rămân în bara de adrese');
  const q = pagina('https://mferent80-source.github.io/premarket_scanner.html/alerts/?scriere=CheieDeScriereProba0123456789abcd'); q.RP.porneste({});
  assert.equal(q.store.has('radar_cheie_scriere'), false, 'din ?query nu se salvează'); assert.ok(!/scriere=/.test(q.istoric.at(-1)));
});
test('I-791: lista de simboluri și cererile Salt pleacă cu cheia de scriere când e pusă, altfel cu cea de citire; 401 „cheia de scriere” e spus pe nume', async () => {
  const p = pagina('https://mferent80-source.github.io/premarket_scanner.html/alerts/'), K = 'CheieFalsaDeProba0123456789abcdef', S = 'CheieDeScriereProba0123456789abcd', cereri = [];
  p.store.set('radar_cheie', K); p.ctx.fetch = async (u, o) => { cereri.push({ u, auth: o.headers.authorization }); return { ok: true, status: 200, json: async () => ({ id: 'x1' }) }; };
  await p.RP.trimiteSimboluri([{ s: 'INTC', nota: '' }]); assert.equal(cereri.at(-1).auth, 'Bearer ' + K, 'fără cheie de scriere: cea de citire');
  p.store.set('radar_cheie_scriere', S);
  await p.RP.trimiteSimboluri([{ s: 'INTC', nota: '' }]); assert.equal(cereri.at(-1).auth, 'Bearer ' + S); assert.match(cereri.at(-1).u, /\/simboluri$/);
  await p.RP.saltCerere({ op: 'scoate', isin: 'US64110L1061' }); assert.equal(cereri.at(-1).auth, 'Bearer ' + S); assert.match(cereri.at(-1).u, /\/salt-cereri$/);
  p.ctx.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: 'cheia de scriere lipseste sau nu e buna' }) });
  const r = await p.RP.saltCerere({ op: 'scoate', isin: 'US64110L1061' }); assert.equal(r.ok, false); assert.match(r.eroare, /cheia de SCRIERE/);
});
test('I-791: ecranul - caseta are câmpul cheii de scriere (parolă, fără autocompletare), „Schimbă” îl deschide pe el; rândul din cap apare doar când e pusă; pagina trimite starea', () => {
  const RE = ecran(), asc = {}, focus = [], campuri = { radCaseta: { hidden: true }, radCheie: { focus() { focus.push('cheie'); } }, radParola: { focus() { focus.push('parola'); } }, radScriere: { focus() { focus.push('scriere'); } } };
  const el = { innerHTML: '', dataset: {}, addEventListener(t, f) { asc[t] = f; }, dispatchEvent() {}, querySelector(s) { const m = /^#(\w+)$/.exec(s); return m ? campuri[m[1]] || null : null; }, querySelectorAll() { return []; } };
  const o = (x) => Object.assign({ simboluri: [], preturiLive: {}, acum: Date.now(), cheie: true, parolaRadar: 'x', prospetime: { stare: 'viu', text: '' } }, x);
  RE.randeaza(el, { la: Date.now(), t212: [], boti: [], simboluri: [] }, o({ cheieScriere: false }));
  assert.match(el.innerHTML, /<input id="radScriere" type="password" placeholder="✍️ cheia de scriere \(opțional · CHEIE_SCRIERE din Paznic\)"[^>]*autocomplete="new-password"/);
  assert.doesNotMatch(el.innerHTML, /cheia de scriere: pusă/, 'nepusă: nimic în cap');
  RE.randeaza(el, { la: Date.now(), t212: [], boti: [], simboluri: [] }, o({ cheieScriere: true }));
  assert.match(el.innerHTML, /✍️ cheia de scriere: pusă <button class="btnGhost" type="button" data-fac="scriere">Schimbă<\/button>/);
  const buton = (fac) => { const b = { getAttribute: (a) => (a === 'data-fac' ? fac : null), closest: (s) => (s === '[data-fac]' ? b : null) }; return b; };
  asc.click({ target: buton('scriere') }); assert.equal(campuri.radCaseta.hidden, false); assert.deepEqual(focus, ['scriere']);
  const html = readFileSync('alerts/index.html', 'utf8');
  assert.match(html, /cheieScriere: RadarPoza\.areCheieScriere \? RadarPoza\.areCheieScriere\(\) : false/);
  assert.match(html, /if \(r\.scriere === 'pusa'\) \{ _radSimUltima = ''; radTrimiteSimboluri\(\);/, 'pusă ⇒ lista pleacă iar, cu ea');
  assert.match(readFileSync('lib/radar-ecran.js', 'utf8'), /scriere: sc \? sc\.value\.trim\(\) : ''/);
});
test('I-791: Decision App trimite lista „cu stop” cu cheia de scriere când e pusă; 401 „cheia de scriere” devine starea cheie-scriere, cu mesajul ei pe Astăzi', async () => {
  const S = new Function('window', readFileSync('lib/stop-setter.js', 'utf8') + '; return window.StopSetter;')({ localStorage: null, fetch: null });
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  const s = mem(), trimise = []; s.setItem('radar_cheie', 'c'.repeat(32)); s.setItem('tt_holdings_theses_v1', JSON.stringify({ INTC_US_EQ: { stop: 100 } }));
  const f = async (u, o) => { trimise.push(o.headers.authorization); return { ok: true, status: 200 }; };
  assert.equal((await S.trimiteLista({ storage: s, fetchImpl: f, fortat: true })).stare, 'trimis'); assert.equal(trimise.at(-1), 'Bearer ' + 'c'.repeat(32));
  s.setItem('radar_cheie_scriere', 's'.repeat(32));
  assert.equal((await S.trimiteLista({ storage: s, fetchImpl: f, fortat: true })).stare, 'trimis'); assert.equal(trimise.at(-1), 'Bearer ' + 's'.repeat(32), 'cu cheia de scriere');
  const r = await S.trimiteLista({ storage: s, fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: 'cheia de scriere lipseste sau nu e buna' }) }), fortat: true });
  assert.equal(r.stare, 'cheie-scriere');
  assert.equal((await S.trimiteLista({ storage: s, fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: 'cheia de citire lipseste sau nu e buna' }) }), fortat: true })).stare, 'cheie-gresita');
  assert.match(readFileSync('today/stop.js', 'utf8'), /'cheie-scriere': 'Alarma pe Discord: Paznicul cere acum cheia de SCRIERE/);
});
test('audit 28.10 (P3): moneda de rezervă a unui simbol pe care poza nu-l are: .L „£” (Londra), .DE / .PA „€”, .SW și US „$” - aceeași regulă ca în colector', () => {
  const RE = ecran(), l = RE.uneste([{ s: 'shel.l' }, { s: 'RHM.DE' }, { s: 'MC.PA' }, { s: 'NESN.SW' }, { s: 'INTC' }], null);
  assert.deepEqual(l.map((x) => x.moneda), ['£', '€', '€', '$', '$']);
  const el = { innerHTML: '', addEventListener() {}, dataset: {} };
  RE.randeaza(el, { la: Date.now(), t212: [], boti: [], simboluri: [] }, { fila: 'urm', simboluri: [{ s: 'SHEL.L', nota: '' }, { s: 'RHM.DE', nota: '' }], preturiLive: {}, acum: Date.now(), cheie: true, prospetime: { stare: 'viu', text: '' } });
  assert.match(el.innerHTML, /<b>SHEL\.L<\/b> <span class="mic">Londra<\/span>/); assert.match(el.innerHTML, /<b>RHM\.DE<\/b> <span class="mic">bursă europeană<\/span>/);
});
