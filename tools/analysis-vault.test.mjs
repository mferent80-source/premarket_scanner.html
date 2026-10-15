import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {create,merge,KEY}=createRequire(import.meta.url)('../lib/analysis-vault.js');
const legacy=entries=>{const m=new Map(entries);return {m,getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
const durable=(value=null)=>{const d={value,get:async()=>d.value,put:async v=>{d.value=v;}};return d;};
const map=o=>JSON.stringify(o);

test('copia veche se unește pe poziție (rămâne analiza mai nouă) și dispare din spațiul local',async()=>{
 const l=legacy([[KEY,map({'a|AAPL':{fetchedAt:5,v:'local'},'a|MSFT':{fetchedAt:1,v:'local'}})],['alta','x']]);
 const d=durable(map({'a|MSFT':{fetchedAt:9,v:'idb'},'a|NVDA':{fetchedAt:3,v:'idb'}})),v=create({legacy:l,durable:d,notify:false});
 await v.ready();const out=JSON.parse(v.storage.getItem(KEY));
 assert.equal(out['a|AAPL'].v,'local');assert.equal(out['a|MSFT'].v,'idb');assert.equal(out['a|NVDA'].v,'idb');
 assert.equal(l.m.has(KEY),false);assert.equal(l.m.get('alta'),'x');assert.deepEqual(JSON.parse(d.value),out);
});
test('scrierile merg în IndexedDB, nu în spațiul local',async()=>{
 const l=legacy([]),d=durable(null),v=create({legacy:l,durable:d,notify:false});await v.ready();
 v.storage.setItem(KEY,map({'a|X':{fetchedAt:1}}));await v.flush();
 assert.equal(l.m.has(KEY),false);assert.equal(JSON.parse(d.value)['a|X'].fetchedAt,1);assert.equal(JSON.parse(v.storage.getItem(KEY))['a|X'].fetchedAt,1);
});
test('o analiză calculată înainte de încărcare nu se pierde: intră în unire',async()=>{
 const d=durable(map({'a|X':{fetchedAt:1,v:'vechi'}})),v=create({legacy:legacy([]),durable:d,notify:false});
 v.storage.setItem(KEY,map({'a|X':{fetchedAt:7,v:'nou'}}));await v.ready();
 assert.equal(JSON.parse(v.storage.getItem(KEY))['a|X'].v,'nou');assert.equal(JSON.parse(d.value)['a|X'].v,'nou');
});
test('IndexedDB refuzat: totul rămâne în spațiul local, ca înainte',async()=>{
 const l=legacy([[KEY,map({'a|X':{fetchedAt:1}})]]),v=create({legacy:l,durable:{get:async()=>{throw Error('privat');},put:async()=>{}},notify:false});
 assert.equal(await v.ready(),'legacy');assert.ok(l.m.has(KEY));v.storage.setItem(KEY,map({'a|Y':{fetchedAt:2}}));assert.ok(JSON.parse(l.m.get(KEY))['a|Y']);
});
test('fără IndexedDB în browser se folosește spațiul local',async()=>{
 const l=legacy([]),v=create({legacy:l,durable:null,notify:false});await v.ready();v.storage.setItem(KEY,'{}');assert.equal(l.m.get(KEY),'{}');
});
test('unirea ignoră copii stricate',()=>{assert.equal(merge('nu e json',null),null);assert.equal(merge(map({k:{fetchedAt:2}}),'[]'),map({k:{fetchedAt:2}}));});
test('după mutare, IndexedDB căzut: nu se scrie nimic peste copia bună, scrierea se păstrează și se unește la reîncercare',async()=>{
 let down=true;const d=durable(map({'a|X':{fetchedAt:1,history:[{asOf:'2026-10-01',symbol:'X'}]}}));
 const flaky={get:async()=>{if(down)throw Error('IDB');return d.value;},put:async v=>{if(down)throw Error('IDB');d.value=v;}};
 const l=legacy([['tt_holdings_analysis_migrated','1']]),v=create({legacy:l,durable:flaky,notify:false});
 assert.equal(await v.ready(),'broken');assert.equal(v.storage.getItem(KEY),null);
 v.storage.setItem(KEY,map({'a|X':{fetchedAt:9,history:[{asOf:'2026-10-14',symbol:'X'}]}}));assert.equal(l.m.has(KEY),false,'nimic în spațiul local');
 await new Promise(r=>setTimeout(r,0));down=false;assert.equal(await v.ready(),'durable');
 const x=JSON.parse(d.value)['a|X'];assert.equal(x.fetchedAt,9);assert.deepEqual(x.history.map(h=>h.asOf),['2026-10-01','2026-10-14'],'istoricul vechi + cel nou');
});
test('unirea păstrează istoricul observațiilor din ambele copii',()=>{
 const out=JSON.parse(merge(map({k:{fetchedAt:1,history:[{asOf:'2026-10-01',symbol:'A'},{asOf:'2026-10-02',symbol:'A'}]}}),map({k:{fetchedAt:5,history:[{asOf:'2026-10-14',symbol:'A'}]}})));
 assert.equal(out.k.fetchedAt,5);assert.deepEqual(out.k.history.map(h=>h.asOf),['2026-10-01','2026-10-02','2026-10-14']);
});
test('fără IndexedDB și spațiul local plin: salvarea aruncă, ca pagina să avertizeze',async()=>{
 const full={getItem:()=>null,removeItem:()=>{},setItem:()=>{const e=Error('plin');e.name='QuotaExceededError';throw e;}};
 const v=create({legacy:full,durable:null,notify:false});await v.ready();assert.throws(()=>v.storage.setItem(KEY,'{}'),/plin/);
});
