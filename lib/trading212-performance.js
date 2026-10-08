/* Descriptive broker performance from reported fills, never inferred round trips or FX. */
(function(g){
'use strict';
const KEY='tt_trading212_fills_v1',SNAPSHOT_KEY='tt_trading212_portfolio_v1',finite=Number.isFinite;
const currency=c=>typeof c==='string'&&/^[A-Z]{3}$/.test(c);
const id=x=>typeof x==='string'&&x.length>0&&x.length<=200?x:finite(x)&&Number.isSafeInteger(x)?String(x):null;
function empty(reason){return {state:'missing',reason,rows:[],currencies:[],currency:null,count:0,buys:0,sells:0,missing:0,unsupported:0,rejected:0,duplicates:0,conflicts:0,winRate:null,total:null,average:null,factor:null,complete:false,fetchedAt:null,stale:true,positions:null};}
function build({scope,account,snapshot,environment='live',selectedCurrency=null,selectedTicker=null,days=null,now=Date.now()}={}){
 if(!scope||!['live','demo'].includes(environment)||!snapshot||snapshot.environment!==environment)return empty('Conectează contul Trading 212 Invest pentru importul automat.');
 if(!account||account.environment!==environment||!Array.isArray(account.items))return empty('Contul Invest este selectat; istoricul execuțiilor încă nu a fost importat.');
 const fetched=Date.parse(account.fetchedAt);
 if(!finite(fetched)||fetched>now+60000)return empty('Data importului Trading 212 este invalidă. Reia sincronizarea.');
 const byId=new Map(),badIds=new Set();let rejected=0,duplicates=0,conflicts=0;
 for(const x of account.items){
  if(!x||!id(x.id)||typeof x.ticker!=='string'||!x.ticker||x.ticker.length>200||!['BUY','SELL'].includes(x.side)||!finite(x.quantity)||x.quantity<=0||!finite(x.price)||x.price<=0||!finite(Date.parse(x.date))||Date.parse(x.date)>now+60000){rejected++;continue;}
  const clean={id:id(x.id),orderId:id(x.orderId),ticker:x.ticker,date:x.date,side:x.side,quantity:x.quantity,price:x.price,priceCurrency:currency(x.priceCurrency)?x.priceCurrency:null,currency:currency(x.currency)?x.currency:null,realized:finite(x.realized)?x.realized:null,fxRate:finite(x.fxRate)&&x.fxRate>0?x.fxRate:null,type:typeof x.type==='string'&&x.type.length<=80?x.type:null,
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
 const periodRows=all.filter(x=>Date.parse(x.date)>=cutoff&&(x.currency===chosen||x.currency===null)),symbols=[...new Set(periodRows.map(x=>x.ticker))].sort(),ticker=symbols.includes(selectedTicker)?selectedTicker:null;
 const rows=periodRows.filter(x=>!ticker||x.ticker===ticker);
 const trades=rows.filter(x=>x.type==='TRADE'),sells=trades.filter(x=>x.side==='SELL');
 const eligible=sells.filter(x=>x.currency===chosen&&chosen&&finite(x.realized));
 const count=eligible.length,wins=eligible.filter(x=>x.realized>0).length;
 const gains=eligible.reduce((n,x)=>n+Math.max(0,x.realized),0),losses=-eligible.reduce((n,x)=>n+Math.min(0,x.realized),0),total=count?eligible.reduce((n,x)=>n+x.realized,0):null;
 if(![gains,losses,total??0].every(finite))return empty('Sumele importate nu pot fi agregate în siguranță. Reia sincronizarea.');
 const storedRejected=finite(account.rejected)&&account.rejected>0?account.rejected:0;
 const complete=account.complete===true&&!rejected&&!conflicts&&!storedRejected&&!account.syncError;
 return {state:account.syncError?'error':complete?'ready':'partial',reason:account.syncError?'Ultima sincronizare a istoricului a fost întreruptă. Rezultatele păstrate rămân vizibile.':null,scope,rows,currencies,currency:chosen,symbols,ticker,count,
  buys:trades.filter(x=>x.side==='BUY').length,sells:sells.length,missing:sells.length-count,unsupported:rows.length-trades.length,rejected:rejected+storedRejected,duplicates,conflicts,
  winRate:count?wins/count*100:null,total,average:count?total/count:null,factor:count?(losses?(finite(gains/losses)?gains/losses:null):gains?Infinity:null):null,
  complete,fetchedAt:account.fetchedAt,stale:now-fetched>300000,syncStatus:account.syncStatus||null,
  positions:Array.isArray(snapshot.positions)?snapshot.positions.filter(x=>x&&finite(x.quantity)&&x.quantity>0).length:null};
}
function read({storage=g.localStorage,selectedCurrency=null,selectedTicker=null,days=null,now=Date.now()}={}){
 try{const snapshots=JSON.parse(storage.getItem(SNAPSHOT_KEY)||'{}'),selected=g.T212Snapshot?.select(snapshots,'live');
  if(!selected)return empty('Conectează contul Trading 212 Invest pentru importul automat.');
  const data=JSON.parse(storage.getItem(KEY)||'{"accounts":{}}');
  return build({scope:selected[0],snapshot:selected[1],account:data.accounts?.[selected[0]],selectedCurrency,selectedTicker,days,now});
 }catch{return empty('Istoricul Trading 212 nu poate fi citit. Reia sincronizarea brokerului.');}
}
function demo(now=Date.now()){
 const fill=(n,side,realized,days)=>({id:'fictiv-'+n,ticker:'FICTIV_'+(n%2?'A':'B')+'_US_EQ',date:new Date(now-days*86400000).toISOString(),type:'TRADE',side,quantity:2,price:side==='BUY'?100:110,priceCurrency:'USD',currency:'EUR',realized,taxes:[{name:'CURRENCY_CONVERSION_FEE',quantity:.3,currency:'EUR'}]});
 return {scope:'fictiv-proof',snapshot:{environment:'live',summary:{currency:'EUR'},positions:[{quantity:2}]},account:{environment:'live',complete:true,fetchedAt:new Date(now).toISOString(),items:[fill(1,'SELL',18.4,1),fill(2,'SELL',-7.2,2),fill(3,'SELL',11.5,3),fill(4,'BUY',null,4),fill(5,'BUY',null,5)]}};
}
function analyse(report){
 const sells=(report?.rows||[]).filter(x=>x.type==='TRADE'&&x.side==='SELL'&&x.currency===report.currency&&finite(x.realized)),groups=new Map(),symbols=new Map(),fees=new Map();
 for(const x of sells){const at=Date.parse(x.date);groups.set(at,(groups.get(at)||0)+x.realized);const s=symbols.get(x.ticker)||{ticker:x.ticker,count:0,wins:0,total:0,best:-Infinity,worst:Infinity};s.count++;s.wins+=Number(x.realized>0);s.total+=x.realized;s.best=Math.max(s.best,x.realized);s.worst=Math.min(s.worst,x.realized);symbols.set(x.ticker,s);}
 let cumulative=0,peak=0,maxDrawdown=0;const curve=[...groups].sort((a,b)=>a[0]-b[0]).map(([at,pnl])=>{cumulative+=pnl;peak=Math.max(peak,cumulative);const drawdown=peak-cumulative;maxDrawdown=Math.max(maxDrawdown,drawdown);return {at,pnl,cumulative,drawdown};});
 let unknownCosts=0;for(const x of report?.rows||[]){if(x.type!=='TRADE')continue;if(x.taxes===null){unknownCosts++;continue;}for(const t of x.taxes||[]){const key=t.currency,s=fees.get(key)||{currency:key,total:0,count:0};s.total+=t.quantity;s.count++;fees.set(key,s);}}
 const rows=[...symbols.values()].map(s=>({...s,average:s.total/s.count,winRate:s.wins/s.count*100})).sort((a,b)=>a.total-b.total||a.ticker.localeCompare(b.ticker));
 if(![...curve.flatMap(x=>[x.pnl,x.cumulative,x.drawdown]),...rows.flatMap(x=>[x.total,x.average]),...[...fees.values()].map(x=>x.total)].every(finite))return {curve:[],symbols:[],fees:[],maxDrawdown:null,best:null,worst:null,unknownCosts,error:true};
 return {curve,symbols:rows,fees:[...fees.values()].sort((a,b)=>a.currency.localeCompare(b.currency)),maxDrawdown:curve.length?maxDrawdown:null,best:sells.length?sells.reduce((a,x)=>Math.max(a,x.realized),-Infinity):null,worst:sells.length?sells.reduce((a,x)=>Math.min(a,x.realized),Infinity):null,unknownCosts,error:false};
}
g.T212Performance={KEY,SNAPSHOT_KEY,build,read,demo,analyse};
})(typeof window!=='undefined'?window:globalThis);
