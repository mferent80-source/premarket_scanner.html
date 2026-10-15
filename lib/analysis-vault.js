/* Analiza EOD a Portofoliului (tt_holdings_analysis_v1) în IndexedDB, nu în spațiul local de ~5 MB comun cu toate aplicațiile
   de pe origine (15.10.2026: cu spațiul plin salvarea pica și, la redeschidere, modelele rămâneau fără sursă). Interfață ca
   localStorage pentru cheia analizei, citire sincronă din memorie.
   - La pornire, sub lacătul cheii, copia veche din spațiul local se unește pe fiecare poziție (rămâne analiza cu fetchedAt mai
     nou, iar istoricul observațiilor din ambele copii se păstrează) și se șterge doar după confirmarea tranzacției; un marcaj
     permanent notează mutarea.
   - După mutare, dacă IndexedDB nu poate fi citit, nimic nu se scrie peste copia bună: scrierile rămân în memorie și se unesc la
     următoarea încercare reușită (ready() reîncearcă).
   - O salvare care nu reușește nicăieri apare în state().error, ca pagina să poată avertiza.
   - Celelalte cadre (conectorul Trading 212, Desk) află de scrieri pe un BroadcastChannel și primesc un eveniment „storage” sintetic.
   - Fără IndexedDB în browser, totul rămâne în spațiul local, ca înainte. */
(function(g){
'use strict';
const KEY='tt_holdings_analysis_v1',DB='tt_holdings_analysis_v1',STORE='cache',CHANNEL='tt-holdings-analysis-v1',MARK='tt_holdings_analysis_migrated';
const parse=raw=>{try{const v=JSON.parse(raw||'null');return v&&typeof v==='object'&&!Array.isArray(v)?v:null;}catch{return null;}};
const histories=(a,b)=>{const out=new Map();for(const h of [...(Array.isArray(a)?a:[]),...(Array.isArray(b)?b:[])])if(h&&h.asOf)out.set(h.asOf+'|'+(h.symbol||''),h);return [...out.values()].sort((x,y)=>String(x.asOf).localeCompare(String(y.asOf)));};
/* Unirea pe poziție: pentru aceeași cheie (cont|ticker) rămâne intrarea cu fetchedAt mai nou; istoricul observațiilor e unit. */
function merge(...raws){
 const maps=raws.map(parse).filter(Boolean);if(!maps.length)return null;
 const out={};for(const m of maps)for(const [k,v] of Object.entries(m)){const old=out[k];
  if(!old){out[k]=v;continue;}
  const newer=Number(old?.fetchedAt)>Number(v?.fetchedAt)?old:v,other=newer===old?v:old;
  const h=Array.isArray(old?.history)||Array.isArray(v?.history)?histories(other?.history,newer?.history):undefined;
  out[k]=h&&h.length?{...newer,history:h}:newer;}
 return JSON.stringify(out);
}
function indexedStore(factory,timeoutMs=8000){
 if(!factory?.open)return null;let connection=null,opening=null;
 function open(){
  if(connection)return Promise.resolve(connection);if(opening)return opening;
  opening=new Promise((resolve,reject)=>{let settled=false;const finish=(error,db)=>{if(settled){db?.close();return;}settled=true;clearTimeout(timer);if(error){opening=null;reject(error);}else{connection=db;db.onversionchange=()=>{db.close();connection=null;opening=null;};resolve(db);}};
   const timer=setTimeout(()=>finish(Error('Analiza EOD nu s-a deschis la timp.')),timeoutMs);
   try{const r=factory.open(DB,1);r.onupgradeneeded=()=>{try{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE);}catch(e){finish(e);}};r.onsuccess=()=>finish(null,r.result);r.onerror=()=>finish(r.error||Error('Analiza EOD nu este disponibilă.'));r.onblocked=()=>finish(Error('Analiza EOD este blocată de altă fereastră.'));}catch(e){finish(e);}
  });const p=opening;p.catch(()=>{if(opening===p)opening=null;});return p;
 }
 async function op(write,value){const db=await open();return new Promise((resolve,reject)=>{let tx,result=null,done=false;const finish=e=>{if(done)return;done=true;clearTimeout(timer);e?reject(e):resolve(result);};
  const timer=setTimeout(()=>{finish(Error('Analiza EOD nu a răspuns la timp.'));try{tx?.abort();}catch{}},timeoutMs);
  try{tx=write?db.transaction(STORE,'readwrite',{durability:'strict'}):db.transaction(STORE,'readonly');const s=tx.objectStore(STORE);tx.oncomplete=()=>finish();tx.onabort=tx.onerror=()=>finish(tx.error||Error('Salvarea analizei EOD a fost refuzată.'));
   if(write){s.put(value,KEY);result=value;}else{const r=s.get(KEY);r.onsuccess=()=>{result=typeof r.result==='string'?r.result:null;};}}catch(e){finish(e);try{tx?.abort();}catch{}}});}
 return {get:()=>op(false),put:v=>op(true,v)};
}
function create({legacy,durable,channelFactory,notify=true,locks}={}){
 if(legacy===undefined){try{legacy=g.localStorage;}catch{legacy=null;}}
 if(durable===undefined){try{durable=indexedStore(g.indexedDB);}catch{durable=null;}}
 if(locks===undefined)locks=g.navigator?.locks;
 // mod: 'loading' → 'durable' | 'legacy' (fără IndexedDB / niciodată mutat) | 'broken' (mutat, IndexedDB necitibil acum)
 let mode=durable?'loading':'legacy',cache=null,pendingWrite=null,readyPromise=null,chain=Promise.resolve(),channel=null,writes=0,error=null;
 const localGet=()=>{try{return legacy?legacy.getItem(KEY):null;}catch{return null;}},localRemove=()=>{try{legacy?.removeItem(KEY);}catch{}};
 const marked=()=>{try{return !!legacy?.getItem(MARK);}catch{return false;}},mark=()=>{try{legacy?.setItem(MARK,'1');}catch{}};
 const announce=()=>{if(!notify)return;try{const e=g.StorageEvent?new g.StorageEvent('storage',{key:KEY}):new g.Event('storage');if(!('key' in e))Object.defineProperty(e,'key',{value:KEY});g.dispatchEvent?.(e);}catch{}};
 const tell=()=>{try{channel?.postMessage({key:KEY,at:Date.now()});}catch{}};
 const localSet=value=>{try{legacy.setItem(KEY,value);error=null;return true;}catch(e){const full=e?.name==='QuotaExceededError'||e?.code===22||e?.code===1014;error=full?'Spațiul local al browserului este plin și IndexedDB a refuzat salvarea; analiza rămâne doar în această pagină.':'Browserul a refuzat salvarea analizei EOD; analiza rămâne doar în această pagină.';return false;}};
 async function hydrate(){
  const old=localGet(),stored=await durable.get(),merged=merge(stored,old,pendingWrite);
  if(merged!==null&&merged!==stored)await durable.put(merged);
  if(merged!==null||stored!==null)mark();
  if(old!==null&&localGet()===old)localRemove();
  cache=merged;pendingWrite=null;mode='durable';error=null;if(old!==null||merged!==stored)tell();
 }
 function ready(){
  if(mode==='legacy'||mode==='durable')return readyPromise||Promise.resolve(mode);
  if(!readyPromise){const run=()=>hydrate();
   readyPromise=(locks?.request?locks.request(KEY,run):run()).then(()=>{announce();return mode;},()=>{
    if(marked()){mode='broken';readyPromise=null;}   // mutat: nu scriem nimic din memorie peste copia bună; următorul ready() reîncearcă
    else{mode='legacy';if(pendingWrite!==null){localSet(pendingWrite);pendingWrite=null;}}
    announce();return mode;});}
  return readyPromise;
 }
 function refresh(){if(mode!=='durable')return Promise.resolve();const n=writes;return chain.catch(()=>{}).then(()=>durable.get()).then(v=>{if(writes===n){cache=v;announce();}},()=>{});}
 const storage={
  getItem(k){if(k!==KEY)return legacy?legacy.getItem(k):null;if(mode==='legacy')return localGet();if(mode==='durable')return cache;return pendingWrite??(marked()?null:localGet());},
  setItem(k,v){if(k!==KEY){legacy.setItem(k,v);return;}const value=String(v);
   if(mode==='legacy'){if(!localSet(value))throw Error(error);return;}
   if(mode==='loading'||mode==='broken'){pendingWrite=merge(pendingWrite,value);if(mode==='broken')ready();return;}
   cache=value;writes++;chain=chain.catch(()=>{}).then(()=>durable.put(value)).then(()=>{error=null;tell();},()=>{localSet(value);});},
  removeItem(k){if(k!==KEY){legacy?.removeItem(k);return;}cache=null;pendingWrite=null;if(mode==='durable'){writes++;chain=chain.catch(()=>{}).then(()=>durable.put('{}')).then(tell,()=>{});}else localRemove();},
  ready,flush:()=>chain,vault:true
 };
 if(notify)try{channel=channelFactory?channelFactory(CHANNEL):g.BroadcastChannel?new g.BroadcastChannel(CHANNEL):null;if(channel)channel.onmessage=e=>{if(e?.data?.key===KEY)refresh();};}catch{}
 return {storage,ready,refresh,flush:()=>chain,state:()=>({mode,error}),close:()=>{try{channel?.close();}catch{}}};
}
const instance=g.document?create():null;
if(instance)instance.ready();
g.TTAnalysisVault=instance?{KEY,MARK,storage:instance.storage,ready:instance.ready,state:instance.state,create,merge,indexedStore}:{KEY,MARK,create,merge,indexedStore};
if(typeof module!=='undefined'&&module.exports)module.exports=g.TTAnalysisVault;
})(typeof window!=='undefined'?window:globalThis);
