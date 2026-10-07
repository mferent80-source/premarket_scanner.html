export const KEYS=Object.freeze(['tt_journal_v1','tt_trade_plans_v1','tt_ticket_capital','tt_journal_settings_v1','tt_trading212_fills_v1','tt_trading212_portfolio_v1','tt_holdings_theses_v1','tt_holdings_symbols_v1','tt_holdings_benchmarks_v1','wl_stocks','tt_theme','tt_pf_account','cloud_credentials','tt_europe_signals_v1','tt_europe_risk_settings_v1']);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
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
export function mergeRecord(key,base,local,remote){
 if(key==='tt_europe_signals_v1')return mergeEuropeHistory(base,local,remote);
 // Risk limits are one coherent policy; do not mix budgets from two devices.
 if(key==='tt_europe_risk_settings_v1'){if(equal(local,remote)||equal(local,base)||equal(remote,base))return merge(base,local,remote,key);return {value:local,conflicts:[key]};}
 if(key==='cloud_credentials'){if(equal(local,remote))return {value:local,conflicts:[]};if(equal(local,base))return {value:remote,conflicts:[]};if(equal(remote,base))return {value:local,conflicts:[]};return {value:local,conflicts:[key]};}
 if(key==='tt_trading212_fills_v1'&&object(local?.accounts)&&object(remote?.accounts)){const accounts={...remote.accounts,...local.accounts};for(const k of Object.keys(remote.accounts)){const l=local.accounts[k],r=remote.accounts[k];if(l){const byId=new Map((r.items||[]).map(v=>[String(v.id),v]));for(const v of l.items||[]){const old=byId.get(String(v.id));if(old&&!equal(old,v))return {value:local,conflicts:[key+'/accounts/'+k+'/items/'+v.id]};byId.set(String(v.id),v);}const latest=Date.parse(r.fetchedAt)>Date.parse(l.fetchedAt)?r:l;accounts[k]={...latest,items:[...byId.values()].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)),complete:l.complete===true||r.complete===true};}}return {value:{accounts},conflicts:[]};}
 // Broker snapshots are observations: newer broker timestamp wins, not the syncing device's clock.
 if(key==='tt_trading212_portfolio_v1'&&object(local)&&object(remote)){
  const value={...remote,...local};for(const k of Object.keys(remote)){if(local[k]){const l=Date.parse(local[k].fetchedAt),r=Date.parse(remote[k].fetchedAt);if(Number.isFinite(r)&&(!Number.isFinite(l)||r>l))value[k]=remote[k];}}
  return {value,conflicts:[]};
 }
 return merge(base,local,remote,key);
}
export function validateValue(key,value){
 if(!KEYS.includes(key))throw Error('invalid_key');
 if(value===null)return true;
 if(key==='tt_europe_signals_v1')validateEuropeHistory(value);
 else if(key==='tt_europe_risk_settings_v1'){
  if(!object(value)||!['EUR','USD','GBP','CHF','DKK','RON'].includes(value.currency)||typeof value.fractional!=='boolean'||!['budget','loss','fees','entry'].every(k=>['string','number'].includes(typeof value[k])&&String(value[k]).trim()!==''&&Number.isFinite(Number(value[k])))||Number(value.budget)<=0||Number(value.loss)<=0||Number(value.loss)>Number(value.budget)||Number(value.fees)<0||Number(value.entry)<=0)throw Error('invalid_value');
 }
 else if(key==='cloud_credentials'){if(!value||!['live','demo'].includes(value.environment)||typeof value.key!=='string'||typeof value.secret!=='string'||!value.key||!value.secret||value.key.length>256||value.secret.length>512||value.key.includes(':')||!/^[\x21-\x7e]+$/.test(value.key+value.secret))throw Error('invalid_credentials');}
 else if(key==='tt_theme'){if(!['auto','light','dark'].includes(value))throw Error('invalid_value');}
 else if(['tt_pf_account','tt_ticket_capital'].includes(key)){if(typeof value!=='string'||value.length>256)throw Error('invalid_value');}
 else if(['tt_journal_v1','tt_trade_plans_v1','wl_stocks'].includes(key)){if(!Array.isArray(value))throw Error('invalid_value');}
 else if(!object(value))throw Error('invalid_value');
 const text=JSON.stringify(value);if(new TextEncoder().encode(text).length>1000000)throw Error('record_too_large');
 JSON.parse(text,(k,v)=>{if(['__proto__','constructor','prototype'].includes(k))throw Error('invalid_value');return v;});return true;
}
