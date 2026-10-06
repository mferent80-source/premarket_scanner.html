import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {buildBundle,destination} from './cloud-sync-bundle.mjs';
import worker,{seal,unseal} from './cloud-sync-worker.bundle.mjs';

const ORIGIN='https://mferent80-source.github.io';
const request=(route,method='GET',token='',data)=>new Request('https://worker'+route,{method,headers:{Origin:ORIGIN,...(token?{Authorization:'Bearer '+token}:{}),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
function database(sqlite){return {prepare(sql){return {first:async()=>sqlite.prepare(sql).get()||null,bind(...args){return {first:async()=>sqlite.prepare(sql).get(...args)||null,all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>({meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}})};}};}};}
test('the dashboard Worker contains the exact tested sources and needs no external imports',async()=>{
 const built=await buildBundle(),saved=await readFile(destination,'utf8');assert.equal(saved,built);assert.ok(!/^import\b/m.test(saved));
});
test('the standalone deployment keeps broker access read-only and refuses unconfigured cloud',async()=>{
 assert.equal((await worker.fetch(request('/api/trading212/positions','POST'),{})).status,405);
 assert.equal((await worker.fetch(request('/api/trading212/positions'),{T212_AUTH_MODE:'session'})).status,401);
 const status=await (await worker.fetch(request('/api/cloud/status'),{})).json();assert.equal(status.enabled,false);assert.equal(status.protocol,'tt-cloud-sync-v1');
 assert.equal((await worker.fetch(request('/api/cloud/records'),{})).status,503);
 assert.equal((await worker.fetch(new Request('https://worker/api/cloud/status',{headers:{Origin:'https://elsewhere.test'}}),{})).status,403);
});
test('the standalone Worker preserves encryption, per-user records and concurrent revision protection',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(await readFile(new URL('./cloud-sync-schema.sql',import.meta.url),'utf8'));const key=Buffer.alloc(32,91).toString('base64url'),env={CLOUD_DB:database(sqlite),GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',CLOUD_ENCRYPTION_KEY:key};
 const first=Buffer.alloc(32,1).toString('base64url'),second=Buffer.alloc(32,2).toString('base64url');for(const [token,subject] of [[first,'111'],[second,'222']])sqlite.prepare('INSERT INTO cloud_sessions VALUES(?,?,?,?)').run(createHash('sha256').update(token).digest('base64url'),subject,'test@example.test',Math.floor(Date.now()/1000)+3600);
 assert.equal((await (await worker.fetch(request('/api/cloud/status'),env)).json()).enabled,true);
 const data={key:'tt_journal_v1',value:[{id:'private-trade'}],revision:0};assert.equal((await worker.fetch(request('/api/cloud/record','PUT',first,data),env)).status,200);assert.equal((await worker.fetch(request('/api/cloud/record','PUT',first,data),env)).status,409);
 assert.deepEqual((await (await worker.fetch(request('/api/cloud/records','GET',first),env)).json()).records.tt_journal_v1.value,data.value);
 assert.deepEqual((await (await worker.fetch(request('/api/cloud/records','GET',second),env)).json()).records,{});
 const encrypted=sqlite.prepare('SELECT packet FROM cloud_records').get().packet;assert.ok(!encrypted.includes('private-trade'));assert.deepEqual(await unseal(encrypted,key,'111|tt_journal_v1|1'),data.value);await assert.rejects(unseal(encrypted,key,'222|tt_journal_v1|1'));
 assert.deepEqual(await unseal(await seal({check:true},key,'aad'),key,'aad'),{check:true});sqlite.close();
});
