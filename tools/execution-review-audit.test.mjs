import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const c={Date};vm.createContext(c);vm.runInContext(readFileSync('lib/execution-review.js','utf8'),c);
test('legacy future or unidentified fills cannot generate closed FIFO profit',()=>{
 const buy={id:'buy',ticker:'A',side:'BUY',quantity:1,price:10,priceCurrency:'USD',date:'2026-10-01T12:00Z'},sell={...buy,id:'sell',side:'SELL',price:20,date:'2026-10-02T12:00Z'};
 let r=c.ExecutionReview.fifo([buy,{...sell,date:new Date(Date.now()+3600000).toISOString()}]);assert.equal(r.matches.length,0);assert.equal(r.unmatched.length,1);
 r=c.ExecutionReview.fifo([{...buy,ticker:null},{...sell,ticker:null}]);assert.equal(r.matches.length,0);assert.equal(r.unmatched.length,2);
 assert.equal(c.ExecutionReview.fifo([buy,sell]).matches[0].gross,10);
});
