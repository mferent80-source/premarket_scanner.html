(function(g){
'use strict';
const VERSION='holdings-performance-v1',F=g.HoldingsForecast,V=g.HoldingsVerdict,finite=Number.isFinite;
const metric=(label,value,unit='',precision=3)=>({label,value:finite(value)?value:null,unit,precision});
const weighted=(items,key)=>{const selected=items.filter(x=>x&&x.n>0&&finite(x[key])),n=selected.reduce((sum,x)=>sum+x.n,0);return n?selected.reduce((sum,x)=>sum+x[key]*x.n,0)/n:null;};
const total=items=>items.reduce((sum,x)=>sum+(x?.n||0),0);
function windowRow(id,periods,{status='evaluated',score=null,baseline=null,n=null,error=null,advantage=null}={}){
 const p=periods.test;return {id,status,from:p.from,to:p.to,lastOutcome:p.lastLabel??p.to,n:n??p.n,score,baseline,error,advantage};
}
function history(card,snapshot){
 const base={id:card.id,name:card.name,version:card.version,available:false,status:'missing',planned:3,windows:[],metrics:[],control:[],reason:card.detail,judgment:'Raport indisponibil',trainedAt:card.trainedAt};
 if(!card.available)return base;
 try{
  const root=snapshot.record.result,r=card.id==='boosting'?root.comparison.boosting:root,w=r.walk;
  let metrics=[],control=[],windows=[],complete=false,judgment='Avantaj neconfirmat',reason='Testele istorice sunt retrospective; fiecare fereastră își fixează parametrii înaintea testului.';
  if(['neural','boosting'].includes(card.id)){
   const s=w?.summary,d=s?.daily||r.report,m=d.test;
   metrics=[metric('Log loss',m.loss),metric('Brier · trei clase',m.brier),metric('Acuratețe echilibrată',m.balanced===null?null:m.balanced*100,'%',1),metric('Log loss · liniar',d.linear.loss),metric('Log loss · frecvențe',d.constant.loss),metric('Exemple zilnice',m.n,'',0)];
   const b=s?.nonOverlap||r.report.nonOverlap;
   if(b)control=[metric('Orizonturi separate',b.test.n,'',0),metric('Log loss · orizonturi separate',b.test.loss),metric('Brier · orizonturi separate',b.test.brier),metric('Log loss · liniar',b.linear.loss),metric('Log loss · frecvențe',b.constant.loss)];
   windows=(w?.folds?.length?w.folds:[{id:1,status:'evaluated',periods:r.report.periods,metrics:r.report,advantage:null}]).map(f=>windowRow(f.id,f.periods,{status:f.status,n:f.periods.test.n,score:f.status==='evaluated'?f.metrics.test.loss:null,baseline:f.status==='evaluated'?Math.min(f.metrics.linear.loss,f.metrics.constant.loss):null,error:f.error||null,advantage:f.advantage}));
   complete=w?.status==='complete';judgment=w?.consistent?'Avantaj repetat în testele istorice':'Avantaj neconfirmat';if(w?.reason)reason=w.reason;
  }else if(card.id==='hmm'){
   const s=w?.summary||r.report.test;
   metrics=[metric('NLL · HMM',s.hmm),metric('NLL · fără tranziții',s.independent),metric('NLL · Gaussiană unică',s.gaussian),metric('Observații de test',s.n,'',0)];
   windows=(w?.folds?.length?w.folds:[{id:1,status:'evaluated',periods:r.report.periods,test:r.report.test,advantage:r.report.advantage}]).map(f=>windowRow(f.id,f.periods,{status:f.status,score:f.status==='evaluated'?f.test.hmm:null,baseline:f.status==='evaluated'?Math.min(f.test.independent,f.test.gaussian):null,error:f.error||null,advantage:f.advantage}));
   complete=w?.status==='complete';judgment=w?.consistent?'Avantaj descriptiv repetat':'Avantaj descriptiv neconfirmat';reason='NLL compară densitatea observațiilor cu două repere pe aceleași perioade. Nu măsoară corectitudinea unei direcții viitoare.';
  }else if(card.id==='isolation'){
   const s=w?.summary||r.report.test;
   metrics=[metric('Sesiuni semnalate',s.rate*100,'%',1),metric('Observații de test',s.n,'',0),metric('Semnale de graniță',s.uncertain,'',0),metric('Scor mediu',s.meanScore)];
   windows=(w?.folds?.length?w.folds:[{id:1,periods:r.report.periods,test:r.report.test}]).map(f=>windowRow(f.id,f.periods,{score:f.test.rate*100,n:f.test.n}));
   complete=w?.folds?.length===3;judgment='Context de anomalie';reason='Procentul este rata semnalelor în test. Lipsesc etichete externe ale anomaliilor, deci nu calculăm o acuratețe sau o rată a alarmelor false.';
  }else if(card.id==='quantile'){
   const fits=w?.folds?.length?w.folds:[r],tests=fits.map(f=>f.report.test),baselines=fits.map(f=>f.report.baseline),blocks=fits.map(f=>f.report.nonOverlap);
   metrics=[metric('Acoperire observată',weighted(tests,'coverage')*100,'%',1),metric('Scor de interval',weighted(tests,'score'),' ATR'),metric('Scor · reper istoric',weighted(baselines,'score'),' ATR'),metric('Lățime medie',weighted(tests,'width'),' ATR'),metric('Eroare mediană · MAE',weighted(tests,'mae'),' ATR'),metric('Exemple zilnice',total(tests),'',0)];
   control=[metric('Orizonturi separate',total(blocks),'',0),metric('Acoperire · orizonturi separate',weighted(blocks,'coverage')*100,'%',1),metric('Scor · orizonturi separate',weighted(blocks,'score'),' ATR')];
   windows=fits.map((f,i)=>windowRow(i+1,f.report.periods,{score:f.report.test.score,baseline:f.report.baseline.score,advantage:f.report.test.score<f.report.baseline.score}));
   complete=w?.status==='evaluated';judgment=complete&&w.wins>=2?'Interval cu avantaj în minimum două ferestre':'Avantaj al intervalului neconfirmat';reason=w?.reason||'Ținta nominală este 80%. Scorul penalizează atât lățimea, cât și închiderile ratate. Calibrarea și reperul se fixează înaintea testului.';
  }else if(card.id==='garch'){
   for(const horizon of [5,20]){const xs=r.folds.map(f=>f.metrics.horizons[horizon]);metrics.push(metric('QLIKE · '+horizon+' sesiuni',weighted(xs,'model')),metric('QLIKE · varianță constantă · '+horizon,weighted(xs,'constant')),metric('QLIKE · EWMA · '+horizon,weighted(xs,'ewma')),metric('Orizonturi separate · '+horizon,total(xs),'',0));}
   windows=r.folds.map((f,i)=>windowRow(i+1,f.periods,{score:f.metrics.horizons[5].model,baseline:Math.min(f.metrics.horizons[5].constant,f.metrics.horizons[5].ewma),n:f.metrics.horizons[5].n,advantage:g.HoldingsGarch.advantage(f.metrics.horizons[5])}));
   complete=w?.status==='evaluated';judgment=snapshot.assessment?.state==='descriptive'?'Volatilitate cu validare suficientă':'Volatilitate exploratorie';reason=w?.reason||'Scoruri de varianță pe blocuri separate, la 5 și 20 sesiuni. Parametrii sunt fixați înaintea fiecărui test; varianța condițională se actualizează numai cu observațiile deja cunoscute.';
  }
  return {...base,available:true,status:complete?'complete':windows.length>1?'partial':'recent',windows,metrics,control,judgment,reason};
 }catch{return {...base,reason:'Măsurile istorice nu pot fi citite în această versiune. Recalculează testele.'};}
}
function probabilities(rows,model){
 const samples=F.separate(rows.filter(r=>r.model===model&&r.horizon===5&&r.verification.state==='resolved')).flatMap(r=>{
  const p=model==='verdict'?r.estimate.probabilistic?.probabilities:r.estimate.probabilities;if(!p)return [];
  const m=F.metric(r);return [{origin:r.source.t,actual:m.actualClass,p:p.slice(),validated:model==='verdict'?r.estimate.probabilistic.eligible:null}];
 });
 const n=samples.length,loss=n?samples.reduce((sum,s)=>sum-Math.log(Math.max(1e-12,s.p[s.actual])),0)/n:null,brier=n?samples.reduce((sum,s)=>sum+s.p.reduce((a,p,k)=>a+(p-(k===s.actual?1:0))**2,0),0)/n:null;
 const reliability=[0,1,2].map(classIndex=>Array.from({length:5},(_,i)=>{
  const group=samples.filter(s=>Math.min(4,Math.floor(s.p[classIndex]*5))===i),count=group.length;
  return {from:i*.2,to:(i+1)*.2,n:count,predicted:count?group.reduce((sum,s)=>sum+s.p[classIndex],0)/count:null,observed:count?group.filter(s=>s.actual===classIndex).length/count:null};
 }));
 return {n,loss,brier,validated:model==='verdict'?samples.filter(s=>s.validated).length:null,from:samples[0]?.origin??null,to:samples.at(-1)?.origin??null,reliability};
}
function prospective(item,now){
 const e=item?.identity,entries=item?.ledger?.entries;
 if(!F.identity(e)||item.ledger?.ok!==true||!Array.isArray(entries)||entries.length>F.MAX||entries.some(r=>!F.validEntry(r,e,now))||new Set(entries.map(r=>r.id)).size!==entries.length)return {ok:false,reason:'Registrul predicțiilor este indisponibil sau incompatibil. Datele existente rămân păstrate.',models:[],restoredExcluded:0};
 const original=entries.filter(r=>!r.restoredAt),reports=F.report(original);
 return {ok:true,reason:item.check?.state==='error'?'Ultima verificare a sursei a eșuat. Valorile de mai jos sunt rezultate istorice păstrate.':'Predicții înscrise la momentul estimării, urmate de verificarea rezultatului. Orizonturile se separă în cadrul fiecărui model.',checkState:item.check?.state||null,restoredExcluded:entries.length-original.length,models:reports.map(r=>({id:r.model,name:r.model==='verdict'?'Combinație AI · verdict':V.NAMES[r.model],horizon:r.horizon,...r,...(['neural','boosting','verdict'].includes(r.model)?{probability:probabilities(original,r.model)}:{})}))};
}
function build({expected,snapshots={},item,probabilistic=null,now=Date.now()}={}){
 const verdict=V.build({expected,snapshots,probabilistic,now}),models=verdict.cards.map(c=>history(c,snapshots[c.id==='boosting'?'neural':c.id]));
 return {version:VERSION,reviewOnly:true,symbol:expected?.symbol||item?.identity?.symbol||null,currency:expected?.currency||item?.identity?.currency||null,asOf:expected?.asOf||null,kind:expected?.kind||item?.identity?.kind||null,timezone:expected?.timezone||'America/New_York',generatedAt:now,historical:{available:models.filter(m=>m.available).length,total:6,complete:models.filter(m=>m.status==='complete').length,models},prospective:prospective(item,now),verdict:{state:verdict.state,title:verdict.title,direction:verdict.direction,reasons:verdict.reasons,available:verdict.available,total:verdict.total,checkpoint:verdict.probabilistic?.checkpoint||null},limits:['Testele istorice și predicțiile urmărite după captură sunt două măsurători distincte. Testele istorice nu activează checkpoint-ul prospectiv.','Scorurile se compară numai între model și reperele sale, pe aceleași perioade. Nu însumăm instrumentele sau orizonturile într-o acuratețe globală.','Orizonturile separate pot rămâne corelate. Aceste măsuri nu includ costuri, dividende, FX, știri sau performanța tranzacțiilor.']};
}
g.HoldingsPerformance={VERSION,build,prospective,probabilities};
})(typeof window!=='undefined'?window:globalThis);
