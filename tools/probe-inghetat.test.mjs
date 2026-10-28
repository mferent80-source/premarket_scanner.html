// 27.10.2026 — revizia independentă a lotului F (🔴2): judecata „unică” se recalcula în fiecare noapte din seriile aduse atunci, deci se
// putea schimba DUPĂ ce fusese dată (o acțiune dispărută de la Yahoo: 1,2–1,6 % din lumi; o noapte cu SPY pe 6 luni: 6,1 %). Acum fiecare
// perioadă se ÎNGHEAȚĂ (cu randamentele ei) când s-au scurs orizontul + cele 10 sesiuni de așteptare, judecata se scrie O SINGURĂ DATĂ, iar
// ambele stau în fișiere care doar cresc (scanner-verdicts/generated/v1-inghetat.jsonl, premarket-inghetat.jsonl); evaluarea de noapte le
// citește, nu le mai recalculează.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PROTOCOL, simuleaza, evalueaza, ingheata, citesteInghetat, liniiInghetat } from '../lib/v1-proba.mjs';
import { evalueaza as evalueazaPm } from '../lib/premarket-proba.mjs';
import { BAZA } from './git-baza.mjs';   // 28.10.2026 (revizia F2, 🔵12): commitul de dinaintea push-ului în poartă, altfel HEAD

const N = 16, k = 5;
/** O noapte a robotului: jurnalul și seriile tăiate la ziua t, evaluarea cu fișierul înghețat de până atunci; întoarce fișierul crescut. */
function noapte(lume, t, inghetate, { serii = lume.serii, judecaLa = N } = {}) {
  const zi = lume.sesiuni[t], jurnal = { zile: lume.jurnal.zile.filter((z) => z.zi <= zi) };
  const s = Object.fromEntries(Object.entries(serii).map(([x, a]) => [x, a.filter((b) => b.d <= zi)])), ses = (s.SPY || []).map((b) => b.d);
  const o = evalueaza(jurnal, s, { k, versiune: lume.versiune, sesiuni: ses, judecaLa, inghetate });
  return { o, inghetate: inghetate.concat(o.deScris) };
}
const lumeH0 = (seed) => simuleaza(seed, { k, perioade: N + 12, avantaj: 0, verificate: 40, sus: 10 });

test('o perioadă se îngheață abia după orizont + 10 sesiuni (atunci fiecare rând e definitiv) și se scrie o singură dată', () => {
  const lume = lumeH0(11);
  let f = []; const t0 = k + PROTOCOL.asteptare - 1;
  ({ inghetate: f } = noapte(lume, t0, f)); assert.equal(f.length, 0, 'la k + 9 sesiuni nimic înghețat');
  let r = noapte(lume, t0 + 1, f); assert.equal(r.o.deScris.length, 1, 'la k + 10 sesiuni prima perioadă se îngheață'); f = r.inghetate;
  const p = f[0]; assert.equal(p.tip, 'perioada'); assert.equal(p.k, k); assert.equal(p.zi, lume.sesiuni[0]); assert.equal(p.inchisa, lume.sesiuni[k]); assert.equal(p.inghetata, lume.sesiuni[k + 10]);
  assert.ok(Number.isFinite(p.dif) && Array.isArray(p.r) && p.r.length === 40, 'perioada își poartă randamentele');
  r = noapte(lume, t0 + 1, f); assert.equal(r.o.deScris.length, 0, 'aceeași noapte rulată din nou nu mai scrie nimic');
});
test('noapte de noapte = o singură dată pe tot: aceleași perioade înghețate, aceeași judecată (eșantion fix)', () => {
  const lume = lumeH0(12), n = lume.sesiuni.length;
  let f = []; for (let t = 0; t < n; t++) f = noapte(lume, t, f).inghetate;
  const tot = noapte(lume, n - 1, []).inghetate, fel = (a, t) => a.filter((x) => x.tip === t).map((x) => JSON.stringify(x));
  assert.deepEqual(fel(f, 'perioada'), fel(tot, 'perioada'), 'aceleași perioade, în aceeași ordine');
  assert.deepEqual(fel(f, 'judecata'), fel(tot, 'judecata'), 'aceeași judecată (noaptea o scrie imediat după a N-a perioadă înghețată)');
  const j = f.filter((x) => x.tip === 'judecata'); assert.equal(j.length, 1, 'o singură judecată'); assert.equal(j[0].la, N); assert.equal(j[0].perioade.length, N);
  assert.equal(f.indexOf(j[0]), f.filter((x) => x.tip === 'perioada').findIndex((x) => x.zi === j[0].perioade[N - 1]) + 1, 'scrisă în noaptea în care s-a înghețat a N-a perioadă');
});
test('după judecată: o acțiune dispărută de la Yahoo, o serie scurtă sau o noapte cu SPY pe 6 luni NU mai schimbă nimic', () => {
  let schimbat = 0;
  for (let w = 0; w < 40; w++) {
    const lume = lumeH0(500 + w), n = lume.sesiuni.length;
    const { o, inghetate } = noapte(lume, n - 1, []); assert.ok(o.judecata.verdict, 'lumea are judecata');
    const fara = { ...lume.serii }; delete fara['S' + (w % 40)];
    const scurt = { ...lume.serii, S1: lume.serii.S1.slice(0, 20) }, spy6 = { ...lume.serii, SPY: lume.serii.SPY.slice(-40) };
    for (const serii of [fara, scurt, spy6]) {
      const b = noapte(lume, n - 1, inghetate, { serii });
      if (b.o.judecata.verdict !== o.judecata.verdict || b.o.p !== o.p || b.o.perioade < o.perioade || b.o.deScris.some((x) => x.tip === 'judecata')) schimbat++;
    }
  }
  assert.equal(schimbat, 0, 'judecata scrisă rămâne, oricum ar arăta datele aduse după ea');
});
test('judecata scrisă are întâietate; o recalculare diferită apare doar ca abatere, la vedere', () => {
  const lume = lumeH0(13), n = lume.sesiuni.length, { o, inghetate } = noapte(lume, n - 1, []);
  const falsa = inghetate.map((x) => (x.tip === 'judecata' ? { ...x, verdict: x.verdict === 'ajuta' ? 'fara-avantaj' : 'ajuta' } : x));
  const b = noapte(lume, n - 1, falsa).o;
  assert.equal(b.judecata.verdict, falsa.find((x) => x.tip === 'judecata').verdict, 'verdictul scris rămâne'); assert.ok(b.abatereJudecata && b.abatereJudecata.verdict === o.judecata.verdict, 'recalcularea diferită se vede');
});
test('fără judecată la un orizont (doar monitorizare): perioadele se îngheață, dar nu se scrie nicio judecată', () => {
  const lume = lumeH0(14), n = lume.sesiuni.length, { o, inghetate } = noapte(lume, n - 1, [], { judecaLa: null });
  assert.equal(o.verdict, 'monitorizare'); assert.equal(o.judecata.verdict, null); assert.ok(inghetate.length > N && inghetate.every((x) => x.tip === 'perioada'));
});
test('Top Long folosește același îngheț (grupul SUS = în Top Long)', () => {
  const lume = simuleaza(15, { k, perioade: N + 12, verificate: 40, sus: 10, cod: 'top' }), n = lume.sesiuni.length;
  const o = evalueazaPm(lume.jurnal, lume.serii, { k, versiune: lume.versiune, sesiuni: lume.sesiuni, judecaLa: N, inghetate: [] });
  assert.ok(o.deScris.length > N && o.deScris.some((x) => x.tip === 'judecata')); assert.equal(o.descriptiv.indeplineste, undefined);
});
test('fișierul înghețat: o linie JSON pe înregistrare, citit înapoi identic', () => {
  const lume = lumeH0(16), { inghetate } = noapte(lume, lume.sesiuni.length - 1, []);
  const text = liniiInghetat(inghetate); assert.ok(text.endsWith('\n')); assert.deepEqual(citesteInghetat(text), JSON.parse(JSON.stringify(inghetate)));
  assert.deepEqual(citesteInghetat(''), []);
});
// garda „doar crește” (ca jurnalul clasificatorului, I-669): fiecare fișier din ultimul commit e începutul exact al celui de pe disc
for (const f of ['scanner-verdicts/generated/v1-inghetat.jsonl', 'scanner-verdicts/generated/premarket-inghetat.jsonl']) {
  test('garda: ' + f + ' doar crește față de ultimul commit (perioadele și judecata nu se rescriu)', () => {
    let vechi = null; try { vechi = execFileSync('git', ['show', BAZA + ':' + f], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).replace(/\r\n/g, '\n'); } catch { return; }
    const azi = existsSync(f) ? readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : ''; assert.ok(azi.startsWith(vechi), f + ' a fost rescris, nu doar crescut');
    assert.ok(citesteInghetat(azi).every((x) => (x.tip === 'perioada' || x.tip === 'judecata') && /^v1-|^pm-/.test(x.v)));
  });
}
test('constructorul fișierului probei V1: cu fișierul înghețat dă liniile noi separat; orizonturile din fișier nu le poartă', async () => {
  const { continutProba } = await import('./v1-jurnal.mjs'), { calendarSUA } = await import('../lib/proba-contract.mjs');
  const lume = lumeH0(17), last = lume.sesiuni.at(-1), rec = { zi: last, la: last + 'T22:00:00Z', r: [] };
  const j = continutProba({ jurnal: lume.jurnal, V: lume.versiune, rec, report: { verifiedCount: 40, items: [] }, serii: lume.serii, sesiuni: lume.sesiuni, cal: calendarSUA('.'), azi: '2026-10-27', inghetate: [] });
  assert.ok(j.deScris.length > 0 && j.deScris.every((x) => x.la === rec.la)); assert.ok(j.orizonturi.every((o) => !('deScris' in o)), 'fișierul probei nu duce perioadele înghețate');
  assert.equal(j.orizonturi.find((o) => o.k === 5).perioade, j.deScris.filter((x) => x.tip === 'perioada' && x.k === 5 && !x.exclusa).length, 'perioadele numărate = cele înghețate');
});
test('roboții citesc fișierul înghețat și scriu doar ce e nou (append), iar fluxul îl salvează', () => {
  for (const [r, f] of [['tools/v1-jurnal.mjs', 'v1-inghetat.jsonl'], ['tools/premarket-jurnal.mjs', 'premarket-inghetat.jsonl']]) {
    const s = readFileSync(r, 'utf8'); assert.ok(s.includes(f), r); assert.match(s, /appendFileSync\(INGHETAT/); assert.match(s, /inghetate/);
  }
  const y = readFileSync('.github/workflows/v1-proba.yml', 'utf8'); assert.match(y, /v1-inghetat\.jsonl/); assert.match(y, /premarket-inghetat\.jsonl/); assert.match(y, /tools\/probe-inghetat\.test\.mjs/);
});
