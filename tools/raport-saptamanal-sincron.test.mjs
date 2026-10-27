// 19.10.2026 — I-710: raportul săptămânal scria ora aparatului (lastWeeklyReportTs) în tt_journal_settings_v1, cheie SINCRONIZATĂ ⇒
// conflict de sincronizare la fiecare trimitere și raport trimis de pe ambele aparate. Acum ora stă pe aparat (cheie locală), iar în setări
// doar marcajul săptămânii („2026-W43”), scris o dată de aparatul care trimite; celălalt îl vede și nu mai trimite.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const LUNI = Date.parse('2026-10-19T09:00:00Z');
function aparat(settings) {
  const store = new Map([['tt_journal_settings_v1', JSON.stringify(settings)]]);
  let now = LUNI;
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const c = { console, JSON, Math, Number, Intl, Date: Clock, localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
  c.window = c; vm.createContext(c); vm.runInContext(readFileSync('lib/journal.js', 'utf8'), c);
  return { JR: c.JR, ctx: c, store, set: (t) => { now = t; }, settings: () => JSON.parse(store.get('tt_journal_settings_v1')) };
}

test('marcajul săptămânii ISO, în ora României', () => {
  const { JR } = aparat({});
  assert.equal(typeof JR.weekKey, 'function');
  assert.equal(JR.weekKey(LUNI), '2026-W43');
  assert.equal(JR.weekKey(Date.parse('2026-10-18T21:30:00Z')), '2026-W43', 'duminică 23:30 UTC = luni 00:30 la București');
  assert.equal(JR.weekKey(Date.parse('2026-10-18T20:00:00Z')), '2026-W42');
  assert.equal(JR.weekKey(Date.parse('2027-01-01T12:00:00Z')), '2026-W53');
});

test('trimiterea scrie ora doar local și marcajul săptămânii o singură dată în setările sincronizate', () => {
  const a = aparat({ weeklyReportEnabled: true });
  assert.equal(a.JR.weeklyReportDue(), true);
  a.JR.markWeeklyReportSent();
  const s = a.settings();
  assert.equal(s.weeklyReportWeek, '2026-W43');
  assert.equal(s.lastWeeklyReportTs || 0, 0, 'ora aparatului nu mai intră în cheia sincronizată');
  assert.equal(JSON.parse(a.store.get('tt_journal_weekly_local_v1')).ts, LUNI);
  assert.equal(a.JR.weeklyReportDue(), false);
  const scris = a.store.get('tt_journal_settings_v1');
  a.set(LUNI + 3600000); a.JR.markWeeklyReportSent();
  assert.equal(a.store.get('tt_journal_settings_v1'), scris, 'a doua trimitere din aceeași săptămână nu rescrie setările');
  a.set(LUNI + 7 * 86400000); assert.equal(a.JR.weeklyReportDue(), true, 'săptămâna următoare: din nou');
});

test('celălalt aparat vede marcajul sincronizat și nu mai trimite; marcajul vechi (ora) e respectat în aceeași săptămână', () => {
  const b = aparat({ weeklyReportEnabled: true, weeklyReportWeek: '2026-W43' });
  assert.equal(b.JR.weeklyReportDue(), false);
  const vechi = aparat({ weeklyReportEnabled: true, lastWeeklyReportTs: LUNI - 3600000 });
  assert.equal(vechi.JR.weeklyReportDue(), false);
  assert.equal(aparat({ weeklyReportEnabled: false }).JR.weeklyReportDue(), false);
});

test('Jurnalul nu mai scrie lastWeeklyReportTs și verificarea automată întreabă regula de mai sus', () => {
  const html = readFileSync('journal/index.html', 'utf8');
  assert.doesNotMatch(html, /saveSettings\(\{\s*lastWeeklyReportTs/);
  assert.match(html, /JR\.markWeeklyReportSent\(\)/);
  const check = html.slice(html.indexOf('function checkWeeklyReport'), html.indexOf('function toggleMarkField'));
  assert.match(check, /JR\.weeklyReportDue\(\)/); assert.doesNotMatch(check, /7 \* 86400000/);
});

test('🔵 25: raportul pleacă luni de la 09:00 (ora României), nu la prima deschidere de după miezul nopții; aparatul care NU citește Trading 212 așteaptă până la 12:00 marcajul celuilalt', () => {
  const a = aparat({ weeklyReportEnabled: true });
  a.set(Date.parse('2026-10-26T05:30:00Z')); assert.equal(a.JR.weeklyReportDue(), false, 'luni 07:30 la București: încă nu');
  a.set(Date.parse('2026-10-26T07:30:00Z')); assert.equal(a.JR.weeklyReportDue(), true, 'luni 09:30: da');
  a.set(Date.parse('2026-10-27T03:00:00Z')); assert.equal(a.JR.weeklyReportDue(), true, 'marți dimineață, netrimis: da');
  // aparatul pasiv (I-713): tt_t212_reader_v1 = NU
  const pasiv = (t) => { const x = aparat({ weeklyReportEnabled: true }); x.set(t); return x; };
  const p1 = pasiv(Date.parse('2026-10-26T07:30:00Z')); p1.ctx.TTT212Reader = { setting: () => false };
  assert.equal(p1.JR.weeklyReportDue(), false, 'luni 09:30 pe aparatul pasiv: lasă aparatul care citește contul să trimită');
  p1.set(Date.parse('2026-10-26T10:30:00Z')); assert.equal(p1.JR.weeklyReportDue(), true, 'luni 12:30, marcajul n-a venit: trimite el');
  p1.ctx.TTT212Reader = { setting: () => { throw Error('x'); } };
  p1.set(Date.parse('2026-10-26T07:30:00Z')); assert.equal(p1.JR.weeklyReportDue(), true, 'citirea setării pică ⇒ ca aparatul care citește');
});

test('Jurnalul încarcă TTT212Reader înaintea contului: aparatul pasiv e recunoscut (raportul săptămânal, pragul de 15 min al copiei — 🟡 11)', () => {
  const html = readFileSync('journal/index.html', 'utf8');
  const r = html.indexOf('lib/t212-reader.js'), c = html.indexOf('lib/trading212-capital.js'), j = html.indexOf('lib/journal.js');
  assert.ok(r > 0, 't212-reader.js lipsește din Jurnal'); assert.ok(r < c, 'înaintea lui trading212-capital.js'); assert.ok(j > 0);
});
