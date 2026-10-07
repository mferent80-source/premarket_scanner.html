import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import {KEYS,mergeRecord,validateValue} from '../lib/cloud-sync-model.mjs';
const {create:planStore}=createRequire(import.meta.url)('../lib/trade-plan-store.js');
const source=readFileSync(new URL('../app/cloud-sync.js',import.meta.url),'utf8').replace(/^import .*;\n/,'');
async function setup({local={},remote={},baseline={},vault=null,cloudOwner=null,failOwnerMirror=false,broker=null,failVaultSave=false,enabled=true,autoActivate=false,status={enabled:true,protocol:'tt-cloud-sync-v1',clientId:'test.apps.googleusercontent.com',checks:{database:true,google:true,encryption:true,schema:true}},statusHttp=200,sessionHttp=200,savedSession=true,authResult={error:'challenge_expired'},authHttp=401,endpoint='https://premarket-scanner-html.mferent80.workers.dev',onPut,onRecords,planBackup,missingPlanModule=false}={}){
 const storage=new Map(Object.entries(local)),privateStore=new Map([['session',savedSession?{token:'token',subject:'123',email:'me@example.test'}:null],['baseline:123',baseline],['owner',cloudOwner]]),calls=[];let currentVault=vault;const records=structuredClone(remote),window={addEventListener(){},dispatchEvent(){},T212Vault:{read:async()=>currentVault,save:async v=>{if(failVaultSave)throw Error('Vault unavailable');currentVault=v;},clear:async()=>{currentVault=null;}},TTCloudStore:{get:async k=>structuredClone(privateStore.get(k)||null),put:async(k,v)=>{privateStore.set(k,structuredClone(v));},remove:async k=>{privateStore.delete(k);}}};
 const c={KEYS,mergeRecord,validateValue,window,localStorage:{getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>{if(failOwnerMirror&&k==='tt_cloud_owner')throw Error('QuotaExceededError');storage.set(k,String(v));},removeItem:k=>storage.delete(k)},document:{hidden:false,addEventListener(){},querySelectorAll:()=>[],getElementById:id=>id==='brokerFrame'?broker:null},navigator:{onLine:true},location:{origin:'https://mferent80-source.github.io',href:'https://mferent80-source.github.io/app/'},URL,Date,AbortController,CustomEvent:class{},StorageEvent:class{},setTimeout,clearTimeout,setInterval:()=>{},fetch:async(url,opts)=>{calls.push({url,opts});let data,http=200;if(url==='cloud-sync-config.json')data={enabled,autoActivate,endpoint};else if(url.endsWith('/status')){data=typeof status==='function'?status():status;http=statusHttp;}else if(url.endsWith('/session')){data=sessionHttp===200?{subject:'123'}:{error:'session_expired'};http=sessionHttp;}else if(url.endsWith('/auth')){data=typeof authResult==='function'?authResult():authResult;http=typeof authHttp==='function'?authHttp():authHttp;}else if(url.endsWith('/records')){if(onRecords)await onRecords(records);data={records:structuredClone(records)};}else if(url.endsWith('/record')){const b=JSON.parse(opts.body);if(onPut)onPut(storage,b);assert.equal(b.revision,records[b.key]?.revision||0);records[b.key]={revision:b.revision+1,value:b.value,updated:10};data={revision:b.revision+1,updated:10};}else throw Error(url);return {ok:http===200,status:http,json:async()=>data};}};
 let planLedger;if(!missingPlanModule){planLedger=planStore(c.localStorage,{durable:planBackup||null,notify:false});window.TTPlanStore={create:()=>planLedger};}vm.createContext(c);vm.runInContext(source,c);for(let i=0;i<15;i++)await new Promise(r=>setImmediate(r));return {api:window.TTCloud,storage,privateStore,records,calls,planLedger,context:c,vault:()=>currentVault};
}
test('first phone receives cloud data without pushing empty replacement',async()=>{const s=await setup({remote:{tt_journal_v1:{revision:3,updated:9,value:[{id:'trade'}]}}});assert.equal(JSON.parse(s.storage.get('tt_journal_v1'))[0].id,'trade');assert.equal(s.calls.filter(c=>c.opts?.method==='PUT').length,0);assert.equal(s.api.state().connected,true);});
test('offline mode config disabled does not transmit saved credentials',async()=>{const s=await setup({enabled:false,vault:{key:'key',secret:'secret',environment:'live'}});assert.equal(s.calls.length,1);assert.equal(s.api.state().ready,false);assert.equal(s.api.state().error,'cloud_not_configured');});
test('remote tombstone cannot be republished by an old local credential',async()=>{const s=await setup({vault:{key:'key',secret:'secret',environment:'live'},remote:{cloud_credentials:{revision:2,value:null,updated:9}}});assert.equal(s.calls.filter(c=>c.opts?.method==='PUT').length,0);assert.equal(s.records.cloud_credentials.value,null);});
test('edit made during network write is kept locally for next sync',async()=>{let fired=false;const s=await setup({local:{tt_journal_v1:JSON.stringify([{id:'a'}])},onPut:(storage,b)=>{if(b.key==='tt_journal_v1'&&!fired){fired=true;storage.set('tt_journal_v1',JSON.stringify([{id:'a'},{id:'b'}]));}}});assert.equal(JSON.parse(s.storage.get('tt_journal_v1')).length,2);await s.api.sync();assert.equal(s.records.tt_journal_v1.value.length,2);});
test('same trade conflict is held without any PUT or local overwrite',async()=>{const old=[{id:'a',note:'old'}],local=[{id:'a',note:'PC'}],remote=[{id:'a',note:'phone'}];const s=await setup({local:{tt_journal_v1:JSON.stringify(local)},remote:{tt_journal_v1:{revision:2,value:remote,updated:9}},baseline:{tt_journal_v1:{revision:1,value:old}}});assert.ok(s.api.state().conflicts.includes('tt_journal_v1'));assert.equal(s.calls.filter(c=>c.opts?.method==='PUT').length,0);assert.equal(JSON.parse(s.storage.get('tt_journal_v1'))[0].note,'PC');});
test('different Google owner cannot upload this devices local journal',async()=>{const s=await setup({local:{tt_cloud_owner:'different',tt_journal_v1:'[{"id":"private"}]'}});assert.equal(s.api.state().error,'account_mismatch');assert.equal(s.calls.filter(c=>c.url.endsWith('/records')).length,0);});
test('logout cannot change the identity during an in-flight reconciliation',async()=>{let count=0,release;const s=await setup({onRecords:async()=>{if(++count===2)await new Promise(r=>{release=r;});}});const pending=s.api.sync();await new Promise(r=>setImmediate(r));await assert.rejects(s.api.logout(),/Sincronizare în curs/);assert.equal(s.api.state().connected,true);release();await pending;await s.api.logout();assert.equal(s.api.state().connected,false);});
test('explicit cloud conflict choice applies cloud version and retains recovery copy',async()=>{const s=await setup({local:{tt_journal_v1:'[{"id":"a","note":"PC"}]'},remote:{tt_journal_v1:{revision:2,updated:9,value:[{id:'a',note:'phone'}]}},baseline:{tt_journal_v1:{revision:1,value:[{id:'a',note:'old'}]}}});await s.api.resolve('tt_journal_v1','remote');assert.equal(JSON.parse(s.storage.get('tt_journal_v1'))[0].note,'phone');assert.equal(s.api.state().conflicts.length,0);assert.ok(s.privateStore.get('backups:123').length);});

function planBackup(legacy,plans){let saved={raw:JSON.stringify(plans),localRaw:JSON.stringify(legacy),revision:1},tail=Promise.resolve();return {get saved(){return saved;},read:async()=>structuredClone(saved),update(fn){const p=tail.then(()=>{const next=fn(structuredClone(saved));saved=structuredClone(next.record);return next.value;});tail=p.catch(()=>{});return p;}};}
test('cloud uploads recovered plans instead of the older legacy copy',async()=>{
 const old=[{id:'old'}],full=[{id:'new'},...old],backup=planBackup(old,full),s=await setup({local:{tt_trade_plans_v1:JSON.stringify(old)},planBackup:backup});
 assert.deepEqual(s.records.tt_trade_plans_v1.value,full);assert.equal(s.storage.get('tt_trade_plans_v1'),JSON.stringify(old));assert.deepEqual((await s.planLedger.read()).plans,full);
});
test('cloud merges disjoint plans into the transactional register and recovery snapshot',async()=>{
 const old=[{id:'old'}],local=[{id:'new'},...old],remote=[{id:'phone'},...old],backup=planBackup(old,local),s=await setup({local:{tt_trade_plans_v1:JSON.stringify(old)},planBackup:backup,remote:{tt_trade_plans_v1:{revision:2,value:remote}},baseline:{tt_trade_plans_v1:{revision:1,value:old}}});
 assert.deepEqual(new Set((await s.planLedger.read()).plans.map(p=>p.id)),new Set(['old','new','phone']));assert.equal(s.storage.get('tt_trade_plans_v1'),JSON.stringify(old));assert.deepEqual(s.privateStore.get('backups:123')[0].snapshot.tt_trade_plans_v1,local);
});
test('a cloud conflict on a recovered plan leaves both copies intact until explicit choice',async()=>{
 const old=[{id:'a',note:'base'}],local=[{id:'a',note:'backup'}],remote=[{id:'a',note:'phone'}],backup=planBackup(old,local),s=await setup({local:{tt_trade_plans_v1:JSON.stringify(old)},planBackup:backup,remote:{tt_trade_plans_v1:{revision:2,value:remote}},baseline:{tt_trade_plans_v1:{revision:1,value:old}}});
 assert.ok(s.api.state().conflicts.includes('tt_trade_plans_v1'));assert.equal(s.calls.filter(c=>c.opts?.method==='PUT').length,0);assert.deepEqual((await s.planLedger.read()).plans,local);
 await s.api.resolve('tt_trade_plans_v1','remote');assert.deepEqual((await s.planLedger.read()).plans,remote);assert.deepEqual(s.privateStore.get('backups:123')[0].snapshot.tt_trade_plans_v1,local);
});
test('unreadable plan backup stops synchronization without uploading stale local history',async()=>{
 const backup={read:async()=>{throw Error('Plan backup unavailable');},update:async()=>{throw Error('Plan backup unavailable');}},s=await setup({local:{tt_trade_plans_v1:'[{"id":"old"}]'},planBackup:backup});
 assert.equal(s.api.state().error,'Plan backup unavailable');assert.equal(s.calls.filter(c=>c.opts?.method==='PUT').length,0);assert.equal(s.records.tt_trade_plans_v1,undefined);
});
test('an unloaded plan module cannot make cloud synchronization publish the old local copy',async()=>{
 const s=await setup({local:{tt_trade_plans_v1:'[{"id":"old"}]'},missingPlanModule:true});assert.match(s.api.state().error,/Modulul planurilor nu s-a încărcat/);assert.equal(s.calls.filter(c=>c.opts?.method==='PUT').length,0);assert.equal(s.records.tt_trade_plans_v1,undefined);
});
test('automatic availability check cannot transmit any private record to an unpublished Worker',async()=>{
 const s=await setup({enabled:false,autoActivate:true,statusHttp:404,status:{error:'not_found'},local:{tt_journal_v1:'[{"id":"private"}]'},vault:{environment:'live',key:'private-key',secret:'private-secret'}});
 assert.equal(s.api.state().ready,false);assert.equal(s.api.state().error,'cloud_worker_missing');assert.equal(s.calls.length,2);
 const probe=s.calls[1];assert.equal(probe.opts.method,'GET');assert.equal(probe.opts.credentials,'omit');assert.equal(probe.opts.headers.Authorization,undefined);assert.equal(probe.opts.body,undefined);
 assert.equal(s.privateStore.get('baseline:123')&&Object.keys(s.privateStore.get('baseline:123')).length,0);assert.equal(s.privateStore.get('backups:123'),undefined);
});
test('incomplete provisioning blocks session restoration and broker credential upload',async()=>{
 const checks={database:true,google:true,encryption:true,schema:false},s=await setup({enabled:false,autoActivate:true,status:{enabled:false,protocol:'tt-cloud-sync-v1',clientId:null,checks},vault:{environment:'live',key:'key',secret:'secret'}});
 assert.equal(s.api.state().ready,false);assert.deepEqual(JSON.parse(JSON.stringify(s.api.state().setup)),checks);assert.equal(s.calls.length,2);assert.equal(s.api.state().connected,false);
});
test('completed provisioning activates a waiting app after recheck without a new frontend release',async()=>{
 let configured=false;const s=await setup({enabled:false,autoActivate:true,status:()=>({enabled:configured,protocol:'tt-cloud-sync-v1',clientId:configured?'test.apps.googleusercontent.com':null,checks:{database:configured,google:configured,encryption:configured,schema:configured}}),remote:{tt_journal_v1:{revision:1,value:[{id:'phone'}]}}});
 assert.equal(s.calls.length,2);assert.equal(s.storage.get('tt_journal_v1'),undefined);configured=true;await s.api.recheck();
 assert.equal(s.api.state().ready,true);assert.equal(s.api.state().connected,true);assert.equal(JSON.parse(s.storage.get('tt_journal_v1'))[0].id,'phone');assert.ok(s.api.state().lastSync);
 const probes=s.calls.filter(c=>c.url.endsWith('/status'));assert.equal(probes.length,2);assert.ok(probes.every(c=>!c.opts.headers.Authorization&&!c.opts.body));
 await s.api.recheck();assert.equal(s.calls.filter(c=>c.url.endsWith('/status')).at(-1).opts.headers.Authorization,undefined);
});
test('a different protocol or a truthy readiness value cannot enable private synchronization',async()=>{
 for(const status of [{enabled:true,protocol:'different',clientId:'test.apps.googleusercontent.com',checks:{database:true,google:true,encryption:true,schema:true}},{enabled:'true',protocol:'tt-cloud-sync-v1',clientId:'test.apps.googleusercontent.com',checks:{database:true,google:true,encryption:true,schema:true}},{enabled:true,protocol:'tt-cloud-sync-v1',clientId:'not-a-google-client',checks:{database:true,google:true,encryption:true,schema:true}}]){
  const s=await setup({autoActivate:true,status});assert.equal(s.api.state().ready,false);assert.equal(s.calls.length,2);
 }
});
test('expired stored session leaves a verified service available for Google reconnection',async()=>{
 const s=await setup({sessionHttp:401});assert.equal(s.api.state().ready,true);assert.equal(s.api.state().connected,false);assert.equal(s.api.state().error,'session_expired');assert.equal(s.privateStore.get('session'),undefined);assert.ok(!s.calls.some(c=>c.url.endsWith('/records')));
});
test('availability check rejects endpoint userinfo before any outgoing cloud request',async()=>{
 const s=await setup({endpoint:'https://injected@premarket-scanner-html.mferent80.workers.dev'});assert.equal(s.api.state().ready,false);assert.equal(s.calls.length,1);
});
test('a full legacy browser store cannot prevent durable account binding or a confirmed sync',async()=>{
 const s=await setup({failOwnerMirror:true,local:{tt_journal_v1:'[{"id":"PC"}]'}});
 assert.equal(s.api.state().error,'');assert.ok(s.api.state().lastSync);assert.equal(s.privateStore.get('owner'),'123');assert.equal(s.storage.get('tt_cloud_owner'),undefined);assert.equal(s.records.tt_journal_v1.value[0].id,'PC');
 await s.api.sync();assert.equal(s.api.state().error,'');assert.equal(s.privateStore.get('owner'),'123');
});
test('durable ownership blocks another account even when no localStorage mirror could be written',async()=>{
 const s=await setup({cloudOwner:'different',local:{tt_journal_v1:'[{"id":"private"}]'}});
 assert.equal(s.api.state().error,'account_mismatch');assert.equal(s.privateStore.get('owner'),'different');assert.ok(!s.calls.some(c=>c.url.endsWith('/records')||c.opts?.method==='PUT'));
});
test('disagreement between legacy and durable owners stops synchronization before record retrieval',async()=>{
 const s=await setup({cloudOwner:'123',local:{tt_cloud_owner:'different'}});assert.equal(s.api.state().error,'account_mismatch');assert.ok(!s.calls.some(c=>c.url.endsWith('/records')));
});
test('older deployed Worker keeps Europa data local while the existing journal still syncs',async()=>{
 const s=await setup({local:{tt_europe_signals_v1:JSON.stringify({schema:1,entries:[]}),tt_europe_risk_settings_v1:'{"currency":"RON"}',tt_journal_v1:'[{"id":"existing"}]'}});
 assert.equal(s.api.state().error,'');assert.ok(!s.api.state().supportedKeys.includes('tt_europe_signals_v1'));assert.equal(s.records.tt_europe_signals_v1,undefined);assert.equal(s.records.tt_journal_v1.value[0].id,'existing');
});
test('a cloud import holds the history lock and preserves a concurrent Europa observation',async()=>{
 const key='tt_europe_signals_v1',s=await setup({status:{enabled:true,protocol:'tt-cloud-sync-v1',clientId:'test.apps.googleusercontent.com',checks:{database:true,google:true,encryption:true,schema:true},supportedKeys:KEYS}});
 s.records[key]={revision:1,value:{schema:1,entries:[]}};
 const observation={id:'DE0007164600:2026-10-01:earlyLong',symbol:'SAP.DE',isin:'DE0007164600',name:'SAP',market:'DE',sector:'Tech',currency:'EUR',category:'earlyLong',currentCategory:'earlyLong',firstDate:'2026-10-01',lastDate:'2026-10-01',firstPrice:100,lastPrice:100,firstStop:90,support:92,createdAt:1790866800000,policy:1,active:true,status:'ACTIVE',transitions:[{date:'2026-10-01',category:'earlyLong'}],outcomes:{}};
 const concurrent={schema:1,entries:[observation]},locks=[];
 s.context.navigator.locks={request:async(name,options,callback)=>{
  if(name==='tt-cloud-sync')return callback({});
  locks.push(name);s.storage.set(key,JSON.stringify(concurrent));return options();
 }};
 await s.api.sync();assert.deepEqual(locks,[key]);assert.deepEqual(JSON.parse(s.storage.get(key)),concurrent);assert.equal(s.records[key].value.entries.length,0);
 await s.api.sync();assert.deepEqual(s.records[key].value,concurrent);
});

test('failed Google login stays visible after busy finishes, then a successful retry clears it',async()=>{
 let accepted=false;const s=await setup({savedSession:false,authResult:()=>accepted?{token:'new-session',subject:'123',email:'me@example.test'}:{error:'challenge_expired'},authHttp:()=>accepted?200:401});
 await assert.rejects(s.api.login('test-credential','test-nonce'),/challenge_expired/);
 assert.equal(s.api.state().error,'challenge_expired');assert.equal(s.api.state().busy,false);assert.equal(s.api.state().connected,false);assert.equal(s.privateStore.get('session'),null);
 assert.ok(!s.calls.some(c=>c.url.endsWith('/records')));
 accepted=true;await s.api.login('test-credential','new-nonce');
 assert.equal(s.api.state().error,'');assert.equal(s.api.state().connected,true);assert.ok(s.api.state().lastSync);
});

const connection={environment:'live',key:'fixture-key',secret:'fixture-secret'};
test('publishing credentials confirms a server readback and exposes only safe connection metadata',async()=>{
 const s=await setup({vault:connection});await s.api.publishCredentials();
 const state=s.api.state();assert.equal(state.trading212.local,true);assert.equal(state.trading212.cloud,true);assert.equal(state.trading212.synced,true);assert.ok(state.trading212.checkedAt);
 assert.deepEqual(s.records.cloud_credentials.value,connection);assert.ok(s.calls.filter(c=>c.url.endsWith('/records')).length>=3);
 const publicState=JSON.stringify(state);assert.ok(!publicState.includes(connection.key));assert.ok(!publicState.includes(connection.secret));assert.match(state.trading212.message,/salvată.*verificată/i);
});
test('explicit retrieval restores a previously forgotten local connection and restarts the broker without a cloud write',async()=>{
 const record={revision:2,value:connection,updated:9},broker={src:'existing'},s=await setup({remote:{cloud_credentials:record},baseline:{cloud_credentials:record},broker});
 assert.equal(s.vault(),null);assert.equal(broker.src,'existing');assert.equal(s.api.state().trading212.synced,false);
 await s.api.restoreCredentials();assert.deepEqual(s.vault(),connection);assert.match(broker.src,/cloud=/);assert.equal(s.calls.filter(c=>c.opts?.method==='PUT').length,0);assert.equal(s.api.state().trading212.synced,true);assert.match(s.api.state().trading212.message,/preluată/i);
});
test('retrieval cannot resurrect a deleted cloud connection or claim success after failed vault storage',async()=>{
 const deleted=await setup({remote:{cloud_credentials:{revision:2,value:null}},vault:connection});
 await assert.rejects(deleted.api.restoreCredentials(),/cloud_credentials_missing/);assert.deepEqual(deleted.vault(),connection);
 const failed=await setup({remote:{cloud_credentials:{revision:2,value:connection}},failVaultSave:true});
 await assert.rejects(failed.api.restoreCredentials(),/Vault unavailable/);assert.equal(failed.vault(),null);assert.equal(failed.api.state().trading212.synced,false);assert.equal(failed.api.state().trading212.message,'');
});
test('publishing cannot claim a confirmed save when credentials change before server verification',async()=>{
 let reads=0;const s=await setup({vault:connection,onRecords:records=>{if(++reads===3)records.cloud_credentials={revision:9,value:null};}});
 await assert.rejects(s.api.publishCredentials(),/cloud_credentials_changed/);assert.equal(s.api.state().trading212.synced,false);assert.equal(s.api.state().trading212.message,'');
});
test('explicit broker credential actions respect the durable Google owner before any record request',async()=>{
 const s=await setup({cloudOwner:'different',vault:connection});
 await assert.rejects(s.api.publishCredentials(),/account_mismatch/);await assert.rejects(s.api.restoreCredentials(),/account_mismatch/);
 assert.ok(!s.calls.some(c=>c.url.endsWith('/records')||c.opts?.method==='PUT'));assert.deepEqual(s.vault(),connection);
});
