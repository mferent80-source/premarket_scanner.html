(function(g){
'use strict';
const VERSION='holdings-auto-learning-v1';
function key(e){return g.HoldingsForecast.key(e)?.replace('tt_holdings_forecast_v1:','tt_holdings_auto_learning_v1:')||null;}
function create({restore,read,write,load,steps,current,complete,update=()=>{},now=Date.now}){
 let active=null,serial=0;
 function stop(){if(active){active.stopped=true;active.step?.cancel();active=null;}}
 const live=run=>active===run&&!run.stopped&&current(run.target,run.source);
 async function start(target,{force=false}={}){
  if(active)return {state:'busy'};const run={id:++serial,target,source:null,phase:'loading',statuses:{},step:null};active=run;
  try{await restore(target);if(!live(run))return {state:'cancelled'};let previous=read(target)||{version:VERSION,enabled:true};if(previous.version!==VERSION)throw Error('Setări de reantrenare incompatibile.');
   if(!force&&previous.enabled===false)return {state:'disabled'};
   if(!force&&previous.asOf===target.asOf&&(previous.phase==='done'||now()-(previous.at||0)<15*60000))return {state:'cached'};
   run.source=await load(target,()=>live(run));if(!live(run))return {state:'cancelled'};
   if(!force&&previous.asOf===run.source.asOf&&previous.fingerprint===run.source.fingerprint&&previous.phase==='done')return {state:'cached'};
   previous={...previous,asOf:run.source.asOf,fingerprint:run.source.fingerprint,at:now(),phase:'running',error:null};write(target,previous);run.phase='running';update(run);
   for(const step of steps){if(!live(run))return {state:'cancelled'};run.step=step;for(const id of step.models)run.statuses[id]={state:'running'};update(run);
    let out;try{out=await step.run(target,run.source,p=>{if(live(run)){run.progress=p;update(run);}});}catch(error){out={state:'error',error:error.message};}
    if(!live(run))return {state:'cancelled'};run.step=null;run.progress=null;for(const id of step.models)run.statuses[id]=out?.state==='ready'?{state:'ready'}:{state:'error',error:out?.error||'Calcul indisponibil.'};update(run);
   }
   const out=await complete(run);if(!live(run))return {state:'cancelled'};run.phase=Object.values(run.statuses).every(s=>s.state==='ready')&&(!out?.total||out.available===out.total)?'done':'error';write(target,{...previous,phase:run.phase,at:now(),error:run.phase==='error'?'Unele modele nu au finalizat calculul.':null});update(run);return {state:run.phase,report:out};
  }catch(error){if(!live(run))return {state:'cancelled'};if(live(run)){run.phase='error';run.error=error.message;update(run);try{write(target,{...(read(target)||{version:VERSION,enabled:true}),asOf:target.asOf,phase:'error',at:now(),error:error.message});}catch{}}return {state:'error',error:error.message};}
  finally{if(active===run)active=null;}
 }
 return {start,stop,busy:()=>!!active};
}
g.HoldingsAutoLearning={VERSION,key,create};
})(typeof window!=='undefined'?window:globalThis);
