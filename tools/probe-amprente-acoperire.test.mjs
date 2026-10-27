// 27.10.2026 — revizia independentă a lotului F (🟡7, 🟡9).
// 🟡7: amprentele nu acopereau tot ce decide grupurile: indicatorii (lib/indicators.js: RSI / EMA / ATR decid scorul și `eligible`), harta
// de sectoare din lib/early-long.js (decide `capSectors`, ≤ 2 pe sector) și `inregistrare` (decide codul „în Top Long”) la Top Long;
// `inregistrare` / `COD` / `adauga` la Reguli V1. Acum intră în versiune — ce funcții din biblioteci se iau se află din textul motorului
// (`TI.x`, `EL.x` folosite de funcțiile Top Long), apoi închiderea lor tranzitivă; nu o listă scrisă de mână.
// 🟡9: rularea de rezervă de dimineață rescria ziua Top Long notată seara ⇒ prima notare a unei zile rămâne (ca istoricul verdictului),
// pasul Premarket primește DOAR_LIPSA, iar jurnalele au garda „doar crește”.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { versiune, partiVersiune, PROTOCOL as PM } from '../lib/premarket-proba.mjs';
import { versiuneV1, FUNCTII_EVALUATOR, adauga, amprentaEvaluator } from '../lib/v1-proba.mjs';
import { motor } from './premarket-jurnal.mjs';

const h = motor(async () => { throw Error('fără rețea'); }).hooks, citeste = (f) => readFileSync(f, 'utf8');
const cu = (fisier, vechi, nou) => (f) => { const s = citeste(f); if (f !== fisier) return s; assert.ok(s.includes(vechi), fisier + ' nu mai conține ' + vechi); return s.replace(vechi, nou); };
test('Top Long: versiunea acoperă indicatorii folosiți (RSI / EMA / ATR), harta de sectoare și `inregistrare`; ce nu folosește motorul nu contează', () => {
  const p = partiVersiune(h); for (const x of ['inregistrare', 'TI.calcEMA', 'TI.calcRSI', 'TI.calcATR', 'EL.sectorOf']) assert.ok(p.includes(x), 'lipsește din versiune: ' + x);
  const v = versiune(h);
  assert.notEqual(versiune(h, undefined, cu('lib/indicators.js', 'function calcRSI(closes, period){', 'function calcRSI(closes, period){ period = period + 0;')), v, 'RSI schimbat ⇒ altă versiune');
  assert.notEqual(versiune(h, undefined, cu('lib/early-long.js', "return map[s] || SECTOR_SEED[s] || 'Necunoscut';", "return SECTOR_SEED[s] || map[s] || 'Necunoscut';")), v, 'harta de sectoare schimbată ⇒ altă versiune');
  assert.equal(versiune(h, undefined, cu('lib/indicators.js', 'function calcMACD(', 'function calcMACD(/* nefolosit de Top Long */')), v, 'MACD nu decide Top Long');
  assert.ok(!p.includes('EL.CFG'), 'configurația Early Long (cheia hărții în localStorage) nu e regulă Top Long');
  assert.ok(PM.biblioteci.length >= 2);
});
test('Reguli V1: evaluatorul acoperă și înregistrarea zilei (`inregistrare`, codurile `COD`) și `adauga`', () => {
  for (const n of ['inregistrare', 'adauga']) assert.ok(FUNCTII_EVALUATOR.includes(n), n);
  assert.match(amprentaEvaluator(), /^[0-9a-f]{12}$/); assert.match(versiuneV1(citeste('lib/independent-scanner.js')), /^v1-[0-9a-f]{12}$/);
  assert.ok(/COD/.test(readFileSync('lib/v1-proba.mjs', 'utf8').split('const REGULI = ')[1].split('\n')[0]), 'codurile verdictelor (COD) sunt în regulile amprentate');
});
test('🟡9: prima notare a unei zile rămâne — o a doua rulare din aceeași zi (rezerva de dimineață, o rulare de mână) nu o rescrie', () => {
  const r = { zi: '2026-10-28', v: 'v1-x', la: '2026-10-28T22:00:00Z', r: [['A', 'n', 6, '2026-10-28', 'SPY']] };
  let j = adauga({ zile: [] }, r); j = adauga(j, { ...r, la: '2026-10-29T10:15:00Z', r: [['A', 'm', 8, '2026-10-28', 'SPY']] });
  assert.equal(j.zile.length, 1); assert.equal(j.zile[0].la, r.la, 'ziua notată seara rămâne'); assert.equal(j.zile[0].r[0][1], 'n');
});
test('🟡9: fluxul dă DOAR_LIPSA și pasului Premarket; robotul Top Long nu rescrie ziua notată (nici umbra)', () => {
  const y = readFileSync('.github/workflows/v1-proba.yml', 'utf8'), pas = y.slice(y.indexOf('name: Premarket Top Long'), y.indexOf('name: Anunță pe Discord că ziua Premarket'));
  assert.match(pas, /DOAR_LIPSA: \$\{\{ github\.event\.schedule == '15 10 \* \* 2-6' && '1' \|\| '' \}\}/);
  const s = readFileSync('tools/premarket-jurnal.mjs', 'utf8'); assert.match(s, /process\.env\.DOAR_LIPSA/);
});
for (const f of ['scanner-verdicts/generated/v1-jurnal.json', 'scanner-verdicts/generated/premarket-jurnal.json', 'scanner-verdicts/generated/reversal-umbra-jurnal.json']) {
  test('🟡9 garda: ' + f + ' doar crește față de ultimul commit (nicio zi ștearsă sau rescrisă)', () => {
    let vechi; try { vechi = JSON.parse(execFileSync('git', ['show', 'HEAD:' + f], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })); } catch { return; }
    const azi = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : { zile: [] }, cheie = (z) => z.zi + '|' + z.v, nou = new Map((azi.zile || []).map((z) => [cheie(z), JSON.stringify(z)]));
    for (const z of vechi.zile || []) assert.equal(nou.get(cheie(z)), JSON.stringify(z), f + ': ziua ' + cheie(z) + ' a fost ștearsă sau rescrisă');
  });
}
