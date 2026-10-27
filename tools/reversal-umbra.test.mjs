// 19.10.2026 — I-716: stopul Early Reversal „în umbră” (docs/reversal-stop-umbra-protocol.md, scris ÎNAINTE de date).
// Mărimea testului e verificată pe prețuri ALEATORII fără avantaj (mulberry32, sămânță fixă) înainte de orice verdict; tot aici e
// dovada că testul semnelor ar fi mințit pe măsura asta (de aceea protocolul folosește t > 3,0).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROTOCOL, versiune, inregistrare, rezultat, tranzactii, evalueaza, bareZilnice, pasUmbra } from '../lib/reversal-umbra.mjs';
import { pSemne } from '../lib/v1-proba.mjs';
import { motor } from './premarket-jurnal.mjs';
import { versiune as versiunePm } from '../lib/premarket-proba.mjs';

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function zile(n) { const out = []; let d = Date.parse('2026-01-05T12:00:00Z'); while (out.length < n) { const x = new Date(d); if (x.getUTCDay() % 6) out.push(x.toISOString().slice(0, 10)); d += 86400000; } return out; }
const V = 'ru-test';

/** Lume FĂRĂ avantaj: fiecare candidat are 101 bare (80 de istoric, ziua semnalului, 20 după), drum intrazilnic martingal în `sub` pași.
    Perioada p începe la sesiunea 80 + 20·p; în ea 1…mMax candidați (revenirea din minim între 1 % și 35 %, ca lista Reversal). */
function lume(seed, { perioade = 24, mMax = 2, sub = 20 } = {}) {
  const rnd = mulberry32(seed), g = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const d = zile(80 + 20 * perioade + 21), bare = {}, jurnal = { zile: [] };
  let nr = 0;
  for (let p = 0; p < perioade; p++) {
    const s = 80 + 20 * p, m = 1 + Math.floor(rnd() * mMax), r = [];
    while (r.length < m) {
      const sig = 0.025 * (0.6 + 0.8 * rnd()), b = []; let px = 50;
      for (let i = 0; i < 101; i++) { const o = px * (1 + sig * 0.3 * g()); let h = o, l = o, x = o; for (let k = 0; k < sub; k++) { x *= 1 + sig / Math.sqrt(sub) * g(); h = Math.max(h, x); l = Math.min(l, x); } b.push({ d: d[s - 80 + i], o, h, l, c: x }); px = x; }
      const tr = []; for (let j = 1; j <= 80; j++) tr.push(Math.max(b[j].h - b[j].l, Math.abs(b[j].h - b[j - 1].c), Math.abs(b[j].l - b[j - 1].c)));
      let atr = tr.slice(0, 14).reduce((x, y) => x + y, 0) / 14; for (let j = 14; j < tr.length; j++) atr = (atr * 13 + tr[j]) / 14;
      const pret = b[80].c, min = Math.min(...b.slice(21, 81).map((x) => x.l)); if (pret / min - 1 < 0.01 || pret / min - 1 > 0.35) continue;
      const sym = 'R' + (nr++); bare[sym] = b;
      r.push([sym, d[s], pret, atr, min, pret - 1.25 * atr, min - 0.25 * atr, 50, 'WATCH']);
    }
    jurnal.zile.push({ zi: d[s], v: V, r });
  }
  return { jurnal, bare, sesiuni: d };
}
const bara = (d, o, h, l, c) => ({ d, o, h, l, c });

test('the day record keeps, for each Early Reversal candidate, both stops, ATR and the base low — read from what the engine already computed', () => {
  const st = { reversal: [
    { symbol: 'RTX', sourceDate: '2026-10-16', price: 110, atr: 4, metricB: 10, stop: 105, score: 61, state: 'WATCH' },
    { symbol: 'BAD', sourceDate: '2026-10-16', price: 50, atr: null, metricB: 5, stop: 48, score: 40, state: 'EARLY' }] };
  const r = inregistrare(st, 'ru-abc', '2026-10-16', Date.parse('2026-10-16T22:00:00Z'));
  assert.equal(r.zi, '2026-10-16'); assert.equal(r.v, 'ru-abc'); assert.equal(r.r.length, 1, 'fără ATR nu se poate nota');
  const [sym, d, intrare, atr, minBaza, stopAzi, stopBaza, scor, stare] = r.r[0];
  assert.deepEqual([sym, d, intrare, atr, scor, stare], ['RTX', '2026-10-16', 110, 4, 61, 'WATCH']);
  assert.ok(Math.abs(minBaza - 100) < 1e-9, 'minimul bazei = preț / (1 + revenirea din minim)');
  assert.equal(stopAzi, 105, 'stopul de azi = cel din planul motorului');
  assert.ok(Math.abs(stopBaza - 99) < 1e-9, 'stopul sub bază = minim − 0,25 × ATR');
  const gol = inregistrare({ reversal: [] }, 'ru-abc', '2026-10-17');
  assert.equal(gol.zi, '2026-10-17'); assert.deepEqual(gol.r, [], 'o zi fără candidați se notează și ea');
});

test('one trade, measured in R on daily bars: gap through the stop, stop before target in the same bar, target, time exit, not enough bars', () => {
  const k = { k: 3, tintaR: 2 };
  assert.equal(rezultat([bara('a', 10, 10, 10, 10), bara('b', 7, 8, 6, 7)], 'a', 10, 9, { k: 1, tintaR: 2 }).r, -3, 'deschiderea sub stop ⇒ ieșire la deschidere');
  const x = rezultat([bara('a', 10, 10, 10, 10), bara('b', 10, 13, 8.5, 12), bara('c', 12, 12, 12, 12), bara('d', 12, 12, 12, 12)], 'a', 10, 9, k);
  assert.equal(x.r, -1); assert.equal(x.iesire, 'stop', 'stop și țintă în aceeași bară ⇒ STOPUL');
  const y = rezultat([bara('a', 10, 10, 10, 10), bara('b', 10, 10.5, 9.5, 10), bara('c', 10, 12.2, 10, 12), bara('d', 12, 12, 12, 12)], 'a', 10, 9, k);
  assert.equal(y.r, 2); assert.equal(y.iesire, 'tinta'); assert.equal(y.sesiuni, 2);
  const z = rezultat([bara('a', 10, 10, 10, 10), bara('b', 10, 10.5, 9.5, 10), bara('c', 10, 10.5, 9.5, 10.2), bara('d', 10, 10.6, 9.6, 10.5)], 'a', 10, 9, k);
  assert.ok(Math.abs(z.r - 0.5) < 1e-9); assert.equal(z.iesire, 'timp');
  assert.equal(rezultat([bara('a', 10, 10, 10, 10), bara('b', 10, 10.5, 9.5, 10)], 'a', 10, 9, k), null, 'fără toate cele k sesiuni ⇒ încă fără rezultat');
  assert.equal(rezultat([bara('a', 10, 10, 10, 10)], 'z', 10, 9, k), null, 'ziua semnalului lipsește din bare');
  assert.equal(rezultat([bara('a', 10, 10, 10, 10), bara('b', 10, 10, 10, 10)], 'a', 10, 10, { k: 1, tintaR: 2 }), null, 'risc 0 ⇒ nu se măsoară');
});

test('the shadow fingerprint follows the rules that pick the Early Reversal list, and does not touch the Top Long fingerprint', () => {
  const f = { reversalScore() { return 'a'; }, analyze() { return 'b'; }, capSectors() { return 'c'; }, rankResults() { return 'e'; } };
  assert.match(versiune(f), /^ru-[0-9a-f]{12}$/); assert.equal(versiune(f), versiune({ ...f }));
  assert.notEqual(versiune({ ...f, reversalScore: () => 1 }), versiune(f));
  assert.throws(() => versiune({ ...f, reversalScore: undefined }), /reversalScore/);
  const cu = (eol) => { const fn = function () {}; fn.toString = () => ['function analyze() {', '  return 1;', '}'].join(eol); return { ...f, analyze: fn }; };
  assert.equal(versiune(cu('\r\n')), versiune(cu('\n')));
  const h = motor().hooks;
  assert.equal(typeof h.reversalScore, 'function', 'robotul expune reversalScore');
  assert.match(versiune(h), /^ru-[0-9a-f]{12}$/);
  // 27.10.2026: proba Top Long a repornit (premarket-proba-2, regula de judecată); umbra are amprenta ei, separată
  assert.match(versiunePm(h), /^pm-[0-9a-f]{12}$/); assert.notEqual(versiune(h).slice(3), versiunePm(h).slice(3));
});

test('the evaluation: fewer than 8 periods ⇒ wait; overlapping days are one period; only the current version counts', () => {
  const w = lume(5, { perioade: 6 });
  assert.equal(evalueaza(w.jurnal, w.bare, { versiune: V, sesiuni: w.sesiuni }).verdict, 'astept');
  const w2 = lume(6, { perioade: 9 });
  const z0 = w2.jurnal.zile[0], vecin = { ...z0, zi: w2.sesiuni[81], r: z0.r.map((x) => [x[0] + 'b', w2.sesiuni[81], ...x.slice(2)]) };
  for (const x of z0.r) w2.bare[x[0] + 'b'] = w2.bare[x[0]].map((b) => ({ ...b, d: w2.sesiuni[w2.sesiuni.indexOf(b.d) + 1] }));   /* aceeași acțiune, o sesiune mai târziu */
  const cu = { zile: [...w2.jurnal.zile, vecin].sort((a, b) => (a.zi < b.zi ? -1 : 1)) };
  const o = evalueaza(cu, w2.bare, { versiune: V, sesiuni: w2.sesiuni });
  assert.equal(o.perioade, 9, 'ziua de lângă prima perioadă nu e o perioadă nouă');
  assert.equal(o.necesare, 8); assert.equal(o.pragT, 3);
  const alta = { zile: w2.jurnal.zile.map((z) => ({ ...z, v: 'ru-alta' })) };
  assert.equal(evalueaza(alta, w2.bare, { versiune: V, sesiuni: w2.sesiuni }).perioade, 0, 'zilele altei versiuni nu intră');
  assert.ok(o.descriptiv.A.n > 0 && o.descriptiv.B.n === o.descriptiv.A.n);
  assert.ok(o.descriptiv.A.rataStop >= 0 && o.descriptiv.A.rataStop <= 1);
});

test('POWER (sanity): when the base stop clearly survives the dip that hits today’s stop, the verdict says so; the reverse never does', () => {
  const d = zile(400), bare = {}, j = { zile: [] }, inv = { zile: [] }, rnd = mulberry32(42);
  for (let p = 0; p < 10; p++) {
    const s = 80 + 20 * p, sym = 'P' + p, z = rnd() * 0.5;
    // intrare 100, ATR 4 ⇒ stop azi 95; minim 90 ⇒ stop bază 89; a doua zi coboară la 94 (lovește doar stopul de azi), apoi urcă la țintele bazei
    const b = []; for (let i = 0; i < 101; i++) b.push(bara(d[s - 80 + i], 100, 100, 100, 100));
    b[81] = bara(d[s + 1], 99, 99.5, 94 - z, 97); for (let i = 82; i < 101; i++) b[i] = bara(d[s - 80 + i], 100 + i - 82, 125, 99, 100 + i - 82);
    bare[sym] = b;
    j.zile.push({ zi: d[s], v: V, r: [[sym, d[s], 100, 4, 90, 95, 89, 50, 'WATCH']] });
    inv.zile.push({ zi: d[s], v: V, r: [[sym, d[s], 100, 4, 90, 89, 95, 50, 'WATCH']] });   /* rolurile inversate */
  }
  const o = evalueaza(j, bare, { versiune: V, sesiuni: d });
  assert.equal(o.perioade, 10); assert.ok(o.medieDif > 0); assert.equal(o.verdict, 'baza-ajuta');
  assert.equal(o.descriptiv.A.rataStop, 1); assert.equal(o.descriptiv.B.rataStop, 0);
  assert.equal(evalueaza(inv, bare, { versiune: V, sesiuni: d }).verdict, 'fara-avantaj');
});

test('SIZE: with no edge, “base stop helps” stays under 5% even re-judged after every new period (8…24); the sign test would lie', () => {
  const N = 300; let fals = 0, semne = 0, cu24 = 0;
  for (let s = 1; s <= N; s++) {
    const w = lume(9000 + s), z = w.jurnal.zile; let atins = false;
    for (let n = 8; n <= z.length; n++) {
      const o = evalueaza({ zile: z.slice(0, n) }, w.bare, { versiune: V, sesiuni: w.sesiuni });
      if (o.verdict === 'baza-ajuta') atins = true;
      // testul semnelor exact ca în probele V1 / Top Long: diferențele exact 0 (ex. ambele stopuri lovite, −1 R și −1 R) nu intră
      if (n === 24) { cu24++; const dif = o.difPerioade.filter((x) => x !== 0), poz = dif.filter((x) => x > 0).length; if (o.medieDif > 0 && pSemne(poz, dif.length) <= 0.05) semne++; }
    }
    if (atins) fals++;
  }
  assert.equal(cu24, N);
  assert.ok(fals / N <= 0.05, 'dovezi false cu t > 3,0: ' + (100 * fals / N).toFixed(1) + '%');
  assert.ok(semne / N > 0.05, 'testul semnelor ar fi dat dovezi false în ' + (100 * semne / N).toFixed(1) + '% la 24 de perioade');
});

test('the transactions only count with all 20 sessions after the signal; both stops are measured on the same entries', () => {
  const w = lume(77, { perioade: 3 });
  const t = tranzactii(w.jurnal, w.bare, V);
  assert.equal(t.length, w.jurnal.zile.reduce((a, z) => a + z.r.length, 0));
  for (const x of t) { assert.ok(Number.isFinite(x.rA) && Number.isFinite(x.rB)); assert.ok(x.rA >= -50 && x.rB <= 50); }
  const scurt = { ...w.bare }; const s0 = w.jurnal.zile[0].r[0][0]; scurt[s0] = scurt[s0].slice(0, 90);
  assert.equal(tranzactii(w.jurnal, scurt, V).length, t.length - 1);
});

test('the robot step: Yahoo bars become dated OHLC in the exchange time zone; the shadow journal and its evaluation are separate files', () => {
  const out = [{ t: Date.parse('2026-10-16T13:30:00Z'), o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }, { t: Date.parse('2026-10-16T22:30:00Z'), o: 1.5, h: 2, l: 1, c: 1.8, v: 10 }];
  Object.defineProperty(out, 'meta', { value: { timezone: 'America/New_York' } });
  assert.deepEqual(bareZilnice(out), [{ d: '2026-10-16', o: 1, h: 2, l: 0.5, c: 1.5 }, { d: '2026-10-16', o: 1.5, h: 2, l: 1, c: 1.8 }]);
  assert.equal(bareZilnice([{ t: 1, o: 1, h: 1, l: 1, c: 1 }]), null, 'fără fus orar nu se datează');
  const st = { reversal: [{ symbol: 'RTX', sourceDate: '2026-10-16', price: 110, atr: 4, metricB: 10, stop: 105, score: 61, state: 'WATCH' }] };
  const { jurnal, proba } = pasUmbra({ zile: [] }, st, 'ru-x', '2026-10-16', {}, ['2026-10-16'], Date.parse('2026-10-16T22:00:00Z'));
  assert.equal(jurnal.protocol, 'reversal-umbra-1'); assert.equal(jurnal.zile.length, 1);
  assert.equal(proba.protocol, 'reversal-umbra-1'); assert.equal(proba.scrisLa, '2026-10-19'); assert.equal(proba.versiune, 'ru-x');
  assert.equal(proba.azi.candidati, 1); assert.equal(proba.evaluare.verdict, 'astept');
  const y = readFileSync('.github/workflows/v1-proba.yml', 'utf8');
  assert.match(y, /reversal-umbra-jurnal\.json/); assert.match(y, /reversal-umbra-proba\.json/); assert.match(y, /tools\/reversal-umbra\.test\.mjs/);
  const src = readFileSync('tools/premarket-jurnal.mjs', 'utf8');
  assert.match(src, /reversal-umbra-jurnal\.json/); assert.match(src, /pasUmbra/);
});

test('I-743 / contract (27.10.2026): the shadow file carries the judge fingerprint and putere / primulVerdict / judecata (sequential, so not unique); the rules do NOT change', async () => {
  const { calendarSUA } = await import('../lib/proba-contract.mjs'), { amprentaJudecator } = await import('../lib/reversal-umbra.mjs'), cal = calendarSUA('.');
  const st = { reversal: [{ symbol: 'RTX', sourceDate: '2026-10-23', price: 110, atr: 4, metricB: 10, stop: 105, score: 61, state: 'WATCH' }] };
  const { proba } = pasUmbra({ zile: [] }, st, 'ru-x', '2026-10-23', {}, ['2026-10-23'], Date.parse('2026-10-23T22:00:00Z'), { cal, azi: '2026-10-27' });
  assert.match(amprentaJudecator(), /^ju-[0-9a-f]{12}$/); assert.equal(proba.judecator, amprentaJudecator());
  assert.deepEqual(proba.putere.laPlus.map((x) => [x.pct, x.putere, x.perioade]), [[0.3, 0.11, 8], [0.3, 0.27, 36]]); assert.equal(proba.putere.unitate, 'R pe tranzacție'); assert.match(proba.putere.text, /0,3 R/);
  assert.equal(proba.primulVerdict.optimist, (await import('../lib/proba-contract.mjs')).dupaSesiuni(cal, '2026-10-23', 8 * 20).zi);
  assert.deepEqual(proba.judecata, { la: 8, data: null, verdict: null, unic: false });
  assert.equal(PROTOCOL.id, 'reversal-umbra-1', 'umbra nu repornește: regulile ei nu s-au schimbat');
});
test('the protocol was written before the data and says what the code does', () => {
  const doc = readFileSync('docs/reversal-stop-umbra-protocol.md', 'utf8');
  assert.match(doc, /19\.10\.2026/); assert.match(doc, /t > 3,0/); assert.match(doc, /Minimum 8 perioade/i);
  assert.equal(PROTOCOL.id, 'reversal-umbra-1'); assert.equal(PROTOCOL.scrisLa, '2026-10-19');
  assert.equal(PROTOCOL.k, 20); assert.equal(PROTOCOL.atrAzi, 1.25); assert.equal(PROTOCOL.atrBaza, 0.25); assert.equal(PROTOCOL.tintaR, 2);
  assert.equal(PROTOCOL.perioadeMin, 8); assert.equal(PROTOCOL.pragT, 3);
  assert.ok(Object.isFrozen(PROTOCOL));
});
