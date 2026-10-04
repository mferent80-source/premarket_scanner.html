(function(g){
'use strict';
const N=g.HoldingsNeural,VERSION='walk-forward-v1',COUNT=3,KEYS=['test','linear','constant'];
function period(rows){return {from:rows[0].t,to:rows.at(-1).t,lastLabel:rows.at(-1).end,n:rows.length};}
function plan(rows){
 if(rows.length<600)return [];
 const ends=[Math.floor(rows.length*.64),Math.floor(rows.length*.8),rows.length],starts=ends.map(end=>Math.floor(end*.8));
 return ends.map((end,i)=>{const prefix=rows.slice(0,end),a=Math.floor(end*.6),b=starts[i],next=i<2?rows[starts[i+1]].t:Infinity,parts={train:prefix.slice(0,a).filter(r=>r.end<rows[a].t),validation:prefix.slice(a,b).filter(r=>r.end<rows[b].t),test:prefix.slice(b).filter(r=>r.end<next)};return {id:i+1,parts,periods:Object.fromEntries(Object.entries(parts).map(([key,xs])=>[key,period(xs)]))};});
}
function aggregate(items){
 const n=items.reduce((sum,m)=>sum+m.n,0),confusion=Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>items.reduce((sum,m)=>sum+m.confusion[i][j],0))),totals=confusion.map(row=>row.reduce((a,b)=>a+b,0));
 return {n,loss:items.reduce((sum,m)=>sum+m.loss*m.n,0)/n,accuracy:confusion.reduce((sum,row,i)=>sum+row[i],0)/n,balanced:totals.some(x=>x===0)?null:confusion.reduce((sum,row,i)=>sum+row[i]/totals[i],0)/3,brier:items.reduce((sum,m)=>sum+m.brier*m.n,0)/n,confusion};
}
function summary(folds){
 const good=folds.filter(f=>f.status==='evaluated');if(!good.length)return null;
 const daily=Object.fromEntries(KEYS.map(k=>[k,aggregate(good.map(f=>f.metrics[k]))])),nonOverlap=Object.fromEntries(KEYS.map(k=>[k,aggregate(good.map(f=>f.nonOverlap[k]))])),wins=good.filter(f=>f.advantage).length,blockEnough=KEYS.every(k=>N.validMetric(nonOverlap[k],50,5));
 return {daily,nonOverlap,wins,pooledAdvantage:N.edge(daily.test,daily.linear,daily.constant),nonOverlapAdvantage:blockEnough&&N.edge(nonOverlap.test,nonOverlap.linear,nonOverlap.constant),blockEnough};
}
function equal(a,b){if(typeof a==='number'||typeof b==='number')return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-7;if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return a===b;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));}
function valid(walk,report){try{
 if(!walk||walk.version!==VERSION||walk.planned!==COUNT||typeof walk.consistent!=='boolean'||!Array.isArray(walk.folds))return false;
 if(walk.status==='insufficient')return walk.folds.length===0&&walk.summary===null&&!walk.consistent&&typeof walk.reason==='string'&&walk.reason.length>0;
 if(!['complete','incomplete'].includes(walk.status)||walk.folds.length!==COUNT)return false;
 let previousEnd=-Infinity;
 for(let i=0;i<COUNT;i++){
  const f=walk.folds[i],p=f.periods;if(f.id!==i+1||!p||!['evaluated','blocked'].includes(f.status))return false;
  for(const k of ['train','validation','test']){const t=p[k];if(!t||![t.from,t.to,t.lastLabel].every(Number.isFinite)||t.from>t.to||t.to>=t.lastLabel||!Number.isInteger(t.n)||t.n<1)return false;}
  if(p.train.lastLabel>=p.validation.from||p.validation.lastLabel>=p.test.from||p.test.from<=previousEnd)return false;previousEnd=p.test.lastLabel;
  if(f.status==='blocked'){if(typeof f.error!=='string'||!f.error||f.metrics!==null||f.nonOverlap!==null||f.advantage!==false)return false;continue;}
  if(!Number.isInteger(f.epochs)||f.epochs<5||f.epochs>240||KEYS.some(k=>!N.validMetric(f.metrics[k])||f.metrics[k].n!==p.test.n||!N.validMetric(f.nonOverlap[k],1,0)||f.nonOverlap[k].n>p.test.n)||KEYS.some(k=>f.nonOverlap[k].n!==f.nonOverlap.test.n)||f.advantage!==N.edge(f.metrics.test,f.metrics.linear,f.metrics.constant))return false;
 }
 const good=walk.folds.filter(f=>f.status==='evaluated'),computed=summary(walk.folds),complete=good.length===COUNT;if(walk.status!==(complete?'complete':'incomplete')||!equal(computed,walk.summary)||walk.consistent!==(complete&&computed.wins===COUNT&&computed.pooledAdvantage&&computed.nonOverlapAdvantage))return false;
 const last=walk.folds.at(-1);if(last.status!=='evaluated')return false;
 return !report||(equal(last.periods,report.periods)&&KEYS.every(k=>equal(last.metrics[k],report[k])&&equal(last.nonOverlap[k],report.nonOverlap[k])));
 }catch{return false;}}
function evaluateWith(rows,latest,fit,options={},validateFit){
 N.split(rows);const planned=plan(rows);
 if(!planned.length){const result=fit(N.split(rows),latest,options);result.walk={version:VERSION,planned:COUNT,status:'insufficient',reason:'Minimum 600 exemple etichetate pentru trei ferestre; testul recent rămâne disponibil.',folds:[],summary:null,consistent:false};return result;}
 const folds=[];let final;
 for(const item of planned){
  try{const result=fit(item.parts,item.id===COUNT?latest:item.parts.test.at(-1).x,{...options,progress:p=>options.progress?.({...p,stage:item.id,stages:COUNT})});if(!validateFit(result))throw Error('Raport numeric neverificabil.');folds.push({id:item.id,status:'evaluated',periods:result.report.periods,epochs:result.epochs,metrics:Object.fromEntries(KEYS.map(k=>[k,result.report[k]])),nonOverlap:Object.fromEntries(KEYS.map(k=>[k,result.report.nonOverlap[k]])),advantage:result.advantage});if(item.id===COUNT)final=result;}
  catch(error){if(item.id===COUNT)throw error;folds.push({id:item.id,status:'blocked',periods:item.periods,error:error.message||'Evaluare indisponibilă.',metrics:null,nonOverlap:null,advantage:false});}
 }
 const pooled=summary(folds),complete=folds.every(f=>f.status==='evaluated');final.walk={version:VERSION,planned:COUNT,status:complete?'complete':'incomplete',reason:complete?null:'Unele ferestre nu au suficiente exemple în fiecare clasă. Nu sunt eliminate din verdict.',folds,summary:pooled,consistent:complete&&pooled.wins===COUNT&&pooled.pooledAdvantage&&pooled.nonOverlapAdvantage};
 if(!valid(final.walk,final.report))throw Error('Evaluarea temporală nu poate fi verificată.');return final;
}
function evaluate(rows,latest,options={}){return evaluateWith(rows,latest,N.fitPartitions,options,N.valid);}
g.HoldingsNeuralEvaluation={VERSION,plan,aggregate,summary,evaluate,evaluateWith,valid};
})(typeof window!=='undefined'?window:globalThis);
