// I-661 + I-673 (17.10.2026) — motorul și regulile probei, înghețate cât durează proba înainte.
// Motorul: amprenta fișierului lib/holdings-classifier.js și amprenta rezultatelor lui pe serii fixe trebuie să stea în
// docs/clasificator-versiuni.md, pe rândul versiunii curente. Rezultate diferite ⇒ versiune nouă (numărătoarea repornește);
// același rezultat cu fișier schimbat (comentarii, ordine) ⇒ ajunge un rând nou pe aceeași versiune.
// Regulile: pragurile din tools/clasificator-jurnal.mjs (PRAG, PROBA) trebuie să fie cele din docs/clasificator-protocol.md.
// Testul nu rulează în robotul de noapte (o diferență de platformă nu are voie să oprească notarea); îl rulează suita locală.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { motor } from './clasificator-date.mjs';
import { amprentaFisier, amprentaRezultate, registru } from './clasificator-amprenta.mjs';
import { PRAG, PROBA } from './clasificator-jurnal.mjs';
import { BAZA } from './git-baza.mjs';   // 28.10.2026 (revizia F2, 🔵12): commitul de dinaintea push-ului în poartă, altfel HEAD

test('I-661: motorul e cel din registru (versiune + amprenta fișierului + amprenta rezultatelor)', () => {
  const c = motor('.'), V = c.HoldingsClassifier.VERSION, rows = registru(readFileSync('docs/clasificator-versiuni.md', 'utf8')).filter((r) => r.versiune === V);
  assert.ok(rows.length, `Versiunea ${V} nu e în docs/clasificator-versiuni.md — scrie rândul (data, amprentele, motivul).`);
  const f = amprentaFisier(), r = amprentaRezultate(c);
  for (const x of rows) assert.equal(x.rezultate, r, `Rezultatele motorului s-au schimbat față de registru (${x.rezultate} → ${r}) fără versiune nouă. Urcă VERSION în lib/holdings-classifier.js și scrie rândul nou: proba pornește de la zero pentru noua versiune (sau ține-o pe cea veche în tools/motoare/, I-674).`);
  assert.ok(rows.some((x) => x.fisier === f), `Fișierul motorului s-a schimbat (amprenta ${f}) cu aceleași rezultate: adaugă un rând pe versiunea ${V} cu noua amprentă și motivul.`);
});
test('I-661: robotul notează doar cu un motor înregistrat (amprenta fișierelor)', async () => {
  const { inregistrat, amprentaFisier: af } = await import('./clasificator-amprenta.mjs'), V = motor('.').HoldingsClassifier.VERSION;
  assert.equal(inregistrat('.', V, af()), true); assert.equal(inregistrat('.', V, '0000000000000000'), false);
});
test('I-674: dacă pagina are alt motor decât cel în probă, motorul în probă rulează ca al doilea (tools/motoare/)', () => {
  const V = motor('.').HoldingsClassifier.VERSION; if (V === PROBA) return;
  const f = `tools/motoare/${PROBA}/holdings-classifier.js`; assert.ok(existsSync(f), `Motorul în probă (${PROBA}) nu mai rulează: copiază-l în ${f}.`);
  assert.match(readFileSync(f, 'utf8'), new RegExp(`VERSION='${PROBA}'`));
});
test('I-673: regulile de judecată din cod sunt cele din protocol', () => {
  const t = readFileSync('docs/clasificator-protocol.md', 'utf8'), m = /<!-- reguli -->\s*```json\s*([\s\S]*?)```/.exec(t);
  assert.ok(m, 'Blocul de reguli lipsește din docs/clasificator-protocol.md.');
  assert.deepEqual(JSON.parse(m[1]), { PROBA, PRAG: { ...PRAG } }, 'PRAG / PROBA diferă de protocol: o schimbare de regulă se scrie întâi în protocol (data, motivul), cu proba încă fără rezultate.');
});
// Revizia din 17.10: garda nu trebuie să poată fi ocolită din greșeală.
test('I-661: registrul versiunilor doar crește (niciun rând din ultimul commit nu dispare)', async () => {
  const { execFileSync } = await import('node:child_process'); let vechi; try { vechi = execFileSync('git', ['show', BAZA + ':docs/clasificator-versiuni.md'], { encoding: 'utf8' }); } catch { return; }
  const azi = new Set(registru(readFileSync('docs/clasificator-versiuni.md', 'utf8')).map((r) => JSON.stringify(r)));
  for (const r of registru(vechi)) assert.ok(azi.has(JSON.stringify(r)), 'rând șters sau schimbat în registru: ' + r.versiune + ' ' + r.fisier);
});
test('I-673: protocolul nu se schimbă după primul rezultat al motorului în probă', async () => {
  const { readdirSync } = await import('node:fs'), { DIR, citeste } = await import('./clasificator-jurnal.mjs'), d = DIR + '/' + PROBA;
  const ist = /## Istoria protocolului([\s\S]*?)(\n## |$)/.exec(readFileSync('docs/clasificator-protocol.md', 'utf8'))?.[1] || '', date = [...ist.matchAll(/\*\*(\d{2})\.(\d{2})\.(\d{4})\*\*/g)].map((m) => `${m[3]}-${m[2]}-${m[1]}`).sort();
  assert.ok(date.length, 'Istoria protocolului fără date.');
  if (!existsSync(d)) return;
  // 27.10.2026: un rezultat se SCRIE abia după h sesiuni de la ziua votului (asOf) — regula „nu după primul rezultat” se măsoară pe data scrierii
  // (asOf + h sesiuni SUA), nu pe data votului; altfel reviziile din 17.10 (făcute fără niciun rezultat) picau testul din 24.10, când s-a notat primul rezultat.
  const rez = readdirSync(d).filter((f) => f.startsWith('rezultate-')).flatMap((f) => citeste(readFileSync(d + '/' + f, 'utf8'))).filter((r) => r && /^\d{4}-\d{2}-\d{2}$/.test(r.asOf));
  const cal = motor('.').ExchangeCalendar, scris = (r) => { let zi = r.asOf; for (let i = 0; i < (Number(r.h) || 0); i++) { const s = cal.next(zi, 'US'); if (!s || !s.day) return zi; zi = s.day; } return zi; };
  const prim = rez.map((r) => ({ vot: r.asOf, scris: scris(r) })).sort((a, b) => (a.scris < b.scris ? -1 : a.scris > b.scris ? 1 : 0))[0];
  if (prim) assert.ok(date.at(-1) <= prim.scris, `Protocolul a fost schimbat (${date.at(-1)}) după primul rezultat (scris pe ${prim.scris}, votul din ${prim.vot}): o regulă nouă cere o probă nouă (motor nou, PROBA nou).`);
});
// 27.10.2026 — I-743 („amprenta judecătorului”, auditul F): codul care JUDECĂ proba (tools/clasificator-jurnal.mjs: rezultatele înghețate,
// testul, verdictele, Holm, integritatea) e înghețat ca motorul. O schimbare ⇒ rând nou în docs/clasificator-versiuni.md, § „Amprenta
// judecătorului”, cu motivul; dacă schimbă un verdict posibil, e o regulă nouă ⇒ probă nouă (protocolul, „Istoria”).
const randuriJudecator = (t) => [...(/## Amprenta judecătorului([\s\S]*?)(\n## |$)/.exec(t)?.[1] || '').matchAll(/^\| (\d{4}-\d{2}-\d{2}) \| `(jc-[0-9a-f]{12})` \| (.+) \|\s*$/gm)].map((m) => ({ data: m[1], amprenta: m[2], motiv: m[3] }));
test('I-743: judecătorul probei are amprenta de pe ultimul rând din „Amprenta judecătorului” (docs/clasificator-versiuni.md)', async () => {
  const { amprentaJudecator } = await import('./clasificator-jurnal.mjs'), rows = randuriJudecator(readFileSync('docs/clasificator-versiuni.md', 'utf8'));
  assert.ok(rows.length, 'Secțiunea „Amprenta judecătorului” lipsește sau n-are rânduri.');
  assert.equal(rows.at(-1).amprenta, amprentaJudecator(), `Codul care judecă proba s-a schimbat (${amprentaJudecator()}): scrie rândul nou (data, amprenta, motivul) în docs/clasificator-versiuni.md.`);
});
test('I-743: rândurile judecătorului doar cresc (niciunul din ultimul commit nu dispare)', async () => {
  const { execFileSync } = await import('node:child_process'); let vechi; try { vechi = execFileSync('git', ['show', BAZA + ':docs/clasificator-versiuni.md'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch { return; }
  const azi = new Set(randuriJudecator(readFileSync('docs/clasificator-versiuni.md', 'utf8')).map((r) => JSON.stringify(r)));
  for (const r of randuriJudecator(vechi)) assert.ok(azi.has(JSON.stringify(r)), 'rând al judecătorului șters sau schimbat: ' + r.amprenta);
});
test('calendarul oficial NYSE acoperă cel puțin următoarele 180 de zile (altfel notarea la timp nu se mai poate verifica)', () => {
  const cal = motor('.').ExchangeCalendar, d = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
  assert.notEqual(cal.session('US', d).state, 'unknown', `Adaugă în lib/exchange-calendar.js sărbătorile NYSE pentru ${d.slice(0, 4)} (sursa oficială).`);
});
