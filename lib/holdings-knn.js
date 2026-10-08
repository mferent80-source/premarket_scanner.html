(function(g){
'use strict';
const N=g.HoldingsNeural,E=g.HoldingsNeuralEvaluation,VERSION='holdings-knn-v1',HORIZON=5,KS=[5,9,15];
const finite=Number.isFinite,copy=x=>JSON.parse(JSON.stringify(x));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function separated(rows){let end=-Infinity;return rows.filter(r=>{if(r.t<=end)return false;end=r.end;return true;});}
function period(xs){return {from:xs[0].t,to:xs.at(-1).t,lastLabel:xs.at(-1).end,n:xs.length};}
function prior(rows){const counts=[1,1,1];rows.forEach(r=>counts[r.y]++);return counts.map(n=>n/(rows.length+3));}
function momentum(x){const d=x[0]/x[8],label=d<=-1?0:d>=1?2:1;return [0,1,2].map(k=>k===label?.8:.1);}
function neighbors(model,x,t=Infinity){
 const z=N.normalize(x,model.scale);
 return model.memory.filter(r=>r.end<t).map(r=>({t:r.t,end:r.end,y:r.y,distance:Math.sqrt(N.normalize(r.x,model.scale).reduce((s,v,j)=>s+(v-z[j])**2,0)/10)})).sort((a,b)=>a.distance-b.distance||a.t-b.t).slice(0,model.k);
}
function predict(model,x,t=Infinity){
 const nearby=neighbors(model,x,t);if(nearby.length!==model.k)throw Error('Vecini istorici insuficienți, cu rezultate încheiate înaintea estimării.');
 // Laplace smoothing: these are uncalibrated class frequencies, not profit probabilities.
 const counts=[1,1,1];nearby.forEach(r=>counts[r.y]++);return counts.map(n=>n/(model.k+3));
}
function edge(a,b,c){return N.edge(a,b,c);}
function fitPartitions(parts,current,options={}){
 N.checkParts(parts);
 if(!current||!finite(current.t)||current.t!==parts.test.at(-1).end||!finite(current.close)||current.close<=0||!Array.isArray(current.x)||current.x.length!==10||!current.x.every(finite))throw Error('Sesiunea și indicatorii curenți KNN nu pot fi verificați.');
 const memory=separated(parts.train),counts=[0,0,0];memory.forEach(r=>counts[r.y]++);
 if(memory.length<30||counts.some(n=>n<3))throw Error('Sunt necesari minimum 30 vecini istorici pe orizonturi separate și trei exemple din fiecare clasă.');
 const scale=N.scaler(parts.train),model={k:KS[0],scale,memory:copy(memory)},constant=prior(parts.train);
 const candidates=KS.map((k,i)=>{options.progress?.({epoch:i+1,total:KS.length});return {k,metrics:N.metrics(parts.validation,x=>predict({...model,k},x))};});
 for(const c of candidates)if(c.metrics.loss<candidates.find(c=>c.k===model.k).metrics.loss-1e-8)model.k=c.k;
 const distances=parts.validation.map(r=>neighbors(model,r.x,r.t).at(-1).distance).sort((a,b)=>a-b),distanceLimit=Math.max(.1,2*distances[Math.ceil(.95*distances.length)-1]);
 const metrics=xs=>({test:N.metrics(xs,x=>predict(model,x)),constant:N.metrics(xs,()=>constant),momentum:N.metrics(xs,momentum)}),test=metrics(parts.test),blocks=separated(parts.test),nearby=neighbors(model,current.x,current.t),support=predict(model,current.x,current.t),maxZ=Math.max(...N.normalize(current.x,scale).map(Math.abs));
 return {version:VERSION,horizon:HORIZON,reviewOnly:true,model,constant,selection:{candidates,distances,distanceLimit},current:{...copy(current),support,classIndex:support.indexOf(Math.max(...support)),maxZ,neighbors:nearby,distance:nearby.at(-1).distance},report:{...test,nonOverlap:{...metrics(blocks),period:period(blocks)},periods:Object.fromEntries(Object.entries(parts).map(([k,xs])=>[k,period(xs)]))},advantage:edge(test.test,test.constant,test.momentum)};
}
function summary(folds){
 const good=folds.filter(f=>f.status==='evaluated');if(!good.length)return null;
 const pool=key=>Object.fromEntries(['test','constant','momentum'].map(k=>[k,E.aggregate(good.map(f=>f[key][k]))])),daily=pool('metrics'),nonOverlap=pool('nonOverlap'),blockEnough=['test','constant','momentum'].every(k=>N.validMetric(nonOverlap[k],50,5));
 return {daily,nonOverlap,wins:good.filter(f=>f.advantage).length,blockEnough,pooledAdvantage:edge(daily.test,daily.constant,daily.momentum),nonOverlapAdvantage:blockEnough&&edge(nonOverlap.test,nonOverlap.constant,nonOverlap.momentum)};
}
function evaluate(data,current,options={}){
 const parts=N.split(data.rows),planned=E.plan(data.rows);if(!planned.length){const r=fitPartitions(parts,current,options);r.walk={status:'insufficient',folds:[],summary:null,consistent:false,reason:'Minimum 600 exemple etichetate pentru trei ferestre. Testul recent rămâne disponibil.'};return r;}
 const folds=[];let final;
 for(const item of planned){try{
  // Earlier folds evaluate only metrics; the live estimate uses the final verified EOD.
  const c=item.id===3?current:{t:item.parts.test.at(-1).end,close:1,x:item.parts.test.at(-1).x},r=fitPartitions(item.parts,c,{progress:p=>options.progress?.({...p,stage:item.id,stages:3})});
  folds.push({id:item.id,status:'evaluated',periods:r.report.periods,metrics:{test:r.report.test,constant:r.report.constant,momentum:r.report.momentum},nonOverlap:r.report.nonOverlap,advantage:r.advantage});if(item.id===3)final=r;
 }catch(error){if(item.id===3)throw error;folds.push({id:item.id,status:'blocked',periods:item.periods,error:error.message,metrics:null,nonOverlap:null,advantage:false});}}
 const s=summary(folds),complete=folds.every(f=>f.status==='evaluated');final.walk={status:complete?'complete':'incomplete',folds,summary:s,consistent:complete&&s.wins===3&&s.pooledAdvantage&&s.nonOverlapAdvantage,reason:complete?null:'Unele ferestre au clase sau vecini insuficienți; nu sunt eliminate din verificare.'};return final;
}
function validPeriods(p){return ['train','validation','test'].every(k=>p[k]&&[p[k].from,p[k].to,p[k].lastLabel].every(finite)&&p[k].from<=p[k].to&&p[k].to<p[k].lastLabel&&Number.isInteger(p[k].n)&&p[k].n>0)&&p.train.lastLabel<p.validation.from&&p.validation.lastLabel<p.test.from;}
function validMetrics(m,n,minimum=50,classMinimum=5){return ['test','constant','momentum'].every(k=>N.validMetric(m[k],minimum,classMinimum)&&m[k].n===n);}
function valid(r){try{
 const m=r.model,c=r.current,s=r.selection,p=r.report.periods;
 if(r.version!==VERSION||r.horizon!==HORIZON||r.reviewOnly!==true||!KS.includes(m.k)||!validPeriods(p)||!Array.isArray(m.memory)||m.memory.length<30||m.memory.length>2000||!Array.isArray(m.scale.means)||!Array.isArray(m.scale.scales)||m.scale.means.length!==10||m.scale.scales.length!==10||!m.scale.means.every(finite)||!m.scale.scales.every(v=>finite(v)&&v>0)||!Array.isArray(r.constant)||r.constant.length!==3||!r.constant.every(v=>finite(v)&&v>0&&v<1)||Math.abs(r.constant.reduce((a,b)=>a+b,0)-1)>1e-7)return false;
 const counts=[0,0,0];for(let i=0;i<m.memory.length;i++){const a=m.memory[i];if(![a.t,a.end].every(finite)||a.t>=a.end||a.t<p.train.from||a.t>p.train.to||a.end>p.train.lastLabel||i&&m.memory[i-1].end>=a.t||!Array.isArray(a.x)||a.x.length!==10||!a.x.every(finite)||a.x[8]<=0||![0,1,2].includes(a.y))return false;counts[a.y]++;}if(counts.some(n=>n<3))return false;
 if(!finite(c.close)||c.close<=0||c.t!==p.test.lastLabel||!Array.isArray(c.x)||c.x.length!==10||!c.x.every(finite)||c.x[8]<=0||!finite(c.maxZ)||!finite(c.distance)||!equal(c.neighbors,neighbors(m,c.x,c.t))||!equal(c.support,predict(m,c.x,c.t))||c.classIndex!==c.support.indexOf(Math.max(...c.support))||c.distance!==c.neighbors.at(-1).distance||c.maxZ!==Math.max(...N.normalize(c.x,m.scale).map(Math.abs)))return false;
 if(!Array.isArray(s.candidates)||s.candidates.length!==KS.length||s.candidates.some((x,i)=>x.k!==KS[i]||!N.validMetric(x.metrics)||x.metrics.n!==p.validation.n)||!Array.isArray(s.distances)||s.distances.length!==p.validation.n||s.distances.some((d,i)=>!finite(d)||d<0||i&&d<s.distances[i-1])||s.distanceLimit!==Math.max(.1,2*s.distances[Math.ceil(.95*s.distances.length)-1]))return false;
 let k=KS[0];for(const x of s.candidates)if(x.metrics.loss<s.candidates.find(x=>x.k===k).metrics.loss-1e-8)k=x.k;if(k!==m.k)return false;
 if(!validMetrics(r.report,p.test.n)||r.advantage!==edge(r.report.test,r.report.constant,r.report.momentum)||!validMetrics(r.report.nonOverlap,r.report.nonOverlap.period.n,1,0))return false;
 const bp=r.report.nonOverlap.period;if(bp.from!==p.test.from||bp.to>p.test.to||bp.lastLabel>p.test.lastLabel||bp.from>bp.to||bp.to>=bp.lastLabel||bp.n>p.test.n)return false;
 const w=r.walk;if(!w||typeof w.consistent!=='boolean')return false;
 if(w.status==='insufficient')return w.folds?.length===0&&w.summary===null&&!w.consistent&&typeof w.reason==='string'&&w.reason.length>0;
 if(!['complete','incomplete'].includes(w.status)||w.folds?.length!==3)return false;
 let end=-Infinity;for(let i=0;i<3;i++){const f=w.folds[i];if(f.id!==i+1||!validPeriods(f.periods)||f.periods.test.from<=end)return false;end=f.periods.test.lastLabel;if(f.status==='blocked'){if(!f.error||f.metrics!==null||f.nonOverlap!==null||f.advantage!==false)return false;}else if(f.status!=='evaluated'||!validMetrics(f.metrics,f.periods.test.n)||!validMetrics(f.nonOverlap,f.nonOverlap.period.n,1,0)||f.advantage!==edge(f.metrics.test,f.metrics.constant,f.metrics.momentum))return false;}
 const computed=summary(w.folds),complete=w.folds.every(f=>f.status==='evaluated'),last=w.folds.at(-1);
 return w.status===(complete?'complete':'incomplete')&&equal(w.summary,computed)&&w.consistent===(complete&&computed.wins===3&&computed.pooledAdvantage&&computed.nonOverlapAdvantage)&&equal(last.periods,p)&&equal(last.metrics,{test:r.report.test,constant:r.report.constant,momentum:r.report.momentum})&&equal(last.nonOverlap,r.report.nonOverlap);
 }catch{return false;}}
function assess(r){
 if(r.current.maxZ>6||r.current.distance>r.selection.distanceLimit)return {state:'drift',message:'Indicatorii sau distanța vecinilor ies din domeniul validării. KNN se abține.'};
 const ps=r.current.support.slice().sort((a,b)=>b-a);if(ps[0]-ps[1]<.1)return {state:'uncertain',message:'Vecinii susțin clase apropiate; diferența sub 10 puncte procentuale nu susține o direcție.'};
 if(!r.advantage)return {state:'no-edge',message:'KNN nu depășește frecvențele claselor și reperul de momentum în testul recent. Direcția rămâne exploratorie.'};
 if(!r.walk?.consistent)return {state:'fragile',message:'Avantaj recent; trei ferestre și controlul pe orizonturi separate nu confirmă robustețea.'};
 return {state:'research',message:'Avantaj repetat în trei ferestre, confirmat pe orizonturi separate. Direcție experimentală, fără probabilitate de profit.'};
}
g.HoldingsKNN={VERSION,HORIZON,KS,separated,dataset:N.dataset,neighbors,predict,fitPartitions,evaluate,valid,assess};
})(typeof window!=='undefined'?window:globalThis);
