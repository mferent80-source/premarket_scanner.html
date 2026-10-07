// Recomputable scan snapshots use their own database instead of filling localStorage.
(function(g){
  'use strict';
  const KEY='tt_europe_scan_v3',DB='tt_europe_scan_cache_v1';
  function indexedStore(factory,{database=DB,timeoutMs=4000}={}){
    if(!factory?.open)return null;
    function open(){return new Promise((resolve,reject)=>{
      let request,settled=false;
      const finish=(error,db)=>{if(settled){db?.close();return;}settled=true;clearTimeout(timer);error?reject(error):resolve(db);};
      const timer=setTimeout(()=>finish(Error('scan_cache_timeout')),timeoutMs);
      try{
        request=factory.open(database,1);
        request.onupgradeneeded=()=>{try{if(!request.result.objectStoreNames.contains('scans'))request.result.createObjectStore('scans');}catch(error){try{request.transaction?.abort();}catch{}finish(error);}};
        request.onsuccess=()=>finish(null,request.result);
        request.onerror=request.onblocked=()=>finish(Error('scan_cache_unavailable'));
      }catch(error){finish(error);}
    });}
    async function transaction(mode,raw){
      const db=await open();db.onversionchange=()=>db.close();
      try{return await new Promise((resolve,reject)=>{
        let tx,settled=false,value=null;
        const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
        const fail=()=>{finish(Error('scan_cache_unavailable'));try{tx?.abort();}catch{}};
        const timer=setTimeout(fail,timeoutMs);
        try{
          tx=db.transaction('scans',mode);
          tx.oncomplete=()=>finish();tx.onerror=tx.onabort=()=>finish(Error('scan_cache_unavailable'));
          const store=tx.objectStore('scans'),request=mode==='readonly'?store.get(KEY):store.put(raw,KEY);
          request.onsuccess=()=>{value=request.result??null;};request.onerror=fail;
        }catch{fail();}
      });}finally{db.close();}
    }
    return {read:()=>transaction('readonly'),write:raw=>transaction('readwrite',raw)};
  }
  function create(storage,{durable,factory,database,timeoutMs}={}){
    if(durable===undefined)try{durable=indexedStore(factory===undefined?g.indexedDB:factory,{database,timeoutMs});}catch{durable=null;}
    return {
      async read(){if(!durable)return null;const raw=await durable.read();return raw===null?null:JSON.parse(raw);},
      async save(snapshot){
        const raw=JSON.stringify(snapshot);
        if(durable)try{await durable.write(raw);return 'indexeddb';}catch{}
        storage.setItem(KEY,raw);return 'local';
      }
    };
  }
  g.EuropeScanCache={KEY,create,indexedStore};
  if(typeof module!=='undefined'&&module.exports)module.exports=g.EuropeScanCache;
})(typeof window!=='undefined'?window:globalThis);
