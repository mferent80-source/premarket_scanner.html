const test=require('node:test'),assert=require('node:assert/strict');
const B=require('../lib/breadth.js');
const now=Date.parse('2026-10-02T17:00:00Z');
function data(){return {schemaVersion:1,checkedAt:'2026-10-02T16:00:00Z',sources:{uptrend:{fetchStatus:'OK',asOf:'2026-10-01',market:{date:'2026-10-01',count:414,total:2789,ratio:.1484,trend:'up'},sectors:[]},sp500:{fetchStatus:'OK',asOf:'2026-09-24',latest:{above200:.47}}}};}
test('current aggregate remains usable while SP500 is stale',()=>{const b=B.view(data(),now);assert.equal(b.stale,false);assert.equal(b.stance,'PRUDENȚĂ');assert.equal(b.sp500.usable,false);assert.equal(b.partial,true);assert.equal(b.index,14.84);});
test('expired aggregate cannot influence risk',()=>{const x=data();x.sources.uptrend.asOf='2026-09-22';const b=B.view(x,now);assert.equal(b.stale,true);assert.equal(b.stance,'NEVERIFICAT');assert.equal(b.index,null);});
test('retained recent source with fetch error is excluded',()=>{const x=data();x.sources.uptrend.fetchStatus='ERROR';assert.equal(B.view(x,now).stale,true);});
test('future source and invalid calendar date rejected',()=>{assert.equal(B.source({asOf:'2026-10-03',fetchStatus:'OK'},now).usable,false);assert.equal(B.age('2026-02-31',now),999);});
test('weekend does not stale Friday EOD',()=>{assert.equal(B.age('2026-10-02',Date.parse('2026-10-04T12:00:00Z')),0);});
test('midnight UTC uses New York observation date',()=>{assert.equal(B.age('2026-10-02',Date.parse('2026-10-03T00:30:00Z')),0);});
test('zero participation is valid and defensive',()=>{const x=data();x.sources.uptrend.market.ratio=0;const b=B.view(x,now);assert.equal(b.index,0);assert.equal(b.stance,'RISK-OFF');});
test('missing sources cannot synthesize current date',()=>{const b=B.view({schemaVersion:1,sources:{}},now);assert.equal(b.date,'indisponibil');assert.equal(b.stale,true);});
test('sector date does not inherit aggregate date',()=>{const x=data();x.sources.uptrend.sectors=[{name:'Technology',date:'2026-09-22',ratio:.9}];const b=B.view(x,now);assert.equal(b.sectors[0].usable,false);});
test('contract rejects unsupported schema',()=>{assert.throws(()=>B.view({schemaVersion:2,sources:{}},now));});
