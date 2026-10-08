import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {KEYS,mergeRecord,validateValue,EvidenceCloud} from '../lib/cloud-sync-model.mjs';
import {handleCloud} from './cloud-sync-worker.bundle.mjs';

const source=readFileSync(new URL('../app/cloud-sync.js',import.meta.url),'utf8').replace(/^import .*;\n/,'');
const {create:planStore}=createRequire(import.meta.url)('../lib/trade-plan-store.js');
const endpoint='https://premarket-scanner-html.mferent80.workers.dev',origin='https://mferent80-source.github.io',clientId='test.apps.googleusercontent.com';
async function service(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('./cloud-sync-schema.sql',import.meta.url),'utf8'));
 const env={GOOGLE_CLIENT_ID:clientId,CLOUD_ENCRYPTION_KEY:Buffer.alloc(32,31).toString('base64url'),CLOUD_DB:{prepare(sql){return {first:async()=>sqlite.prepare(sql).get()||null,bind(...args){return {first:async()=>sqlite.prepare(sql).get(...args)||null,all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>({meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}})};}};}}};
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']),jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);Object.assign(jwk,{kid:'test',alg:'RS256'});
 async function identity(nonce,subject='123'){
  const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),now=Math.floor(Date.now()/1000),unsigned=encode({alg:'RS256',kid:'test'})+'.'+encode({aud:clientId,iss:'https://accounts.google.com',sub:subject,email:subject+'@example.test',email_verified:true,nonce,iat:now,exp:now+3600});
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(unsigned));return unsigned+'.'+Buffer.from(signature).toString('base64url');
 }
 async function fetcher(url,options){assert.ok(url.startsWith(endpoint+'/api/cloud/'));return handleCloud(new Request(url,{...options,headers:{...options.headers,Origin:origin,'CF-Connecting-IP':'192.0.2.1'}}),env,async url=>{assert.equal(url,'https://www.googleapis.com/oauth2/v3/certs');return Response.json({keys:[jwk]});});}
 return {sqlite,identity,fetcher};
}
async function device(server,{local={},vault=null}={}){
 const storage=new Map(Object.entries(local)),privateStore=new Map(),calls=[];let connection=vault;
 const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
 const window={addEventListener(){},dispatchEvent(){},TTPlanStore:{create:()=>planStore(localStorage,{durable:null,notify:false})},TTCloudStore:{get:async k=>structuredClone(privateStore.get(k)??null),put:async(k,v)=>privateStore.set(k,structuredClone(v)),remove:async k=>privateStore.delete(k)},T212Vault:{read:async()=>connection,save:async value=>{connection=structuredClone(value);},clear:async()=>{connection=null;}}};
 const context={window,localStorage,KEYS,mergeRecord,validateValue,EvidenceCloud,location:{origin,href:origin+'/app/'},document:{hidden:false,querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){}},navigator:{onLine:true},CustomEvent:class{},StorageEvent:class{},AbortController,URL,Date,setTimeout,clearTimeout,setInterval:()=>{},fetch:async(url,options)=>{calls.push({url,method:options?.method||'GET'});if(url==='cloud-sync-config.json')return Response.json({enabled:false,autoActivate:true,endpoint});return server.fetcher(url,options);}};
 vm.createContext(context);vm.runInContext(source,context);const api=window.TTCloud;await api.recheck();assert.equal(api.state().ready,true);assert.equal(api.state().connected,false);
 return {api,storage,privateStore,calls,vault:()=>connection,forgetConnection:()=>window.T212Vault.clear(),signIn:async(subject='123')=>{const {nonce}=await api.challenge();await api.login(await server.identity(nonce,subject),nonce);}};
}
test('PC and new phone reconcile through real JWT verification, encrypted D1 records and device sessions',async()=>{
 const server=await service();try{
  const credentials={environment:'live',key:'fixture-key',secret:'fixture-secret'},pc=await device(server,{local:{tt_journal_v1:'[{"id":"first","note":"original"}]'},vault:credentials});await pc.signIn();assert.equal(pc.api.state().error,'');
  const phone=await device(server);assert.equal(phone.storage.get('tt_journal_v1'),undefined);assert.equal(phone.calls.length,2);await phone.signIn();
  assert.deepEqual(JSON.parse(phone.storage.get('tt_journal_v1')),[{id:'first',note:'original'}]);assert.deepEqual(phone.vault(),credentials);assert.equal(phone.privateStore.get('owner'),'123');assert.ok(phone.api.state().lastSync);
  const packets=server.sqlite.prepare('SELECT packet FROM cloud_records').all().map(r=>r.packet).join('');for(const text of ['fixture-key','fixture-secret','original'])assert.ok(!packets.includes(text));
  pc.storage.set('tt_journal_v1','[{"id":"first","note":"PC edit"}]');phone.storage.set('tt_journal_v1','[{"id":"first","note":"phone edit"}]');await pc.api.sync();await phone.api.sync();
  assert.ok(phone.api.state().conflicts.includes('tt_journal_v1'));assert.equal(JSON.parse(phone.storage.get('tt_journal_v1'))[0].note,'phone edit');await phone.api.resolve('tt_journal_v1','remote');
  assert.equal(JSON.parse(phone.storage.get('tt_journal_v1'))[0].note,'PC edit');assert.equal(phone.api.state().conflicts.length,0);assert.equal(phone.privateStore.get('backups:123')[0].snapshot.tt_journal_v1[0].note,'phone edit');
  const stranger=await device(server);await stranger.signIn('456');assert.equal(stranger.storage.get('tt_journal_v1'),undefined);assert.equal(stranger.vault(),null);
  await pc.api.logout();const before=pc.calls.filter(c=>c.url.endsWith('/records')).length;await assert.rejects(pc.signIn('456'),/account_mismatch/);assert.equal(pc.calls.filter(c=>c.url.endsWith('/records')).length,before);assert.equal(pc.privateStore.get('owner'),'123');
 }finally{server.sqlite.close();}
});

test('explicit cloud save and retrieval restore a forgotten phone connection through authenticated encrypted D1',async()=>{
 const server=await service();try{
  const credentials={environment:'demo',key:'fixture-api-key',secret:'fixture-api-secret'},pc=await device(server,{vault:credentials});await pc.signIn();
  await pc.api.publishCredentials();assert.equal(pc.api.state().trading212.synced,true);assert.match(pc.api.state().trading212.message,/verificată/);
  const phone=await device(server);await phone.signIn();assert.deepEqual(phone.vault(),credentials);
  await phone.forgetConnection();await phone.api.sync();assert.equal(phone.vault(),null);assert.equal(phone.api.state().trading212.cloud,true);assert.equal(phone.api.state().trading212.synced,false);
  const writes=phone.calls.filter(c=>c.method==='PUT').length;await phone.api.restoreCredentials();
  assert.deepEqual(phone.vault(),credentials);assert.equal(phone.calls.filter(c=>c.method==='PUT').length,writes);assert.equal(phone.api.state().trading212.synced,true);assert.match(phone.api.state().trading212.message,/preluată/);
  for(const api of [pc.api,phone.api])for(const sensitive of [credentials.key,credentials.secret])assert.ok(!JSON.stringify(api.state()).includes(sensitive));
  const stranger=await device(server);await stranger.signIn('456');await assert.rejects(stranger.api.restoreCredentials(),/cloud_credentials_missing/);assert.equal(stranger.vault(),null);
 }finally{server.sqlite.close();}
});
test('Europa histories and risk settings reconcile between signed-in PC and phone through encrypted D1',async()=>{
 const server=await service();try{
  const first={id:'DE0007164600:2026-10-01:earlyLong',symbol:'SAP.DE',isin:'DE0007164600',name:'SAP',market:'DE',sector:'Tech',currency:'EUR',category:'earlyLong',currentCategory:'earlyLong',firstDate:'2026-10-01',lastDate:'2026-10-01',firstPrice:100,lastPrice:100,firstStop:90,support:92,createdAt:1790866800000,policy:1,active:true,status:'ACTIVE',transitions:[{date:'2026-10-01',category:'earlyLong'}],outcomes:{}};
  const second={...first,id:'GB00BP6MXD84:2026-10-01:earlyLong',symbol:'SHEL.L',isin:'GB00BP6MXD84',name:'Shell',market:'GB',currency:'GBP'};
  const risk={currency:'RON',budget:'1000',loss:'30',fees:'5',entry:'100',fractional:false},key='tt_europe_signals_v1',riskKey='tt_europe_risk_settings_v1';
  const pc=await device(server,{local:{[key]:JSON.stringify({schema:1,entries:[first]}),[riskKey]:JSON.stringify(risk)}});await pc.signIn();assert.equal(pc.api.state().error,'');
  const phone=await device(server,{local:{[key]:JSON.stringify({schema:1,entries:[second]})}});await phone.signIn();assert.equal(phone.api.state().error,'');assert.equal(phone.api.state().conflicts.length,0);
  await pc.api.sync();for(const d of [pc,phone]){assert.equal(JSON.parse(d.storage.get(key)).entries.length,2);assert.deepEqual(JSON.parse(d.storage.get(riskKey)),risk);assert.ok(d.api.state().supportedKeys.includes(key));}
  const third=await device(server);await third.signIn();assert.equal(JSON.parse(third.storage.get(key)).entries[0].firstPrice,100);assert.deepEqual(JSON.parse(third.storage.get(riskKey)),risk);
  assert.ok(!server.sqlite.prepare('SELECT packet FROM cloud_records').all().map(r=>r.packet).join('').includes('DE0007164600'));
  pc.storage.set(riskKey,JSON.stringify({...risk,budget:'2000'}));phone.storage.set(riskKey,JSON.stringify({...risk,loss:'50'}));await pc.api.sync();await phone.api.sync();assert.ok(phone.api.state().conflicts.includes(riskKey));assert.equal(JSON.parse(phone.storage.get(riskKey)).budget,'1000');
  await phone.api.resolve(riskKey,'remote');assert.deepEqual(JSON.parse(phone.storage.get(riskKey)),{...risk,budget:'2000'});
 }finally{server.sqlite.close();}
});

const {analysis,ledger}=await import('./trade-evidence-fixtures.mjs');
test('frozen pre-entry captures reconcile PC and phone through real encrypted D1 and survive conflicts without field mixing',async()=>{
 const server=await service();try{
  const a=analysis(),key=EvidenceCloud.bucket(a.id);let i=0;while(EvidenceCloud.bucket('phone-'+i)!==key)i++;const b=analysis('phone-'+i);
  const pc=await device(server,{local:{[EvidenceCloud.KEY]:JSON.stringify(ledger(a))}});await pc.signIn();assert.equal(pc.api.state().error,'');
  const phone=await device(server,{local:{[EvidenceCloud.KEY]:JSON.stringify(ledger(b))}});await phone.signIn();await pc.api.sync();
  for(const d of [pc,phone]){assert.equal(JSON.parse(d.storage.get(EvidenceCloud.KEY)).entries.length,2);assert.ok(d.api.state().supportedKeys.includes(EvidenceCloud.KEY));}
  assert.ok(!server.sqlite.prepare('SELECT packet FROM cloud_records').all().map(r=>r.packet).join('').includes('AAPL_US_EQ'));
  const changed={...a,stop:90};phone.storage.set(EvidenceCloud.KEY,JSON.stringify(ledger(changed,b)));await phone.api.sync();assert.ok(phone.api.state().conflicts.includes(key));assert.equal(JSON.parse(pc.storage.get(EvidenceCloud.KEY)).entries.find(r=>r.id===a.id).stop,95);
  await phone.api.resolve(key,'remote');assert.equal(JSON.parse(phone.storage.get(EvidenceCloud.KEY)).entries.length,2);assert.equal(JSON.parse(phone.storage.get(EvidenceCloud.KEY)).entries.find(r=>r.id===a.id).stop,95);assert.equal(phone.privateStore.get('backups:123')[0].snapshot[EvidenceCloud.KEY].entries[0].stop,90);
  const other=await device(server);await other.signIn('456');assert.equal(other.storage.get(EvidenceCloud.KEY),undefined);
 }finally{server.sqlite.close();}
});
