import './trade-evidence-schema.js';
export const KEYS=Object.freeze(['tt_journal_v1','tt_trade_plans_v1','tt_ticket_capital','tt_journal_settings_v1','tt_trading212_fills_v1','tt_trading212_portfolio_v1','tt_trading212_account_history_v1','tt_trading212_cash_v1','tt_holdings_theses_v1','tt_holdings_symbols_v1','tt_holdings_benchmarks_v1','wl_stocks','tt_theme','tt_pf_account','cloud_credentials','tt_europe_signals_v1','tt_europe_risk_settings_v1','tt_radar_access_v1',globalThis.TradeEvidenceSchema.KEY,...Array.from({length:64},(_,i)=>globalThis.TradeEvidenceSchema.KEY+':'+i.toString(16).padStart(2,'0')),...Array.from({length:64},(_,i)=>'tt_holdings_forecast_sync_v1:'+i.toString(16).padStart(2,'0')),'tt_trading212_fills_v1:cont',...Array.from({length:16},(_,i)=>'tt_trading212_fills_v1:'+i.toString(16).padStart(2,'0')),
 // 27.10.2026 (lotul A, I-749 + contractele dintre loturi): ordinele în așteptare de la broker, kill switch-ul, limitele Governor (fără capital), jurnalul limitelor, cititorii Trading 212 (I-748)
 'tt_trading212_orders_pending_v1','tt_governor_oprire_v1','tt_governor_cfg_v1','tt_governor_limite_jurnal_v1','tt_t212_cititori_v1']);
// Captures are immutable. Fixed buckets keep each encrypted record below the
// service limit without discarding older analyses or changing their local identity.
const EvidenceSchema=globalThis.TradeEvidenceSchema,EVIDENCE_KEY=EvidenceSchema.KEY;
const evidenceKeys=Object.freeze(KEYS.filter(k=>k.startsWith(EVIDENCE_KEY+':')));
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
function bucket(id){let h=2166136261;for(let i=0;i<id.length;i++)h=Math.imul(h^id.charCodeAt(i),16777619);return evidenceKeys[(h>>>0)%64];}
function validateEvidence(key,value){if(!EvidenceSchema.ledger(value)||key!==EVIDENCE_KEY&&value.entries.some(r=>bucket(r.id)!==key))throw Error('invalid_analysis_ledger');}
function evidenceMerge(key,base,local,remote,choice=null){
 const entries=new Map(),conflicts=new Set();
 for(const ledger of [base,choice==='remote'?local:remote,choice==='remote'?remote:local]){
  if(ledger==null)continue;validateEvidence(key,ledger);
  for(const r of ledger.entries){const old=entries.get(r.id);if(old&&canonical(old)!==canonical(r))conflicts.add(key+'/entries/'+r.id);entries.set(r.id,r);}
 }
 const value=entries.size?{version:EvidenceSchema.VERSION,entries:[...entries.values()].sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id))}:undefined;
 if(value)validateValue(key,value);
 return {value,conflicts:choice?[]:[...conflicts]};
}
function evidenceStore(storage){
 let cachedRaw,cachedGroups;
 function read(){const raw=storage.getItem(EVIDENCE_KEY);if(raw!==cachedRaw||!cachedGroups){const value=raw===null?{version:EvidenceSchema.VERSION,entries:[]}:JSON.parse(raw);validateEvidence(EVIDENCE_KEY,value);cachedGroups=new Map(evidenceKeys.map(k=>[k,[]]));for(const r of value.entries)cachedGroups.get(bucket(r.id)).push(r);cachedRaw=raw;}return cachedGroups;}
 function value(key){const entries=read().get(key);if(!entries)throw Error('invalid_key');return entries.length?{version:EvidenceSchema.VERSION,entries:[...entries].sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id))}:undefined;}
 function replace(key,expected,next){if(!evidenceKeys.includes(key))throw Error('invalid_key');if(next!=null)validateValue(key,next);if(canonical(value(key))!==canonical(expected))return false;const before=cachedRaw,entries=[];for(const [k,records] of read())entries.push(...(k===key?next?.entries||[]:records));const ledger={version:EvidenceSchema.VERSION,entries};validateEvidence(EVIDENCE_KEY,ledger);if(storage.getItem(EVIDENCE_KEY)!==before)return false;storage.setItem(EVIDENCE_KEY,JSON.stringify(ledger));cachedGroups=null;return true;}
 return {value,replace};
}
export const EvidenceCloud=Object.freeze({KEY:EVIDENCE_KEY,keys:evidenceKeys,bucket,isKey:k=>k===EVIDENCE_KEY||evidenceKeys.includes(k),isBucket:k=>evidenceKeys.includes(k),createStore:evidenceStore,resolve:(key,base,local,remote,choice)=>evidenceMerge(key,base,local,remote,choice)});
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
/* 16.10.2026: registrul de învățare al Portofoliului (estimări păstrate la timp + rezultatele verificate) circulă între dispozitive. Estimările se
   împart pe identificator în 64 de pachete (un registru de poziție poate depăși cu timpul limita de 1 MB a unei înregistrări). Estimarea originală
   nu se schimbă; rezultatul verificat vine din copia verificată cel mai recent; nimic nu se șterge, deci nu există conflicte. */
const FORECAST_PREFIX='tt_holdings_forecast_sync_v1:',FORECAST_LEDGER='tt_holdings_forecast_v1:',FORECAST_VERSION='forecast-sync-v1';
const forecastKeys=Object.freeze(KEYS.filter(k=>k.startsWith(FORECAST_PREFIX)));
function forecastBucket(ledger,id){const s=String(ledger)+'|'+String(id);let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return forecastKeys[(h>>>0)%64];}
// în cloud circulă ultimele 90 de zile (pe zi întreagă UTC, aceeași pe ambele dispozitive); pe dispozitiv rămâne tot istoricul
const FORECAST_DAYS=90,FORECAST_BYTES=900000;
const forecastCutoff=(now=Date.now())=>Math.floor(now/86400000)*86400000-FORECAST_DAYS*86400000;
const forecastEntry=r=>object(r)&&typeof r.id==='string'&&r.id.length>0&&r.id.length<=400&&object(r.source)&&Number.isFinite(r.source.t);
function validateForecast(key,value){
 if(!object(value)||value.version!==FORECAST_VERSION||!object(value.ledgers))throw Error('invalid_forecast_ledger');
 for(const [k,d] of Object.entries(value.ledgers)){if(!k.startsWith(FORECAST_LEDGER)||k.length>600||!object(d)||typeof d.version!=='string'||!Array.isArray(d.entries)||d.entries.length>20000||!d.entries.every(r=>forecastEntry(r)&&forecastBucket(k,r.id)===key)||new Set(d.entries.map(r=>r.id)).size!==d.entries.length)throw Error('invalid_forecast_ledger');}
}
const forecastOriginal=r=>{const x={...r};delete x.outcome;delete x.verification;return canonical(x);};
/* Regula nu depinde de ordine (merge(a,b) ≡ merge(b,a)), altfel două dispozitive și-ar rescrie la nesfârșit aceeași estimare. Ca în
   HoldingsForecastStorage.merge: originalul nu se amestecă, verificarea mai recentă câștigă, rezultate diferite ⇒ „neverificabil”. */
const smaller=(a,b)=>canonical(a)<=canonical(b)?a:b;
function pickForecast(x,r){
 if(forecastOriginal(x)!==forecastOriginal(r)){const cx=Number(x.capturedAt??x.source.t),cr=Number(r.capturedAt??r.source.t);return cr<cx?r:cx<cr?x:smaller(x,r);}
 const vx=Number(x.verification?.checkedAt)||0,vr=Number(r.verification?.checkedAt)||0,ver=vr>vx?r.verification:vx>vr?x.verification:smaller(x.verification??null,r.verification??null);
 if(x.outcome&&r.outcome&&canonical(x.outcome.path)!==canonical(r.outcome.path)){const ox=Number(x.outcome.checkedAt)||0,or=Number(r.outcome.checkedAt)||0,keep=or<ox?r:ox<or?x:smaller(x,r);
  return {...keep,verification:{...(ver||{}),state:'unverifiable',checkedAt:Math.max(vx,vr),reason:'Rezultate diferite între copii; rezultatul original este păstrat.'}};}
 const outcome=x.outcome&&r.outcome?smaller(x.outcome,r.outcome):x.outcome||r.outcome,out={...x,verification:ver};if(outcome)out.outcome=outcome;else delete out.outcome;if(ver==null)delete out.verification;return out;
}
function mergeForecastLedger(a,b){
 if(!a)return b;if(!b)return a;if(a.version!==b.version)return a.version>b.version?a:b;const rows=new Map(a.entries.map(r=>[r.id,r]));
 for(const r of b.entries){const x=rows.get(r.id);rows.set(r.id,x?pickForecast(x,r):r);}
 return {version:a.version,entries:[...rows.values()].sort((p,q)=>p.source.t-q.source.t||p.id.localeCompare(q.id))};
}
// valoarea din cloud: doar fereastra de 90 de zile și sub plafonul unui pachet (cele mai vechi ies primele, la fel pe ambele dispozitive)
function forecastCloudValue(ledgers,now=Date.now()){
 const cut=forecastCutoff(now),out={};for(const [k,d] of Object.entries(ledgers)){const entries=d.entries.filter(r=>r.source.t>=cut);if(entries.length)out[k]={version:d.version,entries};}
 const keys=Object.keys(out).sort();let value=keys.length?{version:FORECAST_VERSION,ledgers:Object.fromEntries(keys.map(k=>[k,out[k]]))}:undefined;
 while(value&&new TextEncoder().encode(JSON.stringify(value)).length>FORECAST_BYTES){let old=null;for(const k of Object.keys(value.ledgers)){const r=value.ledgers[k].entries[0];if(r&&(!old||r.source.t<old.r.source.t||r.source.t===old.r.source.t&&(k+r.id)<(old.k+old.r.id)))old={k,r};}
  if(!old)break;value.ledgers[old.k].entries.shift();if(!value.ledgers[old.k].entries.length)delete value.ledgers[old.k];if(!Object.keys(value.ledgers).length)value=undefined;}
 return value;
}
function forecastMerge(key,base,local,remote){
 const ledgers={};for(const v of [base,local,remote]){if(v==null)continue;validateForecast(key,v);for(const [k,d] of Object.entries(v.ledgers))ledgers[k]=mergeForecastLedger(ledgers[k],d);}
 return {value:forecastCloudValue(ledgers),conflicts:[]};
}
export const ForecastCloud=Object.freeze({PREFIX:FORECAST_PREFIX,LEDGER:FORECAST_LEDGER,VERSION:FORECAST_VERSION,keys:forecastKeys,isBucket:k=>forecastKeys.includes(k),bucket:forecastBucket,mergeLedger:mergeForecastLedger,merge:forecastMerge,validate:validateForecast,cloudValue:forecastCloudValue,cutoff:forecastCutoff});
/* 19.10.2026 (I-697): execuțiile Trading 212 (2.444 ⇒ 860 KB din limita de 1 MB a unei înregistrări, istoricul încă incomplet) circulă în 16 pachete
   fixe după cont + id-ul execuției (FNV-1a, ca analizele) și un pachet „:cont” cu starea importului (fetchedAt, complete, cursor). Id-ul unei execuții
   nu se schimbă ⇒ pachetul ei e stabil; 16 pachete ⇒ ~16 MB (~45.000 execuții) cu cel mult 16 scrieri la un import mare, iar starea importului
   (rescrisă la 12–60 s) atinge doar „:cont”. Unirea pe id, ca la cheia veche: nimic nu se șterge; aceeași execuție diferită pe două aparate = conflict. */
const FILLS_KEY='tt_trading212_fills_v1',FILLS_META=FILLS_KEY+':cont',FILLS_VERSION='fills-sync-v1';
const fillsKeys=Object.freeze(KEYS.filter(k=>k.startsWith(FILLS_KEY+':'))),fillsItemKeys=fillsKeys.filter(k=>k!==FILLS_META);
function fillsBucket(scope,id){const s=String(scope)+'|'+String(id);let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return fillsItemKeys[(h>>>0)%fillsItemKeys.length];}
const fillId=x=>object(x)&&(typeof x.id==='string'&&x.id!==''||Number.isFinite(x.id));
const fillOrder=(a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0)||(String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0);
function validateFills(key,value){
 if(!fillsKeys.includes(key)||!object(value)||value.version!==FILLS_VERSION||!object(value.accounts))throw Error('invalid_value');
 for(const [scope,a] of Object.entries(value.accounts)){
  if(!scope||scope.length>200||!object(a))throw Error('invalid_value');
  if(key===FILLS_META){if(Object.hasOwn(a,'items'))throw Error('invalid_value');continue;}
  if(Object.keys(a).some(k=>k!=='items')||!Array.isArray(a.items)||!a.items.length)throw Error('invalid_value');
  const ids=new Set();for(const x of a.items){if(!fillId(x)||fillsBucket(scope,x.id)!==key||ids.has(String(x.id)))throw Error('invalid_value');ids.add(String(x.id));}
 }
}
// registrul local ({accounts:{cont:{...stare, items}}}) ⇒ valoarea fiecărui pachet; pachetele goale lipsesc (undefined)
function fillsSplit(data){
 const out=new Map(),meta={};
 for(const scope of Object.keys(object(data?.accounts)?data.accounts:{}).sort()){const a=data.accounts[scope];if(!object(a))continue;const {items,...rest}=a;meta[scope]=rest;
  for(const x of Array.isArray(items)?items:[]){if(!fillId(x))continue;const k=fillsBucket(scope,x.id);if(!out.has(k))out.set(k,{});const g=out.get(k);(g[scope]||(g[scope]=new Map())).set(String(x.id),x);}}
 for(const [k,g] of out)out.set(k,{version:FILLS_VERSION,accounts:Object.fromEntries(Object.entries(g).map(([scope,m])=>[scope,{items:[...m.values()].sort(fillOrder)}]))});
 if(Object.keys(meta).length)out.set(FILLS_META,{version:FILLS_VERSION,accounts:meta});
 return out;
}
// înlocuiește în registrul local doar partea unui pachet; restul execuțiilor (și cele fără id) rămân neatinse
function fillsApply(data,key,next){
 const accounts={};for(const [scope,a] of Object.entries(object(data?.accounts)?data.accounts:{}))accounts[scope]=object(a)?{...a,items:(Array.isArray(a.items)?a.items:[]).filter(x=>key===FILLS_META||!fillId(x)||fillsBucket(scope,x.id)!==key)}:a;
 if(key===FILLS_META){for(const [scope,m] of Object.entries(next?.accounts||{}))accounts[scope]={...m,items:object(accounts[scope])?accounts[scope].items:[]};}
 else for(const [scope,g] of Object.entries(next?.accounts||{})){const a=object(accounts[scope])?accounts[scope]:(accounts[scope]={items:[]});a.items=[...a.items,...g.items].sort(fillOrder);}
 return {...(object(data)?data:{}),accounts};
}
function fillsMerge(key,base,local,remote){
 for(const v of [local,remote])if(v!=null)validateFills(key,v);
 if(local==null||remote==null||equal(local,remote))return {value:local??remote,conflicts:[]};
 const accounts={},conflicts=[];
 for(const scope of [...new Set([...Object.keys(remote.accounts),...Object.keys(local.accounts)])].sort()){const l=local.accounts[scope],r=remote.accounts[scope];
  if(!l||!r){accounts[scope]=l||r;continue;}
  // starea importului: cea citită mai recent de la broker; la aceeași oră aceeași alegere pe ambele aparate (altfel și-ar rescrie-o la nesfârșit)
  if(key===FILLS_META){const tl=Date.parse(l.fetchedAt),tr=Date.parse(r.fetchedAt),nl=Number.isFinite(tl)?tl:-Infinity,nr=Number.isFinite(tr)?tr:-Infinity,latest=nr>nl?r:nl>nr?l:smaller(l,r);accounts[scope]=l.complete===true||r.complete===true?{...latest,complete:true}:latest;continue;}
  const byId=new Map(r.items.map(x=>[String(x.id),x]));for(const x of l.items){const old=byId.get(String(x.id));if(old&&!equal(old,x))conflicts.push(key+'/accounts/'+scope+'/items/'+x.id);else byId.set(String(x.id),x);}
  accounts[scope]={items:[...byId.values()].sort(fillOrder)};
 }
 return conflicts.length?{value:local,conflicts}:{value:{version:FILLS_VERSION,accounts},conflicts:[]};
}
export const FillsCloud=Object.freeze({KEY:FILLS_KEY,META:FILLS_META,VERSION:FILLS_VERSION,keys:fillsKeys,isKey:k=>fillsKeys.includes(k),bucket:fillsBucket,split:fillsSplit,apply:fillsApply,validate:validateFills,merge:fillsMerge});
const categories=['growth','earlyLong','reversal','earlyReversal'];
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
function validateEuropeHistory(value){
 if(!object(value)||value.schema!==1||!Array.isArray(value.entries)||value.entries.length>1500)throw Error('invalid_value');
 const ids=new Set();
 for(const e of value.entries){
  if(!object(e)||typeof e.id!=='string'||ids.has(e.id)||typeof e.symbol!=='string'||!e.symbol||!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(e.isin||'')||!categories.includes(e.category)||!categories.includes(e.currentCategory)||!date(e.firstDate)||!date(e.lastDate)||e.lastDate<e.firstDate||e.id!==e.isin+':'+e.firstDate+':'+e.category||!['EUR','GBP','CHF','DKK','SEK'].includes(e.currency)||!['ACTIVE','LEFT','INVALIDATED'].includes(e.status)||e.active!==(e.status==='ACTIVE')||!Number.isFinite(e.createdAt)||e.createdAt<0||!['firstPrice','lastPrice','firstStop','support'].every(k=>Number.isFinite(e[k])&&e[k]>0)||!Array.isArray(e.transitions)||!e.transitions.length||!object(e.outcomes))throw Error('invalid_value');
  if(e.endDate!==undefined&&(!date(e.endDate)||e.endDate<e.firstDate||e.endDate>e.lastDate))throw Error('invalid_value');
  if(e.confirmedAt!==undefined&&(!date(e.confirmedAt)||e.confirmedAt<e.firstDate||e.confirmedAt>e.lastDate))throw Error('invalid_value');
  if(e.review!==undefined&&typeof e.review!=='string')throw Error('invalid_value');
  for(const t of e.transitions)if(!object(t)||!categories.includes(t.category)||!date(t.date)||t.date<e.firstDate||t.date>e.lastDate)throw Error('invalid_value');
  for(const [n,o] of Object.entries(e.outcomes))if(!['5','10','20'].includes(n)||!object(o)||!Number.isFinite(o.pct)||!date(o.date)||o.date<=e.firstDate)throw Error('invalid_value');
  ids.add(e.id);
 }
}
function mergeEuropeHistory(base,local,remote){
 if(!local||!remote||equal(local,remote))return merge(base,local,remote,'tt_europe_signals_v1');
 try{validateEuropeHistory(local);validateEuropeHistory(remote);}catch{return {value:local,conflicts:['tt_europe_signals_v1']};}
 const value={schema:1,entries:[]},conflicts=[],byId=new Map(remote.entries.map(e=>[e.id,e]));
 for(const l of local.entries){
  const r=byId.get(l.id);byId.delete(l.id);
  if(!r){const b=base?.entries?.find(e=>e.id===l.id);if(b){if(!l.active&&equal(l,b))continue;conflicts.push('tt_europe_signals_v1/entries/'+l.id);}value.entries.push(l);continue;}
  const path='tt_europe_signals_v1/entries/'+l.id;
  const original=['symbol','isin','currency','category','firstDate','firstPrice','firstStop','support','policy'];
  if(original.some(k=>!equal(l[k],r[k]))){conflicts.push(path);value.entries.push(l);continue;}
  // The timestamp records the first observation, not which device wins.
  const b=base?.entries?.find(e=>e.id===l.id),newer=l.lastDate>r.lastDate?l:r;
  const snapshot=l.lastDate===r.lastDate?merge(b,l,r,path):{value:newer,conflicts:[]};
  // Two devices can first observe the identical close at different times.
  snapshot.conflicts=snapshot.conflicts.filter(p=>p!==path+'/createdAt');
  const e={...snapshot.value,createdAt:Math.min(l.createdAt,r.createdAt),outcomes:{...r.outcomes,...l.outcomes}};
  e.transitions=[...new Map([...l.transitions,...r.transitions].map(t=>[t.date+':'+t.category,t])).values()].sort((a,b)=>a.date.localeCompare(b.date));
  const confirmed=[l.confirmedAt,r.confirmedAt].filter(Boolean).sort();if(confirmed.length)e.confirmedAt=confirmed[0];
  conflicts.push(...snapshot.conflicts);
  for(const n of [5,10,20])if(l.outcomes[n]&&r.outcomes[n]&&!equal(l.outcomes[n],r.outcomes[n]))conflicts.push(path+'/outcomes/'+n);
  if(!l.active&&r.active&&r.lastDate>l.lastDate||!r.active&&l.active&&l.lastDate>r.lastDate)conflicts.push(path+'/status');
  // A revised source suspends returns on both devices until reviewed.
  if(l.review||r.review){e.review=l.review||r.review;e.outcomes={};}
  value.entries.push(e);
 }
 for(const r of byId.values()){const b=base?.entries?.find(e=>e.id===r.id);if(b){if(!r.active&&equal(r,b))continue;conflicts.push('tt_europe_signals_v1/entries/'+r.id);}value.entries.push(r);}
 value.entries.sort((a,b)=>b.firstDate.localeCompare(a.firstDate)||b.createdAt-a.createdAt||a.id.localeCompare(b.id));
 if(value.entries.length>1500)conflicts.push('tt_europe_signals_v1/limit');
 // Independently started, overlapping episodes need a choice, not double counting.
 for(let i=0;i<value.entries.length;i++)for(let j=i+1;j<value.entries.length;j++){
  const a=value.entries[i],b=value.entries[j],family=c=>c==='growth'||c==='earlyLong';
  if(a.isin===b.isin&&family(a.category)===family(b.category)&&a.firstDate<=(b.endDate||'9999-12-31')&&b.firstDate<=(a.endDate||'9999-12-31'))conflicts.push('tt_europe_signals_v1/episodes/'+a.isin);
 }
 return {value,conflicts:[...new Set(conflicts)]};
}
// Three-way merge: neither device wins a conflicting edit silently.
export function merge(base,local,remote,path=''){
 if(equal(local,remote))return {value:local,conflicts:[]};
 if(equal(local,base))return {value:remote,conflicts:[]};
 if(equal(remote,base))return {value:local,conflicts:[]};
 if(object(local)&&object(remote)&&(base===undefined||object(base))){const value={},conflicts=[];for(const k of new Set([...Object.keys(base||{}),...Object.keys(local),...Object.keys(remote)])){if(['__proto__','constructor','prototype'].includes(k))return {value:local,conflicts:[path||'record']};const m=merge(base?.[k],local[k],remote[k],path+'/'+k);if(m.value!==undefined)value[k]=m.value;conflicts.push(...m.conflicts);}return {value,conflicts};}
 if(Array.isArray(local)&&Array.isArray(remote)&&(base===undefined||Array.isArray(base))){
  const arrays=[base||[],local,remote],strings=arrays.every(a=>a.every(v=>typeof v==='string'));
  const identified=arrays.every(a=>a.every(v=>object(v)&&['string','number'].includes(typeof v.id)))&&arrays.every(a=>new Set(a.map(v=>String(v.id))).size===a.length);
  if(strings||identified){const toMap=a=>Object.fromEntries(a.map(v=>[strings?v:String(v.id),v]));const m=merge(toMap(base||[]),toMap(local),toMap(remote),path);return {value:Object.values(m.value),conflicts:m.conflicts};}
 }
 return {value:local,conflicts:[path||'record']};
}
// 19.10.2026 (el: „ultima copie să fie cea de sincronizat, mereu sunt conflicte pe partea asta”): capitalul e o singură cifră scrisă de ambele
// aparate (Jurnalul, capitalul automat Trading 212, tichetul din Desk) ⇒ la două scrieri diferite câștigă cea mai nouă, fără conflict.
// Ora locală o ține aplicația (evenimentul storage din pagini), ora din cont e `updated` de pe server (în secunde) ⇒ ambele în ms, comparate
// la secundă; la egalitate sau fără oră locală câștigă contul.
export const LAST_WRITE_WINS=Object.freeze(['tt_pf_account','tt_ticket_capital','tt_governor_cfg_v1']);
/* 27.10.2026 (lotul A): formele cheilor noi. Ordinele în așteptare au exact forma scrisă de T212Pending.save (items ca în T212Pending.valid —
   tools/cloud-sync-chei-noi.test.mjs le compară); kill switch-ul e contractul cu loturile C/E; limitele Governor circulă FĂRĂ capital
   (accountSize / _accountBasis au cheile lor); jurnalul limitelor e append-only (unire pe ts + aparat + cheia: o salvare scrie mai multe
   rânduri cu același ts); cititorii T212 (I-748) = pe aparat, ultima citire. Toate sunt observații sau stări cu oră ⇒ fără conflicte. */
const ORDERS_KEY='tt_trading212_orders_pending_v1',OPRIRE_KEY='tt_governor_oprire_v1',CFG_KEY='tt_governor_cfg_v1',LIMITE_KEY='tt_governor_limite_jurnal_v1',CITITORI_KEY='tt_t212_cititori_v1',LIMITE_MAX=500;
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v)),numOrNull=v=>v==null||typeof v==='number'&&Number.isFinite(v),ms=v=>{const t=Date.parse(v);return Number.isFinite(t)?t:-Infinity;};
function validateOrders(value){
 if(!object(value)||Object.keys(value).length>50)throw Error('invalid_value');
 for(const [scope,a] of Object.entries(value)){
  if(!scope||scope.length>200||!object(a)||!Array.isArray(a.items)||a.items.length>500||!(a.fetchedAt===null||iso(a.fetchedAt))||!(a.environment==null||typeof a.environment==='string'&&a.environment.length<=20))throw Error('invalid_value');
  if(a.eroare!==undefined&&(!object(a.eroare)||!iso(a.eroare.la)||typeof a.eroare.mesaj!=='string'||a.eroare.mesaj.length>200))throw Error('invalid_value');
  for(const o of a.items)if(!object(o)||typeof o.ticker!=='string'||!o.ticker||o.ticker.length>64||!numOrNull(o.quantity)||!numOrNull(o.stopPrice)||!numOrNull(o.limitPrice)||!(o.type==null||typeof o.type==='string')||!(o.side==null||o.side==='BUY'||o.side==='SELL'))throw Error('invalid_value');
 }
}
function validateOprire(v){
 if(!object(v)||typeof v.activ!=='boolean'||!iso(v.la)||typeof v.motiv!=='string'||v.motiv.length>2000||typeof v.aparat!=='string'||v.aparat.length>100||!Array.isArray(v.ordineAnulate)||v.ordineAnulate.length>500||!(v.rearmatLa==null||iso(v.rearmatLa))||!(v.rearmatMotiv==null||typeof v.rearmatMotiv==='string'&&v.rearmatMotiv.length<=2000))throw Error('invalid_value');
 for(const o of v.ordineAnulate)if(!object(o)||!(o.id==null||typeof o.id==='string'||typeof o.id==='number')||!(o.ticker==null||typeof o.ticker==='string')||!numOrNull(o.stopPrice))throw Error('invalid_value');
}
const CFG_INTERZISE=['accountSize','_accountBasis','configIssues','capitalNecunoscut'];
function validateGovernorCfg(v){if(!object(v)||Object.keys(v).length>60)throw Error('invalid_value');for(const [k,x] of Object.entries(v))if(CFG_INTERZISE.includes(k)||k.length>60||!(x===null||['number','boolean','string'].includes(typeof x))||typeof x==='number'&&!Number.isFinite(x)||typeof x==='string'&&x.length>200)throw Error('invalid_value');}
function validateLimite(v){if(!Array.isArray(v)||v.length>LIMITE_MAX)throw Error('invalid_value');for(const r of v)if(!object(r)||!Number.isFinite(r.ts)||typeof r.aparat!=='string'||!r.aparat||r.aparat.length>100||typeof r.cheia!=='string'||!r.cheia||r.cheia.length>60)throw Error('invalid_value');}
function validateCititori(v){if(!object(v)||Object.keys(v).length>50)throw Error('invalid_value');for(const [k,x] of Object.entries(v))if(!k||k.length>100||!object(x)||!iso(x.la)||!(x.env==null||typeof x.env==='string'&&x.env.length<=20))throw Error('invalid_value');}
// pe cheie (cont / aparat): cea mai nouă oră câștigă; la egalitate aceeași alegere pe ambele aparate
function newestByKey(local,remote,at){const value={...remote,...local};for(const k of Object.keys(remote)){const l=local[k],r=remote[k];if(!object(l)||!object(r))continue;const tl=at(l),tr=at(r);value[k]=tr>tl?r:tl>tr?l:smaller(l,r);}return {value,conflicts:[]};}
export function mergeRecord(key,base,local,remote,times){
 if(LAST_WRITE_WINS.includes(key)){const m=merge(base,local,remote,key);if(!m.conflicts.length)return m;const sec=t=>Math.floor((Number(t)||0)/1000);return {value:sec(times?.localAt)>sec(times?.remoteAt)?local:remote,conflicts:[]};}
 if(EvidenceCloud.isKey(key))return evidenceMerge(key,base,local,remote);
 if(forecastKeys.includes(key))return forecastMerge(key,base,local,remote);
 if(fillsKeys.includes(key))return fillsMerge(key,base,local,remote);
 if(key==='tt_europe_signals_v1')return mergeEuropeHistory(base,local,remote);
 // Risk limits are one coherent policy; do not mix budgets from two devices.
 if(key==='tt_europe_risk_settings_v1'){if(equal(local,remote)||equal(local,base)||equal(remote,base))return merge(base,local,remote,key);return {value:local,conflicts:[key]};}
 // 18.10.2026: cheia de citire + parola Radarului. Lipsa de pe un dispozitiv (stocare golită, alt browser) nu e o ștergere: se ia din cont.
 if(key==='tt_radar_access_v1'){if(local===undefined)return {value:remote,conflicts:[]};if(remote===undefined)return {value:local,conflicts:[]};const pick=f=>{const l=local[f]||'',r=remote[f]||'',b=base?.[f]||'';return !l?r:!r||l===r?l:l===b?r:l;};return {value:{cheie:pick('cheie'),parola:pick('parola')},conflicts:[]};}
 if(key==='cloud_credentials'){if(equal(local,remote))return {value:local,conflicts:[]};if(equal(local,base))return {value:remote,conflicts:[]};if(equal(remote,base))return {value:local,conflicts:[]};return {value:local,conflicts:[key]};}
 if(key==='tt_trading212_fills_v1'&&object(local?.accounts)&&object(remote?.accounts)){const accounts={...remote.accounts,...local.accounts};for(const k of Object.keys(remote.accounts)){const l=local.accounts[k],r=remote.accounts[k];if(l){const byId=new Map((r.items||[]).map(v=>[String(v.id),v]));for(const v of l.items||[]){const old=byId.get(String(v.id));if(old&&!equal(old,v))return {value:local,conflicts:[key+'/accounts/'+k+'/items/'+v.id]};byId.set(String(v.id),v);}const latest=Date.parse(r.fetchedAt)>Date.parse(l.fetchedAt)?r:l;accounts[k]={...latest,items:[...byId.values()].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)),complete:l.complete===true||r.complete===true};}}return {value:{accounts},conflicts:[]};}
 if(key==='tt_trading212_account_history_v1'&&object(local)&&object(remote)){
  const value={...remote,...local},conflicts=[];
  for(const scope of Object.keys(remote)){if(!local[scope])continue;const days=new Map();for(const row of [...remote[scope],...local[scope]]){const day=row.at.slice(0,10),old=days.get(day);if(old&&old.at===row.at&&!equal(old,row))conflicts.push(key+'/'+scope+'/'+row.at);if(!old||Date.parse(row.at)>Date.parse(old.at))days.set(day,row);}value[scope]=[...days.values()].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).slice(-500);}
  return {value,conflicts};
 }
 if(key==='tt_trading212_cash_v1'&&object(local)&&object(remote)){
  const value={...remote,...local},conflicts=[];
  for(const scope of Object.keys(remote)){const l=local[scope],r=remote[scope];if(!l)continue;if(l.environment!==r.environment){conflicts.push(key+'/'+scope);continue;}value[scope]={environment:l.environment};const valuations=new Map();for(const x of [...(r.flowValuations||[]),...(l.flowValuations||[])]){const id=Date.parse(x.at),old=valuations.get(id);if(old&&!equal(old,x))conflicts.push(key+'/'+scope+'/flowValuations/'+x.at);valuations.set(id,x);}if(valuations.size)value[scope].flowValuations=[...valuations.values()].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
   // Financial evaluations have no safe automatic retention policy. Keep
   // both originals and require an explicit choice if their union is too large.
   if(valuations.size>500)conflicts.push(key+'/'+scope+'/flowValuations/limit');
   for(const kind of ['transactions','dividends']){if(!l[kind]||!r[kind]){value[scope][kind]=l[kind]||r[kind];continue;}const byId=new Map(r[kind].items.map(x=>[String(x.id),x]));for(const x of l[kind].items){const old=byId.get(String(x.id));if(old&&!equal(old,x))conflicts.push(key+'/'+scope+'/'+kind+'/'+x.id);byId.set(String(x.id),x);}const latest=Date.parse(r[kind].fetchedAt)>Date.parse(l[kind].fetchedAt)?r[kind]:l[kind];value[scope][kind]={...latest,items:[...byId.values()].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date))};}}
  return {value,conflicts};
 }
 // Broker snapshots are observations: newer broker timestamp wins, not the syncing device's clock.
 if(key==='tt_trading212_portfolio_v1'&&object(local)&&object(remote)){
  const value={...remote,...local};for(const k of Object.keys(remote)){if(local[k]){const l=Date.parse(local[k].fetchedAt),r=Date.parse(remote[k].fetchedAt);if(Number.isFinite(r)&&(!Number.isFinite(l)||r>l))value[k]=remote[k];}}
  return {value,conflicts:[]};
 }
 // 27.10.2026 (lotul A, I-749): ordinele în așteptare = observații ale brokerului — pe fiecare cont cea mai nouă citire (fetchedAt) câștigă; conturile se unesc
 if(key===ORDERS_KEY&&object(local)&&object(remote))return newestByKey(local,remote,a=>ms(a.fetchedAt));
 // kill switch (contractul cu E/C): cea mai nouă stare (oprirea sau re-armarea) câștigă
 if(key===OPRIRE_KEY&&object(local)&&object(remote)){const t=v=>Math.max(ms(v.la),ms(v.rearmatLa));const tl=t(local),tr=t(remote);return {value:tr>tl?remote:tl>tr?local:smaller(local,remote),conflicts:[]};}
 // jurnalul limitelor: unire pe ts + aparat + cheia, ordonat după ts, cel mult LIMITE_MAX (cele mai noi)
 if(key===LIMITE_KEY&&Array.isArray(local)&&Array.isArray(remote)){const rows=new Map();for(const x of [...remote,...local])rows.set(x.ts+'|'+x.aparat+'|'+x.cheia,x);return {value:[...rows.values()].sort((a,b)=>a.ts-b.ts||String(a.aparat).localeCompare(String(b.aparat))||String(a.cheia).localeCompare(String(b.cheia))).slice(-LIMITE_MAX),conflicts:[]};}
 // cititorii T212 (I-748): pe aparat, cea mai nouă citire
 if(key===CITITORI_KEY&&object(local)&&object(remote))return newestByKey(local,remote,a=>ms(a.la));
 return merge(base,local,remote,key);
}
// 27.10.2026 (lotul A, audit [5]): limita de 1 MB e a CONTULUI — se verifică la trimitere (PUT, workerul și clientul), nu la o scriere pur locală (restaurarea copiei): {limita:false}
export function validateValue(key,value,{limita=true}={}){
 if(!KEYS.includes(key))throw Error('invalid_key');
 if(value===null)return true;
 if(EvidenceCloud.isKey(key))validateEvidence(key,value);
 else if(key===ORDERS_KEY)validateOrders(value);
 else if(key===OPRIRE_KEY)validateOprire(value);
 else if(key===CFG_KEY)validateGovernorCfg(value);
 else if(key===LIMITE_KEY)validateLimite(value);
 else if(key===CITITORI_KEY)validateCititori(value);
 else if(forecastKeys.includes(key))validateForecast(key,value);
 else if(fillsKeys.includes(key))validateFills(key,value);
 else if(key==='tt_europe_signals_v1')validateEuropeHistory(value);
 else if(key==='tt_europe_risk_settings_v1'){
  if(!object(value)||!['EUR','USD','GBP','CHF','DKK','RON'].includes(value.currency)||typeof value.fractional!=='boolean'||!['budget','loss','fees','entry'].every(k=>['string','number'].includes(typeof value[k])&&String(value[k]).trim()!==''&&Number.isFinite(Number(value[k])))||Number(value.budget)<=0||Number(value.loss)<=0||Number(value.loss)>Number(value.budget)||Number(value.fees)<0||Number(value.entry)<=0)throw Error('invalid_value');
 }
 else if(key==='tt_trading212_account_history_v1'){
  if(!object(value)||Object.entries(value).some(([scope,xs])=>!scope||!Array.isArray(xs)||xs.length>500||xs.some(x=>!object(x)||typeof x.at!=='string'||!Number.isFinite(Date.parse(x.at))||!Number.isFinite(x.total)||x.total<0||!/^[A-Z]{3}$/.test(x.currency||''))))throw Error('invalid_value');
 }
 else if(key==='tt_trading212_cash_v1'){
  if(!object(value))throw Error('invalid_value');for(const a of Object.values(value)){if(!object(a)||!['live','demo'].includes(a.environment))throw Error('invalid_value');if(a.flowValuations!==undefined&&(!Array.isArray(a.flowValuations)||a.flowValuations.length>500||a.flowValuations.some(v=>!object(v)||Object.keys(v).some(k=>!['at','before','after','currency','flowIds','reference'].includes(k))||!Number.isFinite(Date.parse(v.at))||Date.parse(v.at)>Date.now()||!Number.isFinite(v.before)||v.before<=0||!Number.isFinite(v.after)||v.after<=0||!/^[A-Z]{3}$/.test(v.currency||'')||!Array.isArray(v.flowIds)||!v.flowIds.length||v.flowIds.length>100||v.flowIds.some(id=>typeof id!=='string'||!id||id.length>200)||new Set(v.flowIds).size!==v.flowIds.length||typeof v.reference!=='string'||!v.reference.trim()||v.reference.length>300)||new Set(a.flowValuations.map(v=>Date.parse(v.at))).size!==a.flowValuations.length))throw Error('invalid_value');for(const kind of ['dividends','transactions']){const r=a[kind];if(r!==undefined&&(!object(r)||!Array.isArray(r.items)||r.items.some(x=>!object(x)||!x.id||!Number.isFinite(x.amount)||typeof x.date!=='string'||!Number.isFinite(Date.parse(x.date))||!/^[A-Z]{3}$/.test(x.currency||''))))throw Error('invalid_value');}}
 }
 else if(key==='cloud_credentials'){if(!value||!['live','demo'].includes(value.environment)||typeof value.key!=='string'||typeof value.secret!=='string'||!value.key||!value.secret||value.key.length>256||value.secret.length>512||value.key.includes(':')||!/^[\x21-\x7e]+$/.test(value.key+value.secret))throw Error('invalid_credentials');}
 else if(key==='tt_radar_access_v1'){if(!object(value)||Object.keys(value).some(k=>!['cheie','parola'].includes(k))||typeof value.cheie!=='string'||typeof value.parola!=='string'||value.cheie!==''&&!/^[A-Za-z0-9_-]{16,128}$/.test(value.cheie)||value.parola.length>128||/[\x00-\x1f\x7f]/.test(value.parola)||!value.cheie&&!value.parola)throw Error('invalid_value');}
 else if(key==='tt_theme'){if(!['auto','light','dark'].includes(value))throw Error('invalid_value');}
 else if(['tt_pf_account','tt_ticket_capital'].includes(key)){if(typeof value!=='string'||value.length>256)throw Error('invalid_value');}
 else if(['tt_journal_v1','tt_trade_plans_v1','wl_stocks'].includes(key)){if(!Array.isArray(value))throw Error('invalid_value');}
 else if(!object(value))throw Error('invalid_value');
 const text=JSON.stringify(value);if(limita&&key!==EVIDENCE_KEY&&new TextEncoder().encode(text).length>1000000)throw Error('record_too_large');
 JSON.parse(text,(k,v)=>{if(['__proto__','constructor','prototype'].includes(k))throw Error('invalid_value');return v;});return true;
}

