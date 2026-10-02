import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const now = Date.UTC(2026,9,2,15);
function setup(){
 const store=new Map();
 class Clock extends Date { constructor(...args){super(...(args.length?args:[now]));} static now(){return now;} }
 const ctx={Date:Clock,console,setTimeout:fn=>{fn();},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)}};
 ctx.window=ctx;vm.createContext(ctx);
 for(const file of ['lib/shadow.js','lib/equity.js']) vm.runInContext(readFileSync(file,'utf8'),ctx);
 return {SH:ctx.SH,EQ:ctx.EQ,store};
}
const bar=(day,changes={})=>({t:Date.UTC(2026,8,day,13,30),o:100,h:105,l:96,c:103,...changes});
const signal={sym:'TEST',price:100,sl:95,ts:Date.UTC(2026,8,21,15),horizon:5};
const bars=()=>[bar(21),bar(22),bar(23),bar(24),bar(25),bar(28)];
test('does not finalize a five-session outcome after only one closed session',async()=>{
 const {SH}=setup();const e=SH.log(signal);assert.equal(await SH.evaluateOne(e.id,async()=>bars().slice(0,2)),null);assert.equal(SH.all()[0].evalPct,null);
});
test('waits for horizon, then exits at close and records methodology',async()=>{
 const {SH}=setup();const e=SH.log(signal);const r=await SH.evaluateOne(e.id,async()=>bars());assert.equal(r.evalPct,3);assert.equal(r.evalR,.6);assert.equal(SH.evaluated(SH.all()[0]),true);
});
test('long stop takes precedence over a later recovery',async()=>{
 const {SH}=setup();const e=SH.log(signal);const b=bars();b[2]=bar(23,{l:94,c:101});const r=await SH.evaluateOne(e.id,async()=>b);assert.equal(r.evalR,-1);assert.equal(r.exitReason,'stop');
});
test('gap through long stop fills at opening price, not ideal stop',async()=>{
 const {SH}=setup();const e=SH.log(signal);const b=bars();b[1]=bar(22,{o:90,l:88,h:103});const r=await SH.evaluateOne(e.id,async()=>b);assert.equal(r.evalR,-2);assert.equal(r.exitPrice,90);
});
test('short stop and gap use the correct side',async()=>{
 const {SH}=setup();const e=SH.log({...signal,dir:'short',sl:110});const b=bars();b[1]=bar(22,{o:120,h:125,l:101});const r=await SH.evaluateOne(e.id,async()=>b);assert.equal(r.evalR,-2);
});
test('duplicate timestamps cannot manufacture horizon completeness',async()=>{
 const {SH}=setup();const e=SH.log(signal);const b=[bar(21),...Array(5).fill(bar(22))];assert.equal(await SH.evaluateOne(e.id,async()=>b),null);
});
test('rejects history truncated past the signal',async()=>{
 const {SH}=setup();const e=SH.log(signal);assert.equal(await SH.evaluateOne(e.id,async()=>bars().slice(1)),null);
});
test('today daily bar remains incomplete',async()=>{
 const {SH}=setup();const e=SH.log({...signal,ts:Date.UTC(2026,8,28,15),horizon:4});const b=[bar(28),bar(29),bar(30),{...bar(30),t:Date.UTC(2026,9,1,13,30)},{...bar(30),t:Date.UTC(2026,9,2,13,30)}];assert.equal(await SH.evaluateOne(e.id,async()=>b),null);
});
test('old evaluations are preserved but excluded until recalculated',()=>{
 const {SH}=setup();SH.save([{...signal,id:'old',blockedBy:'gate',evalPct:25,evalR:5}]);assert.equal(SH.statsByFilter().gate.nEval,0);assert.equal(SH.filterEdge()[0].avgPct,null);
});
test('stats sample warning counts evaluated outcomes, not pending signals',()=>{
 const {SH}=setup();for(let i=0;i<12;i++)SH.log({...signal,blockedBy:'gate'});SH.updateEval(SH.all()[0].id,3,.6);assert.equal(SH.statsByFilter().gate.small,true);
});
test('retains more than 800 signals and rejects invalid stop/dates/prices',()=>{
 const {SH}=setup();for(let i=0;i<805;i++)SH.log(signal);assert.equal(SH.all().length,805);for(const x of [{price:Infinity},{sl:105},{ts:now+1},{horizon:1.5}])assert.equal(SH.log({...signal,...x}),null);
});
test('attribution reports R without assigning fictional USD size',()=>{
 const {SH,EQ}=setup();const e=SH.log({...signal,blockedBy:'gate'});SH.updateEval(e.id,3,.6);const r=EQ.shadowAttribution(30);assert.equal(r.filters.gate,.6);assert.equal(r.shadowTotalR,.6);assert.equal(r.shadowEstUsd,null);
});
test('evaluateAll reports completions rather than attempts',async()=>{
 const {SH}=setup();SH.log(signal);assert.equal(await SH.evaluateAll(async()=>bars().slice(0,2)),0);
});
test('failed storage update does not return a completed evaluation',async()=>{
 const {SH,store}=setup();const e=SH.log(signal);SH.save=()=>false;
 // Exceeding storage capacity is tested through the storage adapter.
 const original=store.set.bind(store);store.set=()=>{throw Error('quota');};
 assert.equal(await SH.evaluateOne(e.id,async()=>bars()),null);store.set=original;assert.equal(SH.all()[0].evalPct,null);
});
