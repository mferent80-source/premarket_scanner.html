// 20.10.2026 (I-721): limita lunară de pierdere (I-692) nu mai e doar text — Governor o citește: depășită ⇒ HALTED pentru planuri noi,
// ≥ 75 % / necitită / mai veche de 3 zile ⇒ CAUTION. Cu sau fără lib/monthly-limit.js în pagină, același rezultat (copia din Governor).
// (I-726): jurnalul append-only al verdictelor; (I-728): jurnalul schimbărilor de limite; (I-733): CAUTION la penultimul trade, HALTED la maxim.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const NOW = Date.parse('2026-10-20T10:00:00Z'), LUNA = '2026-10';
function boot({ cuModul = true, setari = null, luna = null, jurnal = null, ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } = {}) {
  const store = new Map();
  const closed = { id: 'a1', sym: 'AAPL', dir: 'long', entry: 100, exit: 105, size: 1, openTs: NOW - 86400000 * 3, closeTs: NOW - 86400000 * 2, status: 'closed' };
  store.set('tt_journal_v1', JSON.stringify(jurnal || [closed]));
  if (setari) store.set('tt_journal_settings_v1', JSON.stringify(setari));
  if (luna) store.set('tt_journal_luna_t212_v1', JSON.stringify(luna));
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
  const ctx = { console, Date: Clock, Intl, JSON, Math, navigator: { userAgent: ua }, localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) } };
  ctx.window = ctx; vm.createContext(ctx);
  if (cuModul) vm.runInContext(readFileSync('lib/monthly-limit.js', 'utf8'), ctx);
  vm.runInContext(readFileSync('lib/governor.js', 'utf8'), ctx);
  return { GV: ctx.GV, store, ctx };
}
const rezultat = (rez, la = NOW - 3600000) => ({ luna: LUNA, rez, n: 3, moneda: 'EUR', la });

for (const cuModul of [true, false]) {
  const eticheta = cuModul ? 'cu lib/monthly-limit.js' : 'fără modul (copia din Governor)';
  test(`limita depășită ⇒ HALTED cu motivul lunii (${eticheta})`, () => {
    const { GV } = boot({ cuModul, setari: { limitaLuna: 500 }, luna: rezultat(-612.3) }), s = GV.status();
    assert.equal(s.verdict, 'HALTED'); assert.equal(s.monthly.stare, 'depasit');
    assert.match(s.reasons.join(' '), /[Ll]imita lunară depășită/); assert.match(s.reasons.join(' '), /1 noiembrie/);
    assert.equal(GV.canTrade(), false);
  });
  test(`≥ 75 % ⇒ CAUTION; sub 75 % ⇒ TRADE; fără limită ⇒ nimic (${eticheta})`, () => {
    const aproape = boot({ cuModul, setari: { limitaLuna: 500 }, luna: rezultat(-400) }).GV.status();
    assert.equal(aproape.verdict, 'CAUTION'); assert.match(aproape.reasons.join(' '), /80,0 % consumat/);
    const ok = boot({ cuModul, setari: { limitaLuna: 500 }, luna: rezultat(-100) }).GV.status();
    assert.equal(ok.verdict, 'TRADE'); assert.equal(ok.monthly.stare, 'ok'); assert.doesNotMatch(ok.reasons.join(' '), /[Ll]imita lunară/);
    const fara = boot({ cuModul, luna: rezultat(-900) }).GV.status();
    assert.equal(fara.verdict, 'TRADE'); assert.equal(fara.monthly.stare, 'nesetat');
  });
  test(`limită pusă, rezultatul lunii necitit sau din altă lună ⇒ CAUTION „neverificat”; rezultat mai vechi de 3 zile ⇒ CAUTION (${eticheta})`, () => {
    const necitit = boot({ cuModul, setari: { limitaLuna: 500 } }).GV.status();
    assert.equal(necitit.verdict, 'CAUTION'); assert.equal(necitit.monthly.stare, 'neverificat'); assert.match(necitit.reasons.join(' '), /nu e citit/);
    const altaLuna = boot({ cuModul, setari: { limitaLuna: 500 }, luna: { ...rezultat(-50), luna: '2026-09' } }).GV.status();
    assert.equal(altaLuna.monthly.stare, 'neverificat');
    const vechi = boot({ cuModul, setari: { limitaLuna: 500 }, luna: rezultat(-50, NOW - 4 * 86400000) }).GV.status();
    assert.equal(vechi.verdict, 'CAUTION'); assert.equal(vechi.monthly.stare, 'ok'); assert.equal(vechi.monthly.vechi, true); assert.match(vechi.reasons.join(' '), /mai vechi de 3 zile/);
  });
}

test('I-726: jurnalul verdictelor se scrie la schimbare, nu la fiecare apel; păstrează ziua, verdictul, motivele și starea limitei', () => {
  const b = boot({ setari: { limitaLuna: 500 }, luna: rezultat(-400) });
  b.GV.status(); b.GV.status();
  let j = b.GV.jurnal(); assert.equal(j.length, 1); assert.equal(j[0].verdict, 'CAUTION'); assert.equal(j[0].luna, 'aproape'); assert.equal(j[0].day, '2026-10-20'); assert.ok(Array.isArray(j[0].reasons) && j[0].reasons.length <= 4);
  b.store.set('tt_journal_luna_t212_v1', JSON.stringify(rezultat(-700))); b.GV.status();
  j = b.GV.jurnal(); assert.equal(j.length, 2); assert.equal(j[1].verdict, 'HALTED'); assert.equal(j[1].luna, 'depasit');
  assert.equal(b.GV.JURNAL_KEY, 'tt_governor_jurnal_v1');
});

test('I-728: saveCfg notează fiecare limită schimbată (de la → la, aparatul), dar nu capitalul', () => {
  const b = boot({ ua: 'Mozilla/5.0 (Linux; Android 14) Mobile' });
  assert.ok(b.GV.saveCfg({ maxLossPctDay: 1.5, accountSize: 12345 }));
  assert.ok(b.GV.saveCfg({ maxLossPctDay: 1.5 }), 'aceeași valoare: nimic de notat');
  const j = b.GV.limiteJurnal();
  assert.equal(j.length, 1); assert.equal(j[0].cheia, 'maxLossPctDay'); assert.equal(j[0].de, 2); assert.equal(j[0].la, 1.5); assert.equal(j[0].aparat, 'telefon'); assert.equal(j[0].ts, NOW);
  assert.equal(b.GV.LIMITE_KEY, 'tt_governor_limite_jurnal_v1');
});

test('I-733: la penultimul trade al zilei CAUTION cu motivul, la maxim HALTED (nu mai e aceeași condiție de două ori)', () => {
  const zi = (i) => ({ id: 't' + i, sym: 'AAPL', dir: 'long', entry: 100, exit: 101, size: 1, openTs: NOW - 3600000 * (i + 1), closeTs: NOW - 1800000 * (i + 1), status: 'closed' });
  const patru = boot({ jurnal: [0, 1, 2, 3].map(zi) }).GV.status();
  assert.equal(patru.verdict, 'CAUTION'); assert.match(patru.reasons.join(' '), /Trade-uri azi: 4\/5 — ultimul permis/);
  const cinci = boot({ jurnal: [0, 1, 2, 3, 4].map(zi) }).GV.status();
  assert.equal(cinci.verdict, 'HALTED'); assert.match(cinci.reasons.join(' '), /5\/5 — max trade-uri\/zi atins/);
  assert.equal(cinci.reasons.filter((r) => /Trade-uri azi/.test(r)).length, 1, 'un singur motiv, nu două');
});
