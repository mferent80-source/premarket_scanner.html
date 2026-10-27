// 27.10.2026 — I-744 („cât mai durează și ce poate vedea”): pe fiecare panou de probă, data estimată a primului verdict și puterea.
// Cifrele vin din protocol (perioade necesare, k) și din calendarul SUA (lib/exchange-calendar.js), nu din prezumții; când lotul F scrie
// în JSON câmpurile `primulVerdict` / `putere` / `judecata` (protocol v2, I-741), ele au întâietate. Fără `putere` ⇒ „putere nescrisă”.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function load({ calendar = true } = {}) {
  const c = { console, Date, Intl, Math, Number, JSON, Array, Object, String };
  c.window = c; c.globalThis = c; vm.createContext(c);
  if (calendar) vm.runInContext(readFileSync('lib/exchange-calendar.js', 'utf8'), c, { filename: 'lib/exchange-calendar.js' });
  vm.runInContext(readFileSync('lib/proba-termen.js', 'utf8'), c, { filename: 'lib/proba-termen.js' });
  return c;
}
// 27.10.2026 (lipirea F × D, revizia F): fișierele din generated/ se rescriu în fiecare noapte (din 28.10 sub protocolul v2) ⇒ testele citesc
// instantanee fixe: cel din 23.10 (probele v1, fără câmpurile lotului F) și ieșirea reală a roboților v2 (proba cap-coadă din 27.10, 23:50 UTC)
const PM = JSON.parse(readFileSync('tools/fixtures/probe-23-10/premarket-proba.json', 'utf8'));
const UMBRA = JSON.parse(readFileSync('tools/fixtures/probe-23-10/reversal-umbra-proba.json', 'utf8'));
const PM2 = JSON.parse(readFileSync('tools/fixtures/probe-v2-27-10/premarket-proba.json', 'utf8')), V12 = JSON.parse(readFileSync('tools/fixtures/probe-v2-27-10/v1-proba.json', 'utf8'));
const UMBRA2 = JSON.parse(readFileSync('tools/fixtures/probe-v2-27-10/reversal-umbra-proba.json', 'utf8'));
function sesiuniUS(EC, zi, n) { let d = zi; for (let i = 0; i < n; i++) d = EC.next(d, 'US').day; return d; }

test('I-744: data primului verdict = perioade rămase × k sesiuni pe calendarul SUA, de la începutul probei (0 perioade) sau de la ultima perioadă închisă', () => {
  const c = load(), T = c.TTProbaTermen, EC = c.ExchangeCalendar;
  const principal = PM.orizonturi.find((o) => o.principal);
  assert.equal(principal.perioade, 0); assert.equal(principal.k, 20);
  const e = T.estimeaza(PM);
  assert.equal(e.k, 20); assert.equal(e.necesare, 8); assert.equal(e.ramase, 8); assert.equal(e.sursa, 'protocol'); assert.equal(e.calendar, 'US');
  assert.equal(e.data, sesiuniUS(EC, PM.inceput, 8 * 20), '8 perioade × 20 de sesiuni de la 16.10.2026');
  assert.match(e.luna, /^(mai|iunie|iulie) 2027$/);
  assert.match(e.text, /primul verdict posibil: ~(mai|iunie|iulie) 2027 \(8 perioade de 20 de sesiuni care nu se suprapun\)/);
  assert.match(e.text, /putere nescrisă/);
  // orizontul secundar: 1 perioadă închisă (început 16.10) ⇒ mai trebuie 7, iar perioada 8 se încheie la (8 − 1 + 1) × 5 sesiuni de la ultima perioadă închisă
  const o5 = PM.orizonturi.find((o) => o.k === 5);
  const s = T.estimeaza({ ...PM, orizonturi: [{ ...o5, principal: true }] });
  assert.equal(s.ramase, 7); assert.equal(s.data, sesiuniUS(EC, o5.ultimaPerioada.zi, 8 * 5));
});

test('I-744: câmpurile scrise de lotul F (primulVerdict realist, putere, judecata) au întâietate și intră în text', () => {
  const T = load().TTProbaTermen;
  const j = { ...PM, primulVerdict: { optimist: '2027-05-10', realist: '2027-07-02', motiv: 'robotul mai pierde zile' }, putere: { laPlus: [{ pct: 0.5, putere: 0.42 }, { pct: 1, putere: 0.83 }] }, judecata: { la: 8, data: null, verdict: null, unic: true } };
  const e = T.estimeaza(j);
  assert.equal(e.sursa, 'fișier'); assert.equal(e.data, '2027-07-02'); assert.equal(e.luna, 'iulie 2027');
  assert.match(e.text, /~iulie 2027/); assert.match(e.text, /cel puțin \+1,0 %\/perioadă \(putere 83 %\)/); assert.doesNotMatch(e.text, /nescrisă/);
  assert.match(e.text, /o singură judecată, la 8 perioade/);
  const slab = T.estimeaza({ ...j, putere: { laPlus: [{ pct: 0.5, putere: 0.3 }] } });
  assert.match(slab.text, /\+0,5 %\/perioadă l-ar vedea doar în 30 % din cazuri/);
  const judecat = T.estimeaza({ ...j, judecata: { la: 8, data: '2027-07-02T22:00:00Z', verdict: 'fara-avantaj', unic: true } });
  assert.match(judecat.text, /judecată unică pe 02\.07\.2027: nu s-a văzut un avantaj/);
});

test('I-744: umbra Reversal (evaluare, nu orizonturi) — aceeași estimare; puterea din protocol (R, nu %) când JSON-ul nu o are', () => {
  const c = load(), T = c.TTProbaTermen, EC = c.ExchangeCalendar;
  const e = T.estimeaza(UMBRA, { putereProtocol: { unitate: 'R', laPlus: [{ pct: 0.3, putere: 0.11 }] } });
  assert.equal(e.k, 20); assert.equal(e.ramase, 8); assert.equal(e.data, sesiuniUS(EC, UMBRA.inceput, 160));
  assert.match(e.text, /\+0,3 R\/tranzacție l-ar vedea doar în 11 % din cazuri \(din protocol\)/);
});

test('I-744: fără calendarul SUA sau după 2027 numără zilele lucrătoare și o spune; jurnal lipsă ⇒ nicio dată inventată', () => {
  const T = load({ calendar: false }).TTProbaTermen;
  const e = T.estimeaza(PM);
  assert.equal(e.calendar, 'zile lucrătoare'); assert.match(e.text, /zile lucrătoare, fără sărbătorile SUA/);
  assert.equal(T.estimeaza(null), null); assert.equal(T.linie(null), '');
  assert.equal(T.estimeaza({ orizonturi: [] }), null);
  const d = load().TTProbaTermen.estimeaza({ ...PM, inceput: '2027-11-01', orizonturi: PM.orizonturi.map((o) => ({ ...o, perioade: 0, ultimaPerioada: null })) });
  assert.equal(d.calendar, 'US+zile lucrătoare'); assert.match(d.luna, /2028$/);
});

test('I-744: bilanțul Trend 12-1 (fără orizonturi) — din constantele protocolului: ≥ 12 ferestre de 20 de sesiuni de la începutul probei; puterea din fraza protocolului', () => {
  const c = load(), T = c.TTProbaTermen, EC = c.ExchangeCalendar, B = JSON.parse(readFileSync('candidate-engine/generated/trend-12-1-bilant.json', 'utf8'));
  const e = T.estimeaza(B);
  assert.equal(e.k, 20); assert.equal(e.necesare, 12); assert.equal(e.data, sesiuniUS(EC, B.de, 12 * 20));
  assert.match(e.text, /primul verdict posibil: ~\S+ 2027 \(12 perioade de 20 de sesiuni care nu se suprapun\)/);
  assert.match(e.text, /poate ieși „probat” în ~25 % din cazuri în 3 ani \(din protocol\)/); assert.doesNotMatch(e.text, /nescrisă/);
  const cuFerestre = T.estimeaza({ ...B, ferestre20: 3 }); assert.equal(cuFerestre.ramase, 9); assert.equal(cuFerestre.data, e.data, 'fără ultima fereastră datată, data rămâne de la începutul probei');
  const doarCampuri = T.estimeaza({ primulVerdict: { realist: '2027-06-30' } });
  assert.equal(doarCampuri.luna, 'iunie 2027'); assert.match(doarCampuri.text, /primul verdict posibil: ~iunie 2027/); assert.match(doarCampuri.text, /putere nescrisă/);
  assert.doesNotMatch(doarCampuri.text, /8 perioade/, 'fără protocolul probei nu se inventează numărul de perioade');
});
test('fișierele v2 (revizia F): principal 5 sesiuni la 30 de perioade, data din fișier, judecata unică, puterea la N cerut; umbra în R, la perioadele ei', () => {
  const T = load().TTProbaTermen;
  for (const j of [PM2, V12]) {
    const e = T.estimeaza(j); assert.equal(e.k, 5); assert.equal(e.necesare, 30); assert.equal(e.sursa, 'fișier'); assert.equal(e.data, j.primulVerdict.realist);
    assert.match(e.text, /~iunie 2027/); assert.match(e.text, /o singură judecată, la 30 perioade/); assert.match(e.text, /\+1,0 %\/perioadă l-ar vedea doar în 5\d % din cazuri/); assert.doesNotMatch(e.text, /nescrisă/);
  }
  const u = T.estimeaza(UMBRA2); assert.match(u.text, /\+0,3 R\/tranzacție l-ar vedea doar în 11 % din cazuri/, 'unitatea din fișier (R) și puterea la cele 8 perioade cerute, nu la 36'); assert.doesNotMatch(u.text, /%\/perioadă/);
});
