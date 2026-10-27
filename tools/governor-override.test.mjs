// 27.10.2026 (I-760): override guvernat — o limită RELAXATĂ din formularul Governor nu intră imediat (exact în seara proastă), ci peste 24 h,
// cu motiv obligatoriu și expirare (zile); strângerea intră imediat. Valorile stricte rămân în tt_governor_cfg_v1; relaxările stau în
// tt_governor_override_v1 și se suprapun doar în fereastra lor; jurnalul limitelor notează programarea; Governor o spune în motive (fără să schimbe verdictul).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const T0 = Date.parse('2026-10-27T18:00:00Z'), H = 3600000, D = 24 * H;
function lume(seed = {}) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])), clock = { t: T0 };
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [clock.t])); } static now() { return clock.t; } }
  const c = { console, Date: Clock, Intl, JSON, Math, Number, navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0)' },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
  c.window = c; vm.createContext(c);
  vm.runInContext(readFileSync('lib/governor.js', 'utf8'), c);
  return { GV: c.GV, store, clock };
}
const rand = [{ id: 'a1', sym: 'AAPL', dir: 'long', entry: 100, exit: 105, size: 1, openTs: T0 - 3 * D, closeTs: T0 - 2 * D, status: 'closed' }];
const seed = () => ({ tt_journal_v1: rand, tt_account_size_v1: '12670' });

test('relaxarea cere motiv și expirare; intră peste 24 h; se vede în motive ca programată, apoi activă; expiră singură', () => {
  const { GV, clock } = lume(seed());
  assert.equal(GV.saveCfg({ maxLossPctDay: 3 }), null, 'fără motiv nu se relaxează'); assert.match(GV.ultimaEroare || '', /motiv/i);
  assert.equal(GV.cfg().maxLossPctDay, 2);
  assert.equal(GV.saveCfg({ maxLossPctDay: 3 }, { motiv: 'cont mai mare, regulă revizuită la trimestru', expiraZile: 0 }), null, 'expirarea e obligatorie (1–90 de zile)');
  const s = GV.saveCfg({ maxLossPctDay: 3 }, { motiv: 'cont mai mare, regulă revizuită la trimestru', expiraZile: 7 });
  assert.ok(s); assert.equal(s.amanate.length, 1); assert.equal(s.amanate[0].cheia, 'maxLossPctDay'); assert.equal(s.amanate[0].de, 2); assert.equal(s.amanate[0].la, 3);
  assert.equal(s.amanate[0].intraLa, T0 + D); assert.equal(s.amanate[0].expiraLa, T0 + 8 * D);
  assert.equal(GV.cfg().maxLossPctDay, 2, 'nu intră imediat');
  let st = GV.status(); assert.equal(st.verdict, 'TRADE'); assert.match(st.reasons.join(' '), /relaxat[ăa].*programat[ăa].*maxLossPctDay 2 → 3/i);
  const j = GV.limiteJurnal(); assert.equal(j.length, 1); assert.equal(j[0].stare, 'programata'); assert.equal(j[0].intraLa, T0 + D); assert.match(j[0].motiv, /trimestru/);
  clock.t = T0 + D + H; assert.equal(GV.cfg().maxLossPctDay, 3, 'după 24 h intră'); st = GV.status(); assert.match(st.reasons.join(' '), /relaxat[ăa] activ[ăa].*maxLossPctDay 2 → 3/i); assert.equal(st.maxLossUsd, 300, '3 % din cei 10.000 de pornire (fără ACCT în test)');
  clock.t = T0 + 9 * D; assert.equal(GV.cfg().maxLossPctDay, 2, 'după expirare revine la valoarea strictă'); assert.doesNotMatch(GV.status().reasons.join(' '), /relaxat/i);
  assert.equal(GV.overrides().find((o) => o.cheia === 'maxLossPctDay').stare, 'expirat');
});

test('strângerea intră imediat (fără motiv); ddRollingOn oprit = relaxare; slippage mai mare = strângere; Telegram = neutru', () => {
  const { GV } = lume(seed());
  assert.ok(GV.saveCfg({ maxLossPctDay: 1.5 })); assert.equal(GV.cfg().maxLossPctDay, 1.5); assert.equal(GV.limiteJurnal().at(-1).stare, undefined, 'rândul vechi, fără stare = intrat imediat');
  assert.equal(GV.saveCfg({ ddRollingOn: false }), null); assert.ok(GV.saveCfg({ ddRollingOn: false }, { motiv: 'curba în migrare', expiraZile: 3 })); assert.equal(GV.cfg().ddRollingOn, true, 'frâna DD rămâne pornită 24 h');
  assert.ok(GV.saveCfg({ slippageEstPct: 0.1 })); assert.equal(GV.cfg().slippageEstPct, 0.1, 'estimare de alunecare mai mare = mai prudent = imediat');
  assert.ok(GV.saveCfg({ tgOnHalt: false })); assert.equal(GV.cfg().tgOnHalt, false);
  assert.ok(GV.saveCfg({ cooldownAfterLosses: 2 })); assert.equal(GV.cfg().cooldownAfterLosses, 2, 'cooldown mai devreme = strângere');
  assert.equal(GV.saveCfg({ cooldownAfterLosses: 4 }), null, 'cooldown mai târziu = relaxare');
});

test('o relaxare programată se poate anula; o strângere pe aceeași cheie o anulează singură; valoarea strictă nu se contaminează cu cea relaxată', () => {
  const { GV, clock, store } = lume(seed());
  const s = GV.saveCfg({ maxTradesDay: 8 }, { motiv: 'săptămână de probă', expiraZile: 5 }); const id = s.amanate[0].id;
  assert.equal(GV.anuleazaOverride(id), true); assert.equal(GV.overrides().find((o) => o.id === id).stare, 'anulat'); assert.doesNotMatch(GV.status().reasons.join(' '), /relaxat/i);
  GV.saveCfg({ maxOpenPositions: 6 }, { motiv: 'x', expiraZile: 2 }); clock.t = T0 + D + H; assert.equal(GV.cfg().maxOpenPositions, 6);
  assert.ok(GV.saveCfg({ maxOpenPositions: 6, maxLossPctDay: 2 }), 'salvarea formularului cu valoarea relaxată la vedere nu e o schimbare');
  assert.equal(JSON.parse(store.get('tt_governor_cfg_v1')).maxOpenPositions, 4, 'cheia strictă rămâne 4');
  assert.ok(GV.saveCfg({ maxOpenPositions: 3 })); assert.equal(GV.cfg().maxOpenPositions, 3); assert.equal(GV.overrides().find((o) => o.cheia === 'maxOpenPositions').stare, 'anulat', 'strângerea anulează relaxarea');
  assert.equal(GV.saveCfg({ maxLossPctDay: 'abc' }, { motiv: 'x', expiraZile: 2 }), null, 'valoare invalidă');
});
