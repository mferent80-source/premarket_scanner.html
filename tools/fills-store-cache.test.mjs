// 19.10.2026 (I-697, punctul 5): peek()/read() parsau tot registrul execuțiilor (~860 KB) la fiecare apel; Governorul îl cheamă de 17–30 de ori în 20 s.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const KEY='tt_trading212_fills_v1',source=readFileSync('lib/trading212-fills-store.js','utf8');
const execution=id=>({id,ticker:'TEST_US_EQ',date:'2026-10-10T12:00:00Z',side:'SELL',quantity:2,price:120,priceCurrency:'USD',currency:'EUR',realized:18});
const fills=(...ids)=>({accounts:{'live:fixture':{environment:'live',items:ids.map(execution),complete:true,fetchedAt:'2026-10-10T12:01:00Z'}}});
const copy=x=>x==null?x:structuredClone(x);
function backup(initial=null){let record=copy(initial),tail=Promise.resolve();return {get record(){return copy(record);},set record(v){record=copy(v);},async read(){return copy(record);},update(fn){const p=tail.then(()=>{const r=fn(copy(record));if(r.write!==false)record=copy(r.record);return copy(r.value);});tail=p.catch(()=>{});return p;}};}
function setup(){
 let parses=0;const raw=new Map(),channels=[];
 const storage={getItem:k=>raw.has(k)?raw.get(k):null,setItem:(k,v)=>raw.set(k,String(v)),removeItem:k=>raw.delete(k)};
 const counted={parse:(...a)=>{parses++;return JSON.parse(...a);},stringify:(...a)=>JSON.stringify(...a)};
 const c={localStorage:storage,JSON:counted,Date,Promise,Map,Set,Object,setTimeout,clearTimeout,navigator:{},addEventListener(){},removeEventListener(){},dispatchEvent(){}};
 c.window=c;vm.createContext(c);vm.runInContext(source,c);
 const channelFactory=name=>{const ch={name,onmessage:null,postMessage(d){for(const o of channels)if(o!==ch)o.onmessage?.({data:d});},close(){}};channels.push(ch);return ch;};
 return {api:c.T212FillsStore,storage,channelFactory,parses:()=>parses};
}

test('citirile repetate nu mai parsează registrul: aceeași copie înghețată până la o scriere',async()=>{
 const s=setup(),durable=backup({revision:1,raw:JSON.stringify(fills('a','b')),localRaw:null});
 const store=s.api.create(s.storage,{durable,notify:false});await store.ready();
 const before=s.parses(),first=store.peek().data;
 for(let i=0;i<30;i++)assert.equal(store.peek().data,first,'peek dă aceeași copie');
 for(let i=0;i<5;i++)await store.read();
 assert.equal(s.parses(),before,'nicio parsare la 30 de peek() și 5 read() pe același registru');
 assert.equal(Object.isFrozen(first),true);assert.equal(Object.isFrozen(first.accounts['live:fixture'].items[0]),true,'copia comună nu poate fi modificată de un cititor');
 assert.throws(()=>{'use strict';first.accounts['live:fixture'].items.push(execution('x'));},TypeError);
 await store.mutate(data=>{data.accounts['live:fixture'].items.push(execution('c'));return data;});
 const after=store.peek().data;assert.notEqual(after,first,'scrierea invalidează copia');
 assert.deepEqual(after.accounts['live:fixture'].items.map(x=>x.id),['a','b','c']);assert.equal(store.peek().data,after);
});

test('o scriere din altă fereastră (BroadcastChannel) invalidează copia; registrul nou se citește o dată',async()=>{
 const s=setup(),durable=backup({revision:1,raw:JSON.stringify(fills('a')),localRaw:null});
 const one=s.api.create(s.storage,{durable,channelFactory:s.channelFactory}),two=s.api.create(s.storage,{durable,channelFactory:s.channelFactory});
 await one.ready();await two.ready();const old=two.peek().data;
 await one.mutate(data=>{data.accounts['live:fixture'].items.push(execution('nou'));return data;});
 for(let i=0;i<20;i++){try{if(two.peek().data!==old)break;}catch{}await new Promise(r=>setImmediate(r));}
 assert.deepEqual(two.peek().data.accounts['live:fixture'].items.map(x=>x.id),['a','nou']);
 const parses=s.parses();for(let i=0;i<20;i++)two.peek();assert.equal(s.parses(),parses);
});

test('mutate() primește o copie proprie, modificabilă, nu copia comună a cititorilor',async()=>{
 const s=setup(),durable=backup({revision:1,raw:JSON.stringify(fills('a')),localRaw:null});
 const store=s.api.create(s.storage,{durable,notify:false});await store.ready();const shared=store.peek().data;let given;
 await store.mutate(data=>{given=data;data.accounts['live:fixture'].items[0].realized=1;return data;});
 assert.notEqual(given,shared);assert.equal(Object.isFrozen(given),false);assert.equal(shared.accounts['live:fixture'].items[0].realized,18,'copia veche a cititorilor rămâne neatinsă');
 assert.equal(JSON.parse(durable.record.raw).accounts['live:fixture'].items[0].realized,1);
});
