(function(g){'use strict';
const KEY='tt_holding_navigation_v1',TTL=300000,text=v=>typeof v==='string'&&v.length>0&&v.length<=200;
function valid(target){return target&&text(target.scope)&&text(target.ticker)&&['live','demo'].includes(target.environment);}
function create(storage,target,{now=Date.now(),nonce=g.crypto?.randomUUID()}={}){
 if(!valid(target)||!Number.isFinite(now)||typeof nonce!=='string'||!(/^[a-zA-Z0-9_-]{8,80}$/).test(nonce))throw Error('Poziția nu poate fi deschisă cu un context verificat.');
 storage.setItem(KEY,JSON.stringify({version:1,nonce,at:now,target:{scope:target.scope,ticker:target.ticker,environment:target.environment}}));return 'holding='+encodeURIComponent(nonce);
}
function resolve(storage,nonce,now=Date.now()){
 if(nonce===null||nonce===undefined)return {ok:true,target:null};
 const fail=reason=>({ok:false,target:null,reason});
 try{const entry=JSON.parse(storage.getItem(KEY)||'null');if(!entry||entry.version!==1||entry.nonce!==nonce||!valid(entry.target)||!Number.isFinite(entry.at)||entry.at>now+60000||now-entry.at>TTL)return fail('Legătura poziției a expirat sau nu mai corespunde. Redeschide analiza din Trading 212.');return {ok:true,target:entry.target};}catch{return fail('Contextul poziției nu este disponibil în acest browser. Redeschide analiza din Trading 212.');}
}
function check(target,entry){
 if(!valid(target)||!entry||entry[0]!==target.scope||entry[1]?.environment!==target.environment)return {ok:false,reason:'Contul selectat s-a schimbat. Redeschide poziția din Trading 212 pentru contul curent.'};
 const matches=Array.isArray(entry[1].positions)?entry[1].positions.filter(p=>p?.ticker===target.ticker&&Number.isFinite(p.quantity)&&p.quantity>0):[];
 return matches.length===1?{ok:true,position:matches[0]}:{ok:false,reason:'Poziția solicitată nu mai există în snapshot-ul selectat sau citirea este parțială. Sincronizează Trading 212 și redeschide analiza.'};
}
g.HoldingHandoff={KEY,TTL,create,resolve,check};
})(typeof window!=='undefined'?window:globalThis);
