import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const KEY='tt_trading212_fills_v1',DB='tt-broker-fills-v1',STORE='records';
const source=readFileSync('lib/trading212-fills-store.js','utf8');
const copy=x=>x===undefined?undefined:structuredClone(x);
const plain=x=>JSON.parse(JSON.stringify(x));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const execution=id=>({id,ticker:'TEST_US_EQ',date:'2026-10-10T12:00:00Z',side:'SELL',quantity:2,price:120,priceCurrency:'USD',currency:'EUR',realized:18,amount:220,fxRate:.92,taxes:[{name:'FX_FEE',quantity:.3,currency:'EUR'}]});
const fills=(...ids)=>({accounts:{'live:fixture':{environment:'live',items:ids.map(execution),complete:true,fetchedAt:'2026-10-10T12:01:00Z',syncStatus:'complete',syncError:null}}});
const append=id=>data=>{data.accounts['live:fixture'].items.push(execution(id));return data;};
const ids=record=>record.data.accounts['live:fixture'].items.map(row=>row.id);

function legacy(data=fills('old'),{quota=false}={}){
 let raw=data===undefined?null:JSON.stringify(data),writes=0;
 return {
  get raw(){return raw;},set raw(value){raw=value;},get writes(){return writes;},
  getItem(key){assert.equal(key,KEY);return raw;},
  setItem(key,value){assert.equal(key,KEY);writes++;if(quota)throw Object.assign(Error('fixture full'),{name:'QuotaExceededError'});raw=value;},
  removeItem(key){assert.equal(key,KEY);writes++;if(quota)throw Object.assign(Error('fixture full'),{name:'QuotaExceededError'});raw=null;}
 };
}

function backup(initial=null){
 let record=copy(initial),tail=Promise.resolve(),readError=null,writeError=null,beforeCommit=null;
 return {
  get record(){return copy(record);},set record(value){record=copy(value);},
  failRead(error){readError=error;},failWrite(error){writeError=error;},pauseCommit(fn){beforeCommit=fn;},
  async read(){if(readError)throw readError;return copy(record);},
  update(fn){
   const pending=tail.then(async()=>{if(writeError)throw writeError;const result=fn(copy(record));if(beforeCommit)await beforeCommit();if(writeError)throw writeError;if(result.write!==false)record=copy(result.record);return copy(result.value);});
   tail=pending.catch(()=>{});return pending;
  }
 };
}

function setup(storage){
 const events=new Map(),emitted=[];
 const c={localStorage:storage,Date,JSON,Promise,Map,Set,Uint8Array,setTimeout,clearTimeout,queueMicrotask,navigator:{},
  StorageEvent:class{constructor(type,options){this.type=type;Object.assign(this,options);}},
  addEventListener(type,fn){if(!events.has(type))events.set(type,new Set());events.get(type).add(fn);},
  removeEventListener(type,fn){events.get(type)?.delete(fn);},
  dispatchEvent(event){emitted.push(event);for(const fn of events.get(event.type)||[])fn(event);},
  location:{href:'https://fixture.example/app/',origin:'https://fixture.example'}
 };
 c.window=c;vm.createContext(c);vm.runInContext(source,c);
 return {api:c.T212FillsStore,c,emitted};
}

test('quota cannot prevent durable migration, saving or exact recovery on a fresh page',async()=>{
 const storage=legacy(fills('old'),{quota:true}),before=storage.raw,durable=backup(),{api}=setup(storage);
 assert.equal(api.KEY,KEY);assert.equal(api.DB,DB);assert.equal(api.STORE,STORE);
 const s=api.create(storage,{durable,notify:false}),migrated=await s.ready();
 assert.equal(migrated.state,'indexeddb');assert.deepEqual(plain(migrated.data),fills('old'));
 assert.equal(durable.record.localRaw,before);
 const saved=await s.mutate(append('new'));
 assert.equal(saved.state,'indexeddb');assert.deepEqual(plain(ids(saved)),['old','new']);
 assert.ok(saved.revision>migrated.revision);assert.equal(storage.raw,before);
 const fresh=api.create(storage,{durable,notify:false}),restored=await fresh.read();
 assert.deepEqual(plain(restored.data),fills('old','new'));
 assert.deepEqual(plain(fresh.peek()),plain(restored));
 assert.equal(storage.raw,before);
});

test('pending persistence never exposes new executions as confirmed data',async()=>{
 const storage=legacy(fills('old'),{quota:true}),durable=backup(),{api}=setup(storage),s=api.create(storage,{durable,notify:false});
 await s.ready();let release,started;
 const waiting=new Promise(resolve=>started=resolve);
 durable.pauseCommit(async()=>{started();await new Promise(resolve=>release=resolve);});
 let settled=false;const pending=s.mutate(append('new'));pending.then(()=>settled=true,()=>settled=true);
 await waiting;assert.equal(settled,false);
 assert.deepEqual(plain(ids(s.peek())),['old']);
 assert.deepEqual(JSON.parse(durable.record.raw),fills('old'));
 release();const saved=await pending;assert.deepEqual(plain(ids(saved)),['old','new']);
});

test('failed IndexedDB writes preserve every original and retain only the last confirmed cache',async()=>{
 const storage=legacy(fills('old'),{quota:true}),durable=backup(),{api}=setup(storage),s=api.create(storage,{durable,notify:false});
 await s.ready();const before=durable.record,raw=storage.raw;
 durable.failWrite(Error('fixture denied'));
 await assert.rejects(s.mutate(append('new')));
 assert.deepEqual(durable.record,before);assert.equal(storage.raw,raw);
 assert.deepEqual(plain(ids(s.peek())),['old']);
 durable.failWrite(null);const recovered=await s.read();assert.deepEqual(plain(ids(recovered)),['old']);
 const saved=await s.mutate(append('retry'));assert.deepEqual(plain(ids(saved)),['old','retry']);
});

test('an unavailable durable read cannot resurrect an old local copy or manufacture an empty register',async()=>{
 for(const data of [fills('old'),undefined]){
  const storage=legacy(data),durable=backup();if(data===undefined)storage.raw=null;durable.failRead(Error('fixture unavailable'));durable.failWrite(Error('fixture unavailable'));
  const {api}=setup(storage),s=api.create(storage,{durable,notify:false}),before=storage.raw;
  assert.throws(()=>s.peek());await assert.rejects(s.ready());assert.throws(()=>s.peek());
  await assert.rejects(s.mutate(()=>fills('new')));
  assert.equal(storage.raw,before);assert.equal(storage.writes,0);assert.equal(durable.record,null);
 }
});

test('a confirmed atomic update can recover from a failed read without losing earlier executions',async()=>{
 const storage=legacy(fills('old'),{quota:true}),raw=storage.raw;
 const durable=backup({revision:3,raw,localRaw:raw});durable.failRead(Error('fixture readonly denied'));
 const {api}=setup(storage),s=api.create(storage,{durable,notify:false});
 await assert.rejects(s.ready());assert.throws(()=>s.peek());
 const saved=await s.mutate(append('recovered'));
 assert.equal(saved.state,'indexeddb');assert.deepEqual(plain(ids(s.peek())),['old','recovered']);
 assert.deepEqual(JSON.parse(durable.record.raw),fills('old','recovered'));assert.equal(storage.raw,raw);
});

test('durable authority accepts its recorded legacy anchor and its exact mirror',async()=>{
 const local=fills('old'),saved=fills('old','durable'),raw=JSON.stringify(saved);
 for(const legacyRaw of [JSON.stringify(local),raw]){
  const storage=legacy(local,{quota:true});storage.raw=legacyRaw;
  const durable=backup({revision:7,raw,localRaw:JSON.stringify(local)}),{api}=setup(storage),s=api.create(storage,{durable,notify:false});
  const record=await s.read();assert.deepEqual(plain(record.data),saved);assert.equal(record.revision,7);
  await s.mutate(append('next'));assert.deepEqual(plain(ids(await s.read())),['old','durable','next']);
 }
});

test('divergent legacy imports freeze reads and writes while preserving both full originals',async()=>{
 const storage=legacy(fills('old'),{quota:true}),durable=backup(),{api}=setup(storage),s=api.create(storage,{durable,notify:false});
 await s.ready();await s.mutate(append('durable'));const before=durable.record;
 storage.raw=JSON.stringify(fills('old','legacy-import'));const legacyBefore=storage.raw;
 await assert.rejects(s.read());assert.throws(()=>s.peek());
 await assert.rejects(s.mutate(append('new')));
 await assert.rejects(s.replace(fills('old','durable'),fills('cloud')));
 assert.deepEqual(durable.record,before);assert.equal(storage.raw,legacyBefore);
});

test('two page instances mutate the latest committed fills and stale cloud replacements fail CAS',async()=>{
 const storage=legacy(fills('old'),{quota:true}),durable=backup(),{api}=setup(storage);
 const a=api.create(storage,{durable,notify:false}),b=api.create(storage,{durable,notify:false});
 const initial=await a.ready();await b.ready();
 await Promise.all([a.mutate(append('a')),b.mutate(append('b'))]);
 assert.deepEqual(plain(ids(await a.read())),['old','a','b']);
 const before=durable.record;
 assert.equal(await b.replace(initial.data,fills('remote')),false);
 assert.deepEqual(durable.record,before);
 const expected=(await b.read()).data,next=plain(expected);next.accounts['live:fixture'].items.push(execution('remote'));
 assert.equal(await b.replace(expected,next),true);
 assert.deepEqual(plain(ids(await a.read())),['old','a','b','remote']);
});

test('a legacy change inside a mutation cannot be overwritten by its stale durable transaction',async()=>{
 const storage=legacy(fills('old'),{quota:true}),durable=backup(),{api}=setup(storage),s=api.create(storage,{durable,notify:false});
 await s.ready();const before=durable.record;
 await assert.rejects(s.mutate(data=>{storage.raw=JSON.stringify(fills('external'));return append('new')(data);}));
 assert.deepEqual(durable.record,before);assert.deepEqual(JSON.parse(storage.raw),fills('external'));
});

test('a legacy change during asynchronous commit preserves both copies and rejects incompatible success',async()=>{
 for(const operation of ['mutate','replace']){
  const storage=legacy(fills('old'),{quota:true}),raw=storage.raw,durable=backup(),{api}=setup(storage),s=api.create(storage,{durable,notify:false});
  await s.ready();let started,release;
  const waiting=new Promise(resolve=>started=resolve);
  durable.pauseCommit(async()=>{started();await new Promise(resolve=>release=resolve);});
  const pending=operation==='mutate'?s.mutate(append('new')):s.replace(fills('old'),fills('old','new'));
  const rejected=assert.rejects(pending,error=>error.code==='fills_conflict',operation);
  await waiting;storage.raw=JSON.stringify(fills('old','legacy-import'));const external=storage.raw;
  release();await rejected;
  assert.deepEqual(JSON.parse(durable.record.raw),fills('old','new'),operation);
  assert.equal(durable.record.localRaw,raw,operation);assert.equal(storage.raw,external,operation);
  assert.throws(()=>s.peek(),error=>error.code==='fills_conflict',operation);
  await assert.rejects(s.read(),error=>error.code==='fills_conflict',operation);
  assert.equal(storage.raw,external,operation);
 }
});

test('a mirror that observes a divergent legacy copy rejects success and preserves both originals',async()=>{
 for(const operation of ['mutate','replace']){
  const storage=legacy(fills('old'),{quota:true}),raw=storage.raw,durable=backup(),{api}=setup(storage),s=api.create(storage,{durable,notify:false});
  await s.ready();const get=storage.getItem.bind(storage);let reads=0;
  // Simulate another page changing localStorage after post-commit validation,
  // immediately before the mirror reads the shared register.
  storage.getItem=key=>{if(++reads===4)storage.raw=JSON.stringify(fills('old','external'));return get(key);};
  await assert.rejects(operation==='mutate'?s.mutate(append('new')):s.replace(fills('old'),fills('old','new')),error=>error.code==='fills_conflict',operation);
  assert.deepEqual(JSON.parse(storage.raw),fills('old','external'),operation);
  assert.deepEqual(JSON.parse(durable.record.raw),fills('old','new'),operation);
  assert.equal(durable.record.localRaw,raw,operation);
  assert.throws(()=>s.peek(),error=>error.code==='fills_conflict',operation);
 }
});

test('the last readable durable revision cannot advance into an unreadable or unsafe revision',async()=>{
 for(const operation of ['mutate','replace']){
  const storage=legacy(fills('old'),{quota:true}),raw=storage.raw;
  const initial={revision:Number.MAX_SAFE_INTEGER-1,raw,localRaw:raw},durable=backup(initial),{api}=setup(storage),s=api.create(storage,{durable,notify:false});
  assert.equal((await s.ready()).revision,initial.revision);
  await assert.rejects(operation==='mutate'?s.mutate(append('new')):s.replace(fills('old'),fills('old','new')));
  assert.deepEqual(durable.record,initial,operation);assert.equal(storage.raw,raw,operation);
  const recovered=await s.read();assert.deepEqual(plain(recovered.data),fills('old'),operation);assert.equal(recovered.revision,initial.revision);
 }
});

test('read, peek, mutation arguments and confirmed results cannot mutate cached or durable executions',async()=>{
 const storage=legacy(fills('old'),{quota:true}),durable=backup(),{api}=setup(storage),s=api.create(storage,{durable,notify:false});
 // 19.10.2026 (I-697): copia comună a cititorilor e înghețată ⇒ încercarea de a o modifica eșuează zgomotos, nu strică registrul
 const read=await s.ready();assert.throws(()=>{read.data.accounts['live:fixture'].items[0].realized=999;},TypeError);
 const peek=s.peek();assert.throws(()=>{peek.data.accounts['live:fixture'].items.length=0;},TypeError);
 assert.deepEqual(plain(s.peek().data),fills('old'));
 let input;const saved=await s.mutate(data=>{input=data;return append('new')(data);});
 input.accounts['live:fixture'].items[0].taxes[0].quantity=999;
 assert.throws(()=>saved.data.accounts['live:fixture'].items.pop(),TypeError);
 assert.deepEqual(plain(s.peek().data),fills('old','new'));
 assert.deepEqual(JSON.parse(durable.record.raw),fills('old','new'));
});

test('malformed legacy and durable roots block migration without replacing their originals',async()=>{
 for(const bad of ['{broken','null','[]','{}','{"accounts":null}','{"accounts":[]}']){
  const storage=legacy();storage.raw=bad;const durable=backup(),{api}=setup(storage),s=api.create(storage,{durable,notify:false});
  await assert.rejects(s.read());await assert.rejects(s.mutate(()=>fills('new')));
  assert.throws(()=>s.peek());assert.equal(storage.raw,bad);assert.equal(durable.record,null);
 }
 for(const bad of [{revision:1,raw:'null',localRaw:null},{revision:0,raw:JSON.stringify(fills('old')),localRaw:null},{revision:1,raw:'{"accounts":[]}',localRaw:null}]){
  const storage=legacy();storage.raw=null;const durable=backup(bad),{api}=setup(storage),s=api.create(storage,{durable,notify:false});
  await assert.rejects(s.read());await assert.rejects(s.mutate(()=>fills('new')));assert.deepEqual(durable.record,bad);
 }
});

test('absent raw data is distinct from a malformed null root and supports initial CAS',async()=>{
 const storage=legacy();storage.raw=null;const durable=backup(),{api}=setup(storage),s=api.create(storage,{durable,notify:false});
 const absent=await s.ready();assert.equal(absent.raw,null);assert.deepEqual(plain(absent.data),{accounts:{}});
 assert.equal(await s.replace(undefined,fills('first')),true);
 assert.deepEqual(plain(ids(s.peek())),['first']);
});

test('failed or nonserializable mutations never commit a partial financial register',async()=>{
 const storage=legacy(fills('old'),{quota:true}),durable=backup(),{api}=setup(storage),s=api.create(storage,{durable,notify:false});
 await s.ready();const before=durable.record;
 for(const change of [()=>{throw Error('fixture invalid');},()=>null,()=>[],()=>({accounts:null}),()=>({accounts:{a:{value:1n}}})]){
  await assert.rejects(s.mutate(change));assert.deepEqual(durable.record,before);
 }
 assert.deepEqual(plain((await s.read()).data),fills('old'));
});

test('without IndexedDB, synchronous reads and saves rely on confirmed localStorage writes',async()=>{
 const storage=legacy(fills('old')),{api}=setup(storage),s=api.create(storage,{durable:null,notify:false});
 assert.deepEqual(plain(s.peek().data),fills('old'));
 const saved=await s.mutate(append('new'));assert.equal(saved.state,'local');assert.deepEqual(JSON.parse(storage.raw),fills('old','new'));
 const fresh=api.create(storage,{durable:null,notify:false});assert.deepEqual(plain(fresh.peek().data),fills('old','new'));
 const full=legacy(fills('old'),{quota:true}),refused=api.create(full,{durable:null,notify:false}),before=full.raw;
 await assert.rejects(refused.mutate(append('unsaved')));assert.equal(full.raw,before);
});

function channels(){
 const peers=new Set(),messages=[];
 function factory(name){const channel={name,onmessage:null,postMessage(message){messages.push(copy(message));for(const peer of peers)if(peer!==channel&&peer.name===name)queueMicrotask(()=>peer.onmessage?.({data:copy(message)}));},close(){peers.delete(channel);}};peers.add(channel);return channel;}
 function deliver(message){for(const peer of peers)queueMicrotask(()=>peer.onmessage?.({data:copy(message)}));}
 return {factory,messages,deliver};
}

test('a hydration failure invalidates local readers once without broadcasting or creating a notification loop',async()=>{
 const storage=legacy(fills('old')),durable=backup(),{api,emitted}=setup(storage),bus=channels();
 durable.failRead(Error('fixture unreadable'));emitted.length=0;
 const s=api.create(storage,{durable,notify:true,channelFactory:bus.factory});
 await assert.rejects(s.ready());await tick();assert.throws(()=>s.peek());
 const invalidations=()=>emitted.filter(event=>event.type==='storage'&&event.key===KEY);
 assert.equal(invalidations().length,1);assert.equal(bus.messages.length,0);
 await assert.rejects(s.read());await assert.rejects(s.read());await tick();
 assert.equal(invalidations().length,1,'the same unreadable state must not repeatedly notify readers');
 assert.equal(bus.messages.length,0);
});

test('confirmed writes notify the same window and other instances using metadata without loops',async()=>{
 const storage=legacy(fills('old'),{quota:true}),durable=backup(),{api,emitted}=setup(storage),bus=channels();
 const options={durable,notify:true,channelFactory:bus.factory},a=api.create(storage,options),b=api.create(storage,options);
 await a.ready();await b.ready();await tick();bus.messages.length=0;emitted.length=0;
 let updates=0;b.subscribe(()=>updates++);await a.mutate(append('new'));
 for(let i=0;i<5;i++)await tick();
 assert.deepEqual(plain(ids(b.peek())),['old','new']);assert.ok(updates>0);
 assert.ok(emitted.some(event=>event.type==='storage'&&event.key===KEY));
 assert.equal(bus.messages.length,1,'rehydration must not rebroadcast the same commit');
 assert.deepEqual(Object.keys(bus.messages[0]).sort(),['key','revision']);assert.equal(bus.messages[0].key,KEY);
 assert.ok(Number.isSafeInteger(bus.messages[0].revision));
});

test('legacy-only page instances reload changed local data even when channel revisions remain zero',async()=>{
 const storage=legacy(fills('old')),{api}=setup(storage),bus=channels();
 const options={durable:null,notify:true,channelFactory:bus.factory},a=api.create(storage,options),b=api.create(storage,options);
 await a.ready();await b.ready();bus.messages.length=0;
 await a.mutate(append('new'));for(let i=0;i<3;i++)await tick();
 assert.deepEqual(plain(ids(b.peek())),['old','new']);assert.equal(b.peek().state,'local');
 assert.equal(bus.messages.length,1);assert.deepEqual(bus.messages[0],{key:KEY,revision:0});
});

test('restore invalidations refresh lower or equal revisions while malformed channel messages stay ignored',async()=>{
 const storage=legacy(fills('old'),{quota:true}),anchor=storage.raw;
 const durable=backup({revision:10,raw:anchor,localRaw:anchor}),read=durable.read.bind(durable);let reads=0;
 durable.read=async()=>{reads++;return read();};
 const {api}=setup(storage),bus=channels(),s=api.create(storage,{durable,notify:true,channelFactory:bus.factory});
 await s.ready();bus.messages.length=0;
 const deliver=async message=>{bus.deliver(message);for(let i=0;i<3;i++)await tick();};
 const restore=(revision,id)=>{durable.record={revision,raw:JSON.stringify(fills('old',id)),localRaw:anchor};};

 restore(4,'lower-restored');let before=reads;
 await deliver({key:KEY,revision:4});
 assert.equal(reads,before);assert.deepEqual(plain(ids(s.peek())),['old']);
 await deliver({key:KEY,revision:4,invalidate:true});
 assert.equal(reads,before+1);assert.equal(s.peek().revision,4);assert.deepEqual(plain(ids(s.peek())),['old','lower-restored']);

 restore(4,'equal-restored');before=reads;
 await deliver({key:KEY,revision:4});assert.equal(reads,before);
 assert.deepEqual(plain(ids(s.peek())),['old','lower-restored']);
 await deliver({key:KEY,revision:4,invalidate:true});
 assert.equal(reads,before+1);assert.deepEqual(plain(ids(s.peek())),['old','equal-restored']);

 restore(3,'must-stay-unread');before=reads;
 for(const message of [{key:'tt_journal_v1',revision:3,invalidate:true},...[undefined,-1,3.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'3'].map(revision=>({key:KEY,revision,invalidate:true})),{key:KEY,revision:3,invalidate:false},{key:KEY,revision:3,invalidate:'true'}])await deliver(message);
 assert.equal(reads,before);assert.deepEqual(plain(ids(s.peek())),['old','equal-restored']);

 durable.record=null;storage.raw=null;
 await deliver({key:KEY,revision:0,invalidate:true});
 assert.equal(reads,before+1);assert.equal(s.peek().raw,null);assert.deepEqual(plain(s.peek().data),{accounts:{}});
 assert.equal(bus.messages.length,0,'restored reads must not rebroadcast invalidation messages');
});

/* IndexedDB request success and transaction commit are controlled separately. */
function browser(initial=null){
 const records=new Map(initial===null?[]:[[KEY,copy(initial)]]),transactions=[];
 const db={objectStoreNames:{contains:()=>true},close(){},transaction(name,mode){
  assert.equal(name,STORE);const tx={mode,staged:[],objectStore(){return {get(key){assert.equal(key,KEY);tx.request={result:copy(records.get(key))};return tx.request;},put(value,key){assert.equal(key,KEY);tx.staged.push([key,copy(value)]);}};},abort(){tx.onabort?.();},commit(){for(const [key,value] of tx.staged)records.set(key,value);tx.oncomplete?.();}};
  transactions.push(tx);return tx;
 }};
 const factory={open(name,version){assert.equal(name,DB);assert.equal(version,1);const request={result:db};queueMicrotask(()=>request.onsuccess?.());return request;}};
 return {factory,records,transactions};
}

test('IndexedDB request success alone cannot confirm a write and abort retains the earlier record',async()=>{
 const old={revision:1,raw:JSON.stringify(fills('old')),localRaw:null},next={revision:2,raw:JSON.stringify(fills('old','new')),localRaw:null};
 const b=browser(old),{api}=setup(legacy()),durable=api.indexedStore(b.factory);let settled=false;
 const pending=durable.update(()=>({record:next,value:next}));pending.then(()=>settled=true,()=>settled=true);
 await tick();const tx=b.transactions[0];tx.request.onsuccess();await tick();
 assert.equal(settled,false);assert.deepEqual(b.records.get(KEY),old);
 tx.onabort();await assert.rejects(pending);assert.deepEqual(b.records.get(KEY),old);
});

test('a completed IndexedDB transaction reads back the exact committed financial register',async()=>{
 const next={revision:1,raw:JSON.stringify(fills('old','new')),localRaw:JSON.stringify(fills('old'))};
 const b=browser(),{api}=setup(legacy()),durable=api.indexedStore(b.factory),write=durable.update(()=>({record:next,value:next}));
 await tick();let tx=b.transactions.at(-1);tx.request.onsuccess();tx.commit();assert.deepEqual(plain(await write),next);
 const read=durable.read();await tick();tx=b.transactions.at(-1);tx.request.onsuccess();tx.commit();assert.deepEqual(plain(await read),next);
});
