import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const c={Date,Map,Set};vm.createContext(c);vm.runInContext(readFileSync('lib/portfolio-scenarios.js','utf8'),c);
const P=c.PortfolioScenarios,now=Date.parse('2026-10-09T19:00:00Z');
const scenario={pricePct:-10,fxPct:-5,sector:'*',fxCurrency:'*'},clone=x=>JSON.parse(JSON.stringify(x));
const example=()=>P.demo(now),calc=(x,s=scenario,options={})=>P.calculate(x.snapshot,x.notes,s,{now,...options});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('compound price and FX shocks retain cash and reconcile the whole account',()=>{
 const r=calc(example());assert.equal(r.complete,true);assert.equal(r.covered,3);near(r.knownDelta,-267.5);near(r.priceDelta,-200);near(r.fxDelta,-67.5);near(r.projectedTotal,2732.5);near(r.impactPct,-267.5/3000*100);assert.equal(r.cashUnchanged,1000);
 const a=r.rows.find(x=>x.ticker==='FICTIV_US');near(a.delta,-130.5);near(a.priceDelta,-90);near(a.fxDelta,-40.5);near(a.projectedValue,769.5);near(a.impliedRate,.9);assert.equal(a.stopState,'crossed');
});
test('same-account-currency positions receive no FX shock',()=>{const r=calc(example(),{...scenario,pricePct:0,fxPct:-10}),a=r.rows.find(x=>x.ticker==='FICTIV_EUR');assert.equal(a.fxPct,0);assert.equal(a.delta,0);near(r.knownDelta,-150);});
test('sector price selector and currency shock are independent',()=>{
 const r=calc(example(),{...scenario,sector:'Industrie',fxCurrency:'USD'});near(r.knownDelta,-95);assert.equal(r.priceSelected,1);assert.equal(r.fxSelected,1);near(r.rows.find(x=>x.ticker==='FICTIV_US').delta,-45);assert.equal(r.rows.find(x=>x.ticker==='FICTIV_GBP').delta,0);
});
test('pence normalize only the currency selector, preserving original prices and stops',()=>{
 const x=example(),r=calc(x,{...scenario,pricePct:0,fxCurrency:'GBP'}),p=r.rows.find(p=>p.ticker==='FICTIV_GBP');assert.equal(p.quoteCurrency,'GBP');assert.equal(p.instrumentCurrency,'GBp');near(p.impliedRate,1.2);near(p.delta,-30);assert.equal(p.projectedPrice,5000);
 x.snapshot.summary.currency='GBP';x.snapshot.summary.invested=500;x.snapshot.summary.available=500;x.snapshot.summary.totalValue=1000;x.snapshot.positions=[{...x.snapshot.positions[2],value:500,currency:'GBP'}];assert.equal(calc(x).fxSelected,0);near(calc(x).knownDelta,-50);
 x.snapshot.positions[0].instrumentCurrency='GBX';x.notes.FICTIV_GBP.stopCurrency='GBX';assert.equal(calc(x).rows[0].stopState,'crossed');
});
test('neutral, complete price loss and strengthening currencies have explicit deterministic results',()=>{
 const x=example();near(calc(x,{...scenario,pricePct:0,fxPct:0}).knownDelta,0);near(calc(x,{...scenario,pricePct:-100,fxPct:50}).projectedTotal,1000);near(calc(x,{...scenario,pricePct:10,fxPct:5}).knownDelta,282.5);
});
test('stale snapshots expose historical contributions without projecting the account',()=>{const x=example();x.snapshot.fetchedAt=new Date(now-300001).toISOString();const r=calc(x);assert.equal(r.state,'historical');near(r.knownDelta,-267.5);assert.equal(r.projectedTotal,null);assert.equal(r.totalDelta,null);assert.equal(r.impactPct,null);assert.match(r.reasons.join(' '),/5 minute/);});
test('invalid, future, unbound and wrong-environment sources do not expose aggregate results',()=>{
 for(const change of [x=>x.snapshot.fetchedAt='bad',x=>x.snapshot.fetchedAt='1',x=>x.snapshot.fetchedAt=now,x=>x.snapshot.fetchedAt=new Date(now+60001).toISOString(),x=>x.snapshot.environment='other']){const x=example();change(x);const r=calc(x);assert.equal(r.state,'unavailable');assert.equal(r.knownDelta,null);assert.equal(r.projectedTotal,null);assert.ok(r.rows.every(x=>x.delta===null));}
 assert.equal(calc(example(),scenario,{accountMatches:false}).knownDelta,null);
});
test('incomplete fields retain only calculable rows and do not label a partial sum as total',()=>{
 for(const field of ['value','currentPrice','quantity','instrumentCurrency','currency']){const x=example();x.snapshot.positions[0][field]=null;const r=calc(x);assert.equal(r.state,'partial',field);assert.equal(r.covered,2);near(r.knownDelta,-137);assert.equal(r.projectedTotal,null);assert.equal(r.totalDelta,null);assert.ok(r.rows[0].issues.length);}
});
test('duplicate, hidden malformed, zero and negative rows cannot disappear into a complete result',()=>{
 for(const p of [null,{ticker:'SHORT',quantity:-1,value:100,currentPrice:100,instrumentCurrency:'EUR',currency:'EUR'},{ticker:'EMPTY',quantity:0,value:10}]){const x=example();x.snapshot.positions.push(p);assert.equal(calc(x).complete,false);}
 const x=example();x.snapshot.positions.push(clone(x.snapshot.positions[0]));const r=calc(x);assert.equal(r.covered,2);assert.equal(r.rows.filter(x=>x.ticker==='FICTIV_US'&&x.valid).length,0);
 const z=example();z.snapshot.positions.push({ticker:'ZERO',quantity:0,value:0});assert.equal(calc(z).complete,true);
});
test('snapshot positions are authoritative and no lastComplete fallback hides partial imports',()=>{
 const x=example();x.snapshot.lastComplete=clone(x.snapshot);x.snapshot.positions=null;const r=calc(x);assert.equal(r.state,'unavailable');assert.equal(r.projectedTotal,null);assert.equal(r.rows.length,0);
 x.snapshot.positions=x.snapshot.lastComplete.positions.slice(0,2);assert.equal(calc(x).state,'partial');
});
test('unreconciled cash, investments, totals and same-currency prices block whole-account projection',()=>{
 for(const change of [x=>x.snapshot.summary.invested+=100,x=>x.snapshot.summary.available+=100,x=>x.snapshot.summary.totalValue-=100,x=>x.snapshot.positions[1].value=300,x=>x.snapshot.summary.reserved=null]){const x=example();change(x);const r=calc(x);assert.equal(r.complete,false);assert.equal(r.projectedTotal,null);}
});
test('reserved cash is counted once and leaves an explicit pending-order assumption',()=>{const x=example();x.snapshot.summary.available=800;x.snapshot.summary.reserved=200;const r=calc(x);near(r.projectedTotal,2732.5);assert.equal(r.cashUnchanged,1000);assert.match(r.reasons.join(' '),/ordinele.*nu se execută/);});
test('stops are exact-unit manual comparisons, never simulated executions',()=>{
 const x=example();x.notes.FICTIV_US.stopCurrency='EUR';assert.equal(calc(x).rows[0].stopState,'unknown');x.notes.FICTIV_US.stopCurrency='USD';x.notes.FICTIV_US.stop=110;assert.equal(calc(x).rows[0].stopState,'already-crossed');x.notes.FICTIV_US.stop=80;assert.equal(calc(x).rows[0].stopState,'above');
});
test('empty accounts and selectors yield zero only with explicit complete source data',()=>{
 const x=example();x.snapshot.positions=[];Object.assign(x.snapshot.summary,{invested:0,available:3000});const r=calc(x);assert.equal(r.complete,true);assert.equal(r.knownDelta,0);assert.equal(r.projectedTotal,3000);assert.equal(r.total,0);
 const empty=calc(example(),{...scenario,sector:'Nimic',fxCurrency:'JPY'});assert.equal(empty.knownDelta,0);assert.equal(empty.priceSelected,0);assert.match(empty.reasons.join(' '),/nu conține poziții/);
});
test('invalid scenarios are rejected instead of becoming zero or implied recommendations',()=>{
 for(const s of [{pricePct:null},{pricePct:'-10'},{pricePct:NaN},{pricePct:-101},{pricePct:101},{fxPct:Infinity},{fxPct:-101},{sector:null},{fxCurrency:'eur'}])assert.throws(()=>calc(example(),{...scenario,...s}),/Scenariu invalid/);
 assert.throws(()=>calc(example(),scenario,{now:NaN}),/Momentul/);
});
test('overflow and oversized sources cannot produce an apparently valid portfolio',()=>{
 const x=example();x.snapshot.positions[0].quantity=Number.MAX_VALUE;assert.equal(calc(x).projectedTotal,null);const y=example();y.snapshot.positions=Array.from({length:1001},(_,i)=>({...y.snapshot.positions[0],ticker:'ID'+i}));assert.equal(calc(y).knownDelta,null);assert.equal(calc(y).projectedTotal,null);
});
test('calculating a scenario preserves all source originals and never copies credentials into reports',()=>{
 const x=example();x.snapshot.apiKey='PRIVATE_SECRET';x.snapshot.owner='PRIVATE_OWNER';x.notes.FICTIV_US.text='PRIVATE_THESIS';const before=JSON.stringify(x);calc(x);assert.equal(JSON.stringify(x),before);assert.doesNotMatch(JSON.stringify(calc(x)),/PRIVATE_SECRET|PRIVATE_OWNER|PRIVATE_THESIS|apiKey/);
});
