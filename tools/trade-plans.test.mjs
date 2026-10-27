import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const c={Date,console};vm.createContext(c);vm.runInContext(readFileSync('lib/trade-plans.js','utf8'),c);const T=c.TradePlans;
const x={symbol:'FICTIV',mode:'momentum',currency:'USD',actionable:true,entryLow:100,entryHigh:102,stop:95,target:116,capital:10000,riskPct:.5,ts:Date.now(),sourceDate:'2026-10-02',sourceTimezone:'America/New_York',score:80};
const plan=()=>T.create({...x,ts:Date.now()},10000,.5,{id:'a'});
test('sizing uses upper entry and caps both risk and cash',()=>{const s=T.size(x);assert.equal(s.entry,102);assert.equal(s.shares,7);assert.equal(s.risk,49);assert.equal(s.rr,2);assert.equal(T.size({...x,entryLow:102,stop:101.999,target:103}).shares,98);});
test('reversed range and stop within range are rejected',()=>{for(const patch of [{entryLow:103},{stop:101},{target:101},{entryHigh:-1}])assert.equal(T.size({...x,...patch}).ok,false);});
test('unknown currencies, string numbers, non-finite budgets and unsafe quantities are blocked',()=>{for(const patch of [{currency:'EUR'},{capital:'10000'},{capital:Infinity},{riskPct:0},{riskPct:6},{capital:Number.MAX_VALUE}])assert.equal(T.size({...x,...patch}).ok,false);});
test('available loss budget and simulated exposure reduce quantity',()=>{assert.equal(T.size({...x,lossBudget:30,reservedRisk:25}).ok,false);assert.equal(T.size({...x,reservedValue:9950}).ok,false);assert.equal(T.size({...x,lossBudget:100,reservedRisk:72}).shares,4);});
test('stale candidate cannot create a plan; frozen basis survives subsequent source edit',()=>{assert.equal(T.create({...x,ts:Date.now()-1800001},10000,.5),null);const p=plan();x.stop=94;assert.equal(p.basis.stop,95);x.stop=95;});
test('only planned can trigger and triggered can close',()=>{const p=plan();assert.equal(T.transition(p,'close',{exit:110}),null);assert.equal(T.transition(p,'trigger',{fillEntry:102,allowed:false}),null);const a=T.transition(p,'trigger',{fillEntry:101,allowed:true});assert.ok(a);assert.equal(T.transition(a,'trigger',{fillEntry:101,allowed:true}),null);assert.equal(T.transition(a,'cancel'),null);});
test('fill above original risk and impossible stops are blocked',()=>{const p=plan();assert.equal(T.transition(p,'trigger',{fillEntry:103,allowed:true}),null);assert.equal(T.transition(p,'trigger',{fillEntry:95,allowed:true}),null);});
test('close uses simulated fill and fees, and original sizing remains frozen',()=>{const p=plan(),a=T.transition(p,'trigger',{fillEntry:101,allowed:true}),b=T.transition(a,'close',{exit:110,fees:2});assert.equal(b.pnl,61);assert.equal(b.rResult,61/42);assert.equal(b.basis.entryHigh,102);assert.equal(b.entry,102);assert.equal(T.validate(b).ok,true);});
test('huge exits, negative fees and repeated closes cannot enter performance',()=>{const a=T.transition(plan(),'trigger',{fillEntry:102,allowed:true});assert.equal(T.transition(a,'close',{exit:Infinity}),null);assert.equal(T.transition(a,'close',{exit:110,fees:-1}),null);const b=T.transition(a,'close',{exit:110});assert.equal(T.transition(b,'close',{exit:120}),null);assert.equal(T.closed([{...b,pnl:9999}]).length,0);});
test('future and contradictory timestamps are rejected',()=>{const p=plan();assert.equal(T.validate({...p,createdAt:Date.now()+100000}).ok,false);assert.equal(T.validate({...p,status:'TRIGGERED',triggeredAt:p.createdAt-1}).ok,false);});
test('restoring a cancelled plan does not erase its original basis',()=>{const p=plan();const a=T.transition(p,'cancel'),b=T.transition(a,'restore');assert.equal(b.status,'PLANNED');assert.equal(b.basis,p.basis);});
test('exposure refuses invalid open rows and excludes closed plans',()=>{const a=T.transition(plan(),'trigger',{fillEntry:102,allowed:true});assert.equal(T.exposure([a]).risk,49);assert.equal(T.exposure([{...a,shares:'7'}]).ok,false);assert.equal(T.exposure([T.transition(a,'close',{exit:110})]).value,0);});
test('mutations use latest storage and keep more than 30 plans',async()=>{let raw=JSON.stringify(Array.from({length:40},(_,id)=>({id})));const store={getItem:()=>raw,setItem:(k,v)=>{raw=v;}};await T.mutate(store,rows=>[{id:41},...rows]);assert.equal(JSON.parse(raw).length,41);});
test('invalid storage and quota failure preserve the source',async()=>{let raw='{wrong';const store={getItem:()=>raw,setItem(){throw Error('quota');}};await assert.rejects(T.mutate(store,a=>a));assert.equal(raw,'{wrong');raw='[]';await assert.rejects(T.mutate(store,a=>[{id:1},...a]));assert.equal(raw,'[]');});
test('optimistic check prevents overwriting a changed register',async()=>{let calls=0,wrote=false;const store={getItem:()=>calls++?'[{"id":"other"}]':'[]',setItem(){wrote=true;}};await assert.rejects(T.mutate(store,a=>a));assert.equal(wrote,false);});
// 27.10.2026 (I-752): planurile PLANNED expiră după 2 sesiuni fără SIMULEAZĂ; (I-763): bifele lui se salvează cu planul; (audit D 🔵): R:R net alături de cel brut
test('I-752: un plan PLANNED expiră la a 2-a sesiune după ziua creării (zile lucrătoare SUA); expirat ⇒ fără SIMULEAZĂ, fără restabilire, anulat cu motivul',()=>{
 const luni=Date.parse('2026-10-19T13:00:00Z');/* luni, 09:00 la New York */const p=T.create({...x,ts:luni},10000,.5,{id:'e',now:luni});
 assert.equal(T.sesiuniDupa(luni,Date.parse('2026-10-20T14:00:00Z')),1);assert.equal(T.expirat(p,Date.parse('2026-10-20T20:00:00Z')),false,'marți: o singură sesiune după');
 assert.equal(T.sesiuniDupa(luni,Date.parse('2026-10-21T12:00:00Z')),2);assert.equal(T.expirat(p,Date.parse('2026-10-21T12:00:00Z')),true,'miercuri dimineața: a 2-a sesiune');
 const vineri=Date.parse('2026-10-23T20:00:00Z');assert.equal(T.sesiuniDupa(vineri,Date.parse('2026-10-25T12:00:00Z')),0,'weekendul nu numără');assert.equal(T.sesiuniDupa(vineri,Date.parse('2026-10-27T12:00:00Z')),2);
 const miercuri=Date.parse('2026-10-21T14:00:00Z');assert.equal(T.transition(p,'trigger',{fillEntry:101,allowed:true,now:miercuri}),null,'planul expirat nu se mai simulează');
 assert.ok(T.transition(p,'trigger',{fillEntry:101,allowed:true,now:Date.parse('2026-10-20T14:00:00Z')}),'marți încă merge');
 const e=T.expira([p,{...p,id:'f',status:'CANCELLED'}],miercuri);assert.equal(e.n,1);assert.equal(e.plans[0].status,'CANCELLED');assert.match(e.plans[0].motiv,/expirat: 2 sesiuni/);assert.equal(T.validate(e.plans[0],miercuri).ok,true);assert.equal(e.plans[1].motiv,undefined);
 assert.equal(T.transition(e.plans[0],'restore',{now:miercuri}),null,'un plan expirat nu se restabilește');assert.equal(T.EXPIRA_SESIUNI,2);
});
test('I-763: bifele lui ({id,text,da}) se salvează cu planul și se validează; bife stricate ⇒ nu se salvează / planul e respins; fără bife ⇒ planul ca înainte',()=>{
 const bife=[{id:'plan',text:'Plan scris',da:true},{id:'stop',text:'Stop pus',da:false}];
 const p=T.create({...x,ts:Date.now()},10000,.5,{id:'b',bife});assert.deepEqual(JSON.parse(JSON.stringify(p.bife)),bife);assert.equal(T.validate(p).ok,true);
 assert.equal(T.validate({...p,bife:[{id:'x',text:'y',da:'da'}]}).ok,false);assert.equal(T.validate({...p,bife:'tot'}).ok,false);assert.equal(T.validate({...p,bife:[]}).ok,true);
 assert.equal(T.create({...x,ts:Date.now()},10000,.5,{id:'c',bife:[{id:1}]}).bife,undefined,'bifele stricate nu se salvează');assert.equal(plan().bife,undefined);
 assert.equal(T.bifeValide(Array.from({length:11},(_,i)=>({id:'b'+i,text:'t',da:true}))),false,'cel mult 10 bife');
});
test('audit D (🔵): R:R net (riscul pe unitate cu costul dus-întors) stă alături de cel brut',()=>{
 const s=T.size({...x,costPct:0.3});assert.equal(s.rr,2);assert.ok(s.rrNet<2&&s.rrNet>1.8,'net: '+s.rrNet);assert.equal(T.size(x).rrNet,2);
});
