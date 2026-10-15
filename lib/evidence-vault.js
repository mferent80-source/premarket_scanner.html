/* Registrul „Analize înaintea intrării” (tt_trade_evidence_v1) în IndexedDB, nu în spațiul local de ~5 MB comun cu toate
   aplicațiile de pe origine (15.10.2026: sincronizarea pica pe „spațiul local plin”). Expune aceeași interfață ca localStorage
   (getItem/setItem/removeItem) pentru cheia registrului, ca TradeEvidence și sincronizarea să rămână neschimbate.
   Garanții (analizele sunt doar ADĂUGATE, niciodată rescrise):
   - orice scriere în IndexedDB UNEȘTE pe id noul registru cu cel salvat, în ACEEAȘI tranzacție — nicio fereastră cu o copie
     veche nu poate pierde o analiză; ștergerea registrului nu există;
   - la pornire, sub lacătul registrului, copia veche din spațiul local se unește în IndexedDB și se șterge doar după
     confirmarea tranzacției (durabilitate strictă); un marcaj permanent notează mutarea;
   - după mutare, dacă IndexedDB nu poate fi citit, registrul dă EROARE (nu „gol”) și se reîncearcă la următorul ready();
   - celelalte ferestre află de scrieri pe un BroadcastChannel și primesc un eveniment „storage” sintetic;
   - fără IndexedDB în browser, totul merge pe spațiul local, ca înainte. */
(function(g){
'use strict';
const KEY='tt_trade_evidence_v1',DB='tt_evidence_vault_v1',STORE='ledger',CHANNEL='tt-evidence-vault-v1',MARK='tt_evidence_vault_migrated';
/* Unirea a două copii: aceeași analiză (același id) rămâne o singură dată; prima copie are prioritate. */
function union(primary,secondary){
 if(primary===null||primary===undefined)return secondary??null;if(secondary===null||secondary===undefined||secondary===primary)return primary;
 const a=JSON.parse(primary),b=JSON.parse(secondary),seen=new Set((a.entries||[]).map(x=>x&&x.id));
 const extra=(b.entries||[]).filter(x=>x&&!seen.has(x.id));if(!extra.length)return primary;
 return JSON.stringify({...a,version:a.version||b.version,entries:[...(a.entries||[]),...extra].sort((x,y)=>(x.createdAt||0)-(y.createdAt||0)||String(x.id).localeCompare(String(y.id)))});
}
function indexedStore(factory,timeoutMs=8000){
 if(!factory?.open)return null;
 let connection=null,opening=null;
 function open(){
  if(connection)return Promise.resolve(connection);if(opening)return opening;
  opening=new Promise((resolve,reject)=>{
   let settled=false;const finish=(error,db)=>{if(settled){db?.close();return;}settled=true;clearTimeout(timer);if(error){opening=null;reject(error);}else{connection=db;db.onversionchange=()=>{db.close();connection=null;opening=null;};resolve(db);}};
   const timer=setTimeout(()=>finish(Error('Registrul analizelor nu s-a deschis la timp.')),timeoutMs);
   try{const request=factory.open(DB,1);
    request.onupgradeneeded=()=>{try{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);}catch(error){finish(error);}};
    request.onsuccess=()=>finish(null,request.result);request.onerror=()=>finish(request.error||Error('Registrul analizelor nu este disponibil.'));request.onblocked=()=>finish(Error('Registrul analizelor este blocat de altă fereastră.'));
   }catch(error){finish(error);}
  });const pending=opening;pending.catch(()=>{if(opening===pending)opening=null;});return pending;
 }
 /* Doar finalizarea tranzacției confirmă o scriere, niciodată simpla reușită a cererii. */
 async function transact(write,value){
  const db=await open();return new Promise((resolve,reject)=>{
   let tx,result=null,settled=false;const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(result);};
   const timer=setTimeout(()=>{finish(Error('Registrul analizelor nu a răspuns la timp.'));try{tx?.abort();}catch{}},timeoutMs);
   try{tx=write?db.transaction(STORE,'readwrite',{durability:'strict'}):db.transaction(STORE,'readonly');const store=tx.objectStore(STORE);
    tx.oncomplete=()=>finish();tx.onabort=tx.onerror=()=>finish(tx.error||Error('Salvarea analizelor a fost refuzată.'));
    const r=store.get(KEY);r.onsuccess=()=>{const stored=typeof r.result==='string'?r.result:null;
     if(!write){result=stored;return;}
     try{result=union(value,stored);if(result!==stored)store.put(result,KEY);}catch(error){finish(error);try{tx.abort();}catch{}}};
   }catch(error){finish(error);try{tx?.abort();}catch{}}
  });
 }
 return {get:()=>transact(false),merge:value=>transact(true,value)};
}
function create({legacy,durable,channelFactory,notify=true,locks}={}){
 if(legacy===undefined){try{legacy=g.localStorage;}catch{legacy=null;}}
 if(durable===undefined){try{durable=indexedStore(g.indexedDB);}catch{durable=null;}}
 if(locks===undefined)locks=g.navigator?.locks;
 // mod: 'loading' → 'durable' | 'legacy' (fără IndexedDB în browser) | 'broken' (după mutare, IndexedDB necitibil)
 let mode=durable?'loading':'legacy',cache=null,readyPromise=null,pending=Promise.resolve(),writes=0,channel=null;
 const local={get:()=>{try{return legacy?legacy.getItem(KEY):null;}catch{return null;}},remove:()=>{try{legacy?.removeItem(KEY);}catch{}},marked:()=>{try{return !!legacy?.getItem(MARK);}catch{return false;}},mark:()=>{try{legacy?.setItem(MARK,'1');}catch{}}};
 const merge=async value=>durable.merge?durable.merge(value):(async()=>{const stored=await durable.get(),merged=union(value,stored);if(merged!==stored)await durable.put(merged);return merged;})();
 const announce=()=>{if(!notify)return;try{const e=g.StorageEvent?new g.StorageEvent('storage',{key:KEY}):new g.Event('storage');if(!('key' in e))Object.defineProperty(e,'key',{value:KEY});Object.defineProperty(e,'ttEvidenceVault',{value:true});g.dispatchEvent?.(e);}catch{}};
 const tell=()=>{try{channel?.postMessage({key:KEY,at:Date.now()});}catch{}};
 async function hydrate(){
  const old=local.get();let stored=await durable.get();
  if(old!==null){stored=await merge(old);local.mark();if(local.get()===old)local.remove();tell();}
  else if(stored!==null)local.mark();
  cache=stored;mode='durable';
 }
 function ready(){
  if(mode==='legacy')return Promise.resolve(state());
  if(!readyPromise){
   const run=()=>hydrate();
   readyPromise=(locks?.request?locks.request(KEY,run):run()).then(()=>{announce();return state();},()=>{
    // nemutat încă ⇒ copia din spațiul local e registrul întreg; mutat ⇒ eroare, nu „gol”; următorul ready() reîncearcă
    mode=local.marked()?'broken':'fallback';readyPromise=null;announce();return state();});
  }
  return readyPromise;
 }
 /* Recitire înaintea unei scrieri sub lacăt: o eroare se propagă (nu se scrie din memorie). Nu pornește încărcarea. */
 function refresh(){
  if(mode==='legacy'||mode==='fallback')return Promise.resolve();
  if(mode!=='durable')return Promise.reject(Error('Registrul analizelor nu este încărcat; copia existentă este păstrată.'));
  const n=writes;return pending.catch(()=>{}).then(()=>durable.get()).then(v=>{if(writes===n)cache=v;});
 }
 function write(value){
  writes++;const job=pending.catch(()=>{}).then(()=>merge(value)).then(merged=>{cache=merged;tell();});
  pending=job;job.catch(()=>{});return job;
 }
 const fail=()=>{throw Error('Registrul analizelor din IndexedDB nu poate fi citit acum; copia existentă este păstrată. Reîncerc la următoarea sincronizare.');};
 const storage={
  getItem(k){if(k!==KEY)return legacy?legacy.getItem(k):null;if(mode==='legacy'||mode==='fallback')return local.get();if(mode==='broken')fail();return mode==='durable'?cache:local.get();},
  setItem(k,v){if(k!==KEY){legacy.setItem(k,v);return;}if(mode==='legacy'||mode==='fallback'){legacy.setItem(KEY,v);return;}if(mode==='broken')fail();if(mode!=='durable')throw Error('Registrul analizelor se încarcă; reîncearcă peste o clipă.');cache=union(String(v),cache);write(String(v));},
  // registrul doar crește: o „ștergere” nu atinge analizele păstrate în IndexedDB
  removeItem(k){if(k!==KEY){legacy?.removeItem(k);return;}if(mode==='legacy'||mode==='fallback')local.remove();},
  ready,refresh,flush:()=>pending,vault:true
 };
 function state(){let entries=null;try{entries=JSON.parse(storage.getItem(KEY)||'{"entries":[]}').entries.length;}catch{}return {mode,durable:mode==='durable',broken:mode==='broken',hydrated:mode!=='loading',entries};}
 if(notify)try{channel=channelFactory?channelFactory(CHANNEL):g.BroadcastChannel?new g.BroadcastChannel(CHANNEL):null;if(channel)channel.onmessage=e=>{if(e?.data?.key===KEY&&mode==='durable')refresh().then(announce,()=>{});};}catch{}
 return {storage,ready,refresh,flush:()=>pending,state,close:()=>{try{channel?.close();}catch{}}};
}
const instance=g.document?create():null;
if(instance)instance.ready();
g.TTEvidenceVault=instance?{KEY,DB,STORE,MARK,CHANNEL,storage:instance.storage,ready:instance.ready,refresh:instance.refresh,flush:instance.flush,state:instance.state,create,indexedStore,union}:{KEY,DB,STORE,MARK,CHANNEL,create,indexedStore,union};
if(typeof module!=='undefined'&&module.exports)module.exports=g.TTEvidenceVault;
})(typeof window!=='undefined'?window:globalThis);
