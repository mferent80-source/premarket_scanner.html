// 20.10.2026 (I-725, constatarea probei de ecran): parametrii din adresa carcasei (app/?module=desk%2F&ticket=1) ajungeau la modul doar prin
// history.state ⇒ la o deschidere directă (link, bookmark, probă) tichetul lipsea. Acum interogarea modulului vine și din adresă.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const html = readFileSync('app/index.html', 'utf8');
const linie = /^\s*try\{if\(!currentQuery&&requestedRoute\)\{var qp=new URLSearchParams\(location\.search\);[^\n]*\}\}catch\(_\)\{\}\s*$/m.exec(html);

test('carcasa: interogarea modulului vine din adresă când history.state n-o are (module scos, autonote scos, alias smart-trade-long ⇒ ticket=1)', () => {
  assert.ok(linie, 'blocul din app/index.html există');
  const ruleaza = (search, { requested, requestedRoute, currentQuery = '' }) => {
    const c = { URLSearchParams, location: { search }, requested, requestedRoute, currentQuery };
    vm.createContext(c); vm.runInContext(linie[0], c); return c.currentQuery;
  };
  assert.equal(ruleaza('?module=desk%2F&ticket=1', { requested: 'desk/', requestedRoute: 'desk/' }), 'ticket=1');
  assert.equal(ruleaza('?module=desk%2F&ticket=1&autonote=1', { requested: 'desk/', requestedRoute: 'desk/' }), 'ticket=1', 'autonote e al carcasei, nu al modulului');
  assert.equal(ruleaza('?module=smart-trade-long%2F', { requested: 'smart-trade-long/', requestedRoute: 'desk/' }), 'ticket=1', 'aliasul vechi deschide tichetul, ca în TTAppRoutes.resolve');
  assert.equal(ruleaza('?module=today%2F', { requested: 'today/', requestedRoute: 'today/' }), '', 'fără parametri ⇒ interogare goală');
  assert.equal(ruleaza('?ticket=1', { requested: null, requestedRoute: null }), '', 'fără modul cerut (ultimul modul din memorie) adresa nu impune nimic');
  assert.equal(ruleaza('?module=desk%2F&ticket=1', { requested: 'desk/', requestedRoute: 'desk/', currentQuery: 'sym=AAPL' }), 'sym=AAPL', 'history.state are prioritate (înapoi / înainte în istoric)');
});
