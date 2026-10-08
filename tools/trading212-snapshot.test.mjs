import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const now=Date.now(),older=new Date(now-600000).toISOString(),recent=new Date(now).toISOString();
function setup(data){const c={Date,localStorage:{getItem:()=>JSON.stringify(data)}};vm.createContext(c);vm.runInContext(readFileSync('lib/trading212-snapshot.js','utf8'),c);return c;}
test('active account wins over archive timestamps; demo and partial positions cannot change the selection',()=>{
 const data={archive:{environment:'live',fetchedAt:recent,positions:[{ticker:'OLD',quantity:1}]},current:{environment:'live',active:true,fetchedAt:older,positions:null},demo:{environment:'demo',active:true,fetchedAt:recent,positions:[]}},c=setup(data);
 assert.equal(c.T212Snapshot.read()[0],'current');assert.equal(c.T212Snapshot.read('demo')[0],'demo');assert.equal(c.T212Snapshot.fresh(data.current,now),false);
});
test('invalid, expired and future timestamps cannot certify freshness',()=>{
 const S=setup({}).T212Snapshot;for(const at of [null,'invalid',new Date(now+120000).toISOString(),older])assert.equal(S.fresh({fetchedAt:at},now),false);assert.equal(S.fresh({fetchedAt:recent},now),true);assert.equal(S.select([]),null);assert.equal(S.select({broken:null}),null);
});
test('Holdings consumes the same selected account as Portfolio and Coach when positions are missing',()=>{
 const data={old:{environment:'live',fetchedAt:older,positions:[{ticker:'OLD',quantity:1}]},current:{environment:'live',fetchedAt:recent,summary:{currency:'EUR'},positions:null}},c=setup(data),source=readFileSync('holdings/holdings.js','utf8');
 vm.runInContext(readFileSync('lib/trading212-daily.js','utf8'),c);
 vm.runInContext('let holdingRequest={ok:true,target:null},navigationWarning="",environment="live",dailyHistory=null,isDemo=false,scope="",snapshot=null,positions=[];'+source.slice(source.indexOf('function loadPositions()'),source.indexOf('\nfunction chart('))+'loadPositions();globalThis.result={scope,snapshot,positions};',c);
 assert.equal(c.result.scope,'current');assert.equal(c.result.positions.length,0);assert.equal(c.result.snapshot.positions,null);
});

test('direct holding analysis uses its exact Demo account and clears positions after the active account changes',()=>{
 const p={ticker:'EXACT_US_EQ',quantity:2},data={real:{environment:'live',active:true,fetchedAt:recent,positions:[p]},selected:{environment:'demo',active:true,fetchedAt:recent,positions:[p]}},c=setup(data),source=readFileSync('holdings/holdings.js','utf8');
 for(const file of ['lib/trading212-daily.js','lib/holding-handoff.js'])vm.runInContext(readFileSync(file,'utf8'),c);
 vm.runInContext('let holdingRequest={ok:true,target:{scope:"selected",environment:"demo",ticker:"EXACT_US_EQ"}},navigationWarning="",environment="demo",dailyHistory=null,isDemo=false,scope="",snapshot=null,positions=[];'+source.slice(source.indexOf('function loadPositions()'),source.indexOf('\nfunction chart('))+'loadPositions();globalThis.first={scope,positions};',c);
 assert.equal(c.first.scope,'selected');assert.equal(c.first.positions.length,1);
 delete data.selected;data.other={environment:'demo',active:true,fetchedAt:recent,positions:[p]};vm.runInContext('loadPositions();globalThis.after={scope,positions,navigationWarning};',c);assert.equal(c.after.scope,'');assert.equal(c.after.positions.length,0);assert.match(c.after.navigationWarning,/Contul selectat s-a schimbat/);
});
