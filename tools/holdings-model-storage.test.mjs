import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {create}=createRequire(import.meta.url)('../lib/holdings-model-storage.js');
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
