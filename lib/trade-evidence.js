/* Immutable pre-entry research snapshots. Outcomes are derived only from unambiguous future broker fills. */
(function(g){
'use strict';
const {KEY,VERSION,IDS,valid}=g.TradeEvidenceSchema,finite=Number.isFinite,copy=x=>JSON.parse(JSON.stringify(x));
function snapshot(candidate,report,model,{scope,baselineQuantity=0,baselineAt,now=Date.now(),id=null,simulation=false}={}){
 if(!g.TTDecisionVerdict?.sourceCurrent(candidate,now)||report?.symbol!==candidate.symbol||report.source?.historyKey!==candidate.trend?.historyKey)return null;
 const source=g.TTDecisionVerdict.sourceOf(candidate),compatible=g.TTDecisionVerdict.compatibleModel(model,source,now);
 const r={version:VERSION,simulation,id:id||'te_'+now+'_'+(g.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)),scope,ticker:candidate.symbol+'_US_EQ',symbol:candidate.symbol,currency:candidate.currency,createdAt:now,expiresAt:Math.min(now+1800000,candidate.ts+1800000),baselineAt,baselineQuantity,mode:candidate.mode,entryLow:candidate.entryLow,entryHigh:candidate.entryHigh,stop:candidate.stop,target:candidate.target,
  source:{symbol:source.symbol,currency:source.currency,asOf:source.asOf,kind:source.kind,historyKey:source.historyKey,checkedAt:source.checkedAt},verdict:{code:report.code,title:String(report.title||'').slice(0,200),snapshotId:report.snapshotId},
  models:IDS.map(id=>{const x=compatible?model.cards.find(c=>c.id===id):null;return {id,name:x?.name||id,available:!!x,eligible:x?.eligible===true,direction:x&&[0,1,2].includes(x.direction)?x.direction:null,state:typeof x?.state==='string'?x.state.slice(0,80):null};})};
 return valid(r,now)?copy(r):null;
}
function read(storage=g.localStorage,now=Date.now()){const raw=storage.getItem(KEY),d=JSON.parse(raw||'{"version":"trade-evidence-v1","entries":[]}');if(!g.TradeEvidenceSchema.ledger(d,{simulation:d?.entries?.[0]?.simulation===true,now}))throw Error('Registrul analizelor este incompatibil; copia existentă este păstrată.');return {raw,entries:d.entries};}
async function save(record,{storage=g.localStorage,now=Date.now(),simulation=false}={}){
 if(!valid(record,now)||record.simulation!==simulation)throw Error('Analiza nu poate fi păstrată pentru o intrare viitoare.');
 const operation=()=>{const before=read(storage,now);if(before.entries.some(r=>r.simulation!==simulation))throw Error('Registrul nu corespunde mediului capturii; copia existentă este păstrată.');const old=before.entries.find(x=>x.id===record.id);if(old){if(JSON.stringify(old)!==JSON.stringify(record))throw Error('Analiza fixată nu poate fi rescrisă.');return old;}if(before.entries.length>=20000)throw Error('Registrul este plin; exportă istoricul.');if(storage.getItem(KEY)!==before.raw)throw Error('Registrul s-a modificat. Reîncearcă.');storage.setItem(KEY,JSON.stringify({version:VERSION,entries:[...before.entries,copy(record)]}));return copy(record);};
 return g.navigator?.locks?.request?g.navigator.locks.request(KEY,operation):operation();
}
function evaluate(records,history,now=Date.now()){
 const eligible=records.filter(r=>valid(r,now)&&r.scope===history?.scope&&r.simulation===(history.simulation===true)),fills=(history?.rows||[]).filter(x=>Date.parse(x.date)<=now).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)||a.id.localeCompare(b.id)),out=[];
 for(const r of eligible){
  const result={id:r.id,record:copy(r),state:'pending',reason:'Aștept o cumpărare ulterioară analizei, în fereastra fixată de maximum 30 minute.',entryAt:null,closedAt:null,quantity:null,remaining:null,pnl:null,pnlCurrency:null,priceR:null,buyIds:[],sellIds:[]};
  const tickerFills=fills.filter(x=>x.ticker===r.ticker),buys=tickerFills.filter(x=>x.type==='TRADE'&&x.side==='BUY'&&Date.parse(x.date)>r.createdAt&&Date.parse(x.date)<=r.expiresAt);
  const first=buys.find(x=>{const candidates=eligible.filter(z=>z.ticker===r.ticker&&Date.parse(x.date)>z.createdAt&&Date.parse(x.date)<=z.expiresAt).sort((a,b)=>b.createdAt-a.createdAt);return candidates[0]?.id===r.id&&(candidates.length===1||candidates[0].createdAt!==candidates[1].createdAt);});
  if(!first){if(now>r.expiresAt){result.state='expired';result.reason='Fereastra s-a încheiat fără o intrare asociată. Analiza rămâne păstrată.';}out.push(result);continue;}
  const entryAt=Date.parse(first.date),after=tickerFills.filter(x=>Date.parse(x.date)>=entryAt);result.entryAt=entryAt;
  const ambiguity=r.baselineQuantity!==0||tickerFills.some(x=>Date.parse(x.date)>=r.baselineAt&&Date.parse(x.date)<=r.createdAt);
  let quantity=0,sold=0,entryValue=0,exitValue=0,pnl=0,wallet=null,reason=ambiguity?'Poziție preexistentă sau execuție între snapshot și captură; asocierea rezultatului este ambiguă.':null;
  for(const x of after){
   if(sold>0&&Math.abs(sold-quantity)<=1e-8*Math.max(1,quantity))break;
   if(x.type!=='TRADE'||(x.priceCurrency==='GBp'?'GBX':x.priceCurrency)!==r.currency){reason='Eveniment corporativ, tip sau monedă a instrumentului neverificată.';break;}
   if(tickerFills.some(y=>y.id!==x.id&&y.side!==x.side&&Date.parse(y.date)===Date.parse(x.date))){reason='Execuții BUY și SELL la același timp; ordinea nu este verificată.';break;}
   if(x.side==='BUY'){
    if(x.id!==first.id&&(!first.orderId||x.orderId!==first.orderId)){reason='O altă cumpărare modifică baza poziției; rezultatul nu este atribuit modelului.';break;}
    quantity+=x.quantity;entryValue+=x.quantity*x.price;result.buyIds.push(x.id);
   }else{
    sold+=x.quantity;exitValue+=x.quantity*x.price;result.sellIds.push(x.id);result.closedAt=Date.parse(x.date);
    if(sold>quantity+1e-8*Math.max(1,quantity)){reason='Vânzarea depășește cantitatea asociată analizei.';break;}
    if(!finite(x.realized)||!x.currency||(wallet&&wallet!==x.currency)){reason='P&L raportat sau monedă de cont neverificată.';break;}wallet=x.currency;pnl+=x.realized;
   }
  }
  result.quantity=quantity;result.remaining=Math.max(0,quantity-sold);
  if(![quantity,entryValue,exitValue,pnl].every(finite))reason='Agregate necalculabile.';
  if(reason){result.state='ambiguous';result.reason=reason;result.closedAt=null;}
  else if(quantity>0&&Math.abs(sold-quantity)<=1e-8*Math.max(1,quantity)){
   if(!history.complete||history.stale||history.state==='error'){result.state='unverified';result.reason='Poziția pare închisă; aștept istoricul complet și actual înaintea evaluării.';}
   else{result.state='closed';result.pnl=pnl;result.pnlCurrency=wallet;const risk=entryValue-r.stop*quantity,R=risk>0?(exitValue-entryValue)/risk:null;result.priceR=finite(R)?R:null;result.reason='Poziție închisă, asociată integral. R brut în moneda instrumentului exclude costurile și FX.';}
  }else{result.state='open';result.closedAt=null;result.reason='Intrare asociată; aștept închiderea integrală. Ieșirile parțiale nu devin rezultate finale.';}
  out.push(result);
 }
 return out.sort((a,b)=>b.record.createdAt-a.record.createdAt);
}
function summarize(outcomes,currency){
 const closed=outcomes.filter(x=>x.state==='closed'&&x.pnlCurrency===currency&&finite(x.pnl)),groups=new Map();
 for(const x of closed){for(const [model,direction] of [['verdict',x.record.verdict.code],...x.record.models.map(m=>[m.id,!m.available?'missing':!m.eligible?'abstain':m.direction===null?'context':String(m.direction)])]){const key=model+'|'+direction,s=groups.get(key)||{model,direction,count:0,wins:0,total:0};s.count++;s.wins+=Number(x.pnl>0);s.total+=x.pnl;groups.set(key,s);}}
 return {count:closed.length,total:closed.length?closed.reduce((s,x)=>s+x.pnl,0):null,groups:[...groups.values()].map(s=>({...s,winRate:s.wins/s.count*100,average:s.total/s.count}))};
}
function robustness(outcomes,history,{currency,extraCost=1}={}){
 if(!finite(extraCost)||extraCost<0||extraCost>1000000)throw Error('Cost suplimentar invalid.');
 const eligible=outcomes.filter(x=>x.state==='closed'&&x.pnlCurrency===currency&&finite(x.pnl)),fills=new Map((history.rows||[]).map(x=>[x.id,x])),seen=new Set(),groups=new Map(),rows=[];let excluded=0;
 for(const x of eligible.sort((a,b)=>a.closedAt-b.closedAt||a.entryAt-b.entryAt)){
  const ids=[...(x.buyIds||[]),...(x.sellIds||[])];if(!ids.length||ids.some(id=>seen.has(id))||new Set(ids).size!==ids.length){excluded++;continue;}ids.forEach(id=>seen.add(id));
  const executions=ids.map(id=>fills.get(id)),costsKnown=executions.every(f=>f&&Array.isArray(f.taxes)&&f.taxes.every(t=>t&&finite(t.quantity)&&/^[A-Z]{3}$/.test(t.currency||''))),fxKnown=executions.every(f=>f&&(f.currency===f.priceCurrency||finite(f.fxRate)&&f.fxRate>0));
  rows.push({...x,costsKnown,fxKnown,stressPnl:x.pnl-extraCost});
 }
 function stats(xs){const n=xs.length,wins=xs.filter(x=>x.pnl>0).length,z=1.96,p=n?wins/n:null,d=n?1+z*z/n:null,center=n?(p+z*z/(2*n))/d:null,half=n?z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d:null,total=n?xs.reduce((s,x)=>s+x.pnl,0):null;return {n,wins,total,winRate:n?p*100:null,low:n?Math.max(0,center-half)*100:null,high:n?Math.min(1,center+half)*100:null,stressTotal:n?total-n*extraCost:null,stressWins:xs.filter(x=>x.stressPnl>0).length,costsKnown:xs.filter(x=>x.costsKnown).length,fxKnown:xs.filter(x=>x.fxKnown).length};}
 for(const x of rows){for(const [model,direction] of [['verdict',x.record.verdict.code],...x.record.models.map(m=>[m.id,!m.available?'missing':!m.eligible?'abstain':m.direction===null?'context':String(m.direction)])]){const key=model+'|'+direction;if(!groups.has(key))groups.set(key,{model,direction,rows:[]});groups.get(key).rows.push(x);}}
 const separate=[];let end=-Infinity;for(const x of rows){if(finite(x.entryAt)&&finite(x.closedAt)&&x.entryAt>end){separate.push(x);end=x.closedAt;}}
 const all=stats(rows),sample=stats(separate);return {...all,extraCost,excluded,separate:sample,groups:[...groups.values()].map(x=>({model:x.model,direction:x.direction,...stats(x.rows)})),state:all.n<30?'small':all.costsKnown<all.n||all.fxKnown<all.n?'costs-unverified':sample.n<30?'overlap':'descriptive',reason:all.n<30?'Sub 30 poziții închise: eșantion mic.':all.costsKnown<all.n||all.fxKnown<all.n?'Costuri sau FX incomplete: avantajul după toate costurile nu este confirmat.':sample.n<30?'Sub 30 intervale de tranzacționare separate; expunerile suprapuse reduc diversitatea eșantionului.':'Eșantion descriptiv disponibil; nu este un test cauzal al avantajului modelului.'};
}
function demo(now=Date.now()){
 const records=[],rows=[];for(let i=0;i<2;i++){const createdAt=now-(10-i*3)*86400000,symbol='FICTIV'+(i?'B':'A'),r={version:VERSION,simulation:true,id:'demo-'+i,scope:'evidence-demo',ticker:symbol+'_US_EQ',symbol,currency:'USD',createdAt,expiresAt:createdAt+1800000,baselineAt:createdAt-1000,baselineQuantity:0,mode:'momentum',entryLow:99,entryHigh:101,stop:95,target:110,source:{symbol,currency:'USD',asOf:new Date(createdAt-86400000).toISOString().slice(0,10),kind:'synthetic',historyKey:'ohlcv60:12345678',checkedAt:createdAt},verdict:{code:'PLAN',title:'Plan fictiv',snapshotId:'fictiv-'+i},models:IDS.map(id=>({id,name:id,available:true,eligible:!['garch','isolation'].includes(id),direction:['garch','isolation'].includes(id)?null:id==='knn'&&i?0:2,state:'fictiv'}))};records.push(r);rows.push({id:'buy-'+i,orderId:'order-'+i,ticker:r.ticker,type:'TRADE',date:new Date(createdAt+60000).toISOString(),side:'BUY',quantity:2,price:100,priceCurrency:'USD',currency:'EUR',realized:null},{id:'sell-'+i,orderId:'exit-'+i,ticker:r.ticker,type:'TRADE',date:new Date(createdAt+86400000).toISOString(),side:'SELL',quantity:2,price:i?95:110,priceCurrency:'USD',currency:'EUR',realized:i?-11:18});}
 return {records,history:{scope:'evidence-demo',simulation:true,currency:'EUR',rows,complete:true,stale:false,state:'ready'}};
}
function fromForecast(forecast,e,{baselineQuantity,baselineAt,cards=[],now=Date.now()}={}){if(e?.kind!=='market'||!g.HoldingsForecast?.validEntry(forecast,e,now)||forecast.model!=='verdict'||forecast.horizon!==5||forecast.restoredAt!==undefined||forecast.outcome!==null||forecast.verification.state!=='pending'||forecast.verification.checkedAt!==null||!g.HoldingsStrategy?.supported(e,forecast.source)||now-forecast.capturedAt>60000)return null;const s=forecast.source,atr=s.close*s.atrPct/100,stop=s.close-atr,target=s.close+2*atr,r={version:'trade-evidence-v2',simulation:false,id:'holdings-entry|'+e.scope+'|'+e.ticker+'|'+forecast.id,scope:e.scope,ticker:e.ticker,symbol:e.symbol,currency:e.currency,createdAt:now,expiresAt:now+1800000,baselineAt,baselineQuantity,mode:'holdings',entryLow:s.close,entryHigh:s.close,stop,target,source:{symbol:e.symbol,currency:e.currency,asOf:s.asOf,kind:'market',historyKey:forecast.estimate.sourceFingerprint,checkedAt:forecast.capturedAt},verdict:{code:'HOLDINGS',title:forecast.estimate.title,snapshotId:forecast.id},models:IDS.map(id=>{const original=forecast.estimate.cards.find(x=>x.id===id),c=cards.find(x=>x.id===id);return {id,name:id,available:!!original,eligible:c?.eligible===true,direction:[0,1,2].includes(c?.direction)?c.direction:null,state:original?.state||null};})};return valid(r,now)?r:null;}
g.TradeEvidence={fromForecast,KEY,VERSION,IDS,valid,snapshot,read,save,evaluate,summarize,robustness,demo};
})(typeof window!=='undefined'?window:globalThis);
