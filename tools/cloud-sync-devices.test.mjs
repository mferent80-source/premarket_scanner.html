import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {KEYS,mergeRecord,validateValue} from '../lib/cloud-sync-model.mjs';
import worker from './cloud-sync-worker.bundle.mjs';

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
 async function fetcher(url,options){assert.ok(url.startsWith(endpoint+'/api/cloud/'));return worker.fetch(new Request(url,{...options,headers:{...options.headers,Origin:origin,'CF-Connecting-IP':'192.0.2.1'}}),env,async url=>{assert.equal(url,'https://www.googleapis.com/oauth2/v3/certs');return Response.json({keys:[jwk]});});}
 return {sqlite,identity,fetcher};
}
async function device(server,{local={},vault=null}={}){
 const storage=new Map(Object.entries(local)),privateStore=new Map(),calls=[];let connection=vault;
 const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
 const window={addEventListener(){},dispatchEvent(){},TTPlanStore:{create:()=>planStore(localStorage,{durable:null,notify:false})},TTCloudStore:{get:async k=>structuredClone(privateStore.get(k)??null),put:async(k,v)=>privateStore.set(k,structuredClone(v)),remove:async k=>privateStore.delete(k)},T212Vault:{read:async()=>connection,save:async value=>{connection=structuredClone(value);},clear:async()=>{connection=null;}}};
 const context={window,localStorage,KEYS,mergeRecord,validateValue,location:{origin,href:origin+'/app/'},document:{hidden:false,querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){}},navigator:{onLine:true},CustomEvent:class{},StorageEvent:class{},AbortController,URL,Date,setTimeout,clearTimeout,setInterval:()=>{},fetch:async(url,options)=>{calls.push({url,method:options?.method||'GET'});if(url==='cloud-sync-config.json')return Response.json({enabled:false,autoActivate:true,endpoint});return server.fetcher(url,options);}};
 vm.createContext(context);vm.runInContext(source,context);const api=window.TTCloud;await api.recheck();assert.equal(api.state().ready,true);assert.equal(api.state().connected,false);
 return {api,storage,privateStore,calls,vault:()=>connection,signIn:async(subject='123')=>{const {nonce}=await api.challenge();await api.login(await server.identity(nonce,subject),nonce);}};
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
