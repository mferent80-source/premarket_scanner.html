import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {create,union,KEY,MARK}=createRequire(import.meta.url)('../lib/evidence-vault.js');
const ledger=(...ids)=>JSON.stringify({version:'trade-evidence-v2',entries:ids.map((id,i)=>({id,createdAt:i+1}))});
const ids=raw=>JSON.parse(raw).entries.map(x=>x.id).sort();
const legacy=entries=>{const m=new Map(entries);return {m,getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
// IndexedDB simulat: get + put; vault-ul face unirea pe id înainte de put (în browser, în aceeași tranzacție)
const durable=(value=null)=>{const d={value,puts:0,get:async()=>d.value,put:async v=>{d.puts++;d.value=v;}};return d;};

test('copia veche din spațiul local se unește pe id cu IndexedDB, se marchează mutarea și se șterge doar după confirmare',async()=>{
 const l=legacy([[KEY,ledger('a','b')],['other','keep']]),d=durable(ledger('b','c')),v=create({legacy:l,durable:d,notify:false});
 const st=await v.ready();
 assert.deepEqual(ids(d.value),['a','b','c']);assert.equal(l.m.has(KEY),false);assert.equal(l.m.get(MARK),'1');assert.equal(l.m.get('other'),'keep');
 assert.deepEqual(ids(v.storage.getItem(KEY)),['a','b','c']);assert.equal(st.mode,'durable');
});
test('o salvare refuzată de IndexedDB păstrează copia din spațiul local și lucrează pe ea',async()=>{
 const l=legacy([[KEY,ledger('a')]]),v=create({legacy:l,durable:{get:async()=>null,put:async()=>{throw Error('refuzat');}},notify:false});
 const st=await v.ready();assert.equal(l.m.get(KEY),ledger('a'),'nimic pierdut');assert.equal(st.mode,'fallback');assert.equal(v.storage.getItem(KEY),ledger('a'));
});
test('scrierile ajung în IndexedDB, nu în spațiul local, și se confirmă prin flush',async()=>{
 const l=legacy([]),d=durable(null),v=create({legacy:l,durable:d,notify:false});await v.ready();
 v.storage.setItem(KEY,ledger('x'));v.storage.setItem(KEY,ledger('x','y'));await v.flush();
 assert.deepEqual(ids(d.value),['x','y']);assert.equal(l.m.has(KEY),false);
 v.storage.setItem('other','1');assert.equal(l.m.get('other'),'1','celelalte chei rămân în spațiul local');
});
test('o fereastră cu copia veche în memorie NU poate pierde o analiză: scrierea unește cu ce e salvat',async()=>{
 const d=durable(ledger('a')),A=create({legacy:legacy([]),durable:d,notify:false}),B=create({legacy:legacy([]),durable:d,notify:false});
 await A.ready();await B.ready();
 A.storage.setItem(KEY,ledger('a','x'));await A.flush();
 // B nu recitește: scrie pornind de la copia veche (fără x)
 B.storage.setItem(KEY,JSON.stringify({version:'trade-evidence-v2',entries:[{id:'a',createdAt:1},{id:'y',createdAt:3}]}));await B.flush();
 assert.deepEqual(ids(d.value),['a','x','y']);assert.deepEqual(ids(B.storage.getItem(KEY)),['a','x','y'],'copia din memorie se actualizează după scriere');
});
test('o „ștergere” a registrului nu atinge analizele păstrate în IndexedDB',async()=>{
 const d=durable(ledger('a')),v=create({legacy:legacy([]),durable:d,notify:false});await v.ready();
 v.storage.removeItem(KEY);await v.flush();assert.deepEqual(ids(d.value),['a']);
});
test('înainte de încărcare nu se poate scrie; refresh aduce ce a scris altă fereastră',async()=>{
 const d=durable(ledger('a')),v=create({legacy:legacy([]),durable:d,notify:false});
 assert.throws(()=>v.storage.setItem(KEY,ledger('z')),/se încarcă/);
 await v.ready();d.value=ledger('a','b');assert.equal(JSON.parse(v.storage.getItem(KEY)).entries.length,1);await v.refresh();assert.equal(JSON.parse(v.storage.getItem(KEY)).entries.length,2);
});
test('fără IndexedDB în browser totul merge pe spațiul local, ca înainte',async()=>{
 const l=legacy([[KEY,ledger('a')]]),v=create({legacy:l,durable:null,notify:false});await v.ready();
 assert.equal(v.storage.getItem(KEY),ledger('a'));v.storage.setItem(KEY,ledger('a','b'));assert.equal(l.m.get(KEY),ledger('a','b'));
});
test('după mutare, IndexedDB necitibil ⇒ eroare (nu „gol”), iar următorul ready() reîncearcă și își revine',async()=>{
 let down=true;const d=durable(ledger('a','b')),flaky={get:async()=>{if(down)throw Error('IDB stricat');return d.value;},put:async v=>{d.value=v;}};
 const v=create({legacy:legacy([[MARK,'1']]),durable:flaky,notify:false});
 const st=await v.ready();assert.equal(st.mode,'broken');assert.throws(()=>v.storage.getItem(KEY),/nu poate fi citit/);await assert.rejects(v.refresh(),/nu este încărcat/);
 down=false;const again=await v.ready();assert.equal(again.mode,'durable');assert.deepEqual(ids(v.storage.getItem(KEY)),['a','b']);
});
test('nemutat încă și IndexedDB stricat ⇒ lucrează pe spațiul local (nu e nimic de pierdut)',async()=>{
 const v=create({legacy:legacy([]),durable:{get:async()=>{throw Error('privat');},put:async()=>{}},notify:false});
 const st=await v.ready();assert.equal(st.mode,'fallback');assert.equal(v.storage.getItem(KEY),null);
});
test('mutarea de la pornire rulează sub lacătul registrului',async()=>{
 const calls=[],locks={request:(name,fn)=>{calls.push(name);return fn();}};
 const v=create({legacy:legacy([[KEY,ledger('a')]]),durable:durable(null),notify:false,locks});await v.ready();assert.deepEqual(calls,[KEY]);
});
test('unirea păstrează fiecare analiză o singură dată, ordonată după momentul capturii',()=>{
 assert.equal(union(null,ledger('a')),ledger('a'));assert.equal(union(ledger('a'),null),ledger('a'));
 const u=JSON.parse(union(ledger('b'),ledger('a','b')));assert.deepEqual(u.entries.map(x=>x.id),['a','b'],'fiecare id o dată; la același moment, ordonat după id');
});
test('TradeEvidence.save salvează analiza în IndexedDB prin registrul nou, iar spațiul local rămâne liber',async()=>{
 const {readFileSync}=await import('node:fs'),vm=(await import('node:vm')).default,NOW=Date.parse('2026-10-08T15:00:00Z');
 const l=legacy([]),d=durable(null),v=create({legacy:l,durable:d,notify:false});await v.ready();
 const c={Date,Intl,localStorage:l,TTEvidenceVault:{storage:v.storage}};c.window=c;vm.createContext(c);
 vm.runInContext(readFileSync('lib/trade-evidence-schema.js','utf8'),c);vm.runInContext(readFileSync('lib/trade-evidence.js','utf8'),c);
 const E=c.TradeEvidence,r0=E.demo(NOW).records[0],r={...JSON.parse(JSON.stringify(r0)),simulation:false,source:{...r0.source,kind:'market',checkedAt:NOW-300000},scope:'active',createdAt:NOW-300000,expiresAt:NOW+1500000,baselineAt:NOW-301000};
 await E.save(r,{now:NOW});
 assert.equal(l.m.has(KEY),false,'nimic în spațiul local');assert.equal(JSON.parse(d.value).entries[0].id,r.id,'analiza e în IndexedDB');assert.equal(E.read(undefined,NOW).entries.length,1);
});
