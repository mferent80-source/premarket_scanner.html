import {KEYS,mergeRecord,validateValue} from '../lib/cloud-sync-model.mjs?v=audit-20261003';
const Store=window.TTCloudStore,LOCAL_KEYS=KEYS.filter(k=>k!=='cloud_credentials'),rawKeys=['tt_theme','tt_pf_account','tt_ticket_capital'];
let endpoint='',ready=false,session=null,busy=false,baseline={},conflicts={},lastSync=null,error='',timer=null;
const state=()=>({ready,connected:!!session,email:session?.email||null,busy,lastSync,error,conflicts:Object.keys(conflicts)});
function broadcast(){window.dispatchEvent(new CustomEvent('tt-cloud-state',{detail:state()}));document.querySelectorAll('iframe').forEach(f=>f.contentWindow?.postMessage({ttCloudState:state()},location.origin));}
function local(key){const raw=localStorage.getItem(key);if(raw===null)return undefined;if(rawKeys.includes(key))return raw;try{return JSON.parse(raw);}catch(_){throw Error('Date locale incompatibile: '+key);}}
async function value(key){return key==='cloud_credentials'?(await window.T212Vault.read()||undefined):local(key);}
async function api(path,method='GET',data){const c=new AbortController(),t=setTimeout(()=>c.abort(),20000);try{const r=await fetch(endpoint+'/api/cloud/'+path,{method,cache:'no-store',credentials:'omit',redirect:'error',signal:c.signal,headers:{...(data?{'Content-Type':'application/json'}:{}),...(session?{Authorization:'Bearer '+session.token}:{})},...(data?{body:JSON.stringify(data)}:{})});const b=await r.json();if(!r.ok){if(r.status===401&&path!=='auth'){session=null;await Store.remove('session');}const e=Error(b.error||'cloud_unavailable');e.status=r.status;throw e;}return b;}finally{clearTimeout(t);}}
function notifyStorage(key,oldValue,newValue){document.querySelectorAll('iframe').forEach(f=>{try{f.contentWindow.dispatchEvent(new StorageEvent('storage',{key,oldValue,newValue,url:location.href,storageArea:localStorage}));}catch(_){}});window.dispatchEvent(new StorageEvent('storage',{key,oldValue,newValue,url:location.href,storageArea:localStorage}));}
async function apply(key,next,expected){if(JSON.stringify(await value(key))!==JSON.stringify(expected))return false;if(key==='cloud_credentials'){if(next){await window.T212Vault.save(next);const broker=document.getElementById('brokerFrame');if(broker)broker.src='../broker/?app=decision-mobile-v2&cloud='+Date.now();}return true;}const oldValue=localStorage.getItem(key);if(next===undefined||next===null)localStorage.removeItem(key);else localStorage.setItem(key,rawKeys.includes(key)?String(next):JSON.stringify(next));notifyStorage(key,oldValue,localStorage.getItem(key));return true;}
async function backup(){const list=await Store.get('backups:'+session.subject)||[],snapshot={};for(const k of LOCAL_KEYS){const v=local(k);if(v!==undefined)snapshot[k]=v;}list.unshift({at:Date.now(),snapshot});await Store.put('backups:'+session.subject,list.slice(0,5));}
async function performSync(){if(!ready||!session||busy||navigator.onLine===false)return;busy=true;error='';broadcast();try{
 const owner=localStorage.getItem('tt_cloud_owner');if(owner&&owner!==session.subject)throw Error('account_mismatch');
 const remote=(await api('records')).records;let backedUp=false;
 for(const key of KEYS){
  if(conflicts[key])continue;const current=await value(key),record=remote[key],base=baseline[key];
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
   if(!backedUp&&key!=='cloud_credentials'){await backup();backedUp=true;}
   if(!await apply(key,next,current)){baseline[key]=remote[key]||{value:undefined,revision:0};continue;}
  }
  baseline[key]=remote[key]||{value:undefined,revision:0};
 }
 localStorage.setItem('tt_cloud_owner',session.subject);await Store.put('baseline:'+session.subject,baseline);lastSync=Date.now();
 }catch(e){error=e.status===409?'Datele au fost modificate pe celălalt dispozitiv. Reconcilierea se reia la următoarea sincronizare.':e.message;}finally{busy=false;broadcast();}}
async function sync(){if(navigator.locks)return navigator.locks.request('tt-cloud-sync',{ifAvailable:true},lock=>lock?performSync():undefined);return performSync();}
async function login(credential,nonce){if(!ready)throw Error('cloud_not_configured');const result=await api('auth','POST',{credential,nonce});const owner=localStorage.getItem('tt_cloud_owner');if(owner&&owner!==result.subject){session={...result};await api('session','DELETE');session=null;throw Error('account_mismatch');}session=result;await Store.put('session',session);baseline=await Store.get('baseline:'+session.subject)||{};conflicts={};await sync();broadcast();}
async function logout(){if(session){try{await api('session','DELETE');}catch(_){}}session=null;conflicts={};await Store.remove('session');error='';broadcast();}
async function resolve(key,choice){if(!conflicts[key]||!['local','remote'].includes(choice))return;const current=await value(key),records=(await api('records')).records,r=records[key];if(JSON.stringify(r)!==JSON.stringify(conflicts[key].remote)){conflicts[key]={...conflicts[key],remote:r};error='Datele cloud s-au schimbat. Verifică din nou alegerea.';broadcast();return;}await backup();if(choice==='remote'){if(!await apply(key,r?.value===null?undefined:r?.value,current))throw Error('Datele locale s-au modificat. Reîncearcă.');baseline[key]=r||{revision:0};}else{const saved=await api('record','PUT',{key,value:current===undefined?null:current,revision:r?.revision||0});baseline[key]={...saved,value:current};}delete conflicts[key];await Store.put('baseline:'+session.subject,baseline);error='';broadcast();await sync();}
async function deleteCredentials(){if(!session)throw Error('session_required');const r=(await api('records')).records.cloud_credentials;await api('record','PUT',{key:'cloud_credentials',value:null,revision:r?.revision||0});await window.T212Vault.clear();baseline.cloud_credentials={value:undefined};delete conflicts.cloud_credentials;await Store.put('baseline:'+session.subject,baseline);const broker=document.getElementById('brokerFrame');if(broker)broker.src='../broker/?app=decision-mobile-v2&cloud-clear='+Date.now();await sync();}
async function publishCredentials(){if(!session)throw Error('session_required');const v=await window.T212Vault.read();if(!v)throw Error('Conectează întâi Trading 212 pe acest dispozitiv.');const r=(await api('records')).records.cloud_credentials;const saved=await api('record','PUT',{key:'cloud_credentials',value:v,revision:r?.revision||0});baseline.cloud_credentials={...saved,value:v};delete conflicts.cloud_credentials;await Store.put('baseline:'+session.subject,baseline);await sync();}
async function restore(){if(!session)return;const list=await Store.get('backups:'+session.subject)||[];if(!list.length)throw Error('Nu există o copie locală de restaurat.');const saved=list[0];for(const k of LOCAL_KEYS)await apply(k,saved.snapshot[k],local(k));error='Copie locală restaurată. Următoarea sincronizare va verifica diferențele.';broadcast();}
function conflictView(key){const c=conflicts[key];if(!c)return null;const preview=v=>v===undefined?'Fără înregistrare':JSON.stringify(v,null,2).slice(0,4000);return key==='cloud_credentials'?{local:'Conexiune Trading 212 locală · '+(c.local?.environment||'absentă'),remote:'Conexiune Trading 212 cloud · '+(c.remote?.value?.environment||'absentă')}:{local:preview(c.local),remote:preview(c.remote?.value)};}
async function mutation(fn){if(busy)throw Error('Sincronizare în curs. Așteaptă finalizarea înainte de această acțiune.');busy=true;broadcast();try{return await fn();}finally{busy=false;broadcast();}}
const wrapped={};for(const [name,fn] of Object.entries({login,logout,resolve,deleteCredentials,publishCredentials,restore})){wrapped[name]=async(...args)=>{await mutation(()=>fn(...args));if(!['logout','restore'].includes(name))await sync();};}
window.TTCloud={conflictView,state,sync,login,logout,resolve,deleteCredentials,publishCredentials,restore,challenge:()=>api('challenge','POST',{}),config:()=>({endpoint}),...wrapped};
window.addEventListener('storage',e=>{if(KEYS.includes(e.key)&&!busy){clearTimeout(timer);timer=setTimeout(sync,2500);}});
window.addEventListener('online',sync);document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
(async()=>{try{const cfg=await fetch('cloud-sync-config.json',{cache:'no-store'}).then(r=>r.json());if(!cfg.enabled){error='cloud_not_configured';broadcast();return;}const u=new URL(cfg.endpoint);if(u.origin!=='https://premarket-scanner-html.mferent80.workers.dev'||u.pathname!=='/'||u.search||u.hash)throw Error('Endpoint cloud incompatibil.');endpoint=u.origin;const status=await api('status');if(!status.enabled)throw Error('cloud_not_configured');ready=true;window.TTCloud.clientId=status.clientId;session=await Store.get('session');if(session){await api('session');baseline=await Store.get('baseline:'+session.subject)||{};await sync();}broadcast();setInterval(()=>{if(!document.hidden)sync();},30000);}catch(e){error=e.message;broadcast();}})();
