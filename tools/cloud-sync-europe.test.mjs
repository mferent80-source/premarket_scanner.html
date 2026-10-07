import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeRecord,validateValue} from '../lib/cloud-sync-model.mjs';
const key='tt_europe_signals_v1';
export const risk={currency:'RON',budget:'1000',loss:'30',fees:'5',entry:'100',fractional:false};
export function episode(symbol='SAP.DE',patch={}){
 const isin=symbol==='SAP.DE'?'DE0007164600':'GB00BP6MXD84';
 return {id:isin+':2026-10-01:earlyLong',symbol,isin,name:symbol,market:symbol==='SAP.DE'?'DE':'GB',sector:'Tech',currency:symbol==='SAP.DE'?'EUR':'GBP',category:'earlyLong',currentCategory:'earlyLong',firstDate:'2026-10-01',lastDate:'2026-10-01',firstPrice:100,lastPrice:100,firstStop:90,support:92,createdAt:1790866800000,policy:1,active:true,status:'ACTIVE',transitions:[{date:'2026-10-01',category:'earlyLong'}],outcomes:{},...patch};
}
const history=(...entries)=>({schema:1,entries});
test('Europa histories combine distinct observations and keep first-session evidence',()=>{
 const a=episode(),b=episode('SHEL.L'),m=mergeRecord(key,undefined,history(a),history(b));
 assert.deepEqual(m.conflicts,[]);assert.equal(m.value.entries.length,2);assert.deepEqual(m.value.entries.find(e=>e.id===a.id),a);validateValue(key,m.value);
});
test('identical first-session observations from two device clocks become one episode',()=>{
 const a=episode(),b=episode('SAP.DE',{createdAt:a.createdAt+30000}),m=mergeRecord(key,undefined,history(a),history(b));
 assert.deepEqual(m.conflicts,[]);assert.equal(m.value.entries.length,1);assert.equal(m.value.entries[0].createdAt,a.createdAt);
});
test('completed-session chronology wins while mature outcomes are preserved',()=>{
 const a=episode('SAP.DE',{lastDate:'2026-10-08',lastPrice:105,outcomes:{5:{date:'2026-10-08',pct:5}}});
 const b=episode('SAP.DE',{lastDate:'2026-10-15',lastPrice:110,currentCategory:'growth',confirmedAt:'2026-10-09',transitions:[...a.transitions,{date:'2026-10-09',category:'growth'}],outcomes:{10:{date:'2026-10-15',pct:10}}});
 const m=mergeRecord(key,undefined,history(a),history(b));assert.deepEqual(m.conflicts,[]);assert.equal(m.value.entries[0].lastDate,b.lastDate);assert.equal(m.value.entries[0].firstPrice,100);assert.equal(m.value.entries[0].category,'earlyLong');assert.deepEqual(Object.keys(m.value.entries[0].outcomes),['5','10']);validateValue(key,m.value);
});
test('revisions of the original plan and incompatible verified outcomes require a choice',()=>{
 const a=episode(),changed=episode('SAP.DE',{firstPrice:101});assert.ok(mergeRecord(key,undefined,history(a),history(changed)).conflicts.length);
 const l=episode('SAP.DE',{lastDate:'2026-10-08',outcomes:{5:{date:'2026-10-08',pct:5}}}),r={...l,outcomes:{5:{date:'2026-10-08',pct:6}}};
 assert.ok(mergeRecord(key,undefined,history(l),history(r)).conflicts.some(p=>p.endsWith('/outcomes/5')));
});
test('closed episodes are never reactivated by a newer independent scan',()=>{
 const l=episode('SAP.DE',{active:false,status:'INVALIDATED',lastDate:'2026-10-02',endDate:'2026-10-02'}),r=episode('SAP.DE',{lastDate:'2026-10-03'});
 assert.ok(mergeRecord(key,undefined,history(l),history(r)).conflicts.some(p=>p.endsWith('/status')));
});
test('revised historical source suspends published returns across devices',()=>{
 const l=episode('SAP.DE',{review:'Preț revizuit',lastDate:'2026-10-08'}),r=episode('SAP.DE',{lastDate:'2026-10-15',outcomes:{10:{date:'2026-10-15',pct:10}}}),m=mergeRecord(key,undefined,history(l),history(r));
 assert.equal(m.value.entries[0].review,l.review);assert.deepEqual(m.value.entries[0].outcomes,{});
});
test('overlapping independently started episodes do not silently double-count performance',()=>{
 const a=episode(),b=episode('SAP.DE',{firstDate:'2026-10-02',lastDate:'2026-10-02',id:'DE0007164600:2026-10-02:earlyLong',transitions:[{date:'2026-10-02',category:'earlyLong'}]});
 assert.ok(mergeRecord(key,undefined,history(a),history(b)).conflicts.length);
 const closed={...a,active:false,status:'LEFT',endDate:'2026-10-01'};assert.deepEqual(mergeRecord(key,undefined,history(closed),history(b)).conflicts,[]);
});
test('closed signals still accept forward returns after their exit date',()=>{
 validateValue(key,history(episode('SAP.DE',{active:false,status:'LEFT',endDate:'2026-10-02',lastDate:'2026-10-02',outcomes:{20:{pct:7,date:'2026-10-29'}}})));
});
test('malformed dates, IDs, duplicate observations and invalid risk data cannot enter cloud',()=>{
 for(const patch of [{firstDate:'2026-99-01'},{id:'wrong'},{firstStop:0},{lastPrice:NaN},{status:'LEFT'},{transitions:[{date:'2026-10-02',category:'growth'}]}])assert.throws(()=>validateValue(key,history(episode('SAP.DE',patch))),/invalid_value/);
 assert.throws(()=>validateValue(key,history(episode(),episode())),/invalid_value/);
 validateValue('tt_europe_risk_settings_v1',risk);
 for(const patch of [{currency:'GBX'},{budget:''},{loss:'2000'},{fees:-1},{fractional:'true'}])assert.throws(()=>validateValue('tt_europe_risk_settings_v1',{...risk,...patch}),/invalid_value/);
});
test('risk policy does not silently combine a PC budget with a phone loss limit',()=>{
 const m=mergeRecord('tt_europe_risk_settings_v1',risk,{...risk,budget:'2000'},{...risk,loss:'50'});assert.equal(m.conflicts.length,1);
});
test('one device cannot rewrite first-session evidence accepted by both devices',()=>{
 const a=history(episode()),r=history(episode('SAP.DE',{firstStop:80}));assert.ok(mergeRecord(key,a,a,r).conflicts.length);
});
test('a newer snapshot preserves earlier confirmation transitions',()=>{
 const a=episode('SAP.DE',{lastDate:'2026-10-08',currentCategory:'growth',confirmedAt:'2026-10-07',transitions:[{date:'2026-10-01',category:'earlyLong'},{date:'2026-10-07',category:'growth'}]}),b=episode('SAP.DE',{lastDate:'2026-10-09'}),m=mergeRecord(key,undefined,history(a),history(b));
 assert.equal(m.value.entries[0].confirmedAt,'2026-10-07');assert.equal(m.value.entries[0].transitions.length,2);validateValue(key,m.value);
});
test('retention can remove unchanged closed observations, but never silently remove an active one',()=>{
 const closed=episode('SAP.DE',{active:false,status:'LEFT',endDate:'2026-10-01'}),b=history(closed),m=mergeRecord(key,b,b,history());assert.deepEqual(m,{value:history(),conflicts:[]});
 const active=history(episode());assert.ok(mergeRecord(key,active,active,history()).conflicts.length);
});
