import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const ctx={addEventListener(){}};vm.createContext(ctx);vm.runInContext(readFileSync('holdings/management.js','utf8'),ctx);const m=ctx.HoldingsManagement;
test('visit comparison never confuses ticker identity or absent trend with reversal',()=>{const old={positions:[{ticker:'A',symbol:'A',quantity:1,trend:'Ascendent'}]};assert.match(m.changes(old,{positions:[{ticker:'A',symbol:'B',quantity:2,trend:'Descendent'}]}).join(' '),/cantitate/);assert.equal(m.changes(old,{positions:[{ticker:'A',symbol:'B',quantity:1,trend:'Descendent'}]}).length,1);assert.match(m.changes(old,{positions:[]})[0],/absent/);});
test('weekly report refuses a single snapshot, future data and currency mismatch',()=>{const now=Date.parse('2026-10-03T12:00:00Z'),end={at:'2026-10-03T12:00:00Z',total:120,currency:'EUR'};assert.ok(m.weekly([end],now).reason);assert.ok(m.weekly([{at:'2026-09-26T12:00:00Z',total:100,currency:'USD'},end],now).reason);assert.ok(m.weekly([{...end,at:'2026-10-04T12:00:00Z'}],now).reason);assert.equal(m.weekly([{at:'2026-09-26T12:00:00Z',total:100,currency:'EUR'},end],now).change,20);});
