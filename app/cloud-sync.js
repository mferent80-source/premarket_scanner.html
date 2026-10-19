import {KEYS,mergeRecord,validateValue,EvidenceCloud,ForecastCloud,LAST_WRITE_WINS,FillsCloud} from '../lib/cloud-sync-model.mjs?v=26.10.19.1845';
/* 16.10.2026: registrul de învățare al Portofoliului circulă între dispozitive (PC-ul notează dimineața, telefonul vede). Se citește din IndexedDB o
   dată pe sincronizare; scrierea unește în aceeași tranzacție cu ce e salvat (Portofoliul deschis poate adăuga între timp) și nu șterge nimic. */
const ForecastLocal=(()=>{let snap=null,gen=0;
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
  snap=null;gen++;try{const ch=new BroadcastChannel('tt-holdings-forecast-sync-v1');ch.postMessage({at:Date.now()});ch.close();}catch{}return true;}
 try{const ch=new BroadcastChannel('tt-holdings-forecast-changed-v1');ch.onmessage=()=>{snap=null;gen++;};}catch{}
 return {value,apply,reset:()=>{snap=null;gen++;},stamp:()=>gen};})();
/* 19.10.2026 (I-697): execuțiile Trading 212 merg în cont pe pachete (FillsCloud); registrul autoritar rămâne T212FillsStore (IndexedDB). Se citește o dată
   pe trecere și toate pachetele se calculează din aceeași citire; scrierea unui pachet e CAS pe tot registrul (o execuție venită între timp nu se pierde). */
const FillsLocal=(()=>{let snap=null,last=null;
 const store=()=>{if(!window.T212FillsStore)throw Error('Modulul execuțiilor nu s-a încărcat. Reîncarcă aplicația înainte de sincronizare.');return window.T212FillsStore;};
 // aceeași citire (același obiect) cât timp registrul nu s-a schimbat ⇒ amprenta trecerii I-706 se compară într-o clipă
 async function current(){if(!snap)snap=store().read().then(r=>last&&last.raw===r.raw?last:(last={raw:r.raw,data:r.raw===null?undefined:r.data,parts:null}));try{return await snap;}catch(e){snap=null;throw e;}}
 async function value(key){const c=await current();if(key===FillsCloud.KEY)return c.data;if(!c.parts)c.parts=FillsCloud.split(c.data);return c.parts.get(key);}
 async function apply(key,next,expected){snap=null;const r=await store().read(),data=r.raw===null?undefined:r.data;if(JSON.stringify(FillsCloud.split(data).get(key))!==JSON.stringify(expected))return false;const saved=await store().replace(data,FillsCloud.apply(data,key,next));snap=null;if(saved)notifyStorage(FillsCloud.KEY,null,null);return saved;}
 return {value,apply,stamp:current,reset:()=>{snap=null;}};})();
const EvidenceVault=window.TTEvidenceVault,EvidenceStore=EvidenceCloud.createStore(EvidenceVault?.storage||localStorage);
const PlanStore=window.TTPlanStore?.create(localStorage);
const Store=window.TTCloudStore,LOCAL_KEYS=KEYS.filter(k=>k!=='cloud_credentials'&&!EvidenceCloud.isBucket(k)&&!ForecastCloud.isBucket(k)&&!FillsCloud.isKey(k)),rawKeys=['tt_theme','tt_pf_account','tt_ticket_capital'];
const PERFORMANCE_KEYS=['tt_trading212_account_history_v1','tt_trading212_cash_v1'];
const EUROPE_KEYS=['tt_europe_signals_v1','tt_europe_risk_settings_v1'];let activeKeys=[];
let backupPaused=false,brokerBeforeBackup=null;
let endpoint='',ready=false,session=null,busy=false,baseline={},conflicts={},lastSync=null,error='',timer=null,checking=false,setup=null,initialization=null,poll=null,monitorCapability=null,pushCapability=null,auditCapability=null;
let boundedReads=false,recordCacheOwner=null;const recordCache=new Map();
let failure=null;
// 19.10.2026: pachetele execuțiilor (I-697) — active doar când serverul le acceptă; cheile sărite la ultima trecere (p.2); mărimea fiecărei chei în cont (p.3);
// amprenta fiecărei chei la ultima trecere reușită (I-706)
let fillsActive=false,skippedKeys=[];const sizes={},seen=new Map(),RECORD_LIMIT=1000000;
const emptyConnection=()=>({local:null,cloud:null,synced:false,environment:null,checkedAt:null,message:''});let trading212=emptyConnection();
const sameConnection=(a,b)=>!!a&&!!b&&a.key===b.key&&a.secret===b.secret&&a.environment===b.environment;
function connectionState(local,record){const remote=record?.value;trading212={local:!!local,cloud:!!remote,synced:sameConnection(local,remote),environment:remote?.environment||local?.environment||null,checkedAt:Date.now(),message:sameConnection(local,remote)?trading212.message:''};}
const state=()=>({ready,backupPaused,connected:!!session,email:session?.email||null,busy,checking,setup,lastSync,error,failure:error?failure:null,skipped:skippedKeys.map(x=>({...x})),sizes:{...sizes},recordLimit:RECORD_LIMIT,conflicts:Object.keys(conflicts),supportedKeys:[...activeKeys,...(EvidenceCloud.keys.every(k=>activeKeys.includes(k))?[EvidenceCloud.KEY]:[])],trading212:{...trading212},monitor:monitorCapability,push:pushCapability,audit:auditCapability});
function annotate(e,context={}){try{if(!e.cloudFailure&&window.TTCloudFailure)e.cloudFailure=window.TTCloudFailure.fromError(e,context);}catch{}return e;}
function failed(e,context={}){try{return window.TTCloudFailure?.sanitize(e.cloudFailure||window.TTCloudFailure.fromError(e,context))||null;}catch{return null;}}
function broadcast(){window.dispatchEvent(new CustomEvent('tt-cloud-state',{detail:state()}));document.querySelectorAll('iframe').forEach(f=>f.contentWindow?.postMessage({ttCloudState:state()},location.origin));}
function local(key){const raw=(key===EvidenceCloud.KEY&&EvidenceVault?EvidenceVault.storage:localStorage).getItem(key);if(raw===null)return undefined;if(rawKeys.includes(key))return raw;try{return JSON.parse(raw);}catch(_){throw Error('Date locale incompatibile: '+key);}}
async function deviceOwner(){const stored=await Store.get('owner'),legacy=localStorage.getItem('tt_cloud_owner');if(stored!==null&&typeof stored!=='string')throw Error('account_mismatch');if(stored&&legacy&&stored!==legacy)throw Error('account_mismatch');return stored||legacy;}
// 18.10.2026: cheia de citire și parola Radarului rămân în locul lor din pagină (radar_cheie / radar_parola, text); în cont merg împreună.
// Cheia urcă doar dacă Alerte a citit cu ea poza cu succes (radar_cheie_ok = primele 8 caractere): o cheie veche, respinsă, nu ajunge în cont.
const RADAR_KEY='tt_radar_access_v1';function radarLocal(){const k=localStorage.getItem('radar_cheie')||'',c=k&&localStorage.getItem('radar_cheie_ok')===k.slice(0,8)?k:'',p=localStorage.getItem('radar_parola')||'';return c||p?{cheie:c,parola:p}:undefined;}
async function value(key){if(key===RADAR_KEY)return radarLocal();if(EvidenceCloud.isBucket(key))return EvidenceStore.value(key);if(ForecastCloud.isBucket(key))return ForecastLocal.value(key);if(key===FillsCloud.KEY||FillsCloud.isKey(key))return FillsLocal.value(key);if(key==='tt_trade_plans_v1'){if(!PlanStore)throw Error('Modulul planurilor nu s-a încărcat. Reîncarcă aplicația înainte de sincronizare.');const record=await PlanStore.read();return record.raw===null?undefined:record.plans;}return key==='cloud_credentials'?(await window.T212Vault.read()||undefined):local(key);}
// 16.10.2026: limita workerului e pe minut și pe sesiune; la 429 așteptăm minutul următor (retryAfter din corp, CORS nu lasă antetul) de cel mult două ori.
async function api(path,method='GET',data,anonymous=false){for(let attempt=0;;attempt++){try{return await apiOnce(path,method,data,anonymous);}catch(e){if(e?.status!==429||attempt>=2||path==='auth'||path==='challenge')throw e;const wait=Number.isFinite(e.retryAfter)?e.retryAfter:60-new Date().getUTCSeconds();await new Promise(r=>setTimeout(r,Math.min(Math.max(wait,0),61)*1000+250));}}}
async function apiOnce(path,method='GET',data,anonymous=false){const c=new AbortController(),t=setTimeout(()=>c.abort(),20000);let httpStatus=null;try{const r=await fetch(endpoint+'/api/cloud/'+path,{method,cache:'no-store',credentials:'omit',redirect:'error',signal:c.signal,headers:{...(data?{'Content-Type':'application/json'}:{}),...(!anonymous&&session?{Authorization:'Bearer '+session.token}:{})},...(data?{body:JSON.stringify(data)}:{})});httpStatus=r.status;let b;try{b=await r.json();}catch{b={error:'cloud_unavailable'};}if(!r.ok){if(r.status===401&&path!=='auth'&&!anonymous){session=null;await Store.remove('session');}const e=Error(path==='status'&&r.status===404?'cloud_worker_missing':b.error||'cloud_unavailable');e.status=r.status;if(Number.isFinite(b?.retryAfter))e.retryAfter=b.retryAfter;throw e;}return b;}catch(e){let operation=path==='status'?'service':path==='session'||path==='auth'||path==='challenge'?'session':path==='record'?'write-record':path==='records'?'read-all':path.startsWith('records?index=')?'read-index':path.startsWith('records?key=')?'read-record':'sync';let key=null;try{key=path==='record'?data?.key:new URLSearchParams(path.split('?')[1]||'').get('key');}catch{}try{e.cloudRequest=true;}catch{}throw annotate(e,{operation,key,httpStatus});}finally{clearTimeout(t);}}
// 19.10.2026 (p.2): în trecerea automată (tolerant) o cheie a cărei citire e respinsă (400/413) nu oprește restul: se notează și e sărită, nu tratată ca absentă
const readFailures=new Map();
async function readRecords(tolerant=false){readFailures.clear();
 if(!boundedReads)return (await api('records')).records;
 if(recordCacheOwner!==session?.subject){recordCache.clear();recordCacheOwner=session?.subject;}
 const index=await api(fillsActive?'records?index=3':activeKeys.some(k=>ForecastCloud.isBucket(k))?'records?index=2':'records?index=1'),records={};
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
   let response;try{response=await api('records?key='+encodeURIComponent(key));}catch(e){if(tolerant&&e?.cloudRequest&&(e.status===400||e.status===413)){readFailures.set(key,e);continue;}throw e;}
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
async function apply(key,next,expected,locked=false){if(ForecastCloud.isBucket(key))return ForecastLocal.apply(key,next);if(FillsCloud.isKey(key)){if(next!=null)validateValue(key,next);return FillsLocal.apply(key,next,expected);}if(key===FillsCloud.KEY)FillsLocal.reset();if((key==='tt_europe_signals_v1'||EvidenceCloud.isKey(key))&&!locked&&navigator.locks?.request)return navigator.locks.request(EvidenceCloud.isKey(key)?EvidenceCloud.KEY:key,()=>apply(key,next,expected,true));if(EvidenceCloud.isKey(key))await EvidenceVault?.refresh?.();if(next!==undefined&&next!==null)validateValue(key,next);if(JSON.stringify(await value(key))!==JSON.stringify(expected))return false;if(key===RADAR_KEY){if(!next)return true;if(next.cheie)localStorage.setItem('radar_cheie_ok',next.cheie.slice(0,8));for(const [k,v] of [['radar_cheie',next.cheie],['radar_parola',next.parola]]){if(!v)continue;const old=localStorage.getItem(k);localStorage.setItem(k,v);notifyStorage(k,old,v);}return true;}if(EvidenceCloud.isBucket(key)){const store=EvidenceVault?.storage||localStorage,before=store.getItem(EvidenceCloud.KEY),saved=EvidenceStore.replace(key,expected,next);if(saved){await EvidenceVault?.flush?.();notifyStorage(EvidenceCloud.KEY,before,store.getItem(EvidenceCloud.KEY));}return saved;}if(key==='cloud_credentials'){if(next){await window.T212Vault.save(next);const broker=document.getElementById('brokerFrame');if(broker)broker.src='../broker/?app=decision-mobile-v2&cloud='+Date.now();}return true;}if(key==='tt_trading212_fills_v1'&&window.T212FillsStore){const saved=await window.T212FillsStore.replace(expected,next===null?undefined:next);FillsLocal.reset();if(saved)notifyStorage(key,JSON.stringify(expected)||null,JSON.stringify(next)||null);return saved;}if(key==='tt_trade_plans_v1'&&PlanStore){const saved=await PlanStore.replace(expected,next===null?undefined:next);if(saved)notifyStorage(key,JSON.stringify(expected)||null,JSON.stringify(next)||null);return saved;}if(key===EvidenceCloud.KEY&&EvidenceVault){const store=EvidenceVault.storage,old=store.getItem(key);if(next===undefined||next===null)store.removeItem(key);else store.setItem(key,JSON.stringify(next));await EvidenceVault.flush();notifyStorage(key,old,store.getItem(key));return true;}
 const oldValue=localStorage.getItem(key);if(next===undefined||next===null)localStorage.removeItem(key);else if(window.TTStorageWrite)window.TTStorageWrite.setItem(localStorage,key,rawKeys.includes(key)?String(next):JSON.stringify(next));else localStorage.setItem(key,rawKeys.includes(key)?String(next):JSON.stringify(next));notifyStorage(key,oldValue,localStorage.getItem(key));return true;}
// 19.10.2026 (I-706): copia locală dinaintea unei modificări venite din cont ține doar registrele scrise de om (jurnal, planuri, ipoteze, analize, setări)
// și se face cel mult o dată pe oră; execuțiile, portofoliul, numerarul și istoricul contului vin de la broker (se reunesc, nu se pierd) și nu intră în ea.
// Alegerea explicită dintr-un conflict face copia mereu, împreună cu registrul ales. Un registru care nu se poate citi lipsește din copie, nu o oprește.
const HUMAN_KEYS=['tt_journal_v1','tt_trade_plans_v1','tt_ticket_capital','tt_journal_settings_v1','tt_holdings_theses_v1','tt_holdings_symbols_v1','tt_holdings_benchmarks_v1','wl_stocks','tt_theme','tt_pf_account','tt_europe_risk_settings_v1',RADAR_KEY,EvidenceCloud.KEY];
const humanKey=k=>HUMAN_KEYS.includes(k)||EvidenceCloud.isBucket(k);
async function backup(extra=[],force=false){const list=await Store.get('backups:'+session.subject)||[];if(!force&&list[0]&&Date.now()-list[0].at<3600000)return;const want=[...new Set([...HUMAN_KEYS,...extra.map(k=>FillsCloud.isKey(k)?FillsCloud.KEY:k)])].filter(k=>LOCAL_KEYS.includes(k)),keys=[],snapshot={};for(const k of want){let v;try{v=await value(k);}catch{continue;}keys.push(k);if(v!==undefined)snapshot[k]=v;}list.unshift({at:Date.now(),keys,snapshot});await Store.put('backups:'+session.subject,list.slice(0,10));} /* 19.10.2026 (revizia lotului): un registru care nu s-a putut citi nu intră în listă ⇒ restaurarea nu-l mai șterge; 10 copii */
const quotaFull=e=>e?.name==='QuotaExceededError'||e?.code===22||e?.code===1014;
// 19.10.2026 (p.2): o cheie care pică singură (validare, record_too_large, JSON stricat, 4xx pe ea, spațiu plin) e sărită și raportată, celelalte merg;
// trecerea se oprește doar la ce ține de cont sau de rețea (sesiune, limită de cereri, serviciu indisponibil, revizie schimbată, fără răspuns).
const keyOnly=e=>quotaFull(e)||(e?.cloudRequest?e.status===400||e.status===413:!e?.status);
function skippedMessage(list){if(list.every(x=>quotaFull(x.e)))return 'Spațiul local al browserului este plin: '+(list.length===1?'1 registru nu a fost scris':list.length+' registre nu au fost scrise')+' pe acest dispozitiv; celelalte s-au sincronizat. Eliberează spațiu din Starea aplicației.';if(list.length===1)return list[0].e?.message||'client_error';return list.length+' registre nu s-au sincronizat ('+[...new Set(list.map(x=>x.e?.message||'client_error'))].slice(0,3).join('; ')+'); celelalte s-au sincronizat.';}
// I-706: amprenta locală a unei chei; aceeași amprentă ⇒ aceeași valoare locală ca la trecerea trecută (null ⇒ se recalculează mereu)
const ABSENT={};let evidenceMark=null;
async function stamp(key,marks){try{
 if(key==='cloud_credentials')return null;
 if(key===FillsCloud.KEY||FillsCloud.isKey(key))return await FillsLocal.stamp();
 if(EvidenceCloud.isBucket(key)){if(!marks.has('evidence')){const raw=(EvidenceVault?.storage||localStorage).getItem(EvidenceCloud.KEY);marks.set('evidence',evidenceMark&&evidenceMark.raw===raw?evidenceMark:(evidenceMark={raw}));}return marks.get('evidence');}
 if(ForecastCloud.isBucket(key))return 'f'+ForecastLocal.stamp()+'|'+ForecastCloud.cutoff();
 if(key===RADAR_KEY)return JSON.stringify(radarLocal()??null);
 if(key==='tt_trade_plans_v1')return PlanStore?(await PlanStore.read()).raw??ABSENT:null;
 return localStorage.getItem(key)??ABSENT;
}catch{return null;}}
const utf8=t=>{let n=0;for(let i=0;i<t.length;i++){const c=t.charCodeAt(i);n+=c<128?1:c<2048?2:c>=0xd800&&c<0xdc00?(i++,4):3;}return n;};
async function performSync(){if(!ready||!session||busy||checking||navigator.onLine===false)return;busy=true;error='';failure=null;skippedKeys=[];let currentKey=null;broadcast();try{
 // Registrul analizelor din IndexedDB trebuie încărcat înainte de citire: un registru încă necitit nu e un registru gol.
 await EvidenceVault?.ready?.();
 backupPaused=await Store.get('backup-pause')===true;if(backupPaused)return;
 const owner=await deviceOwner();if(owner&&owner!==session.subject)throw Error('account_mismatch');await Store.put('owner',session.subject);
 const pass=async()=>{
 FillsLocal.reset();const remote=await readRecords(true),marks=new Map(),skipped=[];let backedUp=false;
 for(const key of activeKeys){
  currentKey=key;try{
  if(readFailures.has(key))throw readFailures.get(key);
  if(conflicts[key]&&key!=='cloud_credentials')continue;
  const record=remote[key],base=baseline[key],rev=record?.revision||0,mark=await stamp(key,marks),prev=seen.get(key);
  // I-706: neschimbată aici de la ultima trecere reușită și cu aceeași revizie în cont ⇒ nimic de unit (fără citire, unire sau comparații)
  if(mark!==null&&prev&&prev.mark===mark&&prev.revision===rev&&prev.updated===(record?.updated??null)&&(base?.revision||0)===rev)continue;
  seen.delete(key);
  // I-697: cu pachetele active, cheia veche doar se citește (o mai scriu aplicațiile de dinainte de pachete) și nu se mai scrie; nimic nu se pierde
  if(key===FillsCloud.KEY&&fillsActive){
   if(record&&record.value!=null&&rev!==(base?.revision||0)){const current=await value(key),result=mergeRecord(key,base?.value,current,record.value);sizes[key]=utf8(JSON.stringify(record.value));
    if(result.conflicts.length){conflicts[key]={paths:result.conflicts,remote:record,local:current};continue;}
    if(result.value!==undefined&&JSON.stringify(result.value)!==JSON.stringify(current)&&!await apply(key,result.value,current))continue;}
   baseline[key]=record||base||{value:undefined,revision:0};continue;
  }
  const current=await value(key);if(key==='cloud_credentials')connectionState(current,record);if(conflicts[key])continue;
  // Forgetting a local connection is not an instruction to erase the cloud key.
  if(key==='cloud_credentials'&&current===undefined&&base?.value){continue;}
  if(key==='cloud_credentials'&&record?.value===null){baseline[key]=record;continue;}
  const remoteValue=record?.value===null?undefined:record?.value;
  const result=mergeRecord(key,base?.value,current,remoteValue,{localAt:writtenAt(key),remoteAt:(Number(record?.updated)||0)*1000});
  if(result.conflicts.length){conflicts[key]={paths:result.conflicts,remote:record,local:current};continue;}
  const next=result.value,text=JSON.stringify(next);if(key!=='cloud_credentials')sizes[key]=next===undefined?0:utf8(text);
  if(text!==JSON.stringify(remoteValue)){
   if(next!==undefined)validateValue(key,next);
   const saved=await api('record','PUT',{key,value:next===undefined?null:next,revision:record?.revision||0});remote[key]={...saved,value:next};
  }
  const changed=text!==JSON.stringify(current);
  if(changed){
   if(!backedUp&&humanKey(key)){await backup([],true);backedUp=true;} // 19.10.2026: copie MEREU înaintea unei schimbări venite din cont la jurnal/planuri/teze (nu cel mult o dată pe oră)
   // A concurrent local edit still descends from the snapshot read above,
   // not from the merged cloud value that this device has not accepted.
   if(!await apply(key,next,current)){baseline[key]={...(remote[key]||{revision:0}),value:current};continue;}
  }
  baseline[key]=remote[key]||{value:undefined,revision:0};if(key==='cloud_credentials')connectionState(await value(key),remote[key]);
  // amprenta e luată înaintea aplicării: după o scriere locală, cheia se mai verifică o dată la trecerea următoare
  if(mark!==null&&!changed)seen.set(key,{mark,revision:remote[key]?.revision||0,updated:remote[key]?.updated??null});
  }catch(e){if(!keyOnly(e))throw e;seen.delete(key);skipped.push({key,e});}
 }
 // Ownership is durable before any upload; the legacy mirror may be full.
 try{localStorage.setItem('tt_cloud_owner',session.subject);}catch{}await Store.put('baseline:'+session.subject,baseline);
 skippedKeys=skipped.map(({key,e})=>({key,code:failed(e,{operation:'sync',key})?.code||'client_error'}));
 if(skipped.length){currentKey=skipped[0].key;error=skippedMessage(skipped);failure=failed(skipped[0].e,{operation:'sync',key:currentKey});}else lastSync=Date.now();
 };
 // I-706: o revizie schimbată de celălalt aparat chiar în timpul trecerii (409) ⇒ o reîncercare imediată, abia apoi eroarea
 for(let attempt=0;;attempt++){try{await pass();break;}catch(e){if(e?.status!==409||attempt>0)throw e;}}
 }catch(e){error=e.status===409?'Datele au fost modificate pe celălalt dispozitiv. Reconcilierea se reia la următoarea sincronizare.':e.message;failure=failed(e,{operation:'sync',key:currentKey});}finally{busy=false;broadcast();}}
async function sync(){if(navigator.locks)return navigator.locks.request('tt-cloud-sync',{ifAvailable:true},lock=>lock?performSync():undefined);return performSync();}
async function login(credential,nonce){if(!ready)throw Error('cloud_not_configured');const owner=await deviceOwner();const result=await api('auth','POST',{credential,nonce});if(owner&&owner!==result.subject){session={...result};await api('session','DELETE');session=null;throw Error('account_mismatch');}session=result;await Store.put('session',session);baseline=await Store.get('baseline:'+session.subject)||{};conflicts={};await sync();broadcast();}
async function logout(){if(session){try{await api('session','DELETE');}catch(_){}}session=null;conflicts={};trading212=emptyConnection();await Store.remove('session');error='';broadcast();}
async function resolve(key,choice){if(!conflicts[key]||!['local','remote'].includes(choice))return;const current=await value(key),records=await readRecords(),r=records[key];if(JSON.stringify(r)!==JSON.stringify(conflicts[key].remote)){conflicts[key]={...conflicts[key],remote:r};error='Datele cloud s-au schimbat. Verifică din nou alegerea.';broadcast();return;}await backup([key],true);if(EvidenceCloud.isBucket(key)){const next=EvidenceCloud.resolve(key,baseline[key]?.value,current,r?.value,choice).value;let saved=r;if(JSON.stringify(next)!==JSON.stringify(r?.value)){saved={...await api('record','PUT',{key,value:next===undefined?null:next,revision:r?.revision||0}),value:next};}if(!await apply(key,next,current))throw Error('Datele locale s-au modificat. Reîncearcă.');baseline[key]=saved||{revision:0};}else if(choice==='remote'){if(!await apply(key,r?.value===null?undefined:r?.value,current))throw Error('Datele locale s-au modificat. Reîncearcă.');baseline[key]=r||{revision:0};}else{const saved=await api('record','PUT',{key,value:current===undefined?null:current,revision:r?.revision||0});baseline[key]={...saved,value:current};}delete conflicts[key];await Store.put('baseline:'+session.subject,baseline);error='';broadcast();await sync();}
async function deleteCredentials(){if(!session)throw Error('session_required');const r=(await readRecords()).cloud_credentials;await api('record','PUT',{key:'cloud_credentials',value:null,revision:r?.revision||0});await window.T212Vault.clear();baseline.cloud_credentials={value:undefined};delete conflicts.cloud_credentials;await Store.put('baseline:'+session.subject,baseline);const broker=document.getElementById('brokerFrame');if(broker)broker.src='../broker/?app=decision-mobile-v2&cloud-clear='+Date.now();await sync();}
async function credentialSession(){if(!session)throw Error('session_required');if(!ready)throw Error('cloud_not_configured');const owner=await deviceOwner();if(owner&&owner!==session.subject)throw Error('account_mismatch');await Store.put('owner',session.subject);trading212.message='';}
async function publishCredentials(){await credentialSession();const v=await window.T212Vault.read();if(!v)throw Error('Conectează întâi Trading 212 pe acest dispozitiv.');validateValue('cloud_credentials',v);const r=(await readRecords()).cloud_credentials;await api('record','PUT',{key:'cloud_credentials',value:v,revision:r?.revision||0});const verified=(await readRecords()).cloud_credentials;connectionState(await window.T212Vault.read(),verified);if(!sameConnection(v,verified?.value))throw Error('cloud_credentials_changed');baseline.cloud_credentials=verified;delete conflicts.cloud_credentials;await Store.put('baseline:'+session.subject,baseline);trading212.message='Conexiune Trading 212 salvată în cloud și verificată. Pe celălalt dispozitiv, folosește același cont Google și apasă „Preia conexiunea din cloud”.';}
async function restoreCredentials(){await credentialSession();const record=(await readRecords()).cloud_credentials,current=await value('cloud_credentials');connectionState(current,record);if(!record?.value)throw Error('cloud_credentials_missing');validateValue('cloud_credentials',record.value);if(!await apply('cloud_credentials',record.value,current))throw Error('Datele locale s-au modificat. Reîncearcă.');const saved=await window.T212Vault.read();connectionState(saved,record);if(!sameConnection(saved,record.value))throw Error('Conexiunea Trading 212 nu a putut fi verificată pe acest dispozitiv.');baseline.cloud_credentials=record;delete conflicts.cloud_credentials;await Store.put('baseline:'+session.subject,baseline);trading212.message='Conexiune Trading 212 preluată din cloud și salvată pe acest dispozitiv. Reconectarea brokerului a pornit automat.';}
async function restore(){if(!session)return;const list=await Store.get('backups:'+session.subject)||[];if(!list.length)throw Error('Nu există o copie locală de restaurat.');const saved=list[0];for(const k of saved.keys||LOCAL_KEYS)if(LOCAL_KEYS.includes(k))await apply(k,saved.snapshot[k],await value(k));error='Copie locală restaurată. Următoarea sincronizare va verifica diferențele.';broadcast();}
function conflictView(key){const c=conflicts[key];if(!c)return null;const preview=v=>v===undefined?'Fără înregistrare':JSON.stringify(v,null,2).slice(0,4000);return key==='cloud_credentials'?{local:'Conexiune Trading 212 locală · '+(c.local?.environment||'absentă'),remote:'Conexiune Trading 212 cloud · '+(c.remote?.value?.environment||'absentă')}:{local:preview(c.local),remote:preview(c.remote?.value)};}
async function mutation(fn){if(busy||checking)throw Error('Sincronizare în curs. Așteaptă finalizarea înainte de această acțiune.');busy=true;seen.clear();error='';failure=null;broadcast();try{return await fn();}catch(e){error=e.message;failure=failed(e);throw e;}finally{busy=false;broadcast();}}
const wrapped={};for(const [name,fn] of Object.entries({login,logout,resolve,deleteCredentials,publishCredentials,restoreCredentials,restore})){wrapped[name]=async(...args)=>{await mutation(()=>fn(...args));if(!['logout','restore'].includes(name))await sync();};}
async function pauseForBackup(){return mutation(async()=>{await Store.put('backup-pause',true);backupPaused=true;clearTimeout(timer);const broker=document.getElementById('brokerFrame');if(broker){brokerBeforeBackup=broker.src;broker.src='about:blank';}});}
async function resumeAfterBackup(){await mutation(async()=>{await Store.remove('backup-pause');backupPaused=false;const broker=document.getElementById('brokerFrame');if(broker){if(brokerBeforeBackup&&brokerBeforeBackup!=='about:blank')broker.src=brokerBeforeBackup;else window.ttStartBroker?.();brokerBeforeBackup=null;} /* 19.10.2026: fără adresă ținută minte (brokerul pornește acum după primul ecran) ⇒ îl pornește carcasa */});await sync();}
window.TTCloud={forecastLocal:{value:k=>ForecastLocal.value(k),apply:(k,v)=>ForecastLocal.apply(k,v),reset:()=>ForecastLocal.reset(),bucket:ForecastCloud.bucket,keys:ForecastCloud.keys},push:()=>api('push'),subscribePush:subscription=>api('push','PUT',{subscription}),removePush:id=>api('push','DELETE',{id}),testPush:id=>api('push/test','POST',{id}),audit:()=>api('audit'),anchorAudit:entries=>api('audit','POST',{entries}),pauseForBackup,resumeAfterBackup,monitor:()=>api('monitor'),configureMonitor:enabled=>api('monitor','PUT',{enabled}),runMonitor:()=>api('monitor/check','POST',{}),conflictView,state,sync,recheck,login,logout,resolve,deleteCredentials,publishCredentials,restoreCredentials,restore,challenge:()=>api('challenge','POST',{}),config:()=>({endpoint}),...wrapped};
// 19.10.2026: ora ultimei scrieri pe acest aparat a cheilor de capital (LAST_WRITE_WINS) — la două scrieri diferite câștigă cea mai nouă.
const WRITTEN_KEY='tt_cloud_ultima_scriere_v1';
function writtenAt(key){try{return Number(JSON.parse(localStorage.getItem(WRITTEN_KEY)||'{}')[key])||0;}catch{return 0;}}
function markWritten(key){try{const m=JSON.parse(localStorage.getItem(WRITTEN_KEY)||'{}');m[key]=Date.now();localStorage.setItem(WRITTEN_KEY,JSON.stringify(m));}catch{}}
window.addEventListener('storage',e=>{if(LAST_WRITE_WINS.includes(e.key))markWritten(e.key);if(KEYS.includes(e.key)&&!busy){clearTimeout(timer);timer=setTimeout(sync,2500);}});
function plansChanged(){if(!busy){clearTimeout(timer);timer=setTimeout(sync,2500);}}
window.addEventListener('tt-plan-store-changed',plansChanged);PlanStore?.subscribe(plansChanged);
window.addEventListener('online',()=>ready?sync():recheck());document.addEventListener('visibilitychange',()=>{if(!document.hidden)(ready?sync():recheck());});
// 19.10.2026 (I-706): configurația se cere cu termen; fără răspuns în 10 s verificarea se încheie cu eroare, iar „Reverifică serviciul” rămâne disponibil
async function config(){const c=new AbortController(),t=setTimeout(()=>c.abort(),10000);try{return await fetch('cloud-sync-config.json',{cache:'no-store',signal:c.signal}).then(r=>r.json());}catch(e){if(c.signal.aborted){const x=Error('Configurația sincronizării nu a răspuns în 10 s. Verifică internetul și apasă „Reverifică serviciul”.');x.name='TimeoutError';throw x;}throw e;}finally{clearTimeout(t);}}
async function initialize(){let available=false;checking=true;error='';failure=null;setup=null;activeKeys=[];boundedReads=false;fillsActive=false;seen.clear();broadcast();try{
 const cfg=await config();if(cfg.enabled!==true&&cfg.autoActivate!==true)throw Error('cloud_not_configured');
 const u=new URL(cfg.endpoint);if(u.origin!=='https://premarket-scanner-html.mferent80.workers.dev'||u.pathname!=='/'||u.search||u.hash||u.username||u.password)throw Error('Endpoint cloud incompatibil.');endpoint=u.origin;
 // Readiness is public: no session, journal or broker credentials accompany this request.
 const status=await api('status','GET',undefined,true);monitorCapability=status.monitor||null;pushCapability=status.push||null;auditCapability=status.audit||null;if(status.protocol!=='tt-cloud-sync-v1')throw Error('cloud_protocol_mismatch');
 boundedReads=status.records?.protocol==='tt-cloud-records-v2'&&status.records.maxKeys===1;
 setup=Object.fromEntries(['database','google','encryption','schema'].map(k=>[k,status.checks?.[k]===true]));
 if(status.enabled!==true||Object.values(setup).some(v=>!v))throw Error('cloud_not_configured');if(!/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(status.clientId||''))throw Error('cloud_not_configured');
 const evidenceReady=Array.isArray(status.supportedKeys)&&EvidenceCloud.keys.every(k=>status.supportedKeys.includes(k)),forecastReady=!!globalThis.indexedDB&&Array.isArray(status.supportedKeys)&&ForecastCloud.keys.every(k=>status.supportedKeys.includes(k));
 // I-697: pachetele execuțiilor doar cu un server care le acceptă și citiri pe cheie (index=3); altfel cheia veche, ca înainte
 fillsActive=boundedReads&&Array.isArray(status.supportedKeys)&&FillsCloud.keys.every(k=>status.supportedKeys.includes(k));activeKeys=KEYS.filter(k=>k!==EvidenceCloud.KEY&&(!EvidenceCloud.isBucket(k)||evidenceReady)&&(!ForecastCloud.isBucket(k)||forecastReady)&&(!FillsCloud.isKey(k)||fillsActive)&&(!EUROPE_KEYS.includes(k)||status.supportedKeys?.includes(k))&&(!PERFORMANCE_KEYS.includes(k)||status.supportedKeys?.includes(k)));
 ready=true;available=true;window.TTCloud.clientId=status.clientId;
 if(poll===null)poll=setInterval(()=>{if(!document.hidden)sync();},30000);
 backupPaused=await Store.get('backup-pause')===true;if(backupPaused){const broker=document.getElementById('brokerFrame');if(broker){if(broker.src&&broker.src!=='about:blank')brokerBeforeBackup=broker.src;broker.src='about:blank';}}
 session=await Store.get('session');if(session){const verified=await api('session');if(verified.subject!==session.subject){session=null;await Store.remove('session');throw Error('session_expired');}baseline=await Store.get('baseline:'+session.subject)||{};}
 }catch(e){ready=available;error=e.message;failure=failed(e);}finally{checking=false;broadcast();}if(ready&&session&&!error)await sync();}
function recheck(){if(busy)return Promise.resolve();if(initialization)return initialization;initialization=initialize().finally(()=>{initialization=null;});return initialization;}
recheck();

