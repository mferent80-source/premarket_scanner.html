(function(g){
'use strict';
const F=g.HoldingsForecast,VERSION='holdings-forecast-backup-v1',ARCHIVE_VERSION='holdings-forecast-restore-v1',MAX_FILE_BYTES=64*1024*1024;
const clone=x=>JSON.parse(JSON.stringify(x)),keys=(x,allowed)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).every(k=>allowed.includes(k));
function canonical(x){if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';return JSON.stringify(x);}
function original(r){const {outcome,verification,restoredAt,...forecast}=r;return canonical(forecast);}
function result(r){if(!r.outcome)return null;const {t,asOf,close,path}=r.outcome;return canonical({t,asOf,close,path});}
function validRows(rows,e,now){return Array.isArray(rows)&&rows.length<=F.MAX&&rows.every(r=>F.validEntry(r,e,now))&&new Set(rows.map(r=>r.id)).size===rows.length;}
function manifest(rows){const groups=new Map();for(const r of rows){const id=r.model+'|'+r.horizon;if(!groups.has(id))groups.set(id,{model:r.model,horizon:r.horizon,modelVersion:r.modelVersion,count:0});groups.get(id).count++;}return {version:VERSION,count:rows.length,models:[...groups.values()].sort((a,b)=>a.model.localeCompare(b.model)||a.horizon-b.horizon)};}
function create(e,rows,now=Date.now()){
 if(!F.identity(e)||!Number.isFinite(now)||!validRows(rows,e,now))throw Error('Registrul nu poate fi exportat în siguranță.');
 return {ticker:e.ticker,symbol:e.symbol,currency:e.currency,kind:e.kind,asOf:rows.length?rows.map(r=>r.source.asOf).sort().at(-1):'registru',exportedAt:now,result:{version:F.VERSION,reviewOnly:true,manifest:manifest(rows),entries:clone(rows),reports:F.report(rows)}};
}
function parse(raw,e,now=Date.now()){
 if(!F.identity(e)||typeof raw!=='string'||raw.length>MAX_FILE_BYTES)throw Error('Fișier absent, prea mare sau identitate incompletă.');
 let d;try{d=JSON.parse(raw);}catch{throw Error('Fișierul nu conține un JSON valid.');}
 if(!keys(d,['ticker','symbol','currency','kind','asOf','exportedAt','result'])||d.symbol!==e.symbol||d.currency!==e.currency||d.kind!==e.kind||d.ticker!==undefined&&d.ticker!==e.ticker)throw Error('Backup-ul aparține altui instrument, altei monede sau altui tip de date. Alege deținerea potrivită.');
 const r=d.result;
 if(!keys(r,['version','reviewOnly','manifest','entries','reports'])||r.version!==F.VERSION||r.reviewOnly!==true||!validRows(r.entries,e,now))throw Error('Registru incompatibil, înregistrări invalide sau duplicate în fișier. Datele locale sunt păstrate.');
 if(d.exportedAt!==undefined&&(!Number.isFinite(d.exportedAt)||d.exportedAt>now||r.entries.some(x=>x.capturedAt>d.exportedAt||x.verification.checkedAt>d.exportedAt)))throw Error('Cronologia backup-ului nu poate fi verificată.');
 if(r.manifest!==undefined&&canonical(r.manifest)!==canonical(manifest(r.entries)))throw Error('Numărul de înregistrări sau versiunile din manifest nu corespund registrului.');
 if(JSON.stringify({version:F.VERSION,entries:r.entries}).length>F.MAX_BYTES)throw Error('Registrul depășește limita de stocare.');
 return clone(r.entries);
}
function archiveKey(e){return F.key(e)?.replace('tt_holdings_forecast_v1:','tt_holdings_forecast_restore_v1:')||null;}
function createRestorer(storage){
 const plans=new WeakMap(),store=F.createStore(storage),readRaw=k=>{try{const raw=storage.getItem(k);return raw===undefined?null:raw;}catch{throw Error('Stocarea browserului nu poate fi citită. Datele existente sunt păstrate.');}},writeRaw=(k,v)=>{try{storage.setItem(k,v);}catch{throw Error('Salvarea în stocarea browserului a eșuat. Verifică spațiul și accesul.');}};
 function ledger(e,now){const raw=readRaw(F.key(e)),d=store.read(e);if(!d.ok||raw!==null&&!keys(JSON.parse(raw),['version','entries'])||!validRows(d.entries,e,now))throw Error('Registru local ilizibil. Datele existente sunt păstrate.');return {raw,entries:d.entries};}
 function history(e,now){
  const raw=readRaw(archiveKey(e));if(raw===null)return {raw,records:[]};
  if(typeof raw!=='string'||raw.length>MAX_FILE_BYTES)throw Error('Arhiva restaurărilor este ilizibilă sau plină.');
  let d;try{d=JSON.parse(raw);}catch{throw Error('Arhiva restaurărilor este ilizibilă.');}
  if(!keys(d,['version','records'])||d.version!==ARCHIVE_VERSION||!Array.isArray(d.records)||d.records.length>100)throw Error('Arhiva restaurărilor este incompatibilă.');
  for(const r of d.records){
   if(!keys(r,['operation','at','before','added'])||!['restore','undo'].includes(r.operation)||!Number.isFinite(r.at)||r.at>now||!validRows(r.added,e,now))throw Error('Arhiva restaurărilor este incompatibilă.');
   if(r.before!==null){let old;try{old=JSON.parse(r.before);}catch{throw Error('Copia anterioară din arhivă este ilizibilă.');}if(!keys(old,['version','entries'])||old.version!==F.VERSION||!validRows(old.entries,e,now))throw Error('Copia anterioară din arhivă este incompatibilă.');}
  }
  return {raw,records:d.records};
 }
 function preview(raw,e,now=Date.now()){
  try{
   if(!F.identity(e))throw Error('Identitate incompletă.');
   const current=ledger(e,now),archive=history(e,now),incoming=parse(raw,e,now),existing=new Map(current.entries.map(r=>[r.id,r])),additions=[],conflicts=[];let duplicates=0;
   for(const r of incoming){const local=existing.get(r.id);if(!local)additions.push(r);else if(original(local)!==original(r)||result(local)&&result(r)&&result(local)!==result(r))conflicts.push({id:r.id,model:r.model,horizon:r.horizon,asOf:r.source.asOf});else duplicates++;}
   const plan={ok:true,symbol:e.symbol,currency:e.currency,kind:e.kind,count:incoming.length,localCount:current.entries.length,duplicates,conflicts,additions:additions.map(r=>({id:r.id,model:r.model,horizon:r.horizon,asOf:r.source.asOf})),max:F.MAX};
   plans.set(plan,{key:F.key(e),before:current.raw,archiveBefore:archive.raw,additions:clone(additions)});return plan;
  }catch(err){return {ok:false,error:err.message};}
 }
 function commit(e,current,archive,rows,event){
  const data=JSON.stringify({version:F.VERSION,entries:rows}),backup=JSON.stringify({version:ARCHIVE_VERSION,records:[...archive.records,event]});
  if(rows.length>F.MAX||data.length>F.MAX_BYTES)throw Error('Registrul ar depăși limita. Selectează mai puține estimări.');
  if(archive.records.length>=100||backup.length>MAX_FILE_BYTES)throw Error('Arhiva restaurărilor este plină. Exportă arhiva; datele existente sunt păstrate.');
  if(readRaw(F.key(e))!==current.raw||readRaw(archiveKey(e))!==archive.raw)throw Error('Registrul sau arhiva s-a schimbat. Reîncarcă previzualizarea.');
  if(storage.commit){storage.commit([{key:archiveKey(e),value:backup,before:archive.raw},{key:F.key(e),value:data,before:current.raw}]);return;}
  // Keep the exact pre-write registry before mutating the active records.
  writeRaw(archiveKey(e),backup);
  if(readRaw(F.key(e))!==current.raw||readRaw(archiveKey(e))!==backup)throw Error('Datele s-au schimbat în timpul restaurării. Registrul activ nu a fost înlocuit.');
  writeRaw(F.key(e),data);
 }
 function restore(plan,e,selected,now=Date.now()){
  try{
   const saved=plans.get(plan);if(!saved||saved.key!==F.key(e)||!Array.isArray(selected)||!selected.length||new Set(selected).size!==selected.length)throw Error('Selectează estimările noi din previzualizarea curentă.');
   const allowed=new Map(saved.additions.map(r=>[r.id,r]));if(selected.some(id=>!allowed.has(id)))throw Error('Selecția nu corespunde previzualizării.');
   const current=ledger(e,now),archive=history(e,now);if(current.raw!==saved.before||archive.raw!==saved.archiveBefore)throw Error('Registrul sau arhiva s-a schimbat. Reîncarcă previzualizarea.');
   const added=selected.map(id=>{const r=clone(allowed.get(id));r.restoredAt=now;r.verification={state:r.outcome?'unverifiable':'pending',checkedAt:null,sessions:0,reason:'Estimare restaurată; rezultatul cere reverificarea sursei publice.'};return r;});
   if(!validRows(added,e,now))throw Error('Estimările selectate nu mai pot fi verificate.');
   const rows=[...current.entries,...added].sort((a,b)=>a.source.t-b.source.t||a.id.localeCompare(b.id));
   commit(e,current,archive,rows,{operation:'restore',at:now,before:current.raw,added});plans.delete(plan);return {ok:true,saved:added.length,entries:rows};
  }catch(err){return {ok:false,error:/quota|storage|denied/i.test(err.message)?'Restaurarea nu a fost salvată. Verifică spațiul și accesul la stocarea browserului.':err.message};}
 }
 function lastRestore(current,archive){return archive.records.slice().reverse().find(r=>r.operation==='restore'&&r.added.some(a=>current.entries.some(b=>b.id===a.id)))||null;}
 function undo(e,now=Date.now()){
  try{
   const current=ledger(e,now),archive=history(e,now),last=lastRestore(current,archive);if(!last)throw Error('Nu există estimări restaurate de anulat.');
   const ids=new Set(last.added.map(r=>r.id)),removed=current.entries.filter(r=>ids.has(r.id));
   if(removed.some(r=>original(r)!==original(last.added.find(a=>a.id===r.id))))throw Error('O estimare restaurată s-a schimbat. Anularea este blocată pentru a păstra datele curente.');
   const rows=current.entries.filter(r=>!ids.has(r.id));
   commit(e,current,archive,rows,{operation:'undo',at:now,before:current.raw,added:[]});return {ok:true,removed:removed.length,entries:rows};
  }catch(err){return {ok:false,error:/quota|storage|denied/i.test(err.message)?'Anularea nu a fost salvată. Datele și arhiva sunt păstrate.':err.message};}
 }
 function status(e,now=Date.now()){try{const current=ledger(e,now),archive=history(e,now),last=lastRestore(current,archive);return {ok:true,records:archive.records.length,undoCount:last?current.entries.filter(r=>last.added.some(a=>a.id===r.id)).length:0};}catch(err){return {ok:false,records:0,undoCount:0,error:err.message};}}
 function exportArchive(e,now=Date.now()){const archive=history(e,now);return {ticker:e.ticker,symbol:e.symbol,currency:e.currency,kind:e.kind,asOf:new Date(now).toISOString().slice(0,10),exportedAt:now,result:{version:ARCHIVE_VERSION,reviewOnly:true,records:clone(archive.records)}};}
 return {preview,restore,undo,status,exportArchive};
}
g.HoldingsForecastBackup={VERSION,ARCHIVE_VERSION,MAX_FILE_BYTES,create,parse,createRestorer,archiveKey};
})(typeof window!=='undefined'?window:globalThis);
