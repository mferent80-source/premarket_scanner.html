// 19.10.2026 (I-697): execuțiile Trading 212 se apropiau de limita de 1 MB a unei înregistrări (860.507 octeți, 2.444 execuții) ⇒ pachete fixe.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {KEYS,mergeRecord,validateValue,FillsCloud} from '../lib/cloud-sync-model.mjs';
import {handleCloud} from './cloud-sync-worker.bundle.mjs';

const F=FillsCloud,SCOPE='live:fixture';
// o execuție de mărimea celor reale (~350 de octeți)
const fill=(i,extra={})=>({id:String(9000000000+i),orderId:String(8000000000+i),ticker:'AAPL_US_EQ',date:new Date(Date.UTC(2024,0,1)+i*3600000).toISOString(),side:i%2?'SELL':'BUY',quantity:1.2345678,price:187.12,priceCurrency:'USD',currency:'EUR',realized:i%2?3.45:null,amount:210.5,fxRate:.9212,status:'FILLED',type:'TRADE',taxes:[{name:'CURRENCY_CONVERSION_FEE',quantity:.31,currency:'EUR'}],...extra});
const register=(ids,meta={})=>({accounts:{[SCOPE]:{environment:'live',fetchedAt:'2026-10-19T10:00:00.000Z',complete:false,nextCursor:'abc',syncStatus:'loading',syncError:null,...meta,items:ids.map(i=>typeof i==='number'?fill(i):i)}}});
const bytes=v=>Buffer.byteLength(JSON.stringify(v));
const range=(a,b)=>Array.from({length:b-a},(_,i)=>a+i);
const ids=data=>new Set(Object.values(data.accounts).flatMap(a=>a.items.map(x=>String(x.id))));
const join=values=>{let data={accounts:{}};for(const [k,v] of values)data=F.apply(data,k,v);return data;};

test('cheile: 16 pachete fixe + starea importului, după toate cheile vechi; cheia veche rămâne',()=>{
 assert.equal(F.keys.length,17);assert.equal(F.META,'tt_trading212_fills_v1:cont');assert.ok(KEYS.includes('tt_trading212_fills_v1'));
 assert.deepEqual(F.keys.slice(1),Array.from({length:16},(_,i)=>'tt_trading212_fills_v1:'+i.toString(16).padStart(2,'0')));
 assert.deepEqual(KEYS.slice(-17),F.keys,'pachetele vin după cheia veche: întâi se citește cheia veche, apoi starea, apoi execuțiile');
 for(const k of F.keys)assert.equal(F.isKey(k),true);assert.equal(F.isKey('tt_trading212_fills_v1'),false);
 assert.equal(F.bucket(SCOPE,'42'),F.bucket(SCOPE,42),'același pachet pentru id numeric și text');
});

test('3.500 de execuții (peste 1 MB) încap: fiecare pachet trece validarea, iar împărțirea + reunirea dau exact registrul',()=>{
 const data=register(range(0,3500));assert.ok(bytes(data)>1000000,'registrul întreg ar fi respins');assert.throws(()=>validateValue('tt_trading212_fills_v1',data),/record_too_large/);
 const parts=F.split(data);assert.equal(parts.size,17);
 for(const [k,v] of parts){assert.equal(validateValue(k,v),true);assert.ok(bytes(v)<120000,k+' '+bytes(v));}
 const back=join(parts);assert.deepEqual(new Set(back.accounts[SCOPE].items.map(x=>x.id)),ids(data));assert.equal(back.accounts[SCOPE].items.length,3500);
 const {items,...meta}=data.accounts[SCOPE],{items:_,...metaBack}=back.accounts[SCOPE];assert.deepEqual(metaBack,meta);
 assert.equal(F.split({accounts:{}}).size,0,'registru gol ⇒ niciun pachet');
});

test('unirea pe id: execuțiile distincte de pe două aparate se adună, nimic nu se dublează, ordinea nu contează',()=>{
 const pc=F.split(register(range(0,300))),phone=F.split(register(range(200,500),{fetchedAt:'2026-10-19T11:00:00.000Z',complete:true,nextCursor:null,syncStatus:'complete'}));
 let merged=new Map();
 for(const k of F.keys){const a=mergeRecord(k,undefined,pc.get(k),phone.get(k)),b=mergeRecord(k,undefined,phone.get(k),pc.get(k));assert.deepEqual(a.conflicts,[]);assert.deepEqual(a.value,b.value,'aceeași valoare pe ambele aparate');if(a.value)merged.set(k,a.value);}
 const data=join(merged);assert.equal(data.accounts[SCOPE].items.length,500);assert.deepEqual(ids(data),new Set(range(0,500).map(i=>String(9000000000+i))));
 assert.equal(data.accounts[SCOPE].fetchedAt,'2026-10-19T11:00:00.000Z','starea importului: citirea mai recentă de la broker');assert.equal(data.accounts[SCOPE].complete,true);
});

test('aceeași execuție cu alt conținut pe două aparate = conflict, fără amestec',()=>{
 const k=F.bucket(SCOPE,String(9000000007)),local=F.split(register([7])).get(k),remote=F.split(register([fill(7,{price:999})])).get(k);
 const m=mergeRecord(k,undefined,local,remote);assert.deepEqual(m.conflicts,[k+'/accounts/'+SCOPE+'/items/9000000007']);assert.equal(m.value,local);
});

test('starea importului la aceeași oră: aceeași alegere pe ambele aparate (fără rescriere la nesfârșit)',()=>{
 const a=F.split(register([1],{syncStatus:'loading'})).get(F.META),b=F.split(register([1],{syncStatus:'partial'})).get(F.META);
 assert.deepEqual(mergeRecord(F.META,undefined,a,b).value,mergeRecord(F.META,undefined,b,a).value);
});

test('o ștergere locală nu șterge din cont: un pachet lipsă se completează din cont',()=>{
 const parts=F.split(register(range(0,40))),k=[...parts.keys()].find(x=>x!==F.META);
 assert.deepEqual(mergeRecord(k,parts.get(k),undefined,parts.get(k)).value,parts.get(k));
});

test('aplicarea unui pachet atinge doar execuțiile lui; cele fără id și alte conturi rămân',()=>{
 const data=register(range(0,60));data.accounts[SCOPE].items.push({ticker:'X',note:'fără id'});data.accounts['demo:x']={environment:'demo',items:[fill(1)]};
 const k=F.bucket(SCOPE,String(9000000003)),next={version:F.VERSION,accounts:{[SCOPE]:{items:[fill(3,{price:1})]}}};
 const out=F.apply(data,k,next),before=data.accounts[SCOPE].items.filter(x=>x.id&&F.bucket(SCOPE,x.id)!==k).length;
 assert.equal(out.accounts[SCOPE].items.filter(x=>x.id&&F.bucket(SCOPE,x.id)!==k).length,before);assert.ok(out.accounts[SCOPE].items.some(x=>x.note==='fără id'));
 assert.deepEqual(out.accounts[SCOPE].items.filter(x=>x.id&&F.bucket(SCOPE,x.id)===k),[fill(3,{price:1})]);assert.deepEqual(out.accounts['demo:x'],data.accounts['demo:x']);
 assert.equal(data.accounts[SCOPE].items.length,61,'registrul primit nu e modificat');
});

test('validarea: execuție în alt pachet, id dublat, stare cu execuții sau versiune străină sunt respinse',()=>{
 const k=F.bucket(SCOPE,String(9000000001)),other=F.keys.find(x=>x!==F.META&&x!==k),v=F.split(register([1])).get(k);
 assert.equal(validateValue(k,v),true);assert.throws(()=>validateValue(other,v),/invalid_value/);
 assert.throws(()=>validateValue(k,{...v,accounts:{[SCOPE]:{items:[fill(1),fill(1)]}}}),/invalid_value/);
 assert.throws(()=>validateValue(F.META,{version:F.VERSION,accounts:{[SCOPE]:{items:[]}}}),/invalid_value/);
 assert.throws(()=>validateValue(k,{version:'x',accounts:{}}),/invalid_value/);
});

const ORIGIN='https://mferent80-source.github.io',TOKEN=Buffer.alloc(32,7).toString('base64url'),SUBJECT='123';
function service(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('./cloud-sync-schema.sql',import.meta.url),'utf8'));
 sqlite.prepare('INSERT INTO cloud_sessions VALUES(?,?,?,?)').run(createHash('sha256').update(TOKEN).digest('base64url'),SUBJECT,'t@example.test',Math.floor(Date.now()/1000)+3600);
 const env={GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',CLOUD_ENCRYPTION_KEY:Buffer.alloc(32,3).toString('base64url'),CLOUD_DB:{prepare(sql){return {first:async()=>sqlite.prepare(sql).get()||null,bind(...a){return {first:async()=>sqlite.prepare(sql).get(...a)||null,all:async()=>({results:sqlite.prepare(sql).all(...a)}),run:async()=>({meta:{changes:Number(sqlite.prepare(sql).run(...a).changes)}})};}};}}};
 const call=(path,method='GET',data)=>handleCloud(new Request('https://worker/api/cloud/'+path,{method,headers:{Origin:ORIGIN,Authorization:'Bearer '+TOKEN,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})}),env);
 return {sqlite,call};
}
test('serviciul: primește pachetele, le arată doar aplicațiilor noi (index=3); index=1/2 și citirea completă nu le văd',async()=>{
 const s=service();try{
  const parts=F.split(register(range(0,50))),k=[...parts.keys()].find(x=>x!==F.META);
  assert.ok((await (await s.call('status')).json()).supportedKeys.includes(k));
  assert.equal((await s.call('record','PUT',{key:k,value:parts.get(k),revision:0})).status,200);
  assert.equal((await s.call('record','PUT',{key:'tt_theme',value:'dark',revision:0})).status,200);
  const wrong=F.keys.find(x=>x!==F.META&&x!==k);assert.equal((await s.call('record','PUT',{key:wrong,value:parts.get(k),revision:0})).status,400,'pachet greșit respins');
  for(const level of ['1','2'])assert.deepEqual(Object.keys((await (await s.call('records?index='+level)).json()).records),['tt_theme'],'index='+level);
  assert.deepEqual(Object.keys((await (await s.call('records?index=3')).json()).records).sort(),[k,'tt_theme'].sort());
  assert.deepEqual(Object.keys((await (await s.call('records')).json()).records),['tt_theme']);
  assert.deepEqual((await (await s.call('records?key='+encodeURIComponent(k))).json()).records[k].value,parts.get(k));
 }finally{s.sqlite.close();}
});
