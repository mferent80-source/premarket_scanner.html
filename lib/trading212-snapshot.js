(function(g){
'use strict';
const KEY='tt_trading212_portfolio_v1';
// A partial response belongs to the selected account; never fall back to another account.
function select(data,environment='live'){
 if(!data||typeof data!=='object'||Array.isArray(data))return null;
 const entries=Object.entries(data).filter(([,a])=>a&&typeof a==='object'&&a.environment===environment);
 entries.sort((a,b)=>Number(b[1].active===true)-Number(a[1].active===true)||(Date.parse(b[1].fetchedAt)||0)-(Date.parse(a[1].fetchedAt)||0));
 return entries[0]||null;
}
function read(environment='live'){try{return select(JSON.parse(localStorage.getItem(KEY)||'{}'),environment);}catch(_){return null;}}
function fresh(a,now=Date.now()){const at=Date.parse(a?.fetchedAt);return Number.isFinite(at)&&at<=now+60000&&now-at<=300000;}
g.T212Snapshot={select,read,fresh};
})(typeof window!=='undefined'?window:globalThis);
