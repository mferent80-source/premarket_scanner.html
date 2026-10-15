/* Persistence of calculated reports is separate from model validity and ledgers. */
(function(g){
'use strict';
function warning(error){
 const full=error?.name==='QuotaExceededError'||error?.code===22||error?.code===1014;
 return 'Raport calculat și verificat, disponibil doar în această sesiune. '+(full?'Spațiul local al browserului este plin.':'Browserul a refuzat salvarea permanentă.')+' Descarcă raportul pentru păstrare.';
}
/* Only transaction completion confirms a durable write, never request success. */
function indexedStore(factory,timeoutMs=4000){
 if(!factory?.open)return null;
 let connection=null,opening=null;
 function open(){
  if(connection)return Promise.resolve(connection);if(opening)return opening;
  opening=new Promise((resolve,reject)=>{
   let request,settled=false;
   const finish=(error,db)=>{if(settled){db?.close();return;}settled=true;clearTimeout(timer);if(error){opening=null;reject(error);}else{connection=db;db.onversionchange=()=>{db.close();connection=null;opening=null;};resolve(db);}};
   const timer=setTimeout(()=>finish(Error('Salvarea rapoartelor a expirat.')),timeoutMs);
   try{request=factory.open('tt_holdings_ai_reports_v1',1);
    request.onupgradeneeded=()=>{try{if(!request.result.objectStoreNames.contains('reports'))request.result.createObjectStore('reports');}catch(error){request.transaction?.abort();finish(error);}};
    request.onsuccess=()=>finish(null,request.result);
    request.onerror=()=>finish(request.error||Error('Salvarea rapoartelor nu este disponibilă.'));
    request.onblocked=()=>finish(Error('Salvarea rapoartelor este blocată.'));
   }catch(error){finish(error);}
  });const pending=opening;pending.catch(()=>{if(opening===pending)opening=null;});return pending;
 }
 async function operate(mode,key,json){
  const db=await open();return new Promise((resolve,reject)=>{
   let tx,value=null,settled=false;
   const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
   const timer=setTimeout(()=>{finish(Error('Salvarea rapoartelor a expirat.'));try{tx?.abort();}catch{}},timeoutMs);
   try{tx=db.transaction('reports',mode);const store=tx.objectStore('reports');
    tx.oncomplete=()=>finish();tx.onabort=()=>finish(tx.error||Error('Salvarea rapoartelor a fost anulată.'));tx.onerror=()=>finish(tx.error||Error('Salvarea rapoartelor a eșuat.'));
    const request=store.get(key);request.onsuccess=()=>{
     if(mode==='readonly'){value=request.result||null;return;}
     /* A delayed older tab cannot replace a more recent report. */
     try{const old=JSON.parse(request.result||'null'),next=JSON.parse(json);if(Number.isFinite(old?.trainedAt)&&Number.isFinite(next?.trainedAt)&&old.trainedAt>next.trainedAt){value=false;return;}}catch{}
     try{store.put(json,key);value=true;}catch(error){finish(error);try{tx.abort();}catch{}}
    };
   }catch(error){finish(error);try{tx?.abort();}catch{}}
  });
 }
 return {get:key=>operate('readonly',key),set:(key,json)=>operate('readwrite',key,json)};
}
let shared;
function defaultStore(){if(shared===undefined)try{shared=indexedStore(g.indexedDB);}catch{shared=null;}return shared;}
function create(storage,{durable=defaultStore(),onChange=()=>{}}={}){
 const demo=new Map(),temporary=new Map(),warnings=new Map(),captures=new Set(),backups=new Map(),loads=new Map(),writes=new Map(),versions=new Map();
 const changed=()=>{try{onChange();}catch{}};
 function raw(key,synthetic){
  if(synthetic)return {json:demo.get(key),state:'demo'};
  if(temporary.has(key)){const json=temporary.get(key);return {json,state:JSON.parse(json).retention};}
  let local;try{local=storage.getItem(key);}catch(error){if(!backups.has(key))throw error;}
  const backup=backups.get(key);let useBackup=!!backup&&!local;
  if(backup&&local)try{const a=JSON.parse(local),b=JSON.parse(backup);useBackup=Number.isFinite(b.trainedAt)&&(!Number.isFinite(a?.trainedAt)||b.trainedAt>=a.trainedAt);}catch{useBackup=true;}
  return {json:useBackup?backup:local,state:useBackup?'indexeddb':'local'};
 }
 function read(key,synthetic){const {json}=raw(key,synthetic);return json?JSON.parse(json):null;}
 function restore(key,synthetic){
  if(synthetic||!durable)return Promise.resolve();if(loads.has(key))return loads.get(key);
  const version=versions.get(key)||0;
  const promise=Promise.resolve().then(()=>durable.get(key)).then(json=>{
   if((versions.get(key)||0)!==version)return;
   if(!json)return migrate(key,version);
   const record=JSON.parse(json);if(!record||typeof record!=='object'||Array.isArray(record))return;
   backups.set(key,JSON.stringify({...record,retention:'indexeddb'}));changed();
  }).catch(()=>{});
  loads.set(key,promise);return promise;
 }
 /* 15.10.2026: spațiul local e comun cu toate aplicațiile de pe origine; un raport vechi trece în IndexedDB și eliberează locul. */
 function migrate(key,version){
  let local;try{local=storage.getItem(key);}catch{return;}if(!local)return;
  let record;try{record=JSON.parse(local);}catch{return;}if(!record||typeof record!=='object'||Array.isArray(record))return;
  const permanent=JSON.stringify({...record,retention:'indexeddb'});
  return Promise.resolve().then(()=>durable.set(key,permanent)).then(saved=>{
   if(saved===false||(versions.get(key)||0)!==version)return;
   backups.set(key,permanent);try{if(storage.getItem(key)===local)storage.removeItem?.(key);}catch{}changed();
  }).catch(()=>{});
 }
 function save(key,record,synthetic){
  const next={...record,retention:synthetic?'demo':'local'},json=JSON.stringify(next);
  if(synthetic){demo.set(key,json);return 'demo';}
  const version=(versions.get(key)||0)+1;versions.set(key,version);captures.delete(key);
  /* Queue overlapping saves so an older write cannot finish after a newer one. */
  let error;
  if(!durable)try{storage.setItem(key,json);temporary.delete(key);warnings.delete(key);backups.delete(key);return 'local';}catch(e){error=e;}
  next.retention=durable?'pending':'session';temporary.set(key,JSON.stringify(next));warnings.set(key,durable?'Raport calculat și verificat. Salvarea de rezervă este în curs; păstrează pagina deschisă până la confirmare.':warning(error));
  if(!durable)return 'session';
  const permanent=JSON.stringify({...next,retention:'indexeddb'});
  const pending=(writes.get(key)||Promise.resolve()).catch(()=>{}).then(()=>durable.set(key,permanent)).then(saved=>{
   if(saved===false)throw Error('Un raport mai recent este deja păstrat.');
   if(versions.get(key)!==version)return;
   backups.set(key,permanent);temporary.delete(key);warnings.delete(key);try{storage.removeItem?.(key);}catch{}changed();
  }).catch(()=>{
   if(versions.get(key)!==version)return;
   try{storage.setItem(key,json);temporary.delete(key);warnings.delete(key);backups.delete(key);changed();return;}catch(e){error=e;}
   temporary.set(key,JSON.stringify({...next,retention:'session'}));warnings.set(key,warning(error));changed();
  });
  writes.set(key,pending);pending.then(()=>{if(writes.get(key)===pending)writes.delete(key);});return 'pending';
 }
 function inspect(key,synthetic,usable){
  let state=synthetic?'demo':'local';try{state=raw(key,synthetic).state;}catch{}
  let message=usable&&!synthetic?warnings.get(key)||null:null;
  if(usable&&state==='indexeddb')message='Raport calculat și verificat, păstrat în browser pentru recuperare după reîncărcare. Reutilizarea cere aceleași date și maximum 30 de minute.';
  if(usable&&!synthetic&&captures.has(key))message=(message||'Raport calculat și verificat.')+' Registrul estimărilor nu a putut fi actualizat.';
  return {state,message};
 }
 function captureFailed(key,synthetic){if(!synthetic)captures.add(key);}
 return {read,save,restore,settled:key=>writes.get(key)||Promise.resolve(),inspect,captureFailed};
}
/* 15.10.2026: rapoartele vechi din spațiul local (comun cu toate aplicațiile de pe origine) trec toate în IndexedDB la pornirea
   aplicației, nu doar când e deschis tickerul — altfel registrele sincronizate nu mai încap. Copia locală se șterge doar după confirmare. */
const REPORT_KEY=/^tt_holdings_(garch|hmm|isolation|knn|neural|quantile)_v1:/;
async function migrateAll(storage=g.localStorage,durable=defaultStore()){
 const result={moved:0,chars:0,failed:0};if(!storage||!durable)return result;
 const keys=[];try{for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k&&REPORT_KEY.test(k))keys.push(k);}}catch{return result;}
 for(const key of keys){
  let local;try{local=storage.getItem(key);}catch{continue;}if(!local)continue;
  let record;try{record=JSON.parse(local);}catch{result.failed++;continue;}
  if(!record||typeof record!=='object'||Array.isArray(record)){result.failed++;continue;}
  try{
   await durable.set(key,JSON.stringify({...record,retention:'indexeddb'}));/* false = IndexedDB are deja unul mai nou */
   if(storage.getItem(key)===local){storage.removeItem(key);result.moved++;result.chars+=key.length+local.length;}
  }catch{result.failed++;}
 }
 return result;
}
g.HoldingsModelStorage={create,indexedStore,migrateAll};
if(typeof module!=='undefined'&&module.exports)module.exports=g.HoldingsModelStorage;
})(typeof window!=='undefined'?window:globalThis);
