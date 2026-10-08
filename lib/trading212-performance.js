/* Descriptive broker performance from reported fills, never inferred round trips or FX. */
(function(g){
'use strict';
const KEY='tt_trading212_fills_v1',SNAPSHOT_KEY='tt_trading212_portfolio_v1',finite=Number.isFinite;
const currency=c=>typeof c==='string'&&/^[A-Z]{3}$/.test(c);
const id=x=>typeof x==='string'&&x.length>0&&x.length<=200?x:finite(x)&&Number.isSafeInteger(x)?String(x):null;
function empty(reason){return {state:'missing',reason,rows:[],currencies:[],currency:null,count:0,buys:0,sells:0,missing:0,unsupported:0,rejected:0,duplicates:0,conflicts:0,winRate:null,total:null,average:null,factor:null,complete:false,fetchedAt:null,stale:true,positions:null};}
function build({scope,account,snapshot,selectedCurrency=null,days=null,now=Date.now()}={}){
 if(!scope||!snapshot||snapshot.environment!=='live')return empty('Conectează contul Trading 212 Invest pentru importul automat.');
 if(!account||account.environment!=='live'||!Array.isArray(account.items))return empty('Contul Invest este selectat; istoricul execuțiilor încă nu a fost importat.');
 const fetched=Date.parse(account.fetchedAt);
 if(!finite(fetched)||fetched>now+60000)return empty('Data importului Trading 212 este invalidă. Reia sincronizarea.');
 const byId=new Map(),badIds=new Set();let rejected=0,duplicates=0,conflicts=0;
 for(const x of account.items){
  if(!x||!id(x.id)||typeof x.ticker!=='string'||!x.ticker||x.ticker.length>200||!['BUY','SELL'].includes(x.side)||!finite(x.quantity)||x.quantity<=0||!finite(x.price)||x.price<=0||!finite(Date.parse(x.date))||Date.parse(x.date)>now+60000){rejected++;continue;}
  const clean={id:id(x.id),ticker:x.ticker,date:x.date,side:x.side,quantity:x.quantity,price:x.price,priceCurrency:currency(x.priceCurrency)?x.priceCurrency:null,currency:currency(x.currency)?x.currency:null,realized:finite(x.realized)?x.realized:null,fxRate:finite(x.fxRate)&&x.fxRate>0?x.fxRate:null,type:typeof x.type==='string'&&x.type.length<=80?x.type:null,
   taxes:Array.isArray(x.taxes)&&x.taxes.every(t=>t&&typeof t.name==='string'&&finite(t.quantity)&&currency(t.currency))?x.taxes.map(t=>({name:t.name,quantity:t.quantity,currency:t.currency})):null};
  const previous=byId.get(clean.id);
  if(previous){if(JSON.stringify(previous)===JSON.stringify(clean))duplicates++;else{badIds.add(clean.id);conflicts++;}continue;}
  byId.set(clean.id,clean);
 }
 const all=[...byId.values()].filter(x=>!badIds.has(x.id)).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)||a.id.localeCompare(b.id));
 const wallet=currency(snapshot.summary?.currency)?snapshot.summary.currency:null;
 const currencies=[...new Set([wallet,...all.map(x=>x.currency)].filter(currency))].sort();
 const chosen=currencies.includes(selectedCurrency)?selectedCurrency:wallet||currencies[0]||null;
 const cutoff=[30,90,365].includes(days)?now-days*86400000:-Infinity;
 const rows=all.filter(x=>Date.parse(x.date)>=cutoff&&(x.currency===chosen||x.currency===null));
 const trades=rows.filter(x=>x.type==='TRADE'),sells=trades.filter(x=>x.side==='SELL');
 const eligible=sells.filter(x=>x.currency===chosen&&chosen&&finite(x.realized));
 const count=eligible.length,wins=eligible.filter(x=>x.realized>0).length;
 const gains=eligible.reduce((n,x)=>n+Math.max(0,x.realized),0),losses=-eligible.reduce((n,x)=>n+Math.min(0,x.realized),0),total=count?eligible.reduce((n,x)=>n+x.realized,0):null;
 if(![gains,losses,total??0].every(finite))return empty('Sumele importate nu pot fi agregate în siguranță. Reia sincronizarea.');
 const storedRejected=finite(account.rejected)&&account.rejected>0?account.rejected:0;
 const complete=account.complete===true&&!rejected&&!conflicts&&!storedRejected&&!account.syncError;
 return {state:account.syncError?'error':complete?'ready':'partial',reason:account.syncError?'Ultima sincronizare a istoricului a fost întreruptă. Rezultatele păstrate rămân vizibile.':null,scope,rows,currencies,currency:chosen,count,
  buys:trades.filter(x=>x.side==='BUY').length,sells:sells.length,missing:sells.length-count,unsupported:rows.length-trades.length,rejected:rejected+storedRejected,duplicates,conflicts,
  winRate:count?wins/count*100:null,total,average:count?total/count:null,factor:count?(losses?(finite(gains/losses)?gains/losses:null):gains?Infinity:null):null,
  complete,fetchedAt:account.fetchedAt,stale:now-fetched>300000,syncStatus:account.syncStatus||null,
  positions:Array.isArray(snapshot.positions)?snapshot.positions.filter(x=>x&&finite(x.quantity)&&x.quantity>0).length:null};
}
function read({storage=g.localStorage,selectedCurrency=null,days=null,now=Date.now()}={}){
 try{const snapshots=JSON.parse(storage.getItem(SNAPSHOT_KEY)||'{}'),selected=g.T212Snapshot?.select(snapshots,'live');
  if(!selected)return empty('Conectează contul Trading 212 Invest pentru importul automat.');
  const data=JSON.parse(storage.getItem(KEY)||'{"accounts":{}}');
  return build({scope:selected[0],snapshot:selected[1],account:data.accounts?.[selected[0]],selectedCurrency,days,now});
 }catch{return empty('Istoricul Trading 212 nu poate fi citit. Reia sincronizarea brokerului.');}
}
function demo(now=Date.now()){
 const fill=(n,side,realized,days)=>({id:'fictiv-'+n,ticker:'FICTIV_'+(n%2?'A':'B')+'_US_EQ',date:new Date(now-days*86400000).toISOString(),type:'TRADE',side,quantity:2,price:side==='BUY'?100:110,priceCurrency:'USD',currency:'EUR',realized,taxes:[{name:'CURRENCY_CONVERSION_FEE',quantity:.3,currency:'EUR'}]});
 return {scope:'fictiv-proof',snapshot:{environment:'live',summary:{currency:'EUR'},positions:[{quantity:2}]},account:{environment:'live',complete:true,fetchedAt:new Date(now).toISOString(),items:[fill(1,'SELL',18.4,1),fill(2,'SELL',-7.2,2),fill(3,'SELL',11.5,3),fill(4,'BUY',null,4),fill(5,'BUY',null,5)]}};
}
g.T212Performance={KEY,SNAPSHOT_KEY,build,read,demo};
})(typeof window!=='undefined'?window:globalThis);
