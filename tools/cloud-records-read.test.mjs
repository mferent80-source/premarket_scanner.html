import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleCloud,readiness,seal,unseal} from './cloud-sync-worker.mjs';
import {validateValue} from '../lib/cloud-sync-model.mjs';

const ORIGIN='https://mferent80-source.github.io';
const SUBJECT='111',OTHER_SUBJECT='222';
const TOKEN=Buffer.alloc(32,1).toString('base64url');
const SECRET=Buffer.alloc(32,42).toString('base64url');

function setup(t){
 const sqlite=new DatabaseSync(':memory:');
 t.after(()=>sqlite.close());
 sqlite.exec(readFileSync(new URL('./cloud-sync-schema.sql',import.meta.url),'utf8'));
 sqlite.prepare('INSERT INTO cloud_sessions VALUES(?,?,?,?)').run(createHash('sha256').update(TOKEN).digest('base64url'),SUBJECT,'fixture@example.test',Math.floor(Date.now()/1000)+3600);
 const queries=[];
 const db={prepare(sql){
  const statement=sqlite.prepare(sql);
  function bind(...args){
   function run(method){queries.push({sql,args,method});return statement[method](...args);}
   return {
    first:async()=>run('get')||null,
    all:async()=>({results:run('all')}),
    run:async()=>({meta:{changes:Number(run('run').changes)}})
   };
  }
  return {...bind(),bind};
 }};
 const env={CLOUD_DB:db,GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',CLOUD_ENCRYPTION_KEY:SECRET};
 function raw(key,packet,{subject=SUBJECT,revision=1,updated=100}={}){
  sqlite.prepare('INSERT INTO cloud_records VALUES(?,?,?,?,?)').run(subject,key,revision,packet,updated);
 }
 async function record(key,value,options={}){
  const subject=options.subject||SUBJECT,revision=options.revision||1;
  raw(key,await seal(value,SECRET,subject+'|'+key+'|'+revision),options);
 }
 const request=(query='',{token=TOKEN,origin=ORIGIN}={})=>new Request('https://worker/api/cloud/records'+query,{headers:{Origin:origin,...(token?{Authorization:'Bearer '+token}:{})}});
 const get=(query='',options)=>handleCloud(request(query,options),env);
 const recordQueries=()=>queries.filter(q=>/\bFROM\s+cloud_records\b/i.test(q.sql));
 return {sqlite,env,db,queries,raw,record,get,recordQueries};
}

function cors(response){
 assert.equal(response.headers.get('Access-Control-Allow-Origin'),ORIGIN);
 assert.equal(response.headers.get('Vary'),'Origin');
 assert.equal(response.headers.get('Cache-Control'),'private, no-store');
}

test('readiness advertises the bounded records protocol',async t=>{
 const s=setup(t),status=await readiness(s.env);
 assert.equal(status.enabled,true);
 assert.deepEqual(status.records,{protocol:'tt-cloud-records-v2',maxKeys:1});
});

test('record index reads metadata without loading or decrypting packets',async t=>{
 const s=setup(t);
 s.raw('tt_journal_v1','malformed encrypted packet',{revision:4,updated:123});
 s.raw('tt_theme','another malformed packet',{revision:2,updated:124});
 s.raw('__audit_receipts_v1','private packet');
 s.raw('tt_pf_account','other account packet',{subject:OTHER_SUBJECT});
 const decrypt=t.mock.method(crypto.subtle,'decrypt',()=>{throw Error('metadata must not decrypt');});
 const response=await s.get('?index=1');
 assert.equal(response.status,200);cors(response);
 assert.deepEqual(await response.json(),{protocol:'tt-cloud-records-v2',records:{tt_journal_v1:{revision:4,updated:123},tt_theme:{revision:2,updated:124}}});
 assert.equal(decrypt.mock.callCount(),0);
 const queries=s.recordQueries();assert.equal(queries.length,1);
 const projection=/^\s*SELECT\s+(.+?)\s+FROM\b/i.exec(queries[0].sql)?.[1];
 assert.ok(projection,'index must use a SELECT projection');
 assert.doesNotMatch(projection,/\bpacket\b|\*/i,'index must not materialize encrypted payloads');
 assert.deepEqual(queries[0].args,[SUBJECT]);
});

test('a selected record is isolated from other keys, private rows and Google accounts',async t=>{
 const s=setup(t),value=[{id:'own-trade',note:'local fixture'}];
 await s.record('tt_journal_v1',value,{revision:3,updated:456});
 await s.record('tt_journal_v1',[{id:'foreign-trade'}],{subject:OTHER_SUBJECT});
 s.raw('tt_trade_plans_v1','malformed unrelated packet');
 s.raw('__audit_receipts_v1','malformed private packet');
 const response=await s.get('?key=tt_journal_v1');
 assert.equal(response.status,200);cors(response);
 assert.deepEqual(await response.json(),{records:{tt_journal_v1:{revision:3,updated:456,value}}});
 const queries=s.recordQueries();assert.equal(queries.length,1);
 assert.match(queries[0].sql,/\bWHERE\s+subject\s*=\s*\?\s+AND\s+key\s*=\s*\?/i);
 assert.deepEqual(queries[0].args,[SUBJECT,'tt_journal_v1']);
});

test('a missing selected record returns an empty result without reading another key',async t=>{
 const s=setup(t);
 s.raw('tt_journal_v1','malformed unrelated packet');
 const response=await s.get('?key=tt_theme');
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{records:{}});
 assert.equal(s.recordQueries().length,1);
 assert.deepEqual(s.recordQueries()[0].args,[SUBJECT,'tt_theme']);
});

test('a corrupt selected packet returns a sanitized failure with CORS',async t=>{
 for(const corruption of ['malformed JSON','wrong encryption key']){
  await t.test(corruption,async t=>{
   const s=setup(t),key='tt_journal_v1';
   const packet=corruption==='malformed JSON'?'PRIVATE INVALID JSON':await seal([{id:'PRIVATE TRADE'}],Buffer.alloc(32,43).toString('base64url'),SUBJECT+'|'+key+'|1');
   s.raw(key,packet);
   const response=await s.get('?key='+key);
   assert.equal(response.status,503);cors(response);
   assert.deepEqual(await response.json(),{error:'cloud_unavailable'});
  });
 }
});

test('records queries reject unknown, repeated or mixed parameters',async t=>{
 const s=setup(t);
 for(const query of ['?unknown=1','?index=','?index=0','?index=2','?index=1&index=1','?index=1&unknown=1','?key=','?key=not_allowed','?key=__audit_receipts_v1','?key=tt_theme&key=tt_theme','?key=tt_theme&key=tt_journal_v1','?key=tt_theme&unknown=1','?index=1&key=tt_theme']){
  const response=await s.get(query);
  assert.equal(response.status,400,query);cors(response);
  assert.deepEqual(await response.json(),{error:'invalid_query'},query);
 }
 assert.equal(s.recordQueries().length,0,'invalid queries must not access record rows');
});

test('authentication is required before validating records queries',async t=>{
 const s=setup(t);
 for(const [token,error] of [['','session_required'],[Buffer.alloc(32,2).toString('base64url'),'session_expired']]){
  const response=await s.get('?unknown=1',{token});
  assert.equal(response.status,401);cors(response);
  assert.deepEqual(await response.json(),{error});
 }
 assert.equal(s.recordQueries().length,0);
});

test('foreign origins cannot reach query validation or the database',async t=>{
 const s=setup(t);
 const prepare=t.mock.method(s.db,'prepare',()=>{throw Error('foreign origin reached database');});
 const response=await s.get('?index=1&key=tt_theme',{origin:'https://foreign.example'});
 assert.equal(response.status,403);
 assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
 assert.deepEqual(await response.json(),{error:'origin_forbidden'});
 assert.equal(prepare.mock.callCount(),0);
});

test('queryless records reads preserve the legacy response for older clients',async t=>{
 const s=setup(t);
 await s.record('tt_journal_v1',[{id:'legacy-trade'}],{revision:2,updated:123});
 await s.record('tt_theme','dark',{updated:124});
 s.raw('__audit_receipts_v1','malformed private packet');
 const response=await s.get();
 assert.equal(response.status,200);cors(response);
 assert.deepEqual(await response.json(),{records:{tt_journal_v1:{revision:2,updated:123,value:[{id:'legacy-trade'}]},tt_theme:{revision:1,updated:124,value:'dark'}}});
});

test('a valid near-limit journal survives encrypted storage and a selected read',async t=>{
 const s=setup(t),key='tt_journal_v1',value=[{id:1,text:'x'.repeat(999970)}];
 validateValue(key,value);
 assert.equal(Buffer.byteLength(JSON.stringify(value)),999990);
 const response=await handleCloud(new Request('https://worker/api/cloud/record',{method:'PUT',headers:{Origin:ORIGIN,Authorization:'Bearer '+TOKEN,'Content-Type':'application/json'},body:JSON.stringify({key,value,revision:0})}),s.env);
 assert.equal(response.status,200);
 const packet=s.sqlite.prepare('SELECT packet FROM cloud_records WHERE subject=? AND key=?').get(SUBJECT,key).packet;
 assert.deepEqual(await unseal(packet,SECRET,SUBJECT+'|'+key+'|1'),value);
 const selected=await s.get('?key='+key);
 assert.equal(selected.status,200);cors(selected);
 const result=await selected.json();
 assert.deepEqual(result.records[key].value,value);
 assert.equal(result.records[key].revision,1);
});
