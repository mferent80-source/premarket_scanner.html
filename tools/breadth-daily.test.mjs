import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import worker,{BreadthDaily,dayInBucharest,ORIGIN} from './breadth-daily-worker.mjs';
const require=createRequire(import.meta.url),client=require('../lib/breadth-daily.js');
function storage(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};}
async function object(env={GH_DISPATCH_TOKEN:'test-only'}){
 const map=new Map();let init;
 const ctx={storage:{get:async k=>map.get(k),put:async(k,v)=>map.set(k,{...v})},blockConcurrencyWhile:f=>init=f()};
 const o=new BreadthDaily(ctx,env);await init;return o;
}
test('Bucharest day changes at local midnight, including daylight saving boundary',()=>{
 assert.equal(client.day(Date.parse('2026-10-02T21:01:00Z')),'2026-10-03');
 assert.equal(dayInBucharest(Date.parse('2026-10-25T22:01:00Z')),'2026-10-26');
});
test('disabled configuration sends no request and does not mark a scan',async()=>{
 let count=0;const store=storage();const result=await client.requestDaily({config:{enabled:false},storage:store,fetch:()=>count++,now:Date.parse('2026-10-03T04:00:00Z')});
 assert.equal(result.status,'disabled');assert.equal(count,0);assert.equal(store.getItem(client.KEY),null);
});
test('same day reopening reuses request; next day requests once again',async()=>{
 const store=storage();let count=0;let now=Date.parse('2026-10-03T04:00:00Z');
 const run=()=>client.requestDaily({config:{enabled:true,endpoint:'https://worker.example/daily'},storage:store,now,fetch:async()=>{count++;const day=client.day(now);return Response.json({day,status:'queued',requestId:'open-'+day},{status:202});}});
 assert.equal((await run()).status,'queued');await run();assert.equal(count,1);
 now+=86400000;await run();assert.equal(count,2);
});
test('network failure is explicit and does not repeatedly dispatch that day',async()=>{
 const store=storage();let count=0;const opts={config:{enabled:true,endpoint:'https://worker.example/daily'},storage:store,fetch:async()=>{count++;throw Error('offline');},now:Date.parse('2026-10-03T04:00:00Z')};
 assert.equal((await client.requestDaily(opts)).status,'unknown');await client.requestDaily(opts);assert.equal(count,1);
});
test('concurrent devices dispatch only once and ignore caller workflow/ref',async()=>{
 const original=globalThis.fetch;let calls=0,resolve;const done=new Promise(r=>resolve=r);let sent;
 globalThis.fetch=async(url,options)=>{calls++;sent={url,body:JSON.parse(options.body)};await done;return new Response(null,{status:204});};
 try{const o=await object();const first=o.fetch();const second=await o.fetch();assert.equal((await second.json()).status,'requesting');resolve();const result=await first;
 assert.equal(result.status,202);assert.equal(calls,1);assert.equal(sent.body.ref,'main');assert.match(sent.url,/premarket_scanner\.html\/actions\/workflows\/pages\.yml\/dispatches$/);
 await o.fetch();assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
test('ambiguous server timeout reserves the day and cannot trigger a duplicate',async()=>{
 const original=globalThis.fetch;let count=0;globalThis.fetch=async()=>{count++;throw Error('timeout');};
 try{const o=await object();assert.equal((await(await o.fetch()).json()).status,'unknown');await o.fetch();assert.equal(count,1);}finally{globalThis.fetch=original;}
});
test('server rejects foreign origins, missing binding and unsupported methods',async()=>{
 assert.equal((await worker.fetch(new Request('https://worker.example/daily',{method:'POST',headers:{Origin:'https://foreign.example'}}),{})).status,403);
 assert.equal((await worker.fetch(new Request('https://worker.example/daily',{method:'POST',headers:{Origin:ORIGIN}}),{})).status,503);
 assert.equal((await worker.fetch(new Request('https://worker.example/daily',{headers:{Origin:ORIGIN}}),{})).status,405);
});
