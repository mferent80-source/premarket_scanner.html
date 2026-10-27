// 27.10.2026 (I-760): registrul de incidente — ce a mers prost, când, impactul, cauza, ce s-a schimbat. Un incident rămâne DESCHIS până are
// măsura scrisă; fișa zilei primește un rând cu incidentele noi (ziua New York) și cele deschise; fiecare se copiază în docs/incidente.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const NOW = Date.parse('2026-10-27T18:00:00Z'), D = 86400000;
function lume(seed = {}) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const c = { console, JSON, Math, Number, Intl, Date }; c.window = c; vm.createContext(c);
  vm.runInContext(readFileSync('lib/journal-incidente.js', 'utf8'), c);
  return { I: c.JournalIncidente, storage, store };
}
const bun = { titlu: 'Robotul V1 a pierdut sesiuni', la: new Date(NOW - 3600000).toISOString(), gravitate: 'mare', ce: 'Robotul probei V1 a pierdut 5 din 7 sesiuni fără alarmă.', impact: 'proba fără date 5 sesiuni', cauza: 'o singură încercare pe zi, fără Discord la eșec' };

test('un incident valid se notează DESCHIS, cu id, ora scrierii și aparatul; cel fără ce/titlu/dată bună e refuzat cu motivul', () => {
  const w = lume();
  const r = w.I.adauga(w.storage, bun, { now: NOW, aparat: 'PC' });
  assert.equal(r.ok, true); assert.equal(r.incident.stare, 'deschis'); assert.match(r.incident.id, /^inc_/); assert.equal(r.incident.aparat, 'PC');
  assert.equal(w.I.citeste(w.storage).length, 1);
  for (const [stricat, motiv] of [[{ ...bun, titlu: 'x' }, /titlu/i], [{ ...bun, ce: 'scurt' }, /ce s-a întâmplat/i], [{ ...bun, la: 'ieri' }, /data/i], [{ ...bun, la: new Date(NOW + 2 * D).toISOString() }, /viitor/i], [{ ...bun, gravitate: 'enorm' }, /gravitate/i]]) {
    const x = w.I.adauga(w.storage, stricat, { now: NOW }); assert.equal(x.ok, false); assert.match(x.erori.join(' '), motiv);
  }
  assert.equal(w.I.citeste(w.storage).length, 1, 'cele refuzate nu se scriu');
});

test('închiderea cere măsura scrisă (ce s-a schimbat); un incident notat direct închis la fel', () => {
  const w = lume(), { incident } = w.I.adauga(w.storage, bun, { now: NOW });
  assert.equal(w.I.inchide(w.storage, incident.id, '', { now: NOW }).ok, false);
  const r = w.I.inchide(w.storage, incident.id, 'reîncercare după 3 min + Discord la eșec + rulare de rezervă dimineața', { now: NOW + 1000 });
  assert.equal(r.ok, true); assert.equal(r.incident.stare, 'inchis'); assert.equal(r.incident.inchisLa, NOW + 1000);
  assert.equal(w.I.adauga(w.storage, { ...bun, stare: 'inchis' }, { now: NOW }).ok, false, 'închis fără măsură: refuzat');
  assert.equal(w.I.adauga(w.storage, { ...bun, stare: 'inchis', masura: 'maxBuffer 256 MB' }, { now: NOW }).ok, true);
});

test('rândul din fișa zilei: incidentele noi ale zilei New York și cele deschise, cu cel mai vechi deschis', () => {
  const w = lume();
  assert.equal(w.I.randFisa([], '2026-10-27'), 'Incidente: niciunul nou azi, niciunul deschis.');
  w.I.adauga(w.storage, { ...bun, la: new Date(NOW - 5 * D).toISOString(), titlu: 'Comentariu care înghițea panoul' }, { now: NOW });
  w.I.adauga(w.storage, bun, { now: NOW });
  const rand = w.I.randFisa(w.I.citeste(w.storage), '2026-10-27');
  assert.match(rand, /^Incidente: 1 nou azi \(Robotul V1 a pierdut sesiuni\) · 2 deschise, cel mai vechi din 22\.10\.$/);
});

test('copia pentru docs/incidente.md: titlul cu data și gravitatea, câmpurile, „deschis — măsura nescrisă” până la închidere', () => {
  const w = lume(), { incident } = w.I.adauga(w.storage, bun, { now: NOW });
  const md = w.I.markdown(incident);
  assert.match(md, /^### 2026-10-27 · Robotul V1 a pierdut sesiuni · gravitate mare/);
  assert.match(md, /- \*\*Ce s-a întâmplat:\*\* Robotul probei V1/); assert.match(md, /- \*\*Cauza:\*\* o singură încercare/);
  assert.match(md, /- \*\*Ce s-a schimbat:\*\* deschis — măsura nescrisă/);
  assert.doesNotMatch(w.I.markdown({ ...incident, ce: 'a | b\nc' }), /\n- \*\*Ce s-a întâmplat:\*\* a \| b\nc/, 'un rând nou din text nu rupe lista');
});

test('se încarcă și ca modul în worker-ul de sincronizare (globalThis), pentru rândul din fișa zilei de pe server', async () => {
  delete globalThis.JournalIncidente;
  await import('../lib/journal-incidente.js?' + Date.now());
  assert.equal(typeof globalThis.JournalIncidente.randFisa, 'function');
});

test('Jurnalul încarcă modulul înaintea scriptului paginii care leagă formularul', () => {
  const html = readFileSync('journal/index.html', 'utf8'), m = html.indexOf('lib/journal-incidente.js'), b = html.indexOf('try { bindIncidente(); renderIncidente(); }');
  assert.ok(m > 0, 'scriptul lipsește'); assert.ok(b > m, 'modulul se încarcă înainte de legarea formularului');
  assert.match(html, /id="jrIncidente"/);
});
