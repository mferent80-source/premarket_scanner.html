// 19.10.2026 — mărunte din auditul Decision App (Capital + Jurnal): simbolul din avertismentul de concentrare intra în HTML neescapat;
// „Preia din snapshot” scria capitalul de două ori; Jurnalul încărca suite-version.js de două ori și înregistra service worker-ul de două ori.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

test('Concentrare risc: simbolul din avertisment e escapat ca restul rândurilor', () => {
  const c = { console, JSON, Math, Date, Intl, localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: () => null, addEventListener() {} }, addEventListener() {}, setInterval() {}, setTimeout() {} };
  c.window = c; vm.createContext(c); vm.runInContext(readFileSync('lib/capital-desk.js', 'utf8'), c);
  const el = { innerHTML: '', style: {} }, rau = '<img src=x onerror=alert(1)>';
  c.CD.renderTopRisk(el, { topRisk: [{ sym: rau, risk: 300, pct: 75 }, { sym: 'MSFT', risk: 100, pct: 25 }], portfolio: { riskUse: 400 }, links: { portfolio: '#portfolio' } });
  assert.doesNotMatch(el.innerHTML, /<img/); assert.match(el.innerHTML, /⚠ &lt;img src=x onerror=alert\(1\)&gt; = 75%/);
});

test('„Preia din snapshot”: capitalul se scrie o singură dată', () => {
  const html = readFileSync('journal/index.html', 'utf8');
  const start = html.indexOf("$('btnAcctSnap').addEventListener('click', () => {"), end = html.indexOf('\n});', start);
  assert.ok(start > 0 && end > start);
  const body = html.slice(start + "$('btnAcctSnap').addEventListener('click', () => {".length, end);
  let scrieri = 0;
  const c = { $: () => ({ value: '' }), EQ: { lastSnapshot: () => ({ equity: 5393.45, day: '2026-10-19' }) }, renderDesk() {}, renderCapitalLines() {}, alert() {},
    GV: { saveCfg: () => { scrieri++; return {}; } }, ACCT: { syncAll: () => { scrieri++; return true; } } };
  c.window = c; vm.createContext(c); vm.runInContext('(function(){' + body + '})()', c);
  assert.equal(scrieri, 1);
});

test('Jurnalul: suite-version.js o dată și service worker-ul înregistrat o dată (blocul generat tt:sw-guard)', () => {
  const html = readFileSync('journal/index.html', 'utf8');
  assert.equal((html.match(/lib\/suite-version\.js\?v=/g) || []).length, 1);
  assert.equal((html.match(/serviceWorker\.register\(/g) || []).length, 1);
  const guard = html.slice(html.indexOf('<!-- tt:sw-guard:start -->'));
  assert.match(guard, /serviceWorker\.register\('\.\.\/sw-app\.js\?v=' \+ PAGE_VER/);
});
