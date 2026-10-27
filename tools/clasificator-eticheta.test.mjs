// 27.10.2026 — I-745 (auditul F): procentele Clasificatorului se văd ca probabilități (Long 50 %…), dar proba înainte n-are încă 180 de
// zile judecate — calibrarea pe zile noi nu există. Panoul scrie „procente necalibrate (n < 180)”, cu câte zile are proba, până la 180.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync('holdings/classifier.js', 'utf8');
function ui() {
  const c = { console, Math, Number, Array, Object, JSON, Map, Set, Date, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  c.window = c; c.HoldingsClassifier = { VERSION: 'x' }; c.HoldingsModelStorage = { create: () => ({}) }; vm.createContext(c); vm.runInContext(SRC, c, { filename: 'holdings/classifier.js' });
  return c.HoldingsClassifierUI;
}
test('I-745: under 180 judged days the panel says the percentages are uncalibrated (n < 180), with the count when the robot file is read', () => {
  const U = ui();
  assert.match(U.notaNecalibrat(null), /procente necalibrate \(n &lt; 180\)/); assert.match(U.notaNecalibrat(null), /ordine, nu/);
  assert.match(U.notaNecalibrat({ jurnal: { zileVerificate: 2, zileMinime: 180 } }), /2 din 180/);
  assert.equal(U.notaNecalibrat({ jurnal: { zileVerificate: 180, zileMinime: 180 } }), '', 'de la 180 de zile judecate eticheta dispare (calibrarea poate intra)');
  assert.match(SRC, /calibrationText\(v\.calibration\)\)\+'<\/p>';\s*html\+=notaNecalibrat\(robotFile\);/, 'eticheta stă lângă procente, sub nota de calibrare');
});
