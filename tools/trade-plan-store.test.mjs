import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {create,indexedStore}=createRequire(import.meta.url)('../lib/trade-plan-store.js');
const KEY='tt_trade_plans_v1',tick=()=>new Promise(r=>setImmediate(r));
function legacy(rows=[],quota=true){let raw=JSON.stringify(rows),writes=0;return {get raw(){return raw;},get writes(){return writes;},set raw(v){raw=v;},getItem:()=>raw,setItem(k,v){assert.equal(k,KEY);writes++;if(quota)throw Error('quota');raw=v;},removeItem(){raw=null;}};}
function backup(){let record=null,tail=Promise.resolve();return {get record(){return record;},set record(x){record=x;},read:async()=>structuredClone(record),update(fn){const pending=tail.then(()=>{const result=fn(structuredClone(record));record=structuredClone(result.record);return result.value;});tail=pending.catch(()=>{});return pending;}};}
const old=()=>Array.from({length:40},(_,i)=>({id:'old-'+i,note:'original '+i,status:'CLOSED'}));
test('quota cannot prevent a confirmed backup and all older plans survive a fresh page',async()=>{
  const storage=legacy(old()),durable=backup(),before=storage.raw,s=create(storage,{durable,notify:false});
  const saved=await s.mutate(rows=>[{id:'new',status:'PLANNED'},...rows]);assert.equal(saved.plans.length,41);assert.equal(saved.state,'indexeddb');assert.equal(storage.writes,0);assert.equal(storage.raw,before);
  const fresh=create(storage,{durable,notify:false}),restored=await fresh.read();assert.equal(restored.plans[0].id,'new');assert.deepEqual(restored.plans.slice(1),old());assert.equal(restored.state,'indexeddb');assert.equal(await fresh.archive(),saved.raw);
});
test('simulated entries, exits and immutable basis survive reloading exactly',async()=>{
  const storage=legacy(),durable=backup(),s=create(storage,{durable,notify:false}),plan={id:'p',status:'PLANNED',entry:102,stop:95,target:116,basis:{asOf:'2026-10-02',entryHigh:102,stop:95}};
  await s.mutate(rows=>[plan,...rows]);await s.mutate(rows=>rows.map(p=>({...p,status:'TRIGGERED',fillEntry:101})));await s.mutate(rows=>rows.map(p=>({...p,status:'CLOSED',exit:110,fees:2,pnl:61})));
  const fresh=create(storage,{durable,notify:false}),row=(await fresh.read()).plans[0];assert.equal(row.status,'CLOSED');assert.equal(row.fillEntry,101);assert.equal(row.pnl,61);assert.deepEqual(row.basis,plan.basis);
});
test('two page instances mutate the latest committed register rather than cached rows',async()=>{
  const storage=legacy(),durable=backup(),a=create(storage,{durable,notify:false}),b=create(storage,{durable,notify:false});
  await Promise.all([a.mutate(rows=>[{id:'a'},...rows]),b.mutate(rows=>[{id:'b'},...rows])]);assert.deepEqual((await a.read()).plans.map(p=>p.id),['b','a']);assert.equal(durable.record.revision,2);
});
test('a failed or nonserializable change preserves both copies and can be retried',async()=>{
  const storage=legacy([{id:'old'}]),durable=backup(),s=create(storage,{durable,notify:false});await s.mutate(rows=>[{id:'first'},...rows]);const before=structuredClone(durable.record);
  for(const fn of [()=>{throw Error('invalid risk');},()=>({id:'wrong'}),()=>[{id:1n}]])await assert.rejects(s.mutate(fn));assert.deepEqual(durable.record,before);assert.equal(storage.raw,'[{"id":"old"}]');
  await s.mutate(rows=>[{id:'retry'},...rows]);assert.equal((await s.read()).plans.length,3);
});
test('corrupt legacy or backup records block mutation rather than replacing the history',async()=>{
  for(const bad of ['{broken','{}','null']){const storage=legacy(),durable=backup();storage.raw=bad;const s=create(storage,{durable,notify:false});await assert.rejects(s.read());await assert.rejects(s.mutate(()=>[]));assert.equal(storage.raw,bad);assert.equal(durable.record,null);}
  const storage=legacy([{id:'old'}]),durable=backup();durable.record={raw:'{}',localRaw:storage.raw,revision:1};const s=create(storage,{durable,notify:false});await assert.rejects(s.mutate(()=>[]));assert.equal(durable.record.raw,'{}');
});
test('disjoint legacy imports and saved plans are merged without dropping or truncating rows',async()=>{
  const storage=legacy([{id:'old',note:'base'}]),durable=backup(),s=create(storage,{durable,notify:false});await s.mutate(rows=>[{id:'new',note:'backup'},...rows]);storage.raw=JSON.stringify([{id:'imported'},{id:'old',note:'legacy-edit'}]);
  const rows=(await s.read()).plans;assert.deepEqual(rows.map(p=>p.id),['new','old','imported']);assert.equal(rows.find(p=>p.id==='old').note,'legacy-edit');
  await s.mutate(rows=>[{id:'another'},...rows]);assert.equal((await s.read()).plans.length,4);
});
test('conflicting edits to the same plan freeze saving and export both original copies',async()=>{
  const storage=legacy([{id:'a',note:'base'}]),durable=backup(),s=create(storage,{durable,notify:false});await s.mutate(rows=>rows.map(p=>({...p,note:'backup-edit'})));const before=structuredClone(durable.record);storage.raw='[{"id":"a","note":"legacy-edit"}]';
  await assert.rejects(s.read(),/incompatibile/);await assert.rejects(s.mutate(rows=>rows),/incompatibile/);assert.deepEqual(durable.record,before);
  const archive=JSON.parse(await s.archive());assert.equal(archive.format,'tt-trade-plans-recovery-v1');assert.equal(JSON.parse(archive.legacy)[0].note,'legacy-edit');assert.equal(JSON.parse(archive.backup.raw)[0].note,'backup-edit');
});
test('independent legacy removal is retained but deleting a concurrently edited row conflicts',async()=>{
  const storage=legacy([{id:'a'},{id:'b',note:'base'}]),durable=backup(),s=create(storage,{durable,notify:false});await s.mutate(rows=>[{id:'new'},...rows]);storage.raw='[{"id":"b","note":"base"}]';assert.deepEqual((await s.read()).plans.map(p=>p.id),['new','b']);
  const second=legacy([{id:'b',note:'base'}]),d=backup(),s2=create(second,{durable:d,notify:false});await s2.mutate(rows=>rows.map(p=>({...p,note:'edit'})));second.raw=null;await assert.rejects(s2.read(),/incompatibile/);
});
test('a denied legacy read is safe only when a confirmed backup exists',async()=>{
  const storage=legacy([{id:'old'}]),durable=backup(),s=create(storage,{durable,notify:false});await s.mutate(rows=>[{id:'new'},...rows]);storage.getItem=()=>{throw Error('denied');};assert.equal((await s.read()).plans.length,2);await s.mutate(rows=>[{id:'third'},...rows]);assert.equal((await s.read()).plans.length,3);
  const empty=backup();await assert.rejects(create(storage,{durable:empty,notify:false}).read(),/nu poate fi citit/);
});
test('unavailable backup access cannot silently resurrect an older local register',async()=>{
  const storage=legacy([{id:'old'}]),s=create(storage,{durable:{read:async()=>{throw Error('Unavailable');},update:async()=>{throw Error('Unavailable');}},notify:false});await assert.rejects(s.read());await assert.rejects(s.mutate(rows=>rows));assert.equal(storage.writes,0);
});
test('legacy-only browsers still enforce quota failures, optimistic checks and complete export',async()=>{
  const storage=legacy([{id:'old'}]),s=create(storage,{durable:null,notify:false});await assert.rejects(s.mutate(rows=>[{id:'new'},...rows]),/refuzat salvarea/);assert.equal((await s.read()).plans.length,1);assert.equal(await s.archive(),storage.raw);
  const writable=legacy([],false),normal=create(writable,{durable:null,notify:false});await normal.mutate(rows=>[{id:'saved'},...rows]);assert.equal((await normal.read()).state,'local');
  await assert.rejects(normal.mutate(rows=>{writable.raw='[{"id":"other"}]';return rows;}),/incompatibile/);assert.equal(writable.raw,'[{"id":"other"}]');
});
test('cloud replacement compares against the current register in the write transaction',async()=>{
  const storage=legacy([{id:'old'}]),durable=backup(),s=create(storage,{durable,notify:false});await s.mutate(rows=>[{id:'new'},...rows]);await assert.rejects(s.replace([{id:'old'}],[{id:'remote'}]),/s-a modificat/);assert.equal((await s.read()).plans.length,2);
  const expected=(await s.read()).plans;assert.equal(await s.replace(expected,[...expected,{id:'remote'}]),true);assert.equal((await s.read()).plans.length,3);assert.equal(storage.writes,0);
  await s.replace((await s.read()).plans,undefined);assert.equal((await s.read()).raw,null);assert.equal(storage.raw,'[{"id":"old"}]');
});
test('missing, duplicate or contradictory identities are preserved but never merged blindly',async()=>{
  const storage=legacy([{note:'old'}]),durable=backup(),s=create(storage,{durable,notify:false});await s.mutate(rows=>[{id:'new'},...rows]);storage.raw='[{"note":"changed"}]';await assert.rejects(s.read(),/incompatibile/);
});
/* Request success and transaction commit are deliberately controlled separately. */
function browser(){const records=new Map(),transactions=[],opens=[];let closed=0;const db={objectStoreNames:{contains:()=>true},close(){closed++;},transaction(name,mode){assert.equal(name,'register');const tx={mode,staged:[],objectStore(){return{get(key){const r={result:records.get(key)};tx.read=r;return r;},put(value,key){tx.staged.push([key,structuredClone(value)]);}};},abort(){tx.onabort?.();},commit(){for(const [k,v] of tx.staged)records.set(k,v);tx.oncomplete?.();}};transactions.push(tx);return tx;}};const factory={open(name,version){assert.equal(name,'tt_trade_plans_store_v1');assert.equal(version,1);const r={result:db};opens.push(r);queueMicrotask(()=>r.onsuccess?.());return r;}};return{records,transactions,opens,db,factory,closed:()=>closed};}
test('request success never confirms persistence, and an abort preserves the preceding register',async()=>{
  const b=browser(),durable=indexedStore(b.factory),storage=legacy([{id:'old'}]),s=create(storage,{durable,notify:false});let done=false;const pending=s.mutate(rows=>[{id:'new'},...rows]);pending.then(()=>done=true,()=>done=true);await tick();const tx=b.transactions[0];tx.read.onsuccess();await tick();assert.equal(done,false);assert.equal(b.records.size,0);tx.onabort();await assert.rejects(pending,/nu este confirmată/);assert.equal(b.records.size,0);assert.equal(storage.raw,'[{"id":"old"}]');
});
test('a completed browser transaction recovers precisely the committed register',async()=>{
  const b=browser(),durable=indexedStore(b.factory),s=create(legacy([{id:'old'}]),{durable,notify:false});const saved=s.mutate(rows=>[{id:'new'},...rows]);await tick();let tx=b.transactions.at(-1);tx.read.onsuccess();tx.commit();assert.equal((await saved).plans.length,2);
  const restored=s.read();await tick();tx=b.transactions.at(-1);tx.read.onsuccess();tx.commit();assert.deepEqual((await restored).plans.map(p=>p.id),['new','old']);b.db.onversionchange();assert.equal(b.closed(),1);
});
test('blocked and timed out opens reject, close late connections, and can be retried',async()=>{
  let request;const durable=indexedStore({open(){return request={result:{close(){request.closed=true;}}};}},{timeoutMs:15});const blocked=durable.read();request.onblocked();await assert.rejects(blocked,/bloc/);request.onsuccess();assert.equal(request.closed,true);const timeout=durable.read();await assert.rejects(timeout,/expirat/);request.onsuccess();assert.equal(request.closed,true);
});
test('transaction timeout aborts the new register rather than claiming a saved plan',async()=>{
  const b=browser(),durable=indexedStore(b.factory,{timeoutMs:15}),s=create(legacy(),{durable,notify:false}),saved=s.mutate(rows=>[{id:'new'},...rows]);await tick();const tx=b.transactions[0];tx.read.onsuccess();await assert.rejects(saved,/expirat/);assert.equal(b.records.size,0);
});
