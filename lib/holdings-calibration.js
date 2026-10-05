(function(g){
'use strict';
const F=g.HoldingsForecast,VERSION='holdings-calibration-v1';
const CONFIG=Object.freeze({minimum:40,blockMinimum:20,classMinimum:4,weights:Object.freeze([.5,.25,.75]),temperatures:Object.freeze([1,1.5,2,3]),lossMargin:.02,brierMargin:.01});
const SOURCE_KEYS=['t','asOf','timezone','closeMinutes','close','atrPct'];
const LABELS={blocked:'Registru de verificat',collecting:'Colectare de observații',classes:'Clase insuficient reprezentate',advantage:'Avantaj observat pe test', 'no-edge':'Fără avantaj pe test'};
const argmax=p=>p.indexOf(Math.max(...p));
function combine(a,b,weight=.5,temperature=1){
 const p=a.map((v,k)=>weight*v+(1-weight)*b[k]);
 if(temperature===1)return p;
 const logits=p.map(v=>Math.log(Math.max(1e-12,v))/temperature),max=Math.max(...logits),xs=logits.map(v=>Math.exp(v-max)),sum=xs.reduce((a,b)=>a+b,0);
 return xs.map(v=>v/sum);
}
function score(rows,predict){
 if(!rows.length)return null;
 let loss=0,brier=0,correct=0;const confusion=Array.from({length:3},()=>[0,0,0]);
 for(const r of rows){const p=predict(r),label=argmax(p);loss-=Math.log(Math.max(1e-12,p[r.actualClass]));brier+=p.reduce((s,v,k)=>s+(v-(r.actualClass===k?1:0))**2,0);correct+=label===r.actualClass;confusion[r.actualClass][label]++;}
 const counts=confusion.map(row=>row.reduce((a,b)=>a+b,0)),n=rows.length;
 return {n,loss:loss/n,brier:brier/n,accuracy:correct/n,balanced:counts.some(n=>!n)?null:confusion.reduce((s,row,k)=>s+row[k]/counts[k],0)/3,counts,confusion};
}
function period(rows){return rows.length?{n:rows.length,from:rows[0].asOf,to:rows.at(-1).asOf,lastOutcome:rows.at(-1).endAsOf,counts:[0,1,2].map(k=>rows.filter(r=>r.actualClass===k).length)}:{n:0,from:null,to:null,lastOutcome:null,counts:[0,0,0]};}
function sameOutcome(a,b){return a.t===b.t&&a.asOf===b.asOf&&a.close===b.close&&a.path.length===b.path.length&&a.path.every((v,i)=>v.t===b.path[i].t&&v.c===b.path[i].c);}
function build(item,{scope,kind='market',now=Date.now()}={}){
 const excluded={incomplete:0,pending:0,unverifiable:0,legacy:0,mismatch:0,overlap:0},e=item?.identity,ledger=item?.ledger;
 const base={version:VERSION,reviewOnly:true,generatedAt:now,kind,modelVersions:{neural:F.VERSIONS.neural,boosting:F.VERSIONS.boosting},horizon:5,state:'blocked',label:LABELS.blocked,available:0,paired:0,origins:0,excluded,requirements:{minimum:CONFIG.minimum,blockMinimum:CONFIG.blockMinimum,classMinimum:CONFIG.classMinimum},split:{fit:period([]),test:period([])},parameters:null,scores:null,advantage:false,latestCheck:null,warning:null,reason:'Registre incompatibile, identitate incompletă sau date ilizibile. Datele existente sunt păstrate.'};
 if(!Number.isFinite(now)||!F.identity(e)||e.scope!==scope||e.kind!==kind||ledger?.ok!==true||!Array.isArray(ledger.entries)||ledger.entries.length>F.MAX||ledger.entries.some(r=>!F.validEntry(r,e,now))||new Set(ledger.entries.map(r=>r.id)).size!==ledger.entries.length)return base;
 const groups=new Map();
 for(const r of ledger.entries){if(!['neural','boosting'].includes(r.model))continue;if(!groups.has(r.source.asOf))groups.set(r.source.asOf,{});groups.get(r.source.asOf)[r.model]=r;}
 const rows=[];
 for(const pair of groups.values()){
  const {neural:a,boosting:b}=pair;
  if(!a||!b){excluded.incomplete++;continue;}
  if(SOURCE_KEYS.some(k=>a.source[k]!==b.source[k])){excluded.mismatch++;continue;}
  if([a,b].some(r=>r.verification.state==='unverifiable')){excluded.unverifiable++;continue;}
  if([a,b].some(r=>r.verification.state!=='resolved')){excluded.pending++;continue;}
  if(!sameOutcome(a.outcome,b.outcome)){excluded.mismatch++;continue;}
  if([a,b].some(r=>!r.estimate.probabilities)){excluded.legacy++;continue;}
  rows.push({t:a.source.t,asOf:a.source.asOf,end:a.outcome.t,endAsOf:a.outcome.asOf,actualClass:F.metric(a).actualClass,neural:a.estimate.probabilities,boosting:b.estimate.probabilities,checkedAt:Math.min(a.verification.checkedAt,b.verification.checkedAt)});
 }
 rows.sort((a,b)=>a.t-b.t);let end=-Infinity;const selected=rows.filter(r=>{if(r.t<=end){excluded.overlap++;return false;}end=r.end;return true;});
 // The split depends only on chronology and count. Never balance or select using test labels.
 const cut=Math.floor(selected.length/2),fit=selected.slice(0,cut),test=selected.slice(cut),split={fit:period(fit),test:period(test)};
 const report={...base,origins:groups.size,paired:rows.length,available:selected.length,split,latestCheck:selected.length?Math.max(...selected.map(r=>r.checkedAt)):null,warning:item.check?.state==='error'?'Ultima verificare a sursei nu a reușit. Evaluarea folosește rezultatele istorice păstrate.':null};
 if(selected.length<CONFIG.minimum)return {...report,state:'collecting',label:LABELS.collecting,reason:'Sunt necesare cel puțin 40 perechi cu probabilități păstrate și rezultat verificat, pe orizonturi separate: minimum 20 pentru calibrare și 20 pentru test. Estimările vechi fără probabilități rămân în registru, dar nu intră în calibrare.'};
 if([split.fit,split.test].some(p=>p.n<CONFIG.blockMinimum||p.counts.some(n=>n<CONFIG.classMinimum)))return {...report,state:'classes',label:LABELS.classes,reason:'Calibrarea și testul cer fiecare minimum 4 rezultate din fiecare clasă: Declin, Mixt și Avans. Nu mutăm observații între perioade pentru a echilibra clasele.'};
 const candidates=CONFIG.weights.flatMap(weight=>CONFIG.temperatures.map(temperature=>({weight,temperature,loss:score(fit,r=>combine(r.neural,r.boosting,weight,temperature)).loss}))),chosen=candidates.reduce((best,x)=>x.loss<best.loss-1e-8?x:best);
 const counts=split.fit.counts,prior=counts.map(n=>(n+1)/(fit.length+3)),scores={neural:score(test,r=>r.neural),boosting:score(test,r=>r.boosting),average:score(test,r=>combine(r.neural,r.boosting)),prior:score(test,()=>prior),calibrated:score(test,r=>combine(r.neural,r.boosting,chosen.weight,chosen.temperature))};
 const references=['neural','boosting','average','prior'].map(k=>scores[k]),advantage=scores.calibrated.loss<Math.min(...references.map(s=>s.loss))-CONFIG.lossMargin&&scores.calibrated.brier<Math.min(...references.map(s=>s.brier))-CONFIG.brierMargin;
 return {...report,state:advantage?'advantage':'no-edge',label:LABELS[advantage?'advantage':'no-edge'],parameters:{neuralWeight:chosen.weight,boostingWeight:1-chosen.weight,temperature:chosen.temperature,fitLoss:chosen.loss,prior,candidates},scores,advantage,reason:advantage?'Combinația are scoruri mai bune în perioada de test față de ambele modele, media 50/50 și frecvențele claselor din calibrare. Avantaj descriptiv, fără confirmare statistică sau probabilitate de profit.':'Combinația nu depășește toate reperele cu marjele cerute pe test. Calibrarea rămâne experimentală și nu adaugă o direcție verdictului final.'};
}
g.HoldingsCalibration={VERSION,CONFIG,combine,score,build};
})(typeof window!=='undefined'?window:globalThis);
