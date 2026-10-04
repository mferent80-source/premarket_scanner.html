(function(g){
'use strict';
const N=g.HoldingsNeural,B=g.HoldingsBoosting,E=g.HoldingsNeuralEvaluation,VERSION='holdings-comparison-v1';
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function evaluate(rows,latest,neural,options={}){
 try{
  const refs=new Map((neural.walk?.folds||[]).filter(f=>f.status==='evaluated').map(f=>[f.periods.test.from,{linear:f.metrics.linear,constant:f.metrics.constant,nonOverlap:f.nonOverlap}]));refs.set(neural.report.periods.test.from,neural.report);
  const boost=E.evaluateWith(rows,latest,(parts,x,o)=>B.fitPartitions(parts,x,refs.get(parts.test[0].t),o),options,B.valid),comparison={version:VERSION,status:'evaluated',boosting:boost};
  if(!valid({...neural,comparison}))throw Error('Comparația nu poate fi verificată.');return comparison;
 }catch(error){return {version:VERSION,status:'blocked',error:error.message||'Gradient Boosting indisponibil.'};}
}
function valid(r){try{
 const c=r.comparison;if(c.version!==VERSION)return false;if(c.status==='blocked')return typeof c.error==='string'&&c.error.length>0&&c.boosting===undefined;if(c.status!=='evaluated'||!B.valid(c.boosting))return false;const b=c.boosting;
 if(!equal(b.latest,r.latest)||!equal(b.report.periods,r.report.periods)||['linear','constant'].some(k=>!equal(b.report[k],r.report[k])||!equal(b.report.nonOverlap[k],r.report.nonOverlap[k]))||b.walk?.status==='insufficient'&&r.walk?.status!=='insufficient')return false;
 for(const f of b.walk?.folds||[]){const n=r.walk?.folds.find(x=>x.id===f.id);if(!n||!equal(f.periods,n.periods)||f.status==='evaluated'&&(n.status!=='evaluated'||['linear','constant'].some(k=>!equal(f.metrics[k],n.metrics[k])||!equal(f.nonOverlap[k],n.nonOverlap[k]))))return false;}
 return true;
 }catch{return false;}}
function verdict(r){
 if(!r?.comparison)return {state:'missing',message:'Reantrenează pentru comparația cu Gradient Boosting.'};if(!valid(r))return {state:'invalid',message:'Comparație incompatibilă; nu este interpretată.'};if(r.comparison.status==='blocked')return {state:'blocked',message:'Gradient Boosting indisponibil: '+r.comparison.error};
 const b=r.comparison.boosting;if(r.maxZ>6||Math.max(...r.disagreement.votes)<2||r.disagreement.spread>.35)return {state:'blocked',message:'Neconcludent · indicatori în afara domeniului sau rețele în dezacord.'};if(r.classIndex!==b.classIndex)return {state:'disagreement',message:'Neconcludent · modelele estimează clase diferite.'};
 if(!r.walk?.consistent||!b.walk?.consistent)return {state:'no-edge',message:'Neconcludent · avantajul repetat nu este demonstrat de ambele modele.'};return {state:'research',message:'Acord experimental · ambele modele trec testele istorice. Nu este un semnal de tranzacționare.'};
}
function validPublic(entry){try{
 const c=entry.comparison;if(c.status==='blocked')return c.version===VERSION&&typeof c.error==='string'&&c.error.length>0;if(c.status!=='evaluated')return false;const b=c.boosting,n=entry.recent;
 if(b.version!==B.VERSION||!Number.isInteger(b.rounds)||b.rounds<5||b.rounds>80||b.rounds%5||!equal(b.selection,n.adjustment.earlyStopping)||!equal(b.report.periods,n.periods)||!E.valid(b.walk,b.report)||['train','validation','test','linear','constant'].some(k=>!N.validMetric(b.report[k],k==='train'?150:50,k==='train'?10:5))||['linear','constant'].some(k=>!equal(b.report[k],n[k])||!equal(b.report.nonOverlap[k],n.nonOverlap[k])))return false;
 for(const f of b.walk.folds){const nf=entry.walk.folds.find(x=>x.id===f.id);if(!nf||!equal(f.periods,nf.periods)||f.status==='evaluated'&&(nf.status!=='evaluated'||['linear','constant'].some(k=>!equal(f.metrics[k],nf.metrics[k])||!equal(f.nonOverlap[k],nf.nonOverlap[k]))))return false;}
 return true;
 }catch{return false;}}
g.HoldingsModelComparison={VERSION,evaluate,valid,validPublic,verdict};
})(typeof window!=='undefined'?window:globalThis);
