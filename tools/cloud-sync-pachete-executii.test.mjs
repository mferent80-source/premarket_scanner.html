// 19.10.2026 (I-697 + p.2): execuțiile Trading 212 pe pachete prin serviciul real (JWT, D1 criptat), migrarea de pe cheia veche,
// serverul vechi și o cheie care pică fără să oprească restul sincronizării.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {KEYS,mergeRecord,validateValue,EvidenceCloud,ForecastCloud,LAST_WRITE_WINS,FillsCloud} from '../lib/cloud-sync-model.mjs';
import {handleCloud} from './cloud-sync-worker.bundle.mjs';

const source=readFileSync(new URL('../app/cloud-sync.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/,'');
const {create:planStore}=createRequire(import.meta.url)('../lib/trade-plan-store.js');
const {create:fillsStore}=createRequire(import.meta.url)('../lib/trading212-fills-store.js');
const endpoint='https://premarket-scanner-html.mferent80.workers.dev',origin='https://mferent80-source.github.io',clientId='test.apps.googleusercontent.com';
const FILLS='tt_trading212_fills_v1',SCOPE='live:fixture';
const fill=(i,extra={})=>({id:String(9000000000+i),orderId:String(8000000000+i),ticker:'AAPL_US_EQ',date:new Date(Date.UTC(2024,0,1)+i*3600000).toISOString(),side:i%2?'SELL':'BUY',quantity:1.2345678,price:187.12,priceCurrency:'USD',currency:'EUR',realized:i%2?3.45:null,amount:210.5,fxRate:.9212,status:'FILLED',type:'TRADE',taxes:[{name:'CURRENCY_CONVERSION_FEE',quantity:.31,currency:'EUR'}],...extra});
const register=list=>({accounts:{[SCOPE]:{environment:'live',fetchedAt:'2026-10-19T10:00:00.000Z',complete:true,nextCursor:null,syncStatus:'complete',syncError:null,items:list.map(i=>typeof i==='number'?fill(i):i)}}});
const range=(a,b)=>Array.from({length:b-a},(_,i)=>a+i);
const idsOf=data=>data.accounts[SCOPE].items.map(x=>x.id),plain=x=>JSON.parse(JSON.stringify(x));

async function service(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('./cloud-sync-schema.sql',import.meta.url),'utf8'));
 const env={GOOGLE_CLIENT_ID:clientId,CLOUD_ENCRYPTION_KEY:Buffer.alloc(32,31).toString('base64url'),CLOUD_DB:{prepare(sql){return {first:async()=>sqlite.prepare(sql).get()||null,bind(...args){return {first:async()=>sqlite.prepare(sql).get(...args)||null,all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>({meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}})};}};}}};
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']),jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);Object.assign(jwk,{kid:'test',alg:'RS256'});
 async function identity(nonce){const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),now=Math.floor(Date.now()/1000),unsigned=encode({alg:'RS256',kid:'test'})+'.'+encode({aud:clientId,iss:'https://accounts.google.com',sub:'123',email:'123@example.test',email_verified:true,nonce,iat:now,exp:now+3600});const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(unsigned));return unsigned+'.'+Buffer.from(signature).toString('base64url');}
 const fetcher=(url,options)=>handleCloud(new Request(url,{...options,headers:{...options.headers,Origin:origin,'CF-Connecting-IP':'192.0.2.1'}}),env,async()=>Response.json({keys:[jwk]}));
 const row=key=>sqlite.prepare('SELECT revision FROM cloud_records WHERE key=?').get(key);
 return {sqlite,identity,fetcher,row};
}
// oldServer: serverul de dinainte de pachete (nu le anunță în supportedKeys); intercept(url,options,body) poate înlocui un răspuns
async function device(server,{local={},oldServer=false,intercept}={}){
 const storage=new Map(Object.entries(local)),privateStore=new Map(),calls=[];
 const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
 const fills=fillsStore(localStorage,{durable:null,notify:false});
 const window={addEventListener(){},dispatchEvent(){},T212FillsStore:fills,TTPlanStore:{create:()=>planStore(localStorage,{durable:null,notify:false})},TTCloudStore:{get:async k=>structuredClone(privateStore.get(k)??null),put:async(k,v)=>privateStore.set(k,structuredClone(v)),remove:async k=>privateStore.delete(k)},T212Vault:{read:async()=>null,save:async()=>{},clear:async()=>{}}};
 const context={window,localStorage,KEYS,LAST_WRITE_WINS,mergeRecord,validateValue,EvidenceCloud,ForecastCloud,FillsCloud,location:{origin,href:origin+'/app/'},document:{hidden:false,querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){}},navigator:{onLine:true},CustomEvent:class{},StorageEvent:class{},AbortController,URL,URLSearchParams,Date,setTimeout,clearTimeout,setInterval:()=>{},
  fetch:async(url,options={})=>{
   if(url==='cloud-sync-config.json')return Response.json({enabled:false,autoActivate:true,endpoint});
   const body=options.body?JSON.parse(options.body):null;calls.push({url,method:options.method||'GET',key:body?.key});
   const replaced=intercept?await intercept(url,options,body):undefined;if(replaced)return replaced;
   const response=await server.fetcher(url,options);
   if(oldServer&&url.endsWith('/status')){const s=await response.json();s.supportedKeys=s.supportedKeys.filter(k=>!FillsCloud.isKey(k));return Response.json(s);}
   return response;
  }};
 vm.createContext(context);vm.runInContext(readFileSync(new URL('../app/failure-info.js',import.meta.url),'utf8'),context);vm.runInContext(source,context);const api=window.TTCloud;await api.recheck();
 const puts=()=>calls.filter(c=>c.method==='PUT').map(c=>c.key);
 return {api,storage,calls,puts,fills,signIn:async()=>{const {nonce}=await api.challenge();await api.login(await server.identity(nonce),nonce);}};
}

test('3.200 de execuții (peste 1 MB) trec prin pachete PC → telefon, fără dubluri, iar o execuție nouă scrie un singur pachet',async()=>{
 const server=await service();try{
  const data=register(range(0,3200));assert.ok(Buffer.byteLength(JSON.stringify(data))>1000000);
  const pc=await device(server,{local:{[FILLS]:JSON.stringify(data),tt_theme:'dark'}});await pc.signIn();
  assert.equal(pc.api.state().error,'');assert.ok(pc.api.state().lastSync);assert.deepEqual(plain(pc.api.state().skipped),[]);
  assert.ok(pc.calls.some(c=>c.url.endsWith('records?index=3')),'aplicația nouă cere indexul cu pachete');
  assert.deepEqual(pc.puts().filter(k=>FillsCloud.isKey(k)).sort(),[...FillsCloud.keys].sort(),'toate cele 17 pachete urcă');
  assert.ok(!pc.puts().includes(FILLS),'cheia veche nu se mai scrie');assert.equal(server.row(FILLS),undefined);
  const phone=await device(server);await phone.signIn();assert.equal(phone.api.state().error,'');
  const got=(await phone.fills.read()).data;assert.equal(idsOf(got).length,3200);assert.deepEqual(new Set(idsOf(got)),new Set(idsOf(data)));
  const {items,...meta}=got.accounts[SCOPE];assert.equal(meta.fetchedAt,'2026-10-19T10:00:00.000Z');assert.equal(meta.complete,true);
  assert.deepEqual(phone.puts(),[],'telefonul doar primește');
  const before=pc.puts().length;await pc.fills.mutate(d=>{d.accounts[SCOPE].items.unshift(fill(5000));return d;});await pc.api.sync();
  assert.deepEqual(pc.puts().slice(before),[FillsCloud.bucket(SCOPE,fill(5000).id)],'o execuție nouă ⇒ un singur pachet scris');
  await phone.api.sync();const after=(await phone.fills.read()).data;assert.equal(idsOf(after).length,3201);assert.ok(idsOf(after).includes(fill(5000).id));
  const sizes=plain(pc.api.state()).sizes;for(const k of FillsCloud.keys)assert.ok(sizes[k]>0&&sizes[k]<pc.api.state().recordLimit,k);
 }finally{server.sqlite.close();}
});

test('migrarea: execuțiile din cheia veche (scrise de aplicația de dinainte) intră în registru și în pachete; nimic pierdut, nimic dublat',async()=>{
 const server=await service();try{
  // telefonul cu aplicația veche a scris cheia veche: execuțiile 0–99
  const old=await device(server,{local:{[FILLS]:JSON.stringify(register(range(0,100)))},oldServer:true});await old.signIn();
  assert.equal(old.api.state().error,'');assert.ok(old.puts().includes(FILLS));const legacyRevision=server.row(FILLS).revision;
  // PC-ul cu aplicația nouă are 50–199
  const pc=await device(server,{local:{[FILLS]:JSON.stringify(register(range(50,200)))}});await pc.signIn();assert.equal(pc.api.state().error,'');
  const merged=(await pc.fills.read()).data;assert.equal(idsOf(merged).length,200);assert.deepEqual(new Set(idsOf(merged)),new Set(range(0,200).map(i=>fill(i).id)));
  assert.equal(server.row(FILLS).revision,legacyRevision,'cheia veche rămâne neatinsă');
  // aplicația veche mai adaugă o execuție în cheia veche ⇒ PC-ul o preia și o urcă în pachete
  await old.fills.mutate(d=>{d.accounts[SCOPE].items.unshift(fill(777));return d;});await old.api.sync();assert.ok(server.row(FILLS).revision>legacyRevision);
  await pc.api.sync();assert.equal(pc.api.state().error,'');assert.ok(idsOf((await pc.fills.read()).data).includes(fill(777).id));
  const phone=await device(server);await phone.signIn();const got=(await phone.fills.read()).data;
  assert.equal(idsOf(got).length,201);assert.equal(new Set(idsOf(got)).size,201,'fără dubluri');
 }finally{server.sqlite.close();}
});

test('serverul vechi (fără pachete): cheia veche merge ca înainte, fără index=3 și fără pachete',async()=>{
 const server=await service();try{
  const pc=await device(server,{local:{[FILLS]:JSON.stringify(register(range(0,20)))},oldServer:true});await pc.signIn();
  assert.equal(pc.api.state().error,'');assert.ok(pc.puts().includes(FILLS));assert.ok(!pc.puts().some(k=>FillsCloud.isKey(k)));
  assert.ok(!pc.calls.some(c=>c.url.endsWith('records?index=3')));assert.ok(!pc.api.state().supportedKeys.some(k=>FillsCloud.isKey(k)));
 }finally{server.sqlite.close();}
});

test('p.2: o cheie prea mare, una respinsă de server și una stricată local sunt sărite și raportate; restul se sincronizează',async()=>{
 const server=await service();try{
  const local={[FILLS]:JSON.stringify(register(range(0,3200))),tt_holdings_symbols_v1:'{stricat',tt_theme:'dark',wl_stocks:'["AAPL"]',tt_holdings_theses_v1:'{"AAPL":{"text":"x"}}'};
  const intercept=(url,options,body)=>body?.key==='tt_holdings_theses_v1'?Response.json({error:'invalid_value'},{status:400,headers:{'Access-Control-Allow-Origin':origin}}):undefined;
  const pc=await device(server,{local,oldServer:true,intercept});await pc.signIn();
  const s=plain(pc.api.state());
  assert.deepEqual(s.skipped.map(x=>x.key).sort(),[FILLS,'tt_holdings_symbols_v1','tt_holdings_theses_v1'].sort());
  assert.deepEqual(Object.fromEntries(s.skipped.map(x=>[x.key,x.code])),{[FILLS]:'record_too_large',tt_holdings_theses_v1:'invalid_value',tt_holdings_symbols_v1:'client_error'});
  assert.match(s.error,/^3 registre nu s-au sincronizat/);assert.equal(s.failure.key,FILLS);assert.equal(s.failure.code,'record_too_large');assert.equal(s.lastSync,null,'sincronizarea nu se declară completă');
  assert.ok(s.sizes[FILLS]>s.recordLimit,'contorul arată depășirea');
  for(const key of ['tt_theme','wl_stocks'])assert.ok(server.row(key),key+' a urcat, deși e după cheile căzute');
  assert.equal(pc.storage.get('tt_holdings_symbols_v1'),'{stricat','cheia stricată rămâne neatinsă');
  // o singură cheie căzută ⇒ mesajul ei exact
  pc.storage.set('tt_holdings_symbols_v1','{}');await pc.api.sync();assert.equal(pc.api.state().skipped.length,2);
 }finally{server.sqlite.close();}
});

test('p.2: fără răspuns de la rețea trecerea se oprește (nu se sare cheia, nu se scrie mai departe)',async()=>{
 const server=await service();try{
  let broken=false;const intercept=(url,options,body)=>{if(broken&&body?.key==='tt_theme')throw TypeError('Failed to fetch');};
  const pc=await device(server,{local:{tt_theme:'dark'},intercept});await pc.signIn();assert.equal(pc.api.state().error,'');
  broken=true;pc.storage.set('tt_theme','light');pc.storage.set('tt_pf_account','5000');const before=pc.puts().length;await pc.api.sync();
  assert.equal(pc.api.state().failure.code,'network_error');assert.deepEqual(plain(pc.api.state().skipped),[]);assert.deepEqual(pc.puts().slice(before),['tt_theme'],'după eroarea de rețea nu se mai scrie nimic (tt_pf_account vine după tt_theme)');assert.equal(pc.api.state().lastSync>0,true);
 }finally{server.sqlite.close();}
});
