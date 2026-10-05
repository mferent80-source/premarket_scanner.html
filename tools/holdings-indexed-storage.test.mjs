import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {indexedStore}=createRequire(import.meta.url)('../lib/holdings-model-storage.js');
const tick=()=>new Promise(r=>setImmediate(r));
/* Controlled browser events distinguish request success from durable commit. */
function browser(){
 const records=new Map(),transactions=[],opens=[];let closed=0;
 const db={objectStoreNames:{contains:()=>true},close(){closed++;},transaction(name,mode){
  assert.equal(name,'reports');const tx={mode,staged:[],objectStore(){return {get(key){const request={result:records.get(key)};tx.read=request;return request;},put(value,key){tx.staged.push([key,value]);}};},abort(){tx.onabort?.();},commit(){for(const [k,v] of tx.staged)records.set(k,v);tx.oncomplete?.();}};transactions.push(tx);return tx;
 }};
 const factory={open(name,version){assert.equal(name,'tt_holdings_ai_reports_v1');assert.equal(version,1);const request={result:db};opens.push(request);queueMicrotask(()=>request.onsuccess?.());return request;}};
 return {factory,records,transactions,opens,db,closed:()=>closed};
}
test('IndexedDB request success alone never confirms saving; transaction abort preserves the previous report',async()=>{
 const b=browser(),s=indexedStore(b.factory),old='{"trainedAt":1}';b.records.set('key',old);
 const pending=s.set('key','{"trainedAt":2}');let settled=false;pending.then(()=>settled=true,()=>settled=true);await tick();const tx=b.transactions[0];tx.read.onsuccess();await tick();assert.equal(settled,false);assert.equal(b.records.get('key'),old);
 tx.error=Error('Transaction abort');tx.onabort();await assert.rejects(pending,/Transaction abort/);assert.equal(b.records.get('key'),old);
});
test('completed read/write transactions recover exactly the committed report and protect newer reports',async()=>{
 const b=browser(),s=indexedStore(b.factory),report='{"trainedAt":20,"result":"new"}';
 const write=s.set('key',report);await tick();let tx=b.transactions.at(-1);tx.read.onsuccess();tx.commit();assert.equal(await write,true);
 const read=s.get('key');await tick();tx=b.transactions.at(-1);tx.read.onsuccess();tx.commit();assert.equal(await read,report);
 const stale=s.set('key','{"trainedAt":10,"result":"old"}');await tick();tx=b.transactions.at(-1);tx.read.onsuccess();tx.commit();assert.equal(await stale,false);assert.equal(b.records.get('key'),report);
 b.db.onversionchange();assert.equal(b.closed(),1);const reconnected=s.get('missing');await tick();assert.equal(b.opens.length,2);tx=b.transactions.at(-1);tx.read.onsuccess();tx.commit();assert.equal(await reconnected,null);
});
test('blocked or timed out opens reject and late connections are closed',async()=>{
 let request;const s=indexedStore({open(){return request={result:{close(){request.closed=true;}}};}},15);
 const blocked=s.get('key');request.onblocked();await assert.rejects(blocked,/blocată/);request.onsuccess();assert.equal(request.closed,true);
 const timeout=s.get('key');await assert.rejects(timeout,/expirat/);request.onsuccess();assert.equal(request.closed,true);
});
test('transaction timeout aborts rather than claiming a persistent report',async()=>{
 const b=browser(),s=indexedStore(b.factory,15),pending=s.set('key','{"trainedAt":1}');await tick();const tx=b.transactions[0];tx.read.onsuccess();await assert.rejects(pending,/expirat/);assert.equal(b.records.has('key'),false);
});
test('a synchronous open refusal can be retried after browser access returns',async()=>{
 const b=browser();let refused=true;const s=indexedStore({open(...args){if(refused)throw Error('Refused');return b.factory.open(...args);}});
 await assert.rejects(s.get('key'),/Refused/);refused=false;const pending=s.get('key');await tick();const tx=b.transactions[0];tx.read.onsuccess();tx.commit();assert.equal(await pending,null);
});
