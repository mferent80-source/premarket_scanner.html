// 19.10.2026 — el: „pune o regulă ca ultima copie să fie cea de sincronizat, că mereu sunt conflicte pe partea asta”.
// Capitalul (tt_pf_account — „Contul selectat”, tt_ticket_capital — „Capitalul planului”) e o singură cifră scrisă de ambele aparate:
// Jurnalul la deschidere, capitalul automat din Trading 212 o dată pe zi, tichetul din Desk. Două scrieri diferite între două sincronizări
// dădeau „Conflict de sincronizare”; acum câștigă scrierea cea mai nouă (ora locală o ține aplicația, ora din cont e `updated` de pe server).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {KEYS,mergeRecord,validateValue,EvidenceCloud,ForecastCloud,LAST_WRITE_WINS,FillsCloud} from '../lib/cloud-sync-model.mjs';
import {handleCloud} from './cloud-sync-worker.bundle.mjs';

test('regula: la capital câștigă scrierea cea mai nouă, fără conflict; fără oră locală câștigă contul', () => {
  assert.deepEqual([...LAST_WRITE_WINS].sort(), ['tt_governor_cfg_v1', 'tt_pf_account', 'tt_ticket_capital']); // 27.10.2026 (lotul A): și limitele Governor (fără capital) — ultima scriere câștigă
  for (const k of LAST_WRITE_WINS) {
    assert.ok(KEYS.includes(k));
    let m = mergeRecord(k, '5000', '5100', '5200', {localAt: 2000, remoteAt: 1000});
    assert.equal(m.value, '5100'); assert.equal(m.conflicts.length, 0);
    m = mergeRecord(k, '5000', '5100', '5200', {localAt: 1000, remoteAt: 2000});
    assert.equal(m.value, '5200'); assert.equal(m.conflicts.length, 0);
    m = mergeRecord(k, '5000', '5100', '5200');
    assert.equal(m.value, '5200', 'fără ora scrierii locale, copia din cont'); assert.equal(m.conflicts.length, 0);
    m = mergeRecord(k, undefined, '5100', '5200', {localAt: 3000, remoteAt: 1000});
    assert.equal(m.value, '5100', 'și la prima sincronizare'); assert.equal(m.conflicts.length, 0);
    // fără două scrieri, unirea obișnuită rămâne
    assert.equal(mergeRecord(k, '5000', '5000', '5200', {localAt: 9e12, remoteAt: 1}).value, '5200');
    assert.equal(mergeRecord(k, '5000', '5100', '5000', {localAt: 1, remoteAt: 9e12}).value, '5100');
  }
  // restul cheilor nu se schimbă: tot alegerea lui
  assert.deepEqual(mergeRecord('tt_theme', 'dark', 'light', 'auto', {localAt: 2, remoteAt: 1}).conflicts, ['tt_theme']);
});

function account() {
  const store = new Map(), c = {console, JSON, Date, localStorage: {getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k)}};
  c.window = c; vm.createContext(c); vm.runInContext(readFileSync(new URL('../lib/account.js', import.meta.url), 'utf8'), c);
  return {store, ACCT: c.ACCT};
}
test('Jurnalul la deschidere nu mai rescrie copia sincronizată venită de pe celălalt aparat', () => {
  const {store, ACCT} = account();
  store.set('tt_account_size_v1', '12670'); store.set('tt_pf_account', '5393.45');
  ACCT.migrate();
  assert.equal(store.get('tt_pf_account'), '5393.45', 'migrate() a suprascris capitalul venit din cont');
  assert.equal(ACCT.get().value, 12670, 'capitalul local rămâne');
  // o scriere adevărată (snapshot, Portofoliu, Governor) o actualizează
  ACCT.syncAll(5401.2, 'snapshot'); assert.equal(store.get('tt_pf_account'), '5401.2');
});
test('migrate() completează copia doar cu un capital adevărat, nu cu valoarea de pornire 10.000', () => {
  let {store, ACCT} = account();
  ACCT.migrate(); assert.equal(store.get('tt_pf_account'), undefined, '10.000 de pornire a plecat în cont');
  ({store, ACCT} = account());
  store.set('tt_account_size_v1', '12670'); ACCT.migrate(); assert.equal(store.get('tt_pf_account'), '12670');
});

// Proba cap-coadă: aplicația reală (app/cloud-sync.js) + serverul real (D1 în memorie), două aparate.
const source = readFileSync(new URL('../app/cloud-sync.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/, '');
const {create: planStore} = createRequire(import.meta.url)('../lib/trade-plan-store.js');
const {create: fillsStore} = createRequire(import.meta.url)('../lib/trading212-fills-store.js');
const endpoint = 'https://premarket-scanner-html.mferent80.workers.dev', origin = 'https://mferent80-source.github.io', clientId = 'test.apps.googleusercontent.com';
async function service() {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec(readFileSync(new URL('./cloud-sync-schema.sql', import.meta.url), 'utf8'));
  const env = {GOOGLE_CLIENT_ID: clientId, CLOUD_ENCRYPTION_KEY: Buffer.alloc(32, 31).toString('base64url'), CLOUD_DB: {prepare(sql) { return {first: async () => sqlite.prepare(sql).get() || null, bind(...args) { return {first: async () => sqlite.prepare(sql).get(...args) || null, all: async () => ({results: sqlite.prepare(sql).all(...args)}), run: async () => ({meta: {changes: Number(sqlite.prepare(sql).run(...args).changes)}})}; }}; }}};
  const pair = await crypto.subtle.generateKey({name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'}, true, ['sign', 'verify']), jwk = await crypto.subtle.exportKey('jwk', pair.publicKey); Object.assign(jwk, {kid: 'test', alg: 'RS256'});
  async function identity(nonce) {
    const encode = (v) => Buffer.from(JSON.stringify(v)).toString('base64url'), now = Math.floor(Date.now() / 1000), unsigned = encode({alg: 'RS256', kid: 'test'}) + '.' + encode({aud: clientId, iss: 'https://accounts.google.com', sub: '123', email: '123@example.test', email_verified: true, nonce, iat: now, exp: now + 3600});
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(unsigned)); return unsigned + '.' + Buffer.from(signature).toString('base64url');
  }
  async function fetcher(url, options) { return handleCloud(new Request(url, {...options, headers: {...options.headers, Origin: origin, 'CF-Connecting-IP': '192.0.2.1'}}), env, async () => Response.json({keys: [jwk]})); }
  return {sqlite, identity, fetcher};
}
async function device(server, local = {}) {
  const storage = new Map(Object.entries(local)), privateStore = new Map(), listeners = [];
  const localStorage = {getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k)};
  const window = {addEventListener(type, f) { if (type === 'storage') listeners.push(f); }, dispatchEvent() {}, T212FillsStore: fillsStore(localStorage, {durable: null, notify: false}), TTPlanStore: {create: () => planStore(localStorage, {durable: null, notify: false})}, TTCloudStore: {get: async (k) => structuredClone(privateStore.get(k) ?? null), put: async (k, v) => privateStore.set(k, structuredClone(v)), remove: async (k) => privateStore.delete(k)}, T212Vault: {read: async () => null, save: async () => {}, clear: async () => {}}};
  const context = {window, localStorage, KEYS, LAST_WRITE_WINS, mergeRecord, validateValue, EvidenceCloud, ForecastCloud, FillsCloud, location: {origin, href: origin + '/app/'}, document: {hidden: false, querySelectorAll: () => [], getElementById: () => null, addEventListener() {}}, navigator: {onLine: true}, CustomEvent: class {}, StorageEvent: class {}, AbortController, URL, Date, setTimeout: (f, ms) => ms === 2500 ? 0 : setTimeout(f, ms), clearTimeout, setInterval: () => {}, fetch: async (url, options) => url === 'cloud-sync-config.json' ? Response.json({enabled: false, autoActivate: true, endpoint}) : server.fetcher(url, options)};
  vm.createContext(context); vm.runInContext(source, context); const api = window.TTCloud; await api.recheck();
  // o pagină din aplicație (Jurnalul, Desk) scrie: aplicația primește evenimentul storage
  const write = (k, v) => { const old = storage.get(k) ?? null; storage.set(k, v); for (const f of listeners) f({key: k, oldValue: old, newValue: v}); };
  return {api, storage, write, signIn: async () => { const {nonce} = await api.challenge(); await api.login(await server.identity(nonce), nonce); }};
}
const pauza = () => new Promise((r) => setTimeout(r, 1100)); // ora din cont e la secundă
test('telefonul și PC-ul scriu capitalul între două sincronizări ⇒ fără conflict, rămâne scrierea cea mai nouă', async () => {
  const server = await service(); try {
    const pc = await device(server, {tt_pf_account: '5000'}); await pc.signIn();
    const phone = await device(server); await phone.signIn(); assert.equal(phone.storage.get('tt_pf_account'), '5000');
    // dimineața: telefonul (capitalul automat) scrie primul, PC-ul (Jurnalul) după el și sincronizează primul
    phone.write('tt_pf_account', '5393.45'); await pauza(); pc.write('tt_pf_account', '5401.2'); await pc.api.sync();
    await phone.api.sync();
    assert.equal(phone.api.state().conflicts.length, 0, 'tot conflict');
    assert.equal(phone.storage.get('tt_pf_account'), '5401.2', 'scrierea mai nouă de pe PC trebuia să rămână');
    // invers: telefonul scrie DUPĂ ce PC-ul a urcat ⇒ câștigă telefonul și urcă
    pc.write('tt_pf_account', '5500'); await pc.api.sync(); await pauza();
    phone.write('tt_pf_account', '5600'); await phone.api.sync();
    assert.equal(phone.api.state().conflicts.length, 0); assert.equal(phone.storage.get('tt_pf_account'), '5600');
    await pc.api.sync(); assert.equal(pc.storage.get('tt_pf_account'), '5600'); assert.equal(pc.api.state().conflicts.length, 0);
    // capitalul planului din Desk, la fel
    phone.write('tt_ticket_capital', '7000'); await pauza(); pc.write('tt_ticket_capital', '8000'); await pc.api.sync(); await phone.api.sync();
    assert.equal(phone.api.state().conflicts.length, 0); assert.equal(phone.storage.get('tt_ticket_capital'), '8000');
  } finally { server.sqlite.close(); }
});
