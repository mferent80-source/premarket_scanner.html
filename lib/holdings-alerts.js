(function(g){
'use strict';
const KEY='tt_holdings_alerts_v1';
function reconcile(records,scope,ranked,models,now=Date.now()){
 const result=records.map(r=>({...r})),active=new Set();
 for(const row of ranked){if(!row.priority)continue;for(const reason of row.reasons){const key=JSON.stringify([scope,row.ticker,reason]);active.add(key);let old=result.findLast(r=>r.key===key);if(old?.active){old.lastAt=now;continue;}result.push({id:key+'|'+now,key,scope,ticker:row.ticker,reason,priority:row.priority,asOf:models[row.ticker]?.asOf||null,firstAt:now,lastAt:now,seenAt:null,active:true});}}
 for(const r of result)if(r.scope===scope&&!active.has(r.key))r.active=false;
 return result;
}
function load(){const raw=JSON.parse(localStorage.getItem(KEY)||'[]');if(!Array.isArray(raw))throw Error('Istoric de alerte incompatibil');return raw;}
function save(rows){localStorage.setItem(KEY,JSON.stringify(rows));}
function seen(rows,id,now=Date.now()){return rows.map(r=>r.id===id?{...r,seenAt:now}:r);}
g.HoldingsAlerts={KEY,reconcile,load,save,seen};
})(typeof window!=='undefined'?window:globalThis);
