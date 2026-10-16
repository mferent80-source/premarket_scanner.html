import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {KEYS,mergeRecord,validateValue,ForecastCloud as C} from '../lib/cloud-sync-model.mjs';
const L='tt_holdings_forecast_v1:live%3Aa|NVDA_US_EQ|NVDA|USD|market',V='holdings-forecast-v1';
const NOW=Date.now(),DAY=864e5;
const entry=(id,t,extra={})=>({id,model:'neural',capturedAt:t+1000,source:{t,asOf:'x'},estimate:{classIndex:2},verification:{state:'pending',checkedAt:0},...extra});
const inBucket=(key,n=40,ledger=L)=>{const out=[];for(let i=0;out.length<n&&i<20000;i++){const id='f'+i;if(C.bucket(ledger,id)===key)out.push(id);}return out;};
const K=C.keys[5],[a,b,c]=inBucket(K,3),T=NOW-5*DAY;
const value=(...rows)=>({version:C.VERSION,ledgers:{[L]:{version:V,entries:rows}}});
const ids=v=>v.ledgers[L].entries.map(x=>x.id);

test('64 de pachete noi în cheile sincronizate; pachetul depinde de poziție și de estimare',()=>{
 assert.equal(C.keys.length,64);assert.ok(C.keys.every(k=>KEYS.includes(k)));
 assert.equal(C.bucket(L,'abc'),C.bucket(L,'abc'));
 const spread=new Set(Array.from({length:200},(_,i)=>C.bucket('tt_holdings_forecast_v1:p'+i,'neural|2026-10-15')));assert.ok(spread.size>40,'aceeași estimare la poziții diferite se împrăștie');
});
test('unirea adună estimările de pe ambele dispozitive și nu șterge nimic',()=>{
 const r=mergeRecord(K,undefined,value(entry(c,T+3)),value(entry(a,T+1),entry(b,T+2)));assert.deepEqual(r.conflicts,[]);
 assert.deepEqual(ids(r.value),[a,b,c]);
 assert.equal(mergeRecord(K,r.value,value(entry(a,T+1)),r.value).value.ledgers[L].entries.length,3,'o copie mai veche nu șterge');
});
test('unirea dă același rezultat în orice ordine (altfel două dispozitive se rescriu la nesfârșit)',()=>{
 const pc=entry(a,T,{capturedAt:T+5000,trainedAt:1}),phone=entry(a,T,{capturedAt:T+2000,trainedAt:2});
 const x=mergeRecord(K,undefined,value(pc),value(phone)).value,y=mergeRecord(K,undefined,value(phone),value(pc)).value;
 assert.deepEqual(x,y);assert.equal(x.ledgers[L].entries[0].capturedAt,T+2000,'câștigă estimarea notată prima');
 const o1=entry(b,T,{outcome:{path:[1],checkedAt:10},verification:{state:'verified',checkedAt:10}}),o2=entry(b,T,{outcome:{path:[2],checkedAt:20},verification:{state:'verified',checkedAt:20}});
 const p=mergeRecord(K,undefined,value(o1),value(o2)).value,q=mergeRecord(K,undefined,value(o2),value(o1)).value;assert.deepEqual(p,q);
 assert.equal(p.ledgers[L].entries[0].verification.state,'unverifiable');assert.deepEqual(p.ledgers[L].entries[0].outcome.path,[1]);
 const done=entry(c,T,{outcome:{path:[3],checkedAt:9},verification:{state:'verified',checkedAt:9}});
 assert.deepEqual(mergeRecord(K,undefined,value(entry(c,T)),value(done)).value,mergeRecord(K,undefined,value(done),value(entry(c,T))).value);
 assert.equal(mergeRecord(K,undefined,value(entry(c,T)),value(done)).value.ledgers[L].entries[0].verification.state,'verified','verificarea mai recentă câștigă');
});
test('în cloud circulă doar ultimele 90 de zile; un pachet prea mare își lasă afară cele mai vechi estimări',()=>{
 const old=entry(a,NOW-200*DAY),fresh=entry(b,NOW-DAY);
 assert.deepEqual(ids(mergeRecord(K,undefined,value(old,fresh),undefined).value),[b]);
 const big=inBucket(K,600).map((id,i)=>entry(id,NOW-80*DAY+i*1000,{pad:'x'.repeat(5000)}));
 const v=C.cloudValue({[L]:{version:V,entries:big}},NOW);assert.ok(new TextEncoder().encode(JSON.stringify(v)).length<=900000);
 assert.ok(v.ledgers[L].entries.length<big.length);assert.equal(v.ledgers[L].entries.at(-1).id,big.at(-1).id,'cele noi rămân');
});
test('versiuni diferite ale registrului nu se amestecă, iar alegerea nu depinde de ordine',()=>{
 const x={version:'holdings-forecast-v0',entries:[entry(b,T)]},y={version:V,entries:[entry(a,T)]};
 assert.deepEqual(C.mergeLedger(x,y),C.mergeLedger(y,x));assert.equal(C.mergeLedger(x,y).version,V);
});
test('validarea: estimarea în alt pachet, identitate străină sau id dublat sunt respinse',()=>{
 assert.equal(validateValue(K,value(entry(a,T))),true);
 const other=inBucket(C.keys[6],1)[0];assert.throws(()=>validateValue(K,value(entry(other,T))),/invalid_forecast_ledger/);
 assert.throws(()=>validateValue(K,{version:C.VERSION,ledgers:{'alta_cheie':{version:V,entries:[]}}}),/invalid_forecast_ledger/);
 assert.throws(()=>validateValue(K,value(entry(a,T),entry(a,T))),/invalid_forecast_ledger/);
 assert.throws(()=>validateValue(K,{version:'x',ledgers:{}}),/invalid_forecast_ledger/);
});
test('serviciul: aplicațiile vechi (index=1) nu primesc pachetele noi, cele noi (index=2) da; încărcarea completă le exclude',()=>{
 const w=readFileSync('tools/cloud-sync-worker.mjs','utf8');
 assert.match(w,/name==='index'&&\(key==='1'\|\|key==='2'\)/);assert.match(w,/key==='2'\|\|!ForecastCloud\.isBucket\(row\.key\)/);assert.match(w,/!KEYS\.includes\(r\.key\)\|\|ForecastCloud\.isBucket\(r\.key\)/);
 const c=readFileSync('app/cloud-sync.js','utf8');assert.match(c,/records\?index=2/);
});
