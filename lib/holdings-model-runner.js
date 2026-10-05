(function(g){
'use strict';
function create({load,steps,current,reusable,update}){
 let active=null,serial=0;
 const live=run=>active===run&&!run.stopped&&current(run.target,run.source);
 const emit=run=>{if(live(run))update(run);};
 function stop(){const run=active;if(!run)return;run.stopped=true;run.step?.cancel();active=null;}
 async function start(target,{force=false}={}){
  if(active&&current(active.target,active.source)&&active.target.key===target.key)return active.done;
  stop();const run={id:++serial,target,source:null,phase:'loading',statuses:{},step:null,stopped:false};active=run;
  run.done=(async()=>{try{
   emit(run);run.source=await load(target,()=>live(run));if(!live(run))return {state:'cancelled'};
   run.phase='running';emit(run);
   for(const step of steps){
    if(!live(run))return {state:'cancelled'};
    if(!force&&reusable(step,run)){for(const id of step.models)run.statuses[id]={state:'cached'};emit(run);continue;}
    run.step=step;for(const id of step.models)run.statuses[id]={state:'running'};emit(run);
    let out;try{out=await step.run(run.target,run.source,p=>{if(live(run)){run.progress=p;emit(run);}});}catch(e){out={state:'error',error:e.message};}
    if(!live(run))return {state:'cancelled'};run.step=null;run.progress=null;
    for(const id of step.models)run.statuses[id]=out?.state==='ready'?{state:'ready'}:{state:'error',error:out?.error||'Modelul nu a putut finaliza analiza.'};emit(run);
   }
   run.phase='done';emit(run);return {state:'done',statuses:run.statuses};
  }catch(e){if(!live(run))return {state:'cancelled'};run.phase='error';run.error=e.message;emit(run);return {state:'error',error:e.message};}
  finally{if(active===run)active=null;}})();
  return run.done;
 }
 return {start,stop,busy:()=>!!active};
}
g.HoldingsModelRunner={create};
})(typeof window!=='undefined'?window:globalThis);
