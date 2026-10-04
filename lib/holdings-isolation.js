(function(g){
'use strict';
const VERSION='holdings-isolation-v1',FEATURES=['Randament 1 sesiune','Randament 5 sesiuni','Distanță EMA21','ATR / preț','Volum relativ','Gap la deschidere'];
const CONFIG=Object.freeze({trees:64,sample:128,quantile:.95,minimumTrain:180,minimumReference:50,minimumTest:50,minimumVariable:3});
const SEEDS=Object.freeze([4102026,4102027,4102028]),finite=v=>typeof v==='number'&&Number.isFinite(v),mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length,clone=x=>JSON.parse(JSON.stringify(x));
const correction=Array.from({length:CONFIG.sample+1},(_,n)=>{if(n<2)return 0;let h=0;for(let i=1;i<n;i++)h+=1/i;return 2*h-2*(n-1)/n;});
function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function dataset(bars,now=Date.now()){
 const source=g.HoldingsNeural.dataset(bars,now);
 return source.observations.map((r,j)=>{const i=j+199,b=bars[i],previous=bars[i-1].c;
  return {t:r.t,x:[(b.c/previous-1)*100,r.x[0],r.x[3],r.x[8],r.x[9],(b.o/previous-1)*100]};
 });
}
function checkRows(rows,minimum=1){if(!Array.isArray(rows)||rows.length<minimum||rows.length>1801||rows.some((r,i)=>!r||!finite(r.t)||r.t<0||i&&r.t<=rows[i-1].t||!Array.isArray(r.x)||r.x.length!==6||!r.x.every(finite)||r.x[3]<=0||r.x[4]<=0))throw Error('Observații Isolation Forest invalide sau insuficiente.');}
function split(rows){
 checkRows(rows,300);const a=Math.floor(rows.length*.6),b=Math.floor(rows.length*.8);
 const p={train:rows.slice(0,a),reference:rows.slice(a,b),test:rows.slice(b)};checkParts(p);return p;
}
function checkParts(p){for(const k of ['train','reference','test'])checkRows(p[k],CONFIG['minimum'+k[0].toUpperCase()+k.slice(1)]);if(p.train.at(-1).t>=p.reference[0].t||p.reference.at(-1).t>=p.test[0].t)throw Error('Intervale temporale suprapuse.');}
function quantile(sorted,q){return sorted[Math.max(0,Math.ceil(q*sorted.length)-1)];}
function profiles(rows){
 return FEATURES.map((name,k)=>{const values=rows.map(r=>r.x[k]).sort((a,b)=>a-b),median=quantile(values,.5),iqr=quantile(values,.75)-quantile(values,.25),m=mean(values),sd=Math.sqrt(mean(values.map(v=>(v-m)**2)));
  return {name,values,median,min:values[0],max:values.at(-1),spread:Math.max(iqr/1.349,sd*.1,1e-6)};
 });
}
function buildTree(xs,random,limit){
 const nodes=[];
 function branch(rows,depth){
  const index=nodes.length,node=[-1,0,-1,-1,rows.length];nodes.push(node);
  if(rows.length<2||depth>=limit)return index;
  const ranges=FEATURES.map((_,k)=>{const values=rows.map(x=>x[k]);return [k,Math.min(...values),Math.max(...values)];}).filter(x=>x[2]>x[1]);
  if(!ranges.length)return index;
  const [feature,low,high]=ranges[Math.floor(random()*ranges.length)];let cut=low+(high-low)*random();
  if(cut<=low||cut>high)cut=high;const left=rows.filter(x=>x[feature]<cut),right=rows.filter(x=>x[feature]>=cut);
  if(!left.length||!right.length)return index;
  node[0]=feature;node[1]=cut;node[2]=branch(left,depth+1);node[3]=branch(right,depth+1);return index;
 }
 branch(xs,0);return nodes;
}
function fitForest(rows,seed,progress){
 const random=rng(seed),sample=Math.min(CONFIG.sample,rows.length),depth=Math.ceil(Math.log2(sample)),trees=[];
 for(let k=0;k<CONFIG.trees;k++){
  const indices=rows.map((_,i)=>i);for(let i=0;i<sample;i++){const j=i+Math.floor(random()*(indices.length-i));[indices[i],indices[j]]=[indices[j],indices[i]];}
  trees.push(buildTree(indices.slice(0,sample).map(i=>rows[i].x),random,depth));
  if((k+1)%16===0)progress?.({epoch:k+1,total:CONFIG.trees});
 }
 return {seed,sample,depth,trees};
}
function path(tree,x){let index=0,depth=0;while(tree[index][0]>=0){const n=tree[index];index=x[n[0]]<n[1]?n[2]:n[3];depth++;}return depth+correction[tree[index][4]];}
function score(forest,x){return Math.pow(2,-mean(forest.trees.map(t=>path(t,x)))/correction[forest.sample]);}
function explain(x,reference){
 return reference.map((p,k)=>{let less=0,equal=0;for(const v of p.values){if(v<x[k])less++;else if(v===x[k])equal++;}
  return {feature:k,value:x[k],median:p.median,position:(less+equal*.5)/p.values.length,deviation:(x[k]-p.median)/p.spread,outside:x[k]<p.min||x[k]>p.max};
 }).sort((a,b)=>Math.abs(b.deviation)-Math.abs(a.deviation)||a.feature-b.feature);
}
function classify(forests,thresholds,threshold,profiles,row){
 const scores=forests.map(f=>score(f,row.x)),s=mean(scores),flag=s>threshold,votes=scores.filter((v,k)=>v>thresholds[k]).length;
 return {t:row.t,score:s,scores,flag,votes,outside:explain(row.x,profiles).filter(x=>x.outside).length};
}
function metrics(xs){
 const flagged=xs.filter(x=>x.flag).length,uncertain=xs.filter(x=>x.votes!==0&&x.votes!==3||x.flag&&x.votes!==3||!x.flag&&x.votes!==0).length;
 return {n:xs.length,flagged,rate:flagged/xs.length,uncertain,meanScore:mean(xs.map(x=>x.score)),outside:xs.filter(x=>x.outside>0).length};
}
const period=xs=>({from:xs[0].t,to:xs.at(-1).t,n:xs.length});
function fitPartitions(parts,options={}){
 checkParts(parts);const referenceProfiles=profiles(parts.train);
 const forests=SEEDS.map((seed,member)=>fitForest(parts.train,seed,p=>options.progress?.({...p,member:member+1,members:3})));
 const calibration=parts.reference.map(r=>forests.map(f=>score(f,r.x))),thresholds=SEEDS.map((_,k)=>quantile(calibration.map(x=>x[k]).sort((a,b)=>a-b),CONFIG.quantile)),averages=calibration.map(mean).sort((a,b)=>a-b),threshold=quantile(averages,CONFIG.quantile);
 const quality={variable:referenceProfiles.filter(x=>x.max-x.min>1e-8).length,referenceSpread:averages.at(-1)-averages[0]};
 quality.informative=quality.variable>=CONFIG.minimumVariable&&quality.referenceSpread>1e-6;
 const classifyRow=r=>classify(forests,thresholds,threshold,referenceProfiles,r),timeline=parts.test.map(classifyRow),reference=parts.reference.map(classifyRow),current=timeline.at(-1);
 return {version:VERSION,config:{...CONFIG},reviewOnly:true,forests,thresholds,threshold,profiles:referenceProfiles,quality,reference:clone(parts.reference),history:clone(parts.test),timeline:timeline.slice(-90),current,explanations:explain(parts.test.at(-1).x,referenceProfiles),report:{periods:Object.fromEntries(Object.entries(parts).map(([k,xs])=>[k,period(xs)])),reference:metrics(reference),test:metrics(timeline)}};
}
function evaluate(rows,options={}){
 const recent=split(rows),result=fitPartitions(recent,{progress:p=>options.progress?.({...p,stage:rows.length>=600?3:1,stages:rows.length>=600?3:1})});
 if(rows.length<600)return result;
 const parts=[.64,.8,1].map(f=>split(rows.slice(0,Math.floor(rows.length*f))));
 for(let i=0;i<2;i++)parts[i].test=parts[i].test.filter(r=>r.t<parts[i+1].test[0].t);
 const folds=parts.map((p,i)=>{const r=i===2?result:fitPartitions(p,{progress:q=>options.progress?.({...q,stage:i+1,stages:3})});return {id:i+1,periods:r.report.periods,threshold:r.threshold,test:r.report.test};});
 result.walk={folds,summary:aggregate(folds)};return result;
}
function aggregate(folds){const n=folds.reduce((s,f)=>s+f.test.n,0),flagged=folds.reduce((s,f)=>s+f.test.flagged,0);return {n,flagged,rate:flagged/n,uncertain:folds.reduce((s,f)=>s+f.test.uncertain,0),outside:folds.reduce((s,f)=>s+f.test.outside,0),meanScore:folds.reduce((s,f)=>s+f.test.meanScore*f.test.n,0)/n};}
function validForest(f){
 if(!SEEDS.includes(f?.seed)||f.sample!==CONFIG.sample||f.depth!==7||!Array.isArray(f.trees)||f.trees.length!==CONFIG.trees)return false;
 for(const tree of f.trees){if(!Array.isArray(tree)||tree.length<1||tree.length>255)return false;const seen=new Set();
  function visit(index,depth){if(!Number.isInteger(index)||index<0||index>=tree.length||seen.has(index)||depth>f.depth)return false;seen.add(index);const n=tree[index];if(!Array.isArray(n)||n.length!==5||!Number.isInteger(n[0])||!finite(n[1])||!Number.isInteger(n[4])||n[4]<1||n[4]>f.sample)return false;if(n[0]===-1)return n[1]===0&&n[2]===-1&&n[3]===-1;if(n[0]<0||n[0]>=6||depth>=f.depth||n[2]<=index||n[3]<=index||!visit(n[2],depth+1)||!visit(n[3],depth+1))return false;return n[4]===tree[n[2]][4]+tree[n[3]][4];}
  if(tree[0]?.[4]!==f.sample||!visit(0,0)||seen.size!==tree.length)return false;
 }return true;
}
function same(a,b){if(typeof a==='number'&&typeof b==='number')return finite(a)&&finite(b)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b));if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return a===b;if(Array.isArray(a)!==Array.isArray(b))return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]));}
function validMetric(m){return m&&Number.isInteger(m.n)&&m.n>=50&&['flagged','uncertain','outside'].every(k=>Number.isInteger(m[k])&&m[k]>=0&&m[k]<=m.n)&&finite(m.meanScore)&&m.meanScore>0&&m.meanScore<=1&&same(m.rate,m.flagged/m.n);}
function validPeriods(p){return p&&['train','reference','test'].every(k=>finite(p[k]?.from)&&finite(p[k]?.to)&&p[k].from<=p[k].to&&Number.isInteger(p[k].n)&&p[k].n>=CONFIG['minimum'+k[0].toUpperCase()+k.slice(1)]&&p[k].n<=1801)&&p.train.to<p.reference.from&&p.reference.to<p.test.from;}
function validPublic(r){
 try{if(r.version!==VERSION||!same(r.config,CONFIG)||r.reviewOnly!==true||!validPeriods(r.report.periods)||!validMetric(r.report.reference)||!validMetric(r.report.test)||r.report.reference.n!==r.report.periods.reference.n||r.report.test.n!==r.report.periods.test.n||!finite(r.threshold)||r.threshold<=0||r.threshold>1||!Number.isInteger(r.quality.variable)||r.quality.variable<0||r.quality.variable>6||!finite(r.quality.referenceSpread)||r.quality.referenceSpread<0||r.quality.informative!==(r.quality.variable>=3&&r.quality.referenceSpread>1e-6))return false;
  if(r.walk){const fs=r.walk.folds;if(!Array.isArray(fs)||fs.length!==3||fs.some((f,i)=>f.id!==i+1||!validPeriods(f.periods)||!validMetric(f.test)||f.test.n!==f.periods.test.n||!finite(f.threshold)||f.threshold<=0||f.threshold>1||i&&fs[i-1].periods.test.to>=f.periods.test.from)||!same(fs[2].periods,r.report.periods)||!same(fs[2].test,r.report.test)||!same(fs[2].threshold,r.threshold)||!same(aggregate(fs),r.walk.summary))return false;}
  return true;
 }catch{return false;}
}
function valid(r){
 try{if(!validPublic(r)||!Array.isArray(r.forests)||r.forests.length!==3||r.forests.some((f,i)=>f.seed!==SEEDS[i]||!validForest(f))||!Array.isArray(r.profiles)||r.profiles.length!==6)return false;
  for(let k=0;k<6;k++){const p=r.profiles[k];if(p.name!==FEATURES[k]||!Array.isArray(p.values)||p.values.length!==r.report.periods.train.n||!p.values.every(finite)||p.values.some((v,i)=>i&&v<p.values[i-1])||k>=3&&k<=4&&p.values[0]<=0)return false;const expected=profiles(p.values.map((v,i)=>({x:FEATURES.map((_,j)=>j===k?v:r.profiles[j].values[i])})))[k];if(!same(p,expected))return false;}
  checkRows(r.reference,50);checkRows(r.history,50);
  if(!same(period(r.reference),r.report.periods.reference)||!same(period(r.history),r.report.periods.test))return false;
  const raw=r.reference.map(row=>r.forests.map(f=>score(f,row.x))),thresholds=SEEDS.map((_,k)=>quantile(raw.map(x=>x[k]).sort((a,b)=>a-b),CONFIG.quantile)),threshold=quantile(raw.map(mean).sort((a,b)=>a-b),CONFIG.quantile);
  const quality={variable:r.profiles.filter(p=>p.max-p.min>1e-8).length,referenceSpread:Math.max(...raw.map(mean))-Math.min(...raw.map(mean))};quality.informative=quality.variable>=3&&quality.referenceSpread>1e-6;
  if(!same(thresholds,r.thresholds)||!same(threshold,r.threshold)||!same(quality,r.quality))return false;
  const rows=r.history.map(row=>classify(r.forests,thresholds,threshold,r.profiles,row)),reference=r.reference.map(row=>classify(r.forests,thresholds,threshold,r.profiles,row));
  return same(rows.slice(-90),r.timeline)&&same(rows.at(-1),r.current)&&same(metrics(rows),r.report.test)&&same(metrics(reference),r.report.reference)&&same(explain(r.history.at(-1).x,r.profiles),r.explanations);
 }catch{return false;}
}
function publicReport(r){if(!valid(r))throw Error('Raport Isolation Forest neverificabil.');return clone({version:r.version,config:r.config,reviewOnly:true,threshold:r.threshold,quality:r.quality,report:r.report,...r.walk?{walk:r.walk}:{}});}
function assess(r){if(!valid(r))return {state:'invalid',message:'Rezultat neverificabil; reanalizează istoricul.'};if(!r.quality.informative)return {state:'uncertain',message:'Istoric prea uniform pentru interpretarea anomaliilor.'};if(r.current.flag&&r.current.votes===3)return {state:'anomaly',message:'Sesiune neobișnuită în toate cele trei păduri. Verifică datele, evenimentele și expunerea.'};if(!r.current.flag&&r.current.votes===0)return {state:'ordinary',message:'Sesiunea nu depășește pragul modelului. Aceasta nu confirmă siguranța deținerii.'};return {state:'uncertain',message:'Rezultat de graniță: pădurile nu confirmă aceeași interpretare.'};}
function demoBars(variant=0,now=Date.now()){const bars=g.HoldingsNeural.demoBars(variant,now).map(b=>({...b})),b=bars.at(-1);b.v*=7;b.h=Math.max(b.h,b.c*1.045);b.l=Math.min(b.l,b.c*.955);return bars;}
g.HoldingsIsolation={VERSION,FEATURES,CONFIG,SEEDS,dataset,split,profiles,buildTree,fitForest,path,score,explain,classify,metrics,fitPartitions,evaluate,validForest,valid,validPublic,publicReport,assess,demoBars,quantile,correction,rng};
})(typeof window!=='undefined'?window:globalThis);
