/* Frozen ensemble checkpoints, evaluated chronologically before future use. */
(function(g){
'use strict';
const C=g.HoldingsCalibration,F=g.HoldingsForecast,VERSION='holdings-learning-v1',POLICY=Object.freeze({minimum:40,testMinimum:20,classMinimum:4,probability:.45,margin:.10,lossMargin:.02,brierMargin:.01,componentTolerance:.01});
const clone=x=>JSON.parse(JSON.stringify(x)),argmax=p=>p.indexOf(Math.max(...p));
function key(e){return F.key(e)?.replace('tt_holdings_forecast_v1:','tt_holdings_learning_v1:')||null;}
function sample(item,now,onReport){let rows=[];const report=C.build(item,{scope:item.identity.scope,kind:item.identity.kind,now,onRows:r=>rows=r.filter(x=>!x.restored)});onReport?.(report);return rows;}
function checksum(text){let a=2166136261;for(let i=0;i<text.length;i++)a=Math.imul(a^text.charCodeAt(i),16777619);return (a>>>0).toString(16);}
function evaluate(fit,test){
 if(fit.length<20||test.length<20||[fit,test].some(xs=>[0,1,2].some(k=>xs.filter(r=>r.actualClass===k).length<POLICY.classMinimum))||fit.at(-1).end>=test[0].t)return null;
 const candidates=C.CONFIG.weights.flatMap(weight=>C.CONFIG.temperatures.map(temperature=>({weight,temperature,loss:C.score(fit,r=>C.combine(r.neural,r.boosting,weight,temperature)).loss}))),chosen=candidates.reduce((a,b)=>b.loss<a.loss-1e-8?b:a),prior=[0,1,2].map(k=>(fit.filter(r=>r.actualClass===k).length+1)/(fit.length+3));
 const parameters={neuralWeight:chosen.weight,temperature:chosen.temperature,prior},scores={candidate:C.score(test,r=>C.combine(r.neural,r.boosting,chosen.weight,chosen.temperature)),neural:C.score(test,r=>r.neural),boosting:C.score(test,r=>r.boosting),prior:C.score(test,()=>prior)};
 const s=scores.candidate,eligible=s.loss<scores.prior.loss-POLICY.lossMargin&&s.brier<scores.prior.brier-POLICY.brierMargin&&s.loss<=Math.min(scores.neural.loss,scores.boosting.loss)+POLICY.componentTolerance&&s.brier<=Math.min(scores.neural.brier,scores.boosting.brier)+POLICY.componentTolerance;
 return {parameters,scores,eligible,fitLoss:chosen.loss};
}
function checkpoint(fit,test,now){const evaluated=evaluate(fit,test);if(!evaluated)return null;const evidence=fit.concat(test).map(r=>({asOf:r.asOf,evidence:r.evidence}));return {id:'ensemble-'+checksum(JSON.stringify([evidence,evaluated.parameters])),createdAt:now,fitOrigins:fit.map(r=>r.asOf),testOrigins:test.map(r=>r.asOf),evidence,...evaluated,reviewEnd:test.at(-1).end};}
function validCheckpoint(c,rows,now){try{if(!c||!Number.isFinite(c.createdAt)||c.createdAt>now||!Array.isArray(c.fitOrigins)||!Array.isArray(c.testOrigins)||c.fitOrigins.length>F.MAX||c.testOrigins.length!==20)return false;const map=new Map(rows.map(r=>[r.asOf,r])),fit=c.fitOrigins.map(x=>map.get(x)),test=c.testOrigins.map(x=>map.get(x));if(fit.concat(test).some(r=>!r)||new Set(c.fitOrigins.concat(c.testOrigins)).size!==fit.length+test.length||fit.concat(test).some((r,i,a)=>i&&r.t<=a[i-1].end))return false;return JSON.stringify(checkpoint(fit,test,c.createdAt))===JSON.stringify(c);}catch{return false;}}
function initial(e){return {version:VERSION,symbol:e.symbol,currency:e.currency,kind:e.kind,champion:null,reviews:[],lastReviewEnd:0};}
function progress(rows,state,report,item,result,now){
 const reviews=Array.isArray(state.reviews)?state.reviews:[],reviewed=Number.isFinite(state.lastReviewEnd)&&state.lastReviewEnd>0,fresh=reviewed?rows.filter(r=>r.t>state.lastReviewEnd&&r.capturedAt>(reviews.at(-1)?.at||0)):rows,test=fresh.slice(-POLICY.testMinimum),fit=test.length?rows.filter(r=>r.end<test[0].t).slice(-100):[];
 const period=xs=>({n:xs.length,from:xs[0]?.asOf||null,to:xs.at(-1)?.asOf||null,lastOutcome:xs.at(-1)?.endAsOf||null,counts:[0,1,2].map(k=>xs.filter(r=>r.actualClass===k).length)}),split={fit:period(fit),test:period(test)},classesReady=[split.fit,split.test].every(p=>p.n>=POLICY.testMinimum&&p.counts.every(n=>n>=POLICY.classMinimum));
 const last=reviews.at(-1);let latest=null;
 if(result.ok&&last&&Number.isFinite(last.at)&&last.at<=now&&last.at===last.candidate?.createdAt&&validCheckpoint(last.candidate,rows,now)){
  const c=last.candidate,lookup=new Map(rows.map(r=>[r.asOf,r]));latest={at:last.at,id:c.id,promoted:last.promoted===true&&state.champion?.id===c.id,eligible:c.eligible,fit:period(c.fitOrigins.map(x=>lookup.get(x))),test:period(c.testOrigins.map(x=>lookup.get(x))),scores:clone(c.scores),parameters:{neuralWeight:c.parameters.neuralWeight,temperature:c.parameters.temperature}};
 }
 const target=reviewed?POLICY.testMinimum:POLICY.minimum,current=reviewed?fresh.length:rows.length,sourceError=item.check?.state==='error',phase=!result.ok||report.state==='blocked'?'blocked':sourceError?'source-error':reviews.length>=200?'limit':state.champion?'validated':latest?'rejected':current<target?'collecting':!classesReady?'classes':'ready';
 const titles={blocked:'Învățare de verificat','source-error':'Verificarea sursei a eșuat',limit:'Limita evaluărilor a fost atinsă',validated:'Versiune validată păstrată',rejected:'Ultimul candidat a fost respins',collecting:'Colectare de rezultate',classes:'Clase insuficient reprezentate',ready:'Date disponibile pentru evaluare'};
 return {phase,title:titles[phase],available:rows.length,current,target,remaining:Math.max(0,target-current),reviewed,classMinimum:POLICY.classMinimum,blockMinimum:POLICY.testMinimum,split,classesReady,checkpoint:result.ok?state.champion?.id||null:null,latest,pending:report.excluded.pending,excluded:{...report.excluded,restored:Math.max(0,report.available-rows.length)},reason:report.state==='blocked'?report.reason:result.reason,sourceError,reviewOnly:true};
}
function update(state,item,now=Date.now()){
 const e=item.identity;let report;const rows=sample(item,now,r=>report=r);let next=state?clone(state):initial(e);
 const finish=result=>({...result,progress:progress(rows,result.state,report,item,result,now)});
 if(next.version!==VERSION||next.symbol!==e.symbol||next.currency!==e.currency||next.kind!==e.kind||!Array.isArray(next.reviews)||next.reviews.length>200||!Number.isFinite(next.lastReviewEnd)||next.lastReviewEnd<0)return finish({ok:false,state:next,reason:'Versiunea învățării este incompatibilă; checkpoint-urile existente sunt păstrate.'});
 if(next.champion&&!validCheckpoint(next.champion,rows,now))return finish({ok:false,state:next,reason:'Dovezile versiunii active nu mai trec verificările. Verdictul probabilistic este suspendat.'});
 const fresh=next.lastReviewEnd?rows.filter(r=>r.t>next.lastReviewEnd&&r.capturedAt>(next.reviews.at(-1)?.at||0)):rows;
 if(rows.length<40||fresh.length<20||next.reviews.length===200)return finish({ok:true,state:next,changed:false,reason:next.champion?'Versiunea validată este păstrată până la următorul bloc de 20 rezultate noi.':'Colectare: minimum 40 perechi verificate, cu 20 rezervate testului.'});
 const test=fresh.slice(-20),fit=rows.filter(r=>r.end<test[0].t).slice(-100),candidate=checkpoint(fit,test,now);if(!candidate)return finish({ok:true,state:next,changed:false,reason:'Calibrarea și testul cer minimum 4 rezultate din fiecare clasă.'});
 let promote=candidate.eligible,incumbent=null;
 if(next.champion){const p=next.champion.parameters;incumbent=C.score(test,r=>C.combine(r.neural,r.boosting,p.neuralWeight,p.temperature));promote=promote&&candidate.scores.candidate.loss<incumbent.loss-POLICY.lossMargin&&candidate.scores.candidate.brier<incumbent.brier-POLICY.brierMargin;}
 next.reviews.push({at:now,candidate,incumbent,promoted:promote});next.lastReviewEnd=candidate.reviewEnd;if(promote)next.champion=candidate;
 return finish({ok:true,state:next,changed:true,reason:promote?'O versiune nouă a trecut testul temporal și a devenit activă.':'Candidatul nu a trecut toate comparațiile; versiunea anterioară este păstrată.'});
}
function probabilities(a,b){return [a,b].every(p=>Array.isArray(p)&&p.length===3&&p.every(v=>Number.isFinite(v)&&v>=0&&v<=1)&&Math.abs(p.reduce((s,v)=>s+v,0)-1)<1e-6);}
function predict(state,item,{neural,boosting,source,now=Date.now()}={}){
 const rows=sample(item,now),base={version:VERSION,kind:item.identity.kind,horizon:5,probabilities:null,classIndex:null,eligible:false,checkpoint:null,validation:null,observations:rows.length,evidence:{phase:'collecting',available:rows.length,minimum:POLICY.minimum,requiredTest:POLICY.testMinimum,fit:null,test:null,scores:null,monitoring:null},policy:{...POLICY},reason:'Probabilitățile individuale nu sunt încă disponibile.'};
 if(!source||source.symbol!==item.identity.symbol||source.currency!==item.identity.currency||source.kind!==item.identity.kind||!probabilities(neural,boosting))return base;
 const c=state?.champion,valid=state?.version===VERSION&&state.symbol===source.symbol&&state.currency===source.currency&&state.kind===source.kind&&c&&c.eligible&&validCheckpoint(c,rows,now)&&c.reviewEnd<source.t&&c.createdAt<=now&&item.check?.state!=='error';
 const p=valid?C.combine(neural,boosting,c.parameters.neuralWeight,c.parameters.temperature):C.combine(neural,boosting),classIndex=argmax(p),sorted=p.slice().sort((a,b)=>b-a),confident=sorted[0]>=POLICY.probability&&sorted[0]-sorted[1]>=POLICY.margin;
 const recent=valid?rows.filter(r=>r.t>c.reviewEnd&&r.capturedAt>c.createdAt).slice(-20):[],performance=recent.length===20?C.score(recent,r=>C.combine(r.neural,r.boosting,c.parameters.neuralWeight,c.parameters.temperature)):null,reference=recent.length===20?C.score(recent,()=>c.parameters.prior):null,degraded=!!performance&&performance.loss>=reference.loss&&performance.brier>=reference.brier;
 const period=xs=>({n:xs.length,from:xs[0]?.asOf||null,to:xs.at(-1)?.asOf||null,lastOutcome:xs.at(-1)?.endAsOf||null}),lookup=new Map(rows.map(r=>[r.asOf,r]));
 const evidence=valid?{phase:degraded?'suspended':confident?'validated':'abstaining',available:rows.length,minimum:POLICY.minimum,requiredTest:POLICY.testMinimum,fit:period(c.fitOrigins.map(x=>lookup.get(x))),test:period(c.testOrigins.map(x=>lookup.get(x))),scores:clone(c.scores),monitoring:{...period(recent),required:POLICY.testMinimum,performance,reference,degraded}}:base.evidence;
 return {...base,evidence,symbol:source.symbol,currency:source.currency,asOf:source.asOf,sourceFingerprint:source.fingerprint,probabilities:p,classIndex,eligible:!!valid&&confident&&!degraded,checkpoint:valid?c.id:null,validation:valid?{at:c.createdAt,fit:c.fitOrigins.length,test:c.testOrigins.length,parameters:c.parameters,scores:c.scores}:null,reason:!valid?'Media 50/50 exploratorie. Colectăm și validăm rezultatele înainte de activarea verdictului probabilistic.':degraded?'Performanța versiunii active s-a degradat pe 20 rezultate noi; verdictul probabilistic este suspendat.':!confident?'Versiune validată, dar probabilitățile actuale nu separă suficient clasele.':'Combinație validată pe rezultate observate; pragurile de încredere sunt îndeplinite.'};
}
g.HoldingsLearning={VERSION,POLICY,key,sample,evaluate,checkpoint,validCheckpoint,initial,update,predict};
})(typeof window!=='undefined'?window:globalThis);
