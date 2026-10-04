(function(g){
'use strict';
const N=g.HoldingsNeural,VERSION='holdings-gbt-v1',CONFIG={depth:2,minLeaf:20,rate:.08,maxRounds:80},finite=Number.isFinite;
const softmax=xs=>{const m=Math.max(...xs),a=xs.map(x=>Math.exp(x-m)),sum=a.reduce((x,y)=>x+y,0);return a.map(x=>x/sum);};
function tree(rows,targets,ids=rows.map((_,i)=>i),depth=0){
 const total=ids.reduce((s,i)=>s+targets[i],0),squares=ids.reduce((s,i)=>s+targets[i]**2,0),value=total/ids.length,leaf={value};if(depth===CONFIG.depth||ids.length<2*CONFIG.minLeaf)return leaf;
 let best=null;const parent=squares-total*total/ids.length;
 for(let feature=0;feature<10;feature++){
  const sorted=ids.slice().sort((a,b)=>rows[a].x[feature]-rows[b].x[feature]||a-b);let left=0,leftSquares=0;
  for(let j=0;j<sorted.length-1;j++){const v=targets[sorted[j]];left+=v;leftSquares+=v*v;const n=j+1,rightN=ids.length-n,a=rows[sorted[j]].x[feature],b=rows[sorted[j+1]].x[feature];if(n<CONFIG.minLeaf||rightN<CONFIG.minLeaf||a===b)continue;const right=total-left,gain=parent-(leftSquares-left*left/n+squares-leftSquares-right*right/rightN);if(gain>1e-10&&(!best||gain>best.gain+1e-12))best={feature,threshold:a+(b-a)/2,gain,sorted,n};}
 }
 if(!best)return leaf;return {feature:best.feature,threshold:best.threshold,gain:best.gain,left:tree(rows,targets,best.sorted.slice(0,best.n),depth+1),right:tree(rows,targets,best.sorted.slice(best.n),depth+1)};
}
function treeValue(t,x){return Object.hasOwn(t,'value')?t.value:treeValue(x[t.feature]<=t.threshold?t.left:t.right,x);}
function predict(model,x){const z=model.initial.slice();for(const round of model.trees)for(let k=0;k<3;k++)z[k]+=CONFIG.rate*treeValue(round[k],x);return softmax(z);}
function importance(trees){const gains=Array(10).fill(0),visit=t=>{if(Object.hasOwn(t,'value'))return;gains[t.feature]+=t.gain;visit(t.left);visit(t.right);};trees.forEach(round=>round.forEach(visit));const sum=gains.reduce((a,b)=>a+b,0);return gains.map(x=>sum?x/sum:0);}
function period(xs){return {from:xs[0].t,to:xs.at(-1).t,lastLabel:xs.at(-1).end,n:xs.length};}
function fitPartitions(parts,latest,reference,options={}){
 N.checkParts(parts);if(!Array.isArray(latest)||latest.length!==10||!latest.every(finite))throw Error('Indicatori Gradient Boosting invalizi.');if(!reference||!N.validMetric(reference.linear)||!N.validMetric(reference.constant)||reference.linear.n!==parts.test.length||reference.constant.n!==parts.test.length)throw Error('Reperele aceleiași ferestre nu sunt disponibile.');
 const vp=N.validationParts(parts.validation),counts=[1,1,1];parts.train.forEach(r=>counts[r.y]++);const model={initial:counts.map(n=>Math.log(n/(parts.train.length+3))),trees:[]},logits=parts.train.map(()=>model.initial.slice());let bestLength=5,bestLoss=Infinity,stale=0;
 for(let round=1;round<=CONFIG.maxRounds;round++){
  const probs=logits.map(softmax),trees=[0,1,2].map(k=>tree(parts.train,parts.train.map((r,i)=>(r.y===k?1:0)-probs[i][k])));model.trees.push(trees);parts.train.forEach((r,i)=>trees.forEach((t,k)=>logits[i][k]+=CONFIG.rate*treeValue(t,r.x)));
  if(round%5===0){const m=N.metrics(vp.earlyStopping,x=>predict(model,x));if(m.loss<bestLoss-1e-5){bestLoss=m.loss;bestLength=round;stale=0;}else stale+=5;options.progress?.({algorithm:'boost',epoch:round,total:CONFIG.maxRounds,loss:m.loss});if(stale>=20&&round>=30)break;}
 }
 model.trees=model.trees.slice(0,bestLength);const output=x=>predict(model,x),test=N.metrics(parts.test,output),blocks=N.nonOverlap(parts.test),report={train:N.metrics(parts.train,output),validation:N.metrics(parts.validation,output),test,linear:reference.linear,constant:reference.constant,nonOverlap:{test:N.metrics(blocks,output),linear:reference.nonOverlap.linear,constant:reference.nonOverlap.constant,period:period(blocks)},periods:Object.fromEntries(Object.entries(parts).map(([k,xs])=>[k,period(xs)]))},support=output(latest);
 return {version:VERSION,horizon:N.HORIZON,reviewOnly:true,config:{...CONFIG},model,rounds:bestLength,epochs:bestLength,selection:period(vp.earlyStopping),latest:latest.slice(),support,classIndex:support.indexOf(Math.max(...support)),importance:importance(model.trees),advantage:N.edge(test,reference.linear,reference.constant),report};
}
function validTree(t,depth=0){if(!t||depth>CONFIG.depth)return false;if(Object.hasOwn(t,'value'))return Object.keys(t).length===1&&finite(t.value)&&Math.abs(t.value)<=1+1e-8;return depth<CONFIG.depth&&Number.isInteger(t.feature)&&t.feature>=0&&t.feature<10&&finite(t.threshold)&&finite(t.gain)&&t.gain>0&&validTree(t.left,depth+1)&&validTree(t.right,depth+1);}
function valid(r){try{
 if(r.version!==VERSION||r.horizon!==N.HORIZON||r.reviewOnly!==true||JSON.stringify(r.config)!==JSON.stringify(CONFIG)||!Number.isInteger(r.rounds)||r.rounds<5||r.rounds>CONFIG.maxRounds||r.rounds%5||r.epochs!==r.rounds||r.model.initial.length!==3||!r.model.initial.every(finite)||r.model.trees.length!==r.rounds||r.model.trees.some(round=>round.length!==3||!round.every(t=>validTree(t)))||r.latest.length!==10||!r.latest.every(finite)||r.support.length!==3||r.importance.length!==10||!r.importance.every(finite))return false;
 const p=predict(r.model,r.latest),imp=importance(r.model.trees);if(p.some((x,i)=>Math.abs(x-r.support[i])>1e-7)||r.classIndex!==p.indexOf(Math.max(...p))||imp.some((x,i)=>Math.abs(x-r.importance[i])>1e-7))return false;
 for(const k of ['train','validation','test','linear','constant'])if(!N.validMetric(r.report[k],k==='train'?150:50,k==='train'?10:5))return false;
 for(const k of ['train','validation','test']){const q=r.report.periods[k];if(![q.from,q.to,q.lastLabel].every(finite)||q.from>q.to||q.to>=q.lastLabel||q.n!==r.report[k].n)return false;}
 const q=r.report.periods,s=r.selection,b=r.report.nonOverlap;if(q.train.lastLabel>=q.validation.from||q.validation.lastLabel>=q.test.from||s.from!==q.validation.from||![s.from,s.to,s.lastLabel].every(finite)||s.from>s.to||s.to>=s.lastLabel||s.lastLabel>q.validation.lastLabel||!Number.isInteger(s.n)||s.n<20||s.n>=q.validation.n||r.report.linear.n!==r.report.test.n||r.report.constant.n!==r.report.test.n)return false;
 if(!b||['test','linear','constant'].some(k=>!N.validMetric(b[k],1,0)||b[k].n!==b.period.n)||![b.period.from,b.period.to,b.period.lastLabel].every(finite)||b.period.n>q.test.n||b.period.from!==q.test.from||b.period.to<b.period.from||b.period.to>q.test.to||b.period.lastLabel>q.test.lastLabel||b.period.to>=b.period.lastLabel)return false;
 return r.advantage===N.edge(r.report.test,r.report.linear,r.report.constant)&&(r.walk===undefined||g.HoldingsNeuralEvaluation.valid(r.walk,r.report));
 }catch{return false;}}
g.HoldingsBoosting={VERSION,CONFIG,tree,treeValue,predict,importance,fitPartitions,valid};
})(typeof window!=='undefined'?window:globalThis);
