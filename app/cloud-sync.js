import {KEYS,mergeRecord,validateValue,EvidenceCloud,ForecastCloud} from '../lib/cloud-sync-model.mjs?v=26.10.16.0700';
/* 16.10.2026: registrul de învățare al Portofoliului circulă între dispozitive (PC-ul notează dimineața, telefonul vede). Se citește din IndexedDB o
   dată pe sincronizare; scrierea unește în aceeași tranzacție cu ce e salvat (Portofoliul deschis poate adăuga între timp) și nu șterge nimic. */
const ForecastLocal=(()=>{let snap=null;
 function open(){return new Promise((res,rej)=>{if(!globalThis.indexedDB){rej(Error('IndexedDB indisponibil'));return;}const r=indexedDB.open('tt_holdings_forecasts_v1',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('history'))r.result.createObjectStore('history');};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error||Error('Registrul de învățare nu se deschide.'));r.onblocked=()=>rej(Error('Registrul de învățare este blocat.'));});}
 async function read(){const db=await open();try{return await new Promise((res,rej)=>{const out=new Map(),tx=db.transaction('history','readonly'),q=tx.objectStore('history').openCursor();q.onsuccess=()=>{const c=q.result;if(!c)return;if(typeof c.key==='string'&&c.key.startsWith(ForecastCloud.LEDGER)&&typeof c.value==='string')out.set(c.key,c.value);c.continue();};tx.oncomplete=()=>res(out);tx.onerror=tx.onabort=()=>rej(tx.error||Error('Registrul de învățare nu poate fi citit.'));});}finally{db.close();}}
 const F=()=>window.HoldingsForecast,S=()=>window.HoldingsForecastStorage;
 // doar estimările pe care Portofoliul de aici le recunoaște pleacă în cloud (aceeași validare ca la citire)
 function groups(raws){const out=new Map(),cut=ForecastCloud.cutoff();for(const [k,raw] of raws){let d;try{d=JSON.parse(raw);}catch{continue;}const e=S()?.identity(k);if(!d||!e||d.version!==F()?.VERSION||!Array.isArray(d.entries))continue;for(const r of d.entries){if(!r||typeof r.id!=='string'||!r.source||!Number.isFinite(r.source.t)||r.source.t<cut)continue;try{if(!F().validEntry(r,e))continue;}catch{continue;}const b=ForecastCloud.bucket(k,r.id);if(!out.has(b))out.set(b,{});const g=out.get(b);(g[k]||(g[k]={version:d.version,entries:[]})).entries.push(r);}}return out;}
 async function value(key){if(!F()||!S())throw Error('Modulul registrului de învățare nu s-a încărcat. Reîncarcă aplicația.');if(!snap)snap=read().then(groups);const g=(await snap).get(key);if(!g)return undefined;return ForecastCloud.cloudValue(Object.fromEntries(Object.keys(g).map(k=>[k,{version:g[k].version,entries:g[k].entries.slice().sort((a,b)=>a.source.t-b.source.t||a.id.localeCompare(b.id))}])));}
 async function apply(key,next){if(!next)return true;ForecastCloud.validate(key,next);if(!F()||!S())throw Error('Modulul registrului de învățare nu s-a încărcat. Reîncarcă aplicația.');const db=await open();try{await new Promise((res,rej)=>{const tx=db.transaction('history','readwrite',{durability:'strict'}),st=tx.objectStore('history');
   // scrierea folosește exact unirea și validarea Portofoliului; o estimare pe care Portofoliul nu o recunoaște (altă versiune a aplicației) nu intră
   for(const [k,doc] of Object.entries(next.ledgers)){const e=S().identity(k);if(!e||doc.version!==F().VERSION)continue;const entries=doc.entries.filter(r=>{try{return F().validEntry(r,e);}catch{return false;}});if(!entries.length)continue;
    const q=st.get(k);q.onsuccess=()=>{const cur=typeof q.result==='string'?q.result:null;let merged;try{merged=S().merge(cur,JSON.stringify({version:F().VERSION,entries}),k);}catch{return;}if(merged!==cur)st.put(merged,k);};}
   tx.oncomplete=res;tx.onerror=tx.onabort=()=>rej(tx.error||Error('Registrul de învățare nu a fost salvat.'));});}finally{db.close();}
  snap=null;try{const ch=new BroadcastChannel('tt-holdings-forecast-sync-v1');ch.postMessage({at:Date.now()});ch.close();}catch{}return true;}
 try{const ch=new BroadcastChannel('tt-holdings-forecast-changed-v1');ch.onmessage=()=>{snap=null;};}catch{}
 return {value,apply,reset:()=>{snap=null;}};})();
const EvidenceVault=window.TTEvidenceVault,EvidenceStore=EvidenceCloud.createStore(EvidenceVault?.storage||localStorage);
const PlanStore=window.TTPlanStore?.create(localStorage);
const Store=window.TTCloudStore,LOCAL_KEYS=KEYS.filter(k=>k!=='cloud_credentials'&&!EvidenceCloud.isBucket(k)&&!ForecastCloud.isBucket(k)),rawKeys=['tt_theme','tt_pf_account','tt_ticket_capital'];
const PERFORMANCE_KEYS=['tt_trading212_account_history_v1','tt_trading212_cash_v1'];
const EUROPE_KEYS=['tt_europe_signals_v1','tt_europe_risk_settings_v1'];let activeKeys=[];
let backupPaused=false,brokerBeforeBackup=null;
let endpoint='',ready=false,session=null,busy=false,baseline={},conflicts={},lastSync=null,error='',timer=null,checking=false,setup=null,initialization=null,poll=null,monitorCapability=null,pushCapability=null,auditCapability=null;
let boundedReads=false,recordCacheOwner=null;const recordCache=new Map();
let failure=null;
const emptyConnection=()=>({local:null,cloud:null,synced:false,environment:null,checkedAt:null,message:''});let trading212=emptyConnection();
const sameConnection=(a,b)=>!!a&&!!b&&a.key===b.key&&a.secret===b.secret&&a.environment===b.environment;
function connectionState(local,record){const remote=record?.value;trading212={local:!!local,cloud:!!remote,synced:sameConnection(local,remote),environment:remote?.environment||local?.environment||null,checkedAt:Date.now(),message:sameConnection(local,remote)?trading212.message:''};}
const state=()=>({ready,backupPaused,connected:!!session,email:session?.email||null,busy,checking,setup,lastSync,error,failure:error?failure:null,conflicts:Object.keys(conflicts),supportedKeys:[...activeKeys,...(EvidenceCloud.keys.every(k=>activeKeys.includes(k))?[EvidenceCloud.KEY]:[])],trading212:{...trading212},monitor:monitorCapability,push:pushCapability,audit:auditCapability});
function annotate(e,context={}){try{if(!e.cloudFailure&&window.TTCloudFailure)e.cloudFailure=window.TTCloudFailure.fromError(e,context);}catch{}return e;}
function failed(e,context={}){try{return window.TTCloudFailure?.sanitize(e.cloudFailure||window.TTCloudFailure.fromError(e,context))||null;}catch{return null;}}
function broadcast(){window.dispatchEvent(new CustomEvent('tt-cloud-state',{detail:state()}));document.querySelectorAll('iframe').forEach(f=>f.contentWindow?.postMessage({ttCloudState:state()},location.origin));}
function local(key){const raw=(key===EvidenceCloud.KEY&&EvidenceVault?EvidenceVault.storage:localStorage).getItem(key);if(raw===null)return undefined;if(rawKeys.includes(key))return raw;try{return JSON.parse(raw);}catch(_){throw Error('Date locale incompatibile: '+key);}}
async function deviceOwner(){const stored=await Store.get('owner'),legacy=localStorage.getItem('tt_cloud_owner');if(stored!==null&&typeof stored!=='string')throw Error('account_mismatch');if(stored&&legacy&&stored!==legacy)throw Error('account_mismatch');return stored||legacy;}
async function value(key){if(EvidenceCloud.isBucket(key))return EvidenceStore.value(key);if(ForecastCloud.isBucket(key))return ForecastLocal.value(key);if(key==='tt_trading212_fills_v1'){if(!window.T212FillsStore)throw Error('Modulul execuțiilor nu s-a încărcat. Reîncarcă aplicația înainte de sincronizare.');const record=await window.T212FillsStore.read();return record.raw===null?undefined:record.data;}if(key==='tt_trade_plans_v1'){if(!PlanStore)throw Error('Modulul planurilor nu s-a încărcat. Reîncarcă aplicația înainte de sincronizare.');const record=await PlanStore.read();return record.raw===null?undefined:record.plans;}return key==='cloud_credentials'?(await window.T212Vault.read()||undefined):local(key);}
async function api(path,method='GET',data,anonymous=false){const c=new AbortController(),t=setTimeout(()=>c.abort(),20000);let httpStatus=null;try{const r=await fetch(endpoint+'/api/cloud/'+path,{method,cache:'no-store',credentials:'omit',redirect:'error',signal:c.signal,headers:{...(data?{'Content-Type':'application/json'}:{}),...(!anonymous&&session?{Authorization:'Bearer '+session.token}:{})},...(data?{body:JSON.stringify(data)}:{})});httpStatus=r.status;let b;try{b=await r.json();}catch{b={error:'cloud_unavailable'};}if(!r.ok){if(r.status===401&&path!=='auth'&&!anonymous){session=null;await Store.remove('session');}const e=Error(path==='status'&&r.status===404?'cloud_worker_missing':b.error||'cloud_unavailable');e.status=r.status;throw e;}return b;}catch(e){let operation=path==='status'?'service':path==='session'||path==='auth'||path==='challenge'?'session':path==='record'?'write-record':path==='records'?'read-all':path.startsWith('records?index=')?'read-index':path.startsWith('records?key=')?'read-record':'sync';let key=null;try{key=path==='record'?data?.key:new URLSearchParams(path.split('?')[1]||'').get('key');}catch{}throw annotate(e,{operation,key,httpStatus});}finally{clearTimeout(t);}}
async function readRecords(){
 if(!boundedReads)return (await api('records')).records;
 if(recordCacheOwner!==session?.subject){recordCache.clear();recordCacheOwner=session?.subject;}
 const index=await api(activeKeys.some(k=>ForecastCloud.isBucket(k))?'records?index=2':'records?index=1'),records={};
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
 const validMeta=v=>object(v)&&Number.isSafeInteger(v.revision)&&v.revision>0&&Number.isSafeInteger(v.updated)&&v.updated>=0;
 if(index?.protocol!=='tt-cloud-records-v2'||!object(index.records)||Object.keys(index.records).some(k=>!KEYS.includes(k)||!validMeta(index.records[k])))throw Error('cloud_response_invalid');
 // A successful complete index is required before treating a record as absent.
 // This cache contains exact server values, never merge baselines or local edits.
 for(const key of recordCache.keys())if(!activeKeys.includes(key)||!Object.hasOwn(index.records,key))recordCache.delete(key);
 for(const [key,meta] of Object.entries(index.records)){
  if(!activeKeys.includes(key))continue;
  let record=recordCache.get(key);
  if(!record||record.revision!==meta.revision||record.updated!==meta.updated){
   const response=await api('records?key='+encodeURIComponent(key));
   if(!object(response?.records)||Object.keys(response.records).some(k=>k!==key))throw Error('cloud_response_invalid');
   record=response.records[key];
   if(!validMeta(record)||!Object.hasOwn(record,'value'))throw Error('cloud_response_invalid');
   if(record.revision!==meta.revision||record.updated!==meta.updated){const changed=Error('cloud_records_changed');changed.status=409;throw changed;}
   recordCache.set(key,record);
  }
  records[key]={...record};
 }
 return records;
}
function notifyStorage(key,oldValue,newValue){document.querySelectorAll('iframe').forEach(f=>{try{f.contentWindow.dispatchEvent(new StorageEvent('storage',{key,oldValue,newValue,url:location.href,storageArea:localStorage}));}catch(_){}});window.dispatchEvent(new StorageEvent('storage',{key,oldValue,newValue,url:location.href,storageArea:localStorage}));}
async function apply(key,next,expected,locked=false){if(ForecastCloud.isBucket(key))return ForecastLocal.apply(key,next);if((key==='tt_europe_signals_v1'||EvidenceCloud.isKey(key))&&!locked&&navigator.locks?.request)return navigator.locks.request(EvidenceCloud.isKey(key)?EvidenceCloud.KEY:key,()=>apply(key,next,expected,true));if(EvidenceCloud.isKey(key))await EvidenceVault?.refresh?.();if(next!==undefined&&next!==null)validateValue(key,next);if(JSON.stringify(await value(key))!==JSON.stringify(expected))return false;if(EvidenceCloud.isBucket(key)){const store=EvidenceVault?.storage||localStorage,before=store.getItem(EvidenceCloud.KEY),saved=EvidenceStore.replace(key,expected,next);if(saved){await EvidenceVault?.flush?.();notifyStorage(EvidenceCloud.KEY,before,store.getItem(EvidenceCloud.KEY));}return saved;}if(key==='cloud_credentials'){if(next){await window.T212Vault.save(next);const broker=document.getElementById('brokerFrame');if(broker)broker.src='../broker/?app=decision-mobile-v2&cloud='+Date.now();}return true;}if(key==='tt_trading212_fills_v1'&&window.T212FillsStore){const saved=await window.T212FillsStore.replace(expected,next===null?undefined:next);if(saved)notifyStorage(key,JSON.stringify(expected)||null,JSON.stringify(next)||null);return saved;}if(key==='tt_trade_plans_v1'&&PlanStore){const saved=await PlanStore.replace(expected,next===null?undefined:next);if(saved)notifyStorage(key,JSON.stringify(expected)||null,JSON.stringify(next)||null);return saved;}if(key===EvidenceCloud.KEY&&EvidenceVault){const store=EvidenceVault.storage,old=store.getItem(key);if(next===undefined||next===null)store.removeItem(key);else store.setItem(key,JSON.stringify(next));await EvidenceVault.flush();notifyStorage(key,old,store.getItem(key));return true;}
 const oldValue=localStorage.getItem(key);if(next===undefined||next===null)localStorage.removeItem(key);else if(window.TTStorageWrite)window.TTStorageWrite.setItem(localStorage,key,rawKeys.includes(key)?String(next):JSON.stringify(next));else localStorage.setItem(key,rawKeys.includes(key)?String(next):JSON.stringify(next));notifyStorage(key,oldValue,localStorage.getItem(key));return true;}
async function backup(){const list=await Store.get('backups:'+session.subject)||[],snapshot={};for(const k of LOCAL_KEYS){const v=await value(k);if(v!==undefined)snapshot[k]=v;}list.unshift({at:Date.now(),snapshot});await Store.put('backups:'+session.subject,list.slice(0,5));}
async function performSync(){if(!ready||!session||busy||checking||navigator.onLine===false)return;busy=true;error='';failure=null;let currentKey=null;broadcast();try{
 // Registrul analizelor din IndexedDB trebuie încărcat înainte de citire: un registru încă necitit nu e un registru gol.
 await EvidenceVault?.ready?.();
 backupPaused=await Store.get('backup-pause')===true;if(backupPaused)return;
 const owner=await deviceOwner();if(owner&&owner!==session.subject)throw Error('account_mismatch');await Store.put('owner',session.subject);
 const remote=await readRecords();let backedUp=false;const skipped=[],full=e=>e?.name==='QuotaExceededError'||e?.code===22||e?.code===1014;
 for(const key of activeKeys){
  currentKey=key;
  if(conflicts[key]&&key!=='cloud_credentials')continue;const current=await value(key),record=remote[key],base=baseline[key];if(key==='cloud_credentials')connectionState(current,record);if(conflicts[key])continue;
  // Forgetting a local connection is not an instruction to erase the cloud key.
  if(key==='cloud_credentials'&&current===undefined&&base?.value){continue;}
  if(key==='cloud_credentials'&&record?.value===null){baseline[key]=record;continue;}
  const remoteValue=record?.value===null?undefined:record?.value;
  const result=mergeRecord(key,base?.value,current,remoteValue);
  if(result.conflicts.length){conflicts[key]={paths:result.conflicts,remote:record,local:current};continue;}
  const next=result.value;
  if(JSON.stringify(next)!==JSON.stringify(remoteValue)){
   if(next!==undefined)validateValue(key,next);
   const saved=await api('record','PUT',{key,value:next===undefined?null:next,revision:record?.revision||0});remote[key]={...saved,value:next};
  }
  if(JSON.stringify(next)!==JSON.stringify(current)){
   if(!backedUp&&key!=='cloud_credentials'&&!ForecastCloud.isBucket(key)){await backup();backedUp=true;}
   // A concurrent local edit still descends from the snapshot read above,
   // not from the merged cloud value that this device has not accepted.
   // Un registru care nu încape pe dispozitiv nu mai oprește celelalte registre; rămâne de reîncercat la următoarea sincronizare.
   let applied;try{applied=await apply(key,next,current);}catch(e){if(full(e)){skipped.push({key,e});continue;}throw e;}
   if(!applied){baseline[key]={...(remote[key]||{revision:0}),value:current};continue;}
  }
  baseline[key]=remote[key]||{value:undefined,revision:0};if(key==='cloud_credentials')connectionState(await value(key),remote[key]);
 }
 // Ownership is durable before any upload; the legacy mirror may be full.
 try{localStorage.setItem('tt_cloud_owner',session.subject);}catch{}await Store.put('baseline:'+session.subject,baseline);
 if(skipped.length){currentKey=skipped[0].key;error='Spațiul local al browserului este plin: '+(skipped.length===1?'1 registru nu a fost scris':skipped.length+' registre nu au fost scrise')+' pe acest dispozitiv; celelalte s-au sincronizat. Eliberează spațiu din Starea aplicației.';failure=failed(skipped[0].e,{operation:'sync',key:currentKey});}else lastSync=Date.now();
 }catch(e){error=e.status===409?'Datele au fost modificate pe celălalt dispozitiv. Reconcilierea se reia la următoarea sincronizare.':e.message;failure=failed(e,{operation:'sync',key:currentKey});}finally{busy=false;broadcast();}}
async function sync(){if(navigator.locks)return navigator.locks.request('tt-cloud-sync',{ifAvailable:true},lock=>lock?performSync():undefined);return performSync();}
async function login(credential,nonce){if(!ready)throw Error('cloud_not_configured');const owner=await deviceOwner();const result=await api('auth','POST',{credential,nonce});if(owner&&owner!==result.subject){session={...result};await api('session','DELETE');session=null;throw Error('account_mismatch');}session=result;await Store.put('session',session);baseline=await Store.get('baseline:'+session.subject)||{};conflicts={};await sync();broadcast();}
async function logout(){if(session){try{await api('session','DELETE');}catch(_){}}session=null;conflicts={};trading212=emptyConnection();await Store.remove('session');error='';broadcast();}
async function resolve(key,choice){if(!conflicts[key]||!['local','remote'].includes(choice))return;const current=await value(key),records=await readRecords(),r=records[key];if(JSON.stringify(r)!==JSON.stringify(conflicts[key].remote)){conflicts[key]={...conflicts[key],remote:r};error='Datele cloud s-au schimbat. Verifică din nou alegerea.';broadcast();return;}await backup();if(EvidenceCloud.isBucket(key)){const next=EvidenceCloud.resolve(key,baseline[key]?.value,current,r?.value,choice).value;let saved=r;if(JSON.stringify(next)!==JSON.stringify(r?.value)){saved={...await api('record','PUT',{key,value:next===undefined?null:next,revision:r?.revision||0}),value:next};}if(!await apply(key,next,current))throw Error('Datele locale s-au modificat. Reîncearcă.');baseline[key]=saved||{revision:0};}else if(choice==='remote'){if(!await apply(key,r?.value===null?undefined:r?.value,current))throw Error('Datele locale s-au modificat. Reîncearcă.');baseline[key]=r||{revision:0};}else{const saved=await api('record','PUT',{key,value:current===undefined?null:current,revision:r?.revision||0});baseline[key]={...saved,value:current};}delete conflicts[key];await Store.put('baseline:'+session.subject,baseline);error='';broadcast();await sync();}
async function deleteCredentials(){if(!session)throw Error('session_required');const r=(await readRecords()).cloud_credentials;await api('record','PUT',{key:'cloud_credentials',value:null,revision:r?.revision||0});await window.T212Vault.clear();baseline.cloud_credentials={value:undefined};delete conflicts.cloud_credentials;await Store.put('baseline:'+session.subject,baseline);const broker=document.getElementById('brokerFrame');if(broker)broker.src='../broker/?app=decision-mobile-v2&cloud-clear='+Date.now();await sync();}
async function credentialSession(){if(!session)throw Error('session_required');if(!ready)throw Error('cloud_not_configured');const owner=await deviceOwner();if(owner&&owner!==session.subject)throw Error('account_mismatch');await Store.put('owner',session.subject);trading212.message='';}
async function publishCredentials(){await credentialSession();const v=await window.T212Vault.read();if(!v)throw Error('Conectează întâi Trading 212 pe acest dispozitiv.');validateValue('cloud_credentials',v);const r=(await readRecords()).cloud_credentials;await api('record','PUT',{key:'cloud_credentials',value:v,revision:r?.revision||0});const verified=(await readRecords()).cloud_credentials;connectionState(await window.T212Vault.read(),verified);if(!sameConnection(v,verified?.value))throw Error('cloud_credentials_changed');baseline.cloud_credentials=verified;delete conflicts.cloud_credentials;await Store.put('baseline:'+session.subject,baseline);trading212.message='Conexiune Trading 212 salvată în cloud și verificată. Pe celălalt dispozitiv, folosește același cont Google și apasă „Preia conexiunea din cloud”.';}
async function restoreCredentials(){await credentialSession();const record=(await readRecords()).cloud_credentials,current=await value('cloud_credentials');connectionState(current,record);if(!record?.value)throw Error('cloud_credentials_missing');validateValue('cloud_credentials',record.value);if(!await apply('cloud_credentials',record.value,current))throw Error('Datele locale s-au modificat. Reîncearcă.');const saved=await window.T212Vault.read();connectionState(saved,record);if(!sameConnection(saved,record.value))throw Error('Conexiunea Trading 212 nu a putut fi verificată pe acest dispozitiv.');baseline.cloud_credentials=record;delete conflicts.cloud_credentials;await Store.put('baseline:'+session.subject,baseline);trading212.message='Conexiune Trading 212 preluată din cloud și salvată pe acest dispozitiv. Reconectarea brokerului a pornit automat.';}
async function restore(){if(!session)return;const list=await Store.get('backups:'+session.subject)||[];if(!list.length)throw Error('Nu există o copie locală de restaurat.');const saved=list[0];for(const k of LOCAL_KEYS)await apply(k,saved.snapshot[k],await value(k));error='Copie locală restaurată. Următoarea sincronizare va verifica diferențele.';broadcast();}
function conflictView(key){const c=conflicts[key];if(!c)return null;const preview=v=>v===undefined?'Fără înregistrare':JSON.stringify(v,null,2).slice(0,4000);return key==='cloud_credentials'?{local:'Conexiune Trading 212 locală · '+(c.local?.environment||'absentă'),remote:'Conexiune Trading 212 cloud · '+(c.remote?.value?.environment||'absentă')}:{local:preview(c.local),remote:preview(c.remote?.value)};}
async function mutation(fn){if(busy||checking)throw Error('Sincronizare în curs. Așteaptă finalizarea înainte de această acțiune.');busy=true;error='';failure=null;broadcast();try{return await fn();}catch(e){error=e.message;failure=failed(e);throw e;}finally{busy=false;broadcast();}}
const wrapped={};for(const [name,fn] of Object.entries({login,logout,resolve,deleteCredentials,publishCredentials,restoreCredentials,restore})){wrapped[name]=async(...args)=>{await mutation(()=>fn(...args));if(!['logout','restore'].includes(name))await sync();};}
async function pauseForBackup(){return mutation(async()=>{await Store.put('backup-pause',true);backupPaused=true;clearTimeout(timer);const broker=document.getElementById('brokerFrame');if(broker){brokerBeforeBackup=broker.src;broker.src='about:blank';}});}
async function resumeAfterBackup(){await mutation(async()=>{await Store.remove('backup-pause');backupPaused=false;const broker=document.getElementById('brokerFrame');if(broker&&brokerBeforeBackup){broker.src=brokerBeforeBackup;brokerBeforeBackup=null;}});await sync();}
window.TTCloud={forecastLocal:{value:k=>ForecastLocal.value(k),apply:(k,v)=>ForecastLocal.apply(k,v),reset:()=>ForecastLocal.reset(),bucket:ForecastCloud.bucket,keys:ForecastCloud.keys},push:()=>api('push'),subscribePush:subscription=>api('push','PUT',{subscription}),removePush:id=>api('push','DELETE',{id}),testPush:id=>api('push/test','POST',{id}),audit:()=>api('audit'),anchorAudit:entries=>api('audit','POST',{entries}),pauseForBackup,resumeAfterBackup,monitor:()=>api('monitor'),configureMonitor:enabled=>api('monitor','PUT',{enabled}),runMonitor:()=>api('monitor/check','POST',{}),conflictView,state,sync,recheck,login,logout,resolve,deleteCredentials,publishCredentials,restoreCredentials,restore,challenge:()=>api('challenge','POST',{}),config:()=>({endpoint}),...wrapped};
window.addEventListener('storage',e=>{if(KEYS.includes(e.key)&&!busy){clearTimeout(timer);timer=setTimeout(sync,2500);}});
function plansChanged(){if(!busy){clearTimeout(timer);timer=setTimeout(sync,2500);}}
window.addEventListener('tt-plan-store-changed',plansChanged);PlanStore?.subscribe(plansChanged);
window.addEventListener('online',()=>ready?sync():recheck());document.addEventListener('visibilitychange',()=>{if(!document.hidden)(ready?sync():recheck());});
async function initialize(){let available=false;checking=true;error='';failure=null;setup=null;activeKeys=[];boundedReads=false;broadcast();try{
 const cfg=await fetch('cloud-sync-config.json',{cache:'no-store'}).then(r=>r.json());if(cfg.enabled!==true&&cfg.autoActivate!==true)throw Error('cloud_not_configured');
 const u=new URL(cfg.endpoint);if(u.origin!=='https://premarket-scanner-html.mferent80.workers.dev'||u.pathname!=='/'||u.search||u.hash||u.username||u.password)throw Error('Endpoint cloud incompatibil.');endpoint=u.origin;
 // Readiness is public: no session, journal or broker credentials accompany this request.
 const status=await api('status','GET',undefined,true);monitorCapability=status.monitor||null;pushCapability=status.push||null;auditCapability=status.audit||null;if(status.protocol!=='tt-cloud-sync-v1')throw Error('cloud_protocol_mismatch');
 boundedReads=status.records?.protocol==='tt-cloud-records-v2'&&status.records.maxKeys===1;
 setup=Object.fromEntries(['database','google','encryption','schema'].map(k=>[k,status.checks?.[k]===true]));
 if(status.enabled!==true||Object.values(setup).some(v=>!v))throw Error('cloud_not_configured');if(!/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(status.clientId||''))throw Error('cloud_not_configured');
 const evidenceReady=Array.isArray(status.supportedKeys)&&EvidenceCloud.keys.every(k=>status.supportedKeys.includes(k)),forecastReady=!!globalThis.indexedDB&&Array.isArray(status.supportedKeys)&&ForecastCloud.keys.every(k=>status.supportedKeys.includes(k));activeKeys=KEYS.filter(k=>k!==EvidenceCloud.KEY&&(!EvidenceCloud.isBucket(k)||evidenceReady)&&(!ForecastCloud.isBucket(k)||forecastReady)&&(!EUROPE_KEYS.includes(k)||status.supportedKeys?.includes(k))&&(!PERFORMANCE_KEYS.includes(k)||status.supportedKeys?.includes(k)));
 ready=true;available=true;window.TTCloud.clientId=status.clientId;
 if(poll===null)poll=setInterval(()=>{if(!document.hidden)sync();},30000);
 backupPaused=await Store.get('backup-pause')===true;if(backupPaused){const broker=document.getElementById('brokerFrame');if(broker){brokerBeforeBackup=broker.src;broker.src='about:blank';}}
 session=await Store.get('session');if(session){const verified=await api('session');if(verified.subject!==session.subject){session=null;await Store.remove('session');throw Error('session_expired');}baseline=await Store.get('baseline:'+session.subject)||{};}
 }catch(e){ready=available;error=e.message;failure=failed(e);}finally{checking=false;broadcast();}if(ready&&session&&!error)await sync();}
function recheck(){if(busy)return Promise.resolve();if(initialization)return initialization;initialization=initialize().finally(()=>{initialization=null;});return initialization;}
recheck();

