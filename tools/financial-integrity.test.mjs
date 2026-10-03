import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const NOW=Date.parse('2026-10-02T20:00:00Z');
function setup(files=['journal','governor','tracker']){
 const store=new Map();let fail=false;
 class Clock extends Date {constructor(...args){super(...(args.length?args:[NOW]));}static now(){return NOW;}}
 const c={Date:Clock,Intl,console,localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>{if(fail)throw Error('quota');store.set(k,String(v));}},CT:{etDay:t=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date(t??NOW))}};
 vm.createContext(c);for(const name of files)vm.runInContext(readFileSync('lib/'+name+'.js','utf8'),c);
 return {...c,store,fail:()=>{fail=true;}};
}
const base={sym:'TEST',dir:'long',entry:100,size:10,slAtEntry:95,tpAtEntry:110,openTs:NOW-86400000};
test('malformed optional exit, stop, target and fees cannot become a valid journal entry',()=>{
 const {JR}=setup();for(const patch of [{exit:'wrong'},{slAtEntry:-5},{slAtEntry:'bad'},{tpAtEntry:90},{fees:'bad'},{entry:true},{size:Infinity}])assert.equal(JR.add({...base,...patch}),null,JSON.stringify(patch));
});
test('future executions and closing before opening are rejected',()=>{const {JR}=setup();assert.equal(JR.add({...base,openTs:NOW+3600000}),null);assert.equal(JR.add({...base,exit:110,closeTs:base.openTs-1}),null);});
test('journal updates normalize form numbers and preserve coherent state',()=>{const {JR}=setup();const a=JR.add(base);assert.equal(JR.update(a.id,{entry:'101',size:'12'}),true);assert.equal(typeof JR.all()[0].entry,'number');assert.equal(JR.update(a.id,{status:'closed',exit:null}),false);});
test('an observer failure cannot report a persisted journal write as failed',()=>{const c=setup();c.JR.save([{id:1}]);c.CD={notifyChange(){throw Error('render failure');}}; // bind in the real VM global
 const src=readFileSync('lib/journal.js','utf8');const context={...c,CD:c.CD};vm.createContext(context);vm.runInContext(src,context);assert.equal(context.JR.save([{id:2}]),true);assert.equal(context.JR.all()[0].id,2);
});
test('Governor counts daily realised P&L by the close date, not the open date',()=>{const c=setup();c.store.set('tt_journal_v1',JSON.stringify([{...base,id:'a',openTs:NOW,exit:90,closeTs:NOW-86400000,status:'closed'}]));const s=c.GV.status();assert.equal(s.todayPnl,0);assert.equal(s.verdict,'HALTED');});
test('Governor excludes future profit and halts on corrupted records',()=>{const c=setup();c.store.set('tt_journal_v1',JSON.stringify([{...base,id:'a',exit:500,status:'closed',closeTs:NOW+86400000}]));const s=c.GV.status();assert.equal(s.weekPnl,0);assert.equal(s.verdict,'HALTED');});
test('invalid Governor limits do not silently produce a TRADE verdict',()=>{const c=setup();c.store.set('tt_governor_cfg_v1',JSON.stringify({maxLossPctDay:-2,maxTradesDay:'broken'}));assert.equal(c.GV.status().verdict,'HALTED');assert.equal(c.GV.saveCfg({accountSize:0}),null);});
test('legacy migration requires Journal and never clears unimported records',()=>{const c=setup(['tracker']);c.store.set('trade_plans_v1',JSON.stringify([{id:'bad',ticker:'A',entry:100,size:1,status:'open'}]));c.TT.migrateLegacy();assert.equal(JSON.parse(c.store.get('trade_plans_v1')).length,1);assert.notEqual(c.store.get(c.TT.MIGRATE_FLAG),'1');});
test('legacy migration keeps rejected plans and previous archives',()=>{const c=setup();c.store.set('trade_plans_v1',JSON.stringify([{id:'good',ticker:'A',entry:100,sl:95,size:1,status:'open',opened:NOW},{id:'bad',ticker:'B',entry:0,size:1,status:'open'}]));c.store.set(c.TT.ARCHIVE_KEY,JSON.stringify({plans:[{id:'older'}]}));c.TT.migrateLegacy();assert.equal(JSON.parse(c.store.get('trade_plans_v1'))[0].id,'bad');assert.ok(JSON.parse(c.store.get(c.TT.ARCHIVE_KEY)).plans.some(p=>p.id==='older'));});
test('tracker does not fabricate successful updates after storage failure',()=>{const c=setup();const a=c.TT.add({ticker:'A',entry:100,size:1,sl:95});c.fail();assert.equal(c.TT.update(a.id,{entry:101}),null);assert.equal(c.JR.all()[0].entry,100);});
test('failed journal synchronization does not return an imaginary saved row',()=>{const c=setup();c.JR.add({...base,srcId:'old'});c.fail();assert.equal(c.JR.syncPlan({id:'old',ticker:'TEST',entry:100,size:10,sl:95,status:'open'}),null);});
