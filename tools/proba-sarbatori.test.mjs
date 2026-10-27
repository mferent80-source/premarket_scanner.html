// 27.10.2026 — revizia independentă a lotului F (🔵12): dincolo de calendarul oficial NYSE din lib/exchange-calendar.js (2026–2027),
// data primului verdict număra zile lucrătoare fără sărbători (la 20 de sesiuni × 60 de perioade: ~7 săptămâni mai devreme decât în
// realitate). Acum sărbătorile NYSE se calculează după regulile bursei (An Nou — sâmbăta NU se mută pe vineri —, Martin Luther King,
// Presidents, Vinerea Mare, Memorial, Juneteenth, 4 Iulie, Labor, Thanksgiving, Crăciun; sâmbăta ⇒ vineri, duminica ⇒ luni).
// Închiderile speciale (doliu național etc.) nu se pot ști: data rămâne marcată aproximativă.
import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarSUA, dupaSesiuni, sarbatoriNYSE, primulVerdict } from '../lib/proba-contract.mjs';

const cal = calendarSUA('.');
test('sărbătorile NYSE calculate: 2028 și 2033 (An Nou sâmbătă: fără zi liberă vinerea dinainte)', () => {
  assert.deepEqual([...sarbatoriNYSE(2028)].sort(), ['2028-01-17', '2028-02-21', '2028-04-14', '2028-05-29', '2028-06-19', '2028-07-04', '2028-09-04', '2028-11-23', '2028-12-25']);
  assert.ok(!sarbatoriNYSE(2032).has('2032-12-31'), '1 ian. 2033 e sâmbătă ⇒ NYSE e deschisă pe 31.12.2032');
  assert.ok(sarbatoriNYSE(2033).has('2033-12-26'), 'Crăciunul 2033 e duminică ⇒ liber luni');
  assert.ok(sarbatoriNYSE(2027).has('2027-12-24') && sarbatoriNYSE(2027).has('2027-03-26'), 'aceleași reguli dau și anul oficial 2027');
});
test('regulile reproduc calendarul oficial 2026–2027 din lib/exchange-calendar.js (închiderile întregi)', () => {
  for (const an of [2026, 2027]) for (const d of sarbatoriNYSE(an)) assert.equal(cal.session('US', d).state, 'closed', d);
});
test('dincolo de 2027, sesiunile sar peste sărbători (nu doar peste weekend), iar data rămâne marcată aproximativă', () => {
  assert.deepEqual(dupaSesiuni(cal, '2028-01-14', 1), { zi: '2028-01-18', aproximativ: true }, 'MLK 2028');
  assert.equal(dupaSesiuni(cal, '2028-04-13', 1).zi, '2028-04-17', 'Vinerea Mare 2028');
  assert.equal(dupaSesiuni(cal, '2027-12-30', 1).zi, '2027-12-31', '31.12.2027 e zi de bursă (calendarul oficial)');
  assert.equal(dupaSesiuni(cal, '2027-12-31', 1).zi, '2028-01-03');
  const p = primulVerdict({ cal, azi: '2026-10-27', inceput: '2026-10-28', k: 20, perioade: 60 });
  assert.match(p.motiv, /sărbătorile NYSE calculate/); assert.ok(p.optimist >= '2031-08-01', 'k = 20, 60 de perioade: ' + p.optimist);
});
