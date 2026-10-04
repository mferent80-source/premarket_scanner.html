(function(g){
'use strict';
const VERSION='holdings-quantile-v1',HORIZON=5,TAUS=[.1,.5,.9],NOMINAL=.8,L2=.005,EPOCHS=180;
const N=g.HoldingsNeural,finite=Number.isFinite,mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const close=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<=1e-7*Math.max(1,Math.abs(a),Math.abs(b));
function quantile(values,q){const a=values.slice().sort((a,b)=>a-b),i=(a.length-1)*q,j=Math.floor(i);return a[j]+(a[Math.ceil(i)]-a[j])*(i-j);}
function pinball(y,p,q){const d=y-p;return d>=0?q*d:(q-1)*d;}
function dataset(bars,now=Date.now()){
 const data=N.dataset(bars,now),byTime=new Map(bars.map((b,i)=>[b.t,i]));
 const rows=data.rows.map(r=>{const i=byTime.get(r.t);return {...r,y:(bars[i+HORIZON].c/bars[i].c-1)*100/r.x[8]};});
 return {rows,current:{t:bars.at(-1).t,close:bars.at(-1).c,atrPct:data.latest[8],x:data.latest.slice()}};
}
function validRows(rows,min=1){return Array.isArray(rows)&&rows.length>=min&&rows.length<=2000&&rows.every((r,i)=>r&&finite(r.t)&&finite(r.end)&&r.t<r.end&&(!i||r.t>rows[i-1].t&&r.end>rows[i-1].end)&&finite(r.y)&&Array.isArray(r.x)&&r.x.length===10&&r.x.every(finite));}
function blocks(rows){let end=-Infinity;return rows.filter(r=>{if(r.t<=end)return false;end=r.end;return true;});}
function split(rows,size=Math.max(60,Math.min(100,Math.floor(rows.length*.15)))){
 if(!validRows(rows,300))throw Error('Minimum 300 exemple continue, în ordine temporală.');
 const testAt=rows.length-size,a=Math.floor(testAt*.7),b=Math.floor(testAt*.85);
 const starts=[rows[a].t,rows[b].t,rows[testAt].t];
 const parts={train:rows.slice(0,a).filter(r=>r.end<starts[0]),validation:rows.slice(a,b).filter(r=>r.end<starts[1]),reference:rows.slice(b,testAt).filter(r=>r.end<starts[2]),test:rows.slice(testAt)};
 checkParts(parts);return parts;
}
function checkParts(p){
 const keys=['train','validation','reference','test'];
 for(let i=0;i<keys.length;i++){const rows=p[keys[i]];if(!validRows(rows,i===0?150:i===3?60:30))throw Error('Istoric insuficient pentru '+keys[i]+'.');if(i&&p[keys[i-1]].at(-1).end>=rows[0].t)throw Error('Orizonturi suprapuse între seturile temporale.');}
 if(blocks(p.reference).length<6)throw Error('Prea puține orizonturi separate pentru ajustarea intervalului.');
}
const period=rows=>({from:rows[0].t,to:rows.at(-1).t,lastLabel:rows.at(-1).end,n:rows.length});
const linear=(m,x)=>m.b+x.reduce((s,v,i)=>s+v*m.w[i],0);
function rawPredict(model,x){return model.members.map(m=>linear(m,N.normalize(x,model.scale)));}
// Rearrangement is fixed before calibration and testing; it does not select favorable bounds.
function ordered(values){return values.slice().sort((a,b)=>a-b);}
function predict(model,x,delta=0){const a=ordered(rawPredict(model,x));return [a[0]-delta,a[1],a[2]+delta];}
function fitModel(train,validation,progress){
 const scale=N.scaler(train),xs=train.map(r=>({...r,x:N.normalize(r.x,scale)})),vs=validation.map(r=>({...r,x:N.normalize(r.x,scale)}));
 const members=TAUS.map((tau,k)=>{
  const m={tau,b:quantile(train.map(r=>r.y),tau),w:Array(10).fill(0),epoch:0};let best={...m,w:m.w.slice()},loss=mean(vs.map(r=>pinball(r.y,linear(m,r.x),tau)));
  for(let epoch=1;epoch<=EPOCHS;epoch++){
   const dw=Array(10).fill(0);let db=0;
   for(const r of xs){const d=r.y-linear(m,r.x),grad=d>0?tau:d<0?tau-1:0;db+=grad;r.x.forEach((v,i)=>dw[i]+=grad*v);}
   const rate=.04/Math.sqrt(1+epoch/30);m.b+=rate*db/xs.length;m.w=m.w.map((v,i)=>v+rate*(dw[i]/xs.length-L2*v));
   if(epoch%10===0){const current=mean(vs.map(r=>pinball(r.y,linear(m,r.x),tau)));if(current<loss-1e-9){loss=current;best={...m,w:m.w.slice(),epoch};}progress?.({member:k+1,members:3,epoch,total:EPOCHS,loss:current});}
  }
  return best;
 });
 return {scale,members};
}
function expansion(scores){const sorted=scores.slice().sort((a,b)=>a-b),rank=Math.ceil((scores.length+1)*NOMINAL);if(rank>scores.length)throw Error('Referință insuficientă.');return Math.max(0,sorted[rank-1]);}
function calibrate(model,rows){const selected=blocks(rows),scores=selected.map(r=>{const p=predict(model,r.x);return Math.max(p[0]-r.y,r.y-p[2],0);});return {delta:expansion(scores),rows:selected,scores};}
function metrics(rows,output){
 let covered=0,width=0,score=0,loss=0,mae=0,crossings=0;
 for(const r of rows){const {p,raw}=output(r);if(!p.every(finite)||p[0]>p[1]||p[1]>p[2])throw Error('Interval numeric invalid.');covered+=r.y>=p[0]&&r.y<=p[2];width+=p[2]-p[0];score+=p[2]-p[0]+2/(1-NOMINAL)*(Math.max(p[0]-r.y,0)+Math.max(r.y-p[2],0));loss+=mean(TAUS.map((q,i)=>pinball(r.y,p[i],q)));mae+=Math.abs(r.y-p[1]);crossings+=raw[0]>raw[1]||raw[1]>raw[2];}
 return {n:rows.length,covered,coverage:covered/rows.length,width:width/rows.length,score:score/rows.length,pinball:loss/rows.length,mae:mae/rows.length,crossings};
}
function output(model,delta){return r=>({raw:rawPredict(model,r.x),p:predict(model,r.x,delta)});}
function fitPartitions(parts,progress){
 checkParts(parts);const model=fitModel(parts.train,parts.validation,progress),calibration=calibrate(model,parts.reference);
 const baseline={scale:model.scale,members:TAUS.map(tau=>({tau,b:quantile(parts.train.map(r=>r.y),tau),w:Array(10).fill(0),epoch:0}))},baselineCalibration=calibrate(baseline,parts.reference);
 const test=metrics(parts.test,output(model,calibration.delta)),control=metrics(parts.test,output(baseline,baselineCalibration.delta));
 return {model,calibration,baseline,baselineCalibration,report:{periods:Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,period(v)])),test,baseline:control,rawTest:metrics(parts.test,output(model,0)),nonOverlap:metrics(blocks(parts.test),output(model,calibration.delta)),testRows:parts.test}};
}
function currentEstimate(model,delta,c){
 const raw=rawPredict(model,c.x),p=predict(model,c.x,delta),prices=p.map(v=>c.close*(1+v*c.atrPct/100)),maxZ=Math.max(...N.normalize(c.x,model.scale).map(Math.abs));
 return {...c,raw,atrQuantiles:p,prices,widthPct:(prices[2]-prices[0])/c.close*100,crossed:raw[0]>raw[1]||raw[1]>raw[2],maxZ};
}
function evaluate(data,{progress}={}){
 const {rows,current}=data,size=Math.max(60,Math.min(100,Math.floor(rows.length*.15)));
 const folds=[];let reason=null;
 for(let i=0;i<2;i++){const prefix=rows.slice(0,rows.length-(2-i)*(size+HORIZON));try{folds.push(fitPartitions(split(prefix,size),p=>progress?.({...p,stage:i+1,stages:3})));}catch(e){reason=e.message;break;}}
 const fit=fitPartitions(split(rows,size),p=>progress?.({...p,stage:reason?1:3,stages:reason?1:3}));
 if(reason)return {version:VERSION,horizon:HORIZON,nominal:NOMINAL,taus:TAUS.slice(),regularization:L2,reviewOnly:true,...fit,current:currentEstimate(fit.model,fit.calibration.delta,current),walk:{status:'insufficient',reason,folds:[]}};
 // Last-label gaps also separate the three test windows, not only train/validation/reference.
 folds.push(fit);
 return {version:VERSION,horizon:HORIZON,nominal:NOMINAL,taus:TAUS.slice(),regularization:L2,reviewOnly:true,...fit,current:currentEstimate(fit.model,fit.calibration.delta,current),walk:{status:'evaluated',folds,wins:folds.filter(f=>f.report.test.score<f.report.baseline.score).length}};
}
function validModel(m){return m&&m.scale?.means?.length===10&&m.scale.scales?.length===10&&m.scale.means.every(finite)&&m.scale.scales.every(v=>finite(v)&&v>0)&&m.members?.length===3&&m.members.every((v,i)=>v.tau===TAUS[i]&&finite(v.b)&&v.w?.length===10&&v.w.every(finite)&&Number.isInteger(v.epoch)&&v.epoch>=0&&v.epoch<=EPOCHS&&v.epoch%10===0);}
function equalMetrics(a,b){return a&&Object.keys(b).every(k=>close(a[k],b[k]));}
function validFit(f){
 if(!validModel(f.model)||!validModel(f.baseline))return false;
 const periods=f.report?.periods,keys=['train','validation','reference','test'];
 if(!periods||keys.some((k,i)=>{const p=periods[k];return !p||![p.from,p.to,p.lastLabel].every(finite)||p.from>p.to||p.to>=p.lastLabel||!Number.isInteger(p.n)||p.n<(i===0?150:i===3?60:30)||i&&periods[keys[i-1]].lastLabel>=p.from;}))return false;
 const rows=f.report.testRows;if(!validRows(rows,60)||JSON.stringify(period(rows))!==JSON.stringify(periods.test))return false;
 for(const [cal,model] of [[f.calibration,f.model],[f.baselineCalibration,f.baseline]]){
  if(!cal||!validRows(cal.rows,6)||cal.rows.length>periods.reference.n||cal.rows.some((r,i)=>r.t<periods.reference.from||r.t>periods.reference.to||r.end>periods.reference.lastLabel||i&&r.t<=cal.rows[i-1].end)||cal.rows[0].t!==periods.reference.from)return false;
  const scores=cal.rows.map(r=>{const p=predict(model,r.x);return Math.max(p[0]-r.y,r.y-p[2],0);});
  if(!Array.isArray(cal.scores)||cal.scores.length!==scores.length||scores.some((s,i)=>!close(s,cal.scores[i]))||!close(cal.delta,expansion(scores)))return false;
 }
 if(f.baseline.members.some(v=>v.w.some(w=>w!==0)))return false;
 return equalMetrics(f.report.test,metrics(rows,output(f.model,f.calibration.delta)))&&equalMetrics(f.report.baseline,metrics(rows,output(f.baseline,f.baselineCalibration.delta)))&&equalMetrics(f.report.rawTest,metrics(rows,output(f.model,0)))&&equalMetrics(f.report.nonOverlap,metrics(blocks(rows),output(f.model,f.calibration.delta)));
}
function valid(r){try{
 if(r?.version!==VERSION||r.reviewOnly!==true||r.horizon!==HORIZON||r.nominal!==NOMINAL||r.regularization!==L2||JSON.stringify(r.taus)!==JSON.stringify(TAUS)||!validFit(r))return false;
 const c=r.current;if(!c||![c.t,c.close,c.atrPct].every(finite)||c.close<=0||c.atrPct<=0||!Array.isArray(c.x)||c.x.length!==10||!c.x.every(finite)||!close(c.atrPct,c.x[8])||r.report.periods.test.lastLabel!==c.t)return false;
 const recomputed=currentEstimate(r.model,r.calibration.delta,c);
 for(const k of ['raw','atrQuantiles','prices'])if(!Array.isArray(c[k])||c[k].length!==3||c[k].some((v,i)=>!close(v,recomputed[k][i])))return false;
 if(!close(c.widthPct,recomputed.widthPct)||!close(c.maxZ,recomputed.maxZ)||c.crossed!==recomputed.crossed||!r.walk)return false;
 if(r.walk.status==='insufficient')return typeof r.walk.reason==='string'&&r.walk.reason.length>0&&Array.isArray(r.walk.folds)&&r.walk.folds.length===0;
 if(r.walk.status!=='evaluated'||r.walk.folds?.length!==3||!r.walk.folds.every(validFit)||r.walk.wins!==r.walk.folds.filter(f=>f.report.test.score<f.report.baseline.score).length)return false;
 return r.walk.folds.every((f,i)=>!i||r.walk.folds[i-1].report.periods.test.lastLabel<f.report.periods.test.from)&&JSON.stringify(r.walk.folds[2])===JSON.stringify({model:r.model,calibration:r.calibration,baseline:r.baseline,baselineCalibration:r.baselineCalibration,report:r.report});
}catch{return false;}}
function assess(r){
 if(r.current.maxZ>6||r.current.prices.some(p=>p<=0))return {state:'drift',message:'Indicatorii ies din domeniul învățat sau intervalul de preț este invalid. Estimarea curentă este ascunsă.'};
 if(r.walk.status!=='evaluated'||r.calibration.rows.length<20||r.report.nonOverlap.n<15||r.report.test.coverage<NOMINAL-.1)return {state:'limited',message:'Acoperire sau istoric insuficient pentru o interpretare robustă. Intervalul rămâne exploratoriu.'};
 if(r.report.test.score>=r.report.baseline.score||r.walk.wins<2)return {state:'no-edge',message:'Intervalul nu arată un avantaj repetat față de cuantilele istorice simple. Rămâne exploratoriu.'};
 return {state:'descriptive',message:'Interval experimental verificat cronologic. Acoperirea observată nu garantează acoperirea viitoare.'};
}
g.HoldingsQuantile={VERSION,HORIZON,TAUS,NOMINAL,dataset,split,checkParts,blocks,pinball,quantile,predict,rawPredict,calibrate,expansion,metrics,fitPartitions,currentEstimate,evaluate,valid,assess};
})(typeof window!=='undefined'?window:globalThis);
