// 19.10.2026 — I-715: arhiva zilnică a universului (toate acțiunile SUA ≥ 2 mld., datată), fără părtinirea supraviețuitorilor.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {instantaneuUnivers, caleArhivaUnivers} from './trend-12-1-lib.mjs';

const rows = [
  {symbol: 'AAA', name: 'Aaa Inc.', country: 'United States', marketCap: '5234000000', sector: 'Technology'},
  {symbol: 'BBB', name: 'Bbb Common Stock', country: 'United States', marketCap: '2100000000', sector: 'Energy'},
  {symbol: 'CCC', name: 'Ccc', country: 'United States', marketCap: '1900000000', sector: 'Energy'},
  {symbol: 'DDD', name: 'Ddd', country: 'Canada', marketCap: '9000000000', sector: 'Energy'},
  {symbol: 'EEE^A', name: 'Eee Preferred', country: 'United States', marketCap: '9000000000', sector: 'Finance'}];

test('instantaneul: toate ≥ 2 mld. din SUA, ordonate, cu data New York și capitalizarea în mld.', () => {
  const i = instantaneuUnivers(rows, '2026-10-20T01:30:00Z');
  assert.equal(i.d, '2026-10-19', 'la 01:30 UTC e încă ziua de ieri la New York');
  assert.equal(i.n, 2); assert.deepEqual(i.l, [['AAA', 5.2, 'Technology'], ['BBB', 2.1, 'Energy']]);
  assert.equal(caleArhivaUnivers(i.d), 'univers-sua-istoric/2026/2026-10-19.json.gz');
});
test('robotul scrie arhiva doar când screenerul a răspuns (nu din lista salvată)', () => {
  const s = readFileSync(new URL('./trend-12-1.mjs', import.meta.url), 'utf8');
  const i = s.indexOf('instantaneuUnivers(rows'), j = s.indexOf("} catch (e) {\n  console.error('screenerul Nasdaq"), k = s.indexOf("} catch (e) {\r\n  console.error('screenerul Nasdaq");
  assert.ok(i > 0 && i < Math.max(j, k), 'arhiva e în ramura în care screenerul a răspuns');
  assert.match(s, /zlib\.gzipSync/);
});
