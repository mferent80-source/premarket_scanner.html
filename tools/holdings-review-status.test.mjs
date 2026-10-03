import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const now=Date.parse('2026-10-03T21:30:00Z'),context={Date,Intl,URL,setTimeout,clearTimeout,AbortController};vm.createContext(context);for(const file of ['lib/daily-series.js','lib/holdings-events.js','lib/holdings-review.js'])vm.runInContext(readFileSync(file,'utf8'),context);
const assess=context.HoldingsReview.assess,p={ticker:'A_US_EQ',instrumentCurrency:'USD'},m={currency:'USD',symbol:'A',price:100,medium:'Ascendent',regime:{confirmed:'up',warnings:[]}};
test('missing EOD cannot produce a reassuring review verdict',()=>{const r=assess(p,null,{},null,'A',now);assert.equal(r.kind,'check');assert.equal(r.review,false);assert.match(r.reasons[0],/lipsă/);});
test('stop comparisons require matching listing currency and normalize pence',()=>{
 assert.equal(assess(p,m,{stop:101},null,'A',now).review,true);
 assert.equal(assess(p,{...m,currency:'EUR'},{stop:101},null,'A',now).review,false);
 assert.equal(assess({...p,instrumentCurrency:'GBp'},{...m,currency:'GBX'},{stop:101},null,'A',now).review,true);
 assert.equal(assess(p,{...m,price:NaN},{stop:101},null,'A',now).review,false);
});
test('stale, wrong-symbol and malformed calendars do not trigger upcoming earnings',()=>{
 const event={symbol:'A',fetchedAt:now,earnings:{date:'2026-10-05',status:'ESTIMARE PROVIDER',source:'Test'}};
 assert.equal(assess(p,m,{},event,'A',now).review,true);
 for(const e of [{...event,symbol:'B'},{...event,fetchedAt:now-31*60000},{...event,earnings:{...event.earnings,date:'2026-02-30'}}]){const r=assess(p,m,{},e,'A',now);assert.equal(r.review,false);assert.equal(r.earnings,null);}
});
test('manual earnings remain explicitly manual and conflicting near dates still require review',()=>{
 const event={symbol:'A',fetchedAt:now,earnings:{date:'2026-11-15',status:'ESTIMARE PROVIDER',source:'Test'}};
 const r=assess(p,m,{earnings:'2026-10-05'},event,'A',now);assert.equal(r.review,true);assert.match(r.reasons[0],/REPER MANUAL/);assert.equal(r.earnings.date,'2026-11-15');
});
test('plan due dates use Bucharest calendar day after midnight and validate input',()=>{
 assert.equal(assess(p,m,{plan:{review:'2026-10-04'}},null,'A',now).review,true);
 assert.equal(assess(p,m,{plan:{review:'2026-10-05'}},null,'A',now).review,false);
 assert.equal(assess(p,m,{plan:{review:'2026-02-30'}},null,'A',now).review,false);
});
test('isolated warnings stay in monitoring and multiple regime warnings request review',()=>{
 assert.equal(assess(p,{...m,regime:{confirmed:'up',warnings:[{text:'One'}]}},{},null,'A',now).kind,'watch');
 assert.equal(assess(p,{...m,regime:{confirmed:'up',warnings:[{},{}]}},{},null,'A',now).kind,'review');
 assert.equal(assess(p,m,{fundamental:'slăbită'},null,'A',now).kind,'review');
});
