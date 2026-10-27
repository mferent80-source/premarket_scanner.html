// 18.10.2026 — butonul „Pune ordinul în Trading 212” din fereastra „Pune stopul acum”: rezumatul confirmării, mesajele și trimiterea.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function setup({ vault = { key: 'k', secret: 's', environment: 'live' }, ordine, config = { enabled: true, endpoint: 'https://premarket-scanner-html.mferent80.workers.dev', directCredentials: true }, relay } = {}) {
  const calls = [];
  const c = { Intl, Date, Math, JSON, Map, Set, URL, String, Number, Array, Object, btoa, location: { href: 'https://mferent80-source.github.io/premarket_scanner.html/today/' } };
  c.window = c; c.T212Vault = { read: async () => vault, ...(ordine !== undefined ? { readOrdine: async () => ordine } : {}) };
  c.fetch = async (url, opts = {}) => { calls.push({ url: String(url), opts }); if (String(url).endsWith('trading212-config.json')) return new Response(JSON.stringify(config)); return relay(url, opts); };
  vm.createContext(c);
  for (const f of ['lib/holdings-notes.js', 'lib/stop-setter.js', 'lib/t212-orders.js']) vm.runInContext(readFileSync(f, 'utf8'), c);
  return { c, O: c.T212Orders, S: c.StopSetter, calls };
}
// 19.10.2026 (I-711): contul e în RON (poz.currency) — a doua sumă din confirmare e în moneda contului, nu „lei” presupus
const poz = { ticker: 'MU_US_EQ', quantity: 5.5, currentPrice: 876, averagePrice: 993.06, value: 5362, instrumentCurrency: 'USD', currency: 'RON' };
// 27.10.2026 (I-758): orice trimitere trece prin controalele pre-ordin (poziția din copia contului + copia ordinelor + jurnalul local al trimiterilor)
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const garda = (extra = {}) => ({ poz, acum: 876, pending: [], storage: mem(), ...extra });

test('the confirmation summary uses the whole position, the stop and the loss from the current price (in the stock currency and in lei)', () => {
  const { O } = setup(), r = O.rezumat(poz, 832.2, 876);
  assert.equal(r.qty, 5.5); assert.equal(r.simbol, 'MU'); assert.ok(Math.abs(r.pierdere - (876 - 832.2) * 5.5) < 1e-9);
  assert.ok(Math.abs(r.lei - 5362 * (1 - 832.2 / 876)) < 1e-9); assert.equal(r.monedaCont, 'RON'); assert.equal(r.peste, false);
  assert.equal(O.rezumat(poz, 0, 876), null); assert.equal(O.rezumat({ ...poz, quantity: 0 }, 800, 876), null);
  assert.equal(O.rezumat(poz, 900, 876).peste, true);
  const html = O.confirmareHtml(r, 'USD', (s) => String(s), false);
  assert.match(html, /Ordin REAL în Trading 212/); assert.match(html, /5,5 MU/); assert.match(html, /832,20 USD/); assert.match(html, /data-stop-t212-da/); assert.match(html, /gap/);
});
test('the button appears only with a saved connection; without it the panel says how to enable it', async () => {
  const yes = setup(), no = setup({ vault: null });
  const a = await yes.O.disponibil(), b = await no.O.disponibil();
  assert.equal(a.ok, true); assert.equal(b.ok, false); assert.match(b.motiv, /Cont & sincronizare/);
  const snap = { positions: [poz] }, list = yes.S.faraStop(snap, new Set());
  assert.match(yes.S.render(list, { ordine: a }), /data-stop-t212/);
  const off = no.S.render(list, { ordine: b }); assert.doesNotMatch(off, /data-stop-t212"/); assert.match(off, /Ține minte conexiunea/);
  assert.match(yes.S.render(list, { ordine: a, confirm: yes.O.rezumat(poz, 832.2, 876) }), /Da, trimite ordinul/);
  assert.match(yes.S.render(list, { ordine: a, confirm: yes.O.rezumat(poz, 832.2, 876), trimite: true }), /Se trimite…/);
});
test('sending posts once to the relay with the saved key, the confirmation token and the exact quantity and stop', async () => {
  const { O, calls } = setup({ relay: async () => new Response(JSON.stringify({ source: 'Trading 212', environment: 'live', data: { id: 9, status: 'NEW', ticker: 'MU_US_EQ', quantity: 5.5, stopPrice: 832.2, currentPrice: 876 } })) });
  const r = await O.pune({ ticker: 'MU_US_EQ', quantity: 5.5, stopPrice: 832.2 }, { garda: garda() });
  assert.equal(r.ok, true); assert.equal(r.data.stopPrice, 832.2);
  const post = calls.filter((x) => x.opts.method === 'POST'); assert.equal(post.length, 1);
  assert.equal(post[0].url, 'https://premarket-scanner-html.mferent80.workers.dev/api/trading212/stop-order');
  assert.equal(post[0].opts.headers.Authorization, 'Basic ' + btoa('k:s')); assert.equal(post[0].opts.headers['X-T212-Environment'], 'live');
  assert.deepEqual(JSON.parse(post[0].opts.body), { ticker: 'MU_US_EQ', quantity: 5.5, stopPrice: 832.2, confirm: 'PUN-STOPUL' });
});
// 27.10.2026 (lotul 2, I-764): stopul pleacă pe cheia CU ORDINE când e pusă pe aparat (cheia de citire nu are „Orders: Execute”); fără ea, conexiunea salvată, ca până acum
test('the stop order uses the order key when this device has one, otherwise the saved connection', async () => {
  const ok = async () => new Response(JSON.stringify({ source: 'Trading 212', environment: 'live', data: { id: 9, status: 'NEW', ticker: 'MU_US_EQ', quantity: 5.5, stopPrice: 832.2, currentPrice: 876 } }));
  const cu = setup({ ordine: { key: 'ko', secret: 'so', environment: 'live' }, relay: ok });
  assert.equal((await cu.O.pune({ ticker: 'MU_US_EQ', quantity: 5.5, stopPrice: 832.2 }, { garda: garda() })).ok, true);
  assert.equal(cu.calls.find((x) => x.opts.method === 'POST').opts.headers.Authorization, 'Basic ' + btoa('ko:so'), 'cheia cu ordine, nu cea de citire');
  const fara = setup({ ordine: null, relay: ok });
  assert.equal((await fara.O.pune({ ticker: 'MU_US_EQ', quantity: 5.5, stopPrice: 832.2 }, { garda: garda() })).ok, true);
  assert.equal(fara.calls.find((x) => x.opts.method === 'POST').opts.headers.Authorization, 'Basic ' + btoa('k:s'), 'fără cheie cu ordine: conexiunea salvată');
  const doarOrdine = setup({ vault: null, ordine: { key: 'ko', secret: 'so', environment: 'live' }, relay: ok });
  assert.equal((await doarOrdine.O.disponibil()).ok, true, 'butonul apare și când e pusă doar cheia cu ordine');
});
test('refusals say the order was NOT sent; a lost answer says to check Trading 212 before retrying', async () => {
  const perm = setup({ relay: async () => new Response(JSON.stringify({ error: 'broker_permission_missing' }), { status: 502 }) });
  const a = await perm.O.pune({ ticker: 'MU_US_EQ', quantity: 5.5, stopPrice: 832.2 }, { garda: garda() }); assert.equal(a.ok, false); assert.match(a.mesaj, /Orders: Execute/); assert.match(a.mesaj, /NU a fost trimis/);
  const dup = setup({ relay: async () => new Response(JSON.stringify({ error: 'sell_order_exists', stopPrice: 830 }), { status: 409 }) });
  assert.match((await dup.O.pune({ ticker: 'MU_US_EQ', quantity: 5.5, stopPrice: 832.2 }, { garda: garda() })).mesaj, /deja o vânzare.*830,00/);
  const lost = setup({ relay: async () => { throw Error('offline'); } });
  const l = await lost.O.pune({ ticker: 'MU_US_EQ', quantity: 5.5, stopPrice: 832.2 }, { garda: garda() }); assert.equal(l.ok, false); assert.match(l.mesaj, /ÎNAINTE să încerci din nou/); assert.doesNotMatch(l.mesaj, /NU a fost trimis/);
  const novault = setup({ vault: null, relay: async () => { throw Error('nu trebuie apelat'); } });
  assert.equal((await novault.O.pune({ ticker: 'MU_US_EQ', quantity: 5.5, stopPrice: 832.2 }, { garda: garda() })).error, 'fara-conexiune');
  assert.equal(novault.calls.filter((x) => x.opts.method === 'POST').length, 0);
});
test('a success answer for another ticker is not accepted as a placed stop', async () => {
  const { O } = setup({ relay: async () => new Response(JSON.stringify({ source: 'Trading 212', data: { ticker: 'AVGO_US_EQ', stopPrice: 300 } })) });
  assert.equal((await O.pune({ ticker: 'MU_US_EQ', quantity: 5.5, stopPrice: 832.2 }, { garda: garda() })).ok, false);
});

// 27.10.2026 (I-758, controale pre-ordin 15c3-5 / RTS 6 art. 15): collar de preț 0,5–25 % sub prețul de acum (în afara lui doar cu confirmare
// explicită), cantitatea ≤ poziția din copia contului, refuz la dublură (același ordin plecat în ultimele 2 minute sau deja în copia ordinelor).
test('I-758: verifica — collar 0,5–25 % sub preț, în afara lui cere confirmare explicită; cantitatea peste poziție ⇒ refuz; fără poziție / preț ⇒ refuz', () => {
  const { O } = setup(), ordin = (stopPrice, quantity = 5.5) => ({ ticker: 'MU_US_EQ', quantity, stopPrice });
  assert.deepEqual(JSON.parse(JSON.stringify(O.COLLAR)), { minPct: 0.5, maxPct: 25 });
  const ok = O.verifica(ordin(832.2), garda()); assert.equal(ok.ok, true); assert.equal(ok.inAfara, false); assert.ok(Math.abs(ok.pct - 5) < 1e-9);
  const aproape = O.verifica(ordin(874), garda()); assert.equal(aproape.ok, false); assert.equal(aproape.cod, 'collar'); assert.equal(aproape.trebuieConfirmat, true); assert.match(aproape.mesaj, /0,2 %/); assert.match(aproape.mesaj, /0,5–25 %/); assert.match(aproape.mesaj, /NU a fost trimis/);
  const departe = O.verifica(ordin(600), garda()); assert.equal(departe.cod, 'collar'); assert.match(departe.mesaj, /31,5 %/);
  const confirmat = O.verifica(ordin(600), garda({ confirmatInAfara: true })); assert.equal(confirmat.ok, true); assert.equal(confirmat.inAfara, true);
  assert.equal(O.verifica(ordin(876), garda()).cod, 'stop-peste-pret'); assert.equal(O.verifica(ordin(900), garda()).cod, 'stop-peste-pret');
  const prea = O.verifica(ordin(832.2, 6), garda()); assert.equal(prea.cod, 'cantitate'); assert.match(prea.mesaj, /6/); assert.match(prea.mesaj, /5,5/);
  assert.equal(O.verifica(ordin(832.2, 5.5), garda({ poz: { ...poz, quantity: 5.5000000001 } })).ok, true, 'toleranță de rotunjire');
  assert.equal(O.verifica(ordin(832.2), garda({ poz: null })).cod, 'pozitie-necunoscuta');
  assert.equal(O.verifica(ordin(832.2), garda({ poz: { ...poz, ticker: 'AVGO_US_EQ' } })).cod, 'pozitie-necunoscuta');
  assert.equal(O.verifica(ordin(832.2), garda({ acum: null, poz: { ...poz, currentPrice: null } })).cod, 'pret-necunoscut');
  for (const rau of [ordin(0), ordin(832.2, 0), { ticker: '', quantity: 1, stopPrice: 1 }]) assert.equal(O.verifica(rau, garda()).cod, 'invalid');
});
test('I-758: dublură — ordin STOP de vânzare deja în copia ordinelor ⇒ refuz; același ordin plecat în ultimele 2 minute ⇒ refuz; după 2 minute sau alt ordin ⇒ trece', () => {
  const { O } = setup(), ordin = { ticker: 'MU_US_EQ', quantity: 5.5, stopPrice: 832.2 }, now = Date.parse('2026-10-27T15:00:00Z');
  const inCopie = O.verifica(ordin, garda({ pending: [{ ticker: 'MU_US_EQ', type: 'STOP', side: 'SELL', stopPrice: 830, quantity: 5.5 }] }));
  assert.equal(inCopie.cod, 'duplicat-copie'); assert.match(inCopie.mesaj, /830,00/); assert.match(inCopie.mesaj, /NU a fost trimis/);
  assert.equal(O.verifica(ordin, garda({ pending: [{ ticker: 'MU_US_EQ', type: 'LIMIT', side: 'BUY', limitPrice: 800, quantity: 1 }, { ticker: 'AVGO_US_EQ', type: 'STOP', side: 'SELL', stopPrice: 300 }] })).ok, true, 'cumpărarea și alt ticker nu sunt dubluri');
  const stare = { citit: true, pozitii: new Map([['MU_US_EQ', { stare: 'da', sursa: 'broker', ordin: { stopPrice: 830, quantity: 5.5 } }]]) };
  assert.equal(O.verifica(ordin, garda({ pending: stare })).cod, 'duplicat-copie', 'acceptă și forma T212Pending.stare');
  assert.equal(O.verifica(ordin, garda({ pending: null })).ok, true, 'copia necitită nu blochează (releul verifică la broker)');
  const S = mem(); O.noteazaTrimis(S, ordin, now);
  const recent = O.verifica(ordin, garda({ storage: S, now: now + 30000 })); assert.equal(recent.cod, 'duplicat-recent'); assert.match(recent.mesaj, /30 s/); assert.match(recent.mesaj, /verifică în Trading 212/i);
  assert.equal(O.verifica(ordin, garda({ storage: S, now: now + 2 * 60000 + 1 })).ok, true, 'după 2 minute nu mai e dublură');
  assert.equal(O.verifica({ ...ordin, stopPrice: 820 }, garda({ storage: S, now: now + 30000 })).ok, true, 'alt stop = alt ordin');
  assert.equal(O.trimisRecent(S, ordin, now + 30000).ticker, 'MU_US_EQ'); O.scoateTrimis(S, ordin); assert.equal(O.trimisRecent(S, ordin, now + 30000), null);
  O.noteazaTrimis(S, ordin, now - 25 * 3600000); O.noteazaTrimis(S, { ...ordin, stopPrice: 821 }, now); assert.equal(JSON.parse(S.getItem(O.K_TRIMISE)).length, 1, 'intrările mai vechi de 24 h se curăță');
});
test('I-758: pune() refuză fără gardă, refuză înainte de POST când garda pică, notează trimiterea și o șterge la refuz ferm (nu la timeout)', async () => {
  const S = mem(), ordin = { ticker: 'MU_US_EQ', quantity: 5.5, stopPrice: 832.2 };
  const ok = setup({ relay: async () => new Response(JSON.stringify({ source: 'Trading 212', environment: 'live', data: { id: 9, status: 'NEW', ticker: 'MU_US_EQ', quantity: 5.5, stopPrice: 832.2, currentPrice: 876 } })) });
  const fara = await ok.O.pune(ordin); assert.equal(fara.ok, false); assert.equal(fara.error, 'garda-lipsa'); assert.match(fara.mesaj, /NU a fost trimis/); assert.equal(ok.calls.filter((x) => x.opts.method === 'POST').length, 0, 'fără gardă nu pleacă nimic');
  const colar = await ok.O.pune({ ...ordin, stopPrice: 600 }, { garda: garda({ storage: S }) }); assert.equal(colar.error, 'collar'); assert.equal(ok.calls.filter((x) => x.opts.method === 'POST').length, 0);
  const r = await ok.O.pune(ordin, { garda: garda({ storage: S }) }); assert.equal(r.ok, true); assert.equal(ok.calls.filter((x) => x.opts.method === 'POST').length, 1);
  assert.equal(JSON.parse(S.getItem(ok.O.K_TRIMISE)).length, 1, 'trimiterea reușită rămâne notată (dublura în 2 minute)');
  const again = await ok.O.pune(ordin, { garda: garda({ storage: S }) }); assert.equal(again.error, 'duplicat-recent'); assert.equal(ok.calls.filter((x) => x.opts.method === 'POST').length, 1, 'a doua apăsare nu mai pleacă');
  const S2 = mem(), ref = setup({ relay: async () => new Response(JSON.stringify({ error: 'stop_too_far', currentPrice: 876 }), { status: 409 }) });
  assert.equal((await ref.O.pune(ordin, { garda: garda({ storage: S2 }) })).ok, false); assert.equal(JSON.parse(S2.getItem(ref.O.K_TRIMISE) || '[]').length, 0, 'refuzul ferm al releului șterge notarea: se poate reîncerca');
  const S3 = mem(), lost = setup({ relay: async () => { throw Error('offline'); } });
  assert.equal((await lost.O.pune(ordin, { garda: garda({ storage: S3 }) })).error, 'retea'); assert.equal(JSON.parse(S3.getItem(lost.O.K_TRIMISE)).length, 1, 'fără răspuns notarea rămâne: a doua apăsare în 2 minute e refuzată');
  assert.equal((await lost.O.pune(ordin, { garda: garda({ storage: S3 }) })).error, 'duplicat-recent');
});
test('I-758: fereastra de confirmare arată bifa pentru stopul în afara intervalului și nota când copia ordinelor nu e citită', () => {
  const { O } = setup(), r = O.rezumat(poz, 600, 876);
  const html = O.confirmareHtml({ ...r, collar: O.verifica({ ticker: 'MU_US_EQ', quantity: 5.5, stopPrice: 600 }, garda()) }, 'USD', (s) => String(s), false);
  assert.match(html, /data-stop-t212-collar/); assert.match(html, /31,5 %/); assert.match(html, /0,5–25 %/);
  assert.doesNotMatch(O.confirmareHtml(r, 'USD', (s) => String(s), false), /data-stop-t212-collar/, 'în interval nu apare bifa');
  assert.match(O.confirmareHtml({ ...r, copiaNecitita: true }, 'USD', (s) => String(s), false), /[Cc]opia ordinelor nu e citită pe acest aparat/);
});
