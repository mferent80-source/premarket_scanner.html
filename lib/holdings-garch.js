(function(g){
'use strict';
const VERSION='holdings-garch-v1';
const CONFIG=Object.freeze({minimumBars:510,maximumBars:2000,minimumTrain:252,testSize:160,folds:3,lambda:.94,persistenceCap:.995,iterations:320,minimumStep:.0001,edge:.02,minimumBlocks:20,elevatedRatio:1.5,highRatio:2.5,maximumShock:6,gapDays:7});
const HORIZONS=[5,20],DAY=86400000,finite=Number.isFinite,mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
const equal=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<=1e-7*Math.max(1,Math.abs(a),Math.abs(b));
const same=(a,b)=>{if(typeof b==='number')return Math.abs(b)>1e10?a===b:equal(a,b);if(Array.isArray(b))return Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>same(a[i],v));if(b&&typeof b==='object')return a&&Object.keys(b).every(k=>same(a[k],b[k]));return a===b;};
function dataset(bars,now=Date.now()){
 if(!Array.isArray(bars)||bars.length<CONFIG.minimumBars||bars.length>CONFIG.maximumBars)throw Error('GARCH necesită 510–2000 sesiuni OHLCV.');
 for(let i=0;i<bars.length;i++){
  const b=bars[i],last=bars[i-1];
  if(!b||![b.t,b.o,b.h,b.l,b.c,b.v].every(finite)||b.t>now||Math.min(b.o,b.l,b.c,b.v)<=0||b.h<Math.max(b.o,b.c)||b.l>Math.min(b.o,b.c)||i&&(b.t<=last.t||b.t-last.t>CONFIG.gapDays*DAY))throw Error('Istoric GARCH invalid, neordonat sau cu sesiuni lipsă.');
  if(i&&Math.abs(b.c/last.c-1)>.25)throw Error('Salt zilnic peste 25%: verifică ajustările și evenimentele înainte de GARCH.');
 }
 return {first:{t:bars[0].t,close:bars[0].c},rows:bars.slice(1).map((b,i)=>({t:b.t,close:b.c,r:100*Math.log(b.c/bars[i].c)}))};
}
function validData(data,now){
 const rows=data?.rows;let last=data?.first;
 if(!last||!finite(last.t)||!finite(last.close)||last.close<=0||!Array.isArray(rows)||rows.length<CONFIG.minimumBars-1||rows.length>=CONFIG.maximumBars)return false;
 for(const r of rows){if(!r||![r.t,r.close,r.r].every(finite)||r.t>now||r.close<=0||r.t<=last.t||r.t-last.t>CONFIG.gapDays*DAY||Math.abs(r.close/last.close-1)>.25||!equal(r.r,100*Math.log(r.close/last.close)))return false;last=r;}
 return true;
}
function moments(rows){const mu=mean(rows.map(r=>r.r)),variance=mean(rows.map(r=>(r.r-mu)**2));if(!finite(variance)||variance<1e-8)throw Error('Variație insuficientă pentru estimarea GARCH.');return {mu,variance};}
function next(model,h,r){return model.omega+model.alpha*(r-model.mu)**2+model.beta*h;}
function path(model,first,horizon){const out=[first];for(let i=1;i<horizon;i++)out.push(model.omega+(model.alpha+model.beta)*out.at(-1));return out;}
function nll(model,rows){let h=model.initialVariance,score=0;for(const r of rows){if(!finite(h)||h<=0)return Infinity;score+=.5*(Math.log(h)+(r.r-model.mu)**2/h);h=next(model,h,r.r);}return score/rows.length;}
const logit=p=>Math.log(p/(1-p)),sigmoid=z=>1/(1+Math.exp(-z));
function decode(z,m){const persistence=CONFIG.persistenceCap*sigmoid(z[1]),alpha=persistence*sigmoid(z[2]);return {mu:m.mu,initialVariance:m.variance,longRunVariance:m.variance*Math.exp(z[0]),omega:m.variance*Math.exp(z[0])*(1-persistence),alpha,beta:persistence-alpha};}
function fit(rows,{progress}={}){
 if(!Array.isArray(rows)||rows.length<CONFIG.minimumTrain)throw Error('Minimum 252 randamente înaintea testului GARCH.');
 const m=moments(rows),bounds=[[Math.log(.05),Math.log(20)],[-8,8],[-8,8]],starts=[[.05,.9],[.15,.7],[.3,.3]];let best=null;
 for(let member=0;member<starts.length;member++){
  const [alpha,beta]=starts[member],seed=[0,logit((alpha+beta)/CONFIG.persistenceCap),logit(alpha/(alpha+beta))];
  const point=z=>{z=z.map((v,i)=>Math.max(bounds[i][0],Math.min(bounds[i][1],v)));return {z,loss:nll(decode(z,m),rows)};};
  let simplex=[point(seed),...seed.map((_,k)=>point(seed.map((v,i)=>v+(i===k?.4:0))))],iteration=0;
  const diameter=()=>Math.max(...simplex.flatMap(a=>simplex.flatMap(b=>a.z.map((v,k)=>Math.abs(v-b.z[k])))));
  // Bounded deterministic Nelder–Mead; every objective evaluation is training-only.
  while(iteration<CONFIG.iterations&&diameter()>=CONFIG.minimumStep){
   simplex.sort((a,b)=>a.loss-b.loss);const worst=simplex[3],centroid=seed.map((_,k)=>mean(simplex.slice(0,3).map(p=>p.z[k]))),move=scale=>point(centroid.map((v,k)=>v+scale*(v-worst.z[k]))),reflected=move(1);
   if(reflected.loss<simplex[0].loss){const expanded=move(2);simplex[3]=expanded.loss<reflected.loss?expanded:reflected;}
   else if(reflected.loss<simplex[2].loss)simplex[3]=reflected;
   else{const outside=reflected.loss<worst.loss,contracted=move(outside?.5:-.5);if(contracted.loss<(outside?reflected.loss:worst.loss))simplex[3]=contracted;else simplex=simplex.map((p,i)=>i?point(p.z.map((v,k)=>(v+simplex[0].z[k])*.5)):p);}
   iteration++;if(iteration%10===0)progress?.({member:member+1,members:starts.length,epoch:iteration,total:CONFIG.iterations,loss:Math.min(...simplex.map(p=>p.loss))});
  }
  simplex.sort((a,b)=>a.loss-b.loss);const {z,loss}=simplex[0],maxStep=diameter();
  const candidate={...decode(z,m),nll:loss,iteration,maxStep,converged:maxStep<CONFIG.minimumStep,boundary:z.some((v,i)=>v<=bounds[i][0]+1e-4||v>=bounds[i][1]-1e-4)};
  if(!best||candidate.nll<best.nll)best=candidate;
 }
 return best;
}
function stateAt(model,rows){let h=model.initialVariance,ewma=h,lastVariance=h;for(const row of rows){lastVariance=h;h=next(model,h,row.r);ewma=CONFIG.lambda*ewma+(1-CONFIG.lambda)*(row.r-model.mu)**2;}return {variance:h,ewma,lastVariance};}
// Score cumulative residual variance, not a price target or a loss bound.
function qlike(observed,predicted){if(!finite(observed)||observed<0||!finite(predicted)||predicted<=0)throw Error('Varianță nevalidă.');return Math.log(predicted)+observed/predicted;}
function summarize(records){return {n:records.length,model:mean(records.map(r=>r.model)),constant:mean(records.map(r=>r.constant)),ewma:mean(records.map(r=>r.ewma))};}
function testModel(model,data,start,end){
 const rows=data.rows,train=rows.slice(0,start);let {variance:h,ewma}=stateAt(model,train);const scores={daily:[],5:[],20:[]};
 for(let i=start;i<end;i++){
  const observed=(rows[i].r-model.mu)**2;
  scores.daily.push({model:qlike(observed,h),constant:qlike(observed,model.initialVariance),ewma:qlike(observed,ewma)});
  for(const horizon of HORIZONS)if(i+horizon<=end&&(i-start)%horizon===0){
   const actual=rows.slice(i,i+horizon).reduce((sum,r)=>sum+(r.r-model.mu)**2,0),prediction=path(model,h,horizon).reduce((a,b)=>a+b,0);
   scores[horizon].push({origin:rows[i-1].t,target:rows[i+horizon-1].t,observed:actual,predicted:prediction,model:qlike(actual,prediction),constant:qlike(actual,horizon*model.initialVariance),ewma:qlike(actual,horizon*ewma)});
  }
  h=next(model,h,rows[i].r);ewma=CONFIG.lambda*ewma+(1-CONFIG.lambda)*observed;
 }
 return {daily:summarize(scores.daily),horizons:Object.fromEntries(HORIZONS.map(horizon=>[horizon,{...summarize(scores[horizon]),blocks:scores[horizon]}]))};
}
function currentEstimate(model,data){
 const {variance,ewma,lastVariance}=stateAt(model,data.rows),last=data.rows.at(-1),variancePath=path(model,variance,20),usualDailyPct=Math.sqrt(model.initialVariance);
 const horizons=HORIZONS.map(horizon=>{const sum=variancePath.slice(0,horizon).reduce((a,b)=>a+b,0),dailyEquivalentPct=Math.sqrt(sum/horizon);return {horizon,cumulativePct:Math.sqrt(sum),dailyEquivalentPct,ratio:dailyEquivalentPct/usualDailyPct,constantPct:usualDailyPct*Math.sqrt(horizon),ewmaPct:Math.sqrt(horizon*ewma)};});
 return {t:last.t,close:last.close,usualDailyPct,variancePath,horizons,shockZ:Math.abs(last.r-model.mu)/Math.sqrt(lastVariance)};
}
function advantage(metric){return metric.model<Math.min(metric.constant,metric.ewma)-CONFIG.edge;}
function evaluate(data,{progress,now=Date.now()}={}){
 if(!validData(data,now))throw Error('Randamentele GARCH nu pot fi verificate.');
 const n=data.rows.length,complete=n-CONFIG.folds*CONFIG.testSize>=CONFIG.minimumTrain,count=complete?3:1,folds=[];
 for(let i=0;i<count;i++){
  const start=n-(count-i)*CONFIG.testSize,end=start+CONFIG.testSize,model=fit(data.rows.slice(0,start),{progress:p=>progress?.({...p,stage:i+1,stages:count})});
  folds.push({start,end,model,periods:{train:{from:data.rows[0].t,to:data.rows[start-1].t,n:start},test:{from:data.rows[start].t,to:data.rows[end-1].t,n:end-start}},metrics:testModel(model,data,start,end)});
 }
 const latest=folds.at(-1),wins=Object.fromEntries(HORIZONS.map(h=>[h,folds.filter(f=>advantage(f.metrics.horizons[h])).length]));
 return {version:VERSION,config:{...CONFIG},reviewOnly:true,data,folds,walk:{status:complete?'evaluated':'insufficient',reason:complete?null:'Sunt necesare minimum 733 bare pentru trei ferestre de câte 160 sesiuni și 252 randamente anterioare.',wins},current:currentEstimate(latest.model,data)};
}
function validModel(model,rows){
 if(!model||![model.mu,model.initialVariance,model.longRunVariance,model.omega,model.alpha,model.beta,model.nll].every(finite)||model.omega<=0||model.alpha<0||model.beta<0||model.alpha+model.beta>=CONFIG.persistenceCap||!Number.isInteger(model.iteration)||model.iteration<1||model.iteration>CONFIG.iterations||typeof model.converged!=='boolean'||typeof model.boundary!=='boolean')return false;
 const m=moments(rows),z=[Math.log(model.longRunVariance/m.variance),logit((model.alpha+model.beta)/CONFIG.persistenceCap),logit(model.alpha/(model.alpha+model.beta))],bounds=[[Math.log(.05),Math.log(20)],[-8,8],[-8,8]];if(!finite(model.maxStep)||model.maxStep<0||model.maxStep>16||model.converged!==(model.maxStep<CONFIG.minimumStep)||!model.converged&&model.iteration!==CONFIG.iterations||z.some((v,i)=>!finite(v)||v<bounds[i][0]-1e-7||v>bounds[i][1]+1e-7)||model.boundary!==z.some((v,i)=>v<=bounds[i][0]+1e-4||v>=bounds[i][1]-1e-4))return false;return equal(model.mu,m.mu)&&equal(model.initialVariance,m.variance)&&model.longRunVariance>=m.variance*.05-1e-8&&model.longRunVariance<=m.variance*20+1e-8&&equal(model.longRunVariance,model.omega/(1-model.alpha-model.beta))&&equal(model.nll,nll(model,rows));
}
function valid(r,now=Date.now()){try{
 if(r?.version!==VERSION||r.reviewOnly!==true||JSON.stringify(r.config)!==JSON.stringify(CONFIG)||!validData(r.data,now))return false;
 const n=r.data.rows.length,complete=n-3*CONFIG.testSize>=CONFIG.minimumTrain,count=complete?3:1;
 if(!Array.isArray(r.folds)||r.folds.length!==count||r.walk?.status!==(complete?'evaluated':'insufficient')||(complete?r.walk?.reason!==null:typeof r.walk?.reason!=='string'))return false;
 for(let i=0;i<count;i++){
  const f=r.folds[i],start=n-(count-i)*CONFIG.testSize,end=start+CONFIG.testSize,train=r.data.rows.slice(0,start),periods={train:{from:r.data.rows[0].t,to:r.data.rows[start-1].t,n:start},test:{from:r.data.rows[start].t,to:r.data.rows[end-1].t,n:end-start}};
  if(f.start!==start||f.end!==end||!validModel(f.model,train)||!same(f.periods,periods)||!same(f.metrics,testModel(f.model,r.data,start,end)))return false;
 }
 const wins=Object.fromEntries(HORIZONS.map(h=>[h,r.folds.filter(f=>advantage(f.metrics.horizons[h])).length]));
 return same(r.walk.wins,wins)&&same(r.current,currentEstimate(r.folds.at(-1).model,r.data));
}catch{return false;}}
function assess(r){
 if(r.current.shockZ>CONFIG.maximumShock)return {state:'drift',message:'Ultimul randament depășește 6 deviații condiționale. Estimarea este ascunsă până la verificarea datelor și evenimentelor.'};
 if(r.walk.status!=='evaluated'||r.folds.some(f=>!f.model.converged||f.model.boundary)||HORIZONS.some(h=>r.folds.reduce((sum,f)=>sum+f.metrics.horizons[h].n,0)<CONFIG.minimumBlocks))return {state:'limited',message:'Istoric sau stabilitate numerică insuficientă pentru interpretarea robustă. Volatilitatea rămâne exploratorie și nu modifică verdictul.'};
 if(HORIZONS.some(h=>r.walk.wins[h]<2||!advantage(r.folds.at(-1).metrics.horizons[h])))return {state:'no-edge',message:'Avantajul nu se repetă față de ambele repere la 5 și 20 sesiuni. Estimarea rămâne exploratorie și nu modifică verdictul.'};
 return {state:'descriptive',message:'Avantaj istoric repetat față de varianța constantă și EWMA, la ambele orizonturi. Estimarea nu garantează fluctuațiile viitoare.'};
}
function level(r){const ratio=r.current.horizons[0].ratio;return ratio>=CONFIG.highRatio?'Foarte ridicată':ratio>=CONFIG.elevatedRatio?'Ridicată':ratio<=.75?'Sub nivelul istoric':'Apropiată de nivelul istoric';}
g.HoldingsGarch={VERSION,CONFIG,HORIZONS,dataset,fit,next,path,nll,stateAt,qlike,testModel,currentEstimate,advantage,evaluate,valid,assess,level};
})(typeof window!=='undefined'?window:globalThis);
