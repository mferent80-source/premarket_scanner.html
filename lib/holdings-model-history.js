(function(g){
'use strict';
const VERSION='holdings-lab-history-v1',SUMMARY='holdings-lab-summary-v1',MAX=20,MAX_BYTES=256000;
const IDS=['neural','boosting','hmm','isolation','quantile','garch','knn'];
const MODEL_VERSIONS=['holdings-mlp-v3','holdings-gbt-v1','holdings-hmm-v1','holdings-isolation-v1','holdings-quantile-v1','holdings-garch-v1','holdings-knn-v1'];
const STATES=[['research','fragile','no-edge','drift','disagreement'],['research','no-edge','blocked','disagreement'],['descriptive','drift','weak','transition'],['ordinary','anomaly','uncertain'],['descriptive','limited','no-edge','drift'],['descriptive','limited','no-edge','drift'],['research','fragile','no-edge','drift','uncertain']];
const SUMMARY_STATES=['context','missing-eod','running','demo','review','conflict','disagreement','incomplete','blocked','no-edge','research'];
const finite=Number.isFinite,text=(v,max=2000)=>typeof v==='string'&&v.length>0&&v.length<=max;
function day(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&finite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;}
function identity(e){return !!e&&text(e.scope,500)&&text(e.symbol,50)&&text(e.currency,12)&&['market','synthetic'].includes(e.kind);}
function key(e){return identity(e)?'tt_holdings_model_history_v1:'+['scope','symbol','currency','kind'].map(k=>encodeURIComponent(e[k])).join('|'):null;}
function project(s,e,now){
 const total=s?.version===SUMMARY?4:s?.version==='holdings-lab-summary-v2'?5:s?.version==='holdings-lab-summary-v3'?7:0;
 if(!identity(e)||!finite(now)||!total||s.reviewOnly!==true||s.symbol!==e.symbol||s.currency!==e.currency||s.kind!==e.kind||!day(s.asOf)||Date.parse(s.asOf+'T00:00:00Z')>s.generatedAt||!finite(s.generatedAt)||s.generatedAt>now||!SUMMARY_STATES.includes(s.state)||!text(s.title)||s.total!==total||typeof s.busy!=='boolean'||!Array.isArray(s.cards)||s.cards.length!==total)return null;
 if(s.busy!==(s.state==='running')||(s.kind==='synthetic'&&!['demo','running'].includes(s.state))||(s.kind==='market'&&s.state==='demo'))return null;
 const cards=[];
 for(let i=0;i<total;i++){
  const c=s.cards[i];
  if(c?.id!==IDS[i]||!text(c.name,80)||!text(c.value,100)||!text(c.detail)||typeof c.available!=='boolean')return null;
  if(c.available){
   if(!STATES[i].includes(c.state)||c.version!==MODEL_VERSIONS[i]||!finite(c.trainedAt)||c.trainedAt>s.generatedAt||s.generatedAt-c.trainedAt>1800000)return null;
  }else if(!['missing','unavailable'].includes(c.state)||c.trainedAt!==null||c.version!==null)return null;
  const card={id:c.id,name:c.name,available:c.available,state:c.state,value:c.value,detail:c.detail,trainedAt:c.trainedAt,version:c.version};
  if(i===3&&c.available){
   if(!finite(c.score)||c.score<=0||c.score>1||!finite(c.threshold)||c.threshold<=0||c.threshold>1||!Number.isInteger(c.votes)||c.votes<0||c.votes>3)return null;
   Object.assign(card,{score:c.score,threshold:c.threshold,votes:c.votes});
  }
  if(i===4&&c.available){
   if(c.nominal!==.8||!finite(c.coverage)||c.coverage<0||c.coverage>1||!Number.isInteger(c.testN)||c.testN<60||!Number.isInteger(c.covered)||c.covered<0||c.covered>c.testN||Math.abs(c.coverage-c.covered/c.testN)>1e-7||!finite(c.widthPct)||c.widthPct<0)return null;
   Object.assign(card,{nominal:c.nominal,coverage:c.coverage,covered:c.covered,testN:c.testN,widthPct:c.widthPct});
  }
  cards.push(card);
 }
 if(s.available!==cards.filter(c=>c.available).length)return null;
 return {version:s.version,generatedAt:s.generatedAt,reviewOnly:true,symbol:s.symbol,currency:s.currency,asOf:s.asOf,kind:s.kind,state:s.state,title:s.title,available:s.available,total,busy:s.busy,cards};
}
function fingerprint(s){const {generatedAt,...content}=s;return JSON.stringify(content);}
function compare(previous,current,e,now=Date.now()){
 const a=project(previous,e,now),b=project(current,e,now);
 if(!a||!b||now-b.generatedAt>1800000)return {status:'incompatible',message:'Comparația cere o analiză actuală pentru același instrument, aceeași monedă și același tip de date.'};
 if(b.busy)return {status:'running',message:'Comparația se reface după terminarea analizei în curs.'};
 if(b.asOf<a.asOf||b.generatedAt<a.generatedAt)return {status:'older',message:'Analiza afișată este anterioară sintezei alese. Selectează o sinteză mai veche.'};
 const rows=b.cards.map((c,i)=>{
  const p=a.cards.find(p=>p.id===c.id);
  if(!p)return {id:c.id,name:c.name,before:'Model absent din versiunea salvată',after:c.value,beforeState:'new-model',afterState:c.state,added:true,availability:false,version:false,changed:false,retrained:false};
  const availability=c.available!==p.available,version=c.version!==p.version;
  const changed=availability||c.state!==p.state||c.value!==p.value||version;
  return {id:c.id,name:c.name,before:p.value,after:c.value,beforeState:p.state,afterState:c.state,availability,version,changed,retrained:c.available&&p.available&&c.trainedAt!==p.trainedAt};
 });
 const changed=rows.filter(r=>r.changed).length,sameSession=a.asOf===b.asOf;
 return {status:'compared',changed,sameSession,rows,from:a.asOf,to:b.asOf,beforeAvailable:a.available,afterAvailable:b.available,beforeTotal:a.total,afterTotal:b.total,beforeTitle:a.title,afterTitle:b.title,
  message:changed?changed+' / '+rows.filter(r=>!r.added).length+' rezultate comparabile au altă stare.':'Stările rezultatelor comparabile sunt neschimbate.'+(rows.some(r=>r.added)?' Modele noi, fără rezultat anterior.':''),
  limits:(sameSession?'Aceeași sesiune EOD: reanalizare, fără o sesiune nouă de piață. ':'Sesiuni EOD diferite; comparația descrie rezultatele salvate. ')+'Reantrenarea nu este dovadă independentă. HMM poate relabela regimurile; scorurile și pragurile Isolation nu măsoară riscul și nu se compară direct între antrenări.'};
}
function createStore(storage){
 function read(e,now=Date.now()){
  const k=key(e);if(!k)return {status:'identity',entries:[],message:'Instrumentul și moneda trebuie verificate înainte de salvare.'};
  try{
   const raw=storage.getItem(k);if(!raw)return {status:'ok',entries:[]};
   if(typeof raw!=='string'||raw.length>MAX_BYTES)throw Error('size');
   const data=JSON.parse(raw);
   if(data?.version!==VERSION||!Array.isArray(data.entries)||!data.entries.length||data.entries.length>MAX)throw Error('schema');
   const entries=[];let last=Infinity;const ids=new Set();
   for(const entry of data.entries){
    const summary=project(entry?.summary,e,now);
    if(!summary||summary.busy||summary.available===0||!text(entry.id,100)||ids.has(entry.id)||!finite(entry.savedAt)||entry.savedAt>now||entry.savedAt<summary.generatedAt||entry.savedAt>last)throw Error('entry');
    entries.push({id:entry.id,savedAt:entry.savedAt,summary});ids.add(entry.id);last=entry.savedAt;
   }
   return {status:'ok',entries};
  }catch{return {status:'unavailable',entries:[],message:'Istoricul local nu poate fi citit sau verificat. Datele existente sunt păstrate; salvarea este oprită.'};}
 }
 function save(s,e,now=Date.now()){
  const summary=project(s,e,now);
  if(!summary||summary.busy||!summary.available||now-summary.generatedAt>1800000)return {status:'blocked',message:'Păstrează o sinteză actuală, cu cel puțin un rezultat disponibil, după terminarea antrenării.'};
  const old=read(e,now);if(old.status!=='ok')return old;
  if(old.entries[0]&&fingerprint(old.entries[0].summary)===fingerprint(summary))return {status:'duplicate',entries:old.entries,message:'Aceleași rezultate sunt deja păstrate. Nu s-a creat un duplicat.'};
  let serial=old.entries.length;while(old.entries.some(x=>x.id===String(now)+'-'+serial))serial++;
  const id=String(now)+'-'+serial,entries=[{id,savedAt:now,summary},...old.entries].slice(0,MAX);
  // Preserve the original log if a clock change would break chronological order.
  if(old.entries[0]?.savedAt>now)return {status:'blocked',message:'Ora dispozitivului este anterioară istoricului. Verifică ora înainte de salvare.'};
  try{storage.setItem(key(e),JSON.stringify({version:VERSION,entries}));return {status:'saved',entries,message:'Sinteză păstrată local. '+entries.length+' / '+MAX+' înregistrări.'};}
  catch{return {status:'write-failed',entries:old.entries,message:'Sinteza nu a fost salvată. Stocarea locală nu este disponibilă sau este plină.'};}
 }
 return {read,save};
}
g.HoldingsModelHistory={VERSION,MAX,createStore,compare,key};
})(typeof window!=='undefined'?window:globalThis);
