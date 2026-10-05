/* Durable forecast history. Legacy copies are read and preserved during migration. */
(function(g){
'use strict';
const F=g.HoldingsForecast,copy=x=>JSON.parse(JSON.stringify(x));
function identity(key){try{const prefix='tt_holdings_forecast_v1:';if(!key.startsWith(prefix))return null;const xs=key.slice(prefix.length).split('|').map(decodeURIComponent);const e=Object.fromEntries(['scope','ticker','symbol','currency','kind'].map((k,i)=>[k,xs[i]]));return xs.length===5&&F.identity(e)?e:null;}catch{return null;}}
function document(raw,e){if(raw===null||raw===undefined)return {version:F.VERSION,entries:[]};if(typeof raw!=='string'||raw.length>F.MAX_BYTES)throw Error('Registru prea mare; copia existentă este păstrată.');const d=JSON.parse(raw);if(Object.keys(d).some(k=>!['version','entries'].includes(k))||d.version!==F.VERSION||!Array.isArray(d.entries)||d.entries.length>F.MAX||d.entries.some(r=>!F.validEntry(r,e))||new Set(d.entries.map(r=>r.id)).size!==d.entries.length)throw Error('Registru incompatibil; copia existentă este păstrată.');return d;}
function original(r){const x=copy(r);delete x.outcome;delete x.verification;return JSON.stringify(x);}
function merge(before,next,key){
 const e=identity(key);if(!e)throw Error('Identitate de registru incompletă.');const old=document(before,e),incoming=document(next,e),rows=new Map(old.entries.map(r=>[r.id,r]));
 for(const r of incoming.entries){const a=rows.get(r.id);if(!a){rows.set(r.id,r);continue;}if(original(a)!==original(r))continue;
  if((r.verification.checkedAt||0)<(a.verification.checkedAt||0))continue;
  if(a.outcome&&r.outcome&&JSON.stringify(a.outcome.path)!==JSON.stringify(r.outcome.path)){rows.set(r.id,{...a,verification:{...r.verification,state:'unverifiable',reason:'Rezultate diferite între copii; rezultatul original este păstrat.'}});continue;}
  rows.set(r.id,{...a,outcome:a.outcome||r.outcome,verification:r.verification});
 }
 const entries=[...rows.values()].sort((a,b)=>a.source.t-b.source.t||a.id.localeCompare(b.id)),raw=JSON.stringify({version:F.VERSION,entries});if(entries.length>F.MAX||raw.length>F.MAX_BYTES)throw Error('Registrul este plin; istoricul existent este păstrat.');return raw;
}
function indexedStore(factory,timeoutMs=5000){
 if(!factory?.open)return null;let connection=null,opening=null;
 function open(){if(connection)return Promise.resolve(connection);if(opening)return opening;
  opening=new Promise((resolve,reject)=>{let request,done=false;const finish=(error,db)=>{if(done){db?.close();return;}done=true;clearTimeout(timer);if(error){opening=null;reject(error);}else{connection=db;db.onversionchange=()=>{db.close();connection=null;opening=null;};resolve(db);}};
   const timer=setTimeout(()=>finish(Error('Stocarea istoricului a expirat.')),timeoutMs);
   try{request=factory.open('tt_holdings_forecasts_v1',1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('history'))request.result.createObjectStore('history');};request.onsuccess=()=>finish(null,request.result);request.onerror=()=>finish(request.error||Error('Stocare indisponibilă.'));request.onblocked=()=>finish(Error('Stocare blocată.'));}catch(error){finish(error);}
  });const pending=opening;pending.catch(()=>{if(opening===pending)opening=null;});return pending;
 }
 async function transaction(changes){const db=await open();return new Promise((resolve,reject)=>{let tx,done=false;const results=new Map(),finish=error=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(results);};
  const timer=setTimeout(()=>{finish(Error('Salvarea istoricului a expirat.'));try{tx?.abort();}catch{}},timeoutMs);
  try{const write=changes.some(c=>Object.hasOwn(c,'value'));tx=db.transaction('history',write?'readwrite':'readonly');const store=tx.objectStore('history');tx.oncomplete=()=>finish();tx.onabort=()=>finish(tx.error||Error('Salvare anulată.'));tx.onerror=()=>finish(tx.error||Error('Salvare nereușită.'));
   let pending=changes.length;for(const c of changes){const request=store.get(c.key);request.onsuccess=()=>{results.set(c.key,request.result??null);if(--pending)return;
    try{for(const c of changes){if(!Object.hasOwn(c,'value'))continue;const before=results.get(c.key);let value=c.value;if(before!==c.before){if(c.merge)value=merge(before,value,c.key);else throw Error('O altă pagină a modificat istoricul. Reîncarcă înainte de a continua.');}store.put(value,c.key);results.set(c.key,value);}}catch(error){finish(error);tx.abort();}
   };}
  }catch(error){finish(error);try{tx?.abort();}catch{}}
 });}
 return {get:async key=>(await transaction([{key}])).get(key),write:transaction};
}
function create(storage,{durable=indexedStore(g.indexedDB),onChange=()=>{}}={}){
 const cache=new Map(),persisted=new Map(),states=new Map(),loads=new Map();let queue=Promise.resolve();
 const changed=()=>{try{onChange();}catch{}};
 function getItem(key){if(cache.has(key))return cache.get(key);if(durable)throw Error('Istoricul se încarcă.');return storage.getItem(key);}
 function commit(changes){
  if(!durable){for(const c of changes)storage.setItem(c.key,c.value);return;}
  for(const c of changes){if(!cache.has(c.key))throw Error('Așteaptă încărcarea istoricului.');if(c.before!==undefined&&cache.get(c.key)!==c.before)throw Error('Istoricul s-a schimbat. Reîncarcă previzualizarea.');}
  const previous=new Map(changes.map(c=>[c.key,cache.get(c.key)]));for(const c of changes){cache.set(c.key,c.value);states.set(c.key,{state:'pending',message:'Istoricul este disponibil. Salvarea permanentă este în curs.'});}
  const task=queue.catch(()=>{}).then(async()=>{const writes=changes.map(c=>({key:c.key,value:c.value,before:persisted.get(c.key)??null,merge:!!identity(c.key)&&!document(previous.get(c.key),identity(c.key)).entries.some(r=>!document(c.value,identity(c.key)).entries.some(x=>x.id===r.id))}));
   const result=await durable.write(writes);for(const c of changes){persisted.set(c.key,result.get(c.key));if(cache.get(c.key)===c.value){cache.set(c.key,result.get(c.key));states.set(c.key,{state:'indexeddb',message:'Istoric păstrat în browser. Copia veche rămâne intactă.'});}}
  }).catch(error=>{for(const c of changes)if(cache.get(c.key)===c.value)states.set(c.key,{state:'session',message:'Istoric disponibil doar în această sesiune: '+error.message+' Exportă registrul pentru păstrare.'});}).finally(changed);
  queue=task;return task;
 }
 async function load(key){
  if(loads.has(key))return loads.get(key);if(!durable)return;
  const task=(async()=>{let local=null;try{local=storage.getItem(key);}catch{}try{const saved=await durable.get(key);persisted.set(key,saved);let value=saved??local;
    if(identity(key)&&saved&&local)value=merge(saved,local,key);
    cache.set(key,value??null);states.set(key,{state:saved?'indexeddb':local?'local':'indexeddb',message:'Istoricul a fost încărcat.'});
    if(local&&value!==saved)commit([{key,value}]);
   }catch(error){cache.set(key,local);states.set(key,{state:'session',message:'Stocarea permanentă nu poate fi citită. Copia locală este păstrată: '+error.message});}changed();})();loads.set(key,task);return task;
 }
 return {getItem,setItem:(key,value)=>commit([{key,value}]),commit,load,settled:()=>queue,status:key=>states.get(key)||{state:durable?'loading':'local',message:durable?'Istoricul se încarcă…':'Istoric în stocarea locală a browserului.'}};
}
g.HoldingsForecastStorage={create,indexedStore,merge,identity};
})(typeof window!=='undefined'?window:globalThis);
