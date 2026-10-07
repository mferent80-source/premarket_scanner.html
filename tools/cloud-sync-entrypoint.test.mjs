import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import sourceWorker from './cloud-sync-worker.mjs';
import bundledWorker from './cloud-sync-worker.bundle.mjs';

const origin='https://mferent80-source.github.io',clientId='test.apps.googleusercontent.com';
const context={waitUntil(){},passThroughOnException(){}};
const request=(path,method='GET',data,headers={})=>new Request('https://worker.example'+path,{method,headers:{Origin:origin,...headers,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
function database(sqlite){return {prepare(sql){return {first:async()=>sqlite.prepare(sql).get()||null,bind(...args){return {first:async()=>sqlite.prepare(sql).get(...args)||null,all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>({meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}})};}};}};}

for(const [name,worker] of [['source',sourceWorker],['dashboard bundle',bundledWorker]]){
 test(name+' entrypoint uses network fetch when Cloudflare supplies ExecutionContext',async t=>{
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());sqlite.exec(readFileSync(new URL('./cloud-sync-schema.sql',import.meta.url),'utf8'));
  const env={CLOUD_DB:database(sqlite),GOOGLE_CLIENT_ID:clientId,CLOUD_ENCRYPTION_KEY:Buffer.alloc(32,71).toString('base64url'),T212_AUTH_MODE:'session'};
  const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);Object.assign(jwk,{kid:'entrypoint-test',alg:'RS256'});
  const authorization='Basic '+btoa('fixture-key:fixture-secret'),calls=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
   calls.push(url);
   assert.equal(options.redirect,'manual','outbound requests must use a Workers-supported redirect mode without following redirects');
   if(url==='https://www.googleapis.com/oauth2/v3/certs')return Response.json({keys:[jwk]});
   assert.equal(url,'https://demo.trading212.com/api/v0/equity/account/summary');
   assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,authorization);
   return Response.json({currency:'EUR',totalValue:123});
  });
  const broker=await worker.fetch(request('/api/trading212/summary','GET',null,{Authorization:authorization,'X-T212-Environment':'demo'}),env,context);
  assert.equal(broker.status,200);assert.equal((await broker.json()).data.totalValue,123);
  const challenge=await worker.fetch(request('/api/cloud/challenge','POST',{}),env,context);assert.equal(challenge.status,200);
  const {nonce}=await challenge.json(),now=Math.floor(Date.now()/1000),encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned=encode({alg:'RS256',kid:jwk.kid})+'.'+encode({aud:clientId,iss:'https://accounts.google.com',sub:'123',email:'fixture@example.test',email_verified:true,nonce,iat:now,exp:now+3600});
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(unsigned));
  const login=await worker.fetch(request('/api/cloud/auth','POST',{nonce,credential:unsigned+'.'+Buffer.from(signature).toString('base64url')}),env,context);
  assert.equal(login.status,200);const identity=await login.json();assert.equal(identity.subject,'123');
  const session=await worker.fetch(request('/api/cloud/session','GET',null,{Authorization:'Bearer '+identity.token}),env,context);
  assert.equal(session.status,200);assert.equal((await session.json()).email,'fixture@example.test');
  assert.deepEqual(calls,['https://demo.trading212.com/api/v0/equity/account/summary','https://www.googleapis.com/oauth2/v3/certs']);
 });
}
