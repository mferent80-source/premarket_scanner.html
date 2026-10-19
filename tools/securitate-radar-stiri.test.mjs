// 19.10.2026 (I-711): linkul știrii doar http(s); cheia și parola Radarului doar din # (query-ul ajunge în jurnalele serverului);
// cererile către worker-ul Paznicului au termen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (p) => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const ALERTS = read('alerts/index.html');

test('I-711: linkul știrii primește doar adrese http(s); javascript:, data: și restul cad pe #', () => {
  const a = ALERTS.indexOf('function nwSafeUrl(');
  assert.ok(a > 0, 'nwSafeUrl există');
  const src = ALERTS.slice(a, ALERTS.indexOf('\n}', a) + 2);
  const nwSafeUrl = new Function(src + '\nreturn nwSafeUrl;')();
  assert.equal(nwSafeUrl('https://www.reuters.com/x?a=1'), 'https://www.reuters.com/x?a=1');
  assert.equal(nwSafeUrl('http://example.com/'), 'http://example.com/');
  for (const rau of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.test/x', 'ftp://x', '', null, undefined, 42]) assert.equal(nwSafeUrl(rau), '#', String(rau));
  assert.match(ALERTS, /href="\$\{escHtml\(nwSafeUrl\(h\.url\)\)\}"/, 'linkul din listă trece prin nwSafeUrl');
  assert.doesNotMatch(ALERTS, /href="\$\{escHtml\(h\.url \|\| '#'\)\}"/);
  assert.match(ALERTS, /<a href="\$\{tgEsc\(nwSafeUrl\(h\.url\)\)\}">/, 'și mesajul Telegram');
});

function radarPoza({ href, fetch, timers }) {
  const scris = {}, istoric = [];
  const fakeTimeout = (fn, ms) => { timers.push(ms); setImmediate(fn); return timers.length; };
  const RP = new Function('window', 'localStorage', 'fetch', 'document', 'location', 'history', 'setTimeout', 'clearTimeout', read('lib/radar-poza.js') + '; return RadarPoza;')(
    {}, { getItem(k) { return scris[k] ?? null; }, setItem(k, v) { scris[k] = v; }, removeItem(k) { delete scris[k]; } }, fetch || (() => Promise.reject(new Error('fara retea'))),
    { hidden: false, addEventListener() {} }, { href }, { replaceState(a, b, u) { istoric.push(u); } }, fakeTimeout, () => {});
  return { RP, scris, istoric };
}

test('I-711: cheia și parola din ?query nu se mai salvează (au ajuns deja la server) — doar se șterg din adresă; din # merg ca înainte', () => {
  const q = radarPoza({ href: 'https://mferent80-source.github.io/premarket_scanner.html/alerts/?cheie=CheieFalsaDeProba0123456789abcdef&parola=P1&x=1#y', timers: [] });
  assert.equal(q.RP.cheieDinUrl(), null);
  assert.equal(q.scris.radar_cheie, undefined, 'cheia din query nu se salvează');
  assert.equal(q.scris.radar_parola, undefined, 'parola din query nu se salvează');
  assert.equal(q.istoric[0], 'https://mferent80-source.github.io/premarket_scanner.html/alerts/?x=1#y', 'dar dispar din adresă');
  const h = radarPoza({ href: 'https://mferent80-source.github.io/premarket_scanner.html/alerts/?x=1#cheie=CheieFalsaDeProba0123456789abcdef&parola=x%2Fy', timers: [] });
  assert.equal(h.RP.cheieDinUrl(), 'CheieFalsaDeProba0123456789abcdef');
  assert.equal(h.scris.radar_cheie, 'CheieFalsaDeProba0123456789abcdef'); assert.equal(h.scris.radar_parola, 'x/y');
  assert.equal(h.istoric[0], 'https://mferent80-source.github.io/premarket_scanner.html/alerts/?x=1');
});

test('I-711: cererea /poza are termen — una agățată nu mai blochează citirile următoare', async () => {
  const timers = []; let n = 0;
  const fetch = (u, o) => { n++; return new Promise((_, rej) => { o && o.signal && o.signal.addEventListener('abort', () => rej(new Error('termen depășit'))); }); };
  const { RP } = radarPoza({ href: 'https://x/alerts/', fetch, timers });
  RP.puneCheie('CheieFalsaDeProba0123456789abcdef');
  let guard; const blocked = new Promise((_, rej) => { guard = setTimeout(() => rej(new Error('/poza a rămas agățată (fără termen)')), 2000); });
  let r; try { r = await Promise.race([RP.citeste({ fortat: true }), blocked]); } finally { clearTimeout(guard); }
  assert.ok(timers.some((ms) => ms >= 5000 && ms <= 30000), 'un termen între 5 și 30 s');
  assert.match(r.eroare, /Radarul nu răspunde/);
  await RP.citeste({ fortat: true }).catch(() => {});
  assert.equal(n, 2, 'următoarea citire pleacă (nu mai stă blocată pe „în lucru”)');
});
