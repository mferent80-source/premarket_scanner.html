// alerts-tema-paznic.test.mjs — pagina alerts în designul PAZNIC-CRYPTO (11.10.2026, Marius: „aplică”, după demo).
// Doar ASPECT: culori după rol → paleta PAZNIC, colțuri 3–5 px (cercurile rămân), fără umbre, greutăți ≤600,
// etichete fără MAJUSCULE spațiate. theme-light.css și suite-ui.css sunt comune cu alte 22 de pagini ⇒ NU se ating;
// alerts încarcă o copie transformată a lor (alerts/tema-paznic-suita.css), ținută la zi de generator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tema, copieSuita, PALETA } from './alerts-tema-paznic.mjs';

const R = new URL('..', import.meta.url);
const rd = (f) => readFileSync(new URL(f, R), 'utf8').replace(/\r\n/g, '\n');
const HTML = rd('alerts/index.html');
const PERMISE = new Set([...Object.values(PALETA), '#FFFFFF', '#000000', '#FFF', '#000'].map((x) => x.toUpperCase()));

test('tema: culorile neutre devin fondurile / textele PAZNIC, verde/roșu/galben/albastru devin sus/jos/aur/info', () => {
  const { css } = tema('a{color:#42be65;background:#161616;border-color:#fa4d56}b{color:#f1c21b;fill:#78a9ff;color:#c6c6c6}');
  assert.match(css, /color:#26A96C/); assert.match(css, /background:#141C24/); assert.match(css, /border-color:#E0524A/);
  assert.match(css, /color:#E9B949/); assert.match(css, /fill:#5B8FC7/); assert.match(css, /color:#9FB3C4/);
});
test('tema: colțurile mari devin 3–5 px, cercurile (50%) rămân, umbrele dispar, inelul de focus rămâne', () => {
  const { css } = tema('a{border-radius:10px}b{border-radius:999px}c{border-radius:50%}d{box-shadow:0 8px 24px rgba(0,0,0,.4)}e{box-shadow:0 0 0 2px currentColor}');
  assert.match(css, /a\{border-radius:5px\}/); assert.match(css, /b\{border-radius:3px\}/); assert.match(css, /c\{border-radius:50%\}/);
  assert.match(css, /d\{box-shadow:none\}/); assert.match(css, /e\{box-shadow:0 0 0 2px currentColor\}/);
});
test('tema: nu atinge selectorii, display-ul sau ordinea (doar aspect)', () => {
  const src = '.x .y>z{display:none}@media (max-width:640px){.q{display:grid;color:#42be65}}';
  const { css } = tema(src);
  assert.equal(css.replace(/#26A96C/g, '#42be65'), src);
});
test('copia foilor comune e la zi cu theme-light.css + suite-ui.css (altfel: node tools/alerts-tema-paznic.mjs)', () => {
  assert.equal(rd('alerts/tema-paznic-suita.css'), copieSuita(rd('lib/theme-light.css'), rd('lib/suite-ui.css')));
});
test('foile comune NU sunt transformate (le folosesc alte 22 de pagini)', () => {
  assert.match(rd('lib/theme-light.css'), /--bg:\s*#fbfaf7/);
  assert.match(rd('lib/suite-ui.css'), /#[0-9a-fA-F]{6}/);
});
test('alerts încarcă copia DUPĂ foile comune și ÎNAINTE de radar-ui.css și de stilul paginii', () => {
  const i = (s) => HTML.indexOf(s);
  const a = i('../lib/suite-ui.css'), b = i('tema-paznic-suita.css'), c = i('../lib/radar-ui.css'), d = HTML.indexOf('<style>');
  assert.ok(a > 0 && b > a && c > b && d > c, JSON.stringify({ a, b, c, d }));
});
test('radar-ui.css (doar al paginii alerts) și stilul paginii folosesc doar culorile PAZNIC (plus alb/negru)', () => {
  const stil = (HTML.match(/<style>([\s\S]*?)<\/style>/) || [])[1];
  for (const [nume, css] of [['radar-ui.css', rd('lib/radar-ui.css')], ['<style> alerts', stil]]) {
    const straine = [...new Set((css.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/g) || []).map((x) => x.toUpperCase()))].filter((x) => !PERMISE.has(x));
    // ce lasă transformarea neatins (movul volatilității, alb, negru) e voit; restul trebuie să fie din paletă
    assert.deepEqual(straine.filter((x) => tema('a{color:' + x + '}').css !== 'a{color:' + x + '}'), [], nume + ': culori din afara paletei');
  }
});
test('stilul paginii se încheie cu blocul PAZNIC (fondul, bara de sus, fontul datelor) și cercurile rămân cercuri', () => {
  const stil = (HTML.match(/<style>([\s\S]*?)<\/style>/) || [])[1];
  assert.match(stil, /TEMA PAZNIC/); assert.match(stil, /body\.al-page\{background:#0E141A!important/);
  assert.ok(!/border-radius:4px !important/.test(stil), 'fără regula oarbă care făcea punctele pătrate (prinsă în demo)');
});
