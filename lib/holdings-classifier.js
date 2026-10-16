/* Clasificator Long / Hold / Short: Gradient Boosting (stil XGBoost/LightGBM), Random Forest, SVM RBF și votul lor.
   Aceleași etichete ca modelele existente (±1 ATR la +5 sesiuni); rapoartele păstrează doar rezultatele, nu arborii. */
(function(g){
'use strict';
const N=g.HoldingsNeural,E=g.HoldingsNeuralEvaluation,VERSION='holdings-clf-v3',HORIZON=5;
const EXTRA=['MACD / preț','MACD − semnal / preț','Distanță SMA20','Distanță SMA50','Față de maximul 20 zile','Față de minimul 20 zile','Față de maximul 60 zile','Față de minimul 60 zile'];
const FEATURES=N.FEATURES.concat(EXTRA),F=FEATURES.length,CLASSES=['Short','Hold','Long'];
const ALGOS=[{id:'boost',name:'Gradient Boosting',detail:'stil XGBoost / LightGBM'},{id:'forest',name:'Random Forest',detail:'120 de arbori'},{id:'svm',name:'SVM',detail:'nucleu RBF'},{id:'vote',name:'Votul celor trei',detail:'media probabilităților'}];
const IDS=ALGOS.map(a=>a.id);
const CONFIG={bins:32,boost:{depth:3,minLeaf:20,rate:.08,lambda:1,maxRounds:150},forest:{trees:120,depths:[4,6,8],minLeaf:10,mtry:4,seed:16102026},svm:{features:200,lambdas:[.001,.01,.1],temperatures:[.25,.5,1,2,4],epochs:30,seed:16102027},holm:.05,minBlocks:30,cost:.4,margin:.1};
const finite=Number.isFinite,copy=x=>JSON.parse(JSON.stringify(x)),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const softmax=z=>{const m=Math.max(...z),e=z.map(v=>Math.exp(v-m)),s=e.reduce((a,b)=>a+b,0);return e.map(v=>v/s);};
function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function ema(values,n,start=0){const out=Array(values.length).fill(null);if(values.length<start+n)return out;let s=0;for(let i=start;i<start+n;i++)s+=values[i];out[start+n-1]=s/n;for(let i=start+n;i<values.length;i++)out[i]=values[i]*2/(n+1)+out[i-1]*(1-2/(n+1));return out;}

/* Indicatorii zilei i folosesc doar barele 0..i; suportul și rezistența, doar cele 20 / 60 de dinaintea zilei. */
function dataset(bars,now=Date.now()){
 const base=N.dataset(bars,now),c=bars.map(b=>b.c),e12=ema(c,12),e26=ema(c,26),macd=c.map((_,i)=>e26[i]===null?null:e12[i]-e26[i]),signal=ema(macd,9,25);
 const avg=(i,n)=>{let s=0;for(let k=i-n+1;k<=i;k++)s+=c[k];return s/n;},hi=(i,n)=>{let m=-Infinity;for(let k=i-n;k<i;k++)m=Math.max(m,bars[k].h);return m;},lo=(i,n)=>{let m=Infinity;for(let k=i-n;k<i;k++)m=Math.min(m,bars[k].l);return m;};
 const extra=i=>{const p=c[i],x=[macd[i]/p*100,(macd[i]-signal[i])/p*100,(p/avg(i,20)-1)*100,(p/avg(i,50)-1)*100,(p/hi(i,20)-1)*100,(p/lo(i,20)-1)*100,(p/hi(i,60)-1)*100,(p/lo(i,60)-1)*100];if(!x.every(finite))throw Error('Indicatorii clasificatorului nu pot fi verificați.');return x;};
 /* I-642: ce ar fi adus o cumpărare — intrare la deschiderea zilei următoare, ieșire la închiderea a 5-a, stop la 1 ATR (golul sub stop iese la deschidere), minus costul dus-întors. Doar pentru evaluare, nu e indicator. */
 const buy=i=>{const entry=bars[i+1].o,stop=entry-base.observations[i-199].x[8]/100*c[i];let out=null;for(let k=i+1;k<=i+HORIZON&&out===null;k++){const b=bars[k];if(k>i+1&&b.o<=stop)out=b.o;else if(b.l<=stop)out=stop;}return ((out??c[i+HORIZON])/entry-1)*100-CONFIG.cost;};
 const observations=base.observations.map((o,j)=>({t:o.t,x:o.x.concat(extra(199+j))})),rows=base.rows.map((r,j)=>({...r,x:observations[j].x,pnl:buy(199+j)}));
 return {rows,latest:observations.at(-1).x,observations};
}
function checkParts(parts){
 for(const key of ['train','validation','test']){const xs=parts[key],counts=[0,0,0];if(!Array.isArray(xs))throw Error('Set temporal lipsă.');xs.forEach((r,i)=>{if(!r||!finite(r.t)||!finite(r.end)||r.end<=r.t||i&&(r.t<=xs[i-1].t||r.end<=xs[i-1].end)||!Array.isArray(r.x)||r.x.length!==F||!r.x.every(finite)||![0,1,2].includes(r.y))throw Error('Exemple de antrenare invalide.');counts[r.y]++;});if(xs.length<(key==='train'?150:50)||counts.some(n=>n<(key==='train'?10:5)))throw Error('Istoric insuficient sau clase dezechilibrate în '+key+'. Clasificatorul nu este antrenat.');}
 if(parts.train.some(r=>r.end>=parts.validation[0].t)||parts.validation.some(r=>r.end>=parts.test[0].t))throw Error('Orizonturile se suprapun între seturi.');
}
function split(rows){
 if(!Array.isArray(rows)||rows.length<300)throw Error('Minimum 300 exemple etichetate pentru separarea temporală.');
 const a=Math.floor(rows.length*.6),b=Math.floor(rows.length*.8),parts={train:rows.slice(0,a).filter(r=>r.end<rows[a].t),validation:rows.slice(a,b).filter(r=>r.end<rows[b].t),test:rows.slice(b)};
 checkParts(parts);return parts;
}
function separated(rows){let end=-Infinity;return rows.filter(r=>{if(r.t<=end)return false;end=r.end;return true;});}
function period(xs){return {from:xs[0].t,to:xs.at(-1).t,lastLabel:xs.at(-1).end,n:xs.length};}
function prior(rows){const counts=[1,1,1];rows.forEach(r=>counts[r.y]++);return counts.map(n=>n/(rows.length+3));}
function momentum(x){const d=x[0]/x[8],label=d<=-1?0:d>=1?2:1;return [0,1,2].map(k=>k===label?.8:.1);}
function scaler(rows){const means=Array.from({length:F},(_,j)=>rows.reduce((s,r)=>s+r.x[j],0)/rows.length),scales=means.map((m,j)=>Math.max(1e-6,Math.sqrt(rows.reduce((s,r)=>s+(r.x[j]-m)**2,0)/rows.length)));return {means,scales};}
const standard=(x,s)=>x.map((v,j)=>(v-s.means[j])/s.scales[j]);

/* Praguri pe cuantile din antrenare (histograme, ca LightGBM); arborii păstrează pragul real, nu indicele. */
function cutpoints(rows){return Array.from({length:F},(_,j)=>{const xs=rows.map(r=>r.x[j]).sort((a,b)=>a-b),out=[];for(let k=1;k<CONFIG.bins;k++){const v=xs[Math.min(xs.length-1,Math.floor(k*xs.length/CONFIG.bins))];if(v<xs.at(-1)&&(!out.length||v>out.at(-1)))out.push(v);}return out;});}
function binOf(cuts,v){let lo=0,hi=cuts.length;while(lo<hi){const m=lo+hi>>1;if(v<=cuts[m])hi=m;else lo=m+1;}return lo;}
const binned=(rows,cuts)=>rows.map(r=>r.x.map((v,j)=>binOf(cuts[j],v)));
function walk(t,x,depth=Infinity){let d=0;while(t.left&&d<depth){t=x[t.feature]<=t.threshold?t.left:t.right;d++;}return t;}

/* Gradient Boosting multiclasă cu pas Newton (gradient + hessian) și regularizare L2 pe frunze, ca XGBoost. */
function boostTree(B,cuts,ids,gr,he,importance,depth=0){
 const C=CONFIG.boost;let G=0,H=0;for(const i of ids){G+=gr[i];H+=he[i];}const leaf={value:Math.max(-4,Math.min(4,G/(H+C.lambda)))};if(depth===C.depth||ids.length<2*C.minLeaf)return leaf;
 let best=null;const parent=G*G/(H+C.lambda);
 for(let f=0;f<F;f++){const nb=cuts[f].length+1;if(nb<2)continue;const hg=new Float64Array(nb),hh=new Float64Array(nb),hn=new Int32Array(nb);for(const i of ids){const b=B[i][f];hg[b]+=gr[i];hh[b]+=he[i];hn[b]++;}
  let gl=0,hl=0,nl=0;for(let b=0;b<nb-1;b++){gl+=hg[b];hl+=hh[b];nl+=hn[b];const nr=ids.length-nl;if(nl<C.minLeaf||nr<C.minLeaf||!hn[b])continue;const gain=gl*gl/(hl+C.lambda)+(G-gl)**2/(H-hl+C.lambda)-parent;if(gain>1e-10&&(!best||gain>best.gain+1e-12))best={f,b,gain};}}
 if(!best)return leaf;importance[best.f]+=best.gain;const left=ids.filter(i=>B[i][best.f]<=best.b),right=ids.filter(i=>B[i][best.f]>best.b);
 return {feature:best.f,threshold:cuts[best.f][best.b],left:boostTree(B,cuts,left,gr,he,importance,depth+1),right:boostTree(B,cuts,right,gr,he,importance,depth+1)};
}
function fitBoost(parts,cuts,B,progress){
 const C=CONFIG.boost,train=parts.train,n=train.length,initial=prior(train).map(Math.log),logits=train.map(()=>initial.slice()),rounds=[],importance=Array(F).fill(0),ids=train.map((_,i)=>i);
 const predict=(x,limit=rounds.length)=>{const z=initial.slice();for(let r=0;r<limit;r++)for(let k=0;k<3;k++)z[k]+=C.rate*walk(rounds[r][k],x).value;return softmax(z);};
 let best=5,bestLoss=Infinity,stale=0;const gains=[];
 for(let round=1;round<=C.maxRounds;round++){
  const probs=logits.map(softmax),before=importance.slice(),trees=[0,1,2].map(k=>boostTree(B,cuts,ids,train.map((r,i)=>(r.y===k?1:0)-probs[i][k]),probs.map(p=>Math.max(1e-6,p[k]*(1-p[k]))),importance));
  rounds.push(trees);gains.push(importance.map((v,j)=>v-before[j]));train.forEach((r,i)=>{for(let k=0;k<3;k++)logits[i][k]+=C.rate*walk(trees[k],r.x).value;});
  if(round%5===0){const loss=N.metrics(parts.validation,x=>predict(x,round)).loss;if(loss<bestLoss-1e-5){bestLoss=loss;best=round;stale=0;}else stale+=5;progress?.(round/C.maxRounds);if(stale>=25&&round>=30)break;}
 }
 const used=Array(F).fill(0);gains.slice(0,best).forEach(gs=>gs.forEach((v,j)=>used[j]+=v));
 return {predict:x=>predict(x,best),params:{rounds:best},importance:used};
}
/* Random Forest: bootstrap, 4 indicatori aleși la fiecare nod, Gini; adâncimea aleasă doar pe validare. */
function forestTree(B,cuts,rows,ids,random,importance,depth=0){/* importance[d][f]: câștigul despărțirilor de la adâncimea d */
 const C=CONFIG.forest,counts=[0,0,0];for(const i of ids)counts[rows[i].y]++;const node={counts};const n=ids.length;if(depth===Math.max(...C.depths)||n<2*C.minLeaf||counts.filter(Boolean).length<2)return node;
 const gini=(c,m)=>m?m-(c[0]*c[0]+c[1]*c[1]+c[2]*c[2])/m:0,parent=gini(counts,n),features=[];while(features.length<C.mtry){const f=Math.floor(random()*F);if(!features.includes(f))features.push(f);}
 let best=null;for(const f of features){const nb=cuts[f].length+1;if(nb<2)continue;const h=Array.from({length:nb},()=>[0,0,0]);for(const i of ids)h[B[i][f]][rows[i].y]++;const l=[0,0,0];let nl=0;
  for(let b=0;b<nb-1;b++){const s=h[b][0]+h[b][1]+h[b][2];if(!s)continue;for(let k=0;k<3;k++)l[k]+=h[b][k];nl+=s;const nr=n-nl;if(nl<C.minLeaf||nr<C.minLeaf)continue;const gain=parent-gini(l,nl)-gini([counts[0]-l[0],counts[1]-l[1],counts[2]-l[2]],nr);if(gain>1e-10&&(!best||gain>best.gain+1e-12))best={f,b,gain};}}
 if(!best)return node;importance[depth][best.f]+=best.gain;node.feature=best.f;node.threshold=cuts[best.f][best.b];node.left=forestTree(B,cuts,rows,ids.filter(i=>B[i][best.f]<=best.b),random,importance,depth+1);node.right=forestTree(B,cuts,rows,ids.filter(i=>B[i][best.f]>best.b),random,importance,depth+1);return node;
}
function fitForest(parts,cuts,B,progress){
 const C=CONFIG.forest,train=parts.train,random=rng(C.seed),trees=[],byDepth=Array.from({length:Math.max(...C.depths)},()=>Array(F).fill(0));
 for(let t=0;t<C.trees;t++){const ids=Array.from({length:train.length},()=>Math.floor(random()*train.length)).sort((a,b)=>a-b);trees.push(forestTree(B,cuts,train,ids,random,byDepth));if(t%20===19)progress?.((t+1)/C.trees);}
 const predict=(x,depth)=>{const p=[0,0,0];for(const tree of trees){const c=walk(tree,x,depth).counts,s=c[0]+c[1]+c[2]+3;for(let k=0;k<3;k++)p[k]+=(c[k]+1)/s;}return p.map(v=>v/trees.length);};
 let depth=C.depths[0],bestLoss=Infinity;for(const d of C.depths){const loss=N.metrics(parts.validation,x=>predict(x,d)).loss;if(loss<bestLoss-1e-8){bestLoss=loss;depth=d;}}
 const importance=Array(F).fill(0);byDepth.slice(0,depth).forEach(row=>row.forEach((v,j)=>importance[j]+=v));return {predict:x=>predict(x,depth),params:{depth},importance};
}
/* SVM cu nucleu RBF aproximat (Random Fourier Features), Pegasos unul-contra-restului; probabilități prin softmax cu temperatura aleasă pe validare. */
function fitSvm(parts,progress,epochs=CONFIG.svm.epochs){
 const C=CONFIG.svm,s=scaler(parts.train),random=rng(C.seed),gauss=()=>{const u=Math.max(1e-12,random()),v=random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);},gamma=1/F;
 const W=Array.from({length:C.features},()=>Array.from({length:F},()=>gauss()*Math.sqrt(2*gamma))),bias=Array.from({length:C.features},()=>random()*2*Math.PI),scale=Math.sqrt(2/C.features);
 const map=x=>{const z=standard(x,s).map(v=>Math.max(-6,Math.min(6,v)));return W.map((w,d)=>{let a=bias[d];for(let j=0;j<F;j++)a+=w[j]*z[j];return scale*Math.cos(a);});};
 const Z=parts.train.map(r=>map(r.x)),V=parts.validation.map(r=>map(r.x)),order=Z.map((_,i)=>i);
 const train=lambda=>{const shuffle=rng(C.seed+1),models=[0,1,2].map(()=>({w:new Float64Array(C.features),b:0,avg:new Float64Array(C.features),avgB:0,count:0}));let t=0;
  for(let e=0;e<epochs;e++){for(let i=order.length-1;i>0;i--){const j=Math.floor(shuffle()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
   for(const i of order){t++;const eta=1/(lambda*(t+1000)),z=Z[i];for(let k=0;k<3;k++){const m=models[k],y=parts.train[i].y===k?1:-1;let a=m.b;for(let d=0;d<C.features;d++)a+=m.w[d]*z[d];for(let d=0;d<C.features;d++)m.w[d]*=1-eta*lambda;if(y*a<1){for(let d=0;d<C.features;d++)m.w[d]+=eta*y*z[d];m.b+=eta*y*.1;}
     if(e>=epochs/2){for(let d=0;d<C.features;d++)m.avg[d]+=m.w[d];m.avgB+=m.b;m.count++;}}}}
  return models.map(m=>({w:Array.from(m.avg,v=>v/m.count),b:m.avgB/m.count}));};
 const margins=(models,z)=>models.map(m=>{let a=m.b;for(let d=0;d<C.features;d++)a+=m.w[d]*z[d];return a;});
 let best=null;C.lambdas.forEach((lambda,li)=>{const models=train(lambda),mv=V.map(z=>margins(models,z));progress?.((li+1)/C.lambdas.length);
  for(const temperature of C.temperatures){let loss=0;parts.validation.forEach((r,i)=>{loss-=Math.log(Math.max(1e-12,softmax(mv[i].map(v=>v/temperature))[r.y]));});loss/=parts.validation.length;if(!best||loss<best.loss-1e-8)best={loss,lambda,temperature,models};}});
 return {predict:x=>softmax(margins(best.models,map(x)).map(v=>v/best.temperature)),params:{lambda:best.lambda,temperature:best.temperature},importance:null};
}

/* Test unilateral pe diferențele de log loss față de reperul mai bun, doar pe orizonturi separate. */
function normalCdf(z){const x=Math.abs(z)/Math.SQRT2,t=1/(1+.3275911*x),y=1-((((1.061405429*t-1.453152027)*t+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x);return z>=0?.5*(1+y):.5*(1-y);}
function pValue(stat){if(!stat||stat.n<CONFIG.minBlocks)return 1;const m=stat.sum/stat.n,v=Math.max(0,(stat.sumSq-stat.n*m*m)/(stat.n-1));if(v<=1e-18)return m>0?0:1;return 1-normalCdf(m/Math.sqrt(v/stat.n));}
function holm(ps){const order=ps.map((p,i)=>({p,i})).sort((a,b)=>a.p-b.p||a.i-b.i),out=ps.map(()=>false);for(let r=0;r<order.length;r++){if(order[r].p<=CONFIG.holm/(order.length-r))out[order[r].i]=true;else break;}return out;}
function diffStat(rows,predict){
 const ll=(p,y)=>-Math.log(Math.max(1e-12,p[y])),c=rows.map(r=>ll(r.constantP,r.y)),m=rows.map(r=>ll(momentum(r.x),r.y)),useMomentum=m.reduce((a,b)=>a+b,0)<c.reduce((a,b)=>a+b,0);
 let sum=0,sumSq=0;rows.forEach((r,i)=>{const d=(useMomentum?m[i]:c[i])-ll(predict(r.x),r.y);sum+=d;sumSq+=d*d;});return {n:rows.length,sum,sumSq};
}
function trades(rows,predict,k){return rows.filter(r=>finite(r.pnl)).filter(r=>{const p=predict(r.x),s=p.slice().sort((a,b)=>b-a);return p.indexOf(s[0])===k&&s[0]-s[1]>=CONFIG.margin;}).map(r=>r.pnl);}
function money(xs){if(!xs.length)return {n:0,mean:null,median:null,win:null};const s=xs.slice().sort((a,b)=>a-b),m=s.length>>1;return {n:xs.length,mean:xs.reduce((a,b)=>a+b,0)/xs.length,median:s.length%2?s[m]:(s[m-1]+s[m])/2,win:xs.filter(v=>v>0).length/xs.length};}
const share=xs=>{if(!xs)return null;const s=xs.reduce((a,b)=>a+b,0);return xs.map(v=>s>0?v/s:0);};

/* Cei trei algoritmi + votul, antrenați pe train și aleși pe validare. Exportat pentru modelul pe tot universul (I-641), care are mai multe simboluri în aceeași zi. */
function fitModels(parts,options={}){
 const step=(name,i)=>v=>options.progress?.({algorithm:name,epoch:i+Math.min(1,v),total:3}),cuts=cutpoints(parts.train),B=binned(parts.train,cuts);
 const fitted={boost:fitBoost(parts,cuts,B,step('boost',0)),forest:fitForest(parts,cuts,B,step('forest',1)),svm:fitSvm(parts,step('svm',2),options.svmEpochs)};
 fitted.vote={predict:x=>{const ps=['boost','forest','svm'].map(a=>fitted[a].predict(x));return [0,1,2].map(k=>(ps[0][k]+ps[1][k]+ps[2][k])/3);},params:{members:['boost','forest','svm']},importance:null};
 return fitted;
}
function fitPartitions(parts,current,options={}){
 checkParts(parts);
 if(!current||!finite(current.t)||!finite(current.close)||current.close<=0||!Array.isArray(current.x)||current.x.length!==F||!current.x.every(finite))throw Error('Sesiunea și indicatorii curenți ai clasificatorului nu pot fi verificați.');
 const fitted=fitModels(parts,options);
 const constant=prior(parts.train),blocks=separated(parts.test),refs={test:{constant:N.metrics(parts.test,()=>constant),momentum:N.metrics(parts.test,momentum)},nonOverlap:{constant:N.metrics(blocks,()=>constant),momentum:N.metrics(blocks,momentum)}},tagged=blocks.map(r=>({...r,constantP:constant})),s=scaler(parts.train);refs.always=blocks.map(r=>r.pnl).filter(finite);
 const algos={};for(const id of IDS){const f=fitted[id],test=N.metrics(parts.test,f.predict),support=f.predict(current.x);algos[id]={params:f.params,support,classIndex:support.indexOf(Math.max(...support)),test,nonOverlap:N.metrics(blocks,f.predict),advantage:N.edge(test,refs.test.constant,refs.test.momentum),importance:share(f.importance),blocks:diffStat(tagged,f.predict),trades:{long:trades(blocks,f.predict,2),short:trades(blocks,f.predict,0)}};}
 return {version:VERSION,horizon:HORIZON,reviewOnly:true,features:FEATURES.slice(),constant,current:{t:current.t,close:current.close,x:current.x.slice(),maxZ:Math.max(...standard(current.x,s).map(Math.abs))},algos,references:refs,report:{periods:Object.fromEntries(Object.entries(parts).map(([k,xs])=>[k,period(xs)])),nonOverlap:period(blocks)}};
}
function pool(stats){const ok=stats.filter(Boolean);return ok.length?{n:ok.reduce((a,s)=>a+s.n,0),sum:ok.reduce((a,s)=>a+s.sum,0),sumSq:ok.reduce((a,s)=>a+s.sumSq,0)}:null;}
function summarize(folds){
 const good=folds.filter(f=>f.status==='evaluated');if(!good.length)return null;const out={};
 for(const id of IDS){const daily={test:E.aggregate(good.map(f=>f.algos[id].test)),constant:E.aggregate(good.map(f=>f.references.test.constant)),momentum:E.aggregate(good.map(f=>f.references.test.momentum))},nonOverlap={test:E.aggregate(good.map(f=>f.algos[id].nonOverlap)),constant:E.aggregate(good.map(f=>f.references.nonOverlap.constant)),momentum:E.aggregate(good.map(f=>f.references.nonOverlap.momentum))},blockEnough=['test','constant','momentum'].every(k=>N.validMetric(nonOverlap[k],50,5));
  out[id]={wins:good.filter(f=>f.algos[id].advantage).length,daily,nonOverlap,blockEnough,pooledAdvantage:N.edge(daily.test,daily.constant,daily.momentum),nonOverlapAdvantage:blockEnough&&N.edge(nonOverlap.test,nonOverlap.constant,nonOverlap.momentum),blocks:pool(good.map(f=>f.algos[id].blocks))};}
 return out;
}
function finishWalk(final,folds,status,reason){
 const summary=summarize(folds),complete=status==='complete',consistent={};for(const id of IDS)consistent[id]=!!(complete&&summary&&summary[id].wins===3&&summary[id].pooledAdvantage&&summary[id].nonOverlapAdvantage);
 const stats=IDS.map(id=>summary?summary[id].blocks:final.algos[id].blocks),ps=stats.map(pValue),pass=holm(ps);IDS.forEach((id,i)=>{final.algos[id].p=ps[i];final.algos[id].holmPass=pass[i];});
 const sources=folds.filter(f=>f.status==='evaluated');const src=sources.length?sources:[{algos:final.algos,references:final.references}];
 final.walk={status,folds,summary,consistent,reason,money:{always:money(src.flatMap(f=>f.references.always)),...Object.fromEntries(IDS.map(id=>[id,{long:money(src.flatMap(f=>f.algos[id].trades.long)),short:money(src.flatMap(f=>f.algos[id].trades.short))}]))}};return final;
}
function evaluate(data,current,options={}){
 const parts=split(data.rows),planned=E.plan(data.rows);
 if(!planned.length)return finishWalk(fitPartitions(parts,current,options),[],'insufficient','Minimum 600 exemple etichetate pentru trei ferestre. Testul recent rămâne disponibil.');
 const folds=[];let final;
 for(const item of planned){try{
  const c=item.id===3?current:{t:item.parts.test.at(-1).end,close:1,x:item.parts.test.at(-1).x},r=fitPartitions(item.parts,c,{progress:p=>options.progress?.({...p,stage:item.id,stages:3})});
  folds.push({id:item.id,status:'evaluated',periods:r.report.periods,algos:Object.fromEntries(IDS.map(id=>[id,{test:r.algos[id].test,nonOverlap:r.algos[id].nonOverlap,advantage:r.algos[id].advantage,blocks:r.algos[id].blocks,trades:r.algos[id].trades}])),references:r.references});if(item.id===3)final=r;
 }catch(error){if(item.id===3)throw error;folds.push({id:item.id,status:'blocked',periods:item.periods,error:error.message||'Evaluare indisponibilă.',algos:null,references:null});}}
 const complete=folds.every(f=>f.status==='evaluated');return finishWalk(final,folds,complete?'complete':'incomplete',complete?null:'Unele ferestre nu au suficiente exemple în fiecare clasă; nu sunt eliminate din verificare.');
}

function validProbs(p){return Array.isArray(p)&&p.length===3&&p.every(v=>finite(v)&&v>=0&&v<=1)&&Math.abs(p.reduce((a,b)=>a+b,0)-1)<1e-7;}
function validPeriods(p){return ['train','validation','test'].every(k=>p?.[k]&&[p[k].from,p[k].to,p[k].lastLabel].every(finite)&&p[k].from<=p[k].to&&p[k].to<p[k].lastLabel&&Number.isInteger(p[k].n)&&p[k].n>0)&&p.train.lastLabel<p.validation.from&&p.validation.lastLabel<p.test.from;}
function validTrades(t,b){return !!t&&['long','short'].every(k=>Array.isArray(t[k])&&t[k].every(finite))&&t.long.length+t.short.length<=b&&equal(Object.keys(t),['long','short']);}
function validStat(s){return !!s&&Number.isInteger(s.n)&&s.n>=0&&finite(s.sum)&&finite(s.sumSq)&&s.sumSq>=0;}
function validRefs(r,n,b){return ['constant','momentum'].every(k=>N.validMetric(r.test[k],50,5)&&r.test[k].n===n&&N.validMetric(r.nonOverlap[k],1,0)&&r.nonOverlap[k].n===b);}
function valid(r){try{
 const p=r.report.periods,n=p.test.n,b=r.report.nonOverlap.n;
 if(r.version!==VERSION||r.horizon!==HORIZON||r.reviewOnly!==true||!equal(r.features,FEATURES)||!validPeriods(p)||!validProbs(r.constant)||!validRefs(r.references,n,b))return false;
 const c=r.current;if(!c||!finite(c.t)||c.t!==p.test.lastLabel||!finite(c.close)||c.close<=0||!Array.isArray(c.x)||c.x.length!==F||!c.x.every(finite)||!finite(c.maxZ)||c.maxZ<0)return false;
 if(!equal(Object.keys(r.algos),IDS))return false;
 const pr=id=>r.algos[id].params;if(!Number.isInteger(pr('boost').rounds)||pr('boost').rounds<5||pr('boost').rounds>CONFIG.boost.maxRounds||!CONFIG.forest.depths.includes(pr('forest').depth)||!CONFIG.svm.lambdas.includes(pr('svm').lambda)||!CONFIG.svm.temperatures.includes(pr('svm').temperature)||!equal(pr('vote'),{members:['boost','forest','svm']})||!equal(Object.keys(pr('boost')),['rounds'])||!equal(Object.keys(pr('forest')),['depth'])||!equal(Object.keys(pr('svm')),['lambda','temperature']))return false;
 if((r.algos.boost.importance===null)||(r.algos.forest.importance===null)||r.algos.svm.importance!==null||r.algos.vote.importance!==null)return false;
 for(const id of IDS){const a=r.algos[id];if(!validProbs(a.support)||a.classIndex!==a.support.indexOf(Math.max(...a.support))||!N.validMetric(a.test,50,5)||a.test.n!==n||!N.validMetric(a.nonOverlap,1,0)||a.nonOverlap.n!==b||a.advantage!==N.edge(a.test,r.references.test.constant,r.references.test.momentum)||!validStat(a.blocks)||a.blocks.n!==b||!finite(a.p)||a.p<0||a.p>1||typeof a.holmPass!=='boolean'||!validTrades(a.trades,b))return false;
  if(a.importance!==null&&(!Array.isArray(a.importance)||a.importance.length!==F||!a.importance.every(v=>finite(v)&&v>=0)))return false;}
 const w=r.walk;if(!w||!['complete','incomplete','insufficient'].includes(w.status)||!Array.isArray(w.folds))return false;
 if(w.status==='insufficient'){if(w.folds.length||w.summary!==null)return false;}
 else{if(w.folds.length!==3)return false;let end=-Infinity;for(let i=0;i<3;i++){const f=w.folds[i];if(f.id!==i+1||!validPeriods(f.periods)||f.periods.test.from<=end)return false;end=f.periods.test.lastLabel;
   if(f.status==='blocked'){if(!f.error||f.algos!==null||f.references!==null)return false;continue;}
   if(f.status!=='evaluated'||!validRefs(f.references,f.periods.test.n,f.references.nonOverlap.constant.n))return false;
   for(const id of IDS){const a=f.algos?.[id];if(!a||!N.validMetric(a.test,50,5)||a.test.n!==f.periods.test.n||!N.validMetric(a.nonOverlap,1,0)||a.advantage!==N.edge(a.test,f.references.test.constant,f.references.test.momentum)||!validStat(a.blocks)||!validTrades(a.trades,f.references.nonOverlap.constant.n))return false;}
   if(!Array.isArray(f.references.always)||!f.references.always.every(finite))return false;}
  const last=w.folds[2];if(last.status!=='evaluated'||!equal(last.periods,p)||IDS.some(id=>!equal(last.algos[id].test,r.algos[id].test)||!equal(last.algos[id].blocks,r.algos[id].blocks)))return false;
  if(w.status!==(w.folds.every(f=>f.status==='evaluated')?'complete':'incomplete'))return false;}
 // Rezumatul, consecvența și corecția Holm se recalculează din ferestre; orice modificare se vede.
 const check=finishWalk(copy({...r,walk:undefined}),copy(w.folds),w.status,w.reason);
 return Array.isArray(r.references.always)&&r.references.always.every(finite)&&equal(check.walk.money,w.money)&&equal(check.walk.summary,w.summary)&&equal(check.walk.consistent,w.consistent)&&IDS.every(id=>check.algos[id].p===r.algos[id].p&&check.algos[id].holmPass===r.algos[id].holmPass);
 }catch{return false;}}
function assess(r,id='vote'){
 const a=r.algos[id],ps=a.support.slice().sort((x,y)=>y-x),name=ALGOS.find(x=>x.id===id).name;
 if(r.current.maxZ>6)return {state:'drift',message:'Indicatorii de azi ies din domeniul antrenării (peste 6 deviații standard). Clasificatorul se abține.'};
 if(ps[0]-ps[1]<.1)return {state:'uncertain',message:name+': clasele sunt apropiate; diferența sub 10 puncte procentuale nu susține o direcție.'};
 if(!a.advantage)return {state:'no-edge',message:name+' nu bate frecvențele claselor și reperul de momentum în testul recent. Direcția rămâne exploratorie.'};
 if(!r.walk.consistent[id]||!a.holmPass)return {state:'fragile',message:name+': avantaj în testul recent, dar trei ferestre și corecția pentru cele 4 modele încercate (Holm) nu îl confirmă.'};
 return {state:'research',message:name+': avantaj repetat în trei ferestre, pe orizonturi separate, și după corecția Holm. Direcție experimentală, fără probabilitate de profit.'};
}
const sig=v=>(v>0?'+':'')+v.toLocaleString('ro-RO',{minimumFractionDigits:1,maximumFractionDigits:1});
function moneyText(s){return s&&s.n?s.n+' zile · medie '+sig(s.mean)+'% · mediana '+sig(s.median)+'% · pe plus '+Math.round(100*s.win)+'%':'nicio zi';}
function moneyShort(s){return s&&s.n?s.n+' zile · '+sig(s.mean)+'%':'—';}
const MONEY_NOTE='Intrare la deschiderea zilei următoare, ieșire după 5 sesiuni, stop la 1 ATR, costuri 0,4% dus-întors (FX T212 + derapaj); doar orizonturi separate, toate ferestrele. Ipoteză pe istoric, nu promisiune.';
g.HoldingsClassifier={fitModels,prior,momentum,trades,money,normalCdf,MONEY_NOTE,moneyText,moneyShort,VERSION,HORIZON,FEATURES,CLASSES,ALGOS,CONFIG,dataset,split,checkParts,fitPartitions,evaluate,valid,assess,holm,pValue};
})(typeof window!=='undefined'?window:globalThis);
