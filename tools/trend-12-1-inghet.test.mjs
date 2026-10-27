// 27.10.2026 — revizia independentă a lotului F (🔴3): bilanțul Trend 12 luni aducea prețurile doar pe 2 ani ⇒ după ~10.2028 verdictul ar fi
// stat pe o fereastră alunecătoare de ~24 de ferestre, privită săptămânal ani la rând (mărimea simulată de revizor: 10,3 % în 5 ani, 19,5 % în
// 10, cu forma ferestrelor reale), iar „36 / 60 de ferestre” din protocol nu s-ar fi putut strânge. Acum: (1) prețurile pe un interval care
// acoperă prima zi a istoricului (intervalPentru: 2y → 5y → 10y) și (2) fiecare zi cu orizontul încheiat + 10 sesiuni de așteptare se
// ÎNGHEAȚĂ (randamentele ei) în candidate-engine/generated/trend-12-1-inghetat.jsonl, fișier care doar crește; bilanțul îl citește.
// Plus (I-764, cererea coordonatorului): mesajul Discord al bilanțului poartă la final eticheta „generat automat · neverificat de om”.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { bilant, mesajBilantDiscord, citesteInghetatTrend, ASTEPTARE } from './trend-12-1-lib.mjs';
import { ETICHETA_NEVERIFICAT } from './discord-mesaj.mjs';

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const T0 = Date.parse('2024-01-02T14:30:00Z');
function lume(seed, n = 760, nAct = 30) {
  const r = mulberry32(seed), g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const bare = (sd) => { const out = []; let p = 50; for (let i = 0; i < n; i++) { const o = p * (1 + 0.002 * g()); p = o * (1 + sd * g()); out.push({ t: T0 + i * 86400000, o, h: Math.max(o, p) * 1.01, l: Math.min(o, p) * 0.99, c: p, v: 1e6 }); } return out; };
  const preturi = { SPY: bare(0.01) }, simb = Array.from({ length: nAct }, (_, i) => 'A' + i); for (const s of simb) preturi[s] = bare(0.02);
  const zi = (i) => new Date(T0 + i * 86400000).toISOString().slice(0, 10), istoric = [];
  for (let i = 0; i < n - 1; i++) { const top = simb.filter(() => r() < 0.3).slice(0, 8); istoric.push({ d: zi(i), regim: true, n: nAct, top: top.map((s) => [s, 0.1]), univers: simb }); }
  return { preturi, istoric, zi };
}

test('o zi se îngheață abia după orizont + 10 sesiuni; rulată din nou, nu se mai scrie nimic', () => {
  const { preturi, istoric } = lume(1, 120);
  const a = bilant(istoric, preturi, { h: [20, 60], inghetate: [] });
  assert.ok(a.deIngheta.length > 0 && a.deIngheta.every((x) => x.tip === 'zi'), 'zilele încheiate se îngheață');
  const spyN = preturi.SPY.length; assert.ok(a.deIngheta.every((x) => istoric.findIndex((l) => l.d === x.d) + x.h + ASTEPTARE < spyN), 'doar zile cu orizont + 10 sesiuni scurse');
  const b = bilant(istoric, preturi, { h: [20, 60], inghetate: a.deIngheta });
  assert.equal(b.deIngheta.length, 0, 'aceleași zile nu se mai îngheață o dată'); assert.equal(b.t20, a.t20); assert.equal(b.ferestre20, a.ferestre20);
});
test('cu zilele vechi înghețate, prețuri pe 2 ani nu mai fac fereastra să alunece: aceleași ferestre și același t ca pe tot istoricul', () => {
  const { preturi, istoric } = lume(2), plin = bilant(istoric, preturi, { h: [20, 60], inghetate: [] });
  assert.ok(plin.ferestre20 >= 30, 'lumea are ' + plin.ferestre20 + ' ferestre');
  // a doua noapte, „Yahoo pe 2 ani”: acțiunile vin doar pe ultimele 500 de zile (SPY pe tot intervalul, cum cere intervalPentru)
  const scurt = Object.fromEntries(Object.entries(preturi).map(([s, b]) => [s, s === 'SPY' ? b : b.slice(-500)]));
  const fara = bilant(istoric, scurt, { h: [20, 60] }), cu = bilant(istoric, scurt, { h: [20, 60], inghetate: plin.deIngheta });
  assert.ok(fara.ferestre20 < plin.ferestre20, 'fără îngheț, ferestrele vechi ies din calcul (' + fara.ferestre20 + ' < ' + plin.ferestre20 + ')');
  assert.equal(cu.ferestre20, plin.ferestre20); assert.equal(cu.t20, plin.t20); assert.equal(cu.verdict, plin.verdict);
});
test('o acțiune dispărută după înghețare nu mai schimbă nimic; SPY care nu mai acoperă o zi înghețată oprește bilanțul (închis la eroare)', () => {
  const { preturi, istoric } = lume(3), plin = bilant(istoric, preturi, { h: [20, 60], inghetate: [] });
  const fara = { ...preturi }; delete fara.A0; delete fara.A1;
  // zilele înghețate (toate, mai puțin ultimele orizont + 10 sesiuni, care sunt încă „vii” prin construcție) nu se mai mișcă deloc
  const gata = new Set(plin.deIngheta.filter((x) => x.h === 20).map((x) => x.d)), vechi = istoric.filter((l) => gata.has(l.d));
  const a = bilant(vechi, preturi, { h: [20], inghetate: plin.deIngheta }), n = bilant(vechi, fara, { h: [20], inghetate: plin.deIngheta });
  assert.ok(a.ferestre20 >= 30); assert.equal(n.t20, a.t20); assert.deepEqual(n.diferenta20, a.diferenta20); assert.deepEqual(n.nejudecate, a.nejudecate);
  const live = bilant(vechi, fara, { h: [20] }); assert.notDeepEqual(live.nejudecate, a.nejudecate, 'fără îngheț, dispariția s-ar fi văzut (nejudecate noi)');
  assert.throws(() => bilant(istoric, { ...preturi, SPY: preturi.SPY.slice(-300) }, { h: [20, 60], inghetate: plin.deIngheta }), /SPY nu acoperă/);
});
test('fișierul înghețat Trend: o linie JSON pe zi, citit înapoi identic', () => {
  const { preturi, istoric } = lume(4, 120), a = bilant(istoric, preturi, { h: [20, 60], inghetate: [] });
  assert.deepEqual(citesteInghetatTrend(a.deIngheta.map((x) => JSON.stringify(x)).join('\n') + '\n'), JSON.parse(JSON.stringify(a.deIngheta))); assert.deepEqual(citesteInghetatTrend(''), []);
});
test('garda: trend-12-1-inghetat.jsonl doar crește față de ultimul commit', () => {
  const f = 'candidate-engine/generated/trend-12-1-inghetat.jsonl';
  let vechi = null; try { vechi = execFileSync('git', ['show', 'HEAD:' + f], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).replace(/\r\n/g, '\n'); } catch { return; }
  const azi = existsSync(f) ? readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : ''; assert.ok(azi.startsWith(vechi), f + ' a fost rescris, nu doar crescut');
});
test('robotul bilanțului: prețuri pe intervalul care acoperă istoricul, fișierul înghețat citit și crescut, fluxul îl salvează și îl păzește', () => {
  const s = readFileSync('tools/trend-12-1-bilant.mjs', 'utf8');
  assert.doesNotMatch(s, /range=2y/, 'nu mai e fix pe 2 ani'); assert.match(s, /intervalPentru\(/); assert.match(s, /trend-12-1-inghetat\.jsonl/); assert.match(s, /appendFileSync\(F_INGHETAT/);
  assert.match(s, /mesajBilantDiscord\(/, 'Discord primește mesajul cu eticheta');
  const y = readFileSync('.github/workflows/trend-12-1-bilant.yml', 'utf8'); assert.match(y, /trend-12-1-inghetat\.jsonl/); assert.match(y, /tools\/trend-12-1-inghet\.test\.mjs/);
});
test('I-764: mesajul Discord al bilanțului Trend se încheie cu eticheta „neverificat de om”, pe rând separat; fără mesaj, nimic', () => {
  const out = { verdict: 'probat față de alte acțiuni', n20: 300, ferestre20: 14, diferenta20: { medie: 0.012 } };
  const m = mesajBilantDiscord({ verdict: 'în probă' }, out); assert.ok(m.endsWith('\n-# ' + ETICHETA_NEVERIFICAT), m); assert.equal(m.split(ETICHETA_NEVERIFICAT).length, 2);
  assert.equal(mesajBilantDiscord({ verdict: 'probat față de alte acțiuni' }, out), '', 'verdict neschimbat ⇒ nimic de trimis, nici eticheta');
});
test('I-764: mesajul Discord al bilanțului Top Long se încheie cu eticheta „neverificat de om”, pe rând separat', async () => {
  const { decide, mesaj } = await import('./premarket-bilant.mjs');
  const p = { versiune: 'pm-x', ultimaRulare: '2026-11-02T21:50:00Z', orizonturi: [{ k: 5, principal: true, perioade: 3, necesare: 16, medieDif: 0.004, ultimaPerioada: { zi: '2026-11-01' }, verdict: 'astept' }, { k: 20, perioade: 1, necesare: null, medieDif: -0.01, ultimaPerioada: { zi: '2026-10-28' }, verdict: 'monitorizare' }] };
  const d = decide(p, null, Date.parse('2026-11-03T08:00:00Z'));
  assert.ok(d.trimite && d.mesaj.endsWith('\n-# ' + ETICHETA_NEVERIFICAT), d.mesaj); assert.ok(!mesaj(p, Date.parse('2026-11-03T08:00:00Z')).includes(ETICHETA_NEVERIFICAT), 'textul bilanțului rămâne curat; eticheta se pune la trimitere');
});
