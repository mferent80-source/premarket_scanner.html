import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {KEY,create,indexedStore}=createRequire(import.meta.url)('../europe-stocks/cache.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const snapshot={schema:3,updatedAt:1791394200000,items:[{symbol:'SAP.DE',chart:[{t:1,c:100},{t:2,c:101}]}]};
function browser(){
  const records=new Map(),transactions=[],opens=[];let closed=0;
  const db={objectStoreNames:{contains:()=>true},close(){closed++;},transaction(name,mode){
    assert.equal(name,'scans');const tx={mode,staged:[],objectStore(){return {
      get(key){assert.equal(key,KEY);tx.request={result:records.get(key)};return tx.request;},
      put(value,key){assert.equal(key,KEY);tx.staged.push([key,value]);tx.request={result:key};return tx.request;}
    };},abort(){tx.aborted=true;tx.onabort?.();},commit(){if(tx.aborted)return;for(const [key,value] of tx.staged)records.set(key,value);tx.oncomplete?.();}};
    transactions.push(tx);return tx;
  }};
  const factory={open(name,version){assert.equal(name,'tt_europe_scan_cache_v1');assert.equal(version,1);const request={result:db};opens.push(request);queueMicrotask(()=>request.onsuccess?.());return request;}};
  return {factory,db,records,transactions,opens,closed:()=>closed};
}
function local(quota=false){
  const records=new Map([['tt_journal_v1','private journal'],['tt_europe_signals_v1','signal history'],['tt_europe_risk_settings_v1','risk settings'],['tt_cloud_owner','owner'],[KEY,'old scan']]);
  const writes=[];return {records,writes,getItem:key=>records.get(key)??null,setItem(key,value){writes.push(key);assert.equal(key,KEY);if(quota)throw Object.assign(Error('full'),{name:'QuotaExceededError'});records.set(key,value);},removeItem(){throw Error('No records may be deleted');}};
}
test('a full localStorage cannot prevent committed scan recovery on a fresh page',async()=>{
  const b=browser(),storage=local(true),before=[...storage.records],store=create(storage,{factory:b.factory});
  let saved=false;const pending=store.save(snapshot);pending.then(()=>saved=true);await tick();let tx=b.transactions.at(-1);tx.request.onsuccess();await tick();assert.equal(saved,false);tx.commit();assert.equal(await pending,'indexeddb');
  assert.deepEqual([...storage.records],before);assert.deepEqual(storage.writes,[]);
  const restored=create(storage,{factory:b.factory}).read();await tick();tx=b.transactions.at(-1);tx.request.onsuccess();tx.commit();assert.deepEqual(await restored,snapshot);assert.equal(b.closed(),2);
});
test('an aborted write never claims success or replaces the preceding scan',async()=>{
  const b=browser(),storage=local(true);b.records.set(KEY,JSON.stringify({old:true}));
  const pending=create(storage,{factory:b.factory}).save(snapshot);await tick();const tx=b.transactions.at(-1);tx.request.onsuccess();tx.abort();await assert.rejects(pending,/full/);assert.equal(b.records.get(KEY),'{"old":true}');assert.equal(storage.records.get(KEY),'old scan');
});
test('unavailable or failed IndexedDB falls back to only the legacy scan key',async()=>{
  for(const durable of [null,{write:async()=>{throw Error('denied');}}]){
    const storage=local(),before=new Map(storage.records),store=create(storage,{durable});assert.equal(await store.save(snapshot),'local');assert.deepEqual(JSON.parse(storage.records.get(KEY)),snapshot);
    for(const [key,value] of before)if(key!==KEY)assert.equal(storage.records.get(key),value);
  }
});
test('blocked and timed out database access closes late connections',async()=>{
  for(const blocked of [true,false]){
    let request,closed=0;const durable=indexedStore({open(){return request={result:{close(){closed++;}}};}},{timeoutMs:10});const pending=durable.read();if(blocked)request.onblocked();await assert.rejects(pending,/scan_cache_/);request.onsuccess();assert.equal(closed,1);
  }
});
test('a transaction timeout aborts rather than recording a successful save',async()=>{
  const b=browser(),storage=local(true),pending=create(storage,{durable:indexedStore(b.factory,{timeoutMs:10})}).save(snapshot);await tick();const tx=b.transactions.at(-1);tx.request.onsuccess();await assert.rejects(pending,/full/);assert.equal(tx.aborted,true);assert.equal(b.records.size,0);
});
test('serialization and read errors leave both copies intact',async()=>{
  const storage=local(),before=[...storage.records],b=browser();b.records.set(KEY,'old scan');
  await assert.rejects(create(storage,{factory:b.factory}).save({value:1n}));assert.deepEqual([...storage.records],before);assert.equal(b.transactions.length,0);
  const corrupt=create(storage,{durable:{read:async()=>'{corrupt'}});await assert.rejects(corrupt.read());assert.equal(b.records.get(KEY),'old scan');
});
