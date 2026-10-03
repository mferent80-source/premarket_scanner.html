import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const script=[...readFileSync('app/status/index.html','utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)[1];
async function setup(scan,portfolio={}){
 const storage=new Map([['ce_results_v2',JSON.stringify(scan)],['tt_trading212_portfolio_v1',JSON.stringify(portfolio)]]),ids=new Map(),element=id=>{if(!ids.has(id))ids.set(id,{});return ids.get(id);};
 const c={Date,URL,navigator:{},location:{origin:'https://example.test'},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{getElementById:element},TTBreadth:{load:async()=>{throw Error('unavailable');}},fetch:async()=>({ok:true,json:async()=>({enabled:false})})};c.window=c;c.parent=c;vm.createContext(c);vm.runInContext(readFileSync('lib/trading212-snapshot.js','utf8'),c);vm.runInContext(script,c);for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));return element;
}
test('Health cannot label future or string-valued scan timestamps as recent',async()=>{
 for(const updatedAt of [Date.now()+3600000,String(Date.now()),NaN]){const el=await setup({updatedAt});assert.equal(el('scan').textContent,'DATĂ INVALIDĂ');assert.match(el('scanText').textContent,/nu este considerată recentă/);}
 const el=await setup({updatedAt:Date.now()});assert.equal(el('scan').textContent,'0 MIN');
});
test('Health reports a recent partial broker snapshot as partial using the shared active account',async()=>{
 const el=await setup(null,{archive:{environment:'live',fetchedAt:new Date().toISOString(),summary:{},positions:[]},current:{environment:'live',active:true,fetchedAt:new Date().toISOString(),summary:{currency:'EUR'},positions:null}});
 assert.equal(el('broker').textContent,'SNAPSHOT PARȚIAL');assert.match(el('brokerText').textContent,/PARȚIAL/);
});
