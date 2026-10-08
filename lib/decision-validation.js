/* Prospective evidence from the original per-account forecast register. */
(function(g){
'use strict';
const F=g.HoldingsForecast,M=g.HoldingsForecastMonitor,MODELS=['neural','boosting','knn','quantile','hmm','isolation','garch','verdict'],VERSION='decision-validation-v1';
function build(item,{now=Date.now()}={}){
 const e=item?.identity,entries=item?.ledger?.entries;
 if(!F.identity(e)||item.ledger?.ok!==true||!Array.isArray(entries)||entries.length>F.MAX||entries.some(r=>!F.validEntry(r,e,now))||new Set(entries.map(r=>r.id)).size!==entries.length)return {version:VERSION,ok:false,reason:'Registrul prospectiv este incompatibil. Originalele sunt păstrate.',rows:[]};
 const trusted=entries.filter(r=>r.restoredAt===undefined&&r.modelVersion===F.VERSIONS[r.model]),rows=[];
 for(const model of MODELS)for(const horizon of model==='garch'?[5,20]:[5]){
  const row=M.build([{...item,ledger:{ok:true,entries:trusted}}],{scope:e.scope,kind:e.kind,model,horizon,now}).rows[0],r=row.report,restored=entries.filter(x=>x.model===model&&x.horizon===horizon&&x.restoredAt!==undefined).length,legacy=entries.filter(x=>x.model===model&&x.horizon===horizon&&x.modelVersion!==F.VERSIONS[x.model]).length;
  const classes=['neural','boosting','knn','verdict'].includes(model)&&r?.counts?.some(n=>!n),current=row.freshness&&!row.freshness.needsCheck&&row.freshness.state!=='unknown',canSupport=e.kind==='market'&&['neural','boosting','knn','quantile','garch'].includes(model)&&row.state==='monitor'&&!classes&&current;
  rows.push({...row,...(classes&&r.flags.enough?{state:'limited',label:'Clase incomplete'}:{}),restored,legacy,canSupport,reason:classes&&r.flags.enough?'Lipsește cel puțin o clasă observată; comparația direcțională rămâne incompletă.':model==='verdict'&&r.flags.enough?'Rezultat descriptiv al verdictului; nu există un reper comparativ pentru un avantaj validat.':row.reason});
 }
 return {version:VERSION,ok:true,identity:{...e},simulation:e.kind==='synthetic',generatedAt:now,rows,restored:entries.filter(r=>r.restoredAt!==undefined).length,total:entries.length,limits:'Rezultate pe model și instrument, pe orizonturi separate. HMM și Isolation sunt context. Numărul rezultatelor și avantajul observat nu reprezintă probabilitatea profitului.'};
}
function createReader({storage=g.localStorage,durable=g.HoldingsForecastStorage?.indexedStore(g.indexedDB)}={}){
 async function read(identity){
  const key=F.key(identity);if(!key)throw Error('Identitate incompletă pentru registrul prospectiv.');let local=storage.getItem(key),saved=null;
  if(durable)saved=await durable.get(key);
  const raw=saved&&local?g.HoldingsForecastStorage.merge(saved,local,key):saved??local;
  const ledger=F.createStore({getItem:()=>raw,setItem(){throw Error('Registru doar pentru citire.');}}).read(identity);
  if(!ledger.ok)throw Error(ledger.error);return {identity:{...identity},ledger,key,raw,saved,local};
 }
 async function check(identity,source,{now=Date.now()}={}){
  const before=await read(identity);let raw=before.raw;
  const store=F.createStore({getItem:()=>raw,setItem:(_,v)=>{raw=v;}}),result=store.check(identity,source,now);if(!result.ok)throw Error(result.error);
  if(durable){const saved=await durable.write([{key:before.key,before:before.saved,value:raw,merge:true}]);raw=saved.get(before.key);}
  else{
   const write=()=>{const current=storage.getItem(before.key),merged=g.HoldingsForecastStorage.merge(current,raw,before.key);if(storage.getItem(before.key)!==current)throw Error('Registrul s-a schimbat. Reîncearcă verificarea.');storage.setItem(before.key,merged);raw=merged;};
   if(g.navigator?.locks?.request)await g.navigator.locks.request(before.key,write);else write();
  }
  const ledger=F.createStore({getItem:()=>raw,setItem(){}}).read(identity);if(!ledger.ok)throw Error(ledger.error);return {identity:{...identity},ledger};
 }
 return {read,check};
}
const liveCache=new Map();let liveReader=null;
function liveIdentity(candidate,scope){return candidate?.currency==='USD'&&(candidate.kind||'market')==='market'&&/^[A-Z0-9.-]+$/.test(candidate.symbol||'')&&scope?{scope,ticker:candidate.symbol+'_US_EQ',symbol:candidate.symbol,currency:'USD',kind:'market'}:null;}
function root(){try{return g.parent!==g&&g.parent?.TTDecisionValidation?g.parent:g;}catch{return g;}}
function activeScope(){try{return root().T212Snapshot?.read('live')?.[0]||null;}catch{return null;}}
function signal(){if(!g.dispatchEvent||!g.CustomEvent)return;const emit=w=>{try{w.dispatchEvent(new w.CustomEvent('tt-decision-validation-updated'));}catch{}};emit(g);g.document?.querySelectorAll('iframe').forEach(f=>emit(f.contentWindow));}
async function loadLive(e){
 const k=F.key(e),old=liveCache.get(k);if(old?.pending)return old.pending;if(old&&Date.now()-old.at<30000)return old;
 const row={...old,pending:null};liveCache.set(k,row);
 row.pending=(async()=>{try{liveReader=liveReader||createReader();const item=await liveReader.read(e);row.value={...build(item),readAt:Date.now()};}catch{row.value=null;}row.at=Date.now();row.pending=null;signal();return row;})();return row.pending;
}
function peekCandidate(candidate,scope=activeScope()){
 const host=root();if(host!==g)return host.TTDecisionValidation.peekCandidate(candidate,scope);
 const e=liveIdentity(candidate,scope);if(!e||scope!==activeScope())return null;const row=liveCache.get(F.key(e));void loadLive(e);return row?.value&&Date.now()-row.value.readAt<=60000?row.value:null;
}
async function getCandidate(candidate,scope=activeScope()){
 const host=root();if(host!==g)return host.TTDecisionValidation.getCandidate(candidate,scope);
 const e=liveIdentity(candidate,scope);if(!e||scope!==activeScope())return null;const row=await loadLive(e);return scope===activeScope()?row.value:null;
}
g.TTDecisionValidation={VERSION,MODELS,build,createReader,peekCandidate,getCandidate,activeScope};
})(typeof window!=='undefined'?window:globalThis);
