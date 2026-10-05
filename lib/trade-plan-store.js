// One transactional register for research plans. No broker or journal mutations.
(function(g){
'use strict';
const KEY='tt_trade_plans_v1',DB='tt_trade_plans_store_v1',CHANNEL='tt-trade-plans-changed-v1';
const conflict=()=>Error('Registrul planurilor are modificări incompatibile. Exportă copiile înainte de reconciliere.');
function parse(raw){try{const rows=JSON.parse(raw??'[]');if(!Array.isArray(rows))throw Error();return rows;}catch{throw Error('Registrul planurilor este ilizibil. Exportă datele înainte de reparare.');}}
function equal(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function reconcile(record,local){
  if(!record)return {raw:local,plans:parse(local),state:'local',revision:0};
  if(!Number.isSafeInteger(record.revision)||record.revision<1||record.revision===Number.MAX_SAFE_INTEGER||![record.raw,record.localRaw].every(x=>x===null||typeof x==='string'))throw Error('Copia planurilor este ilizibilă. Exportă copiile înainte de reparare.');
  const saved=parse(record.raw);
  if(local===undefined||local===record.localRaw||local===record.raw)return {raw:record.raw,plans:saved,state:'indexeddb',revision:record.revision};
  const current=parse(local),base=parse(record.localRaw);
  if(equal(current,base)||equal(current,saved))return {raw:record.raw,plans:saved,state:'indexeddb',revision:record.revision};
  if(equal(saved,base))return {raw:local,plans:current,state:'local',revision:record.revision};
  function byId(rows){const map=new Map();for(const row of rows){if(!row||typeof row!=='object'||!['string','number'].includes(typeof row.id)||!String(row.id)||map.has(String(row.id)))throw conflict();map.set(String(row.id),row);}return map;}
  const a=byId(base),b=byId(current),c=byId(saved),result=[];
  for(const id of new Set([...c.keys(),...b.keys(),...a.keys()])){
    const before=a.get(id),legacy=b.get(id),backup=c.get(id);let next;
    if(equal(legacy,backup))next=backup;
    else if(equal(legacy,before))next=backup;
    else if(equal(backup,before))next=legacy;
    else throw conflict();
    if(next!==undefined)result.push(next);
  }
  return {raw:JSON.stringify(result),plans:result,state:'indexeddb',revision:record.revision};
}
function indexedStore(factory,{database=DB,timeoutMs=4000}={}){
  if(!factory?.open)return null;
  let connection=null,opening=null;
  function open(){
    if(connection)return Promise.resolve(connection);if(opening)return opening;
    opening=new Promise((resolve,reject)=>{
      let request,settled=false;
      const finish=(error,db)=>{if(settled){db?.close();return;}settled=true;clearTimeout(timer);if(error){opening=null;reject(error);}else{connection=db;db.onversionchange=()=>{db.close();connection=null;opening=null;};resolve(db);}};
      const timer=setTimeout(()=>finish(Error('Accesul la planurile păstrate în browser a expirat.')),timeoutMs);
      try{request=factory.open(database,1);
        request.onupgradeneeded=()=>{try{if(!request.result.objectStoreNames.contains('register'))request.result.createObjectStore('register');}catch(error){try{request.transaction?.abort();}catch{}finish(error);}};
        request.onsuccess=()=>finish(null,request.result);request.onerror=()=>finish(Error('Copia planurilor nu poate fi accesată. Reîncarcă pagina; registrul nu a fost înlocuit.'));request.onblocked=()=>finish(Error('Accesul la planuri este blocat de o altă fereastră. Reîncarcă după închiderea ei.'));
      }catch{finish(Error('Browserul a refuzat accesul la copia planurilor.'))}
    });const pending=opening;pending.catch(()=>{if(opening===pending)opening=null;});return pending;
  }
  async function transaction(mode,change){
    const db=await open();return new Promise((resolve,reject)=>{
      let tx,value=null,settled=false;
      const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
      const abort=error=>{finish(error);try{tx?.abort();}catch{}};
      const timer=setTimeout(()=>abort(Error('Salvarea sau citirea planurilor a expirat. Nu a fost confirmată.')),timeoutMs);
      try{tx=db.transaction('register',mode);const store=tx.objectStore('register');
        tx.oncomplete=()=>finish();tx.onabort=tx.onerror=()=>finish(Error('Salvarea planurilor a fost refuzată. Modificarea nu este confirmată.'));
        const request=store.get(KEY);request.onsuccess=()=>{if(settled)return;try{if(mode==='readonly'){value=request.result??null;return;}const next=change(request.result??null);if(!next||typeof next!=='object'||!('record' in next))throw Error('Modificare invalidă.');store.put(next.record,KEY);value=next.value;}catch(error){abort(error);}};
      }catch{abort(Error('Citirea sau salvarea planurilor nu poate fi pornită.'))}
    });
  }
  return {read:()=>transaction('readonly'),update:change=>transaction('readwrite',change)};
}
function defaultStore(){try{return indexedStore(g.indexedDB);}catch{return {read:async()=>{throw Error('Browserul a refuzat accesul la copia planurilor.');},update:async()=>{throw Error('Browserul a refuzat salvarea planurilor.');}};}}
function create(storage,{durable=defaultStore(),notify=true}={}){
  const listeners=new Set();let channel=null,tail=Promise.resolve(),retention='local';
  if(notify&&g.BroadcastChannel)try{channel=new g.BroadcastChannel(CHANNEL);channel.onmessage=e=>{if(e.data?.key===KEY)for(const fn of listeners)try{fn();}catch{}};}catch{}
  function legacy(allowDenied=false){try{return storage.getItem(KEY)??null;}catch{if(allowDenied)return undefined;throw Error('Registrul local al planurilor nu poate fi citit. Nu este tratat ca un istoric gol.');}}
  function changed(){if(!notify)return;try{channel?.postMessage({key:KEY});}catch{}try{g.dispatchEvent?.(new g.CustomEvent('tt-plan-store-changed',{detail:{key:KEY}}));}catch{}}
  async function read(){const record=durable?await durable.read():null,result=reconcile(record,legacy(!!record));retention=result.state;return result;}
  function locked(operation){const run=()=>g.navigator?.locks?.request?g.navigator.locks.request(KEY,operation):operation();const pending=tail.catch(()=>{}).then(run);tail=pending;return pending;}
  function mutate(change){return locked(async()=>{
    let result;
    if(durable){result=await durable.update(record=>{const local=legacy(!!record),current=reconcile(record,local),next=change(current.plans);if(!Array.isArray(next))throw Error('Modificare invalidă.');const raw=JSON.stringify(next);parse(raw);if(legacy(!!record)!==local)throw conflict();return {record:{revision:current.revision+1,raw,localRaw:local===undefined?record.localRaw:local},value:{raw,plans:JSON.parse(raw),state:'indexeddb',revision:current.revision+1}};});}
    else{const raw=legacy(),next=change(parse(raw));if(!Array.isArray(next))throw Error('Modificare invalidă.');const json=JSON.stringify(next);parse(json);if(legacy()!==raw)throw conflict();try{storage.setItem(KEY,json);}catch{throw Error('Browserul a refuzat salvarea planului. Istoricul anterior este păstrat; exportă planurile pentru siguranță.');}result={raw:json,plans:JSON.parse(json),state:'local',revision:0};}
    retention=result.state;changed();return result;
  });}
  function replace(expected,next){return locked(async()=>{
    if(next!==undefined&&!Array.isArray(next))throw Error('Modificare invalidă.');
    const raw=next===undefined?null:JSON.stringify(next);parse(raw);let result=false;
    if(durable){await durable.update(record=>{const local=legacy(!!record),current=reconcile(record,local),value=current.raw===null?undefined:current.plans;if(!equal(value,expected))throw Error('Registrul s-a modificat. Reîncearcă reconcilierea.');if(legacy(!!record)!==local)throw conflict();result=true;return {record:{revision:current.revision+1,raw,localRaw:local===undefined?record.localRaw:local},value:true};});}
    else{const before=legacy();if(!equal(before===null?undefined:parse(before),expected))return false;if(legacy()!==before)throw conflict();try{if(raw===null)storage.removeItem(KEY);else storage.setItem(KEY,raw);}catch{throw Error('Browserul a refuzat salvarea planurilor sincronizate.');}result=true;}
    if(result){retention=durable?'indexeddb':'local';changed();}return result;
  });}
  async function archive(){try{return (await read()).raw??'[]';}catch{
    const errors=[];let local=null,backup=null;
    try{local=storage.getItem(KEY);}catch{errors.push('Registrul local nu poate fi citit.');}
    if(durable)try{backup=await durable.read();}catch{errors.push('Copia păstrată în browser nu poate fi citită.');}
    return JSON.stringify({format:'tt-trade-plans-recovery-v1',legacy:local,backup,errors});
  }}
  return {read,mutate,replace,archive,state:()=>retention,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},close:()=>{channel?.close();listeners.clear();}};
}
g.TTPlanStore={KEY,create,indexedStore,reconcile};
if(typeof module!=='undefined'&&module.exports)module.exports=g.TTPlanStore;
})(typeof window!=='undefined'?window:globalThis);
