import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import {KEYS,mergeRecord,validateValue,EvidenceCloud,ForecastCloud} from '../lib/cloud-sync-model.mjs';
const {create:planStore}=createRequire(import.meta.url)('../lib/trade-plan-store.js');
const source=readFileSync(new URL('../app/cloud-sync.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/,'');
const boundedStatus={enabled:true,protocol:'tt-cloud-sync-v1',clientId:'test.apps.googleusercontent.com',checks:{database:true,google:true,encryption:true,schema:true},supportedKeys:KEYS,records:{protocol:'tt-cloud-records-v2',maxKeys:1}};
async function setup({local={},remote={},baseline={},vault=null,cloudOwner=null,failOwnerMirror=false,broker=null,failVaultSave=false,enabled=true,autoActivate=false,status={enabled:true,protocol:'tt-cloud-sync-v1',clientId:'test.apps.googleusercontent.com',checks:{database:true,google:true,encryption:true,schema:true}},statusHttp=200,sessionHttp=200,savedSession=true,authResult={error:'challenge_expired'},authHttp=401,endpoint='https://premarket-scanner-html.mferent80.workers.dev',onPut,onRecords,onIndex,onKey,planBackup,missingPlanModule=false,fillsBackup,failFillsMirror=false,missingFillsModule=false,failStorageKey=null}={}){
 const storage=new Map(Object.entries(local)),privateStore=new Map([['session',savedSession?{token:'token',subject:'123',email:'me@example.test'}:null],['baseline:123',baseline],['owner',cloudOwner]]),calls=[];let currentVault=vault;const records=structuredClone(remote),window={addEventListener(){},dispatchEvent(){},T212Vault:{read:async()=>currentVault,save:async v=>{if(failVaultSave)throw Error('Vault unavailable');currentVault=v;},clear:async()=>{currentVault=null;}},TTCloudStore:{get:async k=>structuredClone(privateStore.get(k)||null),put:async(k,v)=>{privateStore.set(k,structuredClone(v));},remove:async k=>{privateStore.delete(k);}}};
 const c={KEYS,mergeRecord,validateValue,EvidenceCloud,ForecastCloud,window,localStorage:{getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>{if(failOwnerMirror&&k==='tt_cloud_owner')throw Error('QuotaExceededError');if(failFillsMirror&&k==='tt_trading212_fills_v1'||k===failStorageKey)throw Object.assign(Error('Storage quota exceeded'),{name:'QuotaExceededError'});storage.set(k,String(v));},removeItem:k=>storage.delete(k),key:i=>[...storage.keys()][i]??null,get length(){return storage.size;}},document:{hidden:false,addEventListener(){},querySelectorAll:()=>[],getElementById:id=>id==='brokerFrame'?broker:null},navigator:{onLine:true},location:{origin:'https://mferent80-source.github.io',href:'https://mferent80-source.github.io/app/'},URL,URLSearchParams,Date,AbortController,CustomEvent:class{},StorageEvent:class{},setTimeout,clearTimeout,setInterval:()=>{},fetch:async(url,opts)=>{calls.push({url,opts});let data,http=200;if(url==='cloud-sync-config.json')data={enabled,autoActivate,endpoint};else if(url.endsWith('/status')){data=typeof status==='function'?status():status;http=statusHttp;}else if(url.endsWith('/session')){data=sessionHttp===200?{subject:'123'}:{error:'session_expired'};http=sessionHttp;}else if(url.endsWith('/auth')){data=typeof authResult==='function'?authResult():authResult;http=typeof authHttp==='function'?authHttp():authHttp;}else if(url.endsWith('/records?index=1')){const override=onIndex?await onIndex(records):undefined;data=override===undefined?{protocol:'tt-cloud-records-v2',records:Object.fromEntries(Object.entries(records).map(([k,r])=>[k,{revision:r.revision,updated:r.updated}]))}:override;}else if(url.includes('/records?key=')){const key=new URL(url).searchParams.get('key'),override=onKey?await onKey(records,key):undefined;data=override===undefined?{records:records[key]?{[key]:structuredClone(records[key])}:{}}:override;}else if(url.endsWith('/records')){if(onRecords)await onRecords(records);data={records:structuredClone(records)};}else if(url.endsWith('/record')){const b=JSON.parse(opts.body);if(onPut)await onPut(storage,b,c);assert.equal(b.revision,records[b.key]?.revision||0);records[b.key]={revision:b.revision+1,value:b.value,updated:10};data={revision:b.revision+1,updated:10};}else throw Error(url);if(data&&data.__http){http=data.__http;delete data.__http;}return {ok:http===200,status:http,json:async()=>data};}};
 let planLedger;if(!missingPlanModule){planLedger=planStore(c.localStorage,{durable:planBackup||null,notify:false});window.TTPlanStore={create:()=>planLedger};}
 window.localStorage=c.localStorage;window.navigator=c.navigator;vm.createContext(c);
 for(const file of ['../lib/storage-write.js','../app/failure-info.js','../lib/trading212-fills-store.js'])vm.runInContext(readFileSync(new URL(file,import.meta.url),'utf8'),c);
 let fillsLedger;if(missingFillsModule)delete window.T212FillsStore;else{fillsLedger=window.T212FillsStore.create(c.localStorage,{durable:fillsBackup||null,notify:false});await fillsLedger.ready().catch(()=>{});window.T212FillsStore={...window.T212FillsStore,...fillsLedger};}
 vm.runInContext(source,c);for(let i=0;i<15;i++)await new Promise(r=>setImmediate(r));return {api:window.TTCloud,storage,privateStore,records,calls,planLedger,fillsLedger,context:c,vault:()=>currentVault};
}
test('first phone receives cloud data without pushing empty replacement',async()=>{const s=await setup({remote:{tt_journal_v1:{revision:3,updated:9,value:[{id:'trade'}]}}});assert.equal(JSON.parse(s.storage.get('tt_journal_v1'))[0].id,'trade');assert.equal(s.calls.filter(c=>c.opts?.method==='PUT').length,0);assert.equal(s.api.state().connected,true);});
test('bounded cloud reads fetch changed records only and never request the aggregate payload',async()=>{
 const key='tt_journal_v1',s=await setup({status:boundedStatus,remote:{[key]:{revision:2,updated:9,value:[{id:'a'}]},wl_stocks:{revision:1,updated:8,value:['AAPL']}}});
 const reads=()=>s.calls.filter(c=>c.url.includes('/records?key='));assert.equal(reads().length,2);assert.equal(s.api.state().error,'');assert.equal(s.api.state().lastSync>0,true);assert.equal(s.calls.some(c=>c.url.endsWith('/records')),false);
 await s.api.sync();assert.equal(reads().length,2);
 s.records[key]={revision:3,updated:10,value:[{id:'a'},{id:'phone'}]};await s.api.sync();assert.equal(reads().length,3);assert.equal(JSON.parse(s.storage.get(key)).length,2);assert.deepEqual(JSON.parse(s.storage.get('wl_stocks')),['AAPL']);
});
test('a failed bounded record read cannot apply a partial cloud snapshot, and retry reuses completed reads',async()=>{
 const key='tt_journal_v1',before=JSON.stringify([{id:'a',notes:'base'}]);let fail=true;
 const s=await setup({status:boundedStatus,local:{[key]:before},baseline:{[key]:{revision:1,value:JSON.parse(before)}},remote:{[key]:{revision:2,updated:9,value:[{id:'a',notes:'phone'}]},wl_stocks:{revision:1,updated:8,value:['AAPL']}},onKey:(_,key)=>{if(key==='wl_stocks'&&fail)throw Error('network fixture');}});
 assert.equal(s.storage.get(key),before);assert.equal(s.api.state().lastSync,null);assert.equal(s.calls.some(c=>c.opts.method==='PUT'),false);
 fail=false;await s.api.sync();assert.equal(s.api.state().error,'');assert.equal(JSON.parse(s.storage.get(key))[0].notes,'phone');assert.equal(s.calls.filter(c=>c.url.endsWith('key=tt_journal_v1')).length,1);
});
test('invalid cloud index or incomplete record never becomes an empty cloud replacement',async()=>{
 for(const overrides of [{onIndex:()=>({protocol:'tt-cloud-records-v2',records:null})},{onIndex:()=>({protocol:'tt-cloud-records-v2',records:{unknown:{revision:1,updated:1}}})},{onKey:()=>({records:{}})}]){
  const before='[{"id":"local"}]',s=await setup({status:boundedStatus,local:{tt_journal_v1:before},remote:{tt_journal_v1:{revision:1,updated:1,value:[]}},...overrides});
  assert.equal(s.api.state().error,'cloud_response_invalid');assert.equal(s.storage.get('tt_journal_v1'),before);assert.equal(s.calls.some(c=>c.opts.method==='PUT'),false);assert.equal(s.api.state().lastSync,null);
 }
});
test('a cloud revision changing during bounded reads is retried before any local application',async()=>{
 let race=true;const s=await setup({status:boundedStatus,remote:{tt_journal_v1:{revision:1,updated:1,value:[{id:'first'}]}},onKey:records=>{if(race){race=false;records.tt_journal_v1={revision:2,updated:2,value:[{id:'latest'}]};}}});
 assert.equal(s.storage.has('tt_journal_v1'),false);assert.equal(s.api.state().lastSync,null);assert.equal(s.calls.some(c=>c.opts.method==='PUT'),false);await s.api.sync();assert.equal(JSON.parse(s.storage.get('tt_journal_v1'))[0].id,'latest');assert.equal(s.api.state().error,'');
});
test('bounded read cache keeps exact cloud values separate from a rejected local merge baseline',async()=>{
 const key='tt_journal_v1',base=[{id:'a',notes:'base',tags:[]}],local=[{id:'a',notes:'PC',tags:[]}],remote=[{id:'a',notes:'base',tags:['phone']}],edited=[{id:'a',notes:'PC second edit',tags:[]}];let fired=false;
 const s=await setup({status:boundedStatus,local:{[key]:JSON.stringify(local)},remote:{[key]:{revision:2,updated:9,value:remote}},baseline:{[key]:{revision:1,value:base}},onPut:(storage,b)=>{if(b.key===key&&!fired){fired=true;storage.set(key,JSON.stringify(edited));}}});
 assert.deepEqual(JSON.parse(s.storage.get(key)),edited);assert.deepEqual(s.privateStore.get('baseline:123')[key].value,local);await s.api.sync();
 const combined=[{id:'a',notes:'PC second edit',tags:['phone']}];assert.deepEqual(JSON.parse(s.storage.get(key)),combined);assert.deepEqual(s.records[key].value,combined);assert.equal(s.api.state().error,'');assert.equal(s.api.state().conflicts.length,0);
});
test('bounded credential publishing verifies the updated cloud value through a new revision read',async()=>{
 const connection={key:'fixture-key',secret:'fixture-secret',environment:'live'},s=await setup({status:boundedStatus,vault:connection});await s.api.publishCredentials();
 assert.equal(s.api.state().trading212.synced,true);assert.ok(s.calls.some(c=>c.url.endsWith('key=cloud_credentials')));assert.equal(s.calls.some(c=>c.url.endsWith('/records')),false);
});
test('inactive legacy analyses and unsupported registers cannot block active cloud synchronization',async()=>{
 const unsupported=['tt_europe_signals_v1','tt_europe_risk_settings_v1','tt_trading212_account_history_v1','tt_trading212_cash_v1'],status={...boundedStatus,supportedKeys:KEYS.filter(k=>!unsupported.includes(k))};
 const remote={tt_journal_v1:{revision:1,updated:9,value:[{id:'current-trade'}]},[EvidenceCloud.KEY]:{revision:1,updated:8,value:'legacy packet fixture'}};
 for(const key of unsupported)remote[key]={revision:1,updated:8,value:'unsupported packet fixture'};
 const s=await setup({status,remote,onKey:(_,key)=>{if(key===EvidenceCloud.KEY||unsupported.includes(key))throw Error('inactive packet cannot be decoded');}});
 assert.equal(s.api.state().connected,true);assert.equal(s.api.state().error,'');assert.ok(s.api.state().lastSync);assert.equal(JSON.parse(s.storage.get('tt_journal_v1'))[0].id,'current-trade');
 assert.deepEqual(s.calls.filter(c=>c.url.includes('/records?key=')).map(c=>new URL(c.url).searchParams.get('key')),['tt_journal_v1']);assert.equal(s.calls.some(c=>c.opts.method==='PUT'),false);
 assert.equal(s.records[EvidenceCloud.KEY].value,'legacy packet fixture');for(const key of unsupported)assert.equal(s.records[key].value,'unsupported packet fixture');
});
test('offline mode config disabled does not transmit saved credentials',async()=>{const s=await setup({enabled:false,vault:{key:'key',secret:'secret',environment:'live'}});assert.equal(s.calls.length,1);assert.equal(s.api.state().ready,false);assert.equal(s.api.state().error,'cloud_not_configured');});
test('remote tombstone cannot be republished by an old local credential',async()=>{const s=await setup({vault:{key:'key',secret:'secret',environment:'live'},remote:{cloud_credentials:{revision:2,value:null,updated:9}}});assert.equal(s.calls.filter(c=>c.opts?.method==='PUT').length,0);assert.equal(s.records.cloud_credentials.value,null);});
test('edit made during network write is kept locally for next sync',async()=>{let fired=false;const s=await setup({local:{tt_journal_v1:JSON.stringify([{id:'a'}])},onPut:(storage,b)=>{if(b.key==='tt_journal_v1'&&!fired){fired=true;storage.set('tt_journal_v1',JSON.stringify([{id:'a'},{id:'b'}]));}}});assert.equal(JSON.parse(s.storage.get('tt_journal_v1')).length,2);await s.api.sync();assert.equal(s.records.tt_journal_v1.value.length,2);});
test('a rejected local merge preserves independent cloud edits on the next sync',async()=>{
 const key='tt_journal_v1',base=[{id:'a',notes:'base',tags:[]}],local=[{id:'a',notes:'PC',tags:[]}],remote=[{id:'a',notes:'base',tags:['phone']}],edited=[{id:'a',notes:'PC second edit',tags:[]}];let fired=false;
 const s=await setup({local:{[key]:JSON.stringify(local)},remote:{[key]:{revision:2,value:remote}},baseline:{[key]:{revision:1,value:base}},onPut:(storage,b)=>{if(b.key===key&&!fired){fired=true;storage.set(key,JSON.stringify(edited));}}});
 assert.deepEqual(JSON.parse(s.storage.get(key)),edited);assert.deepEqual(s.records[key].value,[{id:'a',notes:'PC',tags:['phone']}]);
 assert.deepEqual(s.privateStore.get('baseline:123')[key].value,local);
 const retry=await setup({local:{[key]:s.storage.get(key)},remote:s.records,baseline:s.privateStore.get('baseline:123')});
 const combined=[{id:'a',notes:'PC second edit',tags:['phone']}];assert.deepEqual(JSON.parse(retry.storage.get(key)),combined);assert.deepEqual(retry.records[key].value,combined);assert.equal(retry.api.state().conflicts.length,0);
 await s.api.sync();
 assert.deepEqual(JSON.parse(s.storage.get(key)),combined);assert.deepEqual(s.records[key].value,combined);assert.equal(s.api.state().conflicts.length,0);assert.equal(s.api.state().error,'');
});
test('overflowing cash valuation merges retain both originals and allow later keys to sync',async()=>{
 const key='tt_trading212_cash_v1',rows=Array.from({length:501},(_,i)=>({at:new Date(Date.UTC(2024,0,1)+i*86400000).toISOString(),before:100,after:110,currency:'EUR',flowIds:['flow-'+i],reference:'broker statement'})),base={scope:{environment:'live',flowValuations:rows.slice(0,499)}},local={scope:{environment:'live',flowValuations:rows.slice(0,500)}},remote={scope:{environment:'live',flowValuations:[...rows.slice(0,499),rows[500]]}};
 validateValue(key,local);validateValue(key,remote);
 const s=await setup({status:{enabled:true,protocol:'tt-cloud-sync-v1',clientId:'test.apps.googleusercontent.com',checks:{database:true,google:true,encryption:true,schema:true},supportedKeys:KEYS},local:{[key]:JSON.stringify(local),tt_theme:'dark'},remote:{[key]:{revision:2,value:remote}},baseline:{[key]:{revision:1,value:base}}});
 assert.deepEqual(JSON.parse(s.storage.get(key)),local);assert.deepEqual(s.records[key].value,remote);assert.deepEqual(s.privateStore.get('baseline:123')[key].value,base);
 assert.deepEqual(Array.from(s.api.state().conflicts),[key]);assert.equal(s.api.state().error,'');assert.equal(s.records.tt_theme.value,'dark');
 assert.ok(!s.calls.some(c=>c.url.endsWith('/record')&&JSON.parse(c.opts.body).key===key));
 s.storage.set('tt_theme','light');await s.api.sync();assert.equal(s.records.tt_theme.value,'light');assert.equal(s.api.state().error,'');
 assert.deepEqual(JSON.parse(s.storage.get(key)),local);assert.deepEqual(s.records[key].value,remote);
});
test('same trade conflict is held without any PUT or local overwrite',async()=>{const old=[{id:'a',note:'old'}],local=[{id:'a',note:'PC'}],remote=[{id:'a',note:'phone'}];const s=await setup({local:{tt_journal_v1:JSON.stringify(local)},remote:{tt_journal_v1:{revision:2,value:remote,updated:9}},baseline:{tt_journal_v1:{revision:1,value:old}}});assert.ok(s.api.state().conflicts.includes('tt_journal_v1'));assert.equal(s.calls.filter(c=>c.opts?.method==='PUT').length,0);assert.equal(JSON.parse(s.storage.get('tt_journal_v1'))[0].note,'PC');});
test('different Google owner cannot upload this devices local journal',async()=>{const s=await setup({local:{tt_cloud_owner:'different',tt_journal_v1:'[{"id":"private"}]'}});assert.equal(s.api.state().error,'account_mismatch');assert.equal(s.calls.filter(c=>c.url.endsWith('/records')).length,0);});
test('logout cannot change the identity during an in-flight reconciliation',async()=>{let count=0,release;const s=await setup({onRecords:async()=>{if(++count===2)await new Promise(r=>{release=r;});}});const pending=s.api.sync();await new Promise(r=>setImmediate(r));await assert.rejects(s.api.logout(),/Sincronizare în curs/);assert.equal(s.api.state().connected,true);release();await pending;await s.api.logout();assert.equal(s.api.state().connected,false);});
test('explicit cloud conflict choice applies cloud version and retains recovery copy',async()=>{const s=await setup({local:{tt_journal_v1:'[{"id":"a","note":"PC"}]'},remote:{tt_journal_v1:{revision:2,updated:9,value:[{id:'a',note:'phone'}]}},baseline:{tt_journal_v1:{revision:1,value:[{id:'a',note:'old'}]}}});await s.api.resolve('tt_journal_v1','remote');assert.equal(JSON.parse(s.storage.get('tt_journal_v1'))[0].note,'phone');assert.equal(s.api.state().conflicts.length,0);assert.ok(s.privateStore.get('backups:123').length);});

function planBackup(legacy,plans){let saved={raw:JSON.stringify(plans),localRaw:JSON.stringify(legacy),revision:1},tail=Promise.resolve();return {get saved(){return saved;},read:async()=>structuredClone(saved),update(fn){const p=tail.then(()=>{const next=fn(structuredClone(saved));saved=structuredClone(next.record);return next.value;});tail=p.catch(()=>{});return p;}};}
test('backup pause persists and blocks automatic cloud reads and uploads until resumed',async()=>{
 const s=await setup({local:{tt_journal_v1:'[{"id":"original"}]'}});await s.api.pauseForBackup();assert.equal(s.api.state().backupPaused,true);assert.equal(s.privateStore.get('backup-pause'),true);
 const before=s.calls.length;s.storage.set('tt_journal_v1','[{"id":"restored"}]');await s.api.sync();assert.equal(s.calls.length,before);await s.api.resumeAfterBackup();assert.equal(s.api.state().backupPaused,false);assert.equal(s.privateStore.has('backup-pause'),false);assert.match(JSON.stringify(s.records.tt_journal_v1),/restored/);
});
test('backup cannot suspend a reconciliation already in flight',async()=>{
 let count=0,release;const s=await setup({onRecords:async()=>{if(++count===2)await new Promise(r=>{release=r;});}});const pending=s.api.sync();await new Promise(r=>setImmediate(r));await assert.rejects(s.api.pauseForBackup(),/Sincronizare în curs/);release();await pending;
});
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
  if(name==='tt_trading212_fills_v1')return options();
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

const {analysis,ledger}=await import('./trade-evidence-fixtures.mjs');
const analysisStatus={enabled:true,protocol:'tt-cloud-sync-v1',clientId:'test.apps.googleusercontent.com',checks:{database:true,google:true,encryption:true,schema:true},supportedKeys:KEYS};
test('older server never receives analyses or empty bucket writes',async()=>{const a=analysis(),s=await setup({local:{[EvidenceCloud.KEY]:JSON.stringify(ledger(a)),tt_journal_v1:'[{"id":"existing"}]'}});assert.ok(!s.api.state().supportedKeys.includes(EvidenceCloud.KEY));assert.ok(!s.calls.some(c=>c.opts?.body&&EvidenceCloud.isKey(JSON.parse(c.opts.body).key)));assert.equal(s.records.tt_journal_v1.value[0].id,'existing');});
test('PC uploads originals and a fresh phone receives them without duplicating or deleting history',async()=>{const a=analysis(),pc=await setup({status:analysisStatus,local:{[EvidenceCloud.KEY]:JSON.stringify(ledger(a))}}),key=EvidenceCloud.bucket(a.id);assert.ok(pc.api.state().supportedKeys.includes(EvidenceCloud.KEY));assert.equal(pc.records[key].value.entries[0].id,a.id);assert.equal(pc.records[EvidenceCloud.KEY],undefined);const phone=await setup({status:analysisStatus,remote:pc.records});assert.equal(JSON.parse(phone.storage.get(EvidenceCloud.KEY)).entries.length,1);assert.equal(phone.calls.filter(c=>c.opts?.method==='PUT').length,0);await phone.api.sync();assert.equal(JSON.parse(phone.storage.get(EvidenceCloud.KEY)).entries.length,1);assert.equal(phone.privateStore.get('backups:123')[0].snapshot[key],undefined);});
test('a scan during cloud PUT remains local and is uploaded on reconciliation',async()=>{const a=analysis(),b=analysis('new-scan');let fired=false;const pc=await setup({status:analysisStatus,local:{[EvidenceCloud.KEY]:JSON.stringify(ledger(a))},onPut:(storage,body)=>{if(EvidenceCloud.isBucket(body.key)&&!fired){fired=true;storage.set(EvidenceCloud.KEY,JSON.stringify(ledger(a,b)));}}});await pc.api.sync();assert.equal(JSON.parse(pc.storage.get(EvidenceCloud.KEY)).entries.length,2);assert.equal(Object.values(pc.records).filter(r=>r.value?.version==='trade-evidence-v1').reduce((n,r)=>n+r.value.entries.length,0),2);});
test('conflicting analysis resolution preserves unrelated records on both devices and a backup',async()=>{const a=analysis(),key=EvidenceCloud.bucket(a.id);let i=0;while(EvidenceCloud.bucket('local-'+i)!==key)i++;const b=analysis('local-'+i);i=0;while(EvidenceCloud.bucket('remote-'+i)!==key)i++;const c=analysis('remote-'+i),changed={...a,stop:90};const pc=await setup({status:analysisStatus,local:{[EvidenceCloud.KEY]:JSON.stringify(ledger(a,b))},remote:{[key]:{revision:2,value:ledger(changed,c)}},baseline:{[key]:{revision:1,value:ledger(a)}}});assert.ok(pc.api.state().conflicts.includes(key));assert.equal(pc.calls.filter(x=>x.opts?.method==='PUT').length,0);await pc.api.resolve(key,'remote');const result=JSON.parse(pc.storage.get(EvidenceCloud.KEY));assert.equal(result.entries.length,3);assert.equal(result.entries.find(x=>x.id===a.id).stop,90);assert.equal(pc.records[key].value.entries.length,3);assert.equal(pc.privateStore.get('backups:123')[0].snapshot[EvidenceCloud.KEY].entries[0].stop,95);});
test('analysis import uses the same lock as automatic capture and keeps a concurrent new scan',async()=>{const a=analysis(),key=EvidenceCloud.bucket(a.id),s=await setup({status:analysisStatus});s.records[key]={revision:1,value:ledger(a)};const b=analysis('lock-scan'),locks=[];s.context.navigator.locks={request:async(name,options,callback)=>{if(name==='tt-cloud-sync')return callback({});if(name==='tt_trading212_fills_v1')return options();locks.push(name);s.storage.set(EvidenceCloud.KEY,JSON.stringify(ledger(b)));return options();}};await s.api.sync();assert.ok(locks.includes(EvidenceCloud.KEY));assert.ok(JSON.parse(s.storage.get(EvidenceCloud.KEY)).entries.some(r=>r.id===b.id));await s.api.sync();assert.ok(Object.values(s.records).some(r=>r.value?.entries?.some(x=>x.id===b.id)));});

const FILLS='tt_trading212_fills_v1',plain=value=>JSON.parse(JSON.stringify(value));
const brokerFill=id=>({id,ticker:'TEST_US_EQ',date:'2026-10-10T12:00:00Z',side:'SELL',quantity:2,price:120,priceCurrency:'USD',currency:'EUR',realized:18,amount:220,fxRate:.92,taxes:[{name:'FX_FEE',quantity:.3,currency:'EUR'}]});
const brokerFills=(...ids)=>({accounts:{'live:fixture':{environment:'live',items:ids.map(brokerFill),complete:true,fetchedAt:'2026-10-10T12:01:00Z',syncStatus:'complete',syncError:null}}});
const fillIds=value=>new Set(value.accounts['live:fixture'].items.map(row=>row.id));
function durableFills(legacy,data){
 let saved=data===undefined?null:{raw:JSON.stringify(data),localRaw:legacy===undefined?null:JSON.stringify(legacy),revision:1},tail=Promise.resolve(),readError=null,writeError=null;
 return {get saved(){return structuredClone(saved);},failRead(error){readError=error;},failWrite(error){writeError=error;},read:async()=>{if(readError)throw readError;return structuredClone(saved);},update(fn){const pending=tail.then(()=>{if(writeError)throw writeError;const next=fn(structuredClone(saved));if(next.write!==false)saved=structuredClone(next.record);return structuredClone(next.value);});tail=pending.catch(()=>{});return pending;}};
}
const fillPuts=s=>s.calls.filter(call=>call.url.endsWith('/record')&&JSON.parse(call.opts.body).key===FILLS);

test('cloud reconciles the full durable fills union under mirror quota and a new page recovers it over stale localStorage',async()=>{
 const old=brokerFills('base'),full=brokerFills('base','PC'),phone=brokerFills('base','phone'),raw=JSON.stringify(old),backup=durableFills(old,full);
 const s=await setup({local:{[FILLS]:raw},fillsBackup:backup,failFillsMirror:true,remote:{[FILLS]:{revision:2,updated:9,value:phone}},baseline:{[FILLS]:{revision:1,value:old}}});
 const expected=new Set(['base','PC','phone']);
 assert.equal(s.api.state().error,'');assert.equal(s.api.state().failure,null);assert.ok(s.api.state().lastSync);
 assert.equal(s.storage.get(FILLS),raw,'the refused mirror retains its exact original bytes');
 assert.deepEqual(fillIds(JSON.parse(backup.saved.raw)),expected);
 assert.deepEqual(fillIds(plain((await s.fillsLedger.read()).data)),expected);
 assert.deepEqual(fillIds(s.records[FILLS].value),expected);
 assert.deepEqual(s.privateStore.get('backups:123')[0].snapshot[FILLS],full,'recovery uses the full confirmed register, not its stale mirror');
 assert.equal(backup.saved.localRaw,raw);assert.ok(backup.saved.revision>1);
 const fresh=await setup({local:{[FILLS]:raw},fillsBackup:backup,failFillsMirror:true,remote:s.records,baseline:s.privateStore.get('baseline:123')});
 assert.equal(fresh.api.state().error,'');assert.ok(fresh.api.state().lastSync);
 assert.deepEqual(fillIds(plain((await fresh.fillsLedger.read()).data)),expected);
 assert.equal(fresh.storage.get(FILLS),raw);assert.equal(fillPuts(fresh).length,0,'reload must not republish the stale mirror');
});

test('failed durable fills reads cannot upload stale or empty history or confirm synchronization',async()=>{
 for(const legacy of [brokerFills('stale'),undefined]){
  const full=brokerFills('confirmed'),backup=durableFills(legacy,full),before=backup.saved;
  backup.failRead(Error('PRIVATE_IDB_READ'));backup.failWrite(Error('PRIVATE_IDB_WRITE'));
  const remote={[FILLS]:{revision:2,updated:9,value:brokerFills('phone')}},local=legacy===undefined?{}:{[FILLS]:JSON.stringify(legacy)};
  const s=await setup({local,fillsBackup:backup,failFillsMirror:true,remote});
  assert.notEqual(s.api.state().error,'');assert.equal(s.api.state().lastSync,null);assert.equal(s.api.state().busy,false);
  assert.equal(fillPuts(s).length,0);assert.deepEqual(s.records,remote);assert.deepEqual(backup.saved,before);
  assert.equal(s.storage.get(FILLS),local[FILLS]);assert.equal(s.privateStore.get('backups:123'),undefined);
  await assert.rejects(s.fillsLedger.read());assert.throws(()=>s.fillsLedger.peek());
 }
});

test('an unconfirmed durable fills write retains both originals without publishing a stale or empty replacement',async()=>{
 const old=brokerFills('base'),full=brokerFills('base','PC'),phone=brokerFills('base','PC','phone'),backup=durableFills(old,full),before=backup.saved,raw=JSON.stringify(old);
 backup.failWrite(Error('PRIVATE_IDB_COMMIT'));
 const remote={[FILLS]:{revision:2,updated:9,value:phone}},s=await setup({local:{[FILLS]:raw},fillsBackup:backup,failFillsMirror:true,remote,baseline:{[FILLS]:{revision:1,value:old}}});
 assert.notEqual(s.api.state().error,'');assert.equal(s.api.state().lastSync,null);assert.equal(fillPuts(s).length,0);
 assert.equal(s.storage.get(FILLS),raw);assert.deepEqual(backup.saved,before);assert.deepEqual(s.records,remote);
 assert.deepEqual(s.privateStore.get('backups:123')[0].snapshot[FILLS],full);
 assert.deepEqual(plain((await s.fillsLedger.read()).data),full);
});

test('an unloaded fills module fails closed before stale local executions can be published',async()=>{
 const raw=JSON.stringify(brokerFills('stale')),s=await setup({local:{[FILLS]:raw},missingFillsModule:true});
 assert.match(s.api.state().error,/Modulul execuțiilor nu s-a încărcat/);
 assert.equal(s.api.state().lastSync,null);assert.equal(fillPuts(s).length,0);assert.equal(s.storage.get(FILLS),raw);
 assert.equal(s.records[FILLS],undefined);
});

test('a concurrent confirmed broker execution defeats stale cloud CAS and reaches the next full union',async()=>{
 const base=brokerFills('base'),full=brokerFills('base','PC'),phone=brokerFills('base','phone'),raw=JSON.stringify(base),backup=durableFills(base,full);let fired=false;
 const s=await setup({local:{[FILLS]:raw},fillsBackup:backup,failFillsMirror:true,remote:{[FILLS]:{revision:2,updated:9,value:phone}},baseline:{[FILLS]:{revision:1,value:base}},onPut:async(_storage,body,context)=>{
  if(body.key===FILLS&&!fired){fired=true;await context.window.T212FillsStore.mutate(data=>{data.accounts['live:fixture'].items.push(brokerFill('broker-during-sync'));return data;});}
 }});
 assert.equal(fired,true);assert.equal(s.api.state().error,'');
 assert.deepEqual(fillIds(plain((await s.fillsLedger.read()).data)),new Set(['base','PC','broker-during-sync']));
 assert.deepEqual(fillIds(s.records[FILLS].value),new Set(['base','PC','phone']));
 assert.deepEqual(s.privateStore.get('baseline:123')[FILLS].value,full,'rejected CAS preserves the earlier merge baseline');
 assert.equal(s.storage.get(FILLS),raw);
 await s.api.sync();const expected=new Set(['base','PC','phone','broker-during-sync']);
 assert.equal(s.api.state().error,'');assert.ok(s.api.state().lastSync);
 assert.deepEqual(fillIds(plain((await s.fillsLedger.read()).data)),expected);assert.deepEqual(fillIds(JSON.parse(backup.saved.raw)),expected);assert.deepEqual(fillIds(s.records[FILLS].value),expected);
 assert.equal(s.storage.get(FILLS),raw);
});

function checkSafeFailure(s,{code,operation,key,httpStatus}){
 const failure=plain(s.api.state().failure);
 assert.deepEqual(Object.keys(failure).sort(),['at','code','httpStatus','key','operation']);
 assert.equal(failure.code,code);assert.equal(failure.operation,operation);assert.equal(failure.key,key);assert.equal(failure.httpStatus,httpStatus);
 assert.ok(Number.isSafeInteger(failure.at)&&failure.at>0&&failure.at<=Date.now()+60000);
 assert.equal(s.context.window.TTCloudFailure.sanitize(s.api.state().failure).code,code);
 assert.doesNotMatch(JSON.stringify(failure),/PRIVATE_|me@example|token|Authorization|Bearer/);
 return failure;
}

test('quota diagnostics identify the refused register without exposing snapshot payloads or identity',async()=>{
 const key='tt_trading212_portfolio_v1',old={'live:fixture':{fetchedAt:'2026-10-10T12:00:00Z',positions:[{ticker:'PRIVATE_PAYLOAD',quantity:5}]}},phone={'live:fixture':{fetchedAt:'2026-10-10T12:01:00Z',positions:[{ticker:'PRIVATE_REMOTE',quantity:6}]}},raw=JSON.stringify(old);
 const s=await setup({local:{[key]:raw},failStorageKey:key,remote:{[key]:{revision:2,updated:9,value:phone}},baseline:{[key]:{revision:1,value:old}}});
 assert.equal(s.api.state().lastSync,null);assert.equal(s.storage.get(key),raw);assert.equal(s.api.state().connected,true);
 checkSafeFailure(s,{code:'storage_quota',operation:'sync',key,httpStatus:null});
});

test('network and API diagnostics retain only their allowed stage, register, code and HTTP metadata',async()=>{
 const network=await setup({status:boundedStatus,remote:{[FILLS]:{revision:1,updated:1,value:brokerFills('PRIVATE_PAYLOAD')}},onKey:()=>{throw TypeError('PRIVATE_RESPONSE_BODY');}});
 assert.equal(network.api.state().lastSync,null);assert.equal(fillPuts(network).length,0);
 checkSafeFailure(network,{code:'network_error',operation:'read-record',key:FILLS,httpStatus:null});
 const service=await setup({statusHttp:503,status:{error:'cloud_unavailable',payload:'PRIVATE_RESPONSE_BODY'}});
 assert.equal(service.api.state().ready,false);assert.equal(service.api.state().lastSync,null);
 checkSafeFailure(service,{code:'cloud_unavailable',operation:'service',key:null,httpStatus:503});
});

// 15.10.2026 (el: „Eroare de sincronizare” mereu, „Analize înaintea intrării · 08 · spațiul local plin”): un registru care nu încape
// pe dispozitiv oprea TOATĂ sincronizarea la fiecare 30 s. Acum e sărit (și reîncercat data viitoare); restul registrelor trec.
test('un registru care nu încape pe dispozitiv nu mai oprește restul sincronizării, dar sincronizarea nu se declară completă',async()=>{
 const key='tt_trading212_portfolio_v1',old={'live:fixture':{fetchedAt:'2026-10-10T12:00:00Z',positions:[{ticker:'A',quantity:5}]}},phone={'live:fixture':{fetchedAt:'2026-10-10T12:01:00Z',positions:[{ticker:'A',quantity:6}]}},raw=JSON.stringify(old);
 const s=await setup({local:{[key]:raw,tt_theme:'dark'},failStorageKey:key,remote:{[key]:{revision:2,updated:9,value:phone},tt_theme:{revision:2,updated:9,value:'light'}},baseline:{[key]:{revision:1,value:old},tt_theme:{revision:1,value:'dark'}}});
 assert.equal(s.storage.get('tt_theme'),'light','registrul de după cel refuzat se aplică');assert.equal(s.storage.get(key),raw,'registrul refuzat rămâne neatins');
 assert.equal(s.api.state().lastSync,null);assert.match(s.api.state().error,/1 registru nu a fost scris/);assert.equal(s.api.state().failure.code,'storage_quota');assert.equal(s.api.state().failure.key,key);
});
// 16.10.2026: 146 de chei (64 registrul de învățare + 65 analize) ⇒ la o deschidere proaspătă peste 120 de citiri pe minut ⇒ 429 și sincronizarea cădea.
test('cloud 429 during bounded reads waits retryAfter and finishes the sync instead of failing',async()=>{
 let limited=2;const s=await setup({status:boundedStatus,remote:{tt_journal_v1:{revision:1,updated:1,value:[{id:'a'}]},wl_stocks:{revision:1,updated:1,value:['AAPL']}},onKey:(_,key)=>{if(key==='wl_stocks'&&limited>0){limited--;return {__http:429,error:'rate_limited',retryAfter:0};}}});
 await new Promise(r=>setTimeout(r,1500));
 assert.equal(s.api.state().error,'');assert.deepEqual(JSON.parse(s.storage.get('wl_stocks')),['AAPL']);assert.equal(s.calls.filter(c=>c.url.endsWith('key=wl_stocks')).length,3);
});
test('cloud 429 that persists stops after two waits and reports rate_limited',async()=>{
 const s=await setup({status:boundedStatus,remote:{wl_stocks:{revision:1,updated:1,value:['AAPL']}},onKey:()=>({__http:429,error:'rate_limited',retryAfter:0})});
 await new Promise(r=>setTimeout(r,1500));
 assert.equal(s.api.state().error,'rate_limited');assert.equal(s.calls.filter(c=>c.url.endsWith('key=wl_stocks')).length,3);assert.equal(s.storage.has('wl_stocks'),false);
});
