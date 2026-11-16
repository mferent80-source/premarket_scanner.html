// 16.11.2026 — cifra mare din Controlul deținerilor și culoarea „Pe drum”, separate de refuz.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const c = { Intl, Date, Math, JSON, Map, Set, URL, String, Number, Array, Object, WeakMap, Float64Array };
c.window = c;
c.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
vm.createContext(c);
vm.runInContext(readFileSync('lib/holdings-notes.js', 'utf8'), c, { filename: 'lib/holdings-notes.js' });
vm.runInContext(readFileSync('lib/stop-setter.js', 'utf8'), c, { filename: 'lib/stop-setter.js' });
const S = c.StopSetter;
const poz = [{ ticker: 'VOD_US_EQ', quantity: 1, averagePrice: 10, currentPrice: 12, instrumentCurrency: 'USD' }];

test('starea ordinului stă pe rândul ei: „Pe drum” nu colorează nota de Discord', () => {
  const html = S.render(poz, {
    stare: 'Pe Discord vine alarma la fiecare 15 minute până pui stopul (luni–vineri, 08:00–22:00; în rest tace).',
    stareOrdin: 'Pe drum. Același ordin e deja pe drum către Trading 212.',
    stareTon: 'drum',
  });
  const sub = html.slice(html.indexOf('class="stop-sub"'), html.indexOf('class="stop-stare'));
  assert.match(html, /class="stop-stare stop-stare-drum"/);
  assert.match(sub, /Pe Discord vine alarma/);
  assert.doesNotMatch(sub, /Pe drum/);
  assert.match(html, /Pe drum\. Același ordin e deja pe drum/);
  const refuz = S.render(poz, { stareOrdin: '⚠ Ordinul NU a fost trimis.', stareTon: 'refuz', stare: 'Pe Discord vine alarma.' });
  assert.match(refuz, /class="stop-stare stop-stare-refuz"/);
  assert.doesNotMatch(refuz, /stop-stare-drum/);
  assert.match(refuz.slice(refuz.indexOf('class="stop-sub"'), refuz.indexOf('class="stop-stare')), /Pe Discord vine alarma/);
  const gol = S.render(poz, {});
  assert.doesNotMatch(gol, /class="stop-stare/);
});

test('textul ordinului e escapat și confirmarea rămâne clasa roșie din stil', () => {
  const html = S.render(poz, { stareOrdin: '<script>', stareTon: 'ok' });
  assert.match(html, /stop-stare-ok/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  const css = readFileSync('today/style.css', 'utf8');
  assert.match(css, /\.stop-stare-drum\{color:var\(--amber\);background:var\(--amber-soft\)\}/);
  assert.match(css, /\.stop-stare-refuz\{color:var\(--red\);background:var\(--red-soft\)\}/);
  assert.match(css, /\.stop-t212-confirm\{border:2px solid var\(--bad,#e5534b\)/);
});

test('Astăzi marchează pe drum doar codurile fără confirmare și lasă refuzul pe roșu', () => {
  const src = readFileSync('today/stop.js', 'utf8');
  assert.match(src, /stareOrdin: stare, stareTon, stare: \[pozaNota/);
  assert.doesNotMatch(src, /stare: \[stare, pozaNota/);
  assert.match(src, /new Set\(\['order_in_flight', 'timeout', 'retea', 'broker_timeout', 'broker_network_error', 'broker_unavailable'\]\)/);
  assert.match(src, /marcheaza\(\/\^Pe drum\\b\/\.test\(m\) \? m : 'Pe drum\. ' \+ m, 'drum'\)/);
  assert.match(src, /Ordinul NU a fost trimis\./);
  assert.match(src, /Reia citirea înainte de ordinul STOP\.', 'refuz'/);
  const orders = readFileSync('lib/t212-orders.js', 'utf8');
  const ferm = orders.slice(orders.indexOf('const REFUZ_FERM'), orders.indexOf('async function pune'));
  assert.doesNotMatch(ferm, /order_in_flight/);
});

test('Controlul deținerilor: cifra mare, conversia neverificată și alerta de 7 zile în afara pliului', () => {
  const src = readFileSync('holdings/holdings.js', 'utf8');
  const fn = src.slice(src.indexOf('function renderRisk'), src.indexOf('function eventsCard'));
  assert.match(fn, /<b>Parțial · \$\{acoperite\} din \$\{totalPoz\}<\/b>/);
  assert.match(fn, /number\('Risc până la stop','Neverificat'\)/);
  assert.match(fn, /filter\(x=>x\.implicitFX\)/);
  assert.match(fn, /conversie neverificată/);
  assert.match(fn, /\$\{esc\(x\.ticker\)\} · \$\{esc\(x\.instrumentCurrency\)\}/);
  assert.match(fn, /\$\{earningsPliat\}<\/details>\$\{earningsDeschis\}/);
  assert.ok(fn.indexOf('days<=7?`<p class="warn">') < fn.indexOf('<details class="risk-rest">'));
  assert.match(fn, /Niciun reper manual apropiat/);
  assert.doesNotMatch(fn, /Risc până la stop · parțial/);
  const css = readFileSync('holdings/holdings.css', 'utf8');
  const chunk = css.slice(css.indexOf('16.11.2026: suma parțială'));
  assert.ok(chunk.length > 20);
  assert.doesNotMatch(chunk.slice(0, chunk.indexOf('28.10.2026')), /display:\s*none/);
  assert.match(chunk, /\.portfolio-brief \.risk-conc b\{font-variant-numeric:tabular-nums;white-space:nowrap\}/);
});
