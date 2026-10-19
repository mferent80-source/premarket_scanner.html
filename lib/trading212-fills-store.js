// One confirmed, transactional register for broker executions.
(function(g){
'use strict';
const KEY='tt_trading212_fills_v1',DB='tt-broker-fills-v1',STORE='records',CHANNEL='tt-trading212-fills-changed-v1';
function failure(code,message){const error=Error(message);error.code=code;return error;}
const unreadable=()=>failure('fills_unreadable','Istoricul execuțiilor nu poate fi citit. Copiile existente sunt păstrate.');
const conflict=()=>failure('fills_conflict','Istoricul execuțiilor are copii incompatibile. Exportă copiile înainte de reconciliere.');
function object(value){return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.prototype.toString.call(value)==='[object Object]';}
function valid(data){if(!object(data)||!object(data.accounts))throw unreadable();return data;}
function parse(raw){if(raw===null)return {accounts:{}};if(typeof raw!=='string')throw unreadable();try{return valid(JSON.parse(raw));}catch{throw unreadable();}}
/* 19.10.2026 (I-697, punctul 5): peek()/read() parsau tot registrul (~860 KB, 2.444 execuții) la fiecare apel — Governorul îl cere de 17–30 de ori
   în 20 s. Textul confirmat se parsează o singură dată; cititorii primesc aceeași copie ÎNGHEȚATĂ (nu o pot strica), înlocuită la scriere sau la
   evenimentul de schimbare. mutate() primește în continuare o copie proprie, modificabilă. */
function freeze(x){if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.freeze(x);for(const k of Object.keys(x))freeze(x[k]);}return x;}
const EMPTY=freeze({accounts:{}}),memo=[];
function shared(raw){if(raw===null)return EMPTY;for(const m of memo)if(m.raw===raw)return m.data;const data=freeze(parse(raw));memo.unshift({raw,data});memo.length=Math.min(memo.length,3);return data;}
function clone(record){return {raw:record.raw,data:shared(record.raw),state:record.state,revision:record.revision};}
function serialize(data){try{valid(data);const raw=JSON.stringify(data);shared(raw);return raw;}catch{throw failure('fills_invalid','Modificarea istoricului execuțiilor este invalidă.');}}
function equal(a,b){try{return JSON.stringify(a)===JSON.stringify(b);}catch{return false;}}
function nextRevision(revision){const next=revision+1;if(!Number.isSafeInteger(next)||next>=Number.MAX_SAFE_INTEGER)throw failure('fills_storage','Revizia istoricului execuțiilor nu poate fi incrementată. Copia existentă este păstrată.');return next;}
function reconcile(record,local){
  if(record===null)return {raw:local,data:shared(local),state:'local',revision:0};
  if(!object(record)||!Number.isSafeInteger(record.revision)||record.revision<1||record.revision>=Number.MAX_SAFE_INTEGER||![record.raw,record.localRaw].every(value=>value===null||typeof value==='string'))throw unreadable();
  const data=shared(record.raw);shared(record.localRaw);
  if(local!==undefined&&local!==record.localRaw&&local!==record.raw)throw conflict();
  return {raw:record.raw,data,state:'indexeddb',revision:record.revision};
}
function indexedStore(factory,{database=DB,timeoutMs=4000}={}){
  if(!factory?.open)return null;
  let connection=null,opening=null;
  function open(){
    if(connection)return Promise.resolve(connection);if(opening)return opening;
    opening=new Promise((resolve,reject)=>{
      let request,settled=false;
      const finish=(error,db)=>{if(settled){db?.close();return;}settled=true;clearTimeout(timer);if(error){opening=null;reject(error);}else{connection=db;db.onversionchange=()=>{db.close();connection=null;opening=null;};resolve(db);}};
      const timer=setTimeout(()=>finish(failure('fills_storage','Accesul la istoricul execuțiilor a expirat.')),timeoutMs);
      try{request=factory.open(database,1);
        request.onupgradeneeded=()=>{try{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);}catch(error){try{request.transaction?.abort();}catch{}finish(error);}};
        request.onsuccess=()=>finish(null,request.result);
        request.onerror=()=>finish(failure('fills_storage','Browserul a refuzat accesul la istoricul execuțiilor.'));
        request.onblocked=()=>finish(failure('fills_storage','Istoricul execuțiilor este blocat de o altă fereastră.'));
      }catch{finish(failure('fills_storage','Browserul a refuzat accesul la istoricul execuțiilor.'));}
    });const pending=opening;pending.catch(()=>{if(opening===pending)opening=null;});return pending;
  }
  async function transaction(mode,change){
    const db=await open();return new Promise((resolve,reject)=>{
      let tx,value=null,settled=false;
      const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
      const abort=error=>{finish(error);try{tx?.abort();}catch{}};
      const timer=setTimeout(()=>abort(failure('fills_storage','Citirea sau salvarea execuțiilor a expirat. Modificarea nu este confirmată.')),timeoutMs);
      try{tx=db.transaction(STORE,mode);const store=tx.objectStore(STORE);
        tx.oncomplete=()=>finish();tx.onabort=tx.onerror=()=>finish(failure('fills_storage','Salvarea execuțiilor a fost refuzată. Modificarea nu este confirmată.'));
        const request=store.get(KEY);request.onsuccess=()=>{if(settled)return;try{
          if(mode==='readonly'){value=request.result??null;return;}
          const next=change(request.result??null);
          if(!object(next)||!Object.prototype.hasOwnProperty.call(next,'record'))throw unreadable();
          if(next.write!==false)store.put(next.record,KEY);value=next.value;
        }catch(error){abort(error);}};
        request.onerror=()=>abort(failure('fills_storage','Istoricul execuțiilor nu poate fi citit.'));
      }catch{abort(failure('fills_storage','Citirea sau salvarea execuțiilor nu poate fi pornită.'));}
    });
  }
  return {read:()=>transaction('readonly'),update:change=>transaction('readwrite',change)};
}
function defaultDurable(){try{return indexedStore(g.indexedDB);}catch{return {read:async()=>{throw unreadable();},update:async()=>{throw unreadable();}};}}
function defaultStorage(){try{return g.localStorage;}catch{return {getItem(){throw unreadable();},setItem(){throw unreadable();},removeItem(){throw unreadable();}};}}
function create(storage=defaultStorage(),{durable=defaultDurable(),notify=true,channelFactory,locks}={}){
  const listeners=new Set();let channel=null,tail=Promise.resolve(),cache=null,error=null,closed=false,lastFailure=null,lastRevision=0;
  function legacy(allowDenied=false){try{return storage.getItem(KEY)??null;}catch{if(allowDenied)return undefined;throw failure('fills_storage','Istoricul local al execuțiilor nu poate fi citit. Nu este tratat ca un istoric gol.');}}
  function locked(operation){const run=()=>{const manager=locks===undefined?g.navigator?.locks:locks;return manager?.request?manager.request(KEY,operation):operation();};const pending=tail.catch(()=>{}).then(run);tail=pending;return pending;}
  function windowEvent(){if(!notify||closed)return;try{
    const event=g.StorageEvent?new g.StorageEvent('storage',{key:KEY}):new g.Event('storage');
    if(!('key' in event))Object.defineProperty(event,'key',{value:KEY});
    Object.defineProperty(event,'ttFillsStoreConfirmed',{value:true});g.dispatchEvent?.(event);
  }catch{}}
  function changed(record,broadcast=false){
    const metadata={key:KEY,revision:record.revision};
    for(const listener of listeners)try{listener({...metadata});}catch{}
    windowEvent();if(broadcast&&notify&&!closed)try{channel?.postMessage(metadata);}catch{}
  }
  function accepted(record,{broadcast=false,force=false}={}){
    const previous=cache,hasChanged=force||!previous||previous.raw!==record.raw||previous.revision!==record.revision||previous.state!==record.state;
    cache=clone(record);error=null;lastRevision=record.revision;
    if(hasChanged){lastFailure=null;changed(record,broadcast);}
    return clone(record);
  }
  function rejected(reason,{write=false}={}){
    const failureError=reason instanceof Error?reason:write?failure('fills_storage','Salvarea execuțiilor nu a fost confirmată. Copia existentă este păstrată.'):unreadable();
    if(!write||!cache||failureError.code==='fills_conflict'||failureError.code==='fills_unreadable'){cache=null;error=failureError;}
    const signature=String(failureError.code||'fills_unreadable')+':'+failureError.message;
    if(lastFailure!==signature){lastFailure=signature;changed({revision:lastRevision},false);}
    throw failureError;
  }
  function mirror(record,expectedLocal){
    let before;try{before=legacy();}catch{return;}
    if(before!==expectedLocal&&before!==record.raw)throw conflict();
    if(before===record.raw)return;
    try{
      if(record.raw===null)storage.removeItem(KEY);
      else if(g.TTStorageWrite?.setItem)g.TTStorageWrite.setItem(storage,KEY,record.raw);
      else storage.setItem(KEY,record.raw);
    }catch{/* The confirmed durable copy remains authoritative when the local mirror is full. */}
  }
  function confirmedLegacy(record,anchor){const local=legacy(true);if(local!==undefined&&local!==anchor&&local!==record.raw)throw conflict();}
  async function hydrate(){
    if(!durable)return accepted(reconcile(null,legacy()));
    let stored=await durable.read(),local=legacy(!!stored),result=reconcile(stored,local),migrated=false,anchor=stored?.localRaw;
    if(stored===null&&local!==null){
      result=await durable.update(current=>{
        const before=legacy(!!current),authoritative=reconcile(current,before);
        if(current!==null){anchor=current.localRaw;return {record:current,value:authoritative,write:false};}
        if(before!==local)throw conflict();
        if(legacy()!==before)throw conflict();
        migrated=true;anchor=before;const record={revision:1,raw:before,localRaw:before};
        return {record,value:{raw:before,data:shared(before),state:'indexeddb',revision:1}};
      });
      confirmedLegacy(result,anchor);
    }
    return accepted(result,{broadcast:migrated});
  }
  function read(){return locked(async()=>{try{return await hydrate();}catch(reason){return rejected(reason);}});}
  function peek(){if(error)throw error;if(!cache)throw failure('fills_loading','Istoricul execuțiilor se încarcă.');return clone(cache);}
  let initialization;
  if(!durable){try{initialization=Promise.resolve(accepted(reconcile(null,legacy())));}catch(reason){try{rejected(reason);}catch(failureError){initialization=Promise.reject(failureError);}}}
  else initialization=read();
  initialization.catch(()=>{});
  function mutate(change){return locked(async()=>{try{
    let result,anchor;
    if(typeof change!=='function')throw failure('fills_invalid','Modificarea istoricului execuțiilor este invalidă.');
    if(durable){result=await durable.update(record=>{
      const local=legacy(!!record),current=reconcile(record,local),raw=serialize(change(parse(current.raw)));
      if(legacy(!!record)!==local)throw conflict();
      anchor=local===undefined?record.localRaw:local;
      const next={revision:nextRevision(current.revision),raw,localRaw:anchor};
      return {record:next,value:{raw,data:shared(raw),state:'indexeddb',revision:next.revision}};
    });confirmedLegacy(result,anchor);mirror(result,anchor);}
    else{const before=legacy(),raw=serialize(change(parse(before)));if(legacy()!==before)throw conflict();
      try{if(g.TTStorageWrite?.setItem)g.TTStorageWrite.setItem(storage,KEY,raw);else storage.setItem(KEY,raw);}catch{throw failure('fills_storage','Browserul a refuzat salvarea execuțiilor. Istoricul anterior este păstrat.');}
      if(legacy()!==raw)throw failure('fills_storage','Salvarea execuțiilor nu a fost confirmată.');
      result={raw,data:shared(raw),state:'local',revision:0};
    }
    return accepted(result,{broadcast:true,force:true});
  }catch(reason){return rejected(reason,{write:true});}});}
  function replace(expected,next){return locked(async()=>{try{
    if(expected!==undefined)valid(expected);const raw=next===undefined?null:serialize(next);
    let result,anchor;
    if(durable){result=await durable.update(record=>{
      const local=legacy(!!record),current=reconcile(record,local),value=current.raw===null?undefined:current.data;
      if(!equal(value,expected))return {record,value:{matched:false,current},write:false};
      if(legacy(!!record)!==local)throw conflict();anchor=local===undefined?record.localRaw:local;
      const saved={revision:nextRevision(current.revision),raw,localRaw:anchor};
      return {record:saved,value:{matched:true,current:{raw,data:shared(raw),state:'indexeddb',revision:saved.revision}}};
    });if(!result.matched){accepted(result.current);return false;}confirmedLegacy(result.current,anchor);mirror(result.current,anchor);}
    else{const before=legacy(),current=reconcile(null,before);
      if(!equal(before===null?undefined:current.data,expected)){accepted(current);return false;}
      if(legacy()!==before)throw conflict();
      try{if(raw===null)storage.removeItem(KEY);else if(g.TTStorageWrite?.setItem)g.TTStorageWrite.setItem(storage,KEY,raw);else storage.setItem(KEY,raw);}catch{throw failure('fills_storage','Browserul a refuzat salvarea execuțiilor sincronizate.');}
      if(legacy()!==raw)throw failure('fills_storage','Salvarea execuțiilor nu a fost confirmată.');
      result={matched:true,current:{raw,data:shared(raw),state:'local',revision:0}};
    }
    accepted(result.current,{broadcast:true,force:true});return true;
  }catch(reason){return rejected(reason,{write:true});}});}
  if(notify)try{
    if(channelFactory)channel=channelFactory(CHANNEL);else if(g.BroadcastChannel)channel=new g.BroadcastChannel(CHANNEL);
    if(channel)channel.onmessage=event=>{const metadata=event.data;if(closed||metadata?.key!==KEY||!Number.isSafeInteger(metadata.revision)||metadata.revision<0||metadata.revision>Number.MAX_SAFE_INTEGER)return;
      if(durable&&cache&&metadata.invalidate!==true&&metadata.revision<=cache.revision)return;
      cache=null;error=null;read().catch(()=>{});
    };
  }catch{}
  const externalStorage=event=>{if(event?.key===KEY&&!event.ttFillsStoreConfirmed){cache=null;error=null;read().catch(()=>{});}};
  if(notify)g.addEventListener?.('storage',externalStorage);
  return {read,peek,ready:()=>initialization,mutate,replace,subscribe:listener=>{if(typeof listener!=='function')throw TypeError('Listener invalid');listeners.add(listener);return()=>listeners.delete(listener);},close:()=>{closed=true;channel?.close();g.removeEventListener?.('storage',externalStorage);listeners.clear();}};
}
const instance=create(defaultStorage(),{notify:!!g.document});
g.T212FillsStore={KEY,DB,STORE,create,indexedStore,read:instance.read,peek:instance.peek,ready:instance.ready,mutate:instance.mutate,replace:instance.replace,subscribe:instance.subscribe};
if(typeof module!=='undefined'&&module.exports)module.exports=g.T212FillsStore;
})(typeof window!=='undefined'?window:globalThis);
