/* Execution facts against frozen levels. Daily excursions exclude partial sessions. */
(function(g){
'use strict';
const finite=Number.isFinite,unit=c=>typeof c==='string'&&/^[A-Z]{3}$/.test(c),date=(t,z)=>g.DailySeries.date(t,z),mean=xs=>xs.reduce((n,x)=>n+x.quantity*x.price,0)/xs.reduce((n,x)=>n+x.quantity,0);
function review(outcome,history,{now=Date.now()}={}){
 const r=outcome?.record,result={id:outcome?.id,available:false,reason:outcome?.reason||'Fără intrare asociată.',entry:null,exit:null,costs:[],missingCosts:0,checks:[]};
 if(!r||r.scope!==history?.scope||r.simulation!==(history.simulation===true)||!['open','closed','unverified'].includes(outcome.state))return result;
 if(!Array.isArray(history.rows)||!Array.isArray(outcome.buyIds)||!Array.isArray(outcome.sellIds)||new Set(history.rows.map(x=>x.id)).size!==history.rows.length)return result;
 const byId=new Map(history.rows.map(x=>[x.id,x])),buys=outcome.buyIds.map(id=>byId.get(id)),sells=outcome.sellIds.map(id=>byId.get(id));
 if(!buys.length||[...buys,...sells].some(x=>!x||x.ticker!==r.ticker||x.type!=='TRADE'||x.priceCurrency!==r.currency||!finite(x.price)||x.price<=0||!finite(x.quantity)||x.quantity<=0||!finite(Date.parse(x.date))||Date.parse(x.date)<=r.createdAt||Date.parse(x.date)>now)||buys.some(x=>x.side!=='BUY')||sells.some(x=>x.side!=='SELL'))return {...result,reason:'Execuțiile asociate nu mai pot fi reverificate.'};
 const entry=mean(buys),inside=buys.filter(x=>x.price>=r.entryLow&&x.price<=r.entryHigh).length,risk=entry-r.stop,exit=sells.length?mean(sells):null;
 if(!finite(entry)||!finite(risk)||exit!==null&&!finite(exit))return result;
 const costs=new Map();for(const x of [...buys,...sells]){if(!Array.isArray(x.taxes)){result.missingCosts++;continue;}for(const t of x.taxes){if(!finite(t.quantity)||!unit(t.currency)||!finite((costs.get(t.currency)||0)+t.quantity)){result.missingCosts++;continue;}costs.set(t.currency,(costs.get(t.currency)||0)+t.quantity);}}
 result.available=true;result.entry={average:entry,inside,total:buys.length,abovePct:Math.max(0,(entry/r.entryHigh-1)*100),riskPerUnit:risk>0?risk:null,lastAt:Math.max(...buys.map(x=>Date.parse(x.date)))};result.exit=exit===null?null:{average:exit,total:sells.length,atOrBelowStop:sells.filter(x=>x.price<=r.stop).length,atOrAboveTarget:sells.filter(x=>x.price>=r.target).length,lastAt:Math.max(...sells.map(x=>Date.parse(x.date)))};
 result.costs=[...costs].map(([currency,value])=>({currency,value}));
 result.checks=[{id:'entry',state:inside===buys.length?'observed':'review',text:inside+' / '+buys.length+' execuții BUY în zona inițială '+r.entryLow+'–'+r.entryHigh+' '+r.currency+'.'},
 {id:'verdict',state:['PLAN','CAUTION'].includes(r.verdict.code)?'observed':'review',text:'Verdict înaintea intrării: '+r.verdict.code+' · '+r.verdict.title+'.'},
 {id:'stop',state:risk>0?'observed':'review',text:risk>0?'Stop inițial '+r.stop+' '+r.currency+' · risc de preț '+risk.toFixed(4)+' / unitate, fără costuri.':'Prețul mediu BUY este la/sub stopul inițial; riscul R nu este calculabil.'},
 ...(sells.length?[{id:'exit',state:sells.some(x=>x.price<=r.stop)?'review':'observed',text:sells.filter(x=>x.price<=r.stop).length+' SELL la/sub stop · '+sells.filter(x=>x.price>=r.target).length+' SELL la/peste țintă. Prețurile nu confirmă existența sau respectarea unui ordin stop.'}]:[]),
 {id:'result',state:outcome.state==='closed'?'observed':'pending',text:outcome.state==='closed'?'Poziție închisă integral · '+outcome.pnl+' '+outcome.pnlCurrency+' P&L raportat.':outcome.reason}];
 return result;
}
function excursion(outcome,history,source,{splits=[],now=Date.now()}={}){
 const info=review(outcome,history,{now}),r=outcome?.record,fail=reason=>({ok:false,reason,sessions:0});
 if(!info.available||!r)return fail(info.reason);if(!unit(r.currency)||source?.symbol!==r.symbol||source.currency!==r.currency||source.kind!==(r.simulation?'synthetic':'market')||!finite(source.retrievedAt)||source.retrievedAt>now||now-source.retrievedAt>300000)return fail('Identitate, monedă sau prospețime a seriei neverificată.');
 try{
  if(!Array.isArray(source.bars)||!source.bars.length||source.bars.length>2000||!finite(source.closeMinutes)||!source.timezone)throw Error('Serie zilnică incompletă.');
  const bars=source.bars;let previous=0,day='';for(const b of bars){const d=date(b.t,source.timezone);if(![b.t,b.o,b.h,b.l,b.c,b.v].every(finite)||b.t<=previous||b.t>now||b.o<=0||b.l<=0||b.c<=0||b.h<Math.max(b.o,b.c)||b.l>Math.min(b.o,b.c)||b.v<0||d<=day)throw Error('Serie invalidă sau sesiuni duplicate.');previous=b.t;day=d;}
  if(source.asOf!==day||!r.simulation&&source.asOf!==g.DailySeries.expected(now,source.timezone,source.closeMinutes))throw Error('Sursa nu corespunde sesiunii încheiate actuale.');
  if(!Array.isArray(splits)||splits.some(t=>!finite(t)))throw Error('Evenimentele split nu sunt verificabile.');
  if(splits.some(t=>t>=r.createdAt&&t<=source.retrievedAt))throw Error('Split după captura originală; comparația cu prețurile execuțiilor este blocată.');
  const entryDay=date(info.entry.lastAt,source.timezone),exitDay=outcome.state==='closed'||outcome.state==='unverified'?date(info.exit?.lastAt,source.timezone):null;
  if(exitDay&&!bars.some(b=>date(b.t,source.timezone)===exitDay))throw Error('Sesiunea ieșirii lipsește; intervalul nu este acoperit.');
  if(date(bars[0].t,source.timezone)>entryDay||!bars.some(b=>date(b.t,source.timezone)===entryDay))throw Error('Sesiunea intrării lipsește; intervalul nu este acoperit.');
  if(exitDay&&day<exitDay)throw Error('Închiderea sesiunii ieșirii nu este încă disponibilă.');
  const path=bars.filter(b=>{const d=date(b.t,source.timezone);return d>entryDay&&(!exitDay||d<exitDay);});
  if(!path.length)return fail('Nicio sesiune completă între ultima execuție BUY și ieșire. Nu estimăm extreme intraday.');
  let prev=bars.findLast(b=>date(b.t,source.timezone)<=entryDay);for(const b of path){if(b.t-prev.t>7*86400000||Math.abs(b.c/prev.c-1)>.25||b.h/b.l>1.5)throw Error('Gol sau salt mare în serie; verifică ajustările și evenimentele.');prev=b;}
  const high=Math.max(...path.map(b=>b.h)),low=Math.min(...path.map(b=>b.l)),risk=info.entry.riskPerUnit;
  return {ok:true,sessions:path.length,from:date(path[0].t,source.timezone),to:date(path.at(-1).t,source.timezone),high,low,favorablePct:Math.max(0,(high/info.entry.average-1)*100),adversePct:Math.min(0,(low/info.entry.average-1)*100),favorableR:risk?Math.max(0,(high-info.entry.average)/risk):null,adverseR:risk?Math.min(0,(low-info.entry.average)/risk):null,stopTouched:low<=r.stop,targetTouched:high>=r.target,checkedAt:now,reason:'Extreme numai în sesiunile complete acoperite. Zilele intrării și ieșirii sunt excluse; ordinea stop/țintă în aceeași zi nu este cunoscută. Fără costuri, dividende sau FX.'};
 }catch(e){return fail(e.message);}
}
g.TradeReview={review,excursion};
})(typeof window!=='undefined'?window:globalThis);
