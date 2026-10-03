export const KEYS=Object.freeze(['tt_journal_v1','tt_trade_plans_v1','tt_ticket_capital','tt_journal_settings_v1','tt_trading212_fills_v1','tt_trading212_portfolio_v1','tt_holdings_theses_v1','tt_holdings_symbols_v1','tt_holdings_benchmarks_v1','wl_stocks','tt_theme','tt_pf_account','cloud_credentials']);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
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
 if(key==='cloud_credentials'){if(!value||!['live','demo'].includes(value.environment)||typeof value.key!=='string'||typeof value.secret!=='string'||!value.key||!value.secret||value.key.length>256||value.secret.length>512||value.key.includes(':')||!/^[\x21-\x7e]+$/.test(value.key+value.secret))throw Error('invalid_credentials');}
 else if(key==='tt_theme'){if(!['auto','light','dark'].includes(value))throw Error('invalid_value');}
 else if(['tt_pf_account','tt_ticket_capital'].includes(key)){if(typeof value!=='string'||value.length>256)throw Error('invalid_value');}
 else if(['tt_journal_v1','tt_trade_plans_v1','wl_stocks'].includes(key)){if(!Array.isArray(value))throw Error('invalid_value');}
 else if(!object(value))throw Error('invalid_value');
 const text=JSON.stringify(value);if(new TextEncoder().encode(text).length>1000000)throw Error('record_too_large');
 JSON.parse(text,(k,v)=>{if(['__proto__','constructor','prototype'].includes(k))throw Error('invalid_value');return v;});return true;
}
