// 17.10.2026 — regimul macro calculat singur: aceeași formulă ca Crypto Radar (crypto/public/lib/macro.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';

const load = (f) => { const c = { Math, Date, JSON, Map }; c.window = c; vm.createContext(c); vm.runInContext(readFileSync(f, 'utf8'), c); return c; };
const R = load('lib/macro-regime.js').MacroRegime, zi = (i) => Date.UTC(2026, 0, 1) + i * 86400000;
const serie = (n, f) => Array.from({ length: n }, (_, i) => ({ t: zi(i), c: f(i) }));
const date = (vix, tnx0, tnx1, dxy0, dxy1, fg) => ({ vix: serie(40, () => vix), tnx: serie(40, (i) => (i < 25 ? tnx0 : tnx1)), dxy: serie(40, (i) => (i < 25 ? dxy0 : dxy1)), spy: serie(40, (i) => 100 + Math.sin(i) * 2), btc: serie(40, (i) => 50000 + Math.sin(i) * 800), fg: { valoare: fg } });

test('treptele și pragurile sunt cele din Macro Dashboard / Crypto Radar', () => {
  const calm = R.scor(date(14, 4, 4, 100, 100, 75)); assert.equal(calm.treapta.cod, 'riskon'); // 2 + 1 + 0 + 1 + 2 = 6
  const stres = R.scor(date(35, 4.4, 4, 100, 103, 20)); assert.equal(stres.treapta.cod, 'riskoff'); // −3 −2 −1 +1 −2 = −7
  assert.ok(stres.scor <= -5);
  assert.equal(R.scor({ vix: serie(40, () => 20) }).treapta.cod, 'partial'); // sub 3 semnale citite
  assert.equal(R.fgDin({ data: [{ value: '55', timestamp: '1792195200' }] }).valoare, 55);
});
test('paritate cu Crypto Radar (dacă depozitul crypto e pe acest PC): același scor pe aceleași date', { skip: !existsSync('../crypto/public/lib/macro.js') }, () => {
  const C = load('../crypto/public/lib/macro.js').Macro;
  for (const d of [date(14, 4, 4, 100, 100, 75), date(20, 4, 4.2, 100, 101, 50), date(27, 4.3, 4, 100, 98, 35), date(35, 4.4, 4, 100, 103, 20)]) {
    const a = R.scor(d), b = C.scor(d); assert.equal(a.scor, b.scor); assert.equal(a.treapta.cod, b.treapta.cod); assert.equal(JSON.stringify(a.semne.map((s) => s.scor)), JSON.stringify(b.semne.map((s) => s.scor)));
  }
});
// Amprenta formulei din Crypto Radar (treptele + scor): orice schimbare acolo cere recopierea în lib/macro-regime.js, apoi amprenta nouă aici.
test('amprenta formulei din Crypto Radar e cea copiată (dacă depozitul crypto e pe acest PC)', { skip: !existsSync('../crypto/public/lib/macro.js') }, async () => {
  const { createHash } = await import('node:crypto'), s = readFileSync('../crypto/public/lib/macro.js', 'utf8').replace(/\r\n/g, '\n');
  const seg = s.slice(s.indexOf('const TREPTE'), s.indexOf('const PARTIAL')) + s.slice(s.indexOf('function scor(d)'), s.indexOf('// histerezisul'));
  assert.equal(createHash('sha256').update(seg.replace(/"/g, "'")).digest('hex').slice(0, 16), '0ccb8cd1104c0b24', 'Crypto Radar a schimbat formula regimului macro: recopiază treptele și scor() în lib/macro-regime.js, apoi actualizează amprenta din acest test.'); // 27.10.2026: v100.255 (F&G în afara 0–100 ⇒ nevalid)
});
test('F&G în afara scării 0–100 nu e semn valid (paritate v100.255): scor 0, text „în afara 0–100”; 0 și 100 rămân pe scară', () => {
  const s = R.scor(date(20, 4, 4, 100, 100, 150)).semne.find((x) => x.cod === 'frica'); assert.equal(s.ok, false); assert.equal(s.scor, 0); assert.equal(s.text, 'în afara 0–100'); assert.equal(s.valoare, '150');
  assert.equal(R.scor(date(20, 4, 4, 100, 100, 100)).semne.find((x) => x.cod === 'frica').scor, 2); assert.equal(R.scor(date(20, 4, 4, 100, 100, 0)).semne.find((x) => x.cod === 'frica').scor, -2);
});
