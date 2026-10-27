// 27.10.2026 (audit C 🟡 10, restul): REZULTATELE cu o singură zecimală (regula din 03.10: 806,7, nu 806,65) și în locurile rămase din Jurnal,
// Capital Desk, Portofoliu · risc și jurnalul Trading 212; prețurile tastate, cheile interne și coeficienții (beta) rămân cum sunt.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

test('raportul săptămânal (text): PnL, expectancy, PF și scăderile cu o zecimală', () => {
  const now = Date.now(), store = new Map([['tt_journal_v1', JSON.stringify([
    { id: 'a', sym: 'AAPL', dir: 'long', entry: 100, exit: 101.234, size: 10, fees: 0, slAtEntry: 99, status: 'closed', openTs: now - 3 * 86400000, closeTs: now - 2 * 86400000, source: 'manual' },
    { id: 'b', sym: 'MSFT', dir: 'long', entry: 100, exit: 98.765, size: 10, fees: 0, slAtEntry: 99, status: 'closed', openTs: now - 3 * 86400000, closeTs: now - 86400000, source: 'manual' }])]]);
  const c = { console, JSON, Math, Number, Intl, Date, localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) } }; c.window = c; vm.createContext(c);
  vm.runInContext(readFileSync('lib/journal.js', 'utf8'), c);
  const t = c.JR.weeklyReportText();
  assert.ok(t.length > 20, t);
  const corp = t.split('\n').slice(2).join('\n'); // primele două rânduri: titlul și data (27.10.2026)
  assert.doesNotMatch(corp, /\d\.\d\d(?!\d)/, 'două zecimale în: ' + corp); assert.match(corp, /−\$12\.3/);
});

test('afișajele rămase: fără două zecimale la rezultate (DD, expectancy, PF, R, P&L, risc)', () => {
  const html = readFileSync('journal/index.html', 'utf8');
  assert.doesNotMatch(html, /'(?:: |<\/strong>: )−\$' \+ JR\.maxDrawdown\([^)]*\)\.toFixed\(2\)/, 'alerte DD');
  assert.doesNotMatch(html, /−\$' \+ (?:JR\.maxDrawdown\(closed\)|srcDd\[k\]|regDd\[k\])\.toFixed\(2\)/, 'panoul DD');
  assert.doesNotMatch(html, /expectancyR\.toFixed\(2\)/); assert.doesNotMatch(html, /s\.pf\.toFixed\(2\)/);
  assert.doesNotMatch(readFileSync('lib/capital-desk.js', 'utf8'), /expectancyR\.toFixed\(2\)/);
  assert.doesNotMatch(readFileSync('lib/journal-workspace.js', 'utf8'), /r\.toFixed\(2\) \+ 'R'/);
  const pr = readFileSync('lib/portfolio-risk.js', 'utf8'); assert.doesNotMatch(pr, /rMult\.toFixed\(2\)/); assert.doesNotMatch(pr, /totalStopRisk\.toLocaleString\('ro-RO', \{ maximumFractionDigits: 2 \}\)/);
  const tj = readFileSync('lib/trading212-journal.js', 'utf8'); assert.doesNotMatch(tj, /v\.toFixed\(2\)\+' '\+c/); assert.doesNotMatch(tj, /gross\.toFixed\(2\)/);
});
