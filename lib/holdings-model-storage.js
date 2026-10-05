/* Persistence of calculated reports is separate from model validity and ledgers. */
(function(g){
'use strict';
function warning(error){
 const full=error?.name==='QuotaExceededError'||error?.code===22||error?.code===1014;
 return 'Raport calculat și verificat, disponibil doar în această sesiune. '+(full?'Spațiul local al browserului este plin.':'Browserul a refuzat salvarea permanentă.')+' Descarcă raportul pentru păstrare.';
}
function create(storage){
 const demo=new Map(),temporary=new Map(),warnings=new Map();
 function read(key,synthetic){const raw=synthetic?demo.get(key):temporary.has(key)?temporary.get(key):storage.getItem(key);return raw?JSON.parse(raw):null;}
 function save(key,record,synthetic){
  const next={...record,retention:synthetic?'demo':'local'},json=JSON.stringify(next);
  if(synthetic){demo.set(key,json);return 'demo';}
  try{storage.setItem(key,json);temporary.delete(key);warnings.delete(key);return 'local';}
  catch(error){next.retention='session';temporary.set(key,JSON.stringify(next));warnings.set(key,warning(error));return 'session';}
 }
 function inspect(key,synthetic,usable){return {state:synthetic?'demo':temporary.has(key)?'session':'local',message:usable&&!synthetic?warnings.get(key)||null:null};}
 function captureFailed(key,synthetic){if(!synthetic)warnings.set(key,(warnings.get(key)||'Raport calculat și verificat.')+' Registrul estimărilor nu a putut fi actualizat.');}
 return {read,save,inspect,captureFailed};
}
g.HoldingsModelStorage={create};
if(typeof module!=='undefined'&&module.exports)module.exports=g.HoldingsModelStorage;
})(typeof window!=='undefined'?window:globalThis);
