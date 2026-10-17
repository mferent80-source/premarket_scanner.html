import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { motor } from './clasificator-date.mjs';
import { ruleaza, valideaza, compara, martorNasdaq, motivEsec, dosarUmbra, FISIER } from './clasificator-robot.mjs';
import { DIR, ISTORIC, PROBA, citeste } from './clasificator-jurnal.mjs';

const now = Date.parse('2026-10-07T22:00:00Z');
test('I-638: robotul clasifică, rezumă ca pagina și pune pe listă ce pică', async () => {
  const c = motor('.', ['lib/desk-classifier.js']), N = c.HoldingsNeural;
  const sursa = async (s) => { if (s === 'RAU') throw new Error('Salt zilnic peste 25%'); const bars = N.demoBars(s === 'B' ? 2 : 0, now); return { asOf: '2026-10-07', timezone: 'America/New_York', closeMinutes: 960, bars }; };
  const j = await ruleaza({ c, simboluri: ['A', 'B', 'RAU'], sursa, now });
  assert.match(j.univers.eroare, /Prea puține simboluri/); // sub 10 simboluri modelul comun nu se antrenează, fișierul rămâne valabil
  assert.deepEqual(valideaza(j, c.HoldingsClassifier.VERSION), []);
  assert.equal(Object.keys(j.entries).length, 2); assert.equal(j.picate[0].simbol, 'RAU'); assert.equal(j.asOf, '2026-10-07');
  // Pagina acceptă fișierul doar pe sesiunea așteptată și cu același motor.
  c.DailySeries.expected = () => '2026-10-07';
  assert.equal(c.TTDeskClassifier.acceptRobot(JSON.parse(JSON.stringify(j))), 2); assert.equal(c.TTDeskClassifier.get('A').source, 'robot');
  assert.equal(c.TTDeskClassifier.acceptRobot({ ...j, motor: 'holdings-clf-v1' }), 0);
  const stricat = JSON.parse(JSON.stringify(j)); stricat.entries.A.algos.vote.support = [1, 1, 1]; assert.notDeepEqual(valideaza(stricat), []);
  // I-664 / I-670: durata și ultimele nopți ajung în fișier.
  assert.ok(Number.isFinite(j.durata.minute)); assert.equal(j.durata.timpDepasit, 0); assert.equal(j.nopti.length, 10); assert.equal(j.nopti.at(-1).zi, '2026-10-07');
});

// Înainte de generare (și în suita locală) doar forma; motorul paginii se cere doar DUPĂ generare (GARDA_FISIER=1 în workflow),
// altfel o urcare de versiune a motorului ar opri robotul înainte să refacă fișierul.
test('garda: fișierul publicat (dacă există) are forma bună (și, după generare, motorul paginii)', () => {
  if (!existsSync(FISIER)) return;
  const c = motor('.'); assert.deepEqual(valideaza(JSON.parse(readFileSync(FISIER, 'utf8')), process.env.GARDA_FISIER ? c.HoldingsClassifier.VERSION : undefined), []);
});
// I-669: jurnalul doar crește — fiecare fișier din ultimul commit trebuie să fie începutul exact al celui de pe disc; nimic șters.
// Fișierul vechi (până la 17.10) trebuie să se regăsească întreg în dosarul nou, dacă mai e în commit.
test('I-669: jurnalul doar crește (față de ultimul commit)', () => {
  let urmarite; try { urmarite = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', '--', DIR, ISTORIC], { encoding: 'utf8' }).split('\n').filter(Boolean); } catch { return; } // fără git: nimic de comparat
  const azi = (p) => (existsSync(p) ? readFileSync(p, 'utf8').replace(/\r\n/g, '\n') : null), ieri = (p) => execFileSync('git', ['show', 'HEAD:' + p], { encoding: 'utf8' }).replace(/\r\n/g, '\n');
  for (const p of urmarite) {
    if (p === ISTORIC) { const toate = new Set(readdirSync(DIR, { recursive: true }).filter((f) => /voturi-.*\.jsonl$/.test(f)).flatMap((f) => azi(DIR + '/' + f.replace(/\\/g, '/')).split('\n').filter(Boolean))); for (const l of ieri(p).split('\n').filter(Boolean)) assert.ok(toate.has(l), 'linia veche lipsește din jurnalul nou: ' + l.slice(0, 60)); continue; }
    const a = azi(p); assert.ok(a !== null, 'fișier șters din jurnal: ' + p); assert.ok(a.startsWith(ieri(p)), 'fișier rescris (nu doar crescut): ' + p);
  }
});
test('I-658: universul lărgit — rezumatele complete doar pentru scanner; clasamentul și jurnalul pe tot universul; limita de timp', async () => {
  const c = motor('.', ['lib/desk-classifier.js']), N = c.HoldingsNeural;
  const sursa = async (s) => ({ asOf: '2026-10-07', timezone: 'America/New_York', closeMinutes: 960, bars: N.demoBars(s.charCodeAt(0) % 5, now) });
  const j = await ruleaza({ c, simboluri: ['A', 'B', 'C'], scanner: new Set(['A']), sursa, now, comun: false });
  assert.deepEqual(Object.keys(j.entries), ['A']); assert.equal(j.clasificate, 3); assert.equal(j.clasament.length, 3);
  assert.deepEqual(valideaza(j, c.HoldingsClassifier.VERSION), []);
  assert.equal(j.jurnalNou.voturi.length, 1); assert.equal(Object.keys(j.jurnalNou.voturi[0].voturi).length, 3); // jurnalul are toate voturile
  assert.equal(j.jurnalNou.voturi[0].motor, c.HoldingsClassifier.VERSION);
  // A doua rulare din aceeași zi nu mai notează (votul e înghețat).
  const j2 = await ruleaza({ c, simboluri: ['A'], sursa, now, comun: false, jurnal: { voturi: j.jurnalNou.voturi, rezultate: [] } }); assert.equal(j2.jurnalNou.voturi.length, 0);
  // Revizia 17.10: o rulare ulterioară completează acțiunile care lipseau (linie separată, cu ora ei).
  const j3 = await ruleaza({ c, simboluri: ['A', 'D'], sursa, now, comun: false, jurnal: { voturi: j.jurnalNou.voturi, rezultate: [] } }); assert.deepEqual(Object.keys(j3.jurnalNou.voturi[0].voturi), ['D']); assert.equal(j3.jurnalNou.voturi[0].completare, true);
  const t = await ruleaza({ c, simboluri: ['A', 'B'], sursa, now, comun: false, minute: -1 });
  assert.equal(t.clasificate, 0); assert.match(t.picate[0].motiv, /Timp depășit/); assert.equal(t.durata.timpDepasit, 2);
});
test('I-666: când Yahoo întârzie bara zilei, robotul așteaptă și reia doar acțiunile vechi', async () => {
  const c = motor('.', ['lib/desk-classifier.js']), N = c.HoldingsNeural; let tura = 0; const cereri = [];
  const sursa = async (s) => { cereri.push(s); if (tura === 0) throw new Error('DATE STALE: 2026-10-06; sesiune așteptată 2026-10-07. Verifică disponibilitatea sursei și calendarul pieței.'); return { asOf: '2026-10-07', timezone: 'America/New_York', closeMinutes: 960, bars: N.demoBars(1, now) }; };
  const log = (m) => { if (/reiau peste/.test(m)) tura = 1; };
  const j = await ruleaza({ c, simboluri: ['A', 'B', 'C'], sursa, now, comun: false, log, reia: { asteapta: 0, incercari: 3 } });
  assert.equal(j.clasificate, 3); assert.equal(j.picate.length, 0); assert.equal(j.durata.reluari, 1); assert.deepEqual(cereri, ['A', 'B', 'C', 'A', 'B', 'C']);
  // Dacă rămân vechi după toate reluările, motivul spune cauza.
  const k = await ruleaza({ c, simboluri: ['A', 'B'], sursa: async () => { throw new Error('DATE STALE: 2026-10-06; sesiune așteptată 2026-10-07.'); }, now, comun: false, reia: { asteapta: 0, incercari: 2 } });
  assert.equal(k.durata.reluari, 2); assert.match(motivEsec(k), /Yahoo n-a publicat încă bara de 2026-10-07 pentru 2 din 2 acțiuni \(după 2 reluări/);
});
test('I-674: motorul al doilea notează doar jurnalul lui, sub versiunea lui', async () => {
  const d = mkdtempSync(tmpdir() + '/umbra-'); try {
    mkdirSync(d + '/lib', { recursive: true }); for (const f of readdirSync('lib')) if (f.endsWith('.js')) writeFileSync(d + '/lib/' + f, readFileSync('lib/' + f));
    mkdirSync(d + '/tools/motoare/holdings-clf-test', { recursive: true });
    writeFileSync(d + '/tools/motoare/holdings-clf-test/holdings-classifier.js', readFileSync('lib/holdings-classifier.js', 'utf8').replace(/VERSION='holdings-clf-v\d+'/, "VERSION='holdings-clf-test'"));
    const pagina = motor('.').HoldingsClassifier.VERSION, du = dosarUmbra(d, pagina); assert.equal(du, 'tools/motoare/holdings-clf-test');
    const c = motor(d, ['lib/desk-classifier.js'], { 'lib/holdings-classifier.js': du + '/holdings-classifier.js' }), N = c.HoldingsNeural;
    const j = await ruleaza({ c, simboluri: ['A'], sursa: async () => ({ asOf: '2026-10-07', timezone: 'America/New_York', closeMinutes: 960, bars: N.demoBars(1, now) }), now, umbra: true });
    assert.equal(j.motor, 'holdings-clf-test'); assert.equal(j.jurnalNou.voturi[0].motor, 'holdings-clf-test'); assert.equal(j.entries, undefined); assert.deepEqual(j.jurnalNou.rezultate, []);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
test('I-675: martorul compară închiderea zilei cu a doua sursă; o sursă căzută nu oprește nimic', async () => {
  const dateOf = (t) => new Date(t).toISOString().slice(0, 10), b = [{ t: Date.parse('2026-10-07T13:30:00Z'), c: 100 }];
  assert.deepEqual(compara(b, { '2026-10-07': 100.2 }, '2026-10-07', dateOf), { yahoo: 100, nasdaq: 100.2, dif: -0.2, abatere: false });
  assert.equal(compara(b, { '2026-10-07': 98 }, '2026-10-07', dateOf).abatere, true); assert.equal(compara(b, {}, '2026-10-07', dateOf), null);
  const m = martorNasdaq(new Map([['AAA', 2], ['BBB', 1]]), { aduN: async (s) => { if (s === 'BBB') throw new Error('403'); return { '2026-10-07': 90 }; } });
  const r = await m({ asOf: '2026-10-07' }, { AAA: b, BBB: b, 'BRK-B': b }, dateOf);
  assert.equal(r.verificate, 1); assert.equal(r.indisponibile, 1); assert.equal(r.abateri[0].s, 'AAA');
});
test('jurnalul publicat (dacă există) se citește; motorul în probă are linii doar dacă e notat', () => {
  if (!existsSync(DIR)) return;
  for (const f of readdirSync(DIR, { recursive: true }).map((x) => x.replace(/\\/g, '/')).filter((x) => x.endsWith('.jsonl'))) for (const l of citeste(readFileSync(DIR + '/' + f, 'utf8'))) { assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(l.asOf), f); assert.ok(f.startsWith((l.motor || l.m) + '/'), 'linia stă în dosarul motorului ei: ' + f); }
  assert.ok(typeof PROBA === 'string');
});
