// 17.10.2026 — robotul Verdictului pieței (I-676 / I-677 / I-681).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ruleaza, proba, mariDin, breadthDin, adaugaLinie, citesteIstoric, motorVerdict, FISIER, ISTORIC, VERSIUNE } from './verdict-piata-robot.mjs';

const zi = (i) => Date.UTC(2026, 0, 5) + i * 86400000, dateOf = (t) => new Date(t).toISOString().slice(0, 10);
test('I-681: marile companii — primele 15 după capitalizare, cu ziua și momentul raportării', () => {
  const zile = [['2026-10-20', [{ symbol: 'GE', marketCap: '$323,719,496,000', time: 'time-pre-market' }, { symbol: 'MIC', marketCap: '$1,000,000', time: 'time-after-hours' }]], ['2026-10-21', [{ symbol: 'META', marketCap: '$1,800,000,000,000', time: 'time-after-hours' }, { symbol: 'X', marketCap: 'N/A' }]]];
  const m = mariDin(zile, 2); assert.equal(JSON.stringify(m.map((x) => x.symbol)), JSON.stringify(['GE', 'META'])); assert.equal(m[0].cand, 'înainte de deschidere');
});
test('I-676: prima notare a zilei rămâne; zilele neconfirmate nu se notează', () => {
  const l = [{ asOf: '2026-10-16', label: 'prudent' }];
  assert.equal(adaugaLinie(l, { asOf: '2026-10-16', label: 'defensiv' }), null); assert.equal(adaugaLinie(l, { asOf: '2026-10-19', label: 'necunoscut' }), null);
  assert.equal(adaugaLinie(l, { asOf: '2026-10-19', label: 'neutru' }).label, 'neutru');
});
test('I-677: proba — „în probă” sub minim; „ajută” când zilele Prudent / Defensiv au căderi mai mari pe zile separate', () => {
  const spy = []; let p = 100; for (let i = 0; i < 700; i++) { const rau = Math.floor(i / 5) % 2 === 0; p *= rau ? 0.995 + (i % 3) * 0.0005 : 1.003 - (i % 3) * 0.0005; spy.push({ t: zi(i), c: p }); }
  const linii = spy.slice(0, 690).filter((_, i) => i % 5 === 0).map((b, k) => ({ asOf: dateOf(b.t), generat: 'x', label: k % 2 === 0 ? 'prudent' : 'neutru' }));
  assert.equal(proba(linii.slice(0, 10), spy, dateOf, null).verdict, 'in-proba');
  const r = proba(linii, spy, dateOf, null); assert.equal(r.verdict, 'ajuta'); assert.ok(r.redus.cadere < r.normal.cadere); assert.ok(r.redus.n >= 20 && r.normal.n >= 20);
  const inv = proba(linii.map((l) => ({ ...l, label: l.label === 'prudent' ? 'neutru' : 'prudent' })), spy, dateOf, null); assert.equal(inv.verdict, 'nu-ajuta');
});
test('lățimea pieței din raportul publicat: participarea, peste media de 200, sectoarele și rândurile motorului', () => {
  if (!existsSync('market-breadth/data/latest.json')) return;
  const { breadth, raport } = breadthDin(JSON.parse(readFileSync('market-breadth/data/latest.json', 'utf8')));
  assert.equal(breadth.state, 'ready'); assert.ok(Number.isFinite(breadth.above50) && Number.isFinite(breadth.above200)); assert.ok(Array.isArray(raport.sectors));
});
test('robotul cap-coadă pe date controlate: verdict, linie de istoric, fișier cu forma bună (fără rețea)', async () => {
  const c = motorVerdict('.'), N = 320, bare = (f) => { const out = Array.from({ length: N }, (_, i) => ({ t: Date.parse('2025-07-01T13:30:00Z') + i * 86400000, o: f(i), h: f(i) * 1.01, l: f(i) * 0.99, c: f(i), v: 1e6 })); Object.defineProperty(out, 'meta', { value: { symbol: 'X', exchange: 'NMS', timezone: 'America/New_York', regularEnd: null, provider: 'Yahoo Finance', currency: 'USD', interval: '1d' } }); return out; };
  const sursa = async (s) => bare((i) => (s === '^VIX' ? 18 : s === '^TNX' ? 4 : 100 + i * 0.1));
  const fetchImpl = async () => ({ ok: true, json: async () => ({ data: [] }) });
  const { j, linie } = await ruleaza({ sursa, fetchImpl, now: Date.parse('2026-05-16T12:00:00Z') });
  assert.equal(j.version, VERSIUNE); assert.ok(['favorabil', 'neutru', 'prudent', 'defensiv', 'necunoscut'].includes(j.label)); assert.ok(Array.isArray(j.indicatori) && j.indicatori.length === 6);
  assert.ok(c.MarketVerdict); if (linie) assert.equal(linie.asOf, j.asOf);
});
test('garda: fișierul publicat (dacă există) are forma bună; istoricul doar crește față de ultimul commit', () => {
  if (existsSync(FISIER)) { const j = JSON.parse(readFileSync(FISIER, 'utf8')); assert.equal(j.version, VERSIUNE); assert.ok(Array.isArray(j.indicatori) && Array.isArray(j.istoric) && j.proba && typeof j.proba.mesaj === 'string'); }
  let vechi = null; try { vechi = execFileSync('git', ['show', 'HEAD:' + ISTORIC], { encoding: 'utf8' }).replace(/\r\n/g, '\n'); } catch { return; }
  const azi = existsSync(ISTORIC) ? readFileSync(ISTORIC, 'utf8').replace(/\r\n/g, '\n') : ''; assert.ok(azi.startsWith(vechi), 'istoricul verdictului a fost rescris, nu doar crescut');
  assert.ok(citesteIstoric(azi).every((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.asOf)));
});
