import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {create}=createRequire(import.meta.url)('../lib/holdings-model-storage.js');
const quota=()=>Object.assign(new Error('PRIVATE key'),{name:'QuotaExceededError'});
const refused={getItem:()=>null,setItem(){throw quota();}};
const backup=()=>{const records=new Map();return {records,get:async k=>records.get(k)||null,set:async(k,v)=>{records.set(k,v);}};};
function setup(){const saved=new Map([['model:a|A','{"result":"original"}'],['journal','untouched']]);let failure=null;const writes=[];return {saved,writes,fail:e=>failure=e,store:create({getItem:k=>saved.get(k)||null,setItem(k,v){if(failure)throw failure;saved.set(k,v);writes.push(k);}})};}
test('quota fallback keeps the new report in memory and preserves every persisted record',()=>{
 const s=setup(),old=[...s.saved];s.fail(Object.assign(new Error('PRIVATE storage key'),{name:'QuotaExceededError'}));
 assert.equal(s.store.save('model:a|A',{result:'new'},false),'session');assert.deepEqual([...s.saved],old);assert.equal(s.store.read('model:a|A',false).result,'new');
 const status=s.store.inspect('model:a|A',false,true);assert.equal(status.state,'session');assert.match(status.message,/Spațiul local.*plin/);assert.doesNotMatch(status.message,/PRIVATE/);assert.deepEqual(s.writes,[]);
});
test('successful retry persists the newest report and clears the temporary warning',()=>{
 const s=setup();s.fail(new Error('blocked'));s.store.save('model:a|A',{result:'temporary'},false);s.fail(null);assert.equal(s.store.save('model:a|A',{result:'retry'},false),'local');
 assert.equal(s.store.read('model:a|A',false).result,'retry');assert.equal(s.store.inspect('model:a|A',false,true).message,null);assert.equal(JSON.parse(s.saved.get('model:a|A')).retention,'local');
});
test('temporary reports are separate by account, ticker, demo and page instance',()=>{
 const s=setup();s.fail(new Error('blocked'));s.store.save('model:a|A',{result:'market'},false);s.store.save('model:a|A',{result:'demo'},true);s.store.save('model:b|B',{result:'other'},false);
 assert.equal(s.store.read('model:a|A',true).result,'demo');assert.equal(s.store.read('model:a|A',false).result,'market');assert.equal(s.store.read('model:b|B',false).result,'other');assert.equal(s.store.read('model:b|A',false),null);
 const reloaded=create({getItem:k=>s.saved.get(k)||null});assert.equal(reloaded.read('model:a|A',false).result,'original');assert.equal(reloaded.read('model:b|B',false),null);
 assert.equal(s.store.inspect('model:a|A',true,true).message,null);assert.equal(s.store.inspect('model:a|A',false,false).message,null);
});
test('storage access denial can retain a report without weakening serialization or validity checks',()=>{
 const store=create({getItem(){throw Error('denied');},setItem(){throw Error('denied');}});store.save('key',{result:'computed'},false);assert.equal(store.read('key',false).result,'computed');assert.match(store.inspect('key',false,true).message,/refuzat salvarea permanentă/);
 assert.throws(()=>store.save('key',{result:1n},false));assert.equal(store.read('key',false).result,'computed');store.captureFailed('key',false);assert.match(store.inspect('key',false,true).message,/Registrul estimărilor/);
});
test('a confirmed backup survives a fresh page despite full localStorage',async()=>{
 const durable=backup(),s=create(refused,{durable});
 assert.equal(s.save('account:a|A',{trainedAt:100,result:'verified'},false),'pending');
 assert.equal(s.inspect('account:a|A',false,true).state,'pending');assert.match(s.inspect('account:a|A',false,true).message,/în curs/);
 await s.settled('account:a|A');assert.equal(s.inspect('account:a|A',false,true).state,'indexeddb');assert.match(s.inspect('account:a|A',false,true).message,/recuperare după reîncărcare/);
 const fresh=create(refused,{durable});assert.equal(fresh.read('account:a|A',false),null);await fresh.restore('account:a|A',false);
 assert.equal(fresh.read('account:a|A',false).result,'verified');assert.equal(fresh.read('account:a|A',false).trainedAt,100);
 assert.equal(fresh.inspect('account:a|A',false,true).state,'indexeddb');assert.equal(fresh.inspect('account:a|A',false,false).message,null);
});
test('a rejected backup preserves previous records and downgrades the new report to session',async()=>{
 const saved=new Map([['key','{"trainedAt":1,"result":"old"}'],['journal','original']]),original=[...saved];
 const s=create({getItem:k=>saved.get(k),setItem(){throw quota();}},{durable:{get:async()=>null,set:async()=>{throw quota();}}});
 s.save('key',{trainedAt:2,result:'new'},false);await s.settled('key');assert.deepEqual([...saved],original);
 assert.equal(s.read('key',false).result,'new');assert.equal(s.inspect('key',false,true).state,'session');assert.match(s.inspect('key',false,true).message,/doar în această sesiune/);assert.doesNotMatch(s.inspect('key',false,true).message,/PRIVATE/);
});
test('delayed restore cannot replace a newly computed report',async()=>{
 let release;const durable={get:()=>new Promise(r=>release=r),set:async()=>{throw Error('refused');}},s=create(refused,{durable});
 const restored=s.restore('key',false);await Promise.resolve();s.save('key',{trainedAt:20,result:'new'},false);
 release('{"trainedAt":10,"result":"old"}');await restored;await s.settled('key');assert.equal(s.read('key',false).result,'new');
});
test('same-key writes stay ordered and only the latest confirmed write changes retention',async()=>{
 const durable=backup();let release,started;const waiting=new Promise(r=>started=r),set=durable.set;
 durable.set=async(k,v)=>{if(JSON.parse(v).trainedAt===1){started();await new Promise(r=>release=r);}await set(k,v);};
 const s=create(refused,{durable});s.save('key',{trainedAt:1,result:'first'},false);await waiting;s.save('key',{trainedAt:2,result:'second'},false);release();await s.settled('key');
 assert.equal(s.read('key',false).result,'second');assert.equal(s.inspect('key',false,true).state,'indexeddb');assert.equal(JSON.parse(durable.records.get('key')).result,'second');
});
test('restore selects the newer stored report and isolates accounts, symbols and demo',async()=>{
 const durable=backup();durable.records.set('a|A','{"trainedAt":20,"result":"backup"}');durable.records.set('b|A','{"trainedAt":15,"result":"other-account"}');
 const local=new Map([['a|A','{"trainedAt":10,"result":"local"}']]),s=create({getItem:k=>local.get(k)},{durable});
 await s.restore('a|A',false);assert.equal(s.read('a|A',false).result,'backup');local.set('a|A','{"trainedAt":30,"result":"newer-local"}');assert.equal(s.read('a|A',false).result,'newer-local');assert.equal(s.inspect('a|A',false,true).state,'local');
 assert.equal(s.read('b|A',false),null);await s.restore('b|A',false);assert.equal(s.read('b|A',false).result,'other-account');assert.equal(s.read('a|B',false),null);
 s.save('a|A',{result:'demo'},true);await s.restore('a|A',true);assert.equal(s.read('a|A',true).result,'demo');assert.equal(s.read('a|A',false).result,'newer-local');
 const isolated=create(refused,{durable:{get(){throw Error('Demo read');},set(){throw Error('Demo write');}}});isolated.save('demo',{result:'demo'},true);await isolated.restore('demo',true);assert.equal(isolated.inspect('demo',true,true).state,'demo');
});
test('corrupt or inaccessible backups never claim persistence, and ledger failure remains separate',async()=>{
 for(const get of [async()=>'{broken',async()=>{throw Error('denied');}]){const s=create(refused,{durable:{get,set:async()=>{throw Error('denied');}}});await s.restore('key',false);assert.equal(s.read('key',false),null);}
 const s=create(refused,{durable:backup()});s.save('key',{trainedAt:1,result:'verified'},false);s.captureFailed('key',false);await s.settled('key');assert.equal(s.inspect('key',false,true).state,'indexeddb');assert.match(s.inspect('key',false,true).message,/Registrul estimărilor/);
});
