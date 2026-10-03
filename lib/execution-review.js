(function(g){
'use strict';
function cashResult(b,s,q){
 const known=x=>Number.isFinite(x.amount)&&x.amount>=0&&Number.isFinite(x.quantity)&&x.quantity>0&&typeof x.currency==='string'&&/^[A-Z]{3}$/.test(x.currency);
 if(!known(b)||!known(s)||b.currency!==s.currency)return {cashCurrency:null,cashDifference:null};
 // Net broker cash values are allocated proportionally, never charged a second time.
 return {cashCurrency:b.currency,cashDifference:q*(s.amount/s.quantity-b.amount/b.quantity)};
}
function fifo(items){const lots=new Map(),matches=[],unmatched=[];const fills=[...new Map(items.filter(x=>x.id).map(x=>[x.id,x])).values()].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)||String(a.id).localeCompare(String(b.id)));for(const f of fills){if(!f.ticker||Date.parse(f.date)>Date.now()+60000||!['BUY','SELL'].includes(f.side)||!Number.isFinite(f.quantity)||!(f.quantity>0)||!Number.isFinite(f.price)||!(f.price>0)||!f.priceCurrency||!Number.isFinite(Date.parse(f.date))){unmatched.push({id:f.id,reason:'Execuție incompletă'});continue;}const k=f.ticker+'|'+f.priceCurrency;let queue=lots.get(k)||[];if(f.side==='BUY'){queue.push({...f,remaining:f.quantity});lots.set(k,queue);continue;}let remaining=f.quantity;while(remaining>1e-9&&queue.length){const b=queue[0],quantity=Math.min(remaining,b.remaining);matches.push({ticker:f.ticker,buyId:b.id,sellId:f.id,opened:b.date,closed:f.date,quantity,entry:b.price,exit:f.price,currency:f.priceCurrency,gross:(f.price-b.price)*quantity,...cashResult(b,f,quantity)});b.remaining-=quantity;remaining-=quantity;if(b.remaining<=1e-9)queue.shift();}if(remaining>1e-9)unmatched.push({id:f.id,ticker:f.ticker,quantity:remaining,reason:'Cumpărare inițială absentă / istoric incomplet'});lots.set(k,queue);}return {matches,unmatched,open:[...lots.values()].flat()};}
g.ExecutionReview={fifo,cashResult};
})(typeof window!=='undefined'?window:globalThis);
